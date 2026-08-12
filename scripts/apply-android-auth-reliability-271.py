from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, repl, label, flags=0):
    updated, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one regex match, found {count}')
    return updated


# Android UI and access lifecycle.
app_path = 'android-app/app/src/main/java/com/vidalost/biblegames/App.kt'
app = read(app_path)
app = replace_once(app, 'private const val ADMIN_ID = "1288379477"\n', '', 'remove Android admin special-case constant')
app = replace_once(
    app,
    'private const val ACCESS_RETRY_MS = 900L\n',
    'private const val ACCESS_RETRY_MS = 900L\nprivate const val TELEGRAM_BOT_USERNAME = "bibleiskie_bot"\nprivate const val TELEGRAM_ID_HELP_BOT_USERNAME = "userinfobot"\n',
    'add Telegram bot constants',
)
app = replace_once(
    app,
    'if (!userId.matches(Regex("^[0-9]{5,20}$")) || userId == ADMIN_ID) {',
    'if (!userId.matches(Regex("^[0-9]{5,20}$"))) {',
    'allow admin ID through Android access polling',
)
app = replace_once(
    app,
    'if (!userId.matches(Regex("^[0-9]{5,20}$")) || userId == ADMIN_ID || !accessChecked || isBanned) return@LaunchedEffect',
    'if (!userId.matches(Regex("^[0-9]{5,20}$")) || !accessChecked || isBanned) return@LaunchedEffect',
    'allow admin ID through Android profile sync',
)
app = replace_once(
    app,
    '            id == ADMIN_ID -> "Вход администратора через Android недоступен."\n',
    '',
    'remove Android admin login rejection',
)
app = replace_once(
    app,
    '    var botUsername by rememberSaveable { mutableStateOf("") }\n',
    '',
    'remove dynamic bot username state',
)
app = replace_once(
    app,
    '                info = "Код отправлен вам в Telegram. Введите 6 цифр из сообщения бота."\n',
    '                info = "Код отправлен в @$TELEGRAM_BOT_USERNAME. Введите 6 цифр из сообщения бота."\n',
    'simplify code-sent message',
)
app = replace_once(
    app,
    '                if (cause is AuthBotStartRequired) botUsername = cause.botUsername\n                error = cause.message ?: "Не удалось отправить код"\n',
    '                error = if (cause is AuthBotStartRequired) {\n                    "Откройте @$TELEGRAM_BOT_USERNAME, нажмите Start и запросите код ещё раз."\n                } else {\n                    cause.message ?: "Не удалось отправить код"\n                }\n',
    'use fixed verification bot guidance',
)
app = replace_once(
    app,
    '                        "Теперь одного Telegram ID недостаточно. Мы отправим одноразовый код именно в ваш Telegram — поэтому войти под чужим ID нельзя.",\n',
    '                        "Telegram ID нужен, чтобы загрузить ваш профиль, прогресс и историю игр. Свой числовой ID можно узнать у @$TELEGRAM_ID_HELP_BOT_USERNAME. Код подтверждения придёт в @$TELEGRAM_BOT_USERNAME.",\n',
    'replace verbose ownership explanation',
)
old_bot_block = '''                    if (botUsername.isNotBlank()) {
                        Spacer(Modifier.height(10.dp))
                        com.vidalost.biblegames.ui.SecondaryButton(
                            "Открыть @$botUsername",
                            { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://t.me/$botUsername?start=android_login"))) },
                            Modifier.fillMaxWidth(),
                            icon = "↗",
                        )
                        Spacer(Modifier.height(7.dp))
                        Text("Нажмите Start в Telegram, вернитесь сюда и снова запросите код.", color = InkSoft, fontSize = 12.sp)
                    }
'''
new_bot_block = '''                    Spacer(Modifier.height(10.dp))
                    com.vidalost.biblegames.ui.SecondaryButton(
                        "Где узнать Telegram ID",
                        { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://t.me/$TELEGRAM_ID_HELP_BOT_USERNAME"))) },
                        Modifier.fillMaxWidth(),
                        icon = "?",
                    )
                    Spacer(Modifier.height(8.dp))
                    com.vidalost.biblegames.ui.SecondaryButton(
                        "Открыть @$TELEGRAM_BOT_USERNAME",
                        { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://t.me/$TELEGRAM_BOT_USERNAME?start=android_login"))) },
                        Modifier.fillMaxWidth(),
                        icon = "↗",
                    )
'''
app = replace_once(app, old_bot_block, new_bot_block, 'replace conditional bot block with concise fixed links')
app = replace_once(
    app,
    '                Text("Код действует 10 минут. После подтверждения приложение хранит защищённую сессию на этом устройстве — вводить ID при каждом запуске не потребуется.", color = InkSoft, textAlign = TextAlign.Center, fontSize = 12.sp)\n',
    '                Text("Код действует 10 минут.", color = InkSoft, textAlign = TextAlign.Center, fontSize = 12.sp)\n',
    'simplify login footer',
)
app = sub_once(
    app,
    r'\n@Composable\nprivate fun AccessVerificationScreen\(.*?\n}\n\n(?=@Composable\nprivate fun AccessRestrictedScreen)',
    '\n',
    'remove obsolete timeout verification screen',
    flags=re.S,
)
write(app_path, app)


