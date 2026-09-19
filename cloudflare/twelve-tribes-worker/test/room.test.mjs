// Комната «Двенадцати колен» без воркера: чистые данные и переходы.
//
// Здесь проверяется то, что ломается тихо: чужая рука в ответе сервера, чужой
// ход по прямой просьбе, зависший стол из-за ушедшего игрока, комната без
// хозяина. Ни одно из этого не видно на экране — видно только последствия.
//
//     node --test test/room.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AWAY_TURN_LIMIT_MS,
  MAX_PLAYERS,
  OFFLINE_TURN_LIMIT_MS,
  TURN_LIMIT_MS,
  addChatMessage,
  backToLobby,
  buildView,
  canStart,
  createRoomState,
  joinRoom,
  leaveRoom,
  nextStepAt,
  playAgain,
  playerAction,
  sanitizeSettings,
  seatOf,
  setReady,
  setSettings,
  startGame,
  stepTable,
} from '../src/room.js';

/** Одинаковые раздачи от запуска к запуску: иначе упавшую проверку не повторить. */
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
  setSettings(room, host.playerId, { target: 0, bots }, now + 2);
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

  // Вернулся — снова в комнате, и не вторым собой.
  joinRoom(room, host, 2100);
  assert.equal(room.players.length, 2);
});

test('настройки меняет только хозяин, и лишние соперники не садятся', () => {
  const room = lobby();
  assert.throws(() => setSettings(room, guest.playerId, { bots: 3 }), /хозяин/i);
  setSettings(room, host.playerId, { target: 300, bots: 99 }, 1100);
  assert.equal(room.settings.target, 300);
  assert.equal(room.settings.bots, MAX_PLAYERS - 2, 'соперников больше, чем мест за столом');
  assert.deepEqual(sanitizeSettings({ target: 'сто', bots: 'три' }, { bots: 2 }), { target: 0, bots: 2 });
});

test('партия не начинается, пока не готовы все', () => {
  const room = lobby();
  setSettings(room, host.playerId, { target: 0, bots: 0 }, 1100);
  assert.equal(canStart(room), false, 'гость ещё не готов');
  setReady(room, guest.playerId, true, 1200);
  assert.equal(canStart(room), true);
  assert.throws(() => startGame(room, guest.playerId, 1300), /хозяин/i);
  startGame(room, host.playerId, 1300, seeded(1));
  assert.equal(room.phase, 'playing');
  assert.equal(room.game.players.length, 2);
});

test('чужая рука не покидает сервер', () => {
  const room = started();
  const view = buildView(room, guest.playerId, new Set([guest.playerId]));
  assert.equal(view.game.hand.length, 7, 'своя рука приходит целиком');
  const text = JSON.stringify(view.game.players);
  assert.ok(!text.includes('"rank"'), `в чужих местах видны карты: ${text.slice(0, 120)}`);
  for (const one of view.game.players) assert.equal(typeof one.cards, 'number');
  // И у зрителя тоже: он не садился за стол и руки не получает.
  joinRoom(room, { playerId: 'tg:9', name: 'Зритель' }, 5000);
  const watcher = buildView(room, 'tg:9', new Set());
  assert.equal(watcher.game.hand.length, 0);
  assert.equal(watcher.game.watching, true);
});

test('стол повёрнут к смотрящему: своё место всегда первое', () => {
  const room = started();
  const mine = buildView(room, guest.playerId, new Set()).game;
  const seat = seatOf(room, guest.playerId);
  assert.equal(mine.players[0].name, room.game.players[seat].name, 'первым стоит не сам игрок');
  assert.equal(mine.turn, (room.game.turn - seat + room.game.players.length) % room.game.players.length);
});

test('чужим ходом не походить даже напрямую', () => {
  const room = started();
  const notTurn = room.game.turn === 0 ? 1 : 0;
  const whoWaits = room.seats[notTurn];
  if (whoWaits) {
    const card = room.game.players[notTurn].hand[0];
    assert.throws(() => playerAction(room, whoWaits, 'play', { card: card.id }), /ходите не вы/i);
  }
  // Зритель не ходит вовсе.
  joinRoom(room, { playerId: 'tg:9', name: 'Зритель' }, 5000);
  assert.throws(() => playerAction(room, 'tg:9', 'draw', {}), /со стороны/i);
  // Карты, которой нет на руке, не сыграть.
  const mover = room.seats[room.game.turn];
  if (mover) assert.throws(() => playerAction(room, mover, 'play', { card: 'нет-такой' }), /нет/i);
});

test('за соперника от игры ходит сервер, а за человека — не сразу', () => {
  const room = started(1000, 1);
  // Человеку дают думать: до полутора минут его ход не трогают.
  while (room.game.turn !== 0) stepTable(room, 2000, seeded(3));
  const before = room.game.players[0].hand.length;
  assert.equal(stepTable(room, room.turnAt + 1000, seeded(3)), false, 'ход у человека, а сервер походил');
  assert.equal(room.game.players[0].hand.length, before);
  assert.ok(nextStepAt(room, room.turnAt) >= room.turnAt + TURN_LIMIT_MS - 1);
});

