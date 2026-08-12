from pathlib import Path

p = Path('cloudflare/app-core-worker/src/index-v4.js')
s = p.read_text()

s = s.replace("import { SupportUserStore } from './support-user-store.js';", "import { AndroidAuthUserStore } from './android-auth-user-store.js';", 1)
s = s.replace('export class UserStore extends SupportUserStore {}', 'export class UserStore extends AndroidAuthUserStore {}', 1)

needle = "    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });\n\n"
insert = """    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/android/auth/request' && request.method === 'POST') {
      return handleAndroidAuthRequest(request, env, cors);
    }
    if (url.pathname === '/android/auth/verify' && request.method === 'POST') {
      return handleAndroidAuthVerify(request, env, cors);
    }
    if (url.pathname === '/android/auth/me' && request.method === 'GET') {
      return handleAndroidAuthMe(request, env, cors);
    }
    if (url.pathname === '/android/auth/logout' && request.method === 'POST') {
      return handleAndroidAuthLogout(request, env, cors);
    }

"""
if needle not in s:
    raise SystemExit('OPTIONS insertion point not found')
s = s.replace(needle, insert, 1)

old_access = """    if (url.pathname === '/android/access' && request.method === 'GET') {
      try {
        if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
        const androidUserId = String(url.searchParams.get('id') || '').trim();
        if (!/^\\d{5,20}$/.test(androidUserId)) throw httpError(400, 'Bad Android user id');
        if (androidUserId === String(env.ADMIN_TELEGRAM_ID || '')) throw httpError(403, 'Admin login is not allowed in Android ID mode');
        const store = env.USERS.get(env.USERS.idFromName('global'));
        const access = await callStore(store, '/access', { id: androidUserId });
        return json({ success: true, isBanned: Boolean(access.isBanned), source: 'cloudflare-sql-android-access-get' }, 200, cors);
      } catch (error) {
        return json({ success: false, error: String(error?.message || 'Server error') }, Number(error?.status || 500), cors);
      }
    }
"""
new_access = """    if (url.pathname === '/android/access' && request.method === 'GET') {
      try {
        if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
        const session = await requireAndroidSession(request, env);
        const store = env.USERS.get(env.USERS.idFromName('global'));
        const access = await callStore(store, '/access', { id: session.userId });
        return json({
          success: true,
          userId: session.userId,
          isBanned: Boolean(access.isBanned),
          source: 'cloudflare-sql-android-session',
        }, 200, cors);
      } catch (error) {
        return json({ success: false, error: String(error?.message || 'Server error') }, Number(error?.status || 500), cors);
      }
    }
"""
if old_access not in s:
    raise SystemExit('legacy /android/access block not found')
s = s.replace(old_access, new_access, 1)

old_identity = """      const body = await request.json();
      const androidUserId = String(body?.androidUserId || '').trim();
      if (!/^\\d{5,20}$/.test(androidUserId)) throw httpError(400, 'Bad Android user id');
      if (androidUserId === String(env.ADMIN_TELEGRAM_ID || '')) throw httpError(403, 'Admin login is not allowed in Android ID mode');

      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
"""
new_identity = """      const body = await request.json();
      const session = await requireAndroidSession(request, env);
      const androidUserId = session.userId;
      const claimedUserId = String(body?.androidUserId || '').trim();
      if (claimedUserId && claimedUserId !== androidUserId) throw httpError(403, 'User mismatch');

      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
"""
if old_identity not in s:
    raise SystemExit('/android/compat identity block not found')
s = s.replace(old_identity, new_identity, 1)

s = s.replace("'Access-Control-Allow-Headers': 'Content-Type',", "'Access-Control-Allow-Headers': 'Content-Type, Authorization',", 1)

helper_anchor = "async function handleSupportAdminAction(store, action, payload, cors) {"
if helper_anchor not in s:
    raise SystemExit('support helper anchor not found')
