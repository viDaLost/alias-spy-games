// Воркер «Земли обетованной»: статика игры и комнаты для игры по сети.
//
// Статику и комнаты держит один воркер — и это не экономия, а устройство.
// Страница игры и её запросы уходят на один и тот же адрес, поэтому здесь нет
// ни CORS, ни списка разрешённых источников, ни расхождения «превью обновили, а
// комнаты остались от прошлой версии». Всё, что начинается с /api/, разбирает
// код ниже; остальное отдаёт раздатчик файлов (см. run_worker_first).
//
// Партию считает сервер, а не устройство хозяина. Иначе честной игры не выйдет:
// состояние с деньгами и уделами лежало бы во вкладке разработчика у каждого,
// и правил бы не было вовсе. Клиент присылает только имя действия — «бросить»,
// «купить», «строить вот здесь», — а что из этого выйдет, решает движок здесь.
//
// Личность игрока подтверждается случайным ключом, выданным комнатой при входе,
// и больше ничем: ни общего секрета, ни подписи. Ключ знает только та комната,
// которая его выдала, живёт он в её же хранилище и умирает вместе с ней —
// настраивать в развёртывании нечего, и забыть настроить тоже нечего.

import { DurableObject } from 'cloudflare:workers';
import {
  MAX_PLAYERS,
  addChatMessage,
  backToLobby,
  buildView,
  createRoomState,
  joinRoom,
  leaveRoom,
  renamePlayer,
  sanitizeName,
  setReady,
  setSettings,
  startGame,
  seated,
} from './room.js';
import { B, E, Bots, GAME_ACTIONS, sanitizeArgs } from './rules.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_IDLE_TTL_MS = 6 * 60 * 60 * 1000;
const POLL_PRESENCE_TTL_MS = 8_000;
// Окно вместо паузы между нажатиями: столько действий за две секунды человек не
// нажмёт, а два подряд — нажмёт обязательно (кнопка «строить» и сразу «конец»).
const ACTION_WINDOW_MS = 2_000;
const ACTION_WINDOW_LIMIT = 16;
// Соперники от игры ходят с той же неспешностью, что и за одним столом: за
// мгновенным ходом не уследить, а по сети — тем более, там смотрят все шестеро.
const BOT_STEP_MS = 850;
const BOT_NAMES = ['Ефрем', 'Асаф', 'Овадия', 'Иеффай', 'Варух'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      if (url.pathname === '/api/health') {
        return json({ ok: true, service: 'promised-land', cells: B.BOARD.length, now: Date.now() });
      }

      if (request.method === 'POST' && url.pathname === '/api/rooms') {
        const body = await readJson(request);
        const player = guest(body);
        // Код подбирается, а не выдаётся по счётчику: занятый отвечает 409, и
        // берётся следующий. Двенадцати попыток хватает с огромным запасом.
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const roomId = randomRoomCode(5);
          const response = await stub(env, roomId).fetch('https://promised.internal/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, player }),
          });
          if (response.status === 409) continue;
          return passThrough(response);
        }
        throw httpError(503, 'Не удалось подобрать свободный код комнаты');
      }

      const match = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]{4,10})(?:\/(join|ws|poll))?$/);
      if (match) {
        const roomId = normalizeRoomId(match[1]);
        const action = match[2] || '';
        const room = stub(env, roomId);

        if (action === 'join' && request.method === 'POST') {
          const body = await readJson(request);
          return passThrough(await room.fetch('https://promised.internal/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player: guest(body) }),
          }));
        }

        if (action === 'ws' && request.method === 'GET') {
          if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
            throw httpError(426, 'Нужно WebSocket-подключение');
          }
          const headers = new Headers(request.headers);
          headers.set('X-Room-Token', url.searchParams.get('token') || '');
          return room.fetch(new Request('https://promised.internal/ws', { method: 'GET', headers }));
        }

        if (action === 'poll' && request.method === 'POST') {
          return passThrough(await room.fetch('https://promised.internal/poll', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Room-Token': url.searchParams.get('token') || '',
            },
            body: JSON.stringify(await readJson(request)),
          }));
        }
      }

      return json({ ok: false, error: 'Не найдено' }, 404);
    } catch (error) {
      return json(
        { ok: false, error: String(error?.message || 'Ошибка сервера'), code: error?.code || 'SERVER_ERROR' },
        Number(error?.status || 500),
      );
    }
  },
};

