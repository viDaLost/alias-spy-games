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

data class AndroidAuthChallenge(
    val telegramId: String,
    val challengeId: String,
    val expiresInSeconds: Int,
)

data class AndroidAuthSession(
    val userId: String,
    val token: String,
    val expiresAt: Long,
)

class AuthBotStartRequired(
    val botUsername: String,
    message: String,
) : IOException(message)

class CloudRepository(initialSessionToken: String = "") {
    companion object {
        const val CORE = "https://alias-spy-games-core.vitaledanilov.workers.dev"
        const val QUARTET = "https://alias-spy-games-quartet.vitaledanilov.workers.dev"
        const val SKETCH = "https://alias-spy-games-bible-sketch.vitaledanilov.workers.dev"
    }

    @Volatile
    private var sessionToken: String = initialSessionToken

    fun setSessionToken(token: String) { sessionToken = token.trim() }
    fun currentSessionToken(): String = sessionToken
    fun hasSession(): Boolean = sessionToken.startsWith("bgs_")

    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(16, TimeUnit.SECONDS)
        .writeTimeout(16, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /** Access status is a tiny read-only request. HTTP/1.1 is deliberately
     * used here because some mobile VPN/carrier paths repeatedly stall HTTP/2
     * setup. The whole call is still bounded so a bad network cannot freeze UI. */
    private val accessClient: OkHttpClient = OkHttpClient.Builder()
        .protocols(listOf(Protocol.HTTP_1_1))
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .writeTimeout(6, TimeUnit.SECONDS)
        .callTimeout(7, TimeUnit.SECONDS)
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

    suspend fun requestLoginCode(id: String): Result<AndroidAuthChallenge> = withContext(Dispatchers.IO) {
        runCatching {
            val body = JSONObject().put("telegramId", id)
            val request = Request.Builder()
                .url("$CORE/android/auth/request")
                .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .header("Accept", "application/json")
                .header("Origin", "https://vidalost.github.io")
                .header("Cache-Control", "no-store")
                .header("User-Agent", "BibleGames-Android/2.7 Native")
                .build()
            accessClient.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val json = runCatching { JSONObject(text) }.getOrNull()
                if (!response.isSuccessful || json == null || !json.optBoolean("success", false)) {
                    val message = json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Не удалось отправить код"
                    if (json?.optBoolean("requiresBotStart", false) == true) {
                        throw AuthBotStartRequired(json.optString("botUsername", ""), message)
                    }
                    throw IOException(message)
                }
                AndroidAuthChallenge(
                    telegramId = id,
                    challengeId = json.getString("challengeId"),
                    expiresInSeconds = json.optInt("expiresInSeconds", 600),
                )
            }
        }
    }

    suspend fun verifyLoginCode(challenge: AndroidAuthChallenge, code: String): Result<AndroidAuthSession> = withContext(Dispatchers.IO) {
        runCatching {
            val body = JSONObject()
                .put("telegramId", challenge.telegramId)
                .put("challengeId", challenge.challengeId)
                .put("code", code)
            val request = Request.Builder()
                .url("$CORE/android/auth/verify")
                .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .header("Accept", "application/json")
                .header("Origin", "https://vidalost.github.io")
                .header("Cache-Control", "no-store")
                .header("User-Agent", "BibleGames-Android/2.7 Native")
                .build()
            accessClient.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val json = runCatching { JSONObject(text) }.getOrNull()
                if (!response.isSuccessful || json == null || !json.optBoolean("success", false)) {
                    throw IOException(json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Код не подтверждён")
                }
                AndroidAuthSession(
                    userId = json.getString("userId"),
                    token = json.getString("token"),
                    expiresAt = json.optLong("expiresAt", 0L),
                )
            }
        }
    }

