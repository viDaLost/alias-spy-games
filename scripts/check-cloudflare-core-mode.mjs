import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { throw new Error(message); };

const html = read('index.html');
const bridge = read('backend-bridge.js');
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

if (!wrangler.includes('"main": "src/index-v7.js"')) fail('Core Worker must use the production Cloudflare entrypoint.');
if (!entryWorker.includes("from './index-v6.js'")) fail('Production entrypoint must preserve the v6 retention runtime.');
if (!retentionEntryWorker.includes("from './index-v5.js'")) fail('Retention entrypoint must preserve the validated v5 support runtime.');
if (!supportEntryWorker.includes("from './index-v4.js'")) fail('Support entrypoint must preserve the validated v4 core runtime.');
if (!supportEntryWorker.includes("'/telegram/webhook'")) fail('Production runtime must expose the Telegram support webhook.');
if (!entryWorker.includes("'/telegram/miniapp-config'")) fail('Production runtime must expose Telegram Mini App invite config.');
if (wrangler.includes('BROADCAST_GAS_URL') || wrangler.includes('LEGACY_GAS_URL')) {
  fail('Apps Script backend variables must not be active in production.');
}
if (baseWorker.includes('BROADCAST_GAS_URL') || baseWorker.includes("action === 'broadcast'")) {
  fail('Base Core Worker must not retain an Apps Script broadcast fallback.');
}

for (const forbidden of ['importGoogleSheet', 'docs.google.com', 'mirrorLegacy(', 'callLegacy(']) {
  if (entryWorker.includes(forbidden) || retentionEntryWorker.includes(forbidden) || supportEntryWorker.includes(forbidden) || worker.includes(forbidden) || baseWorker.includes(forbidden)) {
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

console.log('OK: users, admin, support, referral survey, room invites and broadcast are Cloudflare-native; Telegram delivery is direct; KV backup is retained until account-retention cleanup.');
