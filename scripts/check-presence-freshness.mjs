import fs from 'node:fs';
import { isBundled } from './web-sources.mjs';
import { coreWorkerHasLayer } from './core-worker-chain.mjs';
const require = (condition, message) => { if (!condition) throw new Error(message); };

const read = (path) => fs.readFileSync(path, 'utf8');
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`Presence check failed: ${label}`);
};
const forbidText = (text, needle, label) => {
  if (text.includes(needle)) throw new Error(`Presence check failed: ${label}`);
};

const worker = read('cloudflare/app-observability-worker/src/index-v4.js');
const secureWorker = read('cloudflare/app-observability-worker/src/index-v6.js');
const optimizedWorker = read('cloudflare/app-observability-worker/src/index-v7.js');
const wrangler = read('cloudflare/app-observability-worker/wrangler.jsonc');
const web = read('web/js/presence-identity.js');
const bridge = read('web/js/presence-game-bridge.js');
const android = read('android-app/app/src/main/java/com/vidalost/biblegames/data/AppPresenceClient.kt');
const admin = read('web/js/admin-live-v3.js');
const rescue = read('web/js/admin-live-rescue.js');
const shell = read('web/js/admin-shell-v3.js');
const html = read('index.html');

requireText(worker, "if (!initData) return jsonError('Verified Telegram session required'", 'legacy Telegram verification guard is missing');
requireText(worker, 'verifyAndroidIdentity', 'verified Android presence path is missing');
requireText(worker, "const ROOM_GAMES = new Set(['quartet', 'bible-sketch'])", 'Bible Sketch room presence is not tracked');
requireText(worker, "payload?.type === 'offline'", 'explicit offline presence message is missing');
requireText(worker, 'const freshestByUser = new Map()', 'online sessions are not deduplicated by verified user');
requireText(worker, 'onlineNow: onlineUsers.length', 'online count is not based on unique verified users');
requireText(worker, 'activeBibleSketchRooms', 'Bible Sketch active room count is missing');
requireText(optimizedWorker, 'const PRESENCE_STALE_MS = 75_000;', 'optimized stale window must tolerate 30-second heartbeats');
requireText(optimizedWorker, 'strictPresenceWindowMs: PRESENCE_STALE_MS', 'admin does not receive optimized presence freshness window');
requireText(optimizedWorker, "from './index-v6.js'", 'optimized observability entrypoint must preserve secure v6 routes');
requireText(wrangler, 'src/index-v7.js', 'optimized observability entrypoint is not active');
requireText(secureWorker, "verifyScopedSession(env, String(url.searchParams.get('token') || ''), 'presence')", 'scoped web presence session is missing');
requireText(secureWorker, 'await verifyAdminRequest(request, env)', 'rollout-safe admin verification is missing');
requireText(secureWorker, "return verifyScopedSession(env, token, 'admin')", 'scoped admin bearer session is missing');
requireText(secureWorker, "request.headers.get('X-Telegram-Init-Data')", 'rollout-safe admin header verification is missing');

requireText(web, 'const HEARTBEAT_MS = 30_000;', 'WebApp heartbeat must use the optimized 30-second interval');
requireText(web, "scope: 'presence'", 'WebApp does not obtain a scoped presence session');
requireText(web, "url.searchParams.set('token', token)", 'WebApp does not connect with the scoped presence token');
forbidText(web, "url.searchParams.set('initData'", 'Telegram initData must not be exposed in the presence WebSocket URL');
requireText(web, "localStorage.getItem('bible_sketch_room_id_v1')", 'WebApp does not report Bible Sketch room state');
requireText(web, 'setGame,', 'presence context must expose an explicit game setter');
requireText(web, 'clearGame,', 'presence context must expose an explicit game clearer');
requireText(web, 'sendPresence(true);', 'presence heartbeat must send complete state instead of only a stale ping');
forbidText(web, "socket.send(JSON.stringify({ type: 'ping' }))", 'Web heartbeat must not preserve stale game state with ping-only refreshes');
requireText(web, 'Math.min(30_000, 2_500 * (2 ** Math.min(reconnectAttempt, 4)))', 'Web presence reconnects must back off under failure');
requireText(web, "window.addEventListener('app:game-presence'", 'presence must accept explicit game navigation events');
requireText(web, 'snapshot()', 'presence context must expose a debuggable state snapshot');
requireText(web, "type: 'offline'", 'WebApp does not explicitly report offline state');
requireText(web, "document.addEventListener('visibilitychange'", 'WebApp visibility tracking is missing');
requireText(web, "sendOfflineAndClose('hidden')", 'hidden WebApp remains online');

