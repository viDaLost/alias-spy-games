import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (path) => fs.readFileSync(path, 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const includes = (path, value, message) => assert(read(path).includes(value), message || `${path} must include ${value}`);
const excludes = (path, value, message) => assert(!read(path).includes(value), message || `${path} must not include ${value}`);

const files = [
  'web/js/admin-live-v3.js',
  'web/js/cloudflare-request-budget.js',
  'web/js/presence-identity.js',
  'web/js/presence-game-bridge.js',
  'web/js/bmt-stars-cloud-sync.js',
  'cloudflare/app-core-worker/src/index-v12.js',
  'cloudflare/app-core-worker/src/index-v11.js',
  'cloudflare/app-core-worker/src/index-v10.js',
  'cloudflare/app-core-worker/src/index-v9.js',
  'cloudflare/app-observability-worker/src/index-v7.js',
  'cloudflare/quartet-worker/src/index-admin-observer-v2.js',
  'cloudflare/bible-sketch-worker/src/index-admin-observer-v2.js',
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert(result.status === 0, `${file} syntax check failed:\n${result.stderr || result.stdout}`);
}

includes('cloudflare/app-core-worker/wrangler.jsonc', 'src/index-v12.js', 'Core must run v12');
includes('cloudflare/app-core-worker/src/index-v12.js', "from './index-v11.js'", 'Core v12 must preserve v11 profile runtime');
includes('cloudflare/app-core-worker/src/index-v11.js', "from './index-v10.js'", 'Core v11 must preserve hardened v10 runtime');
includes('cloudflare/app-core-worker/src/index-v10.js', "from './index-v9.js'", 'Core v10 must preserve hardened v9 runtime');
includes('cloudflare/app-observability-worker/wrangler.jsonc', 'src/index-v7.js', 'Observability must run optimized v7');
includes('cloudflare/app-observability-worker/src/index-v7.js', "from './index-v6.js'", 'Observability v7 must preserve secure v6 routes');
includes('cloudflare/quartet-worker/wrangler.jsonc', 'index-admin-observer-v2.js', 'Quartet must run secure observer v2');
includes('cloudflare/bible-sketch-worker/wrangler.jsonc', 'index-admin-observer-v2.js', 'Bible Sketch must run secure observer v2');

includes('cloudflare/app-core-worker/src/index-v9.js', "url.pathname === '/web/session'", 'Core must issue scoped web sessions');
includes('cloudflare/app-core-worker/src/index-v9.js', "url.pathname === '/android/compat'", 'Core must support Android BMT sync');
includes('cloudflare/app-core-worker/src/index-v9.js', 'bmt_mutations', 'BMT mutations must be idempotent');
includes('cloudflare/app-core-worker/src/index-v9.js', 'expectedRevision', 'BMT mutations must use optimistic revision checks');
includes('cloudflare/app-core-worker/src/index-v9.js', 'revision = excluded.revision', 'Admin overrides must advance authoritative revision');

excludes('web/js/admin-live-v3.js', '?initData=', 'Admin live must never put Telegram initData in URLs');
includes('web/js/admin-live-v3.js', "headers.set('Authorization'", 'Admin live must use Authorization bearer sessions');
includes('web/js/admin-live-v3.js', 'needed.slice(index, index + 75)', 'Admin profile loading must batch large online lists');
includes('web/js/admin-live-v3.js', 'busyBalances.has(key)', 'Balance buttons must be race guarded');
includes('web/js/admin-live-v3.js', 'data-admin-bmt-input', 'Standard admin user cards must expose BMT balance');
includes('web/js/admin-live-v3.js', "'If-None-Match'", 'Room observer must use conditional polling');
includes('web/js/admin-live-v3.js', 'function runMount()', 'Admin live must have an explicit mount runner');
includes('web/js/admin-live-v3.js', 'if (scheduled) return;', 'Admin live mount scheduling must not be starved by repeated DOM mutations');
includes('web/js/admin-live-v3.js', 'scheduled = setTimeout(runMount, 60);', 'Admin live must mount promptly after the admin shell appears');
excludes('web/js/admin-live-v3.js', 'clearTimeout(scheduled); scheduled = setTimeout', 'Admin live must not endlessly postpone first mount');

includes('web/js/cloudflare-request-budget.js', 'adminLive: { freshMs: 15_000', 'Admin live network calls must be budgeted');
includes('web/js/cloudflare-request-budget.js', 'adminStats: { freshMs: 300_000', 'Historical admin stats must be budgeted');
includes('web/js/cloudflare-request-budget.js', 'observerUnchanged: { freshMs: 20_000', 'Unchanged room observer polling must be budgeted');
includes('web/js/cloudflare-request-budget.js', 'roomJoinMinMs: 30_000', 'Automatic room rejoins must be budgeted');
includes('web/js/cloudflare-request-budget.js', 'if (document.hidden && existing) return responseFrom(existing);', 'Hidden admin screens must reuse local snapshots');

excludes('web/js/presence-identity.js', "searchParams.set('initData'", 'Presence websocket must not expose Telegram initData');
includes('web/js/presence-identity.js', "scope: 'presence'", 'Presence must use a scoped web session');
includes('web/js/presence-identity.js', "localStorage.getItem('quartet_v2_room_id')", 'Presence room context must use explicit game storage state');
includes('web/js/presence-identity.js', 'setGame,', 'Presence must expose explicit game state');
includes('web/js/presence-identity.js', 'sendPresence(true);', 'Presence heartbeat must refresh full game state');
includes('web/js/presence-identity.js', 'if (reconnectTimer || connecting', 'Presence passive timers must not bypass reconnect backoff');
excludes('web/js/presence-identity.js', "socket.send(JSON.stringify({ type: 'ping' }))", 'Presence heartbeat must not keep stale menu state alive');
includes('web/js/presence-game-bridge.js', 'window.showGame = wrappedShowGame;', 'Game navigation must feed presence state');
includes('web/js/presence-game-bridge.js', "wrapMenuFunction('goToMainMenu')", 'Return to menu must clear presence game state');

includes('web/js/bmt-stars-cloud-sync.js', 'mutateBmtStars', 'BMT client must replay delta mutations');
includes('web/js/bmt-stars-cloud-sync.js', 'pendingMutations', 'BMT client must retain offline mutation state');
includes('web/js/bmt-stars-cloud-sync.js', 'expectedRevision', 'BMT client must send revision checks');
includes('web/js/bmt-stars-cloud-sync.js', 'function gameActive()', 'BMT sync must be scoped to the active game');
includes('web/js/bmt-stars-cloud-sync.js', 'SAFETY_SYNC_INTERVAL_MS = 90_000', 'BMT safety sync must be throttled');
includes('web/js/bmt-stars-cloud-sync.js', '!document.hidden && navigator.onLine', 'Background/offline BMT sync must be paused');

includes('cloudflare/quartet-worker/src/index-admin-observer-v2.js', 'SESSION_CACHE_MS', 'Quartet observer must cache admin verification');
includes('cloudflare/bible-sketch-worker/src/index-admin-observer-v2.js', 'SESSION_CACHE_MS', 'Bible Sketch observer must cache admin verification');
includes('cloudflare/quartet-worker/src/index-admin-observer-v2.js', 'If-None-Match', 'Quartet observer must support ETag polling');
includes('cloudflare/bible-sketch-worker/src/index-admin-observer-v2.js', 'If-None-Match', 'Bible Sketch observer must support ETag polling');

includes('web/styles/admin-live-v3.css', 'width:44px;height:44px', 'Admin controls must have mobile touch targets');
includes('web/styles/admin-live-v3.css', 'admin-live-modal-open', 'Admin modals must lock background scrolling');
includes('web/styles/admin-live-compact.css', 'grid-template-columns: repeat(2, minmax(0, 1fr));', 'Online balances must stay in a compact two-column grid');
includes('web/styles/admin-live-compact.css', 'grid-template-columns: 44px minmax(24px, 1fr) 44px;', 'Compact balance controls must preserve 44px touch targets');
includes('index.html', 'admin-live-v3.js?v=7', 'Admin live cache key must remain current');
includes('index.html', 'admin-live-compact.css?v=1', 'Compact admin live stylesheet must be loaded');
includes('index.html', 'telegram-desktop-bootstrap-20260828', 'Build marker must identify the current production bootstrap release');
includes('index.html', 'cloudflare-request-budget.js?v=2', 'Cloudflare request-budget client must be loaded');
includes('index.html', 'presence-identity.js?v=7', 'Presence cache key must be bumped');
includes('index.html', 'presence-game-bridge.js?v=1', 'Presence game bridge must be loaded');
includes('index.html', 'bmt-stars-cloud-sync.js?v=49', 'BMT sync cache key must be bumped');

console.log('Admin live, compact layout, current-game presence, v12 social wrapper and Cloudflare request-budget regression checks passed.');
