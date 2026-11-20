import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoomState, joinRoom, startGame, TURN_TIMEOUT_MS } from '../src/engine.js';
import { CARD_TO_QUARTET } from '../src/catalog.js';

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') {
      return { shortCircuit: true, url: 'data:text/javascript,export class DurableObject {}' };
    }
    return next(specifier, context);
  },
});
const { default: worker, QuartetRoom } = await import('../src/index-admin-observer-v2.js');
hooks.deregister();

function fixture({ playing = true } = {}) {
  const state = createRoomState('ABC123', { playerId: 'p1' }, 1);
  for (const playerId of ['p2', 'p3']) joinRoom(state, { playerId }, 2);
  if (playing) startGame(state, 'p1', Date.now(), (max) => max - 1);
  const sent = [];
  let attachment = { playerId: 'p1' };
  const socket = {
    readyState: 1,
    deserializeAttachment: () => attachment,
    serializeAttachment: (next) => { attachment = next; },
    send: (data) => sent.push(JSON.parse(data)),
  };
  const sockets = [socket];
  const storage = new Map([['room', state]]);
  let alarmAt;
  let load;
  const room = new QuartetRoom({
    blockConcurrencyWhile: (callback) => { load = callback(); },
    storage: { get: async (key) => storage.get(key), put: async (key, value) => storage.set(key, value), setAlarm: async (time) => { alarmAt = time; } },
    getWebSockets: () => sockets,
  }, { APP_ACCESS: { check: async () => ({ allowed: true }) } });
  const send = async (action, requestId, payload) => {
    await load;
    await room.webSocketMessage(socket, JSON.stringify({ type: 'action', action, requestId, payload }));
  };
  return { state, sent, send, room, sockets, storage, loaded: load, alarm: () => alarmAt };
}

test('запрос после дедлайна передаёт ход и не переносит карту', async () => {
  const { state, sent, send } = fixture();
  const [host, other] = state.players;
  const quartet = CARD_TO_QUARTET.get(host.hand[0]);
  const cardId = other.hand.find((id) => CARD_TO_QUARTET.get(id) === quartet);
  assert.ok(cardId);
  state.turnDeadlineMs = Date.now() - 1;
  await send('askCard', 'late-ask', { targetId: other.playerId, cardId });
  assert.ok(other.hand.includes(cardId));
  assert.equal(state.turnPlayerId, other.playerId);
  assert.equal(state.lastEvent.type, 'turn_timeout');
  assert.equal(sent[0].state.turnPlayerId, other.playerId);
  assert.equal(sent[1].code, 'TURN_EXPIRED');
  assert.equal(sent[1].requestId, 'late-ask');
});

test('подтверждение хода и ошибка чата возвращаются с разными идентификаторами', async () => {
  const { state, sent, send } = fixture();
  const [host, other] = state.players;
  const quartet = CARD_TO_QUARTET.get(host.hand[0]);
  const cardId = other.hand.find((id) => CARD_TO_QUARTET.get(id) === quartet);
  await send('askCard', 'game-request', { targetId: other.playerId, cardId });
  assert.ok(host.hand.includes(cardId));
  assert.deepEqual(sent.at(-1), { type: 'actionOk', requestId: 'game-request' });
  await send('chat', 'chat-request', { text: ' ' });
  assert.equal(sent.at(-1).code, 'EMPTY_CHAT');
  assert.equal(sent.at(-1).requestId, 'chat-request');
  assert.equal(sent.at(-1).action, 'chat');
});

