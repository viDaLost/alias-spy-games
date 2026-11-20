import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/catalog.js';
import { MIN_PLAYERS, ROOM_LIMIT, TURN_TIMEOUT_MS, askCard, buildView, createRoomState, joinRoom, leaveRoom, restartGame, setDeckSize, startGame } from '../src/engine.js';

function deterministicRng(max) { return max - 1; }
function player(id, name = id) { return { playerId: id, name }; }

test('room can be created and joined', () => {
  const state = createRoomState('ABC123', player('p1', 'Анна'), 1);
  joinRoom(state, player('p2', 'Пётр'), 2);
  assert.equal(state.players.length, 2);
  assert.equal(state.hostPlayerId, 'p1');
});

test('the host picks a complete deck for three players and opponents hands stay private', () => {
  for (const count of [12, 15, CATALOG.length]) {
    const state = createRoomState('ABC123', player('p1'), 1);
    joinRoom(state, player('p2'), 2);
    joinRoom(state, player('p3'), 3);
    setDeckSize(state, 'p1', count, 4);
    startGame(state, 'p1', 5, deterministicRng);
    const total = state.players.reduce((sum, item) => sum + item.hand.length + item.completedQuartets.length * 4, 0);
    assert.equal(total, count * 4);
    const view = buildView(state, 'p1', new Set(['p1', 'p2', 'p3']));
    assert.equal(view.deckSettings.requested, count);
    assert.ok(Array.isArray(view.me.hand));
    assert.equal('hand' in view.players[1], false);
  }
});

test('game needs three players', () => {
  assert.equal(MIN_PLAYERS, 3);

  // Вдвоём игра вырождается: соперник всего один, и выбирать не из кого.
  const pair = createRoomState('ABC123', player('p1'), 1);
  joinRoom(pair, player('p2'), 2);
  assert.throws(() => startGame(pair, 'p1', 3, deterministicRng), /минимум 3/);

  // Третий игрок — и партия начинается.
  joinRoom(pair, player('p3'), 3);
  startGame(pair, 'p1', 4, deterministicRng);
  assert.equal(pair.status, 'playing');
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

test('в комнату помещаются 24 игрока, следующий получает отказ', () => {
  const state = createRoomState('ROOM24', { playerId: 'p1', name: 'Игрок 1' }, 1000);
  for (let index = 2; index <= ROOM_LIMIT; index += 1) {
    joinRoom(state, { playerId: `p${index}`, name: `Игрок ${index}` }, 1000 + index);
  }
  assert.equal(ROOM_LIMIT, 24);
  assert.equal(state.players.length, 24);
  assert.throws(() => joinRoom(state, { playerId: 'p99', name: 'Лишний' }, 2000), /максимум 24/);
});

test('выход соперника передаёт ход, если у текущего игрока собрался квартет и кончились карты', () => {
  const state = createRoomState('ABC123', player('p1'), 1);
  joinRoom(state, player('p2'), 2);
  joinRoom(state, player('p3'), 3);
  joinRoom(state, player('p4'), 4);
  const [quartet, otherQuartet] = CATALOG;
  const [missing, ...owned] = quartet.cards.map(({ id }) => id);
  const other = otherQuartet.cards.map(({ id }) => id);
  state.status = 'playing';
  state.dealtQuartetCount = 2;
  state.turnPlayerId = 'p1';
  state.players[0].hand = owned;
  state.players[1].hand = other.slice(0, 2);
  state.players[2].hand = other.slice(2);
  state.players[3].hand = [missing];

  leaveRoom(state, 'p4', 10);
  assert.equal(state.status, 'playing');
  assert.deepEqual(state.players[0].completedQuartets, [quartet.id]);
  assert.equal(state.turnPlayerId, 'p2');
  assert.equal(state.turnDeadlineMs, 10 + TURN_TIMEOUT_MS);
  assert.equal(leaveRoom(state, 'p4', 11).changed, false);
});

test('выход победителя после итогов сохраняет результат и позволяет оставшимся переиграть', () => {
  const state = createRoomState('ABC123', player('p1'), 1);
  for (const id of ['p2', 'p3', 'p4']) joinRoom(state, player(id), 2);
  const quartet = CATALOG[0];
  const [missing, ...owned] = quartet.cards.map(({ id }) => id);
  state.status = 'playing';
  state.turnPlayerId = 'p1';
  state.dealtQuartetCount = 1;
  state.players[0].hand = owned;
  state.players[1].hand = [missing];
  askCard(state, 'p1', 'p2', missing, 4);
  assert.equal(state.status, 'finished');
  const { log, lastEvent } = structuredClone(state);

  leaveRoom(state, 'p1', 5);
  assert.deepEqual(state.winnerIds, ['p1']);
  assert.deepEqual(state.log, log);
  assert.deepEqual(state.lastEvent, lastEvent);
  assert.equal(state.hostPlayerId, 'p2');
  restartGame(state, 'p2', 6, deterministicRng);
  assert.equal(state.status, 'playing');
  assert.deepEqual(state.winnerIds, []);
  assert.ok(state.players[0].completedQuartets.length === 0 && state.players[0].hand.length === 0);
});