requireText(bridge, 'window.showGame = wrappedShowGame;', 'game bridge must wrap the common game launcher');
requireText(bridge, "wrapMenuFunction('goToMainMenu')", 'game bridge must clear presence on return to menu');
requireText(bridge, "document.body?.dataset?.currentGame", 'game bridge must use the canonical body game marker');
requireText(bridge, "window.AppPresenceContext?.setGame?.", 'game bridge must push game state into presence');
requireText(bridge, "window.AppPresenceContext?.clearGame?.", 'game bridge must clear game state in presence');

requireText(android, 'private const val HEARTBEAT_MS = 30_000L', 'Android heartbeat must use the optimized 30-second interval');
requireText(android, 'game == "quartet" || game == "bible-sketch"', 'Android does not report Bible Sketch rooms');
requireText(android, '.put("type", "offline")', 'Android does not explicitly report background/offline state');
forbidText(android, '.put("type", "ping")', 'Android must not send redundant ping plus presence heartbeat messages');
requireText(android, 'coerceAtMost(30_000L)', 'Android reconnects must back off under failure');

requireText(admin, '5_000', 'admin UI timer cadence changed unexpectedly');
requireText(admin, 'user.roomId', 'admin online list does not show current room');
requireText(admin, 'strictPresenceWindowMs', 'admin does not show strict freshness window');
requireText(admin, "['biblical-match-three', 'Библейские сокровища']", 'Biblical Treasures is missing from the administrator game list');
requireText(admin, 'data-live-user', 'administrator live list does not render current verified users');
requireText(admin, 'Authorization', 'administrator live requests do not use scoped bearer auth');
forbidText(admin, '?initData=', 'administrator live requests must not expose Telegram initData in URLs');
forbidText(rescue, '?initData=', 'recovery live requests must not expose Telegram initData in URLs');
requireText(rescue, "'X-Telegram-Init-Data': initData", 'recovery live fallback must use a request header');
requireText(shell, "page.dataset.adminVersion = '3'", 'admin shell v3 must stamp its runtime version');
requireText(shell, "livePanel(page)", 'admin shell v3 must place live monitoring in the dashboard');
require(isBundled('web/js/presence-identity.js'), 'fresh optimized WebApp presence client is not mounted');
require(isBundled('web/js/presence-game-bridge.js'), 'game-navigation presence bridge is not mounted');
require(isBundled('web/js/admin-live-v3.js'), 'admin live v3 monitor is not mounted with fresh cache key');
require(isBundled('web/styles/admin-live-v3.css'), 'admin live v3 styles are not mounted with fresh cache key');
require(isBundled('web/styles/admin-live-compact.css'), 'compact live user-card styles are not mounted');
require(isBundled('web/js/admin-live-rescue.js'), 'admin live recovery client is not mounted');
require(isBundled('web/js/admin-shell-v3.js'), 'admin shell v3 is not mounted');
require(isBundled('web/styles/admin-shell-v3.css'), 'admin shell v3 styles are not mounted');
require(isBundled('web/js/cloudflare-request-budget.js'), 'Cloudflare request-budget client is not mounted');

console.log('Verified presence, current-game tracking, scoped sessions and lower-frequency request budget checks passed');
