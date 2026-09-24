// Комната «Царств» без воркера: чистые данные и переходы.
//
// Здесь проверяется то, что ломается тихо: чужой закрытый приказ в ответе
// сервера, чужой ход по прямой просьбе, зависший стол из-за не успевшего
// человека, комната без хозяина.
//
//     node --test test/room.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AWAY_TURN_LIMIT_MS,
  MAX_PLAYERS,
  OFFLINE_TURN_LIMIT_MS,
  TURN_LIMIT_MS,
  backToLobby,
  buildView,
  canStart,
  createRoomState,
  joinRoom,
  leaveRoom,
  nextRound,
  nextStepAt,
  playAgain,
  playerAction,
  sanitizeSettings,
  setReady,
  setSettings,
  startGame,
  stepTable,
} from '../src/room.js';
import { R } from '../src/rules.js';

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const host = { playerId: 'tg:1', name: 'Хозяин' };
const guest = { playerId: 'tg:2', name: 'Гость' };

function lobby(now = 1000) {
  const room = createRoomState('ABCDE', host, now);
  joinRoom(room, guest, now + 1);
  return room;
}

function started(now = 1000, bots = 1) {
  const room = lobby(now);
  setSettings(room, host.playerId, { bots }, now + 2);
  setReady(room, guest.playerId, true, now + 3);
  startGame(room, host.playerId, now + 4, seeded(7));
  return room;
}

test('в лобби входят, выходят и не остаются без хозяина', () => {
  const room = lobby();
  assert.equal(room.players.length, 2);
  assert.equal(room.hostPlayerId, host.playerId);

  leaveRoom(room, host.playerId, 2000);
  assert.equal(room.players.length, 1, 'ушедший в лобби вычёркивается совсем');
  assert.equal(room.hostPlayerId, guest.playerId, 'комната осталась без хозяина');

  joinRoom(room, host, 2100);
  assert.equal(room.players.length, 2);
});

test('настройки меняет только хозяин, и соперников от игры не больше свободных мест', () => {
  const room = lobby();
  assert.throws(() => setSettings(room, guest.playerId, { bots: 3 }), /хозяин/i);
  setSettings(room, host.playerId, { bots: 99 }, 1100);
  assert.equal(room.settings.bots, MAX_PLAYERS - 2, 'соперников больше, чем мест за столом');
  assert.deepEqual(sanitizeSettings({ bots: 'три' }, { bots: 2 }), { bots: 2 });
});

test('партия не начинается, пока не все готовы, и раскладка отвечает числу мест', () => {
  const room = lobby();
  assert.equal(canStart(room), false, 'гость ещё не готов');
  setReady(room, guest.playerId, true, 1200);
  assert.equal(canStart(room), true);

  const withBots = lobby(2000);
  setSettings(withBots, host.playerId, { bots: 2 }, 2001);
  setReady(withBots, guest.playerId, true, 2002);
  startGame(withBots, host.playerId, 2003, seeded(3));
  assert.equal(withBots.seats.length, 4, 'за столом должно быть четыре места (2 человека + 2 бота)');
  const kingdomIds = R.STARTING_LAYOUTS[4];
  assert.deepEqual(withBots.game.players.map((one) => one.kingdomId), kingdomIds,
    'раскладка на четыре места не совпала с R.STARTING_LAYOUTS[4]');
  assert.equal(withBots.game.players[2].isBot, true);
  assert.equal(withBots.game.players[2].name, R.kingdomOf(kingdomIds[2]).name,
    'имя соперника от игры должно быть именем его царства');
});

test('приказ принимается только от того, чья сейчас очередь, и только на своей области', () => {
  const room = started();
  const seat0 = room.game.turnOrder[0];
  const seat0Id = room.seats[seat0];
  const otherSeat = room.game.turnOrder[1];
  const otherId = room.seats[otherSeat] || null;

  if (otherId) {
    assert.throws(() => playerAction(room, otherId, 'placeOrder', { kind: 'guard', area: 'x' }), /не ваш ход/i);
  }
  const area = R.startingAreasOf(room.game.players[seat0].kingdomId)[0];
  room.game.players[seat0].hand[0] = 'guard';
  playerAction(room, seat0Id, 'placeOrder', { kind: 'guard', area });
  assert.equal(room.game.orders.length, 1, 'законный приказ не встал на стол');

  assert.throws(() => playerAction(room, 'guest-not-seated', 'placeOrder', { kind: 'guard', area }), /со стороны/i);
});

