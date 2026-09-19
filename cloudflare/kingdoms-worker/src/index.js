// «Царства» по сети: комнаты на Durable Objects.
//
// Устройство повторяет воркер «Двенадцати колен» — там этот контур уже
// отработан: код комнаты, сессия на HMAC, WebSocket с запасным HTTP-опросом.
// Отличия те же по духу, только другая игра.
//
// Первое: закрытый приказ — тайна. Его вид и сила живут только в Durable
// Object, наружу их отдаёт единственная функция buildView (через
// kingdoms-engine.js: visibleStateFor), собирая отдельный вид для каждого
// игрока. Полное состояние партии не покидает воркер ни разу.
//
// Второе: за столом ходят не только люди. Соперники от игры и не успевшие
// разместить приказ идут по будильнику комнаты, а раскрытие раунда вообще не
// ждёт ничьего действия — оно готово, как только все разместили приказы или
// не успели. Поэтому у комнаты есть свой ход времени, и он живёт здесь.

import { DurableObject } from 'cloudflare:workers';
import {
  BOT_STEP_MS,
  backToLobby,
  playAgain,
  buildView,
  createRoomState,
  forStorage,
  joinRoom,
  leaveRoom,
  nextRound,
  nextStepAt,
  playerAction,
  renamePlayer,
  reviveGame,
  sanitizeName,
  setReady,
  setSettings,
  startGame,
  stepTable,
} from './room.js';

const encoder = new TextEncoder();
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const ROOM_IDLE_TTL_MS = 6 * 60 * 60 * 1000;
const POLL_PRESENCE_TTL_MS = 8000;
// Скользящее окно вместо минимальной паузы: столько приказов за столько
// миллисекунд человек не разместит, а один клик и его подтверждение — успеет.
const ACTION_WINDOW_MS = 2000;
const ACTION_WINDOW_LIMIT = 10;

