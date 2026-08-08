import { DurableObject } from 'cloudflare:workers';
import {
  askCard,
  buildView,
  createRoomState,
  joinRoom,
  leaveRoom,
  passTimedOutTurn,
  restartGame,
  sanitizeName,
  startGame,
} from './engine.js';

const encoder = new TextEncoder();
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const ROOM_IDLE_TTL_MS = 12 * 60 * 60 * 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const originHeaders = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: originHeaders });
    }

    try {
      if (url.pathname === '/health') {
        return json({ ok: true, service: 'alias-spy-games-quartet', now: Date.now() }, 200, originHeaders);
      }

      if (request.method === 'POST' && url.pathname === '/rooms') {
        const body = await readJson(request);
        const player = await authenticatePlayer(body, env);

        for (let attempt = 0; attempt < 12; attempt += 1) {
          const roomId = randomRoomCode(6);
          const stub = roomStub(env, roomId);
          const response = await stub.fetch('https://quartet.internal/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, player }),
          });

          if (response.status === 409) continue;
          if (!response.ok) throw await internalError(response);

          const sessionToken = await createSessionToken({ roomId, ...player }, env);
          return json({ ok: true, roomId, sessionToken, player }, 201, originHeaders);
        }
        throw httpError(503, 'Не удалось подобрать свободный код комнаты');
      }

      const match = url.pathname.match(/^\/rooms\/([A-Z0-9]{4,10})(?:\/(join|ws))?$/i);
      if (match) {
        const roomId = normalizeRoomId(match[1]);
        const action = match[2] || '';
        const stub = roomStub(env, roomId);

        if (action === 'join' && request.method === 'POST') {
          const body = await readJson(request);
          const player = await authenticatePlayer(body, env);
          const response = await stub.fetch('https://quartet.internal/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player }),
          });
          if (!response.ok) throw await internalError(response);
          const sessionToken = await createSessionToken({ roomId, ...player }, env);
          return json({ ok: true, roomId, sessionToken, player }, 200, originHeaders);
        }

        if (action === 'ws' && request.method === 'GET') {
          if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
            throw httpError(426, 'Нужно WebSocket-подключение');
          }

          const token = url.searchParams.get('token') || '';
          const session = await verifySessionToken(token, env);
          if (session.roomId !== roomId) throw httpError(403, 'Сессия относится к другой комнате');

          const headers = new Headers(request.headers);
          headers.set('X-Quartet-Player-Id', session.playerId);
          headers.set('X-Quartet-Player-Name', session.name);
          const forwarded = new Request('https://quartet.internal/ws', { method: 'GET', headers });
          return stub.fetch(forwarded);
        }
      }

      return json({ ok: false, error: 'Not found' }, 404, originHeaders);
    } catch (error) {
      console.error('quartet worker error', error);
      const status = Number(error?.status || 500);
      return json({ ok: false, error: String(error?.message || 'Server error'), code: error?.code || 'SERVER_ERROR' }, status, originHeaders);
    }
  },
};

