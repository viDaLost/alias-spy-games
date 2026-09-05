// Онлайн-Соглядатай: комнаты на Durable Objects.
//
// Устройство повторяет воркер «Квартета» — там этот контур уже отработан:
// код комнаты, сессия на HMAC, WebSocket с запасным HTTP-опросом. Отличия
// два, и оба принципиальные.
//
// Первое: секреты. Локация и роли живут только в Durable Object, наружу их
// отдаёт единственная функция buildView, собирая отдельный вид для каждого
// игрока. Полное состояние комнаты не покидает воркер ни разу — иначе соглядатай
// прочитал бы локацию во вкладке разработчика за две секунды.
//
// Второе: текстовый чат. Он и есть обсуждение — игроки задают вопросы и ищут
// того, кто локации не знает, поэтому переписка не чистится между этапами:
// она и есть улика, по которой голосуют.

import { DurableObject } from 'cloudflare:workers';
import {
  backToLobby,
  beginVoting,
  buildView,
  castVote,
  createRoomState,
  endRoundByTimeout,
  forceDiscussion,
  joinRoom,
  leaveRoom,
  markRoleSeen,
  renamePlayer,
  sanitizeName,
  setSettings,
  spyGuess,
  startGame,
  addChatMessage,
  ensureChat,
} from './engine.js';
import { LOCATIONS } from './locations.js';

const encoder = new TextEncoder();
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const ROOM_IDLE_TTL_MS = 6 * 60 * 60 * 1000;
const POLL_PRESENCE_TTL_MS = 8_000;
// Скользящее окно вместо минимальной паузы: столько действий за столько
// миллисекунд человек не нажмёт, а два подряд — нажмёт обязательно.
const ACTION_WINDOW_MS = 2_000;
const ACTION_WINDOW_LIMIT = 12;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/health') {
        return json({ ok: true, service: 'alias-spy-games-spy', chat: true, locations: LOCATIONS.length, now: Date.now() }, 200, cors);
      }

      if (request.method === 'POST' && url.pathname === '/rooms') {
        const body = await readJson(request);
        const player = await authenticatePlayer(body, env);
        const createRequestId = normalizeRequestId(body?.requestId);
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const roomId = createRequestId
            ? await stableRoomCode(player.playerId, createRequestId, attempt)
            : randomRoomCode(5);
          const stub = roomStub(env, roomId);
          const response = await stub.fetch('https://spy.internal/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, player, createRequestId }),
          });
          if (response.status === 409) continue;
          if (!response.ok) throw await internalError(response);
          const created = await response.json().catch(() => ({}));
          const sessionToken = await createSessionToken({ roomId, ...player }, env);
          return json({ ok: true, roomId, sessionToken, player, state: created.state || null }, 201, cors);
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
          const response = await stub.fetch('https://spy.internal/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player }),
          });
          if (!response.ok) throw await internalError(response);
          const joined = await response.json().catch(() => ({}));
          const sessionToken = await createSessionToken({ roomId, ...player }, env);
          return json({ ok: true, roomId, sessionToken, player, state: joined.state || null }, 200, cors);
        }

        if (action === 'ws' && request.method === 'GET') {
          if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') throw httpError(426, 'Нужно WebSocket-подключение');
          const session = await verifySessionToken(url.searchParams.get('token') || '', env);
          if (session.roomId !== roomId) throw httpError(403, 'Сессия относится к другой комнате');
          const headers = new Headers(request.headers);
          headers.set('X-Spy-Player-Id', session.playerId);
          headers.set('X-Spy-Player-Name', session.name);
          return stub.fetch(new Request('https://spy.internal/ws', { method: 'GET', headers }));
        }

        if (action === 'poll' && request.method === 'POST') {
          const session = await verifySessionToken(url.searchParams.get('token') || '', env);
          if (session.roomId !== roomId) throw httpError(403, 'Сессия относится к другой комнате');
          const body = await readJson(request);
          const response = await stub.fetch('https://spy.internal/poll', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Spy-Player-Id': session.playerId,
              'X-Spy-Player-Name': session.name,
            },
            body: JSON.stringify(body),
          });
          const payload = await response.json().catch(() => ({}));
          return json(payload, response.status, cors);
        }
      }

      return json({ ok: false, error: 'Not found' }, 404, cors);
    } catch (error) {
      return json(
        { ok: false, error: String(error?.message || 'Server error'), code: error?.code || 'SERVER_ERROR' },
        Number(error?.status || 500),
        cors,
      );
    }
  },
};

