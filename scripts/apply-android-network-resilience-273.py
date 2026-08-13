from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


# --- Android transport changes -------------------------------------------------
cloud_path = 'android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt'
cloud = read(cloud_path)

cloud = replace_once(
    cloud,
    '''    /** Access status is a tiny read-only request. HTTP/1.1 is deliberately\n     * used here because some mobile VPN/carrier paths repeatedly stall HTTP/2\n     * setup. The whole call is still bounded so a bad network cannot freeze UI. */\n    private val accessClient: OkHttpClient = OkHttpClient.Builder()''',
    '''    /** Login code delivery must not keep the user on the sending screen while\n     * Telegram has already delivered the OTP. This short HTTP/1.1 request waits\n     * only long enough to surface fast server-side validation errors. If the\n     * response is lost, requestLoginCode returns the locally owned challenge id. */\n    private val authRequestClient: OkHttpClient = OkHttpClient.Builder()\n        .protocols(listOf(Protocol.HTTP_1_1))\n        .connectTimeout(3, TimeUnit.SECONDS)\n        .readTimeout(3, TimeUnit.SECONDS)\n        .writeTimeout(3, TimeUnit.SECONDS)\n        .callTimeout(4, TimeUnit.SECONDS)\n        .retryOnConnectionFailure(true)\n        .build()\n\n    /** Access status is a tiny read-only request. HTTP/1.1 is deliberately\n     * used here because some mobile VPN/carrier paths repeatedly stall HTTP/2\n     * setup. The whole call is still bounded so a bad network cannot freeze UI. */\n    private val accessClient: OkHttpClient = OkHttpClient.Builder()''',
    'insert authRequestClient',
)

start = cloud.index('    suspend fun requestLoginCode')
end = cloud.index('\n    suspend fun verifyLoginCode', start)
request_segment = cloud[start:end]
request_segment = replace_once(
    request_segment,
    '''            val response = executeSmallJsonWithRetry(request)\n            val json = response.json''',
    '''            val response = authRequestClient.newCall(request).execute().use { http ->\n                val payload = http.body?.string().orEmpty()\n                SmallJsonResponse(\n                    status = http.code,\n                    json = runCatching { JSONObject(payload) }.getOrNull(),\n                )\n            }\n            val json = response.json''',
    'use short auth request client',
)
cloud = cloud[:start] + request_segment + cloud[end:]

post_start = cloud.index('    suspend fun postRoom(url: String, body: JSONObject): JSONObject {')
post_end = cloud.index('\n    suspend fun warmRoom', post_start)
cloud = cloud[:post_start] + '''    suspend fun postRoom(url: String, body: JSONObject): JSONObject {\n        var lastFailure: IOException? = null\n        listOf(roomClient, roomFallbackClient).forEachIndexed { attempt, http ->\n            try {\n                return postWith(http, url, body)\n            } catch (cause: IOException) {\n                val retryable = cause !is RoomHttpException || cause.status >= 500\n                if (!retryable) throw cause\n                lastFailure = cause\n                if (attempt == 0) delay(240)\n            }\n        }\n\n        // Some regional mobile/VPN paths return a Cloudflare edge "internal\n        // error; reference=..." for the room Workers even while the same\n        // Workers are healthy from other regions. Relay the final HTTPS retry\n        // through the already-authenticated core Worker, which then reaches the\n        // allowlisted room backend from Cloudflare's network.\n        if (hasSession() && (url.startsWith(QUARTET) || url.startsWith(SKETCH))) {\n            return postRoomViaCore(url, body)\n        }\n        throw lastFailure ?: IOException("Room request failed")\n    }\n\n    private suspend fun postRoomViaCore(url: String, body: JSONObject): JSONObject {\n        val (backendKey, base) = when {\n            url.startsWith(QUARTET) -> "quartet" to QUARTET\n            url.startsWith(SKETCH) -> "sketch" to SKETCH\n            else -> throw IOException("Unsupported room backend")\n        }\n        val path = url.removePrefix(base).ifBlank { "/" }\n        val relayBody = JSONObject()\n            .put("backend", backendKey)\n            .put("path", path)\n            .put("payload", JSONObject(body.toString()))\n        return postWith(accessFallbackClient, "$CORE/android/room-relay", relayBody)\n    }\n''' + cloud[post_end:]

cloud = cloud.replace('BibleGames-Android/2.7.2 Native', 'BibleGames-Android/2.7.3 Native')
write(cloud_path, cloud)

# --- Core Worker: authenticated, allowlisted room relay ------------------------
core_path = 'cloudflare/app-core-worker/src/index-v4.js'
core = read(core_path)
core = replace_once(
    core,
    '''    if (url.pathname === '/android/auth/logout' && request.method === 'POST') {\n      return handleAndroidAuthLogout(request, env, cors);\n    }\n\n    if (url.pathname === '/broadcast/upload') {''',
    '''    if (url.pathname === '/android/auth/logout' && request.method === 'POST') {\n      return handleAndroidAuthLogout(request, env, cors);\n    }\n    if (url.pathname === '/android/room-relay' && request.method === 'POST') {\n      return handleAndroidRoomRelay(request, env, cors);\n    }\n\n    if (url.pathname === '/broadcast/upload') {''',
    'add room relay route',
)

