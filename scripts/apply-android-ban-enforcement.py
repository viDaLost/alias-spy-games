from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"missing patch target: {label}")
    return text.replace(old, new, 1)

# Android UI/session enforcement
p = Path('android-app/app/src/main/java/com/vidalost/biblegames/App.kt')
s = p.read_text()
s = replace_once(
    s,
    'private const val ADMIN_ID = "1288379477"\nprivate fun profileKey(userId: String, field: String) = "profile_${userId}_$field"\n',
    'private const val ADMIN_ID = "1288379477"\nprivate const val ACCESS_POLL_MS = 4_000L\nprivate fun profileKey(userId: String, field: String) = "profile_${userId}_$field"\nprivate fun banKey(userId: String) = "profile_${userId}_banned"\n',
    'access constants',
)
s = replace_once(
    s,
    '    var profile by remember(userId) { mutableStateOf(loadLocalProfile(context, userId, history)) }\n    var syncing by remember(userId) { mutableStateOf(false) }\n',
    '    var profile by remember(userId) { mutableStateOf(loadLocalProfile(context, userId, history)) }\n    var isBanned by remember(userId) { mutableStateOf(prefs.getBoolean(banKey(userId), false)) }\n    var accessChecked by remember(userId) { mutableStateOf(false) }\n    var accessError by remember(userId) { mutableStateOf<String?>(null) }\n    var accessRetry by remember(userId) { mutableStateOf(0) }\n    var syncing by remember(userId) { mutableStateOf(false) }\n',
    'access state',
)
old_sync = '''    LaunchedEffect(userId) {
        if (userId.matches(Regex("^[0-9]{5,20}$")) && userId != ADMIN_ID) {
            syncing = true
            cloud.syncProfile(userId, profile).onSuccess {
                profile = it
                saveLocalProfile(context, it)
                if (it.lastGames.isNotEmpty()) {
                    history = normalizeHistory(history + it.lastGames)
                    prefs.edit().putString(HISTORY_KEY, history.joinToString(",")).apply()
                }
            }
            syncing = false
        }
    }
'''
new_sync = '''    fun applyAccessState(banned: Boolean) {
        isBanned = banned
        accessChecked = true
        accessError = null
        prefs.edit().putBoolean(banKey(userId), banned).apply()
        if (banned) {
            currentGame = null
            activeRoomId = ""
        }
    }

    LaunchedEffect(userId, accessRetry) {
        if (userId.matches(Regex("^[0-9]{5,20}$")) && userId != ADMIN_ID) {
            syncing = true
            accessChecked = false
            accessError = null
            cloud.syncProfile(userId, profile)
                .onSuccess {
                    profile = it
                    applyAccessState(it.isBanned)
                    saveLocalProfile(context, it)
                    if (it.lastGames.isNotEmpty()) {
                        history = normalizeHistory(history + it.lastGames)
                        prefs.edit().putString(HISTORY_KEY, history.joinToString(",")).apply()
                    }
                }
                .onFailure { error ->
                    accessChecked = false
                    accessError = error.message ?: "Не удалось проверить доступ"
                }
            syncing = false
        } else {
            accessChecked = false
            accessError = null
        }
    }

    LaunchedEffect(userId, accessChecked) {
        if (!userId.matches(Regex("^[0-9]{5,20}$")) || userId == ADMIN_ID || !accessChecked) return@LaunchedEffect
        while (true) {
            delay(ACCESS_POLL_MS)
            cloud.checkAccess(userId).onSuccess(::applyAccessState)
        }
    }
'''
s = replace_once(s, old_sync, new_sync, 'initial access sync')
s = replace_once(
    s,
    '    LaunchedEffect(userId, profile.wowStars, profile.wordSearchStars, profile.sacredLevel, history) {\n        if (!userId.matches(Regex("^[0-9]{5,20}$")) || userId == ADMIN_ID) return@LaunchedEffect\n',
    '    LaunchedEffect(userId, profile.wowStars, profile.wordSearchStars, profile.sacredLevel, history, accessChecked, isBanned) {\n        if (!userId.matches(Regex("^[0-9]{5,20}$")) || userId == ADMIN_ID || !accessChecked || isBanned) return@LaunchedEffect\n',
    'progress sync ban guard',
)
s = replace_once(
    s,
    '    fun openGame(game: GameKey) {\n        activeRoomId = ""\n',
    '    fun openGame(game: GameKey) {\n        if (!accessChecked || isBanned) return\n        activeRoomId = ""\n',
    'game open ban guard',
)
s = replace_once(
    s,
    '    fun closeGame() {\n        activeRoomId = ""\n        currentGame = null\n',
    '    fun closeGame() {\n        activeRoomId = ""\n        currentGame = null\n        if (isBanned) return\n',
    'game close ban guard',
)
s = replace_once(
    s,
    '''    if (supportOpen) {
        BackHandler { supportOpen = false }
        SupportScreen(cloud = cloud, initialUserId = userId, onBack = { supportOpen = false })
        return
    }

    BackHandler(enabled = currentGame != null) { closeGame() }
''',
    '''    if (supportOpen) {
        BackHandler { supportOpen = false }
        SupportScreen(cloud = cloud, initialUserId = userId, onBack = { supportOpen = false })
        return
    }

    if (userId.isNotBlank() && !accessChecked && !isBanned) {
        AccessVerificationScreen(
            error = accessError,
            onRetry = { accessRetry += 1 },
            onLogout = {
                prefs.edit().remove(ID_KEY).apply()
                userId = ""
            },
            onSupport = { supportOpen = true },
        )
        return
    }

    BackHandler(enabled = currentGame != null) { closeGame() }
''',
    'verification screen routing',
)
s = replace_once(s, 'targetState = Triple(userId.isNotBlank(), currentGame, profile.isBanned),', 'targetState = Triple(userId.isNotBlank(), currentGame, isBanned),', 'root ban state')
access_screen = '''@Composable
private fun AccessVerificationScreen(
    error: String?,
    onRetry: () -> Unit,
    onLogout: () -> Unit,
    onSupport: () -> Unit,
) {
    AppBackground {
        Box(Modifier.fillMaxSize().padding(22.dp), contentAlignment = Alignment.Center) {
            GlassCard(Modifier.fillMaxWidth()) {
                Text("Проверка доступа", color = Color(0xFF25236E), fontSize = 25.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(8.dp))
                Text(
                    if (error.isNullOrBlank())
                        "Проверяем статус аккаунта. Игры откроются сразу после подтверждения доступа."
                    else
                        "Не удалось проверить статус аккаунта. До успешной проверки запуск игр временно недоступен.",
                    color = InkSoft,
                    lineHeight = 21.sp,
                )
                if (!error.isNullOrBlank()) {
                    Spacer(Modifier.height(10.dp))
                    Text(error, color = Color(0xFF991B1B), fontSize = 13.sp)
                }
                Spacer(Modifier.height(18.dp))
                PrimaryButton("Повторить проверку", onRetry, Modifier.fillMaxWidth(), icon = "↻")
                Spacer(Modifier.height(10.dp))
                com.vidalost.biblegames.ui.SecondaryButton(
                    "Техподдержка",
                    onSupport,
                    Modifier.fillMaxWidth(),
                    icon = "🎧",
                )
                Spacer(Modifier.height(10.dp))
                com.vidalost.biblegames.ui.SecondaryButton(
                    "Сменить Telegram ID",
                    onLogout,
                    Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

'''
marker = '@Composable\nprivate fun AccessRestrictedScreen('
if marker not in s:
    raise RuntimeError('missing AccessRestrictedScreen marker')
