import { DurableObject } from 'cloudflare:workers';

const encoder = new TextEncoder();
const ALLOWED_EVENTS = new Set(['game_open', 'quartet_party_started', 'quartet_party_finished', 'client_error']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/health') {
        return json({ ok: true, service: 'alias-spy-games-observability', now: Date.now() }, 200, cors);
      }

      if (url.pathname === '/presence' && request.method === 'GET') {
        if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
        if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') throw httpError(426, 'WebSocket required');
        const sid = sanitizeSessionId(url.searchParams.get('sid'));
        if (!sid) throw httpError(400, 'Session id required');
        const headers = new Headers(request.headers);
        headers.set('X-App-Session-Id', sid);
        return statsStub(env).fetch(new Request('https://stats.internal/presence', { method: 'GET', headers }));
      }

      if (url.pathname === '/event' && request.method === 'POST') {
        if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
        const payload = await readJson(request);
        const response = await statsStub(env).fetch('https://stats.internal/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        return json(data, response.status, cors);
      }

      if (url.pathname === '/admin/stats' && request.method === 'GET') {
        if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
        const initData = String(url.searchParams.get('initData') || '');
        const verified = await verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
        if (String(verified.user.id) !== String(env.ADMIN_TELEGRAM_ID || '')) throw httpError(403, 'Admin only');
        const response = await statsStub(env).fetch('https://stats.internal/snapshot');
        const data = await response.json();
        return json(data, response.status, cors);
      }

      return json({ ok: false, error: 'Not found' }, 404, cors);
    } catch (error) {
      const status = Number(error?.status || 500);
      return json({ ok: false, error: String(error?.message || 'Server error') }, status, cors);
    }
  },
};