core = replace_once(
    core,
    '''const ANDROID_AUTH_CODE_TTL_MS = 10 * 60 * 1000;\nconst ANDROID_AUTH_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;\n\nasync function handleAndroidAuthRequest(request, env, cors) {''',
    '''const ANDROID_AUTH_CODE_TTL_MS = 10 * 60 * 1000;\nconst ANDROID_AUTH_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;\nconst ANDROID_ROOM_BACKENDS = Object.freeze({\n  quartet: 'https://alias-spy-games-quartet.vitaledanilov.workers.dev',\n  sketch: 'https://alias-spy-games-bible-sketch.vitaledanilov.workers.dev',\n});\n\nasync function handleAndroidRoomRelay(request, env, cors) {\n  try {\n    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');\n    await requireAndroidSession(request, env);\n    const body = await request.json().catch(() => ({}));\n    const backendKey = String(body?.backend || '').trim();\n    const base = ANDROID_ROOM_BACKENDS[backendKey];\n    if (!base) throw httpError(400, 'Unknown room backend');\n\n    const rawPath = String(body?.path || '').trim();\n    const upstreamUrl = new URL(rawPath, `${base}/`);\n    if (upstreamUrl.origin !== new URL(base).origin) throw httpError(400, 'Invalid room target');\n    const allowedPath = upstreamUrl.pathname === '/rooms'\n      || /^\\/rooms\\/[A-Z0-9]{4,10}\\/(?:join|poll)$/i.test(upstreamUrl.pathname);\n    if (!allowedPath) throw httpError(400, 'Invalid room path');\n    const queryKeys = [...upstreamUrl.searchParams.keys()];\n    if (queryKeys.some((key) => key !== 'token')) throw httpError(400, 'Invalid room query');\n    if (upstreamUrl.pathname.endsWith('/poll')) {\n      if (!upstreamUrl.searchParams.get('token')) throw httpError(400, 'Room token missing');\n    } else if (queryKeys.length) {\n      throw httpError(400, 'Unexpected room query');\n    }\n\n    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};\n    const payloadText = JSON.stringify(payload);\n    if (payloadText.length > 512 * 1024) throw httpError(413, 'Room payload too large');\n\n    const upstream = await fetch(upstreamUrl.toString(), {\n      method: 'POST',\n      headers: {\n        'Accept': 'application/json',\n        'Content-Type': 'application/json; charset=utf-8',\n        'Origin': 'https://vidalost.github.io',\n        'Cache-Control': 'no-store',\n        'User-Agent': 'BibleGames-Core-Room-Relay/1',\n      },\n      body: payloadText,\n      redirect: 'error',\n    });\n    const text = await upstream.text();\n    const parsed = (() => { try { return JSON.parse(text); } catch { return null; } })();\n    if (!parsed) {\n      return json({\n        ok: false,\n        success: false,\n        code: 'ROOM_RELAY_UPSTREAM',\n        error: upstream.ok ? 'Сервер комнаты вернул некорректный ответ' : `Сервер комнаты временно недоступен (${upstream.status})`,\n      }, upstream.ok ? 502 : upstream.status, cors);\n    }\n    return json(parsed, upstream.status, { ...cors, 'X-BibleGames-Room-Relay': '1' });\n  } catch (error) {\n    return json({\n      ok: false,\n      success: false,\n      code: error?.code || 'ROOM_RELAY_ERROR',\n      error: String(error?.message || 'Room relay failed'),\n    }, Number(error?.status || 500), cors);\n  }\n}\n\nasync function handleAndroidAuthRequest(request, env, cors) {''',
    'insert room relay handler',
)
write(core_path, core)

# --- Auth request rate limit: tolerate normal retries/testing ------------------
auth_store_path = 'cloudflare/app-core-worker/src/android-auth-user-store.js'
auth_store = read(auth_store_path)
auth_store = replace_once(auth_store, 'const MAX_CHALLENGES_PER_ID = 3;', 'const MAX_CHALLENGES_PER_ID = 6;', 'raise per-id auth request limit')
write(auth_store_path, auth_store)

# --- Release/version checks ----------------------------------------------------
build_path = 'android-app/app/build.gradle'
build = read(build_path)
build = replace_once(build, 'versionCode 22', 'versionCode 23', 'versionCode')
build = replace_once(build, "versionName '2.7.2-native'", "versionName '2.7.3-native'", 'versionName')
write(build_path, build)

for path in ('scripts/check-android-ban-enforcement.mjs', 'scripts/check-support-center.mjs', 'scripts/check-android-secure-auth.mjs'):
    text = read(path)
    text = text.replace("versionName '2.7.2-native'", "versionName '2.7.3-native'")
    text = text.replace('versionCode 22', 'versionCode 23')
    if path.endswith('check-android-ban-enforcement.mjs'):
        text = text.replace('MAX_CHALLENGES_PER_ID = 3', 'MAX_CHALLENGES_PER_ID = 6')
    write(path, text)

secure_path = 'scripts/check-android-secure-auth.mjs'
secure = read(secure_path)
anchor = "need(core, 'if (begin.existing)', 'retrying a lost code-request response can send a second Telegram code');"
if anchor not in secure:
    raise SystemExit('secure auth relay check anchor missing')
secure = secure.replace(
    anchor,
    anchor + "\nneed(core, \"url.pathname === '/android/room-relay'\", 'Android room relay route missing');\nneed(core, 'ANDROID_ROOM_BACKENDS', 'room relay backend allowlist missing');\nneed(cloud, 'authRequestClient', 'login code request still waits on long access retry timeouts');\nneed(cloud, 'postRoomViaCore', 'room requests have no core relay fallback');",
    1,
)
write(secure_path, secure)

workflow_path = '.github/workflows/build-android-apk.yml'
workflow = read(workflow_path).replace('2.7.2-native', '2.7.3-native')
write(workflow_path, workflow)

trigger_path = '.android-release-trigger'
trigger = '''BibleGames Android release trigger\nversion=2.7.3-native\nversionCode=23\nrequested=2026-08-13\nreason=android-fast-auth-and-room-relay\n'''
write(trigger_path, trigger)

print('Android network resilience 2.7.3 patch applied successfully')
