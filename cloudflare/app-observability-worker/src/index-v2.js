import original, { AppStats as BaseAppStats } from './index.js';

const encoder = new TextEncoder();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/presence' || request.method !== 'GET') {
      return original.fetch(request, env, ctx);
    }

    const origin = request.headers.get('Origin') || '';
    if (!allowedOrigins(env).includes(origin)) return jsonError('Origin not allowed', 403, origin, env);
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return jsonError('WebSocket required', 426, origin, env);

    const sid = sanitizeSessionId(url.searchParams.get('sid'));
    if (!sid) return jsonError('Session id required', 400, origin, env);

    let verifiedUser = {};
    const initData = String(url.searchParams.get('initData') || '');
    if (initData) {
      try {
        verifiedUser = (await verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN)).user || {};
      } catch (error) {
        return jsonError(String(error?.message || 'Telegram verification failed'), Number(error?.status || 401), origin, env);
      }
    }

    const headers = new Headers(request.headers);
    headers.set('X-App-Session-Id', sid);
    if (verifiedUser?.id) headers.set('X-App-User-Id', String(verifiedUser.id));
    if (verifiedUser?.username) headers.set('X-App-Username', sanitizeUsername(verifiedUser.username));
    const displayName = sanitizeDisplayName([verifiedUser?.first_name, verifiedUser?.last_name].filter(Boolean).join(' '));
    if (displayName) headers.set('X-App-Display-Name', displayName);

    const stub = env.STATS.get(env.STATS.idFromName('global'));
    return stub.fetch(new Request('https://stats.internal/presence', { method: 'GET', headers }));
  },
};

export class AppStats extends BaseAppStats {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/presence' || request.method !== 'GET') return super.fetch(request);

    const sid = sanitizeSessionId(request.headers.get('X-App-Session-Id'));
    if (!sid) return json({ ok: false, error: 'Bad session' }, 400);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      sid,
      game: '',
      roomId: '',
      updatedAt: Date.now(),
      userId: sanitizeUserId(request.headers.get('X-App-User-Id')),
      username: sanitizeUsername(request.headers.get('X-App-Username')),
      displayName: sanitizeDisplayName(request.headers.get('X-App-Display-Name')),
    });
    queueMicrotask(() => this.recordPeak().catch(console.error));
    return new Response(null, { status: 101, webSocket: client });
  }

  liveSnapshot() {
    const sessions = new Map();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      const sid = sanitizeSessionId(attachment.sid);
      if (!sid) continue;
      const current = normalizeAttachment(attachment);
      const previous = sessions.get(sid);
      if (!previous) {
        sessions.set(sid, current);
        continue;
      }
      const newer = Number(current.updatedAt || 0) >= Number(previous.updatedAt || 0) ? current : previous;
      const identity = current.userId ? current : (previous.userId ? previous : {});
      sessions.set(sid, {
        ...newer,
        userId: identity.userId || '',
        username: identity.username || '',
        displayName: identity.displayName || '',
      });
    }

    const currentGames = {};
    const quartetRooms = new Set();
    let menuNow = 0;
    const usersById = new Map();
    const anonymousUsers = [];

    for (const session of sessions.values()) {
      const game = sanitizeGame(session.game);
      if (game) currentGames[game] = Number(currentGames[game] || 0) + 1;
      else menuNow += 1;
      const roomId = sanitizeRoomId(session.roomId);
      if (game === 'quartet' && roomId) quartetRooms.add(roomId);

      const onlineUser = {
        id: sanitizeUserId(session.userId),
        username: sanitizeUsername(session.username),
        displayName: sanitizeDisplayName(session.displayName),
        game,
        roomId,
        updatedAt: Number(session.updatedAt || 0),
      };
      if (onlineUser.id) {
        const previous = usersById.get(onlineUser.id);
        if (!previous || onlineUser.updatedAt >= previous.updatedAt) usersById.set(onlineUser.id, onlineUser);
      } else {
        anonymousUsers.push(onlineUser);
      }
    }

    const onlineUsers = [...usersById.values(), ...anonymousUsers]
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, 100);

    return {
      onlineNow: sessions.size,
      activeQuartetRooms: quartetRooms.size,
      currentGames,
      menuNow,
      onlineUsers,
    };
  }

  async snapshot() {
    const base = await super.snapshot();
    const live = this.liveSnapshot();
    return {
      ...base,
      onlineNow: live.onlineNow,
      activeQuartetRooms: live.activeQuartetRooms,
      currentGames: live.currentGames,
      menuNow: live.menuNow,
      onlineUsers: live.onlineUsers,
    };
  }
}

function normalizeAttachment(value = {}) {
  return {
    sid: sanitizeSessionId(value.sid),
    game: sanitizeGame(value.game),
    roomId: sanitizeRoomId(value.roomId),
    updatedAt: Number(value.updatedAt || 0),
    userId: sanitizeUserId(value.userId),
    username: sanitizeUsername(value.username),
    displayName: sanitizeDisplayName(value.displayName),
  };
}

function sanitizeSessionId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}
function sanitizeGame(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}
function sanitizeRoomId(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}
function sanitizeUserId(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 24);
}
function sanitizeUsername(value) {
  return String(value || '').trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64);
}
function sanitizeDisplayName(value) {
  return String(value || '').replace(/[<>\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}
function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',').map((item) => item.trim()).filter(Boolean);
}
function corsOrigin(origin, env) {
  const allowed = allowedOrigins(env);
  return allowed.includes(origin) ? origin : (allowed[0] || 'https://vidalost.github.io');
}
function jsonError(message, status, origin, env) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': corsOrigin(origin, env),
      Vary: 'Origin',
    },
  });
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function verifyTelegramInitData(initData, botToken) {
  if (!botToken) throw httpError(500, 'Telegram secret is not configured');
  const params = new URLSearchParams(String(initData || ''));
  const receivedHash = params.get('hash') || '';
  if (!receivedHash) throw httpError(401, 'Telegram hash missing');

  const authDate = Number(params.get('auth_date') || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!authDate || Math.abs(nowSec - authDate) > 24 * 60 * 60) throw httpError(401, 'Telegram session expired');

  params.delete('hash');
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = await hmacBytes(encoder.encode('WebAppData'), encoder.encode(botToken));
  const expected = await hmacBytes(secretKey, encoder.encode(checkString));
  const received = hexToBytes(receivedHash);
  if (!constantTimeEqual(expected, received)) throw httpError(401, 'Telegram signature invalid');

  let user = {};
  try { user = JSON.parse(params.get('user') || '{}'); } catch {}
  if (!user?.id) throw httpError(401, 'Telegram user missing');
  return { user };
}
async function hmacBytes(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes));
}
function constantTimeEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
function hexToBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
