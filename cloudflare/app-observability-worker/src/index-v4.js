import legacy, { AppStats as LegacyAppStats } from './index-v3.js';

const encoder = new TextEncoder();
const PRESENCE_STALE_MS = 35_000;
const ROOM_GAMES = new Set(['quartet', 'bible-sketch']);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/presence' || request.method !== 'GET') {
      return legacy.fetch(request, env, ctx);
    }

    const origin = request.headers.get('Origin') || '';
    if (!allowedOrigins(env).includes(origin)) return jsonError('Origin not allowed', 403, origin, env);
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return jsonError('WebSocket required', 426, origin, env);
    }

    const sid = sanitizeSessionId(url.searchParams.get('sid'));
    if (!sid) return jsonError('Session id required', 400, origin, env);

    let identity;
    const authorization = String(request.headers.get('Authorization') || '');
    if (/^Bearer\s+bgs_[A-Za-z0-9_-]{40,80}$/i.test(authorization)) {
      identity = await verifyAndroidIdentity(authorization, env, origin);
      if (identity instanceof Response) return identity;
    } else {
      const initData = String(url.searchParams.get('initData') || '');
      if (!initData) return jsonError('Verified Telegram session required', 401, origin, env);
      try {
        const verified = await verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
        const user = verified.user || {};
        identity = {
          userId: sanitizeUserId(user.id),
          username: sanitizeUsername(user.username),
          displayName: sanitizeDisplayName([user.first_name, user.last_name].filter(Boolean).join(' ')),
          platform: 'telegram',
        };
      } catch (error) {
        return jsonError(String(error?.message || 'Telegram verification failed'), Number(error?.status || 401), origin, env);
      }
    }

    if (!identity?.userId) return jsonError('Verified user required', 401, origin, env);

    const headers = new Headers(request.headers);
    headers.set('X-App-Session-Id', sid);
    headers.set('X-App-User-Id', identity.userId);
    if (identity.username) headers.set('X-App-Username', identity.username);
    if (identity.displayName) headers.set('X-App-Display-Name', identity.displayName);
    headers.set('X-App-Platform', sanitizePlatform(identity.platform));

    const stub = env.STATS.get(env.STATS.idFromName('global'));
    return stub.fetch(new Request('https://stats.internal/presence', { method: 'GET', headers }));
  },
};

export class AppStats extends LegacyAppStats {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/presence' || request.method !== 'GET') return super.fetch(request);