# Android network client: retry code verification/access through a second transport.
cloud_path = 'android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt'
cloud = read(cloud_path)
cloud = replace_once(
    cloud,
    'data class AndroidAuthSession(\n    val userId: String,\n    val token: String,\n    val expiresAt: Long,\n)\n',
    'data class AndroidAuthSession(\n    val userId: String,\n    val token: String,\n    val expiresAt: Long,\n    val isBanned: Boolean,\n)\n\nprivate data class SmallJsonResponse(\n    val status: Int,\n    val json: JSONObject?,\n)\n',
    'extend verified auth session response',
)
cloud = replace_once(
    cloud,
    '''    private val accessClient: OkHttpClient = OkHttpClient.Builder()
        .protocols(listOf(Protocol.HTTP_1_1))
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .writeTimeout(6, TimeUnit.SECONDS)
        .callTimeout(7, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()
''',
    '''    private val accessClient: OkHttpClient = OkHttpClient.Builder()
        .protocols(listOf(Protocol.HTTP_1_1))
        .connectTimeout(7, TimeUnit.SECONDS)
        .readTimeout(9, TimeUnit.SECONDS)
        .writeTimeout(9, TimeUnit.SECONDS)
        .callTimeout(11, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /** Secondary path for login verification and access checks. A request may
     * reach Cloudflare while the mobile/VPN path loses the response, so the
     * server-side verification flow is idempotent and safe to retry. */
    private val accessFallbackClient: OkHttpClient = OkHttpClient.Builder()
        .protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1))
        .connectTimeout(9, TimeUnit.SECONDS)
        .readTimeout(13, TimeUnit.SECONDS)
        .writeTimeout(13, TimeUnit.SECONDS)
        .callTimeout(16, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()
''',
    'harden small-request network clients',
)
# Code delivery is not automatically retried because a retry could send a second OTP.
request_pattern = r'''    suspend fun requestLoginCode\(id: String\): Result<AndroidAuthChallenge> = withContext\(Dispatchers\.IO\) \{\n        runCatching \{.*?\n        \}\n    \}\n\n    suspend fun verifyLoginCode'''
request_replacement = '''    suspend fun requestLoginCode(id: String): Result<AndroidAuthChallenge> = withContext(Dispatchers.IO) {
        runCatching {
            val body = JSONObject().put("telegramId", id)
            val request = Request.Builder()
                .url("$CORE/android/auth/request")
                .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                .header("Accept", "application/json")
                .header("Origin", "https://vidalost.github.io")
                .header("Cache-Control", "no-store")
                .header("User-Agent", "BibleGames-Android/2.7.1 Native")
                .build()
            accessFallbackClient.newCall(request).execute().use { response ->
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
        }.recoverCatching { cause ->
            if (cause is AuthBotStartRequired) throw cause
            if (cause is IOException && cause.message?.lowercase()?.contains("timeout") == true) {
                throw IOException("Сервер отвечает медленно. Проверьте интернет или VPN и запросите код ещё раз.", cause)
            }
            throw cause
        }
    }

    suspend fun verifyLoginCode'''
