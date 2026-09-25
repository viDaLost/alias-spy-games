// «Царства»: правила и карта проверяются числом, а не глазом.
//
// Стратегия про тайные приказы ломается тише всех остальных игр в этом
// репозитории: область может потерять хозяина без спора, приказ — пройти
// там, где карты нет, укрепление — забыть свой предел, а раскрытие —
// применить стражу после атаки вместо «до». Ни одну из этих бед не видно на
// экране. Здесь карта проверяется как данные, а партия — сотнями раздач
// ботами, с разбором каждого столкновения после каждого раскрытия.
//
//   node scripts/check-kingdoms.mjs
//
// Случайность посеяна числом: упавшая проверка обязана падать снова на том
// же месте.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'web/games');

const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
for (const file of ['kingdoms-rules.js', 'kingdoms-engine.js', 'kingdoms-bots.js']) {
  const code = fs.readFileSync(path.join(dir, file), 'utf8');
  new Function('window', code)(sandbox.window);
}
const R = sandbox.window.KingdomsRules;
const E = sandbox.window.KingdomsEngine;
const Bots = sandbox.window.KingdomsBots;

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

/** Тасовка с зерном: одна и та же партия воспроизводится дословно. */
function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ——————————————————————————————————————————————— карта как данные

need(R.AREAS.length === 24, `областей ${R.AREAS.length} вместо 24`);
need(R.REGIONS.length === 6, `регионов ${R.REGIONS.length} вместо 6`);
for (const region of R.REGIONS) {
  const many = R.areasOfRegion(region.id).length;
  need(many === 4, `в регионе ${region.id} ${many} областей вместо 4`);
}
need(new Set(R.AREAS.map((a) => a.id)).size === 24, 'у двух областей одинаковый идентификатор');

// Соседство симметрично и не пусто, и у карты ровно два брода.
for (const area of R.AREAS) {
  const many = R.neighborsOf(area.id).length;
  need(many >= 2, `у области ${area.id} меньше двух соседей (${many})`);
  for (const to of R.neighborsOf(area.id)) {
    need(R.areAdjacent(to, area.id), `связь ${area.id}→${to} не симметрична`);
    need(R.edgeType(area.id, to) === R.edgeType(to, area.id), `тип связи ${area.id}↔${to} разошёлся по направлениям`);
  }
}
need(R.FORDS.length === 2, `бродов ${R.FORDS.length} вместо 2`);
need(R.EDGES.filter((e) => e.type === 'land').length === 30, 'связей по суше должно быть 30 (24 внутри регионов + 6 по кольцу)');

// Карта связна целиком — иначе часть областей недостижима в принципе.
{
  const seen = new Set([R.AREAS[0].id]);
  const stack = [R.AREAS[0].id];
  while (stack.length) {
    const at = stack.pop();
    for (const to of R.neighborsOf(at)) if (!seen.has(to)) { seen.add(to); stack.push(to); }
  }
  need(seen.size === 24, `карта не связна целиком: достижимо только ${seen.size} областей из 24`);
}

// Пять царств, у каждого домашний регион и ровно одна столица на карте.
need(R.KINGDOMS.length === 5, `царств ${R.KINGDOMS.length} вместо 5`);
need(new Set(R.KINGDOMS.map((k) => k.region)).size === 5, 'у двух царств один и тот же домашний регион');
need(new Set(R.KINGDOMS.map((k) => k.color)).size === 5, 'у двух царств одинаковый цвет');
for (const kingdom of R.KINGDOMS) {
  const capitals = R.AREAS.filter((a) => a.capitalOf === kingdom.id);
  need(capitals.length === 1, `у царства ${kingdom.id} столиц ${capitals.length} вместо одной`);
  need(capitals[0]?.region === kingdom.region, `столица ${kingdom.id} стоит не в своём регионе`);
}
need(R.AREAS.filter((a) => a.capitalOf).length === 5, 'столиц на карте должно быть ровно пять');
{
  // Регион без царства (Порубежье) — ничья земля с городом, а не пустое место.
  const homeless = R.REGION_IDS.filter((id) => !R.KINGDOMS.some((k) => k.region === id));
  need(homeless.length === 1, `регионов без царства ${homeless.length} вместо одного`);
  need(R.areasOfRegion(homeless[0]).some((a) => a.city), 'регион без царства должен всё равно нести город');
}

// Раскладки на 2–5 игроков: разные царства, у каждого — своя столица на старте.
for (const size of [2, 3, 4, 5]) {
  const layout = R.STARTING_LAYOUTS[size];
  need(layout.length === size, `раскладка на ${size} даёт ${layout.length} царств`);
  need(new Set(layout).size === layout.length, `в раскладке на ${size} повторяется царство`);
  need(R.SETUP_TOKENS[size] >= 2, `на ${size} игроков меньше двух жетонов контроля на расстановку`);
  need(size * (1 + R.SETUP_TOKENS[size]) <= R.AREAS.length, `на ${size} игроков расстановка не помещается на карту`);
}

