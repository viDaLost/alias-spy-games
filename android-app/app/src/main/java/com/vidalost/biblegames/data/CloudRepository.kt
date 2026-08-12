package com.vidalost.biblegames.data

import com.vidalost.biblegames.model.PlayerProfile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class RoomHttpException(
    val status: Int,
    val serverCode: String,
    message: String,
) : IOException(message)

class CloudRepository {
    companion object {
        const val CORE = "https://alias-spy-games-core.vitaledanilov.workers.dev"
        const val QUARTET = "https://alias-spy-games-quartet.vitaledanilov.workers.dev"
        const val SKETCH = "https://alias-spy-games-bible-sketch.vitaledanilov.workers.dev"
    }

    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(16, TimeUnit.SECONDS)
        .writeTimeout(16, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /** Fast primary pool for room REST traffic. HTTP/2 keeps frequent lobby and
     * canvas polls on one connection and normally produces the first state much
     * faster than a fresh HTTP/1.1 connection on mobile networks. */
    val roomClient: OkHttpClient = OkHttpClient.Builder()
        .protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1))
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .writeTimeout(12, TimeUnit.SECONDS)
        .callTimeout(15, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /** A separate HTTP/1.1 route is used for one transparent retry. It covers
     * VPNs and carrier proxies with broken HTTP/2 without allowing a stalled
     * WebSocket upgrade to block ordinary HTTPS room requests. */
    private val roomFallbackClient: OkHttpClient = OkHttpClient.Builder()
        .protocols(listOf(Protocol.HTTP_1_1))
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(14, TimeUnit.SECONDS)
        .writeTimeout(14, TimeUnit.SECONDS)
        .callTimeout(18, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /** WebSockets have their own pool. A filtered or stalled upgrade therefore
     * cannot poison the HTTPS connection used to display the lobby. */
    val roomSocketClient: OkHttpClient = OkHttpClient.Builder()
        .protocols(listOf(Protocol.HTTP_1_1))
        .connectTimeout(9, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .writeTimeout(12, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    suspend fun syncProfile(id: String, local: PlayerProfile): Result<PlayerProfile> = withContext(Dispatchers.IO) {
        runCatching {
            val payload = JSONObject().apply {
                put("action", "syncUser")
                put("user", JSONObject().apply {
                    put("id", id)
                    put("username", "")
                    put("wowStars", local.wowStars)
                    put("wsStars", local.wordSearchStars)
                    put("swLevel", local.sacredLevel)
                    put("lastGames", JSONArray(local.lastGames))
                })
            }
            val body = JSONObject().put("payload", payload).put("androidUserId", id)
            val json = post("$CORE/android/compat", body)
            PlayerProfile(
                id = id,
                isBanned = json.optBoolean("isBanned"),
                wowStars = json.optInt("wowStars", local.wowStars),
                wordSearchStars = json.optInt("wsStars", local.wordSearchStars),
                sacredLevel = json.optInt("swLevel", local.sacredLevel),
                lastGames = json.optJSONArray("lastGames")?.let { arr -> List(arr.length()) { arr.optString(it) } }.orEmpty(),
            )
        }
    }

    suspend fun updateHistory(id: String, routes: List<String>) = withContext(Dispatchers.IO) {
        runCatching {
            val payload = JSONObject().put("action", "updateHistory").put("id", id).put("history", JSONArray(routes))
            post("$CORE/android/compat", JSONObject().put("payload", payload).put("androidUserId", id))
        }
    }

    suspend fun post(url: String, body: JSONObject): JSONObject = postWith(client, url, body)

    /**
     * Room requests are safe to replay: joins use a stable installation id,
     * polling actions carry a request id, and room creation carries a stable
     * request id understood by both Workers. Retry once through the alternate
     * protocol before showing an error to the player.
     */
    suspend fun postRoom(url: String, body: JSONObject): JSONObject {
        var lastFailure: IOException? = null
        listOf(roomClient, roomFallbackClient).forEachIndexed { attempt, http ->
            try {
                return postWith(http, url, body)
            } catch (cause: IOException) {
                val retryable = cause !is RoomHttpException || cause.status >= 500
                if (!retryable || attempt == 1) throw cause
                lastFailure = cause
                delay(240)
            }
        }
        throw lastFailure ?: IOException("Room request failed")
    }

    suspend fun warmRoom(backend: String): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val request = Request.Builder()
                .url("${backend.trimEnd('/')}/health")
                .get()
                .header("Accept", "application/json")
                .header("Origin", "https://vidalost.github.io")
                .header("User-Agent", "BibleGames-Android/2.6 Native")
                .build()
            roomClient.newCall(request).execute().use { it.isSuccessful }
        }.getOrDefault(false)
    }

    private suspend fun postWith(http: OkHttpClient, url: String, body: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url)
            .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .header("Accept", "application/json")
            // The shared Cloudflare endpoint intentionally accepts the production
            // web origin only. Native requests declare that same trusted app origin
            // so Android and Telegram WebApp use one profile store.
            .header("Origin", "https://vidalost.github.io")
            .header("Cache-Control", "no-store")
            .header("User-Agent", "BibleGames-Android/2.6 Native")
            .build()
        http.newCall(request).execute().use { response ->
            val payload = response.body?.string().orEmpty()
            val json = runCatching { JSONObject(payload) }.getOrNull()
            if (!response.isSuccessful) {
                throw RoomHttpException(
                    status = response.code,
                    serverCode = json?.optString("code", "HTTP_ERROR") ?: "HTTP_ERROR",
                    message = json?.optString("error", "Сервер ответил ${response.code}")
                        ?: "Сервер ответил ${response.code}",
                )
            }
            if (json == null) throw IOException("Сервер комнат вернул некорректный ответ")
            if (json.optBoolean("ok", true).not() || json.optBoolean("success", true).not()) {
                throw RoomHttpException(
                    status = response.code,
                    serverCode = json.optString("code", "HTTP_ERROR"),
                    message = json.optString("error", "Сервер отклонил запрос"),
                )
            }
            json
        }
    }
}
