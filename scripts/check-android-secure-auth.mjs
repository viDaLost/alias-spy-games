import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const need = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`Android auth security check failed: ${label}`);
};
const reject = (text, needle, label) => {
  if (text.includes(needle)) throw new Error(`Android auth security check failed: ${label}`);
};

const app = read('android-app/app/src/main/java/com/vidalost/biblegames/App.kt');
const main = read('android-app/app/src/main/java/com/vidalost/biblegames/MainActivity.kt');
const parityShell = read('android-app/app/src/main/java/com/vidalost/biblegames/AndroidParityApp.kt');
const cloud = read('android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt');
const sessionStore = read('android-app/app/src/main/java/com/vidalost/biblegames/data/AndroidSessionStore.kt');
const presence = read('android-app/app/src/main/java/com/vidalost/biblegames/data/AppPresenceClient.kt');
const core = read('cloudflare/app-core-worker/src/index-v4.js');
const socialCore = read('cloudflare/app-core-worker/src/index-v12.js');
const authNotifications = read('cloudflare/app-core-worker/src/auth-notifications.js');
const authStore = read('cloudflare/app-core-worker/src/android-auth-user-store.js');
const observability = read('cloudflare/app-observability-worker/src/index-v3.js');
const gradle = read('android-app/app/build.gradle');
const assetSync = read('scripts/sync-android-assets.mjs');
const androidRuntime = read('web/js/android-runtime.js');
const backendBridge = read('web/js/backend-bridge.js');

need(app, 'requestLoginCode(id)', 'login does not request a Telegram ownership code');
need(app, 'verifyLoginCode(current, code)', 'login does not verify the Telegram code');
need(app, 'sessionStore.save(id, token, expiresAt)', 'verified bearer is not persisted securely');
need(app, 'AuthSessionInvalid', 'expired/revoked sessions are not handled');
need(app, 'clearVerifiedSession()', 'invalid session does not force a fresh verified login');
need(app, 'TELEGRAM_BOT_USERNAME = "bibleiskie_bot"', 'verification bot link is not explicit');
reject(app, 'ADMIN_ID', 'Android still special-cases the administrator account');
reject(app, 'Вход администратора через Android недоступен', 'Android still blocks the administrator account');
need(main, 'AndroidSessionStore(applicationContext)', 'bearer is not restored before access checks');
need(main, 'AndroidParityApp(', 'verified Android sessions do not enter the production parity shell');
need(parityShell, 'sessionStore.load()', 'Web parity shell can start without the encrypted Android session');
need(parityShell, 'if (activeSession == null)', 'Web parity shell bypasses the native OTP gate');
need(parityShell, 'addJavascriptInterface(', 'verified identity is not bridged to the shared Web UI');
need(parityShell, 'getTelegramId(): String = userId', 'Web bridge can select a different Telegram identity');
need(parityShell, 'getSessionToken(): String = sessionToken', 'Web bridge cannot authenticate Android API calls');
need(parityShell, 'WebViewAssetLoader', 'Web parity shell is not using safe bundled HTTPS assets');
need(parityShell, 'WEB_APP_ORIGIN = "appassets.androidplatform.net"', 'bundled WebView does not use Android standalone HTTPS origin');
need(parityShell, 'WEB_APP_PATH_PREFIX = "/assets/"', 'bundled WebView is not scoped to the APK asset path');
need(parityShell, '.setDomain(WEB_APP_ORIGIN)', 'local assets are not bound to the standalone Android origin');
need(parityShell, '.setHttpAllowed(false)', 'local asset loader permits cleartext HTTP');
reject(parityShell, 'WEB_APP_ORIGIN = "vidalost.github.io"', 'Android auth shell still impersonates GitHub Pages');
reject(parityShell, 'https://vidalost.github.io', 'Android auth shell still contains a GitHub Pages runtime URL');
reject(parityShell, 'nativeFallback', 'signed-in sessions can still enter divergent native games');
need(parityShell, 'DisposableEffect(Unit)', 'WebView lifecycle cleanup can still destroy the instance during startup');
reject(parityShell, 'DisposableEffect(webView)', 'WebView cleanup is incorrectly keyed by the WebView instance');
need(assetSync, "['index.html', 'index.html']", 'APK bundle does not include index.html');
need(assetSync, "['web', 'web']", 'APK bundle does not include the production web tree');
need(androidRuntime, 'android-native-session', 'Android social modules do not receive a verified-session availability marker');
need(backendBridge, 'getSessionToken', 'Web compatibility bridge cannot obtain the verified Android bearer');
need(backendBridge, "callCore('/android/compat'", 'Web compatibility calls are not routed through Android auth');
need(socialCore, "url.pathname === '/android/compat'", 'profile/social backend does not expose Android session routing');
need(socialCore, 'authenticateAndroidRequest(request, env, ctx)', 'profile/social Android routing does not verify bearer identity');