helpers = r'''
const ANDROID_AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const ANDROID_AUTH_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

async function handleAndroidAuthRequest(request, env, cors) {
  try {
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    if (!env.TELEGRAM_BOT_TOKEN) throw httpError(500, 'Telegram secret is not configured');
    const body = await request.json().catch(() => ({}));
    const telegramId = String(body?.telegramId || '').trim();
    if (!/^\d{5,20}$/.test(telegramId)) throw httpError(400, 'Введите корректный Telegram ID');
    if (telegramId === String(env.ADMIN_TELEGRAM_ID || '')) throw httpError(403, 'Вход администратора через Android недоступен');

    const challengeId = `ach_${crypto.randomUUID().replaceAll('-', '')}`;
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    const codeHash = await authHmacHex(env.TELEGRAM_BOT_TOKEN, `${challengeId}:${telegramId}:${code}`);
    const requestKey = await authSha256Hex([
      request.headers.get('CF-Connecting-IP') || 'unknown',
      request.headers.get('User-Agent') || '',
    ].join('|'));
    const expiresAt = Date.now() + ANDROID_AUTH_CODE_TTL_MS;
    const store = env.USERS.get(env.USERS.idFromName('global'));
    await callStore(store, '/android-auth/begin', { challengeId, telegramId, codeHash, requestKey, expiresAt });

    const sent = await telegramSendLoginCode(env, telegramId, code);
    if (!sent.ok) {
      await callStore(store, '/android-auth/drop', { challengeId }).catch(() => {});
      const botUsername = await telegramBotUsername(env).catch(() => '');
      const needsStart = sent.status === 400 || sent.status === 403;
      return json({
        success: false,
        code: needsStart ? 'BOT_START_REQUIRED' : 'TELEGRAM_DELIVERY_FAILED',
        requiresBotStart: needsStart,
        botUsername,
        error: needsStart
          ? 'Бот пока не может написать вам. Откройте бота, нажмите Start и запросите код ещё раз.'
          : 'Не удалось отправить код в Telegram. Попробуйте ещё раз.',
      }, needsStart ? 409 : 502, cors);
    }

    return json({
      success: true,
      challengeId,
      expiresInSeconds: Math.floor(ANDROID_AUTH_CODE_TTL_MS / 1000),
    }, 200, cors);
  } catch (error) {
    return json({ success: false, error: String(error?.message || 'Не удалось запросить код') }, Number(error?.status || 500), cors);
  }
}

async function handleAndroidAuthVerify(request, env, cors) {
  try {
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    if (!env.TELEGRAM_BOT_TOKEN) throw httpError(500, 'Telegram secret is not configured');
    const body = await request.json().catch(() => ({}));
    const challengeId = String(body?.challengeId || '').trim();
    const code = String(body?.code || '').trim();
    if (!/^ach_[a-zA-Z0-9_-]{20,80}$/.test(challengeId) || !/^\d{6}$/.test(code)) {
      throw httpError(400, 'Введите шестизначный код из Telegram');
    }

    const codeHash = await authHmacHex(env.TELEGRAM_BOT_TOKEN, `${challengeId}:${String(body?.telegramId || '').trim()}:${code}`);
    // The challenge owns the Telegram ID. For privacy, the client repeats the ID
    // only as part of the HMAC input; the store never trusts it for the session.
    const telegramId = String(body?.telegramId || '').trim();
    if (!/^\d{5,20}$/.test(telegramId)) throw httpError(400, 'Telegram ID отсутствует');
    const correctedCodeHash = await authHmacHex(env.TELEGRAM_BOT_TOKEN, `${challengeId}:${telegramId}:${code}`);
    const token = `bgs_${authRandomBase64Url(32)}`;
    const tokenHash = await authSha256Hex(token);
    const sessionExpiresAt = Date.now() + ANDROID_AUTH_SESSION_TTL_MS;
    const store = env.USERS.get(env.USERS.idFromName('global'));
    const result = await callStore(store, '/android-auth/consume', {
      challengeId,
      codeHash: correctedCodeHash || codeHash,
      tokenHash,
      sessionExpiresAt,
    });
    if (String(result.userId || '') !== telegramId) throw httpError(403, 'Telegram ID не совпадает с кодом');
    return json({
      success: true,
      userId: String(result.userId || ''),
      token,
      expiresAt: Number(result.expiresAt || sessionExpiresAt),
      source: 'telegram-code-session',
    }, 200, cors);
  } catch (error) {
    return json({ success: false, error: String(error?.message || 'Код не подтверждён') }, Number(error?.status || 500), cors);
  }
}

async function handleAndroidAuthMe(request, env, cors) {
  try {
    const session = await requireAndroidSession(request, env);
    const store = env.USERS.get(env.USERS.idFromName('global'));
    const access = await callStore(store, '/access', { id: session.userId });
    return json({ success: true, userId: session.userId, isBanned: Boolean(access.isBanned), expiresAt: session.expiresAt }, 200, cors);
  } catch (error) {
    return json({ success: false, error: String(error?.message || 'Сессия недействительна') }, Number(error?.status || 401), cors);
  }
}

async function handleAndroidAuthLogout(request, env, cors) {
  try {
    const token = androidBearerToken(request);
    if (token) {
      const tokenHash = await authSha256Hex(token);
      const store = env.USERS.get(env.USERS.idFromName('global'));
      await callStore(store, '/android-auth/revoke', { tokenHash }).catch(() => {});
    }
    return json({ success: true }, 200, cors);
  } catch {
    return json({ success: true }, 200, cors);
  }
}

async function requireAndroidSession(request, env) {
  const token = androidBearerToken(request);
  if (!token) throw httpError(401, 'Требуется подтверждённый вход');
  const tokenHash = await authSha256Hex(token);
  const store = env.USERS.get(env.USERS.idFromName('global'));
  const session = await callStore(store, '/android-auth/session', { tokenHash });
  const userId = String(session.userId || '');
  if (!/^\d{5,20}$/.test(userId)) throw httpError(401, 'Сессия недействительна');
  return { userId, expiresAt: Number(session.expiresAt || 0) };
}

function androidBearerToken(request) {
  const header = String(request.headers.get('Authorization') || '');
  const match = header.match(/^Bearer\s+(bgs_[A-Za-z0-9_-]{40,80})$/i);
  return match ? match[1] : '';
}

async function telegramSendLoginCode(env, telegramId, code) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramId,
      text: [
        '🔐 Вход в «Библейские игры»',
        '',
        `Код подтверждения: ${code}`,
        '',
        'Код действует 10 минут. Никому его не сообщайте.',
        'Если вы не запрашивали вход, просто проигнорируйте это сообщение.',
      ].join('\n'),
      disable_web_page_preview: true,
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && data?.ok === true, status: response.status, description: String(data?.description || '') };
}

async function telegramBotUsername(env) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) return '';
  return String(data?.result?.username || '').replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64);
}

async function authHmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(value || ''))));
  return [...signature].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function authSha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || ''))));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function authRandomBase64Url(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

'''
s = s.replace(helper_anchor, helpers + helper_anchor, 1)
p.write_text(s)