// Города несут больше единицы ценности — иначе город не отличить от пустоши.
for (const area of R.AREAS) if (area.city) need(area.value >= 2, `у города ${area.id} ценность меньше двух`);

// Запас жетонов — 25, как пять раундов по пять жетонов; прибрежных областей хватает для кораблей.
need(Object.values(R.TOKEN_SUPPLY).reduce((a, b) => a + b, 0) === 25, 'в запасе не 25 жетонов');
need(R.COASTAL.size >= 6 && [...R.COASTAL].every((id) => R.areaOf(id)), 'прибрежных областей мало или среди них несуществующая');
need(R.OBJECTIVES.length >= 10, 'тайных целей меньше десяти — пятерым не раздать по две без повторов');

// ——————————————————————————————————————————————— стенд

/** Партия сразу после расстановки: у каждого столица и соседняя область; ход — у места seat. */
function bench(size = 2, kingdomIds, { seat = 0 } = {}) {
  const ids = kingdomIds || R.STARTING_LAYOUTS[size];
  const state = E.createGame({ kingdomIds: ids, random: seeded(11) });
  while (state.phase === 'setup') E.skipTurn(state, E.currentTurn(state));
  for (const player of state.players) {
    const capital = R.capitalOf(player.kingdomId);
    state.areas[R.areaId(R.areaOf(capital).region, 'cw')].owner = player.id;
  }
  state.turnOrder = ids.map((_, i) => (seat + i) % ids.length);
  state.turnPointer = 0;
  state.firstPlayer = seat;
  return state;
}
const give = (state, seat, kinds) => { state.players[seat].hand = [...kinds, 'feint']; };
const place = (state, seat, placement) => {
  state.turnOrder = [seat]; state.turnPointer = 0; state.cycle = 0; state.phase = 'planning';
  if (!state.players[seat].hand.includes(placement.kind)) state.players[seat].hand.unshift(placement.kind);
  if (state.players[seat].hand.length < 2) state.players[seat].hand.push('march1');
  return E.placeOrder(state, seat, placement);
};
const check = (state, seat, placement) => {
  state.turnOrder = [seat]; state.turnPointer = 0; state.phase = 'planning';
  if (placement.kind && !state.players[seat].hand.includes(placement.kind)) state.players[seat].hand.unshift(placement.kind);
  if (state.players[seat].hand.length < 2) state.players[seat].hand.push('march1');
  return E.validatePlacement(state, seat, placement);
};
function resolveWith(state, orders) {
  state.orders = orders.map((one, at) => ({ id: `t${at}`, revealed: false, area: null, to: null, target: null, ...one }));
  state.phase = 'reveal';
  return E.resolveRound(state);
}

// ——————————————————————————————————————————————— расстановка и цели

{
  const state = E.createGame({ kingdomIds: R.STARTING_LAYOUTS[3], random: seeded(5) });
  need(state.phase === 'setup', 'партия начинается не с расстановки');
  for (const player of state.players) {
    need(state.areas[R.capitalOf(player.kingdomId)].owner === player.id, `у ${player.kingdomId} на старте нет столицы`);
    need(player.objectiveChoices.length === 2 && player.objectiveChoices[0] !== player.objectiveChoices[1], 'раздано не две разные цели');
  }
  const all = state.players.flatMap((p) => p.objectiveChoices);
  need(new Set(all).size === all.length, 'одна и та же цель досталась двоим');
  const first = E.currentTurn(state);
  const other = state.turnOrder[1];
  const free = R.AREAS.find((a) => state.areas[a.id].owner === null).id;
  need(!E.validateControl(state, other, free).ok, 'жетон контроля принят не в свою очередь');
  need(!E.validateControl(state, first, R.capitalOf(state.players[other].kingdomId)).ok, 'жетон контроля встал в занятую область');
  E.chooseObjective(state, first, state.players[first].objectiveChoices[1]);
  let threw = false;
  try { E.chooseObjective(state, first, 'capital'); } catch { threw = true; }
  need(threw, 'цель выбрана второй раз');
  let steps = 0;
  while (state.phase === 'setup') { E.placeControl(state, E.currentTurn(state), R.AREAS.find((a) => state.areas[a.id].owner === null).id); steps += 1; }
  need(steps === 3 * R.SETUP_TOKENS[3], `расстановка на троих заняла ${steps} ходов вместо ${3 * R.SETUP_TOKENS[3]}`);
  need(state.phase === 'planning' && state.round === 1, 'после расстановки не начался первый раунд');
  need(state.players.every((p) => p.objectiveId && p.objectiveChoices.includes(p.objectiveId)), 'после расстановки цель не из розданных');
  need(state.players.every((p) => p.hand.length === 6 && p.hand.includes('feint')), 'рука первого раунда — не шесть жетонов с пустым');
  const seen = E.visibleStateFor(state, other);
  need(seen.players[first].objectiveId === null, 'чужая тайная цель видна до конца партии');
}

