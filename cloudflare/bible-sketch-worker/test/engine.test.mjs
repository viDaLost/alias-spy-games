import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addChatMessage,
  buildView,
  commitStroke,
  createRoomState,
  joinRoom,
  startRound,
  submitSpyGuess,
  voteGuessReview,
} from '../src/engine.js';
import { CATALOG, getWord } from '../src/catalog.js';

function player(id, name = id) {
  return { playerId: `tg:${id}`, name, telegramId: id };
}

function room(category = 'objects') {
  const state = createRoomState('ABC123', player('1', 'Анна'), category, 1000);
  joinRoom(state, player('2', 'Павел'), 1001);
  joinRoom(state, player('3', 'Мария'), 1002);
  return state;
}

const zeroRng = () => 0;

test('each category contains a substantial Synodal-reference catalog', () => {
  assert.deepEqual(Object.keys(CATALOG).sort(), ['crafts', 'events', 'nature', 'objects', 'people', 'places']);
  for (const [category, words] of Object.entries(CATALOG)) {
    assert.ok(words.length >= 30, `${category} should contain at least 30 entries`);
    assert.equal(new Set(words.map((word) => word.id)).size, words.length, `${category} ids must be unique`);
    for (const word of words) {
      assert.ok(word.label && word.ref, `${category}/${word.id} must include label and Bible reference`);
    }
  }
});

test('a room does not repeat a word until the selected category is exhausted', () => {
  const state = room('objects');
  const seen = [];
  for (let i = 0; i < CATALOG.objects.length; i += 1) {
    startRound(state, state.hostPlayerId, 2000 + i, zeroRng);
    seen.push(state.wordId);
  }
  assert.equal(new Set(seen).size, CATALOG.objects.length);

  const lastBeforeReset = state.wordId;
  startRound(state, state.hostPlayerId, 5000, zeroRng);
  assert.ok(seen.includes(state.wordId), 'after exhaustion a previous word may be used again');
  assert.notEqual(state.wordId, lastBeforeReset, 'the cycle should avoid an immediate same-word repeat when alternatives exist');
});

test('the spy never receives the secret while artists do', () => {
  const state = room('people');
  startRound(state, state.hostPlayerId, 2000, zeroRng);
  const spyId = state.spyPlayerId;
  const artistId = state.players.find((entry) => entry.playerId !== spyId).playerId;

  const spyView = buildView(state, spyId, new Set(state.players.map((entry) => entry.playerId)));
  const artistView = buildView(state, artistId, new Set());
  assert.equal(spyView.me.role, 'spy');
  assert.equal(spyView.me.secret, null);
  assert.equal(artistView.me.role, 'artist');
  assert.equal(artistView.me.secret.label, getWord(state.categoryId, state.wordId).label);
});

test('an exact early spy answer is checked by the server and wins immediately', () => {
  const state = room('places');
  startRound(state, state.hostPlayerId, 2000, zeroRng);
  const word = getWord(state.categoryId, state.wordId);
  const result = submitSpyGuess(state, state.spyPlayerId, word.label, 2100);
  assert.equal(result.autoMatched, true);
  assert.equal(state.status, 'finished');
  assert.equal(state.result.winner, 'spy');
});

test('a non-matching early answer pauses for human review and resumes after rejection', () => {
  const state = room('events');
  startRound(state, state.hostPlayerId, 2000, zeroRng);
  submitSpyGuess(state, state.spyPlayerId, 'совсем другой ответ', 2100);
  assert.equal(state.status, 'answerReview');

  const voters = state.players.filter((entry) => entry.playerId !== state.spyPlayerId).map((entry) => entry.playerId);
  voteGuessReview(state, voters[0], false, 2200);
  assert.equal(state.status, 'answerReview');
  voteGuessReview(state, voters[1], false, 2300);
  assert.equal(state.status, 'drawing');
  assert.equal(state.earlyGuessUsed, true);
});

test('artists may accept a wording that automatic matching did not recognize', () => {
  const state = room('objects');
  startRound(state, state.hostPlayerId, 2000, zeroRng);
  submitSpyGuess(state, state.spyPlayerId, 'похожая формулировка', 2100);
  const voters = state.players.filter((entry) => entry.playerId !== state.spyPlayerId).map((entry) => entry.playerId);
  voteGuessReview(state, voters[0], true, 2200);
  voteGuessReview(state, voters[1], true, 2300);
  assert.equal(state.status, 'finished');
  assert.equal(state.result.winner, 'spy');
  assert.equal(state.result.reason, 'early_guess_human');
});

test('only the current drawer can add normalized strokes', () => {
  const state = room('objects');
  startRound(state, state.hostPlayerId, 2000, zeroRng);
  const drawer = state.turnOrder[0];
  const other = state.players.find((entry) => entry.playerId !== drawer).playerId;
  const raw = { color: '#4f46e5', width: 6, points: [[-1, .1], [.5, .5], [2, .9]] };
  const stroke = commitStroke(state, drawer, raw, 2100);
  assert.deepEqual(stroke.points[0], [0, .1]);
  assert.deepEqual(stroke.points.at(-1), [1, .9]);
  assert.throws(() => commitStroke(state, other, raw, 2200), /Сейчас|Рисовать/);
});

test('chat is room-scoped and blocks leaking the active secret word', () => {
  const state = room('people');
  startRound(state, state.hostPlayerId, 2000, zeroRng);
  const artist = state.players.find((entry) => entry.playerId !== state.spyPlayerId).playerId;
  const word = getWord(state.categoryId, state.wordId);
  assert.throws(() => addChatMessage(state, artist, `Я думаю, это ${word.label}`, 2100), /секретное слово/i);
  const message = addChatMessage(state, artist, 'Красивый рисунок!', 2200);
  assert.equal(message.text, 'Красивый рисунок!');
  assert.equal(state.chat.length, 1);
});