# Replace CloudRepository with session-authenticated implementation additions using targeted edits.
p = Path('android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt')
s = p.read_text()
s = s.replace('class CloudRepository {', '''data class AndroidAuthChallenge(\n    val telegramId: String,\n    val challengeId: String,\n    val expiresInSeconds: Int,\n)\n\ndata class AndroidAuthSession(\n    val userId: String,\n    val token: String,\n    val expiresAt: Long,\n)\n\nclass AuthBotStartRequired(\n    val botUsername: String,\n    message: String,\n) : IOException(message)\n\nclass CloudRepository(initialSessionToken: String = "") {''', 1)
s = s.replace('    val client: OkHttpClient = OkHttpClient.Builder()', '    @Volatile\n    private var sessionToken: String = initialSessionToken\n\n    fun setSessionToken(token: String) { sessionToken = token.trim() }\n    fun currentSessionToken(): String = sessionToken\n    fun hasSession(): Boolean = sessionToken.startsWith("bgs_")\n\n    val client: OkHttpClient = OkHttpClient.Builder()', 1)

sync_anchor = '    suspend fun syncProfile(id: String, local: PlayerProfile): Result<PlayerProfile> = withContext(Dispatchers.IO) {'
auth_methods = '''    suspend fun requestLoginCode(id: String): Result<AndroidAuthChallenge> = withContext(Dispatchers.IO) {\n        runCatching {\n            val body = JSONObject().put("telegramId", id)\n            val request = Request.Builder()\n                .url("$CORE/android/auth/request")\n                .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))\n                .header("Accept", "application/json")\n                .header("Origin", "https://vidalost.github.io")\n                .header("Cache-Control", "no-store")\n                .header("User-Agent", "BibleGames-Android/2.7 Native")\n                .build()\n            accessClient.newCall(request).execute().use { response ->\n                val text = response.body?.string().orEmpty()\n                val json = runCatching { JSONObject(text) }.getOrNull()\n                if (!response.isSuccessful || json == null || !json.optBoolean("success", false)) {\n                    val message = json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Не удалось отправить код"\n                    if (json?.optBoolean("requiresBotStart", false) == true) {\n                        throw AuthBotStartRequired(json.optString("botUsername", ""), message)\n                    }\n                    throw IOException(message)\n                }\n                AndroidAuthChallenge(\n                    telegramId = id,\n                    challengeId = json.getString("challengeId"),\n                    expiresInSeconds = json.optInt("expiresInSeconds", 600),\n                )\n            }\n        }\n    }\n\n    suspend fun verifyLoginCode(challenge: AndroidAuthChallenge, code: String): Result<AndroidAuthSession> = withContext(Dispatchers.IO) {\n        runCatching {\n            val body = JSONObject()\n                .put("telegramId", challenge.telegramId)\n                .put("challengeId", challenge.challengeId)\n                .put("code", code)\n            val request = Request.Builder()\n                .url("$CORE/android/auth/verify")\n                .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))\n                .header("Accept", "application/json")\n                .header("Origin", "https://vidalost.github.io")\n                .header("Cache-Control", "no-store")\n                .header("User-Agent", "BibleGames-Android/2.7 Native")\n                .build()\n            accessClient.newCall(request).execute().use { response ->\n                val text = response.body?.string().orEmpty()\n                val json = runCatching { JSONObject(text) }.getOrNull()\n                if (!response.isSuccessful || json == null || !json.optBoolean("success", false)) {\n                    throw IOException(json?.optString("error")?.takeIf { it.isNotBlank() } ?: "Код не подтверждён")\n                }\n                AndroidAuthSession(\n                    userId = json.getString("userId"),\n                    token = json.getString("token"),\n                    expiresAt = json.optLong("expiresAt", 0L),\n                )\n            }\n        }\n    }\n\n    suspend fun logoutSession() = withContext(Dispatchers.IO) {\n        runCatching {\n            val token = sessionToken\n            if (token.isBlank()) return@runCatching\n            val request = Request.Builder()\n                .url("$CORE/android/auth/logout")\n                .post("{}".toRequestBody("application/json; charset=utf-8".toMediaType()))\n                .header("Origin", "https://vidalost.github.io")\n                .header("Authorization", "Bearer $token")\n                .header("User-Agent", "BibleGames-Android/2.7 Native")\n                .build()\n            accessClient.newCall(request).execute().close()\n        }\n    }\n\n'''
if sync_anchor not in s:
    raise SystemExit('CloudRepository sync anchor not found')