// ——————————————————————————————————————————————— размещение

{
  const state = bench(2);
  const [a0, a1] = [R.capitalOf(state.players[0].kingdomId), R.areaId(R.areaOf(R.capitalOf(state.players[0].kingdomId)).region, 'cw')];
  const enemy = R.capitalOf(state.players[1].kingdomId);
  const neutral = R.neighborsOf(a1).find((id) => state.areas[id].owner === null);
  // Одна граница — один жетон, чей бы он ни был.
  place(state, 0, { kind: 'march2', area: a1, to: neutral });
  state.areas[neutral].owner = 1;
  need(!check(state, 1, { kind: 'march1', area: neutral, to: a1 }).ok, 'на занятую границу лёг второй жетон с другой стороны');
  state.areas[neutral].owner = null;
  // В центр своей — сколько угодно; в центр чужой — войско нельзя.
  place(state, 0, { kind: 'march1', area: a0 });
  need(check(state, 0, { kind: 'march3', area: a0 }).ok, 'второй защитный жетон в центр своей области не принят');
  need(!check(state, 0, { kind: 'march3', area: enemy }).ok, 'войско встало в центр чужой области');
  need(!check(state, 0, { kind: 'march2', area: a0, to: a1 }).ok, 'разрешена атака на собственную область');
  // Корабли: только с воды на прибрежную, и одна прибрежная граница — один жетон.
  const coast = [...R.COASTAL].find((id) => state.areas[id].owner !== 0);
  const inland = R.AREAS.find((a) => !R.isCoastal(a.id) && state.areas[a.id].owner !== 0).id;
  need(check(state, 0, { kind: 'navy1', to: coast }).ok, 'корабли не атакуют прибрежную область с воды');
  need(!check(state, 0, { kind: 'navy1', to: inland }).ok, 'корабли атакуют область вдали от воды');
  place(state, 0, { kind: 'navy1', to: coast });
  need(!check(state, 1, { kind: 'navy2', to: coast }).ok, 'на одну прибрежную границу легли два жетона');
  need(!check(state, 0, { kind: 'navy1', area: enemy }).ok, 'корабли защищают чужую область');
  // Засада — в любую; поджог — только в чужую; мир — только в своей.
  need(check(state, 0, { kind: 'ambush2', area: enemy }).ok, 'засада не встала в чужую область');
  need(check(state, 0, { kind: 'ambush2', area: a0 }).ok, 'засада не встала в свою область');
  need(!check(state, 0, { kind: 'raid', area: a0 }).ok, 'разрешён поджог своей области');
  need(check(state, 0, { kind: 'peace', area: a0 }).ok && !check(state, 0, { kind: 'peace', area: enemy }).ok,
    'завет мира не в своей области или в чужой');
  // Благословение — только на свой жетон битвы, лежит открыто.
  const own = state.orders.find((o) => o.owner === 0 && o.kind === 'march2');
  need(check(state, 0, { kind: 'bless2', target: own.id }).ok, 'благословение не легло на своё войско');
  place(state, 0, { kind: 'bless2', target: own.id });
  need(E.forceOf(state, own) === 4, 'благословение +2 не прибавилось к силе');
  need(!check(state, 0, { kind: 'bless1', target: own.id }).ok, 'второе благословение на тот же жетон');
  const seenBless = E.visibleStateFor(state, 1).orders.find((o) => o.target === own.id);
  need(seenBless && seenBless.kind === 'bless2', 'благословение не видно сопернику сразу');
  need(!('kind' in E.visibleStateFor(state, 1).orders.find((o) => o.id === own.id)), 'закрытый жетон под благословением раскрыл вид');
  // Один жетон остаётся за ширмой.
  state.players[0].hand = ['march1'];
  state.turnOrder = [0]; state.turnPointer = 0;
  need(!E.validatePlacement(state, 0, { kind: 'march1', area: a0 }).ok, 'последний жетон в руке удалось положить');
}

// Изгнанник: без земли ставит только войско — на любую границу.
{
  const state = bench(2);
  for (const id of Object.keys(state.areas)) if (state.areas[id].owner === 1) state.areas[id].owner = null;
  state.players[1].ronin = true;
  const [x, y] = [R.EDGES[5].a, R.EDGES[5].b];
  need(check(state, 1, { kind: 'march2', area: x, to: y }).ok || state.areas[y].owner === 1, 'изгнанник не может атаковать через любую границу');
  need(!check(state, 1, { kind: 'raid', area: x }).ok, 'изгнанник поджигает');
  need(!check(state, 1, { kind: 'peace', area: x }).ok, 'изгнанник заключает мир');
}

// ——————————————————————————————————————————————— исполнение

