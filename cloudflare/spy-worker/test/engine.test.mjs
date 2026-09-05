import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  backToLobby,
  beginVoting,
  buildView,
  castVote,
  createRoomState,
  endRoundByTimeout,
  joinRoom,
  leaveRoom,
  markRoleSeen,
  renamePlayer,
  sanitizeName,
  setSettings,
  spyGuess,
  startGame,
  addChatMessage,
  MAX_CHAT_MESSAGES,
  ensureChat,
  sanitizeChat,
} from '../src/engine.js';

const LOCATIONS = ['Иерусалим', 'Вавилон', 'Египет'];

function roomWith(count, now = 1000) {
  const room = createRoomState('ABC123', { playerId: 'p1', name: 'Хост' }, now);
  for (let i = 2; i <= count; i += 1) joinRoom(room, { playerId: `p${i}`, name: `Игрок ${i}` }, now);
  return room;
}

test('имя чистится, но цифры и буквы остаются', () => {
  assert.equal(sanitizeName('  Иван 2  '), 'Иван 2');
  assert.equal(sanitizeName('<b>Ева</b>'), 'b Ева /b');
  assert.equal(sanitizeName(''), 'Игрок');
  assert.equal(sanitizeName('x'.repeat(80)).length, 24);
});

test('в комнату нельзя войти сверх предела и во время партии', () => {
  const room = roomWith(MAX_PLAYERS);
  assert.throws(() => joinRoom(room, { playerId: 'over', name: 'Лишний' }), /максимум/);
  const playing = roomWith(4);
  startGame(playing, 'p1', LOCATIONS);
  assert.throws(() => joinRoom(playing, { playerId: 'late', name: 'Опоздал' }), /идёт/);
});

test('повторный вход тем же игроком не плодит дубликатов', () => {
  const room = roomWith(3);
  joinRoom(room, { playerId: 'p2', name: 'Игрок 2' });
  assert.equal(room.players.length, 3);
});

test('партия не стартует без минимального числа игроков', () => {
  const room = roomWith(MIN_PLAYERS - 1);
  assert.throws(() => startGame(room, 'p1', LOCATIONS), /минимум/);
});

test('начать партию может только ведущий', () => {
  const room = roomWith(4);
  assert.throws(() => startGame(room, 'p2', LOCATIONS), /ведущий/);
});

test('соглядатаев всегда меньше, чем игроков', () => {
  const room = roomWith(4);
  setSettings(room, 'p1', { spyCount: 9 });
  startGame(room, 'p1', LOCATIONS);
  const spies = room.players.filter((item) => item.role === 'spy');
  assert.equal(spies.length, 3);
  assert.ok(room.players.some((item) => item.role === 'citizen'));
});

test('вид игрока не раскрывает чужие роли и локацию соглядатаю', () => {
  const room = roomWith(5);
  startGame(room, 'p1', LOCATIONS);
  const spy = room.players.find((item) => item.role === 'spy');
  const citizen = room.players.find((item) => item.role === 'citizen');

  const spyView = buildView(room, spy.playerId);
  assert.equal(spyView.location, '');
  assert.equal(spyView.me.isSpy, true);
  assert.ok(spyView.players.every((item) => item.role === null));

  const citizenView = buildView(room, citizen.playerId);
  assert.ok(LOCATIONS.includes(citizenView.location));
  assert.equal(citizenView.me.isSpy, false);
  assert.ok(citizenView.players.every((item) => item.role === null));
});

test('вид не содержит секретов ни в одном поле', () => {
  const room = roomWith(4);
  startGame(room, 'p1', LOCATIONS);
  const spy = room.players.find((item) => item.role === 'spy');
  const serialized = JSON.stringify(buildView(room, spy.playerId));
  assert.ok(!serialized.includes(room.location), 'локация утекла соглядатаю');
  assert.ok(!serialized.includes('"citizen"'), 'чужая роль утекла');
});

test('обсуждение стартует само, когда роль увидели все', () => {
  const room = roomWith(3);
  startGame(room, 'p1', LOCATIONS);
  markRoleSeen(room, 'p1');
  markRoleSeen(room, 'p2');
  assert.equal(room.status, 'roles');
  markRoleSeen(room, 'p3');
  assert.equal(room.status, 'discussion');
  assert.ok(room.roundDeadlineMs > room.roundStartedAt);
});

test('истёкшее обсуждение переводит комнату в голосование', () => {
  const room = roomWith(3);
  startGame(room, 'p1', LOCATIONS);
  for (const player of room.players) markRoleSeen(room, player.playerId);
  assert.equal(endRoundByTimeout(room, room.roundDeadlineMs - 1), false);
  assert.equal(endRoundByTimeout(room, room.roundDeadlineMs + 1), true);
  assert.equal(room.status, 'voting');
});

