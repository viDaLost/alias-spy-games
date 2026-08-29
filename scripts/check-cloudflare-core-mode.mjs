import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { throw new Error(message); };

const html = read('index.html');
const bridge = read('web/js/backend-bridge.js');
const socialEntryWorker = read('cloudflare/app-core-worker/src/index-v12.js');
const profileEntryWorker = read('cloudflare/app-core-worker/src/index-v11.js');
const richEntryWorker = read('cloudflare/app-core-worker/src/index-v10.js');
const secureEntryWorker = read('cloudflare/app-core-worker/src/index-v9.js');
const balanceEntryWorker = read('cloudflare/app-core-worker/src/index-v8.js');
const entryWorker = read('cloudflare/app-core-worker/src/index-v7.js');
const retentionEntryWorker = read('cloudflare/app-core-worker/src/index-v6.js');
const supportEntryWorker = read('cloudflare/app-core-worker/src/index-v5.js');
const worker = read('cloudflare/app-core-worker/src/index-v4.js');
const baseWorker = read('cloudflare/app-core-worker/src/index-v3.js');
const sqlStore = read('cloudflare/app-core-worker/src/sql-user-store.js');
const broadcastStore = read('cloudflare/app-core-worker/src/broadcast-user-store.js');
const wrangler = read('cloudflare/app-core-worker/wrangler.jsonc');

if (html.includes('admin-sheet-import')) fail('Google Sheets import UI must not be connected in production.');
if (/script\.google\.com|script\.googleusercontent\.com|googleusercontent\.com/.test(html)) {
  fail('Frontend CSP must not allow direct Google/Apps Script data requests.');
}

if (!bridge.includes('legacyFallbackEnabled: false')) fail('Core bridge must explicitly disable legacy fallback.');
if (!bridge.includes("source: 'cloudflare'")) fail('Core bridge must identify Cloudflare as canonical source.');
if (!html.includes('web/js/backend-bridge.js?v=5')) fail('Admin-safe timeout bridge must be cache-busted in the production HTML.');
for (const required of [
  'ACCESS_TIMEOUT_MS = 5000',
  'DEFAULT_TIMEOUT_MS = 20000',
  'FAILURE_COOLDOWN_MS = 30000',
  "const isAccessCheck = action === 'syncUser'",
  'useFailureCooldown: isAccessCheck',
  'response.status >= 500',
  'response.status === 429',
  'AbortController',
  'Promise.race([request, timeout])',
  'continuing with local app state',
]) {
  if (!bridge.includes(required)) fail(`Core bridge timeout policy is incomplete: ${required}`);
}
if (bridge.includes('coreHealthy = response.ok')) {
  fail('HTTP 4xx responses must not put the whole Core bridge into failure cooldown.');
}

if (!wrangler.includes('"main": "src/index-v12.js"')) fail('Core Worker must use the v12 public social/invite production entrypoint.');
if (!socialEntryWorker.includes("from './index-v11.js'")) fail('v12 entrypoint must preserve the validated v11 profile runtime.');
for (const required of [
  "'profileBootstrap'",
  "'profileSearch'",
  "'profileAddFriend'",
  "'profileRemoveFriend'",
  "'profileSetFavorites'",
  "'profileTrackGame'",
  "'profileInviteFriend'",
  'INVITABLE_GAMES',
  'telegramSendInvite',
  'search.user.isFriend !== true',
  'join_${config.startKey}_${room}',
]) {
  if (!socialEntryWorker.includes(required)) fail(`v12 public social/invite runtime is incomplete: ${required}`);
}
if (socialEntryWorker.includes('Profile beta is admin only')) fail('v12 public social runtime must not retain the admin-only profile gate.');

