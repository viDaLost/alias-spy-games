from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one regex match, got {count}")
    return updated


root = Path('.')

# Android app: fast access-first startup and polling that also works while cached-banned.
app_path = root / 'android-app/app/src/main/java/com/vidalost/biblegames/App.kt'
app = app_path.read_text()
app = replace_once(app, 'private const val ACCESS_POLL_MS = 4_000L', 'private const val ACCESS_POLL_MS = 3_000L', 'poll interval')

initial_and_poll_pattern = r'''    LaunchedEffect\(userId, accessRetry\) \{.*?    LaunchedEffect\(userId, accessChecked\) \{.*?\n    \}\n\n    // The web app writes progress immediately\.'''
initial_and_poll_replacement = '''    LaunchedEffect(userId, accessRetry) {
        if (userId.matches(Regex("^[0-9]{5,20}$")) && userId != ADMIN_ID) {
            syncing = true
            accessError = null
            if (!isBanned) accessChecked = false

            cloud.checkAccess(userId)
                .onSuccess { banned ->
                    applyAccessState(banned)
                    if (!banned) {
                        cloud.syncProfile(userId, profile).onSuccess {
                            profile = it
                            saveLocalProfile(context, it)
                            if (it.lastGames.isNotEmpty()) {
                                history = normalizeHistory(history + it.lastGames)
                                prefs.edit().putString(HISTORY_KEY, history.joinToString(",")).apply()
                            }
                        }
                    }
                }
                .onFailure { error ->
                    if (!isBanned) accessChecked = false
                    accessError = error.message ?: "Не удалось быстро проверить доступ"
                }
            syncing = false
        } else {
            accessChecked = false
            accessError = null
        }
    }

    // Poll independently from accessChecked. This is important for a cached
    // banned account: unblocking in the admin panel must restore access without
    // forcing the player to change and re-enter the Telegram ID.
    LaunchedEffect(userId) {
        if (!userId.matches(Regex("^[0-9]{5,20}$")) || userId == ADMIN_ID) return@LaunchedEffect
        delay(ACCESS_POLL_MS)
        while (true) {
            val wasBanned = isBanned
            cloud.checkAccess(userId).onSuccess { banned ->
                applyAccessState(banned)
                if (wasBanned && !banned) {
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
            delay(ACCESS_POLL_MS)
        }
    }

    // The web app writes progress immediately.'''
app = regex_once(app, initial_and_poll_pattern, initial_and_poll_replacement, 'access effects')
app = replace_once(
    app,
    'Text("Обжаловать блокировку можно через техническую поддержку.", color = InkSoft)',
    'Text("Статус проверяется автоматически каждые несколько секунд. После разблокировки доступ восстановится без смены ID. Обжаловать блокировку можно через техническую поддержку.", color = InkSoft)',
    'blocked screen explanation',
)
app_path.write_text(app)

# Android networking: access checks use a short, non-retrying client. A full
# profile sync continues in the background after access is already decided.
cloud_path = root / 'android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt'
cloud = cloud_path.read_text()
client_anchor = '''    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(16, TimeUnit.SECONDS)
        .writeTimeout(16, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()
'''
access_client = client_anchor + '''
    /** Access checks must never hold the first screen behind OkHttp's normal
     * retry/timeout budget. The server action is tiny and safe to repeat on the
     * next poll, so use a strict call deadline and no transparent retry. */
    private val accessClient: OkHttpClient = OkHttpClient.Builder()
        .protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1))
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(3, TimeUnit.SECONDS)
        .writeTimeout(3, TimeUnit.SECONDS)
        .callTimeout(5, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false)
        .build()
'''
cloud = replace_once(cloud, client_anchor, access_client, 'access client insert')
cloud = replace_once(
    cloud,
    '            val json = post("$CORE/android/compat", JSONObject().put("payload", payload).put("androidUserId", id))\n            json.optBoolean("isBanned", false)',
    '            val json = postWith(accessClient, "$CORE/android/compat", JSONObject().put("payload", payload).put("androidUserId", id))\n            json.optBoolean("isBanned", false)',
    'checkAccess client',
)
cloud_path.write_text(cloud)

# Durable Object base routing: add a read-only access status endpoint.
legacy_path = root / 'cloudflare/app-core-worker/src/legacy.js'
legacy = legacy_path.read_text()
legacy = replace_once(
    legacy,
    "    if (url.pathname === '/history' && request.method === 'POST') return json(await this.updateHistory(body));",
    "    if (url.pathname === '/history' && request.method === 'POST') return json(await this.updateHistory(body));\n    if (url.pathname === '/access' && request.method === 'POST') return json(await this.accessStatus(body));",
    'legacy access route',
)
legacy = replace_once(
    legacy,
    '''  async updateHistory({ id, history }) {
    const clean = cleanId(id);
''',
    '''  async accessStatus({ id }) {
    const clean = cleanId(id);
    if (!clean) return { ok: false, error: 'Bad user id' };
    const record = await this.ctx.storage.get(userKey(clean));
    return { ok: true, isBanned: Boolean(record?.isBanned), exists: Boolean(record) };
  }

  async updateHistory({ id, history }) {
    const clean = cleanId(id);
''',
    'legacy access method',
)
legacy_path.write_text(legacy)