    const sid = sanitizeSessionId(request.headers.get('X-App-Session-Id'));
    const userId = sanitizeUserId(request.headers.get('X-App-User-Id'));
    if (!sid || !userId) return json({ ok: false, error: 'Verified presence identity required' }, 401);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      sid,
      userId,
      username: sanitizeUsername(request.headers.get('X-App-Username')),
      displayName: sanitizeDisplayName(request.headers.get('X-App-Display-Name')),
      platform: sanitizePlatform(request.headers.get('X-App-Platform')),
      game: '',
      roomId: '',
      visible: true,
      updatedAt: Date.now(),
    });
    queueMicrotask(() => this.recordPeak().catch(console.error));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(webSocket, message) {
    let payload;
    try {
      payload = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }

    const attachment = normalizeAttachment(webSocket.deserializeAttachment() || {});
    if (!attachment.userId) {
      try { webSocket.close(1008, 'verified identity required'); } catch {}
      return;
    }

    if (payload?.type === 'offline') {
      attachment.visible = false;
      attachment.updatedAt = 0;
      webSocket.serializeAttachment(attachment);
      try { webSocket.close(1000, 'offline'); } catch {}
      return;
    }

    if (payload?.type === 'ping') {
      attachment.updatedAt = Date.now();
      webSocket.serializeAttachment(attachment);
      try { webSocket.send(JSON.stringify({ type: 'pong', at: attachment.updatedAt })); } catch {}
      return;
    }

    if (payload?.type !== 'presence') return;

    attachment.game = sanitizeGame(payload.game);
    attachment.roomId = ROOM_GAMES.has(attachment.game) ? sanitizeRoomId(payload.roomId) : '';
    attachment.visible = payload.visible !== false;
    attachment.platform = sanitizePlatform(payload.platform || attachment.platform);
    attachment.updatedAt = attachment.visible ? Date.now() : 0;
    webSocket.serializeAttachment(attachment);

    if (!attachment.visible) {
      try { webSocket.close(1000, 'hidden'); } catch {}
    }
  }

  liveSnapshot() {
    const now = Date.now();
    const freshestByUser = new Map();
    let connectionCount = 0;

    for (const socket of this.ctx.getWebSockets()) {
      connectionCount += 1;
      const attachment = normalizeAttachment(socket.deserializeAttachment() || {});
      if (!attachment.userId || attachment.visible === false) continue;

      const updatedAt = Number(attachment.updatedAt || 0);
      if (!updatedAt || now - updatedAt > PRESENCE_STALE_MS) {
        try { socket.close(1001, 'stale presence'); } catch {}
        continue;
      }

      const previous = freshestByUser.get(attachment.userId);
      if (!previous || updatedAt >= Number(previous.updatedAt || 0)) {
        freshestByUser.set(attachment.userId, attachment);
      }
    }

    const currentGames = {};
    const activeRooms = {
      quartet: new Set(),
      'bible-sketch': new Set(),
    };
    let menuNow = 0;

    const onlineUsers = [...freshestByUser.values()]
      .map((session) => {
        const game = sanitizeGame(session.game);
        const roomId = ROOM_GAMES.has(game) ? sanitizeRoomId(session.roomId) : '';
        if (game) currentGames[game] = Number(currentGames[game] || 0) + 1;
        else menuNow += 1;
        if (roomId && activeRooms[game]) activeRooms[game].add(roomId);

        return {
          id: sanitizeUserId(session.userId),
          username: sanitizeUsername(session.username),
          displayName: sanitizeDisplayName(session.displayName),
          platform: sanitizePlatform(session.platform),
          game,
          roomId,
          updatedAt: Number(session.updatedAt || 0),
        };
      })
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

    const activeRoomsByGame = {
      quartet: activeRooms.quartet.size,
      'bible-sketch': activeRooms['bible-sketch'].size,
    };

    return {
      onlineNow: onlineUsers.length,
      connectionCount,
      menuNow,
      currentGames,
      onlineUsers,
      activeRoomsByGame,
      activeRoomsNow: activeRoomsByGame.quartet + activeRoomsByGame['bible-sketch'],
      activeQuartetRooms: activeRoomsByGame.quartet,
      activeBibleSketchRooms: activeRoomsByGame['bible-sketch'],
      strictPresenceWindowMs: PRESENCE_STALE_MS,
    };
  }

  async snapshot() {
    const base = await super.snapshot();
    const live = this.liveSnapshot();
    return {
      ...base,
      ...live,
      generatedAt: Date.now(),
    };
  }
}

async function verifyAndroidIdentity(authorization, env, origin) {
  const coreUrl = String(env.CORE_WORKER_URL || 'https://alias-spy-games-core.vitaledanilov.workers.dev').replace(/\/$/, '');
  try {
    const response = await fetch(`${coreUrl}/android/auth/me`, {
      headers: { Accept: 'application/json', Authorization: authorization },
    });
    const identity = await response.json().catch(() => ({}));
    if (!response.ok || identity?.success !== true || identity?.isBanned === true) {
      return jsonError(identity?.isBanned ? 'Access restricted' : 'Android session invalid', identity?.isBanned ? 403 : 401, origin, env);
    }
    const userId = sanitizeUserId(identity.userId);
    if (!userId) return jsonError('Android session invalid', 401, origin, env);
    return {
      userId,
      username: '',
      displayName: sanitizeDisplayName(identity.displayName || `Android · ID ${userId}`),
      platform: 'android',
    };
  } catch {
    return jsonError('Identity service unavailable', 503, origin, env);
  }
}

function normalizeAttachment(value = {}) {
  return {
    sid: sanitizeSessionId(value.sid),
    userId: sanitizeUserId(value.userId),
    username: sanitizeUsername(value.username),
    displayName: sanitizeDisplayName(value.displayName),
    platform: sanitizePlatform(value.platform),
    game: sanitizeGame(value.game),
    roomId: sanitizeRoomId(value.roomId),
    visible: value.visible !== false,
    updatedAt: Number(value.updatedAt || 0),
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
function sanitizePlatform(value) {
  const platform = String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
  return platform === 'android' ? 'android' : 'telegram';
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
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
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