/** Что игрок вправе попросить у комнаты. Список закрытый и проверяется весь. */
const ROOM_ACTIONS = new Set([
  'setSettings', 'rename', 'ready', 'startGame', 'backToLobby', 'playAgain', 'nextRound', 'leave',
]);
const GAME_ACTIONS = new Set(['placeOrder', 'skipTurn']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/health') {
        return json({ ok: true, service: 'alias-spy-games-kingdoms', now: Date.now() }, 200, cors);
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
          const response = await stub.fetch('https://kingdoms.internal/create', {
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
          const response = await stub.fetch('https://kingdoms.internal/join', {
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
          if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
            throw httpError(426, 'Нужно WebSocket-подключение');
          }
          const session = await verifySessionToken(url.searchParams.get('token') || '', env);
          if (session.roomId !== roomId) throw httpError(403, 'Сессия относится к другой комнате');
          const headers = new Headers(request.headers);
          headers.set('X-Kingdoms-Player-Id', session.playerId);
          headers.set('X-Kingdoms-Player-Name', session.name);
          return stub.fetch(new Request('https://kingdoms.internal/ws', { method: 'GET', headers }));
        }

        if (action === 'poll' && request.method === 'POST') {
          const session = await verifySessionToken(url.searchParams.get('token') || '', env);
          if (session.roomId !== roomId) throw httpError(403, 'Сессия относится к другой комнате');
          const body = await readJson(request);
          const response = await stub.fetch('https://kingdoms.internal/poll', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Kingdoms-Player-Id': session.playerId,
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

export class KingdomsRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.pollingPresence = new Map();
    this.pollingRateLimits = new Map();
    this.pollingActionIds = new Map();
    this.ctx.blockConcurrencyWhile(async () => {
      this.room = reviveGame((await this.ctx.storage.get('room')) || null);
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/create') {
      const { roomId, player, createRequestId } = await readJson(request);
      const normalizedRequestId = normalizeRequestId(createRequestId);
      if (this.room) {
        if (normalizedRequestId && this.room.createRequestId === normalizedRequestId
          && this.room.hostPlayerId === player?.playerId) {
          return json({ ok: true, replayed: true, state: this.view(player.playerId) });
        }
        return json({ ok: false, error: 'Room exists' }, 409);
      }
      this.room = createRoomState(normalizeRoomId(roomId), player);
      this.room.createRequestId = normalizedRequestId || null;
      await this.persistAndBroadcast();
      return json({ ok: true, state: this.view(player.playerId) }, 201);
    }

    if (request.method === 'POST' && url.pathname === '/join') {
      if (!this.room) return json({ ok: false, error: 'Комната не найдена', code: 'ROOM_NOT_FOUND' }, 404);
      const { player } = await readJson(request);
      try {
        joinRoom(this.room, player);
        await this.persistAndBroadcast();
        return json({ ok: true, state: this.view(player.playerId) });
      } catch (error) {
        return json({ ok: false, error: error.message, code: error.code }, Number(error.status || 409));
      }
    }

    if (request.method === 'GET' && url.pathname === '/ws') {
      if (!this.room) return json({ ok: false, error: 'Комната не найдена' }, 404);
      const playerId = request.headers.get('X-Kingdoms-Player-Id') || '';
      if (!this.room.players.some((one) => one.id === playerId)) {
        return json({ ok: false, error: 'Игрок не найден в комнате' }, 403);
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ playerId, connectedAt: Date.now(), recentActions: [] });
      queueMicrotask(() => this.broadcastState().catch(console.error));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'POST' && url.pathname === '/poll') {
      if (!this.room) return json({ ok: false, error: 'Комната не найдена', code: 'ROOM_NOT_FOUND' }, 404);
      const playerId = request.headers.get('X-Kingdoms-Player-Id') || '';
      if (!this.room.players.some((one) => one.id === playerId)) {
        return json({ ok: false, error: 'Игрок не найден в комнате', code: 'PLAYER_NOT_FOUND' }, 403);
      }
      const payload = await readJson(request);
      const now = Date.now();
      this.pollingPresence.set(playerId, now);
      try {
        const action = String(payload.action || '');
        const requestId = String(payload.requestId || '').slice(0, 96);
        if (action && !this.hasProcessedPollingAction(playerId, requestId)) {
          this.enforcePollingRateLimit(playerId, now);
          const result = await this.applyAction(playerId, action, payload.payload || {}, now);
          this.rememberPollingAction(playerId, requestId);
          if (result.deleted) return json({ ok: true, closed: true, transport: 'https' });
        } else {
          await this.maybeStep(now);
        }
        if (!this.room) return json({ ok: true, closed: true, transport: 'https' });
        await this.scheduleAlarm();
        return json({ ok: true, transport: 'https', state: this.view(playerId) });
      } catch (error) {
        return json(
          { ok: false, error: String(error?.message || error), code: error?.code || 'ACTION_ERROR' },
          Number(error?.status || 409),
        );
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
      try { webSocket.send(JSON.stringify({ type: 'pong', at: now })); } catch { /* закрылся */ }
      return;
    }
    if (payload.type !== 'action') return this.sendError(webSocket, 'Неизвестный тип сообщения', 'BAD_MESSAGE');

    const recent = (attachment.recentActions || []).filter((at) => now - at < ACTION_WINDOW_MS);
    if (recent.length >= ACTION_WINDOW_LIMIT) return this.sendError(webSocket, 'Слишком много действий подряд', 'RATE_LIMIT');
    recent.push(now);
    attachment.recentActions = recent;
    webSocket.serializeAttachment(attachment);

    /*
      Требование «повторная отправка не выполняет действие дважды»
      действует и здесь, не только в опросе: сокет иногда доставляет
      сообщение дважды после короткого разрыва и переподключения.
    */
    const requestId = String(payload.requestId || '').slice(0, 96);
    if (requestId && this.hasProcessedPollingAction(playerId, requestId)) {
      try { webSocket.send(JSON.stringify({ type: 'state', state: this.view(playerId) })); } catch { /* закрылся */ }
      return;
    }
    try {
      await this.applyAction(playerId, String(payload.action || ''), payload.payload || {}, now);
      if (requestId) this.rememberPollingAction(playerId, requestId);
    } catch (error) {
      this.sendError(webSocket, String(error?.message || error), error?.code || 'ACTION_ERROR');
    }
  }

  async applyAction(playerId, action, data, now) {
    if (!this.room) throw Object.assign(new Error('Сессия комнаты недоступна'), { code: 'NO_SESSION' });
    await this.maybeStep(now);
    if (!this.room) throw Object.assign(new Error('Комната закрыта'), { code: 'ROOM_CLOSED' });

    if (GAME_ACTIONS.has(action)) {
      playerAction(this.room, playerId, action, data, now);
    } else if (!ROOM_ACTIONS.has(action)) {
      throw Object.assign(new Error('Неизвестное действие'), { code: 'UNKNOWN_ACTION' });
    } else if (action === 'setSettings') {
      setSettings(this.room, playerId, data, now);
    } else if (action === 'rename') {
      renamePlayer(this.room, playerId, String(data.name || ''), now);
    } else if (action === 'ready') {
      setReady(this.room, playerId, Boolean(data.ready), now);
    } else if (action === 'startGame') {
      startGame(this.room, playerId, now);
    } else if (action === 'backToLobby') {
      backToLobby(this.room, playerId, now);
    } else if (action === 'playAgain') {
      playAgain(this.room, playerId, now);
    } else if (action === 'nextRound') {
      nextRound(this.room, playerId, now);
    } else if (action === 'leave') {
      leaveRoom(this.room, playerId, now);
      this.pollingPresence.delete(playerId);
      this.pollingRateLimits.delete(playerId);
      this.pollingActionIds.delete(playerId);
      if (!this.room.players.length) {
        await this.ctx.storage.deleteAll();
        this.room = null;
        this.closeAllSockets(1000, 'Room closed');
        return { deleted: true };
      }
    }

    await this.persistAndBroadcast();
    return { deleted: false };
  }

  /*
    Ход стола без действия человека: соперник от игры, пропуск не успевшего
    или разрешение раунда. Несколько шагов за вызов — раскрытие может само
    закончить раунд и тут же начать разрешать следующий, если и там уже всё
    готово (пустая доля секунды между действиями людей).
  */
  async maybeStep(now) {
    if (!this.room) return false;
    const online = this.connectedPlayerIds();
    let moved = false;
    for (let guard = 0; guard < 6; guard += 1) {
      const at = nextStepAt(this.room, now, online);
      if (!at || at > now) break;
      if (!stepTable(this.room, now, Math.random, online)) break;
      moved = true;
    }
    if (moved) {
      await this.ctx.storage.put('room', forStorage(this.room));
      await this.broadcastState();
    }
    return moved;
  }

  async webSocketClose(webSocket, code, reason) {
    try { webSocket.close(code, reason); } catch { /* уже закрыт */ }
    if (!this.room) return;
    await this.broadcastState();
    await this.ctx.storage.setAlarm(Date.now() + 1500);
  }

  async webSocketError(webSocket) {
    try { webSocket.close(1011, 'WebSocket error'); } catch { /* уже закрыт */ }
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
    const moved = await this.maybeStep(now);
    if (!moved) await this.broadcastState();
    await this.scheduleAlarm();
  }

  async persistAndBroadcast() {
    if (!this.room) return;
    await this.ctx.storage.put('room', forStorage(this.room));
    await this.scheduleAlarm();
    await this.broadcastState();
  }

  async scheduleAlarm() {
    if (!this.room) return;
    const now = Date.now();
    const cleanupAt = Number(this.room.updatedAt || now) + ROOM_IDLE_TTL_MS;
    const stepAt = nextStepAt(this.room, now, this.connectedPlayerIds()) || Number.POSITIVE_INFINITY;
    const pollExpiryAt = this.pollingPresence.size
      ? Math.min(...this.pollingPresence.values()) + POLL_PRESENCE_TTL_MS
      : Number.POSITIVE_INFINITY;
    const at = Math.min(cleanupAt, Math.max(stepAt, now + BOT_STEP_MS / 3), pollExpiryAt);
    await this.ctx.storage.setAlarm(at);
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

  view(playerId) {
    return buildView(this.room, playerId, this.connectedPlayerIds());
  }

  enforcePollingRateLimit(playerId, now) {
    const recent = (this.pollingRateLimits.get(playerId) || []).filter((at) => now - at < ACTION_WINDOW_MS);
    if (recent.length >= ACTION_WINDOW_LIMIT) {
      throw Object.assign(new Error('Слишком много действий подряд'), { code: 'RATE_LIMIT' });
    }
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
        console.warn('kingdoms socket send failed', error);
      }
    }
  }

  sendError(webSocket, message, code) {
    try { webSocket.send(JSON.stringify({ type: 'error', error: message, code })); } catch { /* закрылся */ }
  }

  closeAllSockets(code, reason) {
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.close(code, reason); } catch { /* уже закрыт */ }
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
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
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
  const allowed = String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io')
    .split(',').map((item) => item.trim()).filter(Boolean);
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
  try { payload = await response.json(); } catch { /* тело не JSON */ }
  return httpError(response.status || 500, payload?.error || `Internal HTTP ${response.status}`, payload?.code || 'ROOM_ERROR');
}