export class PromisedLandRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.game = null;
    this.tokens = new Map();
    this.presence = new Map();
    this.botAt = 0;
    this.rates = new Map();
    this.seenRequests = new Map();
    this.ctx.blockConcurrencyWhile(async () => {
      this.room = (await this.ctx.storage.get('room')) || null;
      this.game = (await this.ctx.storage.get('game')) || null;
      this.tokens = new Map(Object.entries((await this.ctx.storage.get('tokens')) || {}));
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/create') {
      if (this.room) return json({ ok: false, error: 'Комната занята' }, 409);
      const { roomId, player } = await readJson(request);
      this.room = createRoomState(normalizeRoomId(roomId), player);
      const token = this.issueToken(player.playerId);
      await this.persist();
      return json({ ok: true, roomId: this.room.roomId, token, view: this.viewFor(player.playerId) }, 201);
    }

    if (request.method === 'POST' && url.pathname === '/join') {
      if (!this.room) return json({ ok: false, error: 'Такой комнаты нет', code: 'ROOM_NOT_FOUND' }, 404);
      const { player } = await readJson(request);
      try {
        joinRoom(this.room, player);
        const token = this.issueToken(player.playerId);
        await this.persist();
        return json({ ok: true, roomId: this.room.roomId, token, view: this.viewFor(player.playerId) });
      } catch (error) {
        return json({ ok: false, error: error.message, code: error.code }, 409);
      }
    }

    if (request.method === 'GET' && url.pathname === '/ws') {
      const playerId = this.playerByToken(request.headers.get('X-Room-Token'));
      if (!playerId) return json({ ok: false, error: 'Комната вас не знает', code: 'NO_SESSION' }, 403);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ playerId, recent: [] });
      queueMicrotask(() => this.broadcast().catch(console.error));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'POST' && url.pathname === '/poll') {
      const playerId = this.playerByToken(request.headers.get('X-Room-Token'));
      if (!playerId) return json({ ok: false, error: 'Комната вас не знает', code: 'NO_SESSION' }, 403);
      const payload = await readJson(request);
      const now = Date.now();
      this.presence.set(playerId, now);
      await this.scheduleAlarm();
      try {
        const name = String(payload.action || '');
        const requestId = String(payload.requestId || '').slice(0, 96);
        // Опрос по HTTP повторяют при обрыве, и повтор не должен ходить дважды.
        if (name && !this.alreadyDone(playerId, requestId)) {
          this.limit(playerId, now);
          const result = await this.apply(playerId, name, payload.payload || {}, now);
          this.remember(playerId, requestId);
          if (result?.closed) return json({ ok: true, closed: true });
        }
        if (!this.room) return json({ ok: true, closed: true });
        return json({ ok: true, view: this.viewFor(playerId) });
      } catch (error) {
        return json({ ok: false, error: String(error?.message || error), code: error?.code || 'ACTION_ERROR' }, 409);
      }
    }

    return json({ ok: false, error: 'Не найдено' }, 404);
  }

  async webSocketMessage(socket, message) {
    let payload;
    try {
      payload = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      return this.fail(socket, 'Непонятное сообщение', 'BAD_MESSAGE');
    }
    const attachment = socket.deserializeAttachment() || {};
    const playerId = String(attachment.playerId || '');
    if (!playerId || !this.room) return this.fail(socket, 'Комната недоступна', 'NO_SESSION');
    const now = Date.now();

    if (payload.type === 'ping') {
      try { socket.send(JSON.stringify({ type: 'pong', at: now })); } catch { /* закрылось */ }
      return;
    }
    if (payload.type !== 'action') return this.fail(socket, 'Непонятный тип сообщения', 'BAD_MESSAGE');

    const recent = (attachment.recent || []).filter((at) => now - at < ACTION_WINDOW_MS);
    if (recent.length >= ACTION_WINDOW_LIMIT) return this.fail(socket, 'Слишком много действий подряд', 'RATE_LIMIT');
    recent.push(now);
    socket.serializeAttachment({ ...attachment, recent });

    try {
      await this.apply(playerId, String(payload.action || ''), payload.payload || {}, now);
    } catch (error) {
      this.fail(socket, String(error?.message || error), error?.code || 'ACTION_ERROR');
    }
  }

  /*
    Единственное место, где комната меняется. Действия лобби и действия партии
    разведены нарочно: в лобби говорит любой, а в партии — только тот, чей ход,
    и проверяет это сервер, а не спрятанная кнопка на экране.
  */
  async apply(playerId, name, data, now) {
    if (!this.room) throw fail('Комната недоступна', 'NO_SESSION');

    if (name === 'rename') renamePlayer(this.room, playerId, String(data.name || ''), now);
    else if (name === 'ready') setReady(this.room, playerId, Boolean(data.ready), now);
    else if (name === 'settings') setSettings(this.room, playerId, data, now);
    else if (name === 'chat') addChatMessage(this.room, playerId, String(data.text || ''), now);
    else if (name === 'start') this.startPlaying(playerId, now);
    else if (name === 'backToLobby') {
      backToLobby(this.room, playerId, now);
      this.game = null;
    } else if (name === 'game') this.playAction(playerId, data);
    else if (name === 'leave') {
      leaveRoom(this.room, playerId, now);
      this.forget(playerId);
      if (!seated(this.room).length) {
        await this.ctx.storage.deleteAll();
        this.room = null;
        this.game = null;
        this.closeSockets(1000, 'Комната закрыта');
        return { closed: true };
      }
    } else throw fail('Неизвестное действие', 'UNKNOWN_ACTION');

    await this.persist();
    return { closed: false };
  }

  startPlaying(playerId, now) {
    startGame(this.room, playerId, now);
    const table = this.room.seats.map((id) => this.room.players.find((one) => one.id === id));
    const players = table.map((one) => ({ name: one.name }));
    const bots = Math.max(0, Math.min(Number(this.room.settings.bots || 0), MAX_PLAYERS - players.length));
    for (let i = 0; i < bots; i += 1) {
      players.push({ name: BOT_NAMES[i], isBot: true, botLevel: i % 2 ? 'scribe' : 'elder' });
    }
    const last = this.room.settings.mode === 'last';
    this.game = E.createGame({
      players,
      years: last ? 7 : Number(this.room.settings.years),
      mode: last ? 'last' : 'jubilee',
    });
    this.room.startedAt = now;
  }

  playAction(playerId, data) {
    if (this.room.phase !== 'playing' || !this.game) throw fail('Партия ещё не началась', 'NOT_PLAYING');
    if (this.game.status !== 'playing') throw fail('Партия окончена', 'GAME_OVER');
    const name = String(data.name || '');
    if (!GAME_ACTIONS.has(name)) throw fail('Такого хода нет', 'UNKNOWN_MOVE');
    const seat = this.room.seats.indexOf(playerId);
    if (seat < 0) throw fail('Вас нет за столом', 'NOT_SEATED');
    /*
      Чужой ход не сделать ничьими руками. Движок и сам ходит только текущим
      игроком — но он верит тому, кто его позвал, а верить можно лишь здесь.
    */
    if (E.current(this.game).id !== `p${seat}`) throw fail('Сейчас не ваш ход', 'NOT_YOUR_TURN');
    E[name](this.game, ...sanitizeArgs(data.args));
  }

  /*
    Ход соперника от игры. Один шаг за побудку, а не вся его очередь разом:
    иначе между двумя нажатиями человека на доске успевает произойти десяток
    событий, и понять, что изменилось и почему, нельзя.
  */
  async stepBots() {
    if (!this.game || this.game.status !== 'playing') return false;
    const player = E.current(this.game);
    if (!player.isBot) return false;
    if (!Bots.step(this.game)) E.endTurn(this.game);
    // Срок сброшен: следующий шаг отсчитывается от этого хода, а не от прошлого.
    this.botAt = 0;
    await this.persist();
    return true;
  }

  async alarm() {
    const now = Date.now();
    if (!this.room) return;
    if (now - Number(this.room.updatedAt || this.room.createdAt || now) >= ROOM_IDLE_TTL_MS) {
      this.closeSockets(1001, 'Комната остыла');
      await this.ctx.storage.deleteAll();
      this.room = null;
      this.game = null;
      return;
    }
    if (await this.stepBots()) return;
    await this.broadcast();
    await this.scheduleAlarm();
  }

  async persist() {
    if (!this.room) return;
    await this.ctx.storage.put('room', this.room);
    if (this.game) await this.ctx.storage.put('game', this.game);
    else await this.ctx.storage.delete('game');
    await this.ctx.storage.put('tokens', Object.fromEntries(this.tokens));
    await this.scheduleAlarm();
    await this.broadcast();
  }

  /*
    Когда ходить сопернику от игры. Срок назначается один раз на ход и потом
    только читается — и это не мелочь: пока он вычислялся как «сейчас плюс
    пауза», каждый опрос отодвигал его на ту же паузу вперёд. Клиент, который
    спрашивает новости чаще, чем соперник думает, так не давал ему походить
    вовсе, и партия вставала на его ходу навсегда.
  */
  botDeadline() {
    if (!this.game || this.game.status !== 'playing' || !E.current(this.game).isBot) {
      this.botAt = 0;
      return Number.POSITIVE_INFINITY;
    }
    if (!this.botAt) this.botAt = Date.now() + BOT_STEP_MS;
    return this.botAt;
  }

  async scheduleAlarm() {
    if (!this.room) return;
    /*
      Просроченные опросы вычёркиваются здесь, а не только при сборке вида.
      Иначе будильник, заведённый ради них, будит комнату, ничего не находит,
      заводит себя на то же прошедшее время — и крутится так до самой смерти
      комнаты, считаясь за настоящую работу.
    */
    this.online();
    const idleAt = Number(this.room.updatedAt || Date.now()) + ROOM_IDLE_TTL_MS;
    const botAt = this.botDeadline();
    const pollAt = this.presence.size
      ? Math.min(...this.presence.values()) + POLL_PRESENCE_TTL_MS
      : Number.POSITIVE_INFINITY;
    await this.ctx.storage.setAlarm(Math.min(idleAt, botAt, pollAt));
  }

  viewFor(playerId) {
    return { ...buildView(this.room, playerId, this.online()), game: this.game };
  }

  online() {
    const ids = new Set();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      if (attachment.playerId) ids.add(String(attachment.playerId));
    }
    const now = Date.now();
    for (const [id, seenAt] of this.presence) {
      if (now - Number(seenAt) <= POLL_PRESENCE_TTL_MS) ids.add(id);
      else this.presence.delete(id);
    }
    return ids;
  }

  async broadcast() {
    if (!this.room) return;
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      try {
        socket.send(JSON.stringify({ type: 'view', view: this.viewFor(String(attachment.playerId || '')) }));
      } catch (error) {
        console.warn('комната: сообщение не ушло', error);
      }
    }
  }

  issueToken(playerId) {
    const id = String(playerId || '');
    for (const [token, owner] of this.tokens) if (owner === id) this.tokens.delete(token);
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    this.tokens.set(token, id);
    return token;
  }

  playerByToken(token) {
    const id = this.tokens.get(String(token || ''));
    return id && this.room ? id : '';
  }

  forget(playerId) {
    for (const [token, owner] of this.tokens) if (owner === playerId) this.tokens.delete(token);
    this.presence.delete(playerId);
    this.rates.delete(playerId);
    this.seenRequests.delete(playerId);
  }

  limit(playerId, now) {
    const recent = (this.rates.get(playerId) || []).filter((at) => now - at < ACTION_WINDOW_MS);
    if (recent.length >= ACTION_WINDOW_LIMIT) throw fail('Слишком много действий подряд', 'RATE_LIMIT');
    recent.push(now);
    this.rates.set(playerId, recent);
  }

  alreadyDone(playerId, requestId) {
    return Boolean(requestId) && (this.seenRequests.get(playerId) || []).includes(requestId);
  }

  remember(playerId, requestId) {
    if (!requestId) return;
    const seen = this.seenRequests.get(playerId) || [];
    seen.push(requestId);
    if (seen.length > 128) seen.splice(0, seen.length - 128);
    this.seenRequests.set(playerId, seen);
  }

  async webSocketClose(socket, code, reason) {
    try { socket.close(code, reason); } catch { /* уже закрыт */ }
    if (this.room) await this.broadcast();
  }

  async webSocketError(socket) {
    try { socket.close(1011, 'Обрыв'); } catch { /* уже закрыт */ }
    if (this.room) await this.broadcast();
  }

  fail(socket, error, code) {
    try { socket.send(JSON.stringify({ type: 'error', error, code })); } catch { /* уже закрыт */ }
  }

  closeSockets(code, reason) {
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.close(code, reason); } catch { /* уже закрыт */ }
    }
  }
}

