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
const cloud = read('android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt');
const sessionStore = read('android-app/app/src/main/java/com/vidalost/biblegames/data/AndroidSessionStore.kt');
const presence = read('android-app/app/src/main/java/com/vidalost/biblegames/data/AppPresenceClient.kt');
const core = read('cloudflare/app-core-worker/src/index-v4.js');
const authStore = read('cloudflare/app-core-worker/src/android-auth-user-store.js');
const observability = read('cloudflare/app-observability-worker/src/index-v3.js');
const gradle = read('android-app/app/build.gradle');

need(app, 'requestLoginCode(id)', 'login does not request a Telegram ownership code');
need(app, 'verifyLoginCode(current, code)', 'login does not verify the Telegram code');
need(app, 'sessionStore.save(id, token, expiresAt)', 'verified bearer is not persisted securely');
need(app, 'AuthSessionInvalid', 'expired/revoked sessions are not handled');
need(app, 'clearVerifiedSession()', 'invalid session does not force a fresh verified login');
need(app, 'TELEGRAM_BOT_USERNAME = "bibleiskie_bot"', 'verification bot link is not explicit');
reject(app, 'ADMIN_ID', 'Android still special-cases the administrator account');
reject(app, 'Вход администратора через Android недоступен', 'Android still blocks the administrator account');
need(main, 'AndroidSessionStore(applicationContext)', 'bearer is not restored before access checks');

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
need(core, "request.headers.get('CF-Connecting-IP')", 'auth request rate limit is not keyed to requester network');
need(core, 'if (begin.existing)', 'retrying a lost code-request response can send a second Telegram code');
reject(core, 'Вход администратора через Android недоступен', 'backend still blocks the administrator account on Android');

need(authStore, 'CREATE TABLE IF NOT EXISTS android_auth_challenges', 'challenge persistence missing');
need(authStore, 'CREATE TABLE IF NOT EXISTS android_sessions', 'session persistence missing');
need(authStore, 'token_hash TEXT PRIMARY KEY', 'raw bearer tokens may be stored server-side');
reject(authStore, 'token TEXT PRIMARY KEY', 'raw bearer token column exists');
need(authStore, 'MAX_CODE_ATTEMPTS = 5', 'code brute-force attempts are not bounded');
need(authStore, 'MAX_CHALLENGES_PER_ID = 3', 'per-account code request rate limit missing');
need(authStore, 'INSERT OR IGNORE INTO android_sessions', 'verification is not idempotent after a lost response');
need(authStore, 'existing: true', 'code request is not idempotent after a lost response');
need(authStore, 'CHALLENGE_VERIFY_GRACE_MS', 'OTP can expire while a verification request is in flight');
need(authStore, 'SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000', 'session expiration missing');

need(presence, '.header("Authorization", "Bearer ${cloud.currentSessionToken()}")', 'presence WebSocket is not authenticated');
reject(presence, 'androidUserId=$userId', 'presence identity is still selected by query parameter');
need(observability, '/android/auth/me', 'presence worker does not resolve bearer identity through core');
need(observability, "headers.set('X-App-User-Id', androidUserId)", 'verified presence identity is not propagated internally');

need(gradle, "versionName '2.7.2-native'", 'secure auth release version is not current');
need(gradle, 'versionCode 22', 'secure auth versionCode is not current');

console.log('Android Telegram ownership + bearer session security checks passed.');
