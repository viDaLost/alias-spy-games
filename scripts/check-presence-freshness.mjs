import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`Presence check failed: ${label}`);
};
const forbidText = (text, needle, label) => {
  if (text.includes(needle)) throw new Error(`Presence check failed: ${label}`);
};

const worker = read('cloudflare/app-observability-worker/src/index-v4.js');
const secureWorker = read('cloudflare/app-observability-worker/src/index-v6.js');
const wrangler = read('cloudflare/app-observability-worker/wrangler.jsonc');
const web = read('web/js/presence-identity.js');
const android = read('android-app/app/src/main/java/com/vidalost/biblegames/data/AppPresenceClient.kt');
const admin = read('web/js/admin-live-v3.js');
const html = read('index.html');

requireText(worker, 'const PRESENCE_STALE_MS = 35_000;', 'strict stale window must be 35 seconds');
requireText(worker, "if (!initData) return jsonError('Verified Telegram session required'", 'legacy Telegram verification guard is missing');
requireText(worker, 'verifyAndroidIdentity', 'verified Android presence path is missing');
requireText(worker, "const ROOM_GAMES = new Set(['quartet', 'bible-sketch'])", 'Bible Sketch room presence is not tracked');
requireText(worker, "payload?.type === 'offline'", 'explicit offline presence message is missing');
requireText(worker, 'const freshestByUser = new Map()', 'online sessions are not deduplicated by verified user');
requireText(worker, 'onlineNow: onlineUsers.length', 'online count is not based on unique verified users');
requireText(worker, 'activeBibleSketchRooms', 'Bible Sketch active room count is missing');
requireText(worker, 'strictPresenceWindowMs: PRESENCE_STALE_MS', 'admin does not receive presence freshness window');
requireText(wrangler, 'src/index-v6.js', 'secure observability entrypoint is not active');
requireText(secureWorker, "verifyScopedSession(env, String(url.searchParams.get('token') || ''), 'presence')", 'scoped web presence session is missing');
requireText(secureWorker, "verifyScopedSession(env, token, 'admin')", 'scoped admin live session is missing');

requireText(web, 'const HEARTBEAT_MS = 15_000;', 'WebApp heartbeat is not strict enough');
requireText(web, "scope: 'presence'", 'WebApp does not obtain a scoped presence session');
requireText(web, "url.searchParams.set('token', token)", 'WebApp does not connect with the scoped presence token');
forbidText(web, "url.searchParams.set('initData'", 'Telegram initData must not be exposed in the presence WebSocket URL');
requireText(web, "localStorage.getItem('bible_sketch_room_id_v1')", 'WebApp does not report Bible Sketch room state');
requireText(web, 'AppPresenceContext', 'explicit room presence context API is missing');
requireText(web, "type: 'offline'", 'WebApp does not explicitly report offline state');
requireText(web, "document.addEventListener('visibilitychange'", 'WebApp visibility tracking is missing');
requireText(web, "sendOfflineAndClose('hidden')", 'hidden WebApp remains online');

requireText(android, 'private const val HEARTBEAT_MS = 15_000L', 'Android heartbeat is not strict enough');
requireText(android, 'game == "quartet" || game == "bible-sketch"', 'Android does not report Bible Sketch rooms');
requireText(android, '.put("type", "offline")', 'Android does not explicitly report background/offline state');

requireText(admin, '5_000', 'admin live monitor does not refresh every five seconds');
requireText(admin, 'user.roomId', 'admin online list does not show current room');
requireText(admin, 'strictPresenceWindowMs', 'admin does not show strict freshness window');
requireText(admin, "['biblical-match-three', 'Библейские сокровища']", 'Biblical Treasures is missing from the administrator game list');
requireText(admin, 'data-live-user', 'administrator live list does not render current verified users');
requireText(admin, 'Authorization', 'administrator live requests do not use scoped bearer auth');
forbidText(admin, '?initData=', 'administrator live requests must not expose Telegram initData in URLs');
requireText(html, 'presence-identity.js?v=4', 'secure WebApp presence client is not mounted');
requireText(html, 'admin-live-v3.js?v=4', 'admin live v3 monitor is not mounted');
requireText(html, 'admin-live-v3.css?v=4', 'admin live v3 styles are not mounted');

console.log('Strict verified presence, scoped sessions, room tracking and freshness checks passed');