// 1) Ничья равнина без напечатанной защиты берётся войском силой 1; город у гор — только силой 3.
{
  const state = bench(2);
  const from = R.areaId(R.areaOf(R.capitalOf(state.players[0].kingdomId)).region, 'cw');
  const plain = R.neighborsOf(from).find((id) => state.areas[id].owner === null && R.printedDefense(R.areaOf(id)) === 0);
  if (plain) {
    resolveWith(state, [{ owner: 0, kind: 'march1', area: from, to: plain }]);
    need(state.areas[plain].owner === 0, 'войско силой 1 не взяло ничью область без защиты');
  }
  const fort = 'pogranichye-rim';
  need(R.printedDefense(R.areaOf(fort)) === 2, 'Пограничная Твердыня: город в горах должен нести защиту 2');
  const s2 = bench(2);
  s2.areas['pogranichye-cw'].owner = 0;
  resolveWith(s2, [{ owner: 0, kind: 'march2', area: 'pogranichye-cw', to: fort }]);
  need(s2.areas[fort].owner === null, 'сила 2 взяла защиту 2 — ничья ушла атакующему');
  resolveWith(s2, [{ owner: 0, kind: 'march3', area: 'pogranichye-cw', to: fort }]);
  need(s2.areas[fort].owner === 0, 'сила 3 не взяла защиту 2');
}

// 2) Двое атакуют одну область равной силой — побеждает защита, даже ничейная.
{
  const state = bench(2);
  state.areas['kedem-cw'].owner = 0;
  state.areas['kedem-ccw'].owner = 1;
  state.areas['kedem-hub'].owner = null;
  resolveWith(state, [
    { owner: 0, kind: 'march2', area: 'kedem-cw', to: 'kedem-hub' },
    { owner: 1, kind: 'march2', area: 'kedem-ccw', to: 'kedem-hub' },
  ]);
  need(state.areas['kedem-hub'].owner === null, 'при равенстве сильнейших атак хозяин области поменялся');
}

// 3) Силы одного игрока складываются: войско, корабли и засада на одну цель.
{
  const state = bench(2);
  state.areas['primorye-hub'].owner = 1;
  state.areas['primorye-cw'].owner = 0;
  const report = resolveWith(state, [
    { owner: 1, kind: 'march2', area: 'primorye-hub' },
    { owner: 0, kind: 'march1', area: 'primorye-cw', to: 'primorye-hub' },
    { owner: 0, kind: 'navy1', to: 'primorye-hub' },
    { owner: 0, kind: 'ambush1', area: 'primorye-hub' },
  ]);
  const line = report.find((one) => one.area === 'primorye-hub');
  need(line.attackers[0].total === 3 + (state.players[0].kingdomId === 'tarsis' ? 1 : 0), 'войско, корабли и засада одного игрока не сложились');
  need(line.defense.tokens === 2, 'защитное войско в центре не посчиталось');
}

// 4) Победа защитника — открытый жетон контроля: +1 к защите и +1 очко; стража без нападения — тоже победа.
{
  const state = bench(2);
  const held = R.capitalOf(state.players[0].kingdomId);
  const from = R.neighborsOf(held).find((id) => state.areas[id].owner !== 0);
  state.areas[from].owner = 1;
  const base = E.defenseOf(state, held).total;
  resolveWith(state, [{ owner: 1, kind: 'march1', area: from, to: held }]);
  need(state.areas[held].veterans === 1 && E.defenseOf(state, held).total === base + 1, 'отбитая атака не дала открытый жетон контроля');
  resolveWith(state, [{ owner: 0, kind: 'march1', area: held }]);
  need(state.areas[held].veterans === 2, 'оборона без нападения не засчитана победой защитника');
  resolveWith(state, [{ owner: 1, kind: 'march5', area: from, to: held }, { owner: 1, kind: 'ambush2', area: held }]);
  need(state.areas[held].owner === 1 && state.areas[held].veterans === 0, 'после захвата открытые жетоны прежнего хозяина остались');
}

// 5) Поход из области, потерянной в тот же раунд, доводит атаку до конца.
{
  const state = bench(2);
  state.areas['primorye-cw'].owner = 0;
  state.areas['primorye-rim'].owner = 1;
  state.areas['primorye-hub'].owner = null;
  const report = resolveWith(state, [
    { owner: 0, kind: 'march2', area: 'primorye-cw', to: 'primorye-hub' },
    { owner: 1, kind: 'march5', area: 'primorye-rim', to: 'primorye-cw' },
  ]);
  need(report.find((one) => one.area === 'primorye-cw').newOwner === 1, 'область-источник не взята для проверки одновременности');
  need(state.areas['primorye-hub'].owner === 0, 'поход из потерянной области исчез вместе с ней');
}

