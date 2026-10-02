// Монитор комнаты для админ-панели: что он показывает и чего не показывает.
// Игр четыре — «Двенадцать колен», «Земля обетованная», «Царства» и онлайн-
// «Соглядатай»; у «Квартета» и «Художника» мониторы старше и проверяются
// check-admin-live-v4.mjs.
//
// Монитор — единственное место, где состояние идущей партии уходит наружу не
// игроку. Поэтому проверяется он не по одному «работает ли», а по трём
// вопросам, каждый из которых ломается тихо:
//
//   * не утекает ли чужая рука — в карточной игре она тайна, и админке тоже;
//   * закрыт ли монитор от всех, кроме администратора, — и закрыт ли так,
//     чтобы без токена запрос просто шёл дальше, а с чужим получал отказ;
//   * дёшев ли опрос — панель ходит в комнату каждые пару секунд, и пока за
//     столом ничего не изменилось, ответа с телом быть не должно.
//
// Воркер здесь не поднимается: и правила комнаты, и сам монитор — чистые
// функции над состоянием. Запускать ради них Cloudflare значило бы проверять
// Cloudflare.
//
//     node scripts/check-room-observer.mjs

import {
  adminRoomState as tribesRoute,
  adminStateResponse as tribesState,
} from '../cloudflare/twelve-tribes-worker/src/admin-observer.js';
import {
  buildView as tribesView,
  createRoomState as tribesRoom,
  joinRoom as tribesJoin,
  setReady as tribesReady,
  setSettings as tribesSettings,
  startGame as tribesStart,
} from '../cloudflare/twelve-tribes-worker/src/room.js';

import {
  adminRoomState as landRoute,
  adminStateResponse as landState,
} from '../cloudflare/promised-land-preview/src/admin-observer.js';
import {
  createRoomState as landRoom,
  joinRoom as landJoin,
  seated as landSeated,
  setSettings as landSettings,
  startGame as landStart,
} from '../cloudflare/promised-land-preview/src/room.js';
import { B, E } from '../cloudflare/promised-land-preview/src/rules.js';

import {
  adminRoomState as kingdomsRoute,
  adminStateResponse as kingdomsState,
} from '../cloudflare/kingdoms-worker/src/admin-observer.js';
import {
  buildView as kingdomsView,
  createRoomState as kingdomsRoom,
  joinRoom as kingdomsJoin,
  playerAction as kingdomsAction,
  setReady as kingdomsReady,
  setSettings as kingdomsSettings,
  startGame as kingdomsStart,
  stepTable as kingdomsStep,
} from '../cloudflare/kingdoms-worker/src/room.js';
import { R as KR } from '../cloudflare/kingdoms-worker/src/rules.js';

import {
  adminRoomState as spyRoute,
  adminStateResponse as spyState,
} from '../cloudflare/spy-worker/src/admin-observer.js';
import {
  addChatMessage as spyChat,
  buildView as spyView,
  createRoomState as spyRoom,
  joinRoom as spyJoin,
  startGame as spyStart,
} from '../cloudflare/spy-worker/src/engine.js';
import { LOCATIONS as SPY_LOCATIONS } from '../cloudflare/spy-worker/src/locations.js';

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

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
const GET = (headers = {}) => new Request('https://x/admin-state', { method: 'GET', headers });

// ——— «Двенадцать колен»: стол и тайна руки ———

const tribes = tribesRoom('ABCDE', host, 1000);
tribesJoin(tribes, guest, 1001);
tribesSettings(tribes, host.playerId, { target: 0, bots: 1 }, 1002);
tribesReady(tribes, guest.playerId, true, 1003);
tribesStart(tribes, host.playerId, 1004, seeded(7));

const tribesBody = await tribesState(GET(), tribes, tribesView(tribes, '', new Set([host.playerId]))).json();
need(tribesBody.ok === true, `монитор «Колен» не ответил: ${JSON.stringify(tribesBody).slice(0, 80)}`);
need(tribesBody.status === 'playing', `партия видна как «${tribesBody.status}»`);
need(tribesBody.table && tribesBody.table.seats.length === 3,
  `за столом ${tribesBody.table?.seats?.length} мест вместо трёх`);
need(tribesBody.table?.turnName, 'не видно, чей ход');
need(tribesBody.table?.deck > 0, 'колода пуста в только что сданной раздаче');
need(tribesBody.players.some((one) => one.host), 'хозяин комнаты не отмечен');

