import fs from 'node:fs';

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