    suspend fun logoutSession() = withContext(Dispatchers.IO) {
        runCatching {
            val token = sessionToken
            if (token.isBlank()) return@runCatching
            val request = Request.Builder()
                .url("$CORE/android/auth/logout")
                .post("{}".toRequestBody("application/json; charset=utf-8".toMediaType()))
                .header("Origin", "https://vidalost.github.io")
                .header("Authorization", "Bearer $token")
                .header("User-Agent", "BibleGames-Android/2.7 Native")
                .build()
            accessClient.newCall(request).execute().close()
        }
    }

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

    suspend fun checkAccess(id: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            val token = sessionToken.takeIf { it.isNotBlank() } ?: throw IOException("Требуется подтверждённый вход")
            val request = Request.Builder()
                .url("$CORE/android/access")
                .get()
                .header("Accept", "application/json")
                .header("Origin", "https://vidalost.github.io")
                .header("Authorization", "Bearer $token")
                .header("Cache-Control", "no-store")
                .header("User-Agent", "BibleGames-Android/2.7 Native")
                .build()
            accessClient.newCall(request).execute().use { response ->
                val payload = response.body?.string().orEmpty()
                val json = runCatching { JSONObject(payload) }.getOrNull()
                if (!response.isSuccessful || json == null) {
                    throw IOException(json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Не удалось проверить доступ")
                }
                json.optBoolean("isBanned", false)
            }
        }
    }

    suspend fun updateHistory(id: String, routes: List<String>) = withContext(Dispatchers.IO) {
        runCatching {
            val payload = JSONObject().put("action", "updateHistory").put("id", id).put("history", JSONArray(routes))
            post("$CORE/android/compat", JSONObject().put("payload", payload).put("androidUserId", id))
        }
    }

    suspend fun createSupportTicket(id: String, subject: String, message: String): Result<SupportTicket> = withContext(Dispatchers.IO) {
        runCatching {
            val payload = JSONObject()
                .put("action", "supportCreate")
                .put("subject", subject)
                .put("message", message)
                .put("source", "android")
            val json = post("$CORE/android/compat", JSONObject().put("payload", payload).put("androidUserId", id))
            parseSupportTicket(json.getJSONObject("ticket"))
        }
    }

    suspend fun listSupportTickets(id: String): Result<List<SupportTicket>> = withContext(Dispatchers.IO) {
        runCatching {
            val payload = JSONObject().put("action", "supportList")
            val json = post("$CORE/android/compat", JSONObject().put("payload", payload).put("androidUserId", id))
            val array = json.optJSONArray("tickets") ?: JSONArray()
            List(array.length()) { index -> parseSupportTicket(array.getJSONObject(index)) }
        }
    }

    private fun parseSupportTicket(json: JSONObject): SupportTicket {
        val messagesJson = json.optJSONArray("messages") ?: JSONArray()
        val messages = List(messagesJson.length()) { index ->
            val item = messagesJson.getJSONObject(index)
            SupportMessage(
                sender = item.optString("sender", "user"),
                body = item.optString("body", ""),
                createdAt = item.optLong("createdAt", 0L),
            )
        }
        return SupportTicket(
            id = json.optString("id", ""),
            userId = json.optString("userId", ""),
            source = json.optString("source", "android"),
            subject = json.optString("subject", ""),
            status = json.optString("status", "new"),
            createdAt = json.optLong("createdAt", 0L),
            updatedAt = json.optLong("updatedAt", 0L),
            messages = messages,
        )
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
        val builder = Request.Builder().url(url)
            .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .header("Accept", "application/json")
            // The shared Cloudflare endpoint intentionally accepts the production
            // web origin only. Native requests declare that same trusted app origin
            // so Android and Telegram WebApp use one profile store.
            .header("Origin", "https://vidalost.github.io")
            .header("Cache-Control", "no-store")
            .header("User-Agent", "BibleGames-Android/2.7 Native")
        if (url.startsWith(CORE) && sessionToken.isNotBlank()) builder.header("Authorization", "Bearer $sessionToken")
        val request = builder.build()
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