s = s.replace(sync_anchor, auth_methods + sync_anchor, 1)

old_check = '''    suspend fun checkAccess(id: String): Result<Boolean> = withContext(Dispatchers.IO) {\n        runCatching {\n            val request = Request.Builder()\n                .url("$CORE/android/access?id=$id")\n                .get()\n                .header("Accept", "application/json")\n                .header("Origin", "https://vidalost.github.io")\n                .header("Cache-Control", "no-store")\n                .header("User-Agent", "BibleGames-Android/2.6 Native")\n                .build()\n'''
new_check = '''    suspend fun checkAccess(id: String): Result<Boolean> = withContext(Dispatchers.IO) {\n        runCatching {\n            val token = sessionToken.takeIf { it.isNotBlank() } ?: throw IOException("Требуется подтверждённый вход")\n            val request = Request.Builder()\n                .url("$CORE/android/access")\n                .get()\n                .header("Accept", "application/json")\n                .header("Origin", "https://vidalost.github.io")\n                .header("Authorization", "Bearer $token")\n                .header("Cache-Control", "no-store")\n                .header("User-Agent", "BibleGames-Android/2.7 Native")\n                .build()\n'''
if old_check not in s:
    raise SystemExit('legacy checkAccess start not found')
s = s.replace(old_check, new_check, 1)

# Add bearer auth automatically to core calls only. Room workers keep their own signed room tokens.
request_old = '''        val request = Request.Builder().url(url)\n            .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))\n            .header("Accept", "application/json")\n'''
request_new = '''        val builder = Request.Builder().url(url)\n            .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))\n            .header("Accept", "application/json")\n'''
if request_old not in s:
    raise SystemExit('postWith request builder not found')
s = s.replace(request_old, request_new, 1)
header_tail = '''            .header("User-Agent", "BibleGames-Android/2.6 Native")\n            .build()\n        http.newCall(request).execute().use { response ->\n'''
header_new = '''            .header("User-Agent", "BibleGames-Android/2.7 Native")\n        if (url.startsWith(CORE) && sessionToken.isNotBlank()) builder.header("Authorization", "Bearer $sessionToken")\n        val request = builder.build()\n        http.newCall(request).execute().use { response ->\n'''
if header_tail not in s:
    raise SystemExit('postWith header tail not found')