/*
  Тайна руки. Карты в ответе искать нечего: монитор собирает вид зрителя, и
  масть с достоинством там не появляются ни у кого. Сверяется по самим картам
  розданной раздачи — чтобы проверка ловила не форму ответа, а утечку.
*/
const serialized = JSON.stringify(tribesBody);
const leaked = tribes.game.players.flatMap((one) => one.hand)
  .filter((card) => serialized.includes(`"${card.id}"`));
need(leaked.length === 0, `в ответ монитора попали карты с рук: ${leaked.length}`);
need(!/"hand"/.test(serialized), 'в ответе монитора есть поле руки');
need(tribesBody.table.seats.every((one) => Number.isInteger(one.cards)),
  'число карт у соперников не показано — по нему и смотрят, идёт ли раздача');

// ——— «Земля обетованная»: доска, деньги и земля ———

const land = landRoom('FGHIJ', host, 1000);
landJoin(land, guest, 1001);
landSettings(land, host.playerId, { years: 3, bots: 1 }, 1002);
landStart(land, host.playerId, 1004, seeded(11));

/*
  Партию «Земли обетованной» комната не держит — её держит Durable Object
  рядом, ровно так же собирая движком по списку мест. Здесь она собирается тем
  же способом: иначе проверялась бы не та партия, которую видит монитор.
*/
const landGame = E.createGame({
  players: [...landSeated(land).map((one) => ({ name: one.name })),
    { name: 'Ефрем', isBot: true, botLevel: 'elder' }],
  years: 3,
  mode: 'jubilee',
});
const landBody = await landState(GET(), land, landGame, B, new Set([host.playerId])).json();
need(landBody.ok === true, `монитор «Земли» не ответил: ${JSON.stringify(landBody).slice(0, 80)}`);
need(landBody.status === 'playing', `партия видна как «${landBody.status}»`);
need(landBody.table?.turnName, 'не видно, чей ход');
need(landBody.table?.years === 3, `юбилей назначен на ${landBody.table?.years} вместо трёх`);
need(landBody.table.seats.every((one) => Number.isInteger(one.silver)),
  'серебро игроков не показано — по нему и видно, кто тонет');
need(landBody.table.seats.every((one) => Number.isInteger(one.plots)),
  'уделы игроков не сочтены');

// ——— «Царства»: карта, приказы и тайна ———

const kingdoms = kingdomsRoom('KLMNP', host, 1000);
kingdomsJoin(kingdoms, guest, 1001);
kingdomsSettings(kingdoms, host.playerId, { bots: 1 }, 1002);
kingdomsReady(kingdoms, guest.playerId, true, 1003);
kingdomsStart(kingdoms, host.playerId, 1004, seeded(7));
// Расстановка до конца: люди ставят жетон в первую свободную область, соперники от игры — сами.
for (let guard = 0; kingdoms.game.phase === 'setup' && guard < 100; guard += 1) {
  const seat = kingdoms.game.turnOrder[kingdoms.game.turnPointer];
  const humanId = kingdoms.seats[seat];
  if (humanId) {
    const free = KR.AREAS.find((area) => kingdoms.game.areas[area.id].owner === null);
    kingdomsAction(kingdoms, humanId, 'placeControl', { area: free.id }, 1005);
  } else kingdomsStep(kingdoms, 1005, seeded(guard), new Set());
}
for (let guard = 0; !kingdoms.seats[kingdoms.game.turnOrder[kingdoms.game.turnPointer]] && guard < 20; guard += 1) {
  kingdomsStep(kingdoms, 1006, seeded(guard), new Set());
}
// Закрытый приказ на столе: его вид и сила — тайна, которую монитор хранить обязан.
const orderSeat = kingdoms.game.turnOrder[kingdoms.game.turnPointer];
const orderArea = KR.startingAreasOf(kingdoms.game.players[orderSeat].kingdomId)[0];
kingdoms.game.players[orderSeat].hand[0] = 'march3';
kingdomsAction(kingdoms, kingdoms.seats[orderSeat], 'placeOrder', { kind: 'march3', area: orderArea }, 1007);

const kingdomsBody = await kingdomsState(GET(), kingdoms,
  kingdomsView(kingdoms, '', new Set([host.playerId])), KR).json();
