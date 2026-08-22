import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (path) => fs.readFileSync(path, 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const includes = (path, value, message) => assert(read(path).includes(value), message || `${path} must include ${value}`);
const excludes = (path, value, message) => assert(!read(path).includes(value), message || `${path} must not include ${value}`);

const files = [
  'web/js/admin-live-v3.js',
  'web/js/presence-identity.js',
  'web/js/bmt-stars-cloud-sync.js',
  'cloudflare/app-core-worker/src/index-v9.js',
  'cloudflare/app-observability-worker/src/index-v6.js',
  'cloudflare/quartet-worker/src/index-admin-observer-v2.js',
  'cloudflare/bible-sketch-worker/src/index-admin-observer-v2.js',
];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert(result.status === 0, `${file} syntax check failed:\n${result.stderr || result.stdout}`);
}

includes('cloudflare/app-core-worker/wrangler.jsonc', 'src/index-v9.js', 'Core must run v9');
includes('cloudflare/app-observability-worker/wrangler.jsonc', 'src/index-v6.js', 'Observability must run v6');
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

excludes('web/js/presence-identity.js', "searchParams.set('initData'", 'Presence websocket must not expose Telegram initData');
includes('web/js/presence-identity.js', "scope: 'presence'", 'Presence must use a scoped web session');
includes('web/js/presence-identity.js', "localStorage.getItem('quartet_v2_room_id')", 'Presence room context must use explicit game storage state');
includes('web/js/presence-identity.js', 'AppPresenceContext', 'Presence must expose an explicit room context API');

includes('web/js/bmt-stars-cloud-sync.js', 'mutateBmtStars', 'BMT client must replay delta mutations');
includes('web/js/bmt-stars-cloud-sync.js', 'pendingMutations', 'BMT client must retain offline mutation state');
includes('web/js/bmt-stars-cloud-sync.js', 'expectedRevision', 'BMT client must send revision checks');
includes('web/js/bmt-stars-cloud-sync.js', 'function gameActive()', 'BMT sync must be scoped to the active game');
includes('web/js/bmt-stars-cloud-sync.js', 'if (force || gameActive()) syncNow()', 'Background pages must not trigger BMT sync traffic');

includes('cloudflare/quartet-worker/src/index-admin-observer-v2.js', 'SESSION_CACHE_MS', 'Quartet observer must cache admin verification');
includes('cloudflare/bible-sketch-worker/src/index-admin-observer-v2.js', 'SESSION_CACHE_MS', 'Bible Sketch observer must cache admin verification');
includes('cloudflare/quartet-worker/src/index-admin-observer-v2.js', 'If-None-Match', 'Quartet observer must support ETag polling');
includes('cloudflare/bible-sketch-worker/src/index-admin-observer-v2.js', 'If-None-Match', 'Bible Sketch observer must support ETag polling');

includes('web/styles/admin-live-v3.css', 'width:44px;height:44px', 'Admin controls must have mobile touch targets');
includes('web/styles/admin-live-v3.css', 'admin-live-modal-open', 'Admin modals must lock background scrolling');
includes('web/styles/admin-live-compact.css', 'grid-template-columns: repeat(2, minmax(0, 1fr));', 'Online balances must stay in a compact two-column grid');
includes('web/styles/admin-live-compact.css', 'grid-template-columns: 44px minmax(24px, 1fr) 44px;', 'Compact balance controls must preserve 44px touch targets');
includes('index.html', 'admin-live-v3.js?v=7', 'Admin live cache key must be bumped');
includes('index.html', 'admin-live-compact.css?v=1', 'Compact admin live stylesheet must be loaded');
includes('index.html', 'admin-shell-v3-20260822-2', 'Admin build marker must identify the instant compact release');
includes('index.html', 'presence-identity.js?v=4', 'Presence cache key must be bumped');
includes('index.html', 'bmt-stars-cloud-sync.js?v=48', 'BMT sync cache key must be bumped');

console.log('Admin live instant-mount and compact-layout regression checks passed.');