export class AppStats extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/presence' && request.method === 'GET') {
      const sid = sanitizeSessionId(request.headers.get('X-App-Session-Id'));
      if (!sid) return json({ ok: false, error: 'Bad session' }, 400);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ sid, game: '', roomId: '', updatedAt: Date.now() });
      queueMicrotask(() => this.recordPeak().catch(console.error));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/event' && request.method === 'POST') {
      const payload = await readJson(request);
      const event = String(payload?.event || '');
      if (!ALLOWED_EVENTS.has(event)) return json({ ok: false, error: 'Unknown event' }, 400);
      await this.recordEvent(event, payload || {});
      return json({ ok: true });
    }

    if (url.pathname === '/snapshot' && request.method === 'GET') {
      return json(await this.snapshot());
    }

    return json({ ok: false, error: 'Not found' }, 404);
  }

  async webSocketMessage(webSocket, message) {
    let payload;
    try { payload = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); }
    catch { return; }

    if (payload?.type === 'ping') {
      const attachment = webSocket.deserializeAttachment() || {};
      attachment.updatedAt = Date.now();
      webSocket.serializeAttachment(attachment);
      try { webSocket.send(JSON.stringify({ type: 'pong', at: attachment.updatedAt })); } catch {}
      return;
    }

    if (payload?.type !== 'presence') return;
    const attachment = webSocket.deserializeAttachment() || {};
    attachment.game = sanitizeGame(payload.game);
    attachment.roomId = attachment.game === 'quartet' ? sanitizeRoomId(payload.roomId) : '';
    attachment.updatedAt = Date.now();
    webSocket.serializeAttachment(attachment);
  }

  async webSocketClose(webSocket, code, reason) {
    try { webSocket.close(code, reason); } catch {}
  }

  async webSocketError(webSocket) {
    try { webSocket.close(1011, 'WebSocket error'); } catch {}
  }

  async recordPeak() {
    const day = dayKey();
    const counters = await this.getDay(day);
    const online = this.liveSnapshot().onlineNow;
    if (online > Number(counters.peakOnline || 0)) {
      counters.peakOnline = online;
      await this.ctx.storage.put(`day:${day}`, counters);
    }
  }

  async recordEvent(event, payload) {
    const day = dayKey();
    const counters = await this.getDay(day);
    const game = sanitizeGame(payload.game);
    const roomId = sanitizeRoomId(payload.roomId);

    if (event === 'game_open' && game) {
      counters.gameOpens += 1;
      counters.byGame[game] = Number(counters.byGame[game] || 0) + 1;
    } else if (event === 'quartet_party_started' && roomId && !counters.startedRooms.includes(roomId)) {
      counters.startedRooms.push(roomId);
      counters.quartetStarted += 1;
    } else if (event === 'quartet_party_finished' && roomId && !counters.finishedRooms.includes(roomId)) {
      counters.finishedRooms.push(roomId);
      counters.quartetFinished += 1;
    } else if (event === 'client_error') {
      counters.errors += 1;
      counters.recentErrors.unshift({
        at: Date.now(),
        game,
        message: String(payload.message || 'Unknown error').replace(/[\r\n\t]+/g, ' ').slice(0, 180),
      });
      counters.recentErrors = counters.recentErrors.slice(0, 20);
    }

    counters.updatedAt = Date.now();
    await this.ctx.storage.put(`day:${day}`, counters);
  }

  async snapshot() {
    const live = this.liveSnapshot();
    const day = dayKey();
    const counters = await this.getDay(day);
    if (live.onlineNow > Number(counters.peakOnline || 0)) {
      counters.peakOnline = live.onlineNow;
      await this.ctx.storage.put(`day:${day}`, counters);
    }

    const topGames = Object.entries(counters.byGame || {})
      .map(([game, opens]) => ({ game, opens: Number(opens || 0) }))
      .sort((a, b) => b.opens - a.opens || a.game.localeCompare(b.game))
      .slice(0, 10);

    return {
      ok: true,
      day,
      onlineNow: live.onlineNow,
      activeQuartetRooms: live.activeQuartetRooms,
      currentGames: live.currentGames,
      peakOnlineToday: Number(counters.peakOnline || 0),
      gameOpensToday: Number(counters.gameOpens || 0),
      quartetStartedToday: Number(counters.quartetStarted || 0),
      quartetFinishedToday: Number(counters.quartetFinished || 0),
      errorsToday: Number(counters.errors || 0),
      topGames,
      recentErrors: counters.recentErrors || [],
      generatedAt: Date.now(),
    };
  }

  liveSnapshot() {
    const sessions = new Map();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      const sid = sanitizeSessionId(attachment.sid);
      if (!sid) continue;
      const previous = sessions.get(sid);
      if (!previous || Number(attachment.updatedAt || 0) >= Number(previous.updatedAt || 0)) sessions.set(sid, attachment);
    }

    const currentGames = {};
    const quartetRooms = new Set();
    for (const attachment of sessions.values()) {
      const game = sanitizeGame(attachment.game);
      if (game) currentGames[game] = Number(currentGames[game] || 0) + 1;
      const roomId = sanitizeRoomId(attachment.roomId);
      if (game === 'quartet' && roomId) quartetRooms.add(roomId);
    }

    return { onlineNow: sessions.size, activeQuartetRooms: quartetRooms.size, currentGames };
  }

  async getDay(day) {
    return (await this.ctx.storage.get(`day:${day}`)) || {
      day,
      gameOpens: 0,
      byGame: {},
      quartetStarted: 0,
      quartetFinished: 0,
      errors: 0,
      peakOnline: 0,
      startedRooms: [],
      finishedRooms: [],
      recentErrors: [],
      updatedAt: Date.now(),
    };
  }
}

function statsStub(env) {
  return env.STATS.get(env.STATS.idFromName('global'));
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

function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
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

async function readJson(request) {
  try { return await request.json(); } catch { throw httpError(400, 'Invalid JSON'); }
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',').map((item) => item.trim()).filter(Boolean);
}

function isAllowedOrigin(request, env) {
  return allowedOrigins(env).includes(request.headers.get('Origin') || '');
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = allowedOrigins(env);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || 'https://vidalost.github.io';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