// 6) Поджог: пепелище, жетоны вокруг уходят, хозяина нет навсегда; без соседства и засады — не срабатывает.
{
  const state = bench(2);
  const mine = R.areaId(R.areaOf(R.capitalOf(state.players[0].kingdomId)).region, 'cw');
  const victim = R.neighborsOf(mine).find((id) => state.areas[id].owner !== 0);
  state.areas[victim].owner = 1;
  resolveWith(state, [
    { owner: 0, kind: 'raid', area: victim },
    { owner: 1, kind: 'march3', area: victim },
    { owner: 0, kind: 'march5', area: mine, to: victim },
  ]);
  need(state.areas[victim].special === 'scorched' && state.areas[victim].owner === null, 'поджог не оставил пепелища');
  need(!check(state, 0, { kind: 'march2', area: mine, to: victim }).ok, 'на пепелище снова можно напасть');
  need(!check(state, 0, { kind: 'ambush1', area: victim }).ok, 'в пепелище легла засада');
  const far = R.AREAS.find((a) => state.areas[a.id].owner === 1 && !R.neighborsOf(a.id).some((id) => state.areas[id].owner === 0)).id;
  resolveWith(state, [{ owner: 0, kind: 'raid', area: far }]);
  need(state.areas[far].special !== 'scorched', 'поджог сработал без соседства и без засады');
  resolveWith(state, [{ owner: 0, kind: 'raid', area: far }, { owner: 0, kind: 'ambush1', area: far }]);
  need(state.areas[far].special === 'scorched', 'поджог с собственной засадой в области не сработал');
  // Пепелище не мешает взять регион: считаются только уцелевшие области.
  const region = R.areaOf(far).region;
  for (const area of R.areasOfRegion(region)) if (area.id !== far && state.areas[area.id].special !== 'scorched') state.areas[area.id].owner = 0;
  need(E.regionController(state, region) === 0, 'пепелище помешало взять регион целиком');
}

// 7) Завет мира: атаки в этот раунд снимаются, дальше область неприкосновенна и из неё не атакуют.
{
  const state = bench(2);
  const held = R.capitalOf(state.players[0].kingdomId);
  const from = R.neighborsOf(held).find((id) => state.areas[id].owner !== 0);
  state.areas[from].owner = 1;
  resolveWith(state, [{ owner: 0, kind: 'peace', area: held }, { owner: 1, kind: 'march5', area: from, to: held }]);
  need(state.areas[held].owner === 0 && state.areas[held].special === 'peace', 'завет мира не удержал область');
  need(!check(state, 1, { kind: 'march5', area: from, to: held }).ok, 'область под заветом мира снова можно атаковать');
  need(!check(state, 0, { kind: 'march1', area: held, to: from }).ok, 'из области под заветом мира можно атаковать');
}

// 8) Карты: соглядатаи видят, пророк сбрасывает, право первенства возвращает в запас; благословлённое неприкасаемо.
{
  const state = bench(3, ['kedem', 'tarsis', 'or']);
  need(state.players[0].cards.scout === 3 && state.players[1].cards.scout === 2, 'у Кидара не три соглядатая или у других не два');
  state.orders = [
    { id: 'x1', owner: 1, kind: 'march3', area: R.capitalOf('tarsis'), to: null, round: 1 },
    { id: 'x2', owner: 1, kind: 'navy2', area: null, to: 'primorye-hub', round: 1 },
    { id: 'x3', owner: 2, kind: 'march1', area: R.capitalOf('or'), to: null, round: 1 },
    { id: 'x4', owner: 2, kind: 'bless1', area: R.capitalOf('or'), to: null, target: 'x3', open: true, round: 1 },
  ];
  state.turnOrder = [0]; state.turnPointer = 0; state.herald = 0;
  E.useCard(state, 0, { card: 'scout', target: 'x1' });
  need(state.scoutIntel[0][0].kind === 'march3' && state.turnOrder[state.turnPointer] === 0, 'соглядатаи не донесли вид или закончили ход');
  E.useCard(state, 0, { card: 'prophet', target: 'x2' });
  need(!state.orders.some((o) => o.id === 'x2') && state.players[0].cards.prophet === 0, 'пророк не сбросил жетон');
  need(!E.validateCard(state, 0, 'scout', 'x3').ok, 'карта дотянулась до благословлённого жетона');
  const supplyBefore = state.players[1].supply.length;
  E.useCard(state, 0, { card: 'herald', target: 'x1' });
  need(state.players[1].supply.length === supplyBefore + 1 && state.herald === null, 'право первенства не вернуло жетон в запас или осталось');
  const two = bench(2);
  two.turnOrder = [two.firstPlayer]; two.turnPointer = 0;
  E.beginRound(two);
  need(two.herald === null, 'в игре вдвоём у первого игрока есть право первенства');
}

// 9) Способности царств.
{
  const tarsis = bench(2, ['tarsis', 'kedem']);
  need(E.forceOf(tarsis, { owner: 0, kind: 'navy1', to: 'primorye-hub' }) === 2, 'корабли Фарсиса не получили +1');
  const or = bench(2, ['or', 'kedem']);
  const orCapital = R.capitalOf('or');
  need(E.defenseOf(or, orCapital).ability === 1 && E.defenseOf(or, orCapital).printed === 3, 'горная столица Ора считается не как 2+1 и +1 способности');
  const yor = bench(2, ['yor', 'kedem']);
  yor.areas['dolina-hub'].owner = 0;
  need(E.forceOf(yor, { owner: 0, kind: 'march2', area: 'dolina-hub', to: 'ravnina-hub' }) === 3, 'войско Галаада через брод не получило +1');
  need(E.forceOf(yor, { owner: 0, kind: 'march2', area: 'dolina-hub', to: 'dolina-cw' }) === 2, 'войско Галаада получило +1 не через брод');
  const prestol = bench(2, ['prestol', 'kedem']);
  need(E.defenseOf(prestol, R.capitalOf('prestol')).ability === 1, 'Зодчие не дали +1 к защите города');
}