s = s.replace(marker, access_screen + marker, 1)
p.write_text(s)

# Android API status check
p = Path('android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt')
s = p.read_text()
needle = '''    suspend fun updateHistory(id: String, routes: List<String>) = withContext(Dispatchers.IO) {
'''
addition = '''    suspend fun checkAccess(id: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            val payload = JSONObject().put("action", "accessStatus")
            val json = post("$CORE/android/compat", JSONObject().put("payload", payload).put("androidUserId", id))
            json.optBoolean("isBanned", false)
        }
    }

'''
if addition.strip() not in s:
    s = replace_once(s, needle, addition + needle, 'checkAccess API')
p.write_text(s)

# Backend: status action + server-side write blocking for banned Android users.
p = Path('cloudflare/app-core-worker/src/index-v4.js')
s = p.read_text()
s = replace_once(
    s,
    "const ANDROID_USER_ACTIONS = new Set(['syncUser', 'updateHistory', 'supportCreate', 'supportList']);",
    "const ANDROID_USER_ACTIONS = new Set(['syncUser', 'updateHistory', 'supportCreate', 'supportList', 'accessStatus']);",
    'android access action',
)
old = '''      if (action === 'syncUser') {
        const clientUser = payload.user && typeof payload.user === 'object' ? payload.user : {};
        if (String(clientUser.id || '') !== androidUserId) throw httpError(403, 'User mismatch');
        const result = await callStore(store, '/sync', { verifiedUser: syntheticUser, clientUser });
        return json(syncResponse(result.user), 200, cors);
      }

      if (String(payload.id || '') !== androidUserId) throw httpError(403, 'User mismatch');
      await callStore(store, '/history', { id: androidUserId, history: payload.history });
      return json({ success: true, source: 'cloudflare-sql-android' }, 200, cors);
'''
new = '''      const access = await callStore(store, '/sync', {
        verifiedUser: syntheticUser,
        clientUser: { id: androidUserId },
      });
      const isBanned = Boolean(access.user?.isBanned);

      if (action === 'accessStatus') {
        return json({ success: true, isBanned, source: 'cloudflare-sql-android-access' }, 200, cors);
      }

      if (action === 'syncUser') {
        const clientUser = payload.user && typeof payload.user === 'object' ? payload.user : {};
        if (String(clientUser.id || '') !== androidUserId) throw httpError(403, 'User mismatch');
        if (isBanned) return json(syncResponse(access.user), 200, cors);
        const result = await callStore(store, '/sync', { verifiedUser: syntheticUser, clientUser });
        return json(syncResponse(result.user), 200, cors);
      }

      if (isBanned) throw httpError(403, 'Доступ ограничен');
      if (String(payload.id || '') !== androidUserId) throw httpError(403, 'User mismatch');
      await callStore(store, '/history', { id: androidUserId, history: payload.history });
      return json({ success: true, source: 'cloudflare-sql-android' }, 200, cors);
'''
s = replace_once(s, old, new, 'backend banned user enforcement')
p.write_text(s)