export class QuartetRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.ctx.blockConcurrencyWhile(async () => {
      this.room = (await this.ctx.storage.get('room')) || null;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/create') {
      if (this.room) return json({ ok: false, error: 'Room exists' }, 409);
      const { roomId, player } = await readJson(request);
      this.room = createRoomState(normalizeRoomId(roomId), player);
      await this.persistAndBroadcast();
      return json({ ok: true }, 201);
    }

    if (request.method === 'POST' && url.pathname === '/join') {
      if (!this.room) return json({ ok: false, error: 'Комната не найдена', code: 'ROOM_NOT_FOUND' }, 404);
      const { player } = await readJson(request);
      try {
        joinRoom(this.room, player);
        await this.persistAndBroadcast();
        return json({ ok: true });
      } catch (error) {
        return json({ ok: false, error: error.message, code: error.code }, 409);
      }
    }

    if (request.method === 'GET' && url.pathname === '/ws') {
      if (!this.room) return json({ ok: false, error: 'Комната не найдена' }, 404);
      const playerId = request.headers.get('X-Quartet-Player-Id') || '';
      const player = this.room.players.find((item) => item.playerId === playerId && item.isActive !== false);
      if (!player) return json({ ok: false, error: 'Игрок не найден в комнате' }, 403);

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ playerId, connectedAt: Date.now(), lastActionAt: 0 });
      queueMicrotask(() => this.broadcastState().catch(console.error));
      return new Response(null, { status: 101, webSocket: client });
    }

    return json({ ok: false, error: 'Not found' }, 404);
  }

  async webSocketMessage(webSocket, message) {
    let payload;
    try {
      payload = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      return this.sendError(webSocket, 'Некорректное сообщение', 'BAD_MESSAGE');
    }

    const attachment = webSocket.deserializeAttachment() || {};
    const playerId = String(attachment.playerId || '');
    if (!playerId || !this.room) return this.sendError(webSocket, 'Сессия комнаты недоступна', 'NO_SESSION');

    const now = Date.now();
    if (payload.type === 'ping') {
      webSocket.send(JSON.stringify({ type: 'pong', at: now }));
      return;
    }

    if (now - Number(attachment.lastActionAt || 0) < 250) {
      return this.sendError(webSocket, 'Слишком много действий подряд', 'RATE_LIMIT');
    }
    attachment.lastActionAt = now;
    webSocket.serializeAttachment(attachment);

    try {
      if (payload.type !== 'action') throw new Error('Неизвестный тип сообщения');
      const action = String(payload.action || '');
      const data = payload.payload || {};

      if (action === 'startGame') {
        startGame(this.room, playerId, now);
      } else if (action === 'restartGame') {
        restartGame(this.room, playerId, now);
      } else if (action === 'askCard') {
        askCard(this.room, playerId, String(data.targetId || ''), String(data.cardId || ''), now);
      } else if (action === 'leave') {
        const result = leaveRoom(this.room, playerId, now);
        if (result.deleted) {
          await this.ctx.storage.deleteAll();
          this.room = null;
          this.closeAllSockets(1000, 'Room closed');
          return;
        }
      } else {
        throw Object.assign(new Error('Неизвестное действие'), { code: 'UNKNOWN_ACTION' });
      }

      await this.persistAndBroadcast();
    } catch (error) {
      this.sendError(webSocket, String(error?.message || error), error?.code || 'ACTION_ERROR');
    }
  }

  async webSocketClose(webSocket, code, reason) {
    try { webSocket.close(code, reason); } catch {}
    if (this.room) await this.broadcastState();
  }

  async webSocketError(webSocket) {
    try { webSocket.close(1011, 'WebSocket error'); } catch {}
    if (this.room) await this.broadcastState();
  }

  async alarm() {
    if (!this.room) return;
    const now = Date.now();
    let changed = false;

    if (this.room.status === 'playing' && this.room.turnDeadlineMs && this.room.turnDeadlineMs <= now) {
      changed = passTimedOutTurn(this.room, now);
    }

    if (now - Number(this.room.updatedAt || this.room.createdAt || now) >= ROOM_IDLE_TTL_MS) {
      this.closeAllSockets(1001, 'Room expired');
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }

    if (changed) await this.persistAndBroadcast();
    else await this.scheduleAlarm();
  }

  async persistAndBroadcast() {
    if (!this.room) return;
    await this.ctx.storage.put('room', this.room);
    await this.scheduleAlarm();
    await this.broadcastState();
  }

  async scheduleAlarm() {
    if (!this.room) return;
    const cleanupAt = Number(this.room.updatedAt || Date.now()) + ROOM_IDLE_TTL_MS;
    const turnAt = this.room.status === 'playing' && this.room.turnDeadlineMs ? this.room.turnDeadlineMs : Number.POSITIVE_INFINITY;
    await this.ctx.storage.setAlarm(Math.min(cleanupAt, turnAt));
  }

  connectedPlayerIds() {
    const ids = new Set();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      if (attachment.playerId) ids.add(String(attachment.playerId));
    }
    return ids;
  }

  async broadcastState() {
    if (!this.room) return;
    const connected = this.connectedPlayerIds();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      const playerId = String(attachment.playerId || '');
      try {
        socket.send(JSON.stringify({ type: 'state', state: buildView(this.room, playerId, connected) }));
      } catch (error) {
        console.warn('socket send failed', error);
      }
    }
  }

  sendError(webSocket, message, code) {
    try { webSocket.send(JSON.stringify({ type: 'error', error: message, code })); } catch {}
  }

  closeAllSockets(code, reason) {
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.close(code, reason); } catch {}
    }
  }
}

