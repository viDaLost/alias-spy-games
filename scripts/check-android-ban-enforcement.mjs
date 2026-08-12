import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const need = (text, needle, label) => { if (!text.includes(needle)) throw new Error(`Ban enforcement check failed: ${label}`); };
const reject = (text, needle, label) => { if (text.includes(needle)) throw new Error(`Ban enforcement check failed: ${label}`); };

const app = read('android-app/app/src/main/java/com/vidalost/biblegames/App.kt');
const cloud = read('android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt');
const core = read('cloudflare/app-core-worker/src/index-v4.js');
const authStore = read('cloudflare/app-core-worker/src/android-auth-user-store.js');
const legacy = read('cloudflare/app-core-worker/src/legacy.js');
const sql = read('cloudflare/app-core-worker/src/sql-user-store.js');
const gradle = read('android-app/app/build.gradle');

need(app, 'ACCESS_POLL_MS = 3_000L', 'Android does not poll account status quickly');
need(app, 'LaunchedEffect(userId) {', 'access polling still depends on accessChecked');
need(app, 'delay(if (result.isSuccess) ACCESS_POLL_MS else ACCESS_RETRY_MS)', 'automatic access retry loop missing');
need(app, 'if (!accessChecked) {', 'game launch is not gated by verified access');
reject(app, 'if (userId.isNotBlank() && !accessChecked && !isBanned)', 'startup still blocks on verification screen');
need(app, 'targetState = Triple(userId.isNotBlank(), currentGame, isBanned)', 'root navigation does not use live ban state');
reject(app, 'LaunchedEffect(userId, accessChecked)', 'cached banned users cannot recover automatically');
need(cloud, 'callTimeout(11, TimeUnit.SECONDS)', 'bounded primary access deadline missing');
need(cloud, 'accessFallbackClient', 'fallback access transport missing');
need(cloud, 'protocols(listOf(Protocol.HTTP_1_1))', 'access transport is not VPN-friendly HTTP/1.1');
need(cloud, '.url("$CORE/android/access")', 'dedicated GET access endpoint missing');
reject(cloud, 'android/access?id=', 'client still sends an untrusted Telegram ID to access endpoint');
need(cloud, '.header("Authorization", "Bearer $token")', 'access request is not authenticated with bearer session');
need(core, "url.pathname === '/android/access'", 'dedicated Android access route missing');
need(core, 'requireAndroidSession(request, env)', 'backend does not require verified Android session');
need(core, "callStore(store, '/access', { id: session.userId })", 'backend access route does not derive ID from the session');
need(core, "if (isBanned) throw httpError(403, 'Доступ ограничен');", 'backend does not reject banned writes');
need(authStore, 'CREATE TABLE IF NOT EXISTS android_sessions', 'durable Android session storage missing');
need(authStore, 'MAX_CODE_ATTEMPTS = 5', 'verification code brute-force limit missing');
need(authStore, 'MAX_CHALLENGES_PER_ID = 3', 'verification request rate limit missing');
need(legacy, "url.pathname === '/access'", 'Durable Object access route missing');
need(sql, 'async accessStatus({ id })', 'SQL read-only access query missing');
need(sql, 'Boolean(row?.is_banned)', 'SQL access query does not read ban state');
need(gradle, "versionName '2.7.1-native'", 'Android version was not bumped');

console.log('Android verified-session access and ban refresh checks passed.');