// 10) Карты регионов: первый, кто взял регион, получает награду один раз.
{
  const state = bench(2);
  for (const area of R.areasOfRegion('primorye')) state.areas[area.id].owner = 0;
  resolveWith(state, []);
  need(state.regionCards.primorye === 0 && state.areas['primorye-rim'].special === 'honor2', 'награда Приморья не легла');
  const honor = E.honorOf(state, 'primorye-rim');
  need(honor === R.areaOf('primorye-rim').value + 2, 'жетон «+2 к чести» не прибавил двух очков');
  for (const area of R.areasOfRegion('kedem')) state.areas[area.id].owner = 1;
  const prophets = state.players[1].cards.prophet;
  resolveWith(state, []);
  resolveWith(state, []);
  need(state.players[1].cards.prophet === prophets + 1, 'награда Аравии дана не ровно один раз');
}

// 11) Счёт и равенство: честь + открытые жетоны + 5 за регион + цель; при равенстве — регионы, затем области.
{
  const state = bench(2);
  for (const area of R.areasOfRegion('nagorye')) state.areas[area.id].owner = 0;
  state.areas['nagorye-hub'].veterans = 2;
  state.players[0].objectiveId = 'capital';
  state.players[1].objectiveId = 'capital';
  E.finishGame(state);
  const s0 = state.finalScore[0];
  need(s0.total === s0.areaValue + s0.veterans + s0.regions * 5 + s0.objectivePoints && s0.veterans >= 2 && s0.regions >= 1,
    'итог не сложился из чести, открытых жетонов, регионов и цели');
  need(state.status === 'over', 'после подсчёта партия не окончена');
}

// ——————————————————————————————————————————————— имена по Синодальному переводу

{
  /*
    Царства, их столицы и библейские места на карте называются так, как они
    написаны в Синодальном переводе. Сверка — по полному списку словоформ
    перевода (scripts/data/bible-synodal-forms.json, тот же, что у словесных
    игр): каждое слово имени должно встретиться в тексте. Описательные имена
    вроде «Прибрежный Путь» — русские слова, а не имена, и здесь не сверяются.
  */
  const synodal = new Set(JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'data', 'bible-synodal-forms.json'), 'utf8')));
  const inBible = (name) => name.split(/\s+/).every((word) => synodal.has(word.toUpperCase().replace(/Ё/g, 'Е')));
  const named = [
    ...R.KINGDOMS.map((k) => k.name),
    ...R.KINGDOMS.map((k) => R.areaOf(R.capitalOf(k.id)).name),
    ...R.KINGDOMS.map((k) => k.abilityTitle).filter((title) => /Фарсис/.test(title)),
    ...['dolina', 'nagorye', 'ravnina', 'kedem'].map((id) => R.REGIONS.find((r) => r.id === id).name),
    ...['dolina-hub', 'dolina-ccw', 'kedem-ccw'].map((id) => R.areaOf(id).name),
  ];
  for (const name of named) need(inBible(name), `«${name}» написано не так, как в Синодальном переводе`);
  // Прежние выдуманные имена не должны вернуться ни в царства, ни в карту.
  const visible = [...R.KINGDOMS.flatMap((k) => [k.name, k.tagline, k.abilityTitle, k.abilityText]),
    ...R.REGIONS.map((r) => r.name), ...R.AREAS.map((a) => a.name),
    ...R.ORDERS.map((o) => o.text), ...Object.values(R.REGION_CARDS).map((c) => c.text)].join(' | ');
  for (const old of ['Тарси', 'Йор', 'Кедем', 'Дом Ора', 'Крепость Ора', 'Престол Равнины', 'Престольный']) {
    need(!visible.includes(old), `осталось выдуманное имя «${old}»`);
  }
}

// ——————————————————————————————————————————————— кланы: выбор и особые жетоны