s = s.replace(header_tail, header_new, 1)
p.write_text(s)

# MainActivity restores the encrypted bearer before any access request can start.
p = Path('android-app/app/src/main/java/com/vidalost/biblegames/MainActivity.kt')
s = p.read_text()
s = s.replace('import com.vidalost.biblegames.data.CloudRepository', 'import com.vidalost.biblegames.data.CloudRepository\nimport com.vidalost.biblegames.data.AndroidSessionStore', 1)
s = s.replace('        val cloud = CloudRepository()', '        val sessionStore = AndroidSessionStore(applicationContext)\n        val cloud = CloudRepository(sessionStore.load()?.token.orEmpty())', 1)
p.write_text(s)

# AppPresence uses the bearer; identity is derived server-side instead of from query/body userId.
p = Path('android-app/app/src/main/java/com/vidalost/biblegames/data/AppPresenceClient.kt')
s = p.read_text()
s = s.replace('.url("$wsBase/presence?sid=$sessionId&androidUserId=$userId")', '.url("$wsBase/presence?sid=$sessionId")', 1)
s = s.replace('            .header("Origin", TRUSTED_ORIGIN)\n            .header("User-Agent", "BibleGames-Android-Native")', '            .header("Origin", TRUSTED_ORIGIN)\n            .header("Authorization", "Bearer ${cloud.currentSessionToken()}")\n            .header("User-Agent", "BibleGames-Android/2.7 Native")', 1)
s = s.replace('            .put("platform", "android")\n            .put("userId", userId)\n            .put("game", game)', '            .put("platform", "android")\n            .put("game", game)', 1)
p.write_text(s)

# App UI: restore only cryptographically protected sessions, verify a Telegram code on first login, and revoke on logout.
p = Path('android-app/app/src/main/java/com/vidalost/biblegames/App.kt')
s = p.read_text()
s = s.replace('import com.vidalost.biblegames.data.CloudRepository', 'import com.vidalost.biblegames.data.CloudRepository\nimport com.vidalost.biblegames.data.AndroidAuthChallenge\nimport com.vidalost.biblegames.data.AndroidSessionStore\nimport com.vidalost.biblegames.data.AuthBotStartRequired', 1)
old_init = '''    val prefs = remember { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }\n    var userId by rememberSaveable { mutableStateOf(prefs.getString(ID_KEY, "").orEmpty()) }\n'''
new_init = '''    val prefs = remember { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }\n    val sessionStore = remember { AndroidSessionStore(context) }\n    val restoredSession = remember { sessionStore.load() }\n    var userId by rememberSaveable { mutableStateOf(restoredSession?.userId.orEmpty()) }\n'''
if old_init not in s:
    raise SystemExit('App init userId block not found')
s = s.replace(old_init, new_init, 1)

close_anchor = '''    fun closeGame() {\n'''
logout_func = '''    fun logout() {\n        val oldToken = cloud.currentSessionToken()\n        appScope.launch {\n            if (oldToken.isNotBlank()) cloud.logoutSession()\n        }\n        cloud.setSessionToken("")\n        sessionStore.clear()\n        prefs.edit().remove(ID_KEY).apply()\n        userId = ""\n        currentGame = null\n        activeRoomId = ""\n        accessChecked = false\n        isBanned = false\n    }\n\n'''
if close_anchor not in s:
    raise SystemExit('closeGame anchor not found')
s = s.replace(close_anchor, logout_func + close_anchor, 1)

old_login_call = '''            !signedIn -> LoginScreen(\n                onLogin = { id ->\n                    prefs.edit().putString(ID_KEY, id).apply()\n                    userId = id\n                },\n                onSupport = { supportOpen = true },\n            )\n'''
new_login_call = '''            !signedIn -> LoginScreen(\n                cloud = cloud,\n                onLogin = { id, token, expiresAt ->\n                    cloud.setSessionToken(token)\n                    sessionStore.save(id, token, expiresAt)\n                    prefs.edit().putString(ID_KEY, id).apply()\n                    userId = id\n                },\n            )\n'''
if old_login_call not in s:
    raise SystemExit('LoginScreen call not found')
