import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => { throw new Error(message); };

const html = read('index.html');
const bridge = read('backend-bridge.js');
const worker = read('cloudflare/app-core-worker/src/index-v3.js');
const sqlStore = read('cloudflare/app-core-worker/src/sql-user-store.js');
const wrangler = read('cloudflare/app-core-worker/wrangler.jsonc');

if (html.includes('admin-sheet-import')) fail('Google Sheets import UI must not be connected in production.');
if (/script\.google\.com|script\.googleusercontent\.com|googleusercontent\.com/.test(html)) {
  fail('Frontend CSP must not allow direct Google/Apps Script data requests.');
}

if (!bridge.includes('legacyFallbackEnabled: false')) fail('Core bridge must explicitly disable legacy fallback.');
if (!bridge.includes("source: 'cloudflare'")) fail('Core bridge must identify Cloudflare as canonical source.');

if (!wrangler.includes('"main": "src/index-v3.js"')) fail('Core Worker must use the Cloudflare-only entrypoint.');
if (!wrangler.includes('"BROADCAST_GAS_URL"')) fail('Apps Script URL may exist only as the broadcast backend.');
if (wrangler.includes('LEGACY_GAS_URL')) fail('Legacy data backend variable must not be active.');

for (const forbidden of ['importGoogleSheet', 'docs.google.com', 'mirrorLegacy(', 'callLegacy(']) {
  if (worker.includes(forbidden)) fail(`Cloudflare-only Worker still contains forbidden runtime dependency: ${forbidden}`);
}
if (!worker.includes("action === 'broadcast'")) fail('Broadcast route is missing.');
if (!worker.includes('BROADCAST_GAS_URL')) fail('Broadcast is not isolated to the dedicated Apps Script backend.');
if (!worker.includes("from './sql-user-store.js'")) fail('Core Worker must use the SQL-backed UserStore.');

if (!sqlStore.includes('CREATE TABLE IF NOT EXISTS users')) fail('SQL users table is missing.');
if (!sqlStore.includes('telegram_id TEXT PRIMARY KEY')) fail('SQL users table must use Telegram ID as text primary key.');
if (!sqlStore.includes("this.ctx.storage.list({ prefix: 'user:' })")) fail('KV-to-SQL migration source/backup is missing.');
if (!sqlStore.includes('kvBackupRetained: true')) fail('Migration must explicitly retain the legacy KV backup.');
if (sqlStore.includes("this.ctx.storage.delete('user:") || sqlStore.includes('deleteAll()')) {
  fail('SQL migration must not delete the legacy user backup.');
}

console.log('OK: user/admin data is Cloudflare SQL; KV backup is retained; Apps Script is isolated to broadcast.');