test('потерявшего связь ждут двадцать секунд, ушедшего — считаные', () => {
  // Каждый случай на своей комнате: после первого же хода очередь уходит
  // дальше, и мерить на ней второй случай нечего.
  const offline = started(1000, 1);
  while (offline.game.turn !== 0) stepTable(offline, 2000, seeded(3));
  const alone = new Set();
  assert.ok(nextStepAt(offline, offline.turnAt, alone) <= offline.turnAt + OFFLINE_TURN_LIMIT_MS);
  assert.equal(stepTable(offline, offline.turnAt + OFFLINE_TURN_LIMIT_MS + 1, seeded(3), alone), true,
    'потерявшего связь ждут столько же, сколько думающего');

  const away = started(1000, 1);
  while (away.game.turn !== 0) stepTable(away, 2000, seeded(5));
  leaveRoom(away, host.playerId, away.turnAt + 10);
  assert.ok(nextStepAt(away, away.turnAt) <= away.turnAt + AWAY_TURN_LIMIT_MS);
  assert.equal(stepTable(away, away.turnAt + AWAY_TURN_LIMIT_MS + 1, seeded(5)), true);
});

test('партия доходит до конца, и сервер ведёт её сам', () => {
  const room = started(1000, 3);
  // Все места заняты соперниками от игры, кроме двух человеческих: за людей
  // тоже ходит сервер, потому что они «ушли».
  leaveRoom(room, host.playerId, 1100);
  leaveRoom(room, guest.playerId, 1100);
  let now = 2000;
  let guard = 0;
  /*
    Источник случайности посеян, а не взят у системы.

    Раньше здесь стоял Math.random, и проверка сама себе вредила: партия без
    людей за столом то кончалась за двести шагов, то за двенадцать тысяч, и
    падала она не от поломки, а от того, каким выпал жребий. Посеянный
    источник даёт один и тот же прогон — а значит, упавшая проверка падает
    снова и её есть чем чинить.

    И предел поднят с четырёх тысяч. Раздача теперь идёт по местам — не до
    первого вышедшего, а пока за столом не останется один, — и стала много
    длиннее: сорок прогонов дали медиану около тысячи восьмисот шагов и хвост
    до двенадцати тысяч. Четыре тысячи были мерой прежних правил.
  */
  const dice = seeded(4242);
  while (room.game.status === 'playing' && guard < 40000) {
    stepTable(room, now, dice);
    now += AWAY_TURN_LIMIT_MS + 1;
    guard += 1;
  }
  assert.notEqual(room.game.status, 'playing', `раздача не кончилась за ${guard} шагов`);
  const hands = room.game.players.reduce((sum, one) => sum + one.hand.length, 0);
  assert.equal(hands + room.game.deck.length + room.game.pile.length, 108, 'карты по дороге потерялись');
});

test('переписка чистится и не растёт без предела', () => {
  const room = lobby();
  assert.throws(() => addChatMessage(room, guest.playerId, '   '), /пуст/i);
  addChatMessage(room, guest.playerId, `грязь\u0007 и   пробелы`, 3000);
  assert.equal(room.chat[0].text, 'грязь и пробелы');
  for (let i = 0; i < 80; i += 1) addChatMessage(room, guest.playerId, `строка ${i}`, 3001 + i);
  assert.ok(room.chat.length <= 60, `в переписке ${room.chat.length} строк`);
  assert.throws(() => addChatMessage(room, 'tg:404', 'привет'), /нет в этой комнате/i);
});

test('из партии возвращаются в лобби, и ушедшие не занимают мест', () => {
  const room = started();
  leaveRoom(room, guest.playerId, 5000);
  assert.throws(() => backToLobby(room, guest.playerId, 5001), /хозяин/i);
  backToLobby(room, host.playerId, 5002);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.game, null);
  assert.equal(room.players.length, 1, 'ушедший остался за столом');
  assert.equal(room.players[0].ready, false, 'готовность не сброшена');
});

/*
  «Играть ещё раз». Короткий путь с итогов: не разводить всех по лобби, а
  сдать заново тем же составом. Проверяется то, что при таком коротком пути и
  ломается: чужое право начать, состав стола и живая новая раздача.
*/
test('ещё одна раздача сдаётся тем же составом, и начинает её хозяин', () => {
  const room = started();
  const before = room.game;
  assert.throws(() => playAgain(room, guest.playerId, 5000), /хозяин/i);

  playAgain(room, host.playerId, 5001, seeded(9));
  assert.equal(room.phase, 'playing', 'комната не вернулась за стол');
  assert.notEqual(room.game, before, 'раздача осталась прежней');
  // У соперника от игры на мосту мест пусто, поэтому считаются только имена.
  const humans = room.seats.filter(Boolean);
  assert.equal(humans.length, 2, `за столом ${humans.length} человек вместо двоих`);
  assert.ok(humans.includes(host.playerId) && humans.includes(guest.playerId));
  assert.equal(room.game.players.length, 3, 'соперник от игры не сел заново');
  const hands = room.game.players.reduce((sum, one) => sum + one.hand.length, 0);
  assert.equal(hands, 21, `на руках ${hands} карт вместо двадцати одной`);

  // Ушедший в новую раздачу не попадает — его вычёркивает тот же возврат в
  // лобби, что и обычно.
  leaveRoom(room, guest.playerId, 5002);
  playAgain(room, host.playerId, 5003, seeded(10));
  assert.equal(room.seats.filter(Boolean).length, 1, 'ушедший снова оказался за столом');
  assert.equal(room.players.length, 1);
});

test('ещё раз не сдаётся, пока партия не началась', () => {
  const room = lobby();
  assert.throws(() => playAgain(room, host.playerId, 5000), /не идёт/i);
});
