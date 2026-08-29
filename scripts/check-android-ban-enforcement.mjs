import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const need = (text, needle, label) => { if (!text.includes(needle)) throw new Error(`Ban enforcement check failed: ${label}`); };
const reject = (text, needle, label) => { if (text.includes(needle)) throw new Error(`Ban enforcement check failed: ${label}`); };

const app = read('android-app/app/src/main/java/com/vidalost/biblegames/App.kt');
const parityShell = read('android-app/app/src/main/java/com/vidalost/biblegames/AndroidParityApp.kt');
const cloud = read('android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt');
const core = read('cloudflare/app-core-worker/src/index-v4.js');
const authStore = read('cloudflare/app-core-worker/src/android-auth-user-store.js');
const legacy = read('cloudflare/app-core-worker/src/legacy.js');
const sql = read('cloudflare/app-core-worker/src/sql-user-store.js');
const gradle = read('android-app/app/build.gradle');

// The audited native OTP gate owns verified-session access/ban enforcement.
// After AndroidSessionStore contains a verified encrypted session, 3.0.3 always
// switches to the shared production Web UI and never to divergent native games.
need(app, 'ACCESS_POLL_MS = 3_000L', 'Android does not poll account status quickly');
need(app, 'LaunchedEffect(userId) {', 'access polling still depends on accessChecked');
need(app, 'delay(if (result.isSuccess) ACCESS_POLL_MS else ACCESS_RETRY_MS)', 'automatic access retry loop missing');
need(app, 'if (!accessChecked) {', 'game launch is not gated by verified access');
reject(app, 'if (userId.isNotBlank() && !accessChecked && !isBanned)', 'startup still blocks on verification screen');
need(app, 'targetState = Triple(userId.isNotBlank(), currentGame, isBanned)', 'root navigation does not use live ban state');
reject(app, 'LaunchedEffect(userId, accessChecked)', 'cached banned users cannot recover automatically');
need(parityShell, 'sessionStore.load()', 'Web parity shell can start without an encrypted verified session');
need(parityShell, 'if (activeSession == null)', 'Web parity shell does not retain the native login gate');
need(parityShell, 'BibleGamesApp(assets = assets, cloud = cloud)', 'native verified login gate is missing');
need(parityShell, 'WebViewAssetLoader', 'bundled Web parity shell is missing');
need(parityShell, 'WEB_APP_ORIGIN = "vidalost.github.io"', 'bundled Web UI is not served under the production origin');
need(parityShell, 'getSessionToken(): String = sessionToken', 'Web parity requests cannot use the verified bearer');
reject(parityShell, 'nativeFallback', 'signed-in Android can still switch to divergent native games');
need(parityShell, 'DisposableEffect(Unit)', 'WebView lifecycle can destroy the active instance during startup');
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
need(authStore, 'MAX_CHALLENGES_PER_ID = 6', 'verification request rate limit missing');
need(legacy, "url.pathname === '/access'", 'Durable Object access route missing');
need(sql, 'async accessStatus({ id })', 'SQL read-only access query missing');
need(sql, 'Boolean(row?.is_banned)', 'SQL access query does not read ban state');
need(gradle, 'versionCode 30', 'Android versionCode was not bumped');
need(gradle, "versionName '3.0.3-web-parity'", 'Android version was not bumped');

console.log('Android 3.0.3 verified-session access, production-origin Web parity and ban refresh checks passed.');