s = s.replace(old_login_call, new_login_call, 1)
s = s.replace('onLogout = { prefs.edit().remove(ID_KEY).apply(); userId = "" },', 'onLogout = ::logout,', 1)
s = s.replace('''                onLogout = {\n                    prefs.edit().remove(ID_KEY).apply(); userId = ""\n                },''', '                onLogout = ::logout,', 1)

start = s.index('@Composable\nprivate fun LoginScreen(')
end = s.index('\n@Composable\nprivate fun HomeScreen(', start)
new_login = r'''@Composable
private fun LoginScreen(
    cloud: CloudRepository,
    onLogin: (String, String, Long) -> Unit,
) {
    val context = LocalContext.current
    val focus = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    var id by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var challenge by remember { mutableStateOf<AndroidAuthChallenge?>(null) }
    var botUsername by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var info by rememberSaveable { mutableStateOf<String?>(null) }
    var busy by rememberSaveable { mutableStateOf(false) }

    fun validId(): Boolean {
        focus.clearFocus()
        error = when {
            !id.matches(Regex("^[0-9]{5,20}$")) -> "Введите числовой Telegram ID (от 5 до 20 цифр)."
            id == ADMIN_ID -> "Вход администратора через Android недоступен."
            else -> null
        }
        return error == null
    }

    fun requestCode() {
        if (!validId() || busy) return
        busy = true
        error = null
        info = null
        challenge = null
        code = ""
        scope.launch {
            cloud.requestLoginCode(id).onSuccess {
                challenge = it
                info = "Код отправлен вам в Telegram. Введите 6 цифр из сообщения бота."
            }.onFailure { cause ->
                if (cause is AuthBotStartRequired) botUsername = cause.botUsername
                error = cause.message ?: "Не удалось отправить код"
            }
            busy = false
        }
    }

    fun verifyCode() {
        val current = challenge ?: run {
            error = "Сначала запросите код в Telegram."
            return
        }
        if (!code.matches(Regex("^\\d{6}$"))) {
            error = "Введите шестизначный код из Telegram."
            return
        }
        if (busy) return
        busy = true
        error = null
        scope.launch {
            cloud.verifyLoginCode(current, code).onSuccess { session ->
                onLogin(session.userId, session.token, session.expiresAt)
            }.onFailure { cause ->
                error = cause.message ?: "Код не подтверждён"
            }
            busy = false
        }
    }

    AppBackground {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(22.dp, 34.dp, 22.dp, 38.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item {
                Surface(Modifier.size(92.dp), RoundedCornerShape(28.dp), color = Color.White, shadowElevation = 12.dp) {
                    Box(Modifier.background(Brush.linearGradient(listOf(Color(0xFFEEF2FF), Color(0xFFE0F7FF)))), contentAlignment = Alignment.Center) {
                        Text("📖", fontSize = 47.sp)
                    }
                }
                Spacer(Modifier.height(18.dp))
                Text("Библейские игры", color = Color(0xFF25236E), fontSize = 31.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
                Text("Безопасный вход через Telegram", color = InkSoft, fontSize = 15.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                Spacer(Modifier.height(24.dp))
                GlassCard(Modifier.fillMaxWidth()) {
                    Text("Подтвердите свой Telegram", color = Color(0xFF312E81), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                    Spacer(Modifier.height(9.dp))
                    Text(
                        "Теперь одного Telegram ID недостаточно. Мы отправим одноразовый код именно в ваш Telegram — поэтому войти под чужим ID нельзя.",
                        color = InkSoft,
                        lineHeight = 21.sp,
                    )
                    Spacer(Modifier.height(15.dp))
                    OutlinedTextField(
                        value = id,
                        onValueChange = { value ->
                            id = value.filter(Char::isDigit).take(20)
                            challenge = null
                            code = ""
                            error = null
                            info = null
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !busy,
                        label = { Text("Telegram ID") },
                        placeholder = { Text("Например: 123456789") },
                        singleLine = true,
                        isError = error != null,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next),
                        shape = RoundedCornerShape(18.dp),
                        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Indigo, unfocusedBorderColor = Color(0xFFC7D2FE)),
                    )
                    Spacer(Modifier.height(12.dp))
                    PrimaryButton(
                        if (busy && challenge == null) "Отправляем…" else "Получить код в Telegram",
                        ::requestCode,
                        Modifier.fillMaxWidth(),
                        icon = "✉",
                    )
                    if (botUsername.isNotBlank()) {
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
                    if (challenge != null) {
                        Spacer(Modifier.height(14.dp))
                        OutlinedTextField(
                            value = code,
                            onValueChange = { value -> code = value.filter(Char::isDigit).take(6); error = null },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !busy,
                            label = { Text("Код из Telegram") },
                            placeholder = { Text("000000") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { verifyCode() }),
                            shape = RoundedCornerShape(18.dp),
                            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Indigo, unfocusedBorderColor = Color(0xFFC7D2FE)),
                        )
                        Spacer(Modifier.height(12.dp))
                        PrimaryButton(if (busy) "Проверяем…" else "Подтвердить и войти", ::verifyCode, Modifier.fillMaxWidth(), icon = "✓")
                    }
                    info?.let {
                        Spacer(Modifier.height(10.dp))
                        Text(it, color = Color(0xFF047857), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                    error?.let {
                        Spacer(Modifier.height(10.dp))
                        Text(it, color = Color(0xFFB91C1C), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(Modifier.height(13.dp))
                Text("Код действует 10 минут. После подтверждения приложение хранит защищённую сессию на этом устройстве — вводить ID при каждом запуске не потребуется.", color = InkSoft, textAlign = TextAlign.Center, fontSize = 12.sp)
            }
        }
    }
}
'''
s = s[:start] + new_login + s[end:]
p.write_text(s)