test('за себя голосовать нельзя, а голоса всех завершают партию', () => {
  const room = roomWith(3);
  startGame(room, 'p1', LOCATIONS);
  for (const player of room.players) markRoleSeen(room, player.playerId);
  beginVoting(room, 'p1');
  assert.throws(() => castVote(room, 'p1', 'p1'), /за себя/i);

  const spy = room.players.find((item) => item.role === 'spy');
  const others = room.players.filter((item) => item.playerId !== spy.playerId);
  castVote(room, others[0].playerId, spy.playerId);
  castVote(room, others[1].playerId, spy.playerId);
  assert.equal(room.status, 'voting');
  castVote(room, spy.playerId, others[0].playerId);

  assert.equal(room.status, 'results');
  assert.equal(room.outcome.kind, 'vote');
  assert.equal(room.outcome.spyWon, false);
  assert.equal(room.outcome.accusedId, spy.playerId);
});

test('ничья никого не выгоняет и возвращает комнату к обсуждению', () => {
  const room = roomWith(4);
  startGame(room, 'p1', LOCATIONS);
  for (const player of room.players) markRoleSeen(room, player.playerId);
  beginVoting(room, 'p1');
  castVote(room, 'p1', 'p2');
  castVote(room, 'p2', 'p1');
  castVote(room, 'p3', 'p4');
  castVote(room, 'p4', 'p3');
  assert.equal(room.status, 'discussion');
  assert.equal(room.outcome, null);
  assert.equal(room.players.filter((item) => item.eliminated).length, 0);
  assert.deepEqual(room.votes, {});
});

test('соглядатай угадывает локацию без учёта регистра и буквы ё', () => {
  const room = roomWith(3);
  startGame(room, 'p1', LOCATIONS);
  for (const player of room.players) markRoleSeen(room, player.playerId);
  const spy = room.players.find((item) => item.role === 'spy');
  spyGuess(room, spy.playerId, ` ${room.location.toUpperCase()} `);
  assert.equal(room.status, 'results');
  assert.equal(room.outcome.kind, 'guess');
  assert.equal(room.outcome.spyWon, true);
});

test('горожанин не может назвать локацию за соглядатая', () => {
  const room = roomWith(3);
  startGame(room, 'p1', LOCATIONS);
  for (const player of room.players) markRoleSeen(room, player.playerId);
  const citizen = room.players.find((item) => item.role === 'citizen');
  assert.throws(() => spyGuess(room, citizen.playerId, 'Вавилон'), /соглядатай/);
});

test('на итогах роли и локация открыты всем', () => {
  const room = roomWith(3);
  startGame(room, 'p1', LOCATIONS);
  for (const player of room.players) markRoleSeen(room, player.playerId);
  const spy = room.players.find((item) => item.role === 'spy');
  spyGuess(room, spy.playerId, 'заведомо неверно');
  const view = buildView(room, 'p1');
  assert.equal(view.location, room.location);
  assert.ok(view.players.every((item) => item.role === 'spy' || item.role === 'citizen'));
  assert.equal(view.outcome.spyWon, false);
});

test('уход ведущего передаёт комнату другому', () => {
  const room = roomWith(3);
  leaveRoom(room, 'p1');
  assert.notEqual(room.hostPlayerId, 'p1');
  assert.equal(room.players.length, 2);
});

test('уход последнего игрока закрывает комнату', () => {
  const room = roomWith(3);
  leaveRoom(room, 'p1');
  leaveRoom(room, 'p2');
  assert.deepEqual(leaveRoom(room, 'p3'), { deleted: true });
});

test('во время партии ушедший помечается, а не удаляется', () => {
  const room = roomWith(4);
  startGame(room, 'p1', LOCATIONS);
  leaveRoom(room, 'p4');
  assert.equal(room.players.length, 4);
  assert.equal(room.players.find((item) => item.playerId === 'p4').isActive, false);
  assert.equal(buildView(room, 'p1').players.length, 3);
});

test('возврат в лобби стирает роли, локацию и ушедших', () => {
  const room = roomWith(4);
  startGame(room, 'p1', LOCATIONS);
  leaveRoom(room, 'p4');
  for (const player of room.players.filter((item) => item.isActive !== false)) markRoleSeen(room, player.playerId);
  beginVoting(room, 'p1');
  castVote(room, 'p1', 'p2');
  backToLobby(room, 'p1');
  assert.equal(room.status, 'lobby');
  assert.equal(room.location, '');
  assert.equal(room.players.length, 3);
  assert.ok(room.players.every((item) => item.role === null));
  assert.deepEqual(room.votes, {});
});

