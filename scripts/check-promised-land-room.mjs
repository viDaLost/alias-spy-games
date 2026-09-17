// check-promised-land-room.mjs — комната «Земли обетованной» без воркера.
//
// Состояние комнаты вынесено чистым файлом ровно ради этого: его можно
// прогнать здесь, без Durable Object, без сети и без браузера, — и прогнать не
// один раз, а сотню, с разными порядками подключений и отвалов.
//
// Стережётся то, что ломается тихо и обнаруживается на живых людях:
//
//   * хозяин ушёл, и комната замерла — начать партию некому;
//   * вернувшийся получил новое место вместо своего, с чужими уделами;
//   * седьмой сел за стол, рассчитанный на шестерых;
//   * настройки партии поменял не хозяин;
//   * в комнату вошли посреди партии;
//   * переписка выросла без предела.

import path from 'node:path';

const root = process.cwd();
const room = await import(
  new URL(`file://${path.join(root, 'cloudflare/promised-land-preview/src/room.js')}`)
);
const {
  MAX_PLAYERS, MIN_PLAYERS,
  createRoomState, joinRoom, leaveRoom, setReady, renamePlayer, setSettings,
  addChatMessage, startGame, backToLobby, buildView, canStart, seated, sanitizeName,
} = room;

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };
const person = (id, name) => ({ playerId: id, name });
const fails = (run, code) => {
  try { run(); return `не отказано (${code})`; } catch (error) {
    return error?.code === code ? '' : `отказано с «${error?.code}» вместо «${code}»`;
  }
};

// 1. Комната заводится хозяином, и он в ней первый.
let one = createRoomState('ABCDE', person('p1', 'Хозяин'), 1000);
need(one.roomId === 'ABCDE', `код комнаты «${one.roomId}»`);
need(one.phase === 'lobby', `новая комната в состоянии «${one.phase}»`);
need(one.players.length === 1 && one.hostPlayerId === 'p1', 'хозяин не сел за свой стол');

// 2. Стол на шестерых, седьмого не пускают.
for (let i = 2; i <= MAX_PLAYERS; i += 1) joinRoom(one, person(`p${i}`, `Игрок ${i}`), 1000 + i);
need(seated(one).length === MAX_PLAYERS, `за столом ${seated(one).length} из ${MAX_PLAYERS}`);
need(!fails(() => joinRoom(one, person('p7', 'Лишний')), 'ROOM_FULL'),
  `седьмого: ${fails(() => joinRoom(one, person('p7', 'Лишний')), 'ROOM_FULL')}`);

// 3. Партию начинает хозяин, и только когда все готовы.
need(!canStart(one), 'партию можно начать, когда никто не готов');
need(!fails(() => startGame(one, 'p2'), 'NOT_HOST'), 'партию начал не хозяин');
for (let i = 2; i <= MAX_PLAYERS; i += 1) setReady(one, `p${i}`, true);
need(canStart(one), 'все готовы, а начать нельзя');
startGame(one, 'p1', 2000);
need(one.phase === 'playing', `после начала комната в состоянии «${one.phase}»`);

// 4. В идущую партию не входят со стороны.
need(!fails(() => joinRoom(one, person('p8', 'Опоздавший')), 'ROOM_STARTED'),
  'в идущую партию вошёл посторонний');

/*
  5. Уход и возвращение. В партии ушедший не вычёркивается: его уделы, долги и
  фишка остаются на доске, и вернуться он должен на своё место. Это и
  проверяется — тем, что число мест не изменилось, а имя осталось его.
*/
const seatedBefore = one.players.length;
leaveRoom(one, 'p3', 3000);
need(one.players.length === seatedBefore, 'ушедшего вычеркнули посреди партии');
need(one.players.find((p) => p.id === 'p3')?.leftAt === 3000, 'уход не отмечен');
joinRoom(one, person('p3', 'Игрок 3'), 3500);
need(one.players.length === seatedBefore, 'вернувшемуся выдали новое место');
need(one.players.find((p) => p.id === 'p3')?.leftAt === 0, 'вернувшийся остался помеченным ушедшим');

// 6. Ушёл хозяин — комната не замирает.
leaveRoom(one, 'p1', 4000);
need(one.hostPlayerId && one.hostPlayerId !== 'p1',
  `хозяин ушёл, а комната осталась за ним: «${one.hostPlayerId}»`);
const heir = one.hostPlayerId;
need(one.players.find((p) => p.id === heir)?.leftAt === 0, 'хозяином стал ушедший');

