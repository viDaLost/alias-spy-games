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
const POLL_PRESENCE_TTL_MS = 8_000;
const MAX_CHAT_MESSAGES = 80;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const originHeaders = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: originHeaders });

    try {
      if (url.pathname === '/health') return json({ ok: true, service: 'alias-spy-games-quartet', chat: true, idempotentCreate: true, now: Date.now() }, 200, originHeaders);

      if (request.method === 'POST' && url.pathname === '/rooms') {
        const body = await readJson(request);
        const player = await authenticatePlayer(body, env);
        const createRequestId = normalizeRequestId(body?.requestId);
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const roomId = createRequestId
            ? await stableRoomCode(player.playerId, createRequestId, attempt)
            : randomRoomCode(6);
          const stub = roomStub(env, roomId);
          const response = await stub.fetch('https://quartet.internal/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId, player, createRequestId }),
          });
          if (response.status === 409) continue;
          if (!response.ok) throw await internalError(response);
          let created = {};
          try { created = await response.json(); } catch {}
          const sessionToken = await createSessionToken({ roomId, ...player }, env);
          return json({ ok: true, roomId, sessionToken, player, state: created.state || null, replayed: Boolean(created.replayed) }, 201, originHeaders);
        }
        throw httpError(503, 'Не удалось подобрать свободный код комнаты');
      }

      const match = url.pathname.match(/^\/rooms\/([A-Z0-9]{4,10})(?:\/(join|ws|poll))?$/i);
      if (match) {
        const roomId = normalizeRoomId(match[1]);
        const action = match[2] || '';
        const stub = roomStub(env, roomId);
        if (action === 'join' && request.method === 'POST') {
          const body = await readJson(request);
          const player = await authenticatePlayer(body, env);
          const response = await stub.fetch('https://quartet.internal/join', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ player }),
          });
          if (!response.ok) throw await internalError(response);
          let joined = {};
          try { joined = await response.json(); } catch {}
          const sessionToken = await createSessionToken({ roomId, ...player }, env);
          return json({ ok: true, roomId, sessionToken, player, state: joined.state || null }, 200, originHeaders);
        }
        if (action === 'ws' && request.method === 'GET') {
          if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') throw httpError(426, 'Нужно WebSocket-подключение');
          const session = await verifySessionToken(url.searchParams.get('token') || '', env);
          if (session.roomId !== roomId) throw httpError(403, 'Сессия относится к другой комнате');
          const headers = new Headers(request.headers);
          headers.set('X-Quartet-Player-Id', session.playerId);
          headers.set('X-Quartet-Player-Name', session.name);
          return stub.fetch(new Request('https://quartet.internal/ws', { method: 'GET', headers }));
        }
        if (action === 'poll' && request.method === 'POST') {
          const session = await verifySessionToken(url.searchParams.get('token') || '', env);
          if (session.roomId !== roomId) throw httpError(403, 'Сессия относится к другой комнате');
          const body = await readJson(request);
          const response = await stub.fetch('https://quartet.internal/poll', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Quartet-Player-Id': session.playerId,
              'X-Quartet-Player-Name': session.name,
            },
            body: JSON.stringify(body),
          });
          let payload = {};
          try { payload = await response.json(); } catch {}
          return json(payload, response.status, originHeaders);
        }
      }
      return json({ ok: false, error: 'Not found' }, 404, originHeaders);
    } catch (error) {
      console.error('quartet worker error', error);
      return json({ ok: false, error: String(error?.message || 'Server error'), code: error?.code || 'SERVER_ERROR' }, Number(error?.status || 500), originHeaders);
    }
  },
};