# Version bump.
p = Path('android-app/app/build.gradle')
s = p.read_text()
s = replace_once(s, 'versionCode 16', 'versionCode 17', 'version code')
s = replace_once(s, "versionName '2.6.4-native'", "versionName '2.6.5-native'", 'version name')
p.write_text(s)

# Regression check.
p = Path('scripts/check-android-ban-enforcement.mjs')
p.write_text('''import fs from 'node:fs';\n\nconst read = (path) => fs.readFileSync(path, 'utf8');\nconst need = (text, needle, label) => { if (!text.includes(needle)) throw new Error(`Ban enforcement check failed: ${label}`); };\n\nconst app = read('android-app/app/src/main/java/com/vidalost/biblegames/App.kt');\nconst cloud = read('android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt');\nconst core = read('cloudflare/app-core-worker/src/index-v4.js');\nconst gradle = read('android-app/app/build.gradle');\n\nneed(app, 'ACCESS_POLL_MS = 4_000L', 'Android does not poll account status');\nneed(app, 'if (!accessChecked || isBanned) return', 'game launch is not gated by verified access');\nneed(app, 'AccessVerificationScreen(', 'initial access verification screen missing');\nneed(app, 'targetState = Triple(userId.isNotBlank(), currentGame, isBanned)', 'root navigation does not use live ban state');\nneed(cloud, 'put("action", "accessStatus")', 'Android accessStatus API missing');\nneed(core, "'accessStatus'", 'backend accessStatus action missing');\nneed(core, "if (isBanned) throw httpError(403, 'Доступ ограничен');", 'backend does not reject banned writes');\nneed(core, 'if (isBanned) return json(syncResponse(access.user)', 'banned sync can still merge client progress');\nneed(gradle, "versionName '2.6.5-native'", 'Android version was not bumped');\n\nconsole.log('Android ban enforcement checks passed.');\n''')