export class SpyRoom extends DurableObject {
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
        // Повторная отправка того же запроса на создание — не новая комната.
        if (normalizedRequestId && this.room.createRequestId === normalizedRequestId && this.room.hostPlayerId === player?.playerId) {
          return json({ ok: true, replayed: true, state: buildView(this.room, player.playerId, this.connectedPlayerIds()) });
        }
        return json({ ok: false, error: 'Room exists' }, 409);
      }
      this.room = createRoomState(normalizeRoomId(roomId), player);
      this.room.createRequestId = normalizedRequestId || null;
      await this.persistAndBroadcast();
      return json({ ok: true, state: buildView(this.room, player.playerId, this.connectedPlayerIds()) }, 201);
    }

    if (request.method === 'POST' && url.pathname === '/join') {
      if (!this.room) return json({ ok: false, error: 'Комната не найдена', code: 'ROOM_NOT_FOUND' }, 404);
      const { player } = await readJson(request);
      try {
        joinRoom(this.room, player);
        await this.persistAndBroadcast();
        return json({ ok: true, state: buildView(this.room, player.playerId, this.connectedPlayerIds()) });
      } catch (error) {
        return json({ ok: false, error: error.message, code: error.code }, Number(error.status || 409));
      }
    }

    if (request.method === 'GET' && url.pathname === '/ws') {
      if (!this.room) return json({ ok: false, error: 'Комната не найдена' }, 404);
      const playerId = request.headers.get('X-Spy-Player-Id') || '';
      const player = this.room.players.find((item) => item.playerId === playerId && item.isActive !== false);
      if (!player) return json({ ok: false, error: 'Игрок не найден в комнате' }, 403);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ playerId, connectedAt: Date.now(), lastActionAt: 0 });
      queueMicrotask(() => this.broadcastState().catch(console.error));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'POST' && url.pathname === '/poll') {
      if (!this.room) return json({ ok: false, error: 'Комната не найдена', code: 'ROOM_NOT_FOUND' }, 404);
      const playerId = request.headers.get('X-Spy-Player-Id') || '';
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
          await this.maybeExpireRound(now);
        }
        if (!this.room) return json({ ok: true, closed: true, transport: 'https' });
        return json({
          ok: true,
          transport: 'https',
          state: buildView(this.room, playerId, this.connectedPlayerIds()),
        });
      } catch (error) {
        return json({ ok: false, error: String(error?.message || error), code: error?.code || 'ACTION_ERROR' }, Number(error?.status || 409));
      }
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
      try { webSocket.send(JSON.stringify({ type: 'pong', at: now })); } catch {}
      return;
    }

    if (payload.type !== 'action') return this.sendError(webSocket, 'Неизвестный тип сообщения', 'BAD_MESSAGE');
    /*
      Лимит ловит шторм, а не паузу между двумя осознанными нажатиями.
      Простой «не чаще раза в 200 мс» отбрасывал законную пару «поменял
      настройку — сразу раздал роли»: change у поля срабатывает от того же
      клика, что и кнопка, и второе действие терялось молча.
    */
    const recent = (attachment.recentActions || []).filter((at) => now - at < ACTION_WINDOW_MS);
    if (recent.length >= ACTION_WINDOW_LIMIT) return this.sendError(webSocket, 'Слишком много действий подряд', 'RATE_LIMIT');
    recent.push(now);
    attachment.recentActions = recent;
    attachment.lastActionAt = now;
    webSocket.serializeAttachment(attachment);

    try {
      await this.applyAction(playerId, String(payload.action || ''), payload.payload || {}, now);
    } catch (error) {
      this.sendError(webSocket, String(error?.message || error), error?.code || 'ACTION_ERROR');
    }
  }

  async applyAction(playerId, action, data, now) {
    if (!this.room) throw Object.assign(new Error('Сессия комнаты недоступна'), { code: 'NO_SESSION' });
    ensureChat(this.room);
    await this.maybeExpireRound(now);

    if (action === 'setSettings') setSettings(this.room, playerId, data, now);
    else if (action === 'rename') renamePlayer(this.room, playerId, String(data.name || ''), now);
    else if (action === 'startGame') startGame(this.room, playerId, LOCATIONS, now);
    else if (action === 'roleSeen') markRoleSeen(this.room, playerId, now);
    else if (action === 'forceDiscussion') forceDiscussion(this.room, playerId, now);
    else if (action === 'beginVoting') beginVoting(this.room, playerId, now);
    else if (action === 'vote') castVote(this.room, playerId, String(data.targetId || ''), now);
    else if (action === 'guess') spyGuess(this.room, playerId, String(data.guess || ''), now);
    else if (action === 'backToLobby') backToLobby(this.room, playerId, now);
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

  // Время обсуждения кончилось — комната сама уходит в голосование, даже
  // если ведущий закрыл вкладку. Иначе партия зависла бы навсегда.
  async maybeExpireRound(now) {
    if (!this.room) return false;
    if (!endRoundByTimeout(this.room, now)) return false;
    await this.ctx.storage.put('room', this.room);
    await this.broadcastState();
    return true;
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
    if (now - Number(this.room.updatedAt || this.room.createdAt || now) >= ROOM_IDLE_TTL_MS) {
      this.closeAllSockets(1001, 'Room expired');
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    const changed = await this.maybeExpireRound(now);
    if (!changed) await this.broadcastState();
    await this.scheduleAlarm();
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
    const roundAt = this.room.status === 'discussion' && this.room.roundDeadlineMs
      ? this.room.roundDeadlineMs
      : Number.POSITIVE_INFINITY;
    const pollExpiryAt = this.pollingPresence.size
      ? Math.min(...this.pollingPresence.values()) + POLL_PRESENCE_TTL_MS
      : Number.POSITIVE_INFINITY;
    await this.ctx.storage.setAlarm(Math.min(cleanupAt, roundAt, pollExpiryAt));
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
    const recent = (this.pollingRateLimits.get(playerId) || []).filter((at) => now - at < ACTION_WINDOW_MS);
    if (recent.length >= ACTION_WINDOW_LIMIT) throw Object.assign(new Error('Слишком много действий подряд'), { code: 'RATE_LIMIT' });
    recent.push(now);
    this.pollingRateLimits.set(playerId, recent);
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
    const connected = this.connectedPlayerIds();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      const playerId = String(attachment.playerId || '');
      try {
        socket.send(JSON.stringify({ type: 'state', state: buildView(this.room, playerId, connected) }));
      } catch (error) {
        console.warn('spy socket send failed', error);
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
    };
  }
  if (String(env.ALLOW_GUESTS || '').toLowerCase() === 'true') {
    const guestId = String(body?.guestId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    if (!guestId) throw httpError(401, 'Не удалось определить гостя');
    return { playerId: `guest:${guestId}`, name: sanitizeName(body?.name || 'Гость') };
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
  if (!constantTimeEqual(expected, hexToBytes(receivedHash))) throw httpError(401, 'Telegram-подпись не прошла проверку');
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
  if (!constantTimeEqual(expected, base64UrlDecode(signatureText))) throw httpError(401, 'Сессия не прошла проверку');
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
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${playerId}\n${requestId}\n${attempt}`)));
  return Array.from(digest.slice(0, 5), (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
}

function randomRoomCode(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
}

async function readJson(request) {
  try { return await request.json(); } catch { throw httpError(400, 'Некорректный JSON'); }
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',').map((item) => item.trim()).filter(Boolean);
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
  return Object.assign(new Error(message), { status, code });
}

async function internalError(response) {
  let payload = null;
  try { payload = await response.json(); } catch {}
  return httpError(response.status || 500, payload?.error || `Internal HTTP ${response.status}`, payload?.code || 'ROOM_ERROR');
}