test('игрок с кириллицей в имени подключается через WebSocket и HTTPS', async () => {
  const base = 'https://quartet.example';
  const env = {
    ALLOW_GUESTS: 'true',
    SESSION_SECRET: 'quartet-unit-test-secret',
    APP_ACCESS: { check: async () => ({ allowed: true }) },
    ROOMS: {
      idFromName: (name) => name,
      get: () => ({
        async fetch(input, init) {
          const request = new Request(input, init);
          if (new URL(request.url).pathname !== '/create') {
            assert.equal(request.headers.get('X-Quartet-Player-Id'), 'guest:room-tester');
          }
          return Response.json({ ok: true });
        },
      }),
    },
  };
  const created = await worker.fetch(new Request(base + '/rooms', {
    method: 'POST',
    body: JSON.stringify({ guestId: 'room-tester', name: 'Руфь' }),
  }), env);
  assert.equal(created.status, 201);
  const { roomId, sessionToken } = await created.json();
  const url = (action) => `${base}/rooms/${roomId}/${action}?token=${encodeURIComponent(sessionToken)}`;
  const socket = await worker.fetch(new Request(url('ws'), { headers: { Upgrade: 'websocket' } }), env);
  const polling = await worker.fetch(new Request(url('poll'), { method: 'POST', body: '{}' }), env);
  assert.equal(socket.status, 200);
  assert.equal(polling.status, 200);
});

test('ведущий получает кнопку через три минуты, а активное соединение отменяет удаление', async (t) => {
  const now = Date.now();
  t.mock.timers.enable({ apis: ['Date'], now });
  const { room, state, loaded, sockets, storage, alarm } = fixture({ playing: false });
  state.updatedAt = now;
  await loaded;
  const guest = { readyState: 1, deserializeAttachment: () => ({ playerId: 'p2' }), send() {}, close() { this.readyState = 3; } };
  sockets.push(guest);
  await room.broadcastState();
  assert.equal(room.offlineSince.has('p2'), false);
  await room.webSocketClose(guest, 1000, '');
  assert.equal(room.offlineSince.get('p2'), now);
  assert.ok(storage.get('offlineSince').some(([id, since]) => id === 'p2' && since === now));
  assert.equal(alarm(), now + 180_000);
  const payload = { targetId: 'p2' };
  t.mock.timers.setTime(now + 179_999);
  assert.equal(room.buildClientView('p1').players[1].canRemove, false);
  await assert.rejects(room.applyAction('p1', 'removeOfflinePlayer', payload, Date.now()), { code: 'PLAYER_NOT_OFFLINE_LONG_ENOUGH' });

  t.mock.timers.setTime(now + 180_000);
  assert.equal(room.buildClientView('p1').players[1].canRemove, true);
  assert.equal(room.buildClientView('p3').players[1].canRemove, undefined);
  await assert.rejects(room.applyAction('p3', 'removeOfflinePlayer', payload, Date.now()), { code: 'HOST_ONLY' });
  guest.readyState = 1;
  await assert.rejects(room.applyAction('p1', 'removeOfflinePlayer', payload, Date.now()), { code: 'PLAYER_NOT_OFFLINE_LONG_ENOUGH' });
  await room.broadcastState();
  assert.equal(room.offlineSince.has('p2'), false);
});

test('удаление из партии сохраняет карты, передаёт ход и блокирует повторный вход', async () => {
  const { room, state, loaded } = fixture();
  await loaded;
  const [host, other] = state.players;
  const now = Date.now();
  state.turnPlayerId = other.playerId;
  state.turnDeadlineMs = now + TURN_TIMEOUT_MS;
  room.offlineSince.set(other.playerId, now - 180_000);
  const deckSize = () => state.players.reduce((sum, player) => sum + player.hand.length + 4 * player.completedQuartets.length, 0);
  const total = deckSize();
  await room.applyAction(host.playerId, 'removeOfflinePlayer', { targetId: other.playerId }, now);
  assert.equal(other.isActive, false);
  assert.notEqual(state.turnPlayerId, other.playerId);
  assert.equal(state.turnDeadlineMs, now + TURN_TIMEOUT_MS);
  assert.equal(deckSize(), total);
  assert.throws(() => joinRoom(state, { playerId: other.playerId }), { code: 'REMOVED_FROM_ROOM' });
});
