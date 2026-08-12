from pathlib import Path

# CloudRepository: distinguish a dead/mismatched bearer from a transient network failure,
# and make server-side logout revoke the exact token captured by the UI.
p = Path('android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt')
s = p.read_text()
old = '''class AuthBotStartRequired(\n    val botUsername: String,\n    message: String,\n) : IOException(message)\n\nclass CloudRepository(initialSessionToken: String = "") {'''
new = '''class AuthBotStartRequired(\n    val botUsername: String,\n    message: String,\n) : IOException(message)\n\nclass AuthSessionInvalid(message: String) : IOException(message)\n\nclass CloudRepository(initialSessionToken: String = "") {'''
if old not in s:
    raise SystemExit('Auth exception insertion point not found')
s = s.replace(old, new, 1)

old = '''    suspend fun logoutSession() = withContext(Dispatchers.IO) {\n        runCatching {\n            val token = sessionToken\n            if (token.isBlank()) return@runCatching\n'''
new = '''    suspend fun logoutSession(token: String = sessionToken) = withContext(Dispatchers.IO) {\n        runCatching {\n            if (token.isBlank()) return@runCatching\n'''
if old not in s:
    raise SystemExit('logoutSession block not found')
s = s.replace(old, new, 1)

old = '''            accessClient.newCall(request).execute().use { response ->\n                val payload = response.body?.string().orEmpty()\n                val json = runCatching { JSONObject(payload) }.getOrNull()\n                if (!response.isSuccessful || json == null) {\n                    throw IOException(json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Не удалось проверить доступ")\n                }\n                json.optBoolean("isBanned", false)\n            }\n'''
new = '''            accessClient.newCall(request).execute().use { response ->\n                val payload = response.body?.string().orEmpty()\n                val json = runCatching { JSONObject(payload) }.getOrNull()\n                val message = json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Не удалось проверить доступ"\n                if (response.code == 401) throw AuthSessionInvalid(message)\n                if (!response.isSuccessful || json == null) throw IOException(message)\n                if (json.optString("userId") != id) throw AuthSessionInvalid("Сессия принадлежит другому аккаунту")\n                json.optBoolean("isBanned", false)\n            }\n'''
if old not in s:
    raise SystemExit('checkAccess response block not found')
s = s.replace(old, new, 1)
p.write_text(s)

# App: a revoked/expired bearer must immediately return to verified login instead of
# leaving accessChecked=true and allowing offline games to keep opening.
p = Path('android-app/app/src/main/java/com/vidalost/biblegames/App.kt')
s = p.read_text()
s = s.replace(
    'import com.vidalost.biblegames.data.AuthBotStartRequired',
    'import com.vidalost.biblegames.data.AuthBotStartRequired\nimport com.vidalost.biblegames.data.AuthSessionInvalid',
    1,
)
anchor = '''    fun applyAccessState(banned: Boolean) {\n        isBanned = banned\n        accessChecked = true\n        prefs.edit().putBoolean(banKey(userId), banned).apply()\n        if (banned) {\n            currentGame = null\n            activeRoomId = ""\n        }\n    }\n\n'''
helper = anchor + '''    fun clearVerifiedSession() {\n        cloud.setSessionToken("")\n        sessionStore.clear()\n        prefs.edit().remove(ID_KEY).apply()\n        supportOpen = false\n        currentGame = null\n        activeRoomId = ""\n        accessChecked = false\n        isBanned = false\n        syncing = false\n        userId = ""\n    }\n\n'''
if anchor not in s:
    raise SystemExit('applyAccessState anchor not found')
s = s.replace(anchor, helper, 1)