if (!profileEntryWorker.includes("from './index-v10.js'")) fail('v11 entrypoint must preserve the validated v10 rich-message runtime.');
for (const required of [
  'CREATE TABLE IF NOT EXISTS player_profiles',
  'CREATE TABLE IF NOT EXISTS player_friends',
  "'profileBootstrap'",
  "'profileSearch'",
  "'profileAddFriend'",
  "'profileRemoveFriend'",
  "'profileSetFavorites'",
  "'profileTrackGame'",
  "url.pathname === '/telegram/webhook'",
  'tryHandleIdCommand',
]) {
  if (!profileEntryWorker.includes(required)) fail(`v11 profile storage/runtime is incomplete: ${required}`);
}
if (!richEntryWorker.includes("from './index-v9.js'")) fail('v10 entrypoint must preserve the hardened v9 runtime.');
if (!richEntryWorker.includes("telegramApi(env, 'sendRichMessage'")) fail('v10 entrypoint must send Telegram Rich Messages.');
if (!richEntryWorker.includes("callback_data: 'support:start'")) fail('v10 Rich Message must preserve the support callback route.');
if (!richEntryWorker.includes('url: miniAppUrl')) fail('v10 Rich Message must launch the Main Mini App through a valid URL button.');
if (richEntryWorker.includes('web_app: { url: miniAppUrl }')) fail('Telegram t.me deep links must not be passed as WebAppInfo URLs.');
if (!secureEntryWorker.includes("from './index-v8.js'")) fail('v9 entrypoint must preserve the v8 balance/admin runtime.');
if (!balanceEntryWorker.includes("from './index-v7.js'")) fail('v8 entrypoint must preserve the v7 invite runtime.');
if (!entryWorker.includes("from './index-v6.js'")) fail('v7 entrypoint must preserve the v6 retention runtime.');
if (!retentionEntryWorker.includes("from './index-v5.js'")) fail('Retention entrypoint must preserve the validated v5 support runtime.');
if (!supportEntryWorker.includes("from './index-v4.js'")) fail('Support entrypoint must preserve the validated v4 core runtime.');
if (!supportEntryWorker.includes("'/telegram/webhook'")) fail('Production runtime must expose the Telegram support webhook.');
if (!entryWorker.includes("'/telegram/miniapp-config'")) fail('Production runtime must expose Telegram Mini App invite config.');
for (const required of ["'/web/session'", "'/web/session/verify'", 'mutateBmtStars', "url.pathname === '/android/compat'", 'expectedRevision']) {
  if (!secureEntryWorker.includes(required)) fail(`Hardened Core runtime is incomplete: ${required}`);
}
if (wrangler.includes('BROADCAST_GAS_URL') || wrangler.includes('LEGACY_GAS_URL')) {
  fail('Apps Script backend variables must not be active in production.');
}
if (baseWorker.includes('BROADCAST_GAS_URL') || baseWorker.includes("action === 'broadcast'")) {
  fail('Base Core Worker must not retain an Apps Script broadcast fallback.');
}

for (const forbidden of ['importGoogleSheet', 'docs.google.com', 'mirrorLegacy(', 'callLegacy(']) {
  if ([socialEntryWorker, profileEntryWorker, richEntryWorker, secureEntryWorker, balanceEntryWorker, entryWorker, retentionEntryWorker, supportEntryWorker, worker, baseWorker].some((source) => source.includes(forbidden))) {
    fail(`Cloudflare-only Worker still contains forbidden runtime dependency: ${forbidden}`);
  }
}
if (!baseWorker.includes("from './sql-user-store.js'")) fail('Core Worker must use the SQL-backed UserStore.');
if (!worker.includes("'/android/compat'")) fail('Android compatibility route is missing from the production entrypoint.');
if (!worker.includes("source: 'cloudflare-sql-android'")) fail('Android route must write to Cloudflare SQL.');
if (!worker.includes("'/broadcast/upload'")) fail('Cloudflare media upload route is missing.');
if (!worker.includes('broadcastCreate') || !worker.includes('broadcastHistory')) fail('Cloudflare broadcast admin routes are missing.');
if (!worker.includes('api.telegram.org')) fail('Broadcast media upload must use Telegram Bot API directly.');

if (!sqlStore.includes('CREATE TABLE IF NOT EXISTS users')) fail('SQL users table is missing.');
if (!sqlStore.includes('telegram_id TEXT PRIMARY KEY')) fail('SQL users table must use Telegram ID as text primary key.');
if (!sqlStore.includes("this.ctx.storage.list({ prefix: 'user:' })")) fail('KV-to-SQL migration source/backup is missing.');
if (!sqlStore.includes('kvBackupRetained: true')) fail('Migration must explicitly retain the legacy KV backup.');
if (sqlStore.includes("this.ctx.storage.delete('user:") || sqlStore.includes('deleteAll()')) {
  fail('SQL migration must not delete the legacy user backup.');
}

for (const required of [
  'CREATE TABLE IF NOT EXISTS broadcast_jobs',
  'CREATE TABLE IF NOT EXISTS broadcast_recipients',
  'async alarm()',
  'sendTelegram(',
  'broadcastHistory()',
  'repeatBroadcast(',
]) {
  if (!broadcastStore.includes(required)) fail(`Cloudflare broadcast engine is incomplete: ${required}`);
}
if (broadcastStore.includes('script.google.com')) fail('Broadcast engine must not call Apps Script.');

console.log('OK: Core v12 exposes authenticated social profiles and direct friend room invites while preserving v11 profile storage, v10 rich messaging, Cloudflare-only SQL and direct Telegram delivery.');