test('пропуск хода доступен тому, чья очередь, и продвигает партию', () => {
  const room = started();
  const seat0 = room.game.turnOrder[0];
  const seat0Id = room.seats[seat0];
  playerAction(room, seat0Id, 'skipTurn');
  assert.notEqual(room.game.turnOrder[room.game.turnPointer], seat0, 'после пропуска очередь не сдвинулась');
});

test('соперник от игры ходит сам, а человек, не успевший вовремя, просто пропускает', () => {
  const room = started(1000, 3); // немного людей, много соперников от игры — до них очередь дойдёт быстро
  let guard = 0;
  while (room.game.players[room.game.turnOrder[room.game.turnPointer]]?.isBot !== true && guard++ < 20) {
    const seat = room.game.turnOrder[room.game.turnPointer];
    playerAction(room, room.seats[seat], 'skipTurn');
  }
  const botSeat = room.game.turnOrder[room.game.turnPointer];
  assert.equal(room.game.players[botSeat].isBot, true, 'не нашли соперника от игры в очереди — стенд не удался');
  const ordersBefore = room.game.orders.length;
  const moved = stepTable(room, 5000, seeded(9), new Set());
  assert.equal(moved, true, 'соперник от игры не сходил');
  assert.equal(room.game.orders.length > ordersBefore || room.game.turnOrder[room.game.turnPointer] !== botSeat, true);

  // Человек, чьё время вышло, пропускает — а не получает ход от сервера.
  const humanRoom = started();
  const humanSeat = humanRoom.game.turnOrder[0];
  humanRoom.turnAt = 0;
  const before = humanRoom.game.orders.length;
  const humanMoved = stepTable(humanRoom, TURN_LIMIT_MS + 1, seeded(1), new Set());
  assert.equal(humanMoved, true, 'просроченный человек не пропущен');
  assert.equal(humanRoom.game.orders.length, before, 'за не успевшего человека разместился приказ — так быть не должно');
});

test('раскрытие раунда не ждёt ничьего действия — стол разрешает его сам', () => {
  const room = started(1000, 4); // много ботов — раунд доиграется без участия проверки
  let guard = 0;
  while (room.game.phase === 'planning' && guard++ < 200) {
    const seat = room.game.turnOrder[room.game.turnPointer];
    const humanId = room.seats[seat];
    if (humanId) playerAction(room, humanId, 'skipTurn');
    else stepTable(room, 2000, seeded(guard + 1), new Set());
  }
  assert.equal(room.game.phase, 'reveal', 'раунд не дошёл до раскрытия за разумное число шагов');
  assert.equal(nextStepAt(room, 2000, new Set()), 2000, 'раскрытие обязано быть готово немедленно');
  const moved = stepTable(room, 2000, seeded(2), new Set());
  assert.equal(moved, true);
  assert.equal(['results', 'over'].includes(room.game.phase), true, 'после раскрытия партия не перешла к итогам');
});

test('следующий раунд начинает только хозяин, и только когда раунд завершён', () => {
  const room = started(1000, 4);
  let guard = 0;
  while (room.game.phase !== 'results' && room.game.phase !== 'over' && guard++ < 300) {
    const seat = room.game.turnOrder[room.game.turnPointer];
    const humanId = room.seats[seat];
    if (humanId) playerAction(room, humanId, 'skipTurn');
    else stepTable(room, 3000, seeded(guard + 5), new Set());
  }
  if (room.game.phase === 'results') {
    assert.throws(() => nextRound(room, guest.playerId), /хозяин/i);
    nextRound(room, host.playerId, 4000);
    assert.equal(room.game.phase, 'planning');
  }
});