export class QuartetRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.pollingPresence = new Map();
    this.pollingRateLimits = new Map();
    this.pollingActionIds = new Map();
    this.ctx.blockConcurrencyWhile(async () => {
      this.room = (await this.ctx.storage.get('room')) || null;
      if (this.room) ensureChat(this.room);
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/create') {
      const { roomId, player, createRequestId } = await readJson(request);
      const normalizedRequestId = normalizeRequestId(createRequestId);
      if (this.room) {
        if (normalizedRequestId && this.room.createRequestId === normalizedRequestId && this.room.hostPlayerId === player?.playerId) {
          ensureChat(this.room);
          const state = buildView(this.room, player.playerId, this.connectedPlayerIds());
          state.chat = this.room.chat.map((entry) => ({ ...entry }));
          return json({ ok: true, replayed: true, state });
        }
        return json({ ok: false, error: 'Room exists' }, 409);
      }
      this.room = createRoomState(normalizeRoomId(roomId), player);
      this.room.createRequestId = normalizedRequestId || null;
      ensureChat(this.room);
      await this.persistAndBroadcast();
      const state = buildView(this.room, player.playerId, this.connectedPlayerIds());
      state.chat = this.room.chat.map((entry) => ({ ...entry }));
      return json({ ok: true, replayed: false, state }, 201);
    }
    if (request.method === 'POST' && url.pathname === '/join') {
      if (!this.room) return json({ ok: false, error: 'Комната не найдена', code: 'ROOM_NOT_FOUND' }, 404);
      ensureChat(this.room);
      const { player } = await readJson(request);
      try {
        joinRoom(this.room, player);
        await this.persistAndBroadcast();
        const state = buildView(this.room, player.playerId, this.connectedPlayerIds());
        state.chat = this.room.chat.map((entry) => ({ ...entry }));
        return json({ ok: true, state });
      } catch (error) {
        return json({ ok: false, error: error.message, code: error.code }, 409);
      }
    }
    if (request.method === 'GET' && url.pathname === '/ws') {
      if (!this.room) return json({ ok: false, error: 'Комната не найдена' }, 404);
      ensureChat(this.room);
      const playerId = request.headers.get('X-Quartet-Player-Id') || '';
      const player = this.room.players.find((item) => item.playerId === playerId && item.isActive !== false);
      if (!player) return json({ ok: false, error: 'Игрок не найден в комнате' }, 403);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ playerId, connectedAt: Date.now(), lastActionAt: 0, lastChatAt: 0 });
      queueMicrotask(() => this.broadcastState().catch(console.error));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (request.method === 'POST' && url.pathname === '/poll') {
      if (!this.room) return json({ ok: false, error: 'Комната не найдена', code: 'ROOM_NOT_FOUND' }, 404);
      ensureChat(this.room);
      const playerId = request.headers.get('X-Quartet-Player-Id') || '';
      const player = this.room.players.find((item) => item.playerId === playerId && item.isActive !== false);
      if (!player) return json({ ok: false, error: 'Игрок не найден в комнате', code: 'PLAYER_NOT_FOUND' }, 403);
      const payload = await readJson(request);
      const now = Date.now();
      this.pollingPresence.set(playerId, now);
      await this.scheduleAlarm();
      try {
        const action = String(payload.action || '');
        const requestId = String(payload.requestId || '').slice(0, 96);
        if (action && !this.hasProcessedPollingAction(playerId, requestId)) {
          this.enforcePollingRateLimit(playerId, action, now);
          const result = await this.applyAction(playerId, action, payload.payload || {}, now);
          this.rememberPollingAction(playerId, requestId);
          if (result.deleted) return json({ ok: true, closed: true, transport: 'https' });
        } else {
          await this.broadcastState();
        }
        if (!this.room) return json({ ok: true, closed: true, transport: 'https' });
        const view = buildView(this.room, playerId, this.connectedPlayerIds());
        view.chat = this.room.chat.map((entry) => ({ ...entry }));
        return json({ ok: true, transport: 'https', state: view });
      } catch (error) {
        return json({ ok: false, error: String(error?.message || error), code: error?.code || 'ACTION_ERROR' }, 409);
      }
    }
    return json({ ok: false, error: 'Not found' }, 404);
  }

  async webSocketMessage(webSocket, message) {
    let payload;
    try { payload = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); }
    catch { return this.sendError(webSocket, 'Некорректное сообщение', 'BAD_MESSAGE'); }

    const attachment = webSocket.deserializeAttachment() || {};
    const playerId = String(attachment.playerId || '');
    if (!playerId || !this.room) return this.sendError(webSocket, 'Сессия комнаты недоступна', 'NO_SESSION');
    ensureChat(this.room);
    const now = Date.now();
    if (payload.type === 'ping') {
      try { webSocket.send(JSON.stringify({ type: 'pong', at: now })); } catch {}
      return;
    }
    if (payload.type !== 'action') return this.sendError(webSocket, 'Неизвестный тип сообщения', 'BAD_MESSAGE');

    const action = String(payload.action || '');
    const data = payload.payload || {};
    const chatAction = action === 'chat';
    const rateKey = chatAction ? 'lastChatAt' : 'lastActionAt';
    const minDelay = chatAction ? 700 : 250;
    if (now - Number(attachment[rateKey] || 0) < minDelay) return this.sendError(webSocket, 'Слишком много действий подряд', 'RATE_LIMIT');
    attachment[rateKey] = now;
    webSocket.serializeAttachment(attachment);

    try {
      await this.applyAction(playerId, action, data, now);
    } catch (error) {
      this.sendError(webSocket, String(error?.message || error), error?.code || 'ACTION_ERROR');
    }
  }

  async applyAction(playerId, action, data, now) {
    if (!this.room) throw Object.assign(new Error('Сессия комнаты недоступна'), { code: 'NO_SESSION' });
    ensureChat(this.room);
    if (action === 'startGame') startGame(this.room, playerId, now);
    else if (action === 'restartGame') restartGame(this.room, playerId, now);
    else if (action === 'askCard') askCard(this.room, playerId, String(data.targetId || ''), String(data.cardId || ''), now);
    else if (action === 'chat') addChatMessage(this.room, playerId, String(data.text || ''), now);
    else if (action === 'leave') {
      const result = leaveRoom(this.room, playerId, now);
      this.pollingPresence.delete(playerId);
      this.pollingRateLimits.delete(playerId);
      this.pollingActionIds.delete(playerId);
      if (result.deleted) {
        await this.ctx.storage.deleteAll();
        this.room = null;
        this.closeAllSockets(1000, 'Room closed');
        return { deleted: true };
      }
    } else throw Object.assign(new Error('Неизвестное действие'), { code: 'UNKNOWN_ACTION' });
    await this.persistAndBroadcast();
    return { deleted: false };
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
    if (this.room.status === 'playing' && this.room.turnDeadlineMs && this.room.turnDeadlineMs <= now) changed = passTimedOutTurn(this.room, now);
    if (now - Number(this.room.updatedAt || this.room.createdAt || now) >= ROOM_IDLE_TTL_MS) {
      this.closeAllSockets(1001, 'Room expired');
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    if (changed) await this.persistAndBroadcast();
    else {
      await this.broadcastState();
      await this.scheduleAlarm();
    }
  }

  async persistAndBroadcast() {
    if (!this.room) return;
    ensureChat(this.room);
    await this.ctx.storage.put('room', this.room);
    await this.scheduleAlarm();
    await this.broadcastState();
  }
  async scheduleAlarm() {
    if (!this.room) return;
    const cleanupAt = Number(this.room.updatedAt || Date.now()) + ROOM_IDLE_TTL_MS;
    const turnAt = this.room.status === 'playing' && this.room.turnDeadlineMs ? this.room.turnDeadlineMs : Number.POSITIVE_INFINITY;
    const pollExpiryAt = this.pollingPresence.size
      ? Math.min(...this.pollingPresence.values()) + POLL_PRESENCE_TTL_MS
      : Number.POSITIVE_INFINITY;
    await this.ctx.storage.setAlarm(Math.min(cleanupAt, turnAt, pollExpiryAt));
  }
  connectedPlayerIds() {
    const ids = new Set();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      if (attachment.playerId) ids.add(String(attachment.playerId));
    }
    const now = Date.now();
    for (const [playerId, seenAt] of this.pollingPresence) {
      if (now - Number(seenAt) <= POLL_PRESENCE_TTL_MS) ids.add(String(playerId));
      else this.pollingPresence.delete(playerId);
    }
    return ids;
  }
  enforcePollingRateLimit(playerId, action, now) {
    const limits = this.pollingRateLimits.get(playerId) || { action: 0, chat: 0 };
    const key = action === 'chat' ? 'chat' : 'action';
    const minDelay = action === 'chat' ? 700 : 250;
    if (now - Number(limits[key] || 0) < minDelay) throw Object.assign(new Error('Слишком много действий подряд'), { code: 'RATE_LIMIT' });
    limits[key] = now;
    this.pollingRateLimits.set(playerId, limits);
  }
  hasProcessedPollingAction(playerId, requestId) {
    return Boolean(requestId) && (this.pollingActionIds.get(playerId) || []).includes(requestId);
  }
  rememberPollingAction(playerId, requestId) {
    if (!requestId) return;
    const recent = this.pollingActionIds.get(playerId) || [];
    recent.push(requestId);
    if (recent.length > 128) recent.splice(0, recent.length - 128);
    this.pollingActionIds.set(playerId, recent);
  }
  async broadcastState() {
    if (!this.room) return;
    ensureChat(this.room);
    const connected = this.connectedPlayerIds();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      const playerId = String(attachment.playerId || '');
      try {
        const view = buildView(this.room, playerId, connected);
        view.chat = this.room.chat.map((entry) => ({ ...entry }));
        socket.send(JSON.stringify({ type: 'state', state: view }));
      } catch (error) { console.warn('socket send failed', error); }
    }
  }
  sendError(webSocket, message, code) { try { webSocket.send(JSON.stringify({ type: 'error', error: message, code })); } catch {} }
  closeAllSockets(code, reason) { for (const socket of this.ctx.getWebSockets()) try { socket.close(code, reason); } catch {} }
}

