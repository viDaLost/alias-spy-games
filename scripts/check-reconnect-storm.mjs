import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isBundled } from './web-sources.mjs';

const read = (path) => fs.readFileSync(path, 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(`Reconnect storm check failed: ${message}`); };

const presence = read('web/js/presence-identity.js');
const budget = read('web/js/cloudflare-request-budget.js');
const quartet = read('web/games/quartet.js');
const sketch = read('web/games/bible-sketch.js');
const androidRoom = read('android-app/app/src/main/java/com/vidalost/biblegames/data/RealtimeRoomClient.kt');
const errors = read('web/js/error-system.js');
const app = read('web/js/app.js');
const sketchLauncher = read('web/js/bible-sketch-launcher.js');
const html = read('index.html');

for (const file of [
  'web/js/presence-identity.js',
  'web/js/cloudflare-request-budget.js',
  'web/games/quartet.js',
  'web/games/bible-sketch.js',
  'web/js/error-system.js',
]) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert(result.status === 0, `${file} syntax check failed: ${result.stderr || result.stdout}`);
}

assert(presence.includes('if (reconnectTimer || connecting || pageLeaving || document.hidden || !navigator.onLine) return;'), 'presence scheduler must keep an existing exponential-backoff timer');
assert(presence.includes("if (socket?.readyState !== WebSocket.OPEN) {\n      scheduleReconnect();\n      return;\n    }"), 'passive presence checks must schedule rather than connect immediately');
assert(!presence.includes('} else connect();'), 'presence heartbeat must not bypass reconnect backoff');
assert(presence.includes('contextTimer = window.setInterval(() => sendPresence(), CONTEXT_CHECK_MS);'), 'context detector must remain local-only between state changes');

assert(budget.includes('roomJoinMinMs: 30_000'), 'web room joins must have a 30-second automatic reconnect budget');
assert(budget.includes("return { kind: 'roomJoin'"), 'room join requests are not classified by the global budget');
assert(budget.includes("if (document.hidden) return localBackoffResponse('CLIENT_BACKGROUND_PAUSE');"), 'hidden WebView must not send room join reconnects');
assert(budget.includes('lastUserIntentAt'), 'manual room joins must remain responsive while automatic reconnects are throttled');

assert(androidRoom.includes('private const val WS_FALLBACK_GRACE_MS = 3_000L'), 'Android must give WebSocket a grace period before HTTP polling');
assert(androidRoom.includes('private const val POLL_INTERVAL_MS = 5_000L'), 'Android fallback idle poll must be at least five seconds');
assert(androidRoom.includes('private const val POLL_ACTION_GAP_MS = 250L'), 'Android fallback actions must not use the old 90ms loop');
assert(androidRoom.includes('main.postDelayed({'), 'Android fallback must start after the WebSocket grace timer');
assert(!androidRoom.includes('private const val POLL_INTERVAL_MS = 850L'), '850ms Android fallback polling returned');

assert(quartet.includes('document.hidden || reconnectTimer'), 'Quartet reconnect must pause while the Mini App is hidden');
assert(quartet.includes('Math.min(30_000, 2_500 * 2 **'), 'Quartet reconnect backoff must cap at 30 seconds');
assert(sketch.includes('document.hidden || !roomId'), 'Bible Sketch reconnect must pause while the Mini App is hidden');
assert(sketch.includes('Math.min(30_000, 2_500 *'), 'Bible Sketch reconnect backoff must cap at 30 seconds');

assert(errors.includes('setInterval(refreshAdminErrors, 300_000)'), 'error feed must share the five-minute stats cadence');
assert(errors.includes("'X-Telegram-Init-Data': initData"), 'error feed must authenticate in a header');
assert(!errors.includes('/admin/stats?initData='), 'error feed must not expose initData or bypass the GET request budget');
assert(errors.includes('document.hidden'), 'error feed must pause in background');

assert(app.includes('script.src = `${fileName}?v=21`;'), 'dynamic game cache key must expose the patched Quartet source');
assert(sketchLauncher.includes("script.src = 'web/games/bible-sketch.js?v=3';"), 'Bible Sketch patched source cache key is stale');
assert(html.includes('telegram-desktop-bootstrap-20260828'), 'production build marker is stale');
assert(isBundled('web/js/cloudflare-request-budget.js'), 'request budget must ship in the bundle');
assert(isBundled('web/js/presence-identity.js'), 'presence must ship in the bundle');
assert(isBundled('web/js/error-system.js'), 'error-system must ship in the bundle');
assert(isBundled('web/js/app.js'), 'app must ship in the bundle');
assert(isBundled('web/js/bible-sketch-launcher.js'), 'Bible Sketch launcher must ship in the bundle');

console.log('Reconnect-storm guards passed: presence, room reconnects and Android HTTPS fallback are bounded.');