/*
  Кто вошёл. Игру открывают из приложения, и свой вечный номер оно передаёт
  само; когда его нет — например, страницу открыли прямо по ссылке, — годится
  и случайный, лишь бы он держался в этом браузере. Проверять его нечем и
  незачем: за столом на шестерых человек и так видит, кто рядом, а прятать в
  этой игре нечего — доска открыта вся, целиком, всем.
*/
function guest(body) {
  const raw = String(body?.playerId || '').replace(/[^A-Za-z0-9_:-]/g, '').slice(0, 64);
  if (!raw) throw httpError(400, 'Игрок не назвался');
  return { playerId: raw, name: sanitizeName(body?.name) };
}

const stub = (env, roomId) => env.ROOMS.get(env.ROOMS.idFromName(normalizeRoomId(roomId)));
const normalizeRoomId = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

function randomRoomCode(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
}

async function readJson(request) {
  try { return await request.json(); } catch { throw httpError(400, 'Непонятный запрос'); }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Ответ комнаты уходит наружу как есть: заголовки у него уже те, что нужны. */
async function passThrough(response) {
  return json(await response.json().catch(() => ({ ok: false, error: 'Комната не ответила' })), response.status);
}

const httpError = (status, message, code = 'HTTP_ERROR') => Object.assign(new Error(message), { status, code });
const fail = (message, code) => Object.assign(new Error(message), { code });
