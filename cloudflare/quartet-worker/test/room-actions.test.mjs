import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoomState, joinRoom, startGame } from '../src/engine.js';
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

function fixture() {
  const state = createRoomState('ABC123', { playerId: 'p1' }, 1);
  for (const playerId of ['p2', 'p3']) joinRoom(state, { playerId }, 2);
  startGame(state, 'p1', Date.now(), (max) => max - 1);
  const sent = [];
  let attachment = { playerId: 'p1' };
  const socket = {
    deserializeAttachment: () => attachment,
    serializeAttachment: (next) => { attachment = next; },
    send: (data) => sent.push(JSON.parse(data)),
  };
  let load;
  const room = new QuartetRoom({
    blockConcurrencyWhile: (callback) => { load = callback(); },
    storage: { get: async (key) => key === 'room' ? state : 0, put: async () => {}, setAlarm: async () => {} },
    getWebSockets: () => [socket],
  }, { APP_ACCESS: { check: async () => ({ allowed: true }) } });
  const send = async (action, requestId, payload) => {
    await load;
    await room.webSocketMessage(socket, JSON.stringify({ type: 'action', action, requestId, payload }));
  };
  return { state, sent, send };
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