# Observability derives Android identity from the core bearer session.
p = Path('cloudflare/app-observability-worker/src/index-v3.js')
s = p.read_text()
start = s.index('export default {')
end = s.index('\n};', start) + 3
new_default = r'''export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/presence' || request.method !== 'GET') {
      return observability.fetch(request, env, ctx);
    }

    const origin = request.headers.get('Origin') || '';
    if (!allowedOrigins(env).includes(origin)) return jsonError('Origin not allowed', 403, origin, env);
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return jsonError('WebSocket required', 426, origin, env);

    const sid = sanitizeSessionId(url.searchParams.get('sid'));
    if (!sid) return jsonError('Session id required', 400, origin, env);
    const authorization = String(request.headers.get('Authorization') || '');
    if (!/^Bearer\s+bgs_[A-Za-z0-9_-]{40,80}$/i.test(authorization)) {
      return jsonError('Verified Android session required', 401, origin, env);
    }

    const coreUrl = String(env.CORE_WORKER_URL || 'https://alias-spy-games-core.vitaledanilov.workers.dev').replace(/\/$/, '');
    let identity = {};
    try {
      const response = await fetch(`${coreUrl}/android/auth/me`, {
        headers: { Accept: 'application/json', Authorization: authorization },
      });
      identity = await response.json().catch(() => ({}));
      if (!response.ok || identity?.success !== true || identity?.isBanned === true) {
        return jsonError(identity?.isBanned ? 'Access restricted' : 'Android session invalid', identity?.isBanned ? 403 : 401, origin, env);
      }
    } catch {
      return jsonError('Identity service unavailable', 503, origin, env);
    }

    const androidUserId = String(identity.userId || '');
    if (!/^\d{5,20}$/.test(androidUserId)) return jsonError('Android session invalid', 401, origin, env);

    const headers = new Headers(request.headers);
    headers.set('X-App-Session-Id', sid);
    headers.set('X-App-User-Id', androidUserId);
    headers.set('X-App-Display-Name', `Android · ID ${androidUserId}`);

    const stub = env.STATS.get(env.STATS.idFromName('global'));
    return stub.fetch(new Request('https://stats.internal/presence', { method: 'GET', headers }));
  },
};'''
s = s[:start] + new_default + s[end:]
p.write_text(s)

p = Path('cloudflare/app-observability-worker/wrangler.jsonc')
s = p.read_text()
s = s.replace('"ADMIN_TELEGRAM_ID": "1288379477"', '"ADMIN_TELEGRAM_ID": "1288379477",\n    "CORE_WORKER_URL": "https://alias-spy-games-core.vitaledanilov.workers.dev"', 1)
p.write_text(s)

# Version and artifact names.
p = Path('android-app/app/build.gradle')
s = p.read_text().replace('versionCode 19', 'versionCode 20', 1).replace("versionName '2.6.7-native'", "versionName '2.7.0-native'", 1)
p.write_text(s)

p = Path('.github/workflows/build-android-apk.yml')
s = p.read_text().replace('2.6.7-native', '2.7.0-native')
p.write_text(s)

print('Applied secure Android Telegram code + bearer session authentication')