cloud = sub_once(cloud, request_pattern, request_replacement, 'replace login-code request transport', flags=re.S)
verify_pattern = r'''    suspend fun verifyLoginCode\(challenge: AndroidAuthChallenge, code: String\): Result<AndroidAuthSession> = withContext\(Dispatchers\.IO\) \{\n        runCatching \{.*?\n        \}\n    \}\n\n    suspend fun logoutSession'''
verify_replacement = '''    suspend fun verifyLoginCode(challenge: AndroidAuthChallenge, code: String): Result<AndroidAuthSession> = withContext(Dispatchers.IO) {
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
                .header("User-Agent", "BibleGames-Android/2.7.1 Native")
                .build()
            val response = executeSmallJsonWithRetry(request)
            val json = response.json
            if (response.status !in 200..299 || json == null || !json.optBoolean("success", false)) {
                throw IOException(json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Код не подтверждён")
            }
            AndroidAuthSession(
                userId = json.getString("userId"),
                token = json.getString("token"),
                expiresAt = json.optLong("expiresAt", 0L),
                isBanned = json.optBoolean("isBanned", false),
            )
        }
    }

    suspend fun logoutSession'''
cloud = sub_once(cloud, verify_pattern, verify_replacement, 'make code verification retry-safe', flags=re.S)
check_pattern = r'''    suspend fun checkAccess\(id: String\): Result<Boolean> = withContext\(Dispatchers\.IO\) \{\n        runCatching \{.*?\n        \}\n    \}\n\n    suspend fun updateHistory'''
check_replacement = '''    suspend fun checkAccess(id: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            val token = sessionToken.takeIf { it.isNotBlank() } ?: throw IOException("Требуется подтверждённый вход")
            val request = Request.Builder()
                .url("$CORE/android/access")
                .get()
                .header("Accept", "application/json")
                .header("Origin", "https://vidalost.github.io")
                .header("Authorization", "Bearer $token")
                .header("Cache-Control", "no-store")
                .header("User-Agent", "BibleGames-Android/2.7.1 Native")
                .build()
            val response = executeSmallJsonWithRetry(request)
            val json = response.json
            val message = json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Не удалось проверить доступ"
            if (response.status == 401) throw AuthSessionInvalid(message)
            if (response.status !in 200..299 || json == null) throw IOException(message)
            if (json.optString("userId") != id) throw AuthSessionInvalid("Сессия принадлежит другому аккаунту")
            json.optBoolean("isBanned", false)
        }
    }

    suspend fun updateHistory'''
cloud = sub_once(cloud, check_pattern, check_replacement, 'retry access checks transparently', flags=re.S)
helper_anchor = '    suspend fun post(url: String, body: JSONObject): JSONObject = postWith(client, url, body)\n\n'
helper_code = '''    private suspend fun executeSmallJsonWithRetry(request: Request): SmallJsonResponse {
        val clients = listOf(accessClient, accessFallbackClient)
        var lastFailure: IOException? = null
        for ((index, http) in clients.withIndex()) {
            try {
                http.newCall(request).execute().use { response ->
                    val payload = response.body?.string().orEmpty()
                    val json = runCatching { JSONObject(payload) }.getOrNull()
                    val shouldRetry = index < clients.lastIndex && (response.code >= 500 || (response.isSuccessful && json == null))
                    if (!shouldRetry) return SmallJsonResponse(response.code, json)
                    lastFailure = IOException(json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Сервер временно недоступен")
                }
            } catch (cause: IOException) {
                lastFailure = cause
                if (index == clients.lastIndex) break
            }
            if (index < clients.lastIndex) delay(220)
        }
        throw IOException(
            "Не удалось связаться с сервером. Проверьте интернет или VPN — приложение повторит проверку автоматически.",
            lastFailure,
        )
    }

    suspend fun post(url: String, body: JSONObject): JSONObject = postWith(client, url, body)

'''
cloud = replace_once(cloud, helper_anchor, helper_code, 'add small-request retry helper')
cloud = cloud.replace('BibleGames-Android/2.7 Native', 'BibleGames-Android/2.7.1 Native')
write(cloud_path, cloud)