{
  // У каждого царства свой особый жетон — ни у кого другого его нет.
  const clanTokens = R.KINGDOMS.map((k) => k.clanToken);
  need(clanTokens.every((id) => R.orderOf(id)?.clan), 'у царства нет особого жетона или он не помечен как особый');
  need(new Set(clanTokens).size === R.KINGDOMS.length, 'два царства делят один особый жетон');
  for (const kingdom of R.KINGDOMS) {
    const supply = R.supplyOf(kingdom.id);
    need(supply.length === 26, `у ${kingdom.id} в запасе ${supply.length} жетонов вместо 25 общих и одного особого`);
    need(supply.filter((kind) => R.orderOf(kind).clan).length === 1 && supply.includes(kingdom.clanToken),
      `в запасе ${kingdom.id} не ровно один свой особый жетон`);
    need(kingdom.abilityTitle && kingdom.abilityText, `у ${kingdom.id} не описана способность`);
  }
  const state = E.createGame({ kingdomIds: ['kedem', 'prestol'], random: seeded(3) });
  need(state.players[0].supply.includes('raider') && !state.players[1].supply.includes('raider'), 'особый жетон попал не к своему царству');

  // Выбор клана: выбранное царство — на своём месте, остальные без повторов.
  for (const size of [2, 3, 4, 5]) {
    for (const kingdom of R.KINGDOMS) {
      const ids = R.kingdomsFor(size, [kingdom.id]);
      need(ids.length === size && ids[0] === kingdom.id && new Set(ids).size === size, `выбор ${kingdom.id} на ${size} игроков: ${ids.join(',')}`);
    }
  }
  const clash = R.kingdomsFor(3, ['or', 'or', 'yor']);
  need(clash[0] === 'or' && clash[2] === 'yor' && new Set(clash).size === 3, `спор за одно царство решён неверно: ${clash.join(',')}`);
  need(R.kingdomsFor(2, []).join() === R.STARTING_LAYOUTS[2].join(), 'без выбора раскладка не та, что прежде');
}
{
  // «Колесницы» Сеннаара — войско силой 6; «Флагман» Фарсиса с его способностью — 4.
  const state = bench(2, ['prestol', 'tarsis']);
  need(E.forceOf(state, { owner: 0, kind: 'march6', area: 'x' }) === 6, '«Колесницы» не силой 6');
  need(E.forceOf(state, { owner: 1, kind: 'navy3', to: 'x' }) === 4, '«Флагман» Фарсиса не силой 4');
  const bless = bench(2, ['or', 'kedem']);
  const mine = R.areaId(R.areaOf(R.capitalOf('or')).region, 'cw');
  const order = place(bless, 0, { kind: 'march2', area: mine });
  place(bless, 0, { kind: 'bless3', target: order.id });
  need(E.forceOf(bless, order) === 5, '«Благословение гор» прибавило не +3');
}
{
  // «Набег всадников» Кидара жжёт и без соседства, обычный поджог — нет.
  const state = bench(2, ['kedem', 'tarsis']);
  const far = R.AREAS.find((a) => state.areas[a.id].owner === 1 && !R.neighborsOf(a.id).some((id) => state.areas[id].owner === 0)).id;
  resolveWith(state, [{ owner: 0, kind: 'raid', area: far }]);
  need(state.areas[far].special !== 'scorched', 'обычный поджог сработал без соседства');
  resolveWith(state, [{ owner: 0, kind: 'raider', area: far }]);
  need(state.areas[far].special === 'scorched', '«Набег всадников» не сработал без соседства');
}

// ——————————————————————————————————————————————— партии ботами целиком

function simulate(size, kingdomIds, seed) {
  const random = seeded(seed);
  const state = E.createGame({
    kingdomIds,
    players: kingdomIds.map((id, at) => ({ name: `${id}${at}`, isBot: true, botLevel: 'captain' })),
    random,
  });
  let guard = 0;
  const burned = new Set();
  const peaceful = new Map();
  while (state.status === 'playing') {
    guard += 1;
    if (guard > 6000) { problems.push(`партия ${size}p не кончилась за 6000 шагов`); break; }
    for (const player of state.players) {
      const placed = state.orders.filter((o) => o.owner === player.id && o.kind !== 'feint').length;
      const total = player.hand.filter((k) => k !== 'feint').length + player.supply.length + placed + player.spent;
      if (total !== R.supplyOf(player.kingdomId).length) problems.push(`нарушен баланс запаса игрока ${player.id} в раунде ${state.round}: ${total}`);
      if (player.hand.filter((k) => k === 'feint').length + state.orders.filter((o) => o.owner === player.id && o.kind === 'feint').length > 1) {
        problems.push(`у игрока ${player.id} несколько пустых жетонов`);
      }
    }
    if (state.phase === 'setup' || state.phase === 'planning') {
      const seat = E.currentTurn(state);
      if (seat < 0) { problems.push('нет хода — партия зависла'); break; }
      try { Bots.play(state, seat); } catch (error) { problems.push(`бот уронил ход: ${error.message}`); E.skipTurn(state, seat); }
    } else if (state.phase === 'reveal') {
      auditBeforeResolve(state);
      E.resolveRound(state);
      for (const area of R.AREAS) {
        const cell = state.areas[area.id];
        if (burned.has(area.id) && (cell.special !== 'scorched' || cell.owner !== null)) problems.push(`пепелище ${area.id} ожило`);
        if (cell.special === 'scorched') burned.add(area.id);
        if (peaceful.has(area.id) && cell.owner !== peaceful.get(area.id)) problems.push(`область под заветом мира ${area.id} сменила хозяина`);
        if (cell.special === 'peace') peaceful.set(area.id, cell.owner);
        if (cell.owner !== null && (cell.owner < 0 || cell.owner >= state.players.length)) problems.push(`область досталась несуществующему месту ${cell.owner}`);
      }
    } else if (state.phase === 'results') {
      if (!E.nextRound(state)) break;
    } else break;
  }
  return state;
}