async function authenticatePlayer(body, env) {
  const initData = String(body?.telegramInitData || '');
  if (initData) {
    const verified = await verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
    const user = verified.user;
    return {
      playerId: `tg:${String(user.id)}`,
      name: sanitizeName(body?.name || user.first_name || user.username || 'Игрок'),
      telegramId: String(user.id),
    };
  }

  if (String(env.ALLOW_GUESTS || '').toLowerCase() === 'true') {
    const guestId = String(body?.guestId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (!guestId) throw httpError(401, 'Не удалось определить гостя');
    return {
      playerId: `guest:${guestId}`,
      name: sanitizeName(body?.name || 'Гость'),
      telegramId: null,
    };
  }

  throw httpError(401, 'Откройте игру через Telegram');
}

async function verifyTelegramInitData(initData, botToken) {
  if (!botToken) throw httpError(500, 'TELEGRAM_BOT_TOKEN не настроен');
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash') || '';
  if (!receivedHash) throw httpError(401, 'Telegram hash отсутствует');

  const authDate = Number(params.get('auth_date') || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!authDate || Math.abs(nowSec - authDate) > 24 * 60 * 60) {
    throw httpError(401, 'Telegram-сессия устарела');
  }

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = await hmacBytes(encoder.encode('WebAppData'), encoder.encode(botToken));
  const expected = await hmacBytes(secretKey, encoder.encode(dataCheckString));
  const received = hexToBytes(receivedHash);
  if (!constantTimeEqual(expected, received)) throw httpError(401, 'Telegram-подпись не прошла проверку');

  let user;
  try { user = JSON.parse(params.get('user') || '{}'); } catch { user = {}; }
  if (!user?.id) throw httpError(401, 'Telegram user отсутствует');
  return { user, authDate };
}

async function createSessionToken(session, env) {
  if (!env.SESSION_SECRET) throw httpError(500, 'SESSION_SECRET не настроен');
  const payload = {
    roomId: normalizeRoomId(session.roomId),
    playerId: String(session.playerId),
    name: sanitizeName(session.name),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacBytes(encoder.encode(env.SESSION_SECRET), encoder.encode(encoded));
  return `${encoded}.${base64UrlEncode(signature)}`;
}

async function verifySessionToken(token, env) {
  if (!env.SESSION_SECRET) throw httpError(500, 'SESSION_SECRET не настроен');
  const [encoded, signatureText] = String(token || '').split('.');
  if (!encoded || !signatureText) throw httpError(401, 'Некорректная сессия');
  const expected = await hmacBytes(encoder.encode(env.SESSION_SECRET), encoder.encode(encoded));
  const received = base64UrlDecode(signatureText);
  if (!constantTimeEqual(expected, received)) throw httpError(401, 'Сессия не прошла проверку');

  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded))); } catch { throw httpError(401, 'Сессия повреждена'); }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw httpError(401, 'Сессия истекла');
  return payload;
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

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function roomStub(env, roomId) {
  const id = env.ROOMS.idFromName(normalizeRoomId(roomId));
  return env.ROOMS.get(id);
}

function normalizeRoomId(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

function randomRoomCode(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
  return code;
}

async function readJson(request) {
  try { return await request.json(); } catch { throw httpError(400, 'Некорректный JSON'); }
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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

function httpError(status, message, code = 'HTTP_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function internalError(response) {
  let payload = null;
  try { payload = await response.json(); } catch {}
  return httpError(response.status || 500, payload?.error || `Internal HTTP ${response.status}`, payload?.code || 'ROOM_ERROR');
}