test('вид комнаты прячет вид и силу чужого закрытого приказа, а зритель без места видит только это', () => {
  const room = started();
  const seat0 = room.game.turnOrder[0];
  const seat0Id = room.seats[seat0];
  const area = R.startingAreasOf(room.game.players[seat0].kingdomId)[0];
  room.game.players[seat0].hand[0] = 'guard';
  playerAction(room, seat0Id, 'placeOrder', { kind: 'guard', area });

  const ownerView = buildView(room, seat0Id);
  assert.ok(ownerView.game.hand.length > 0, 'своя рука отсутствует в ответе комнаты');
  const order = ownerView.game.orders[0];
  assert.ok('kind' in order, 'хозяин приказа не видит его собственный вид');

  const otherId = room.seats.find((id) => id && id !== seat0Id);
  if (otherId) {
    const otherView = buildView(room, otherId);
    assert.equal('hand' in otherView.game.players[seat0], false, 'рука соперника просочилась в ответ комнаты');
    const seen = otherView.game.orders[0];
    assert.equal('kind' in seen, false, 'чужой закрытый приказ выдал свой вид');
    assert.equal('force' in seen, false, 'чужой закрытый приказ выдал свою силу');
    assert.ok('owner' in seen && 'area' in seen, 'закрытый приказ обязан показывать хозяина и место');
  }

  const spectatorView = buildView(room, 'nobody-here');
  assert.equal(spectatorView.seat, -1);
  assert.equal('kind' in spectatorView.game.orders[0], false, 'зритель без места увидел вид приказа');
});

test('повторная отправка того же запроса на создание не создаёт вторую комнату', () => {
  // createRoomState сам по себе не проверяет requestId — это делает Durable
  // Object в index.js. Здесь проверяется то, что относится к room.js:
  // комната остаётся одной и той же структурой данных при повторном join.
  const room = lobby();
  const before = room.players.length;
  joinRoom(room, host, 5000);
  assert.equal(room.players.length, before, 'повторный вход хозяина не должен сажать его вторым игроком');
});

test('вернуть в лобби может только хозяин', () => {
  const room = started();
  assert.throws(() => backToLobby(room, guest.playerId), /хозяин/i);
  backToLobby(room, host.playerId, 9000);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.game, null);
});

test('ушедшего и потерявшего связь ждут по-разному', () => {
  const room = started();
  const seat = room.game.turnOrder[0];
  const humanId = room.seats[seat];
  room.turnAt = 1000;
  assert.equal(nextStepAt(room, 1000, new Set([humanId])) - 1000, TURN_LIMIT_MS,
    'думающего человека в сети ждут не полторы минуты');
  assert.equal(nextStepAt(room, 1000, new Set()) - 1000, OFFLINE_TURN_LIMIT_MS,
    'потерявшего связь ждут не двадцать секунд');
  leaveRoom(room, humanId, 1500);
  assert.equal(nextStepAt(room, 1500, new Set()), room.turnAt + AWAY_TURN_LIMIT_MS,
    'явно ушедшего ждут не шесть секунд от начала его хода');
});

/*
  «Играть ещё раз». Короткий путь с итогов: не разводить всех по лобби, а
  начать заново тем же составом. Ломается при этом ровно то, что и проверяется:
  чужое право начать, состав стола и живая новая партия.
*/
test('ещё одна партия начинается тем же составом, и начинает её хозяин', () => {
  const room = started();
  const before = room.game;
  assert.throws(() => playAgain(room, guest.playerId, 5000), /хозяин/i);

  playAgain(room, host.playerId, 5001, seeded(9));
  assert.equal(room.phase, 'playing', 'комната не вернулась за стол');
  assert.notEqual(room.game, before, 'партия осталась прежней');
  const humans = room.seats.filter(Boolean);
  assert.equal(humans.length, 2, `за столом ${humans.length} человек вместо двоих`);
  assert.ok(humans.includes(host.playerId) && humans.includes(guest.playerId));

  leaveRoom(room, guest.playerId, 5002);
  playAgain(room, host.playerId, 5003, seeded(10));
  assert.equal(room.seats.filter(Boolean).length, 1, 'ушедший снова оказался за столом');
});

test('ещё раз не начинается, пока партия не идёт', () => {
  const room = lobby();
  assert.throws(() => playAgain(room, host.playerId, 5000), /не идёт/i);
});