# Core Worker: Android admin ID is an ordinary player in native app; verification is idempotent.
core_path = 'cloudflare/app-core-worker/src/index-v4.js'
core = read(core_path)
core = replace_once(
    core,
    "    if (telegramId === String(env.ADMIN_TELEGRAM_ID || '')) throw httpError(403, 'Вход администратора через Android недоступен');\n",
    '',
    'allow admin account to use Android as a normal player',
)
core = replace_once(
    core,
    '    const token = `bgs_${authRandomBase64Url(32)}`;\n',
    '    const token = `bgs_${await authHmacHex(env.TELEGRAM_BOT_TOKEN, `session:${challengeId}:${telegramId}:${code}`)}`;\n',
    'make verification retry return the same bearer',
)
core = replace_once(
    core,
    '''    if (String(result.userId || '') !== telegramId) throw httpError(403, 'Telegram ID не совпадает с кодом');
    return json({
      success: true,
      userId: String(result.userId || ''),
      token,
      expiresAt: Number(result.expiresAt || sessionExpiresAt),
      source: 'telegram-code-session',
    }, 200, cors);
''',
    '''    if (String(result.userId || '') !== telegramId) throw httpError(403, 'Telegram ID не совпадает с кодом');
    const access = await callStore(store, '/access', { id: telegramId });
    return json({
      success: true,
      userId: String(result.userId || ''),
      token,
      expiresAt: Number(result.expiresAt || sessionExpiresAt),
      isBanned: Boolean(access.isBanned),
      source: 'telegram-code-session',
    }, 200, cors);
''',
    'return access state with verified login',
)
write(core_path, core)


# Durable auth store: keep a successful challenge until its advertised TTL so a lost response can be retried.
auth_path = 'cloudflare/app-core-worker/src/android-auth-user-store.js'
auth = read(auth_path)
auth = replace_once(
    auth,
    'const CHALLENGE_TTL_MS = 10 * 60 * 1000;\n',
    'const CHALLENGE_TTL_MS = 10 * 60 * 1000;\nconst CHALLENGE_VERIFY_GRACE_MS = 30 * 1000;\n',
    'add OTP transport grace',
)
auth = replace_once(
    auth,
    "    this.sql.exec('DELETE FROM android_auth_challenges WHERE expires_at <= ?', now);\n",
    "    this.sql.exec('DELETE FROM android_auth_challenges WHERE expires_at <= ?', now - CHALLENGE_VERIFY_GRACE_MS);\n",
    'do not purge an OTP while a verification request is in flight',
)
auth = replace_once(
    auth,
    '    if (!row || Number(row.expires_at || 0) <= now) {\n',
    '    if (!row || Number(row.expires_at || 0) + CHALLENGE_VERIFY_GRACE_MS <= now) {\n',
    'honor full OTP TTL plus network grace',
)
auth = replace_once(
    auth,
    "      this.sql.exec('DELETE FROM android_auth_challenges WHERE id = ?', challengeId);\n      this.sql.exec(\n        `INSERT INTO android_sessions\n",
    "      this.sql.exec(\n        `INSERT OR IGNORE INTO android_sessions\n",
    'keep successful challenge and make session insertion idempotent',
)
auth = replace_once(
    auth,
    '    return { ok: true, success: true, userId: telegramId, expiresAt: sessionExpiresAt };\n',
    '''    const session = this.sql.exec(
      'SELECT expires_at FROM android_sessions WHERE token_hash = ? AND telegram_id = ?',
      tokenHash,
      telegramId,
    ).toArray()[0];
    return {
      ok: true,
      success: true,
      userId: telegramId,
      expiresAt: Number(session?.expires_at || sessionExpiresAt),
    };
''',
    'return the persisted idempotent session expiry',
)
write(auth_path, auth)


# Bump native version and update checks/build artifact names.
gradle_path = 'android-app/app/build.gradle'
gradle = read(gradle_path)
gradle = replace_once(gradle, 'versionCode 20', 'versionCode 21', 'bump Android versionCode')
gradle = replace_once(gradle, "versionName '2.7.0-native'", "versionName '2.7.1-native'", 'bump Android versionName')
write(gradle_path, gradle)