// 7. Возврат в лобби вычёркивает ушедших и снимает готовность.
backToLobby(one, heir, 5000);
need(one.phase === 'lobby', `после возврата комната в состоянии «${one.phase}»`);
need(one.players.every((p) => !p.ready), 'после возврата кто-то остался готовым');
need(one.players.every((p) => !p.leftAt), 'после возврата в лобби остались ушедшие');

// 8. Настройки меняет хозяин, и только разумные.
const two = createRoomState('BCDEF', person('h', 'Хозяин'), 1000);
joinRoom(two, person('g', 'Гость'), 1100);
need(!fails(() => setSettings(two, 'g', { years: 5 }), 'NOT_HOST'), 'настройки поменял гость');
setSettings(two, 'h', { years: 5, mode: 'last' });
need(two.settings.years === 5 && two.settings.mode === 'last', 'настройки не сохранились');
setSettings(two, 'h', { years: 'сто', mode: 'наугад' });
need(two.settings.years === 5, `«сто» лет приняли как ${two.settings.years}`);
need(two.settings.mode === 'jubilee', `режим «наугад» приняли как «${two.settings.mode}»`);

// 9. Переписка: чужих в ней нет, и она не растёт без предела.
need(!fails(() => addChatMessage(two, 'нездешний', 'привет'), 'NOT_IN_ROOM'),
  'написал тот, кого в комнате нет');
need(!fails(() => addChatMessage(two, 'g', '   '), 'EMPTY_TEXT'), 'принято пустое сообщение');
for (let i = 0; i < 200; i += 1) addChatMessage(two, 'g', `строка ${i}`, 6000 + i);
need(two.chat.length <= 60, `в переписке ${two.chat.length} строк — она растёт без предела`);
need(two.chat[two.chat.length - 1].text === 'строка 199', 'обрезана не та половина переписки');

// 10. Имена: без управляющих знаков, не пустые, не бесконечные.
need(sanitizeName('  Ада  ') === 'Ада', `имя «${sanitizeName('  Ада  ')}»`);
need(sanitizeName('') === 'Странник', 'пустое имя не заменено');
need(sanitizeName('а'.repeat(80)).length === 24, 'имя не укорочено');
renamePlayer(two, 'g', 'Гостья');
need(two.players.find((p) => p.id === 'g')?.name === 'Гостья', 'переименование не сработало');

// 11. Вид комнаты: каждому свой, и хозяин в нём узнаёт себя.
const hostView = buildView(two, 'h', new Set(['h']));
const guestView = buildView(two, 'g', new Set(['h']));
need(hostView.youAreHost === true, 'хозяин не узнал себя в своём же виде');
need(guestView.youAreHost === false, 'гость назван хозяином');
need(guestView.you?.id === 'g', 'гость не нашёл себя в своём виде');
need(hostView.players.find((p) => p.id === 'h')?.online === true, 'подключённый показан отключённым');
need(hostView.players.find((p) => p.id === 'g')?.online === false, 'отключённый показан подключённым');
need(hostView.version === two.version, 'в виде не та версия комнаты');

/*
  12. Порядок подключений не должен значить ничего. Сотня комнат со случайными
  входами, выходами и возвращениями: после всего этого хозяин обязан быть
  живым игроком, а за столом — не больше шестерых.
*/
let seed = 20260917;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
for (let round = 0; round < 100; round += 1) {
  const test = createRoomState('CDEFG', person('p0', 'Первый'), 1000);
  const names = Array.from({ length: 9 }, (unused, i) => `p${i}`);
  for (let step = 0; step < 40; step += 1) {
    const who = names[Math.floor(rnd() * names.length)];
    try {
      if (rnd() < 0.55) joinRoom(test, person(who, who), 2000 + step);
      else leaveRoom(test, who, 2000 + step);
    } catch { /* отказ — это ответ, а не поломка */ }
  }
  const table = seated(test);
  need(table.length <= MAX_PLAYERS, `после случайных входов за столом ${table.length}`);
  if (table.length) {
    need(Boolean(test.hostPlayerId), 'комната осталась без хозяина');
    need(table.some((p) => p.id === test.hostPlayerId), 'хозяином остался тот, кого нет за столом');
  }
}

need(MIN_PLAYERS === 2, `нижний предел стола ${MIN_PLAYERS}`);

if (problems.length) {
  console.error('Комната «Земли обетованной» не прошла проверку:');
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log('OK: комната держит стол на шестерых и не пускает седьмого, в идущую партию со '
  + 'стороны не войти, вернувшийся получает своё место, ушедший хозяин передаёт комнату '
  + 'живому, настройки меняет только хозяин и только разумные, переписка не растёт без '
  + 'предела. Сто комнат со случайными входами и выходами: стол ни разу не переполнился и '
  + 'ни разу не остался без хозяина.');
