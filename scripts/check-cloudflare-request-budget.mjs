import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isBundled, scriptSources } from './web-sources.mjs';

const read = (path) => fs.readFileSync(path, 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(`Cloudflare request budget check failed: ${message}`); };

const telemetry = read('web/js/telemetry.js');
const budget = read('web/js/cloudflare-request-budget.js');
const bmt = read('web/js/bmt-stars-cloud-sync.js');
const presence = read('web/js/presence-identity.js');
const androidPresence = read('android-app/app/src/main/java/com/vidalost/biblegames/data/AppPresenceClient.kt');
const warmup = read('web/js/network-warmup.js');
const observabilityV7 = read('cloudflare/app-observability-worker/src/index-v7.js');
const observabilityWrangler = read('cloudflare/app-observability-worker/wrangler.jsonc');
const html = read('index.html');

for (const file of [
  'web/js/telemetry.js',
  'web/js/cloudflare-request-budget.js',
  'web/js/bmt-stars-cloud-sync.js',
  'web/js/presence-identity.js',
  'cloudflare/app-observability-worker/src/index-v7.js',
]) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert(result.status === 0, `${file} syntax check failed: ${result.stderr || result.stdout}`);
}

assert(!telemetry.includes('new WebSocket('), 'legacy telemetry must not own a second presence WebSocket');
assert(!telemetry.includes('/admin/stats'), 'legacy telemetry must not poll administrator statistics');
assert(!telemetry.includes('setInterval('), 'event telemetry must not contain periodic network polling');
assert(telemetry.includes("track('game_open'"), 'event telemetry must keep game-open metrics');
assert(telemetry.includes('window.AppTelemetry = Object.freeze({ track })'), 'event telemetry API must remain available');

for (const required of [
  'adminLive: { freshMs: 15_000',
  'adminStats: { freshMs: 300_000',
  'observerChanged: { freshMs: 8_000',
  'observerUnchanged: { freshMs: 20_000',
  "meta.url.pathname === '/admin/live'",
  "meta.url.pathname === '/admin/stats'",
  '/^\\/admin\\/rooms\\/[A-Z0-9]{4,10}\\/state$/i',
  'if (document.hidden && existing) return responseFrom(existing);',
  'if (inFlight.has',
]) {
  if (required === 'if (inFlight.has') {
    assert(budget.includes('inFlight.get(target.key)'), 'identical polling requests must be coalesced');
  } else {
    assert(budget.includes(required), `request budget missing ${required}`);
  }
}
assert(budget.includes('[204, 205, 304]'), 'cached 304 responses must be recreated without a body');
assert(budget.includes("invalidate('live')"), 'manual/foreground live refresh must invalidate local cache');
assert(isBundled('web/js/cloudflare-request-budget.js'), 'request budget client must be mounted');

assert(bmt.includes('SAFETY_SYNC_INTERVAL_MS = 90_000'), 'BMT safety reconciliation must not run every 12 seconds');
assert(!bmt.includes('SYNC_INTERVAL_MS = 12_000'), 'old BMT 12-second polling must be removed');
assert(bmt.includes("window.addEventListener('app:stars-changed'"), 'BMT mutations must still sync by event');
assert(bmt.includes('!document.hidden && navigator.onLine'), 'BMT safety sync must pause in background/offline');
assert(isBundled('web/js/bmt-stars-cloud-sync.js'), 'BMT request-budget cache key must be fresh');

assert(presence.includes('const HEARTBEAT_MS = 30_000;'), 'Telegram presence heartbeat must be 30 seconds');
assert(presence.includes('Math.min(30_000, 2_500 * (2 ** Math.min(reconnectAttempt, 4)))'), 'Telegram reconnects must use exponential backoff');
assert(isBundled('web/js/presence-identity.js'), 'presence request-budget cache key must be fresh');

assert(androidPresence.includes('private const val HEARTBEAT_MS = 30_000L'), 'Android presence heartbeat must be 30 seconds');
assert(!androidPresence.includes('.put("type", "ping")'), 'Android heartbeat must not send redundant ping plus presence messages');
assert(androidPresence.includes('coerceAtMost(30_000L)'), 'Android reconnect backoff must cap at 30 seconds');

assert(warmup.includes('HEALTH_WARMUP_TTL_MS = 6 * 60 * 60 * 1000'), 'Android Worker health warmup must be throttled to six hours');
assert(isBundled('web/js/network-warmup.js'), 'network warmup cache key must be fresh');

assert(observabilityWrangler.includes('"main": "src/index-v7.js"'), 'Observability must deploy v7');
assert(observabilityV7.includes('const PRESENCE_STALE_MS = 75_000;'), 'server stale window must tolerate the lower heartbeat rate');
assert(observabilityV7.includes("from './index-v6.js'"), 'v7 must preserve secure v6 routes');
assert(isBundled('web/js/telemetry.js'), 'event-only telemetry cache key must be fresh');
assert(html.includes('telegram-desktop-bootstrap-20260828'), 'production build marker must identify the current production bootstrap release');

// Execution order is now the order of scriptSources: the bundle concatenates them
// in exactly that sequence into one classic script.
const appIndex = scriptSources.indexOf('web/js/app.js');
const budgetIndex = scriptSources.indexOf('web/js/cloudflare-request-budget.js');
const telemetryIndex = scriptSources.indexOf('web/js/telemetry.js');
const adminIndex = scriptSources.indexOf('web/js/admin-live-v3.js');
assert(appIndex >= 0 && budgetIndex > appIndex, 'request budget must load after the app/backend bridge is established');
assert(telemetryIndex > budgetIndex && adminIndex > budgetIndex, 'request budget must wrap fetch before telemetry/admin monitoring starts');

console.log('Cloudflare request budget checks passed: duplicate realtime clients removed and periodic Worker traffic is throttled.');