need(kingdomsBody.ok === true, `монитор «Царств» не ответил: ${JSON.stringify(kingdomsBody).slice(0, 80)}`);
need(kingdomsBody.status === 'playing', `партия «Царств» видна как «${kingdomsBody.status}»`);
need(kingdomsBody.table?.seats?.length === 3, `за столом «Царств» ${kingdomsBody.table?.seats?.length} мест вместо трёх`);
need(kingdomsBody.table?.turnName, 'в «Царствах» не видно, чей ход');
need(kingdomsBody.table.seats.every((one) => Number.isInteger(one.areas) && one.areas > 0),
  'земля игроков не сочтена — по ней и видно, кто проигрывает');
need(kingdomsBody.table.seats.some((one) => one.orders > 0), 'поставленный приказ не виден даже числом');
need(kingdomsBody.table.seats.every((one) => one.kingdom && !/^[a-z]+$/.test(one.kingdom)),
  'царства названы кодами, а не именами');
const kingdomsText = JSON.stringify(kingdomsBody);
need(!/march3|"kind"/.test(kingdomsText), 'в ответ монитора попал вид закрытого приказа');
const secretObjectives = kingdoms.game.players.flatMap((one) => [one.objectiveId, ...(one.objectiveChoices || [])])
  .filter(Boolean);
need(!secretObjectives.some((id) => kingdomsText.includes(`"${id}"`)), 'в ответ монитора попала тайная цель');
need(!/"hand"/.test(kingdomsText), 'в ответе монитора «Царств» есть поле руки');

// ——— «Соглядатай»: этап, голоса и тайна локации ———

const spy = spyRoom('QRSTU', host, 1000);
spyJoin(spy, guest, 1001);
spyJoin(spy, { playerId: 'tg:3', name: 'Третий' }, 1002);
spyStart(spy, host.playerId, SPY_LOCATIONS, 1003);
const spyId = spy.players.find((one) => one.role === 'spy').playerId;
spyChat(spy, host.playerId, 'Кто был там вчера?', 1004);
spyChat(spy, spyId, 'Шепчу напарнику: не выдаём себя', 1005, 'spies');
const spyBody = await spyState(GET(), spy, spyView(spy, '', new Set([host.playerId]))).json();
need(spyBody.ok === true, `монитор «Соглядатая» не ответил: ${JSON.stringify(spyBody).slice(0, 80)}`);
need(spyBody.status === 'roles', `партия «Соглядатая» видна как «${spyBody.status}»`);
need(spyBody.players.length === 3, `в комнате «Соглядатая» ${spyBody.players.length} игроков вместо трёх`);
need(spyBody.log.some((line) => line.includes('Кто был там вчера?')), 'общий чат — ход игры — не виден');
const spyText = JSON.stringify(spyBody);
need(!spyText.includes(spy.location), 'в ответ монитора попала локация до итогов');
need(spyBody.players.every((one) => one.role === null) && !/"(isSpy|citizen)"|"role":"spy"/.test(spyText),
  'в ответ монитора попали роли до итогов');
need(!spyText.includes('Шепчу напарнику'), 'в ответ монитора попал закрытый чат соглядатаев');

// ——— замок: без токена мимо, с чужим — отказ ———

const roomStub = () => ({ fetch: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }) });
const normalizeRoomId = (value) => String(value).toUpperCase();
const core = (scope) => ({
  APP_CORE: {
    fetch: async () => new Response(JSON.stringify({
      ok: true, scope, expiresAt: Date.now() + 60_000,
    }), { status: 200 }),
  },
});

const anonymous = await tribesRoute(new Request('https://x/admin/rooms/ABCDE/state'), core('admin'),
  { roomStub, normalizeRoomId, cors: {} });
need(anonymous === null, 'без токена монитор ответил сам, вместо того чтобы пропустить запрос дальше');

const stranger = await tribesRoute(
  new Request('https://x/admin/rooms/ABCDE/state', { headers: { Authorization: 'Bearer bgw_stranger' } }),
  core('player'), { roomStub, normalizeRoomId, cors: {} });
need(stranger && stranger.status === 403,
  `с обычной сессией монитор ответил ${stranger?.status} вместо 403`);

const admin = await tribesRoute(
  new Request('https://x/admin/rooms/ABCDE/state', { headers: { Authorization: 'Bearer bgw_admin' } }),
  core('admin'), { roomStub, normalizeRoomId, cors: {} });
need(admin && admin.status === 200, `администратора монитор встретил ${admin?.status}`);