function ensureChat(room) {
  if (!Array.isArray(room.chat)) room.chat = [];
  room.chatSeq = Number(room.chatSeq || 0);
}
function addChatMessage(room, playerId, rawText, now) {
  const player = room.players.find((item) => item.playerId === playerId && item.isActive !== false);
  if (!player) throw Object.assign(new Error('Игрок недоступен'), { code: 'PLAYER_NOT_FOUND' });
  const text = sanitizeChat(rawText);
  if (!text) throw Object.assign(new Error('Сообщение пустое'), { code: 'EMPTY_CHAT' });
  room.chatSeq += 1;
  room.chat.push({ id: String(room.chatSeq), playerId, name: player.name, text, at: now });
  if (room.chat.length > MAX_CHAT_MESSAGES) room.chat.splice(0, room.chat.length - MAX_CHAT_MESSAGES);
  room.version = Number(room.version || 0) + 1;
  room.updatedAt = now;
}
function sanitizeChat(value) { return String(value || '').replace(/[<>\r\t]/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/\s{3,}/g, '  ').trim().slice(0, 300); }

async function authenticatePlayer(body, env) {
  const initData = String(body?.telegramInitData || '');
  if (initData) {
    const verified = await verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
    const user = verified.user;
    return { playerId: `tg:${String(user.id)}`, name: sanitizeName(body?.name || user.first_name || user.username || 'Игрок'), telegramId: String(user.id) };
  }
  if (String(env.ALLOW_GUESTS || '').toLowerCase() === 'true') {
    const guestId = String(body?.guestId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (!guestId) throw httpError(401, 'Не удалось определить гостя');
    return { playerId: `guest:${guestId}`, name: sanitizeName(body?.name || 'Гость'), telegramId: null };
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
  if (!authDate || Math.abs(nowSec - authDate) > 24 * 60 * 60) throw httpError(401, 'Telegram-сессия устарела');
  params.delete('hash');
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
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
  const payload = { roomId: normalizeRoomId(session.roomId), playerId: String(session.playerId), name: sanitizeName(session.name), exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
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
  return Uint8Array.from(hex.match(/.{2}/g).map((part) => parseInt(part, 16)));
}
function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64UrlDecode(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  try { return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)); } catch { return new Uint8Array(); }
}
function roomStub(env, roomId) { return env.ROOMS.get(env.ROOMS.idFromName(normalizeRoomId(roomId))); }
function normalizeRoomId(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); }
function normalizeRequestId(value) { return String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 96); }
async function stableRoomCode(playerId, requestId, attempt) {
  const digest = new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`${String(playerId)}\n${requestId}\n${attempt}`),
  ));
  return Array.from(digest.slice(0, 6), (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
}
function randomRoomCode(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
}
async function readJson(request) { try { return await request.json(); } catch { throw httpError(400, 'Некорректный JSON'); } }
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',').map((item) => item.trim()).filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || 'https://vidalost.github.io';
  return { 'Access-Control-Allow-Origin': allowOrigin, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
function json(value, status = 200, extraHeaders = {}) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders } }); }
function httpError(status, message, code = 'HTTP_ERROR') { return Object.assign(new Error(message), { status, code }); }
async function internalError(response) {
  let payload = null;
  try { payload = await response.json(); } catch {}
  return httpError(response.status || 500, payload?.error || `Internal HTTP ${response.status}`, payload?.code || 'ROOM_ERROR');
}