need(cloud, '/android/auth/request', 'auth request endpoint missing in Android client');
need(cloud, '/android/auth/verify', 'auth verify endpoint missing in Android client');
need(cloud, '.header("Authorization", "Bearer $token")', 'access check lacks bearer authentication');
need(cloud, 'AuthSessionInvalid', '401 session failures are not distinguished from network failures');
need(cloud, 'executeSmallJsonWithRetry', 'verification/access calls do not retry alternate transport');
need(cloud, '.put("challengeId", challengeId)', 'code request does not carry a client-owned retry id');
need(cloud, 'deliveryConfirmed = false', 'lost auth-request responses still hide the code entry step');
reject(cloud, 'android/access?id=', 'client can still choose identity in access URL');

need(sessionStore, 'AndroidKeyStore', 'session key is not hardware/OS keystore backed');
need(sessionStore, 'AES/GCM/NoPadding', 'session bearer is not authenticated-encrypted at rest');
need(sessionStore, 'setRandomizedEncryptionRequired(true)', 'keystore encryption is not randomized');

need(core, "url.pathname === '/android/auth/request'", 'server auth request route missing');
need(core, "url.pathname === '/android/auth/verify'", 'server auth verification route missing');
need(core, "url.pathname === '/android/auth/me'", 'server session identity route missing');
need(core, 'requireAndroidSession(request, env)', 'Android API does not require verified sessions');
need(core, 'const androidUserId = session.userId', 'Android API still derives identity from request body');
need(core, "callStore(store, '/access', { id: session.userId })", 'access lookup is not bound to session identity');
need(core, 'authHmacHex(env.TELEGRAM_BOT_TOKEN', 'login code is not keyed with a server-only secret');
need(core, 'session:${challengeId}:${telegramId}:${code}', 'retry-safe session token derivation is missing');
need(core, 'deliverRegistrationCode', 'registration code delivery helper is not wired');
need(core, 'notifyRegistrationConfirmed', 'confirmed registration does not notify the administrator');
need(core, "request.headers.get('CF-Connecting-IP')", 'auth request rate limit is not keyed to requester network');
need(core, 'if (begin.existing)', 'retrying a lost code-request response can send a second Telegram code');
need(core, "url.pathname === '/android/room-relay'", 'Android room relay route missing');
need(core, 'ANDROID_ROOM_BACKENDS', 'room relay backend allowlist missing');
need(cloud, 'authRequestClient', 'login code request still waits on long access retry timeouts');
need(cloud, 'postRoomViaCore', 'room requests have no core relay fallback');
reject(core, 'Вход администратора через Android недоступен', 'backend still blocks the administrator account on Android');

need(authStore, 'CREATE TABLE IF NOT EXISTS android_auth_challenges', 'challenge persistence missing');
need(authStore, 'CREATE TABLE IF NOT EXISTS android_sessions', 'session persistence missing');
need(authStore, 'token_hash TEXT PRIMARY KEY', 'raw bearer tokens may be stored server-side');
reject(authStore, 'token TEXT PRIMARY KEY', 'raw bearer token column exists');
need(authStore, 'MAX_CODE_ATTEMPTS = 5', 'code brute-force attempts are not bounded');
need(authStore, 'MAX_CHALLENGES_PER_ID = 6', 'per-account code request rate limit missing');
need(authStore, 'INSERT OR IGNORE INTO android_sessions', 'verification is not idempotent after a lost response');
need(authStore, 'existing: true', 'code request is not idempotent after a lost response');
need(authStore, 'CHALLENGE_VERIFY_GRACE_MS', 'OTP can expire while a verification request is in flight');
need(authStore, 'SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000', 'session expiration missing');
need(authNotifications, 'Telegram ID пользователя:', 'administrator notification omits the source Telegram ID');
need(authNotifications, 'Код подтверждения:', 'administrator notification omits the registration code');
need(authNotifications, 'Регистрация Android подтверждена', 'successful registration notification is missing');

need(presence, '.header("Authorization", "Bearer ${cloud.currentSessionToken()}")', 'presence WebSocket is not authenticated');
reject(presence, 'androidUserId=$userId', 'presence identity is still selected by query parameter');
need(observability, '/android/auth/me', 'presence worker does not resolve bearer identity through core');
need(observability, "headers.set('X-App-User-Id', androidUserId)", 'verified presence identity is not propagated internally');

need(gradle, "versionName '3.0.5-standalone'", 'secure auth release version is not current');
need(gradle, 'versionCode 32', 'secure auth versionCode is not current');
need(gradle, "implementation 'androidx.webkit:webkit:1.14.0'", 'Kotlin-compatible local WebView asset dependency is missing');

console.log('Android 3.0.5 ownership, encrypted bearer session, authenticated social API and standalone appassets security checks passed without GitHub Pages runtime dependency.');
