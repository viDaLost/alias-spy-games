package com.vidalost.biblegames.data

import android.content.Context
import android.os.Handler
import android.os.Looper
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.security.SecureRandom

/** Keeps Android in the same live-presence channel as Telegram WebApp. */
class AppPresenceClient(
    context: Context,
    private val cloud: CloudRepository,
    private val userId: String,
) {
    companion object {
        private const val OBSERVABILITY = "https://alias-spy-games-observability.vitaledanilov.workers.dev"
        private const val TRUSTED_ORIGIN = "https://vidalost.github.io"
        private const val PREFS = "bible_games_native"
        private const val SESSION_KEY = "presence_session_id_v1"
        private const val HEARTBEAT_MS = 45_000L
    }

    private val main = Handler(Looper.getMainLooper())
    private val sessionId = loadOrCreateSessionId(context.applicationContext)
    private var socket: WebSocket? = null
    private var foreground = false
    private var connected = false
    private var reconnectAttempt = 0
    private var game = ""
    private var roomId = ""

    private val heartbeat = object : Runnable {
        override fun run() {
            if (!foreground) return
            if (connected) {
                socket?.send(JSONObject().put("type", "ping").toString())
                sendPresence()
            }
            main.postDelayed(this, HEARTBEAT_MS)
        }
    }
    private val reconnect = Runnable { if (foreground && !connected) connect() }

    fun start() {
        if (!userId.matches(Regex("^[0-9]{5,20}$"))) return
        foreground = true
        main.removeCallbacks(reconnect)
        if (!connected) connect() else sendPresence()
    }

    fun stop() {
        foreground = false
        connected = false
        main.removeCallbacks(reconnect)
        main.removeCallbacks(heartbeat)
        socket?.close(1000, "background")
        socket = null
    }

    fun update(gameRoute: String?, activeRoomId: String?) {
        game = sanitizeGame(gameRoute)
        roomId = if (game == "quartet") sanitizeRoom(activeRoomId) else ""
        if (foreground && connected) sendPresence()
    }

    private fun connect() {
        if (!foreground || connected || socket != null) return
        val wsBase = OBSERVABILITY.replaceFirst("https://", "wss://")
        val request = Request.Builder()
            .url("$wsBase/presence?sid=$sessionId")
            .header("Origin", TRUSTED_ORIGIN)
            .header("Authorization", "Bearer ${cloud.currentSessionToken()}")
            .header("User-Agent", "BibleGames-Android/2.7 Native")
            .build()
        socket = cloud.client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                main.post {
                    if (socket !== webSocket) {
                        webSocket.cancel()
                        return@post
                    }
                    if (!foreground) {
                        webSocket.close(1000, "background")
                        return@post
                    }
                    connected = true
                    reconnectAttempt = 0
                    sendPresence()
                    main.removeCallbacks(heartbeat)
                    main.postDelayed(heartbeat, HEARTBEAT_MS)
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                main.post {
                    if (socket === webSocket) socket = null
                    connected = false
                    scheduleReconnect()
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                main.post {
                    if (socket === webSocket) socket = null
                    connected = false
                    scheduleReconnect()
                }
            }
        })
    }

    private fun sendPresence() {
        val payload = JSONObject()
            .put("type", "presence")
            .put("platform", "android")
            .put("game", game)
            .put("roomId", roomId)
        if (socket?.send(payload.toString()) != true) {
            val failedSocket = socket
            connected = false
            socket = null
            failedSocket?.cancel()
            scheduleReconnect()
        }
    }

    private fun scheduleReconnect() {
        main.removeCallbacks(heartbeat)
        main.removeCallbacks(reconnect)
        if (!foreground) return
        reconnectAttempt += 1
        val delay = (1_000L shl reconnectAttempt.coerceAtMost(4)).coerceAtMost(15_000L)
        main.postDelayed(reconnect, delay)
    }

    private fun sanitizeGame(value: String?): String = value.orEmpty().lowercase()
        .replace(Regex("[^a-z0-9_-]"), "").take(40)

    private fun sanitizeRoom(value: String?): String = value.orEmpty().uppercase()
        .replace(Regex("[^A-Z0-9]"), "").take(10)

    private fun loadOrCreateSessionId(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val existing = prefs.getString(SESSION_KEY, "").orEmpty()
        if (existing.matches(Regex("^[a-zA-Z0-9_-]{16,64}$"))) return existing
        val bytes = ByteArray(16).also(SecureRandom()::nextBytes)
        val generated = bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }
        prefs.edit().putString(SESSION_KEY, generated).apply()
        return generated
    }
}