workflow_path = '.github/workflows/build-android-apk.yml'
workflow = read(workflow_path).replace('2.7.0-native', '2.7.1-native')
if workflow == read(workflow_path):
    raise SystemExit('build workflow version: no replacements made')
write(workflow_path, workflow)

secure_path = 'scripts/check-android-secure-auth.mjs'
secure = read(secure_path)
secure = replace_once(secure, "need(core, 'authRandomBase64Url(32)', 'session token lacks strong server randomness');", "need(core, 'session:${challengeId}:${telegramId}:${code}', 'retry-safe session token derivation is missing');", 'update bearer security assertion')
secure = replace_once(secure, "need(gradle, \"versionName '2.7.0-native'\", 'secure auth release version is not current');", "need(gradle, \"versionName '2.7.1-native'\", 'secure auth release version is not current');", 'update secure versionName assertion')
secure = replace_once(secure, "need(gradle, 'versionCode 20', 'secure auth versionCode is not current');", "need(gradle, 'versionCode 21', 'secure auth versionCode is not current');", 'update secure versionCode assertion')
secure = replace_once(secure, "need(authStore, 'MAX_CHALLENGES_PER_ID = 3', 'per-account code request rate limit missing');", "need(authStore, 'MAX_CHALLENGES_PER_ID = 3', 'per-account code request rate limit missing');\nneed(authStore, 'INSERT OR IGNORE INTO android_sessions', 'verification is not idempotent after a lost response');\nneed(authStore, 'CHALLENGE_VERIFY_GRACE_MS', 'OTP can expire while a verification request is in flight');", 'assert retry-safe challenge consumption')
secure = replace_once(secure, "need(app, 'clearVerifiedSession()', 'invalid session does not force a fresh verified login');", "need(app, 'clearVerifiedSession()', 'invalid session does not force a fresh verified login');\nneed(app, 'TELEGRAM_BOT_USERNAME = \"bibleiskie_bot\"', 'verification bot link is not explicit');\nreject(app, 'ADMIN_ID', 'Android still special-cases the administrator account');\nreject(app, 'Вход администратора через Android недоступен', 'Android still blocks the administrator account');", 'assert Android admin is ordinary player')
secure = replace_once(secure, "need(cloud, 'AuthSessionInvalid', '401 session failures are not distinguished from network failures');", "need(cloud, 'AuthSessionInvalid', '401 session failures are not distinguished from network failures');\nneed(cloud, 'executeSmallJsonWithRetry', 'verification/access calls do not retry alternate transport');", 'assert network retry helper')
secure = replace_once(secure, "need(core, \"request.headers.get('CF-Connecting-IP')\", 'auth request rate limit is not keyed to requester network');", "need(core, \"request.headers.get('CF-Connecting-IP')\", 'auth request rate limit is not keyed to requester network');\nreject(core, 'Вход администратора через Android недоступен', 'backend still blocks the administrator account on Android');", 'assert backend admin ID is not blocked')
write(secure_path, secure)

ban_path = 'scripts/check-android-ban-enforcement.mjs'
ban = read(ban_path)
ban = replace_once(ban, "need(cloud, 'callTimeout(7, TimeUnit.SECONDS)', 'bounded access call deadline missing');", "need(cloud, 'callTimeout(11, TimeUnit.SECONDS)', 'bounded primary access deadline missing');\nneed(cloud, 'accessFallbackClient', 'fallback access transport missing');", 'update access transport assertion')
ban = replace_once(ban, "need(gradle, \"versionName '2.7.0-native'\", 'Android version was not bumped');", "need(gradle, \"versionName '2.7.1-native'\", 'Android version was not bumped');", 'update ban test version')
write(ban_path, ban)

support_path = 'scripts/check-support-center.mjs'
support = read(support_path)
support = replace_once(support, "requireText(gradle, \"versionName '2.7.0-native'\", 'Android release version is not current');", "requireText(gradle, \"versionName '2.7.1-native'\", 'Android release version is not current');", 'update support test version')
write(support_path, support)

print('Android auth reliability 2.7.1 patch applied successfully')