const posted = await tribesRoute(
  new Request('https://x/admin/rooms/ABCDE/state', { method: 'POST', headers: { Authorization: 'Bearer bgw_admin' } }),
  core('admin'), { roomStub, normalizeRoomId, cors: {} });
need(posted && posted.status === 404, `монитор принял POST с ответом ${posted?.status}`);

const landAnonymous = await landRoute(new Request('https://x/api/admin/rooms/FGHIJ/state'), core('admin'),
  { roomStub, normalizeRoomId });
need(landAnonymous === null, 'без токена монитор «Земли» ответил сам');

const landStranger = await landRoute(
  new Request('https://x/api/admin/rooms/FGHIJ/state', { headers: { Authorization: 'Bearer bgw_stranger' } }),
  core('player'), { roomStub, normalizeRoomId });
need(landStranger && landStranger.status === 403,
  `с обычной сессией монитор «Земли» ответил ${landStranger?.status}`);

for (const [title, route, path] of [
  ['«Царств»', kingdomsRoute, 'https://x/admin/rooms/KLMNP/state'],
  ['«Соглядатая»', spyRoute, 'https://x/admin/rooms/QRSTU/state'],
]) {
  const passing = await route(new Request(path), core('admin'), { roomStub, normalizeRoomId, cors: {} });
  need(passing === null, `без токена монитор ${title} ответил сам`);
  const refused = await route(new Request(path, { headers: { Authorization: 'Bearer bgw_stranger' } }),
    core('player'), { roomStub, normalizeRoomId, cors: {} });
  need(refused && refused.status === 403, `с обычной сессией монитор ${title} ответил ${refused?.status}`);
  const allowed = await route(new Request(path, { headers: { Authorization: 'Bearer bgw_admin' } }),
    core('admin'), { roomStub, normalizeRoomId, cors: {} });
  need(allowed && allowed.status === 200, `администратора монитор ${title} встретил ${allowed?.status}`);
}

// ——— дешёвый опрос: та же версия — тот же ответ без тела ———

const first = tribesState(GET(), tribes, tribesView(tribes, '', new Set()));
const etag = first.headers.get('ETag');
need(Boolean(etag), 'у состояния нет версии, и опрос будет качать его целиком');
const repeat = tribesState(GET({ 'If-None-Match': etag }), tribes, tribesView(tribes, '', new Set()));
need(repeat.status === 304, `повторный опрос вернул ${repeat.status} вместо 304`);

tribes.version += 1;
const moved = tribesState(GET({ 'If-None-Match': etag }), tribes, tribesView(tribes, '', new Set()));
need(moved.status === 200, `после хода монитор всё ещё отвечает ${moved.status}`);

const landFirst = landState(GET(), land, landGame, B, new Set());
const landEtag = landFirst.headers.get('ETag');
const landRepeat = landState(GET({ 'If-None-Match': landEtag }), land, landGame, B, new Set());
need(landRepeat.status === 304, `повторный опрос «Земли» вернул ${landRepeat.status} вместо 304`);

for (const [title, respond] of [
  ['«Царств»', (headers) => kingdomsState(GET(headers), kingdoms, kingdomsView(kingdoms, '', new Set()), KR)],
  ['«Соглядатая»', (headers) => spyState(GET(headers), spy, spyView(spy, '', new Set()))],
]) {
  const tag = respond({}).headers.get('ETag');
  need(Boolean(tag), `у состояния ${title} нет версии`);
  need(respond({ 'If-None-Match': tag }).status === 304, `повторный опрос ${title} качает состояние целиком`);
}

// ——— пустая комната ———

const missing = await tribesState(GET(), null, null).json();
need(missing.ok === false, 'монитор бодро отчитался о комнате, которой нет');

if (problems.length) {
  console.error(`Монитор комнаты не прошёл проверку (${problems.length}):`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log('OK: монитор показывает идущую партию всех четырёх игр — чей ход, колода и очки в «Коленах», '
  + 'год, серебро и уделы в «Земле», землю и число приказов в «Царствах», этап и общий чат в «Соглядатае», — '
  + 'но ни одной карты с чужих рук, ни закрытого приказа, ни тайной цели, ни локации с ролями до итогов, ни '
  + 'закрытого чата соглядатаев; без токена запрос идёт мимо '
  + 'монитора, с обычной сессией получает отказ, POST не принимается вовсе; пока версия комнаты не '
  + 'изменилась, опрос отвечает «не изменилось» без тела.');