test('настройки меняет только ведущий и только в лобби', () => {
  const room = roomWith(3);
  assert.throws(() => setSettings(room, 'p2', { spyCount: 2 }), /ведущий/);
  assert.throws(() => setSettings(room, 'p1', { roundSeconds: 5 }), /границ/);
  setSettings(room, 'p1', { roundSeconds: 300 });
  assert.equal(room.roundSeconds, 300);
  startGame(room, 'p1', LOCATIONS);
  assert.throws(() => setSettings(room, 'p1', { spyCount: 2 }), /до начала/);
});

test('сообщение чата видно всем и подписано именем', () => {
  const room = roomWith(3);
  addChatMessage(room, 'p2', '  Кто был там на рассвете?  ');
  const view = buildView(room, 'p1');
  assert.equal(view.chat.length, 1);
  assert.equal(view.chat[0].text, 'Кто был там на рассвете?');
  assert.equal(view.chat[0].name, 'Игрок 2');
  assert.equal(view.chat[0].playerId, 'p2');
});

test('пустое сообщение и разметка не проходят', () => {
  const room = roomWith(3);
  assert.throws(() => addChatMessage(room, 'p1', '   '), /пусто/i);
  addChatMessage(room, 'p1', '<b>тег</b>');
  assert.equal(buildView(room, 'p1').chat[0].text, 'b тег /b');
  assert.equal(sanitizeChat('x'.repeat(500)).length, 300);
});

test('чужой в комнате писать не может', () => {
  const room = roomWith(3);
  assert.throws(() => addChatMessage(room, 'нет-такого', 'привет'), /не найден/i);
});

test('лента чата не растёт без предела', () => {
  const room = roomWith(3);
  for (let i = 0; i < MAX_CHAT_MESSAGES + 25; i += 1) addChatMessage(room, 'p1', `реплика ${i}`);
  const chat = buildView(room, 'p1').chat;
  assert.equal(chat.length, MAX_CHAT_MESSAGES);
  // Обрезается начало: последнее сказанное важнее первого.
  assert.equal(chat[chat.length - 1].text, `реплика ${MAX_CHAT_MESSAGES + 24}`);
});

test('переписка переживает смену этапа — по ней и голосуют', () => {
  const room = roomWith(3);
  startGame(room, 'p1', LOCATIONS);
  for (const player of room.players) markRoleSeen(room, player.playerId);
  addChatMessage(room, 'p2', 'там было жарко');
  beginVoting(room, 'p1');
  assert.equal(buildView(room, 'p1').chat.length, 1);
});

test('переименование меняет имя в общем списке', () => {
  const room = roomWith(3);
  renamePlayer(room, 'p2', 'Новое имя');
  assert.equal(buildView(room, 'p1').players.find((item) => item.playerId === 'p2').name, 'Новое имя');
});

test('версия комнаты растёт на каждом изменении', () => {
  const room = roomWith(3);
  const before = room.version;
  setSettings(room, 'p1', { spyCount: 1 });
  assert.ok(room.version > before);
});

/*
  Дальше — партия на двух соглядатаев. Раньше на ней ломалось всё: круг
  голосования выгонял одного и сразу открывал обе роли, так что второй
  соглядатай узнавал о своём поражении, ничего не сделав.
*/

/** Комната, где роли расставлены руками: случайная раздача тест бы расшатала. */
function roomWithSpies(count, spyIds) {
  const room = roomWith(count);
  setSettings(room, 'p1', { spyCount: spyIds.length });
  startGame(room, 'p1', LOCATIONS);
  for (const player of room.players) player.role = spyIds.includes(player.playerId) ? 'spy' : 'citizen';
  for (const player of room.players) markRoleSeen(room, player.playerId);
  return room;
}

/** Все, кто ещё в игре, голосуют за одного. */
function voteOut(room, targetId) {
  beginVoting(room, room.hostPlayerId);
  for (const player of room.players.filter((item) => !item.eliminated)) {
    if (player.playerId !== targetId) castVote(room, player.playerId, targetId);
  }
  // Сам обвиняемый голосует последним — за кого угодно, кроме себя.
  const fallback = room.players.find((item) => !item.eliminated && item.playerId !== targetId);
  if (room.status === 'voting') castVote(room, targetId, fallback.playerId);
}

test('первый выгнанный соглядатай партию не заканчивает: второй ещё в игре', () => {
  const room = roomWithSpies(6, ['p5', 'p6']);
  voteOut(room, 'p5');
  assert.equal(room.status, 'discussion');
  assert.equal(room.outcome, null);
  assert.equal(room.players.find((item) => item.playerId === 'p5').eliminated, true);
  assert.equal(buildView(room, 'p1').inPlayCount, 5);
});

test('изгнание не раскрывает роль — её видно только на итогах', () => {
  const room = roomWithSpies(6, ['p5', 'p6']);
  voteOut(room, 'p5');
  const view = buildView(room, 'p1');
  const ejected = view.players.find((item) => item.playerId === 'p5');
  assert.equal(ejected.eliminated, true);
  assert.equal(ejected.role, null, 'роль изгнанного не должна уходить на клиент до итогов');
  assert.equal(view.location, room.location, 'горожанин локацию знает и так');
  assert.equal(buildView(room, 'p6').location, '', 'соглядатаю локацию по-прежнему не говорят');
});