function auditBeforeResolve(state) {
  const borders = new Map();
  const seas = new Map();
  const perPlayer = new Map();
  for (const order of state.orders) {
    perPlayer.set(order.owner, (perPlayer.get(order.owner) || 0) + 1);
    if (R.orderOf(order.kind).clan) {
      clanUsed.add(order.kind);
      if (R.orderOf(order.kind).clan !== state.players[order.owner].kingdomId) problems.push(`чужой особый жетон ${order.kind} на карте`);
    }
    if (order.target) continue;
    if (order.area && order.to) {
      const key = order.area < order.to ? `${order.area}|${order.to}` : `${order.to}|${order.area}`;
      if (borders.has(key)) problems.push(`на границе ${key} два жетона`);
      borders.set(key, true);
    } else if (!order.area && order.to) {
      if (seas.has(order.to)) problems.push(`у воды ${order.to} два жетона`);
      seas.set(order.to, true);
    }
    const into = order.to || order.area;
    if (into && ['peace', 'scorched'].includes(state.areas[into].special)) problems.push(`жетон лёг в ${state.areas[into].special} ${into}`);
  }
  for (const [seat, many] of perPlayer) if (many > R.ORDERS_PER_ROUND) problems.push(`игрок ${seat} положил ${many} жетонов за раунд`);
}

const tale = { games: 0, scorched: 0, peace: 0, captures: 0 };
const clanUsed = new Set();
const achieved = new Map(R.OBJECTIVES.map((one) => [one.id, 0]));
let gameSeed = 1000;
for (const size of [2, 3, 4, 5]) {
  for (let run = 0; run < 120; run += 1) {
    gameSeed += 7;
    // Первое место по очереди выбирает каждое из пяти царств — как игрок на экране выбора.
    const state = simulate(size, R.kingdomsFor(size, [R.KINGDOMS[run % R.KINGDOMS.length].id]), gameSeed);
    tale.games += 1;
    if (state.status !== 'over') { problems.push(`партия на ${size} игроков (посев ${gameSeed}) не завершилась`); continue; }
    need(state.round === R.ROUNDS, `партия на ${size} кончилась на раунде ${state.round}`);
    need(Array.isArray(state.finalScore) && state.finalScore.length === size, 'итоговый счёт посчитан не всем');
    need(state.winner !== null && state.winner !== undefined, 'у партии нет победителя');
    tale.scorched += Object.values(state.areas).filter((c) => c.special === 'scorched').length;
    tale.peace += Object.values(state.areas).filter((c) => c.special === 'peace').length;
    for (const objective of R.OBJECTIVES) {
      if (state.players.some((player) => E.checkObjective(state, player.id, objective.id))) achieved.set(objective.id, achieved.get(objective.id) + 1);
    }
  }
}
for (const kingdom of R.KINGDOMS) {
  need(clanUsed.has(kingdom.clanToken), `боты ни разу не сыграли особый жетон «${R.orderOf(kingdom.clanToken).title}»`);
}
for (const objective of R.OBJECTIVES) {
  need(achieved.get(objective.id) > 0, `цель «${objective.title}» ни разу не достигнута ботами`);
}

// ——————————————————————————————————————————————— итог

if (problems.length) {
  console.error(`«Царства» не прошли проверку (${problems.length}):`);
  for (const line of [...new Set(problems)].slice(0, 40)) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log(`OK: карта из 24 областей в 6 регионах связна и симметрична (30 связей по суше, 2 брода, ${R.COASTAL.size} прибрежных); `
  + `расстановка идёт по очереди, цель — одна из двух без повторов за столом; одна граница — один жетон, войско, корабли, `
  + `засада, благословение, завет мира и поджог кладутся только по правилам; ничья — защите, победа защитника даёт открытый жетон, `
  + `поджог оставляет вечное пепелище, завет — вечный мир, карты соглядатаев, пророка и первенства работают и не трогают `
  + `благословлённое; награды регионов даются раз; ${tale.games} партий ботами доиграны до пятого раунда с балансом запаса `
  + `(пепелищ в среднем ${(tale.scorched / tale.games).toFixed(1)}, заветов ${(tale.peace / tale.games).toFixed(1)} за партию); `
  + `все ${R.OBJECTIVES.length} тайных целей достижимы; у каждого из ${R.KINGDOMS.length} царств свой особый жетон, `
  + `выбор царства ставит его на своё место без повторов, и боты играют все особые жетоны; имена царств, столиц `
  + `и библейских мест карты написаны как в Синодальном переводе.`);
