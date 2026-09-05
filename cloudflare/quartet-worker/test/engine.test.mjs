import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { askCard, buildView, createRoomState, joinRoom, ROOM_LIMIT, startGame } from '../src/engine.js';

function deterministicRng(max) { return max - 1; }
function player(id, name = id) { return { playerId: id, name }; }

test('room can be created and joined', () => {
  const state = createRoomState('ABC123', player('p1', 'Анна'), 1);
  joinRoom(state, player('p2', 'Пётр'), 2);
  assert.equal(state.players.length, 2);
  assert.equal(state.hostPlayerId, 'p1');
});

test('start deals all cards without leaking opponents hands in view', () => {
  const state = createRoomState('ABC123', player('p1'), 1);
  joinRoom(state, player('p2'), 2);
  startGame(state, 'p1', 3, deterministicRng);
  const total = state.players.reduce((sum, item) => sum + item.hand.length + item.completedQuartets.length * 4, 0);
  assert.equal(total, CATALOG.length * 4);
  const view = buildView(state, 'p1', new Set(['p1', 'p2']));
  assert.ok(Array.isArray(view.me.hand));
  assert.equal('hand' in view.players[1], false);
});

test('successful ask transfers a card and keeps the turn', () => {
  const state = createRoomState('ABC123', player('p1'), 1);
  joinRoom(state, player('p2'), 2);
  state.status = 'playing';
  state.turnPlayerId = 'p1';
  state.players[0].hand = ['apostles_peter'];
  state.players[1].hand = ['apostles_john'];
  const event = askCard(state, 'p1', 'p2', 'apostles_john', 10);
  assert.equal(event.type, 'ask_success');
  assert.equal(state.turnPlayerId, 'p1');
  assert.ok(state.players[0].hand.includes('apostles_john'));
  assert.ok(!state.players[1].hand.includes('apostles_john'));
});

test('miss passes the turn', () => {
  const state = createRoomState('ABC123', player('p1'), 1);
  joinRoom(state, player('p2'), 2);
  state.status = 'playing';
  state.turnPlayerId = 'p1';
  state.players[0].hand = ['apostles_peter'];
  state.players[1].hand = ['kings_david'];
  const event = askCard(state, 'p1', 'p2', 'apostles_john', 10);
  assert.equal(event.type, 'ask_miss');
  assert.equal(state.turnPlayerId, 'p2');
});

test('в комнату помещаются пятнадцать игроков, шестнадцатый получает отказ', () => {
  const state = createRoomState('ROOM15', { playerId: 'p1', name: 'Игрок 1' }, 1000);
  for (let index = 2; index <= ROOM_LIMIT; index += 1) {
    joinRoom(state, { playerId: `p${index}`, name: `Игрок ${index}` }, 1000 + index);
  }
  assert.equal(state.players.length, 15);
  assert.throws(() => joinRoom(state, { playerId: 'p99', name: 'Лишний' }, 2000), /максимум 15/);
});