old = '''            result.onSuccess { banned ->\n                applyAccessState(banned)\n                if (!banned && (firstVerification || wasBanned)) {\n                    syncing = true\n                    launch {\n                        cloud.syncProfile(userId, profile).onSuccess {\n                            profile = it\n                            saveLocalProfile(context, it)\n                            if (it.lastGames.isNotEmpty()) {\n                                history = normalizeHistory(history + it.lastGames)\n                                prefs.edit().putString(HISTORY_KEY, history.joinToString(",")).apply()\n                            }\n                        }\n                        syncing = false\n                    }\n                }\n            }\n            delay(if (result.isSuccess) ACCESS_POLL_MS else ACCESS_RETRY_MS)\n'''
new = '''            result.onSuccess { banned ->\n                applyAccessState(banned)\n                if (!banned && (firstVerification || wasBanned)) {\n                    syncing = true\n                    launch {\n                        cloud.syncProfile(userId, profile).onSuccess {\n                            profile = it\n                            saveLocalProfile(context, it)\n                            if (it.lastGames.isNotEmpty()) {\n                                history = normalizeHistory(history + it.lastGames)\n                                prefs.edit().putString(HISTORY_KEY, history.joinToString(",")).apply()\n                            }\n                        }\n                        syncing = false\n                    }\n                }\n            }.onFailure { cause ->\n                if (cause is AuthSessionInvalid) clearVerifiedSession()\n            }\n            if (userId.isBlank()) return@LaunchedEffect\n            delay(if (result.isSuccess) ACCESS_POLL_MS else ACCESS_RETRY_MS)\n'''
if old not in s:
    raise SystemExit('access monitor result block not found')
s = s.replace(old, new, 1)

old = '''    fun logout() {\n        val oldToken = cloud.currentSessionToken()\n        appScope.launch {\n            if (oldToken.isNotBlank()) cloud.logoutSession()\n        }\n        cloud.setSessionToken("")\n        sessionStore.clear()\n        prefs.edit().remove(ID_KEY).apply()\n        userId = ""\n        currentGame = null\n        activeRoomId = ""\n        accessChecked = false\n        isBanned = false\n    }\n'''
new = '''    fun logout() {\n        val oldToken = cloud.currentSessionToken()\n        clearVerifiedSession()\n        appScope.launch {\n            if (oldToken.isNotBlank()) cloud.logoutSession(oldToken)\n        }\n    }\n'''
if old not in s:
    raise SystemExit('logout UI block not found')
s = s.replace(old, new, 1)
p.write_text(s)

# Core auth: remove a redundant HMAC computation and make the network rate-limit key
# IP-based so changing User-Agent cannot bypass the requester limit.
p = Path('cloudflare/app-core-worker/src/index-v4.js')
s = p.read_text()
s = s.replace(
    """    const requestKey = await authSha256Hex([\n      request.headers.get('CF-Connecting-IP') || 'unknown',\n      request.headers.get('User-Agent') || '',\n    ].join('|'));\n""",
    """    const requestKey = await authSha256Hex(request.headers.get('CF-Connecting-IP') || 'unknown');\n""",
    1,
)
old = """    const codeHash = await authHmacHex(env.TELEGRAM_BOT_TOKEN, `${challengeId}:${String(body?.telegramId || '').trim()}:${code}`);\n    // The challenge owns the Telegram ID. For privacy, the client repeats the ID\n    // only as part of the HMAC input; the store never trusts it for the session.\n    const telegramId = String(body?.telegramId || '').trim();\n    if (!/^\\d{5,20}$/.test(telegramId)) throw httpError(400, 'Telegram ID отсутствует');\n    const correctedCodeHash = await authHmacHex(env.TELEGRAM_BOT_TOKEN, `${challengeId}:${telegramId}:${code}`);\n"""
new = """    // The challenge owns the Telegram ID. The repeated ID is only part of the\n    // HMAC input; the durable store remains the authority for session identity.\n    const telegramId = String(body?.telegramId || '').trim();\n    if (!/^\\d{5,20}$/.test(telegramId)) throw httpError(400, 'Telegram ID отсутствует');\n    const codeHash = await authHmacHex(env.TELEGRAM_BOT_TOKEN, `${challengeId}:${telegramId}:${code}`);\n"""
if old not in s:
    raise SystemExit('redundant code hash block not found')
s = s.replace(old, new, 1)
s = s.replace('codeHash: correctedCodeHash || codeHash,', 'codeHash,', 1)
p.write_text(s)

print('Hardened secure Android auth session lifecycle and rate limiting')