# SQL store: access status is one read-only primary-key query, no profile merge,
# no write, and no lastSeen update.
sql_path = root / 'cloudflare/app-core-worker/src/sql-user-store.js'
sql = sql_path.read_text()
sql = replace_once(
    sql,
    '''  async updateHistory({ id, history }) {
    await this.ensureMigrated();
''',
    '''  async accessStatus({ id }) {
    await this.ensureMigrated();
    const clean = cleanId(id);
    if (!clean) return { ok: false, error: 'Bad user id' };
    const row = this.getRow(clean);
    return { ok: true, isBanned: Boolean(row?.is_banned), exists: Boolean(row) };
  }

  async updateHistory({ id, history }) {
    await this.ensureMigrated();
''',
    'sql access method',
)
sql_path.write_text(sql)

# Core Android route: use the read-only access query rather than /sync. This
# avoids an unnecessary SQL upsert on every 3-second access poll.
core_path = root / 'cloudflare/app-core-worker/src/index-v4.js'
core = core_path.read_text()
core = replace_once(
    core,
    '''      const access = await callStore(store, '/sync', {
        verifiedUser: syntheticUser,
        clientUser: { id: androidUserId },
      });
      const isBanned = Boolean(access.user?.isBanned);
''',
    '''      const access = await callStore(store, '/access', { id: androidUserId });
      const isBanned = Boolean(access.isBanned);
''',
    'core access lookup',
)
core = replace_once(
    core,
    '        if (isBanned) return json(syncResponse(access.user), 200, cors);',
    "        if (isBanned) return json({ success: true, isBanned: true, source: 'cloudflare-sql-android-access' }, 200, cors);",
    'banned sync response',
)
core_path.write_text(core)

# Version bump.
gradle_path = root / 'android-app/app/build.gradle'
gradle = gradle_path.read_text()
gradle = replace_once(gradle, '        versionCode 17', '        versionCode 18', 'versionCode')
gradle = replace_once(gradle, "        versionName '2.6.5-native'", "        versionName '2.6.6-native'", 'versionName')
gradle_path.write_text(gradle)

workflow_path = root / '.github/workflows/build-android-apk.yml'
workflow = workflow_path.read_text().replace('2.6.5-native', '2.6.6-native')
if workflow == workflow_path.read_text():
    raise SystemExit('build workflow version: no replacement')
workflow_path.write_text(workflow)

support_check_path = root / 'scripts/check-support-center.mjs'
support_check = support_check_path.read_text()
support_check = replace_once(support_check, "versionName '2.6.5-native'", "versionName '2.6.6-native'", 'support check version')
support_check_path.write_text(support_check)

ban_check_path = root / 'scripts/check-android-ban-enforcement.mjs'
ban_check = '''import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const need = (text, needle, label) => { if (!text.includes(needle)) throw new Error(`Ban enforcement check failed: ${label}`); };
const reject = (text, needle, label) => { if (text.includes(needle)) throw new Error(`Ban enforcement check failed: ${label}`); };

const app = read('android-app/app/src/main/java/com/vidalost/biblegames/App.kt');
const cloud = read('android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt');
const core = read('cloudflare/app-core-worker/src/index-v4.js');
const legacy = read('cloudflare/app-core-worker/src/legacy.js');
const sql = read('cloudflare/app-core-worker/src/sql-user-store.js');
const gradle = read('android-app/app/build.gradle');

need(app, 'ACCESS_POLL_MS = 3_000L', 'Android does not poll account status quickly');
need(app, 'LaunchedEffect(userId) {', 'access polling still depends on accessChecked');
need(app, 'cloud.checkAccess(userId)', 'initial fast access check missing');
need(app, 'if (!accessChecked || isBanned) return', 'game launch is not gated by verified access');
need(app, 'AccessVerificationScreen(', 'initial access verification screen missing');
need(app, 'targetState = Triple(userId.isNotBlank(), currentGame, isBanned)', 'root navigation does not use live ban state');
reject(app, 'LaunchedEffect(userId, accessChecked)', 'cached banned users cannot recover automatically');
need(cloud, 'callTimeout(5, TimeUnit.SECONDS)', 'fast access call deadline missing');
need(cloud, 'retryOnConnectionFailure(false)', 'access check can still retry for tens of seconds');
need(cloud, 'postWith(accessClient, "$CORE/android/compat"', 'accessStatus does not use the fast client');
need(core, "callStore(store, '/access', { id: androidUserId })", 'backend accessStatus still performs a profile sync');
need(core, "if (isBanned) throw httpError(403, 'Доступ ограничен');", 'backend does not reject banned writes');
need(legacy, "url.pathname === '/access'", 'Durable Object access route missing');
need(sql, 'async accessStatus({ id })', 'SQL read-only access query missing');
need(sql, 'Boolean(row?.is_banned)', 'SQL access query does not read ban state');
need(gradle, "versionName '2.6.6-native'", 'Android version was not bumped');

console.log('Android fast access and ban refresh checks passed.');
'''
ban_check_path.write_text(ban_check)

print('Applied Android fast access / auto-unban patch')
