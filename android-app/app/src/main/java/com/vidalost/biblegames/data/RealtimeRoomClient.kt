package com.vidalost.biblegames.data

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue
import javax.net.ssl.SSLException

private data class PendingRoomAction(
    val requestId: String,
    val action: String,
    val payload: JSONObject,
)

/**
 * Native equivalent of the room transport used by quartet.js and
 * bible-sketch.js.  A room is resumable: the installation id, player name and
 * room code survive process death, while a new signed session token is always
 * obtained before reconnecting the WebSocket.
 */
class RealtimeRoomClient(
    context: Context,
    private val cloud: CloudRepository,
    private val backend: String,
    storageKey: String,
    @Suppress("UNUSED_PARAMETER") userId: String,
) {
    private val main = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val preferences = context.applicationContext.getSharedPreferences(
        "realtime_room_$storageKey",
        Context.MODE_PRIVATE,
    )
    private val guestId = preferences.getString(KEY_GUEST_ID, null)
        ?.takeIf { it.matches(Regex("^[A-Za-z0-9_-]{16,64}$")) }
        ?: randomGuestId().also { preferences.edit().putString(KEY_GUEST_ID, it).apply() }

    private var socket: WebSocket? = null
    private var pollingJob: Job? = null
    private val pendingActions = ConcurrentLinkedQueue<PendingRoomAction>()
    private var sessionToken = ""
    private var pendingCreateKey = ""
    private var pendingCreateRequestId = ""
    @Volatile
    private var closed = false
    @Volatile
    private var leaving = false
    @Volatile
    private var reconnectGeneration = 0
    private var socketGeneration = 0
    private var pollingGeneration = 0
    private var currentName = preferences.getString(KEY_PLAYER_NAME, "Игрок").orEmpty().ifBlank { "Игрок" }

    init {
        // Warm DNS, TLS and the Worker before the user presses Create.  This is
        // intentionally best-effort: the form remains usable while it runs.
        scope.launch { cloud.warmRoom(backend) }
    }

    var roomId by mutableStateOf(preferences.getString(KEY_ROOM_ID, "").orEmpty())
        private set
    var state by mutableStateOf<JSONObject?>(null)
        private set
    var connected by mutableStateOf(false)
        private set
    var connecting by mutableStateOf(false)
        private set
    var usingHttpsFallback by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    val savedName: String get() = currentName
    val hasSavedRoom: Boolean get() = roomId.isNotBlank()

    fun rememberName(name: String) {
        currentName = normalizeName(name)
        preferences.edit().putString(KEY_PLAYER_NAME, currentName).apply()
    }

    suspend fun resumeSaved(fallbackName: String = currentName): Boolean {
        val savedRoom = roomId
        if (savedRoom.isBlank()) return false
        return runCatching {
            joinInternal(savedRoom, currentName.ifBlank { fallbackName }, isResume = true)
            true
        }.getOrElse { cause ->
            withContext(Dispatchers.Main.immediate) {
                val roomMissing = (cause as? RoomHttpException)?.let {
                    it.status == 404 || it.serverCode in setOf("ROOM_NOT_FOUND", "PLAYER_NOT_FOUND")
                } == true
                if (roomMissing) clearRoom(keepName = true) else connecting = false
                error = cause.readableMessage("Не удалось вернуться в комнату")
            }
            false
        }
    }

    suspend fun create(name: String, extra: JSONObject = JSONObject()) {
        closed = false
        leaving = false
        rememberName(name)
        reconnectGeneration++
        val generation = reconnectGeneration
        val createKey = "$backend\n$currentName\n$extra"
        val createRequestId = synchronized(this) {
            if (pendingCreateKey != createKey || pendingCreateRequestId.isBlank()) {
                pendingCreateKey = createKey
                pendingCreateRequestId = UUID.randomUUID().toString()
            }
            pendingCreateRequestId
        }
        onMain { connecting = true; error = null }
        val body = authBody().apply {
            put("requestId", createRequestId)
            extra.keys().forEach { key -> put(key, extra.get(key)) }
        }
        withContext(Dispatchers.IO) {
            runCatching { cloud.postRoom("$backend/rooms", body) }
                .onSuccess { response ->
                    onMain {
                        if (generation != reconnectGeneration || closed || leaving) return@onMain
                        runCatching {
                            installSession(
                                response.optString("roomId"),
                                response.optString("sessionToken"),
                                response.optJSONObject("state"),
                            )
                            synchronized(this@RealtimeRoomClient) {
                                if (pendingCreateRequestId == createRequestId) {
                                    pendingCreateKey = ""
                                    pendingCreateRequestId = ""
                                }
                            }
                            connectSocket()
                        }.onFailure { cause ->
                            error = cause.readableMessage("Сервер не выдал данные созданной комнаты")
                            connecting = false
                        }
                    }
                }
                .onFailure { cause ->
                    onMain {
                        if (generation == reconnectGeneration && !closed && !leaving) {
                            error = cause.readableMessage("Не удалось создать комнату")
                            connecting = false
                        }
                    }
                }
        }
    }

    suspend fun join(code: String, name: String) {
        joinInternal(code, name, isResume = false)
    }

    private suspend fun joinInternal(code: String, name: String, isResume: Boolean) {
        closed = false
        leaving = false
        rememberName(name)
        synchronized(this) {
            pendingCreateKey = ""
            pendingCreateRequestId = ""
        }
        reconnectGeneration++
        val generation = reconnectGeneration
        val normalized = normalizeRoomId(code)
        require(normalized.length >= 4) { "Введите корректный код комнаты" }
        onMain { connecting = true; if (!isResume) error = null }
        try {
            val response = withContext(Dispatchers.IO) {
                cloud.postRoom("$backend/rooms/$normalized/join", authBody())
            }
            onMain {
                if (generation != reconnectGeneration || closed || leaving) return@onMain
                runCatching {
                    installSession(normalized, response.optString("sessionToken"), response.optJSONObject("state"))
                    connectSocket()
                }.onFailure { cause ->
                    error = cause.readableMessage("Сервер не выдал данные комнаты")
                    connecting = false
                }
            }
        } catch (cause: Throwable) {
            onMain {
                if (generation == reconnectGeneration) {
                    connecting = false
                    if (!isResume) error = cause.readableMessage("Не удалось войти в комнату")
                }
            }
            throw cause
        }
    }

    fun action(action: String, payload: JSONObject = JSONObject()): Boolean {
        val message = JSONObject().put("type", "action").put("action", action).put("payload", payload)
        if (connected && !usingHttpsFallback && socket?.send(message.toString()) == true) return true
        if (roomId.isBlank() || sessionToken.isBlank() || closed || leaving) {
            error = "Нет активной комнаты. Вернитесь в лобби и подключитесь снова."
            return false
        }

        pendingActions.offer(
            PendingRoomAction(
                requestId = UUID.randomUUID().toString(),
                action = action,
                payload = JSONObject(payload.toString()),
            ),
        )
        startPollingFallback()
        return true
    }

    fun dismissError() { error = null }

    fun retry() {
        if (roomId.isBlank() || connecting) return
        closed = false
        leaving = false
        stopTransports(clearPending = false)
        reconnectGeneration++
        scope.launch { reconnectWithFreshSession(reconnectGeneration) }
    }

    /** Close this screen without removing the player from the server room. */
    fun close() {
        closed = true
        reconnectGeneration++
        stopTransports(clearPending = true, closeReason = "screen closed")
        scope.cancel()
    }

    /** Explicit leave mirrors the web app's leave-room action and clears resume data. */
    fun leave() {
        leaving = true
        reconnectGeneration++
        val leaveRoomId = roomId
        val leaveToken = sessionToken
        if (connected && !usingHttpsFallback) {
            socket?.send(
                JSONObject().put("type", "action").put("action", "leave").put("payload", JSONObject()).toString(),
            )
        }
        // Send the signed HTTPS leave as well. Closing a WebSocket immediately
        // after send is not a delivery guarantee on every Android network.
        if (leaveRoomId.isNotBlank() && leaveToken.isNotBlank()) {
            val request = JSONObject()
                .put("requestId", UUID.randomUUID().toString())
                .put("action", "leave")
                .put("payload", JSONObject())
            scope.launch {
                runCatching { cloud.postRoom(pollUrl(leaveRoomId, leaveToken), request) }
            }
        }
        clearRoom(keepName = true)
        leaving = false
        closed = false
    }

    private fun installSession(newRoomId: String, token: String, initialState: JSONObject? = null) {
        require(newRoomId.isNotBlank() && token.isNotBlank()) { "Сервер не выдал данные комнаты" }
        roomId = normalizeRoomId(newRoomId)
        sessionToken = token
        if (initialState != null) state = initialState
        preferences.edit().putString(KEY_ROOM_ID, roomId).putString(KEY_PLAYER_NAME, currentName).apply()
    }

    private fun connectSocket() {
        if (closed || leaving || roomId.isBlank() || sessionToken.isBlank()) return
        pollingGeneration++
        pollingJob?.cancel()
        pollingJob = null
        socketGeneration++
        val generation = socketGeneration
        socket?.cancel()
        socket = null
        connecting = true
        connected = false
        usingHttpsFallback = true

        // Bootstrap over ordinary HTTPS immediately. The WebSocket upgrade is
        // attempted in parallel on an isolated client and wins only after it
        // has delivered a real state snapshot.
        startPollingFallback(preserveSocket = true)

        val wsBase = backend.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://")
        val request = Request.Builder()
            .url("$wsBase/rooms/$roomId/ws?token=$sessionToken")
            .header("Origin", "https://vidalost.github.io")
            .header("User-Agent", "BibleGames-Android/2.6 Native")
            .build()
        val openedSocket = cloud.roomSocketClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                onMain {
                    if (generation != socketGeneration || closed || leaving) {
                        webSocket.cancel()
                        return@onMain
                    }
                    socket = webSocket
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (generation != socketGeneration) return
                runCatching { JSONObject(text) }.onSuccess { message ->
                    onMain {
                        if (generation != socketGeneration) return@onMain
                        when (message.optString("type")) {
                            "state" -> message.optJSONObject("state")?.let { nextState ->
                                state = nextState
                                connected = true
                                connecting = false
                                error = null
                                usingHttpsFallback = false
                                pollingGeneration++
                                pollingJob?.cancel()
                                pollingJob = null
                            }
                            "error" -> error = message.optString("error", "Ошибка комнаты")
                        }
                    }
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                if (generation == socketGeneration) onMain {
                    if (!usingHttpsFallback) connected = false
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                onMain {
                    if (generation != socketGeneration) return@onMain
                    socket = null
                    if (!usingHttpsFallback) connected = false
                    if (!closed && !leaving && roomId.isNotBlank() && pollingJob?.isActive != true) {
                        startPollingFallback()
                    }
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                onMain {
                    if (generation != socketGeneration) return@onMain
                    socket = null
                    if (!usingHttpsFallback) connected = false
                    if (!closed && !leaving && roomId.isNotBlank() && pollingJob?.isActive != true) {
                        startPollingFallback()
                    }
                }
            }
        })
        if (generation == socketGeneration) socket = openedSocket else openedSocket.cancel()
    }

    private fun startPollingFallback(preserveSocket: Boolean = false) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            main.post { startPollingFallback(preserveSocket) }
            return
        }
        if (closed || leaving || roomId.isBlank() || sessionToken.isBlank()) return
        if (usingHttpsFallback && pollingJob?.isActive == true) return

        if (!preserveSocket) {
            socketGeneration++
            socket?.cancel()
            socket = null
        }
        pollingGeneration++
        val generation = pollingGeneration
        pollingJob?.cancel()
        usingHttpsFallback = true
        connected = false
        connecting = true
        pollingJob = scope.launch { runPollingLoop(generation, roomId, sessionToken) }
    }

    private suspend fun runPollingLoop(generation: Int, code: String, token: String) {
        var consecutiveFailures = 0
        while (scope.isActive && generation == pollingGeneration && !closed && !leaving && code == roomId) {
            val pending = pendingActions.poll()
            val request = JSONObject()
            if (pending != null) {
                request.put("requestId", pending.requestId)
                    .put("action", pending.action)
                    .put("payload", pending.payload)
            }

            try {
                val response = cloud.postRoom(pollUrl(code, token), request)
                val nextState = response.optJSONObject("state")
                if (response.optBoolean("closed")) {
                    onMain {
                        if (generation == pollingGeneration) clearRoom(keepName = true)
                    }
                    return
                }
                if (nextState == null) throw IllegalStateException("Сервер комнаты не вернул состояние игры")
                consecutiveFailures = 0
                onMain {
                    if (generation == pollingGeneration && !closed && !leaving && code == roomId) {
                        state = nextState
                        connected = true
                        connecting = false
                        usingHttpsFallback = true
                        error = null
                    }
                }
                delay(if (pendingActions.isEmpty()) POLL_INTERVAL_MS else POLL_ACTION_GAP_MS)
            } catch (cause: Throwable) {
                val http = cause as? RoomHttpException
                if (http?.serverCode == "RATE_LIMIT") {
                    pending?.let(pendingActions::offer)
                    delay(
                        when (pending?.action) {
                            "chat" -> 720L
                            "drawStroke" -> 70L
                            else -> 270L
                        },
                    )
                    continue
                }
                val retryPending = pending != null && (
                    http == null || http.status >= 500
                )
                if (retryPending) pending?.let(pendingActions::offer)

                if (http?.status == 401 || http?.status == 403 && http.serverCode != "PLAYER_NOT_FOUND") {
                    onMain {
                        if (generation == pollingGeneration && !closed && !leaving) {
                            connected = false
                            connecting = true
                            reconnectGeneration++
                            scope.launch { reconnectWithFreshSession(reconnectGeneration) }
                        }
                    }
                    return
                }

                if (pending != null && http != null && http.status in 400..499 && http.serverCode != "RATE_LIMIT") {
                    onMain {
                        if (generation == pollingGeneration) error = http.message ?: "Действие не выполнено"
                    }
                    delay(POLL_ACTION_GAP_MS)
                    continue
                }

                consecutiveFailures++
                onMain {
                    if (generation == pollingGeneration && !closed && !leaving) {
                        connected = false
                        connecting = consecutiveFailures < 3
                        if (consecutiveFailures >= 3) {
                            error = if (http?.status == 404) {
                                "Сервер комнат требует обновления HTTPS‑синхронизации."
                            } else cause.readableMessage("Не удалось синхронизировать комнату")
                        }
                    }
                }
                delay((700L * consecutiveFailures).coerceAtMost(5_000L))
            }
        }
    }

    private suspend fun reconnectWithFreshSession(generation: Int) {
        val code = roomId
        if (code.isBlank() || closed || leaving || generation != reconnectGeneration) return
        onMain { connecting = true }
        runCatching { cloud.postRoom("$backend/rooms/$code/join", authBody()) }
            .onSuccess { response ->
                onMain {
                    if (!closed && !leaving && generation == reconnectGeneration) {
                        runCatching {
                            installSession(code, response.optString("sessionToken"), response.optJSONObject("state"))
                            connectSocket()
                        }.onFailure { cause ->
                            connecting = false
                            error = cause.readableMessage("Сервер не выдал данные комнаты")
                        }
                    }
                }
            }
            .onFailure { cause ->
                onMain {
                    if (!closed && !leaving && generation == reconnectGeneration) {
                        connecting = false
                        error = cause.readableMessage("Не удалось восстановить комнату")
                    }
                }
            }
    }

    private fun pollUrl(code: String, token: String): String =
        "$backend/rooms/$code/poll?token=$token"

    private fun stopTransports(clearPending: Boolean, closeReason: String = "transport reset") {
        socketGeneration++
        runCatching { socket?.close(1000, closeReason) }
        socket?.cancel()
        socket = null
        pollingGeneration++
        pollingJob?.cancel()
        pollingJob = null
        if (clearPending) pendingActions.clear()
        connected = false
        connecting = false
        usingHttpsFallback = false
    }

    private fun authBody() = JSONObject()
        .put("telegramInitData", "")
        .put("guestId", guestId)
        .put("name", currentName)

    private fun clearRoom(keepName: Boolean) {
        stopTransports(clearPending = true, closeReason = "room cleared")
        state = null
        roomId = ""
        sessionToken = ""
        val editor = preferences.edit().remove(KEY_ROOM_ID)
        if (!keepName) editor.remove(KEY_PLAYER_NAME)
        editor.apply()
    }

    private fun normalizeName(value: String) = value.trim().take(32).ifBlank { "Игрок" }
    private fun normalizeRoomId(value: String) = value.uppercase().replace(Regex("[^A-Z0-9]"), "").take(10)
    private fun Throwable.readableMessage(fallback: String): String {
        val chain = generateSequence(this) { it.cause }.toList()
        return when {
            chain.any { it is SocketTimeoutException } ->
                "Соединение с комнатой дважды превысило время ожидания. Проверьте сеть, VPN или Private DNS и попробуйте снова."
            chain.any { it is UnknownHostException } ->
                "Не удалось найти сервер комнат. Проверьте интернет, Private DNS или блокировку домена workers.dev."
            chain.any { it is SSLException } ->
                "Не удалось установить защищённое соединение. Проверьте дату устройства, VPN и фильтрацию HTTPS."
            chain.any { it is ConnectException } ->
                "Нет соединения с сервером комнат. Проверьте сеть или VPN и попробуйте снова."
            else -> message?.takeIf { it.isNotBlank() } ?: fallback
        }
    }

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
    }

    companion object {
        private const val KEY_GUEST_ID = "guest_id"
        private const val KEY_PLAYER_NAME = "player_name"
        private const val KEY_ROOM_ID = "room_id"
        private const val POLL_INTERVAL_MS = 850L
        private const val POLL_ACTION_GAP_MS = 90L

        private fun randomGuestId(): String {
            val bytes = ByteArray(12).also(SecureRandom()::nextBytes)
            return bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }
        }
    }
}