test('партия кончается, когда выгнан последний соглядатай, и открывает роли', () => {
  const room = roomWithSpies(6, ['p5', 'p6']);
  voteOut(room, 'p5');
  voteOut(room, 'p6');
  assert.equal(room.status, 'results');
  assert.equal(room.outcome.spyWon, false);
  assert.deepEqual(room.outcome.ejected.map((item) => item.playerId), ['p5', 'p6']);
  assert.deepEqual(room.outcome.ejected.map((item) => item.role), ['spy', 'spy']);
  const view = buildView(room, 'p1');
  assert.equal(view.players.find((item) => item.playerId === 'p6').role, 'spy');
});

test('соглядатаи побеждают, когда их становится не меньше, чем горожан', () => {
  const room = roomWithSpies(6, ['p5', 'p6']);
  voteOut(room, 'p1');
  assert.equal(room.status, 'discussion', 'выгнали горожанина — партия идёт дальше');
  voteOut(room, 'p2');
  // Остались p3 и p4 против p5 и p6: голосованием соглядатаев уже не пересилить.
  assert.equal(room.status, 'results');
  assert.equal(room.outcome.spyWon, true);
  assert.equal(room.outcome.ejected.length, 2);
  assert.deepEqual(room.outcome.ejected.map((item) => item.role), ['citizen', 'citizen']);
});

test('изгнанный не голосует, не пишет и не называет локацию', () => {
  const room = roomWithSpies(6, ['p5', 'p6']);
  voteOut(room, 'p5');
  beginVoting(room, 'p1');
  assert.throws(() => castVote(room, 'p5', 'p6'), /Изгнанный/);
  assert.throws(() => addChatMessage(room, 'p5', 'это p6!'), /Изгнанный/);
  assert.throws(() => spyGuess(room, 'p5', room.location), /Изгнанный/);
});

test('промах соглядатая выбивает только его: напарник доигрывает', () => {
  const room = roomWithSpies(6, ['p5', 'p6']);
  spyGuess(room, 'p5', 'Не та локация');
  assert.equal(room.status, 'discussion');
  assert.equal(room.players.find((item) => item.playerId === 'p5').eliminated, true);
  spyGuess(room, 'p6', 'И эта не та');
  assert.equal(room.status, 'results');
  assert.equal(room.outcome.spyWon, false, 'соглядатаев не осталось — победа горожан');
});

test('чат соглядатаев виден только соглядатаям', () => {
  const room = roomWithSpies(6, ['p5', 'p6']);
  addChatMessage(room, 'p5', 'Я не знаю локацию, тяни время', 5000, 'spies');
  addChatMessage(room, 'p1', 'Кто последний отвечал?', 5001);

  const spyView = buildView(room, 'p6');
  assert.equal(spyView.spyChat.length, 1);
  assert.equal(spyView.spyChat[0].text, 'Я не знаю локацию, тяни время');
  assert.equal(spyView.canWriteSpyChat, true);
  assert.equal(spyView.chat.length, 1, 'общий чат общий для всех');

  const citizenView = buildView(room, 'p1');
  assert.deepEqual(citizenView.spyChat, [], 'горожанин закрытой переписки не получает');
  assert.equal(citizenView.canWriteSpyChat, false);
  assert.throws(() => addChatMessage(room, 'p1', 'подсмотрю', 5002, 'spies'), /соглядатаям/);
});

test('новая раздача стирает закрытый чат прошлых соглядатаев', () => {
  const room = roomWithSpies(6, ['p5', 'p6']);
  addChatMessage(room, 'p5', 'Локация мне неизвестна', 5000, 'spies');
  voteOut(room, 'p5');
  voteOut(room, 'p6');
  assert.equal(room.status, 'results');
  assert.equal(room.spyChat.length, 1, 'до конца партии переписка на месте');

  startGame(room, 'p1', LOCATIONS);
  assert.deepEqual(room.spyChat, [], 'иначе новый соглядатай прочитал бы прошлую партию');
  assert.equal(room.players.every((item) => !item.eliminated), true, 'изгнания тоже сброшены');
});

test('комната из хранилища без новых полей не роняет движок', () => {
  const room = roomWith(4);
  delete room.spyChat;
  delete room.spyChatSeq;
  delete room.voteRound;
  for (const player of room.players) delete player.eliminated;
  ensureChat(room);
  assert.deepEqual(room.spyChat, []);
  assert.equal(room.voteRound, 0);
  assert.equal(room.players.every((item) => item.eliminated === false), true);
});
