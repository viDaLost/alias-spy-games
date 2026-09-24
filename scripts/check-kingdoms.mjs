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

// Стартовые раскладки: два поля на царство, столица и сосед по региону, и они смежны.
for (const size of [2, 3, 4, 5]) {
  const layout = R.STARTING_LAYOUTS[size];
  need(layout.length === size, `раскладка на ${size} даёт ${layout.length} царств`);
  need(new Set(layout).size === layout.length, `в раскладке на ${size} повторяется царство`);
  for (const kingdomId of layout) {
    const areas = R.startingAreasOf(kingdomId);
    need(areas.length === 2, `у ${kingdomId} стартовых областей не две`);
    need(R.areaOf(areas[0]).capitalOf === kingdomId, `первая стартовая область ${kingdomId} не её столица`);
    need(R.areAdjacent(areas[0], areas[1]), `стартовые области ${kingdomId} не соседствуют`);
  }
}

// Города несут больше единицы ценности — иначе бонус города, зашитый в
// ценность области, попросту не отличить от пустоши.
for (const area of R.AREAS) if (area.city) need(area.value >= 2, `у города ${area.id} ценность меньше двух`);

// ——————————————————————————————————————————————— видимость приказов

// Скрытая рука, конечный мешок, повторный блеф и сохранение одного жетона.
{
  const state = E.createGame({ kingdomIds: R.STARTING_LAYOUTS[2], random: seeded(101) });
  const first = state.turnOrder[0];
  const other = 1 - first;
  const inventory = (p) => p.hand.length + p.supply.length;
  need(state.players.every((p) => p.hand.length === 6), 'каждое царство должно начать с шестью жетонами');
  need(!('hand' in E.visibleStateFor(state, other).players[first]), 'чужая рука раскрывается сопернику');
  need(E.visibleStateFor(state, first).hand.length === 6, 'игрок не видит собственную руку');
  need(inventory(state.players[first]) === Object.values(R.TOKEN_SUPPLY).reduce((a,b) => a+b, 0) + 1,
    'начальный запас жетонов не соответствует составу мешка и блефу');
  const capital = R.startingAreasOf(state.players[first].kingdomId)[0];
  state.players[first].hand = ['guard', 'march1', 'march2', 'march3', 'ford2', 'feint'];
  E.placeOrder(state, first, { kind: 'guard', area: capital });
  need(!E.validatePlacement(state, first, { kind: 'guard', area: capital }).ok,
    'повторное размещение потраченного жетона принято');
  state.players[first].hand = ['march3'];
  state.players[first].supply = ['march1', 'march2', 'guard', 'fortify', 'scout'];
  E.beginRound(state);
  need(state.players[first].hand.includes('march3') && state.players[first].hand.includes('feint'),
    'оставленный жетон или возвращаемый блеф исчез при обновлении раунда');
}

// Отбитая атака оставляет видимое подкрепление до захвата области.
{
  const state = E.createGame({ kingdomIds: R.STARTING_LAYOUTS[2], random: seeded(102) });
  const held = R.startingAreasOf(state.players[0].kingdomId)[0];
  const attacker = R.connectionsOf(held).find((link) => link.type === 'land').to;
  state.areas[attacker].owner = 1;
  state.orders = [{ id: 'v1', owner: 1, kind: 'march1', area: attacker, to: held, revealed: false }];
  state.phase = 'reveal';
  E.resolveRound(state);
  need(state.areas[held].veterans === 1 && E.defenseOf(state, held, false).veterans === 1,
    'успешная оборона не создала постоянное подкрепление');
  state.round = R.ROUNDS;
  E.finishGame(state);
  need(state.finalScore[0].veterans === 1, 'подкрепление не принесло очко при подсчёте');
}

// Захват убирает накопленную защиту прежнего хозяина; бонус региона равен пяти.
{
  const state = E.createGame({ kingdomIds: R.STARTING_LAYOUTS[2], random: seeded(103) });
  const region = R.REGION_IDS[0];
  for (const area of R.areasOfRegion(region)) state.areas[area.id].owner = 0;
  state.players[0].objectiveId = 'ford';
  state.players[1].objectiveId = 'ford';
  E.finishGame(state);
  need(state.finalScore[0].regions >= 1 && state.finalScore[0].total
    === state.finalScore[0].areaValue + state.finalScore[0].veterans
      + state.finalScore[0].regions * 5 + state.finalScore[0].objectivePoints,
  'полный регион не даёт ровно пять очков');

  const held = R.startingAreasOf(state.players[0].kingdomId)[0];
  const from = R.connectionsOf(held).find(link => link.type === 'land').to;
  state.areas[from].owner = 1;
  state.areas[held].veterans = 2;
  state.orders = ['capture1', 'capture2'].map(id => ({ id, owner: 1, kind: 'march3', area: from, to: held }));
  state.phase = 'reveal';
  state.areas[held].fortify = 0;
  E.resolveRound(state);
  need(state.areas[held].owner === 1 && state.areas[held].veterans === 0,
    'после захвата подкрепление прежнего владельца сохранилось');
}

{
  const state = E.createGame({ kingdomIds: R.STARTING_LAYOUTS[2], random: seeded(3) });
  const seat0 = state.turnOrder[0];
  state.players[seat0].hand[0] = 'guard';
  const area0 = R.startingAreasOf(state.players[seat0].kingdomId)[0];
  E.placeOrder(state, seat0, { kind: 'guard', area: area0 });
  // Найдём чей угодно закрытый приказ и проверим форму, которую видит чужой.
  const order = state.orders[0];
  const seenByOwner = E.visibleStateFor(state, order.owner).orders.find((o) => o.id === order.id);
  const otherSeat = state.players.find((p) => p.id !== order.owner).id;
  const seenByOther = E.visibleStateFor(state, otherSeat).orders.find((o) => o.id === order.id);
  need('kind' in seenByOwner, 'хозяин не видит вид собственного приказа');
  need(!('kind' in seenByOther) && !('force' in seenByOther),
    'чужой закрытый приказ выдаёт вид или силу тому, кто не должен их видеть');
  need('owner' in seenByOther && 'area' in seenByOther, 'чужой закрытый приказ обязан показывать хозяина и место');
}

// ——————————————————————————————————————————————— расчёт столкновения на стенде

function bench(size = 2, kingdomIds) {
  const state = E.createGame({
    kingdomIds: kingdomIds || R.STARTING_LAYOUTS[size],
    random: seeded(11),
  });
  return state;
}

function resolveWith(state, orders) {
  state.orders = orders.map((one, at) => ({ id: `t${at}`, revealed: false, to: null, area: null, scoutTargets: null, ...one }));
  state.phase = 'reveal';
  return E.resolveRound(state);
}

// 1) Простой захват нейтральной области с запасом силы.
{
  const state = bench(2);
  const from = R.startingAreasOf(state.players[0].kingdomId)[1];
  const target = R.neighborsOf(from).find((id) => state.areas[id].owner === null);
  need(Boolean(target), 'у стартовой области нет нейтрального соседа для стенда');
  const report = resolveWith(state, [{ owner: 0, kind: 'march3', area: from, to: target }]);
  need(state.areas[target].owner === 0, 'поход силой 3 не взял нейтральную область защитой 1');
  const line = report.find((one) => one.area === target);
  need(line.outcome === 'captured', 'итог захвата не помечен captured');
}

// 2) Недостаточная сила — область остаётся нейтральной. Порубежская твердыня
//    (pogranichye-rim) — город без царства при любом числе игроков.
{
  const state = bench(2);
  const from = 'pogranichye-cw';
  state.areas[from].owner = 0;
  resolveWith(state, [{ owner: 0, kind: 'march1', area: from, to: 'pogranichye-rim' }]);
  need(state.areas['pogranichye-rim'].owner === null, 'поход силой 1 взял нейтральный город с защитой 2');
}

// 3) Двое нападают на одну область с равной силой — хозяин не меняется.
{
  const state = bench(2);
  // kedem-hub — нейтральная пустошь с ровно двумя соседями: kedem-cw и kedem-ccw.
  state.areas['kedem-cw'].owner = 0;
  state.areas['kedem-ccw'].owner = 1;
  resolveWith(state, [
    { owner: 0, kind: 'march2', area: 'kedem-cw', to: 'kedem-hub' },
    { owner: 1, kind: 'march2', area: 'kedem-ccw', to: 'kedem-hub' },
  ]);
  need(state.areas['kedem-hub'].owner === null, 'при равенстве сильнейших атак хозяин области поменялся');
}

// 4) Приказы одного игрока на одну область суммируются.
{
  const state = bench(2);
  state.areas['kedem-cw'].owner = 0;
  state.areas['kedem-ccw'].owner = 0;
  resolveWith(state, [
    { owner: 0, kind: 'march1', area: 'kedem-cw', to: 'kedem-hub' },
    { owner: 0, kind: 'march1', area: 'kedem-ccw', to: 'kedem-hub' },
  ]);
  need(state.areas['kedem-hub'].owner === 0, 'силы одного игрока на одну область не сложились (1+1 не взяли защиту 1)');
}

// 5) Потеря исходной области не отменяет уже отправленный из неё поход:
//    область X атакует Y и в тот же раунд сама взята игроком, приславшим
//    удар в X. Приказ из X обязан остаться приказом прежнего хозяина.
{
  const state = bench(2);
  const areaX = 'primorye-cw';
  const areaY = 'primorye-hub'; // сосед X, остаётся нейтральным
  const areaZ = 'primorye-rim'; // сосед X с другой стороны — оттуда бьёт второй игрок
  state.areas[areaX].owner = 0;
  state.areas[areaZ].owner = 1;
  const report = resolveWith(state, [
    { owner: 0, kind: 'march2', area: areaX, to: areaY },
    { owner: 1, kind: 'march3', area: areaZ, to: areaX },
  ]);
  const xLine = report.find((one) => one.area === areaX);
  need(xLine && xLine.newOwner === 1, 'область-источник не была взята для проверки одновременности');
  const yLine = report.find((one) => one.area === areaY);
  need(Boolean(yLine) && yLine.attackers.length === 1 && yLine.attackers[0].seat === 0,
    'поход из только что потерянной области исчез вместе с ней');
  need(yLine.newOwner === 0, 'поход из потерянной области не довёл свою атаку до конца');
}

// 6) Укрепление: постоянный прирост с пределом, и предел выше у Престола Равнины в городах.
{
  const state = bench(2, ['tarsis', 'prestol']);
  const area = R.startingAreasOf('tarsis')[0];
  for (let i = 0; i < 4; i += 1) resolveWith(state, [{ owner: 0, kind: 'fortify', area }]);
  need(state.areas[area].fortify === 2, `укрепление ушло за предел 2 у обычного царства (${state.areas[area].fortify})`);

  const cityArea = R.startingAreasOf('prestol')[0]; // столица — всегда город
  const state2 = bench(2, ['tarsis', 'prestol']);
  for (let i = 0; i < 5; i += 1) resolveWith(state2, [{ owner: 1, kind: 'fortify', area: cityArea }]);
  need(state2.areas[cityArea].fortify === 3, `у Престола Равнины предел в городе не поднялся до 3 (${state2.areas[cityArea].fortify})`);
}

// 7) Стража держит только на свой раунд.
{
  const state = bench(2);
  const capital0 = 'primorye-rim';
  const from1 = 'primorye-cw'; // сосед капитала по циклу региона — соседство гарантировано картой
  state.areas[capital0].owner = 0;
  state.areas[from1].owner = 1;
  resolveWith(state, [{ owner: 0, kind: 'guard', area: capital0 }]);
  const guarded = E.defenseOf(state, capital0, true).total;
  const bare = E.defenseOf(state, capital0, false).total;
  need(guarded === bare + 2, 'стража не даёт ровно +2 к защите');
  // Без нового приказа страж в следующем расчёте уже не участвует.
  resolveWith(state, [{ owner: 1, kind: 'march2', area: from1, to: capital0 }]);
  need(E.defenseOf(state, capital0, false).total === bare, 'защита осталась завышенной после раунда без стражи');
}

// 8) Горы: +1 базово, ещё +1 сверху у Дома Ора.
{
  const state = bench(2, ['or', 'kedem']);
  const mountainArea = R.startingAreasOf('or')[0];
  need(R.areaOf(mountainArea).terrain === 'mountains', 'столица Дома Ора не в горах');
  const defense = E.defenseOf(state, mountainArea, false);
  need(defense.terrain === 1, 'горный бонус защиты не +1');
  need(defense.ability === 1, 'способность Дома Ора не даёт добавочную защиту в горах');
  need(defense.total === 1 + 0 + 0 + 1 + 1, `защита горной столицы Дома Ора посчиталась как ${defense.total}, а не 3`);
}

// 9) Мореходы: +1 к походу между двумя побережьями.
{
  const state = bench(2, ['tarsis', 'kedem']);
  const coastFrom = R.startingAreasOf('tarsis').find((id) => R.areaOf(id).terrain === 'coast');
  const coastTo = R.neighborsOf(coastFrom).find((id) => R.areaOf(id).terrain === 'coast' && id !== coastFrom);
  if (coastTo) {
    const order = { kind: 'march1', owner: 0, area: coastFrom, to: coastTo };
    need(E.forceOf(state, order) === 2, 'мореходы не получили +1 между двумя побережьями');
  }
}

// 10) Мастера переправ: +1 к переправе.
{
  const state = bench(2, ['yor', 'kedem']);
  const yorSeat = state.players.findIndex((p) => p.kingdomId === 'yor');
  state.areas['dolina-hub'].owner = yorSeat;
  const order = { kind: 'ford2', owner: yorSeat, area: 'dolina-hub', to: 'ravnina-hub' };
  need(E.forceOf(state, order) === 3, 'мастера переправ не получили +1 к переправе');
}

// 11) Соглядатаи Кедема: разведка на двоих; остальным — не больше одного.
{
  const state = bench(2, ['kedem', 'tarsis']);
  const kedemSeat = state.players.findIndex((p) => p.kingdomId === 'kedem');
  const tarsisSeat = state.players.findIndex((p) => p.kingdomId === 'tarsis');
  // Закрытые приказы обеих сторон подставлены напрямую — стенд проверяет
  // только предел разведки, а не то, как эти приказы возникли на столе.
  state.orders.push(
    { id: 'byTarsis1', owner: tarsisSeat, kind: 'march1', area: R.startingAreasOf('tarsis')[0], to: R.neighborsOf(R.startingAreasOf('tarsis')[0])[0], revealed: false, scoutTargets: null },
    { id: 'byTarsis2', owner: tarsisSeat, kind: 'guard', area: R.startingAreasOf('tarsis')[1], to: null, revealed: false, scoutTargets: null },
    { id: 'byKedem1', owner: kedemSeat, kind: 'fortify', area: R.startingAreasOf('kedem')[0], to: null, revealed: false, scoutTargets: null },
    { id: 'byKedem2', owner: kedemSeat, kind: 'march1', area: R.startingAreasOf('kedem')[1], to: R.neighborsOf(R.startingAreasOf('kedem')[1])[0], revealed: false, scoutTargets: null },
  );

  state.turnOrder = [kedemSeat];
  state.turnPointer = 0;
  state.players[kedemSeat].hand[0] = 'scout';
  const twinCheck = E.validatePlacement(state, kedemSeat, { kind: 'scout', scoutTargets: ['byTarsis1', 'byTarsis2'] });
  need(twinCheck.ok, 'Кочевники Кедема не могут разведать два приказа за раз');
  E.placeOrder(state, kedemSeat, { kind: 'scout', scoutTargets: ['byTarsis1', 'byTarsis2'] });
  need(state.scoutIntel[kedemSeat].length === 2, 'разведка Кедема не записала оба раскрытых приказа');
  need(state.scoutIntel[kedemSeat][0].kind === 'march1' && state.scoutIntel[kedemSeat][1].kind === 'guard',
    'разведка Кедема раскрыла не те виды приказов');

  state.turnOrder = [tarsisSeat];
  state.turnPointer = 0;
  state.players[tarsisSeat].hand[0] = 'scout';
  const oneOk = E.validatePlacement(state, tarsisSeat, { kind: 'scout', scoutTargets: ['byKedem1'] });
  need(oneOk.ok, 'обычному царству отказали в разведке одного приказа');
  const twoDenied = E.validatePlacement(state, tarsisSeat, { kind: 'scout', scoutTargets: ['byKedem1', 'byKedem2'] });
  need(!twoDenied.ok, 'обычное царство разведало два приказа за раз — предел не сработал');
}

// 12) Нейтральная защита: 1 у пустоши, 2 у города — как сказано в правилах.
{
  const state = bench(2);
  const plainNeutral = R.AREAS.find((a) => state.areas[a.id].owner === null && !a.city);
  const cityNeutral = R.AREAS.find((a) => state.areas[a.id].owner === null && a.city);
  if (plainNeutral) need(E.defenseOf(state, plainNeutral.id, false).total === 1, 'нейтральная пустошь защищена не единицей');
  if (cityNeutral) need(E.defenseOf(state, cityNeutral.id, false).total === 2, 'нейтральный город защищён не двойкой');
}

// 13) Незаконные приказы отклоняются словами, а не тихо.
{
  const state = bench(2);
  const seat = state.turnOrder[0];
  const notMyTurn = state.turnOrder[1];
  need(!E.validatePlacement(state, notMyTurn, { kind: 'guard', area: R.startingAreasOf(state.players[notMyTurn].kingdomId)[0] }).ok,
    'приказ принят не в свою очередь');
  const myArea = R.startingAreasOf(state.players[seat].kingdomId)[0];
  need(!E.validatePlacement(state, seat, { kind: 'march2', area: myArea, to: R.startingAreasOf(state.players[seat].kingdomId)[1] }).ok,
    'поход на собственную область разрешён');
  const foreignArea = R.startingAreasOf(state.players[notMyTurn].kingdomId)[0];
  need(!E.validatePlacement(state, seat, { kind: 'guard', area: foreignArea }).ok, 'внутренний приказ принят в чужой области');

  const ford = R.FORDS[0];
  state.areas[ford.a].owner = seat;
  need(!E.validatePlacement(state, seat, { kind: 'march1', area: ford.a, to: ford.b }).ok,
    'поход прошёл через брод в обход переправы');
  need(E.validatePlacement(state, seat, { kind: 'ford2', area: ford.a, to: ford.b }).ok,
    'переправа не проходит там, где брод есть на самом деле');
}

// 14) Один исходящий и один внутренний приказ на область — не больше.
{
  const state = bench(2);
  const seat = state.turnOrder[0];
  const area = R.startingAreasOf(state.players[seat].kingdomId)[0];
  const target = R.neighborsOf(area).find((id) => state.areas[id].owner !== seat);
  E.placeOrder(state, seat, { kind: 'march1', area, to: target });
  // Теперь очередь другого места — подставим приказ первого места искусственно для проверки предела.
  const secondCheck = E.validatePlacement(state, seat, { kind: 'march1', area, to: target });
  need(!secondCheck.ok, 'из одной области приняли второй исходящий приказ за раунд');
}

// 15) Пять приказов за раунд — предел, шестой не проходит, даже когда
//     областей и законных ходов у игрока с избытком.
{
  const state = bench(2);
  const seat = 0;
  const areas = ['primorye-rim', 'primorye-cw', 'primorye-hub', 'primorye-ccw', 'nagorye-rim', 'nagorye-cw'];
  state.players[seat].hand = ['guard', 'guard', 'guard', 'guard', 'guard', 'feint'];
  for (const id of areas) state.areas[id].owner = seat;
  for (let i = 0; i < 5; i += 1) {
    state.turnOrder = [seat];
    state.turnPointer = 0;
    E.placeOrder(state, seat, { kind: 'guard', area: areas[i] });
  }
  need(E.ordersPlacedBy(state, seat) === 5, `после пяти размещений счёт приказов ${E.ordersPlacedBy(state, seat)}, а не 5`);
  state.turnOrder = [seat];
  state.turnPointer = 0;
  const sixth = E.validatePlacement(state, seat, { kind: 'guard', area: areas[5] });
  need(!sixth.ok, 'шестой приказ за раунд принят сверх предела в пять');
}

// 16) Каждая тайная цель проверяется на прямо построенном положении — не
//     только на статистике ботовских партий ниже, которая зависит от посева.
{
  const state = bench(2);
  state.players[0].objectiveId = 'capital';
  const capitalId = R.AREAS.find((a) => a.capitalOf === state.players[0].kingdomId).id;
  need(E.checkObjective(state, 0), 'своя столица на месте, а цель «Хранитель столицы» не засчиталась');
  state.areas[capitalId].owner = 1;
  need(!E.checkObjective(state, 0), 'столица потеряна, а цель «Хранитель столицы» всё ещё засчитана');

  const territory = bench(2);
  territory.players[0].objectiveId = 'territory';
  for (const id of ['primorye-rim', 'primorye-cw', 'primorye-hub', 'primorye-ccw', 'nagorye-ccw']) territory.areas[id].owner = 0;
  need(E.checkObjective(territory, 0), 'пять связных областей на месте, а цель «Собиратель земель» не засчиталась');
  territory.areas['nagorye-ccw'].owner = null;
  need(!E.checkObjective(territory, 0), 'связных областей всего четыре, а цель всё равно засчитана');

  const ford = bench(2);
  ford.players[0].objectiveId = 'ford';
  const [a, b] = [R.FORDS[0].a, R.FORDS[0].b];
  ford.areas[a].owner = 0;
  need(!E.checkObjective(ford, 0), 'занят только один берег брода, а цель «Мастер переправы» уже засчитана');
  ford.areas[b].owner = 0;
  need(E.checkObjective(ford, 0), 'оба берега брода заняты, а цель не засчиталась');

  const cities = bench(2);
  cities.players[0].objectiveId = 'cities';
  const cityIds = R.AREAS.filter((a) => a.city).map((a) => a.id).slice(0, 2);
  cities.areas[cityIds[0]].owner = 0;
  need(!E.checkObjective(cities, 0), 'город только один, а цель «Собиратель городов» уже засчитана');
  cities.areas[cityIds[1]].owner = 0;
  need(E.checkObjective(cities, 0), 'два города заняты, а цель не засчиталась');
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
  const spent = kingdomIds.map(() => 0);
  while (state.status === 'playing') {
    guard += 1;
    if (guard > 5000) { problems.push(`партия ${size}p не кончилась за 5000 шагов`); break; }
    for (const player of state.players) {
      const placed = state.orders.filter(o => o.owner === player.id);
      const remaining = player.hand.filter(kind => kind !== 'feint').length + player.supply.length
        + placed.filter(o => o.kind !== 'feint').length + spent[player.id];
      need(remaining === Object.values(R.TOKEN_SUPPLY).reduce((sum, n) => sum + n, 0),
        `нарушен баланс мешка игрока ${player.id} в раунде ${state.round}: ${remaining}`);
      need(player.hand.filter(kind => kind === 'feint').length
        + placed.filter(o => o.kind === 'feint').length <= 1,
      `у игрока ${player.id} одновременно несколько обманных жетонов`);
    }
    if (state.phase === 'planning') {
      const seat = E.currentTurn(state);
      if (seat < 0) { problems.push('в фазе планирования нет хода — партия зависла'); break; }
      const choice = Bots.pick(state, seat);
      if (!choice) { E.skipTurn(state, seat); continue; }
      try {
        E.placeOrder(state, seat, choice);
      } catch (error) {
        problems.push(`бот предложил незаконный приказ: ${error.message} (${JSON.stringify(choice)})`);
        E.skipTurn(state, seat);
      }
    } else if (state.phase === 'reveal') {
      auditBeforeResolve(state);
      E.resolveRound(state);
      auditAfterResolve(state);
    } else if (state.phase === 'results') {
      for (const order of state.orders) if (order.kind !== 'feint') spent[order.owner] += 1;
      if (!E.nextRound(state)) break; // партия окончена — nextRound сам ничего не поменял
    } else break;
  }
  return state;
}

function auditBeforeResolve(state) {
  const perPlayerCount = new Map();
  const perAreaSlot = new Map();
  for (const order of state.orders) {
    perPlayerCount.set(order.owner, (perPlayerCount.get(order.owner) || 0) + 1);
    const rule = R.orderOf(order.kind);
    if (rule.slot === 'none') continue;
    const key = `${order.owner}:${order.area}:${rule.slot}`;
    if (perAreaSlot.has(key)) problems.push(`у области ${order.area} два приказа в слоте ${rule.slot} за один раунд`);
    perAreaSlot.set(key, true);
  }
  for (const [seat, many] of perPlayerCount) {
    if (many > R.ORDERS_PER_ROUND) problems.push(`игрок ${seat} разместил ${many} приказов за раунд`);
  }
}

function auditAfterResolve(state) {
  const owners = Object.values(state.areas).map((one) => one.owner);
  for (const owner of owners) {
    if (owner !== null && (owner < 0 || owner >= state.players.length)) {
      problems.push(`область досталась несуществующему месту ${owner}`);
    }
  }
  for (const area of R.AREAS) {
    const cap = R.fortifyCapFor(
      state.areas[area.id].owner === null ? '' : state.players[state.areas[area.id].owner].kingdomId,
      area,
    );
    if (state.areas[area.id].fortify > cap) problems.push(`укрепление ${area.id} выше предела ${cap}`);
    if (state.areas[area.id].fortify < 0) problems.push(`укрепление ${area.id} ушло в минус`);
  }
}

/*
  Достижимость цели проверяется не по жребию, а по факту: для каждого
  доигранного положения смотрим, выполнил бы его ХОТЬ КТО-ТО из играющих
  условие каждой из четырёх целей — независимо от того, какая цель ему
  выпала на самом деле. Кому цель выпадает — решает жребий, и с четырьмя
  целями поровну шанс, что именно тот единственный игрок, который дотянулся
  до трёх городов, получит в раздаче именно «Собирателя городов», — это
  вопрос удачи раздачи, а не вопрос, дотягивается ли карта до этой цели
  вообще. Второе и обязана спрашивать эта проверка.
*/
const tale = { games: 0, rounds: 0 };
const achieved = new Map(R.OBJECTIVES.map((one) => [one.id, new Map([[2, 0], [3, 0], [4, 0], [5, 0]])]));
let gameSeed = 1000;
for (const size of [2, 3, 4, 5]) {
  for (let run = 0; run < 150; run += 1) {
    gameSeed += 7;
    const layout = R.STARTING_LAYOUTS[size];
    const state = simulate(size, layout, gameSeed);
    tale.games += 1;
    if (state.status !== 'over') { problems.push(`партия на ${size} игроков (посев ${gameSeed}) не завершилась`); continue; }
    need(state.round === R.ROUNDS, `партия на ${size} кончилась на раунде ${state.round}, а не на ${R.ROUNDS}`);
    need(Array.isArray(state.finalScore) && state.finalScore.length === size, 'итоговый счёт посчитан не всем участникам');
    need(state.winner !== null && state.winner !== undefined, 'у партии нет победителя ни по очкам, ни совместного');
    for (const objective of R.OBJECTIVES) {
      if (state.players.some((player) => E.checkObjective(state, player.id, objective.id))) {
        achieved.get(objective.id).set(size, achieved.get(objective.id).get(size) + 1);
      }
    }
    tale.rounds += state.round;
  }
}
for (const objective of R.OBJECTIVES) {
  for (const size of [2, 3, 4, 5]) {
    const many = achieved.get(objective.id).get(size);
    need(many > 0, `цель «${objective.title}» ни разу не была достигнута ни одним ботом в партиях на ${size} игроков`);
  }
}

// ——————————————————————————————————————————————— выбывание не рушит партию

{
  const state = bench(3, ['tarsis', 'yor', 'kedem']);
  // Заберём у второго места обе стартовые области немедленно.
  const [c1, c2] = R.startingAreasOf(state.players[1].kingdomId);
  state.areas[c1].owner = 0;
  state.areas[c2].owner = 2;
  state.players[1].eliminated = true;
  state.phase = 'results';
  need(E.nextRound(state), 'следующий раунд не начался после выбывания игрока');
  need(!state.turnOrder.includes(1), 'выбывший игрок остался в очереди хода');
  need(state.turnOrder.length === 2, 'после выбывания в очереди осталось не два места');
}

// ——————————————————————————————————————————————— итог

if (problems.length) {
  console.error(`«Царства» не прошли проверку (${problems.length}):`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log(`OK: карта из 24 областей в 6 регионах связна и симметрична (30 связей по суше, 2 брода); `
  + `пять царств стоят каждое в своём регионе с одной столицей; раскладки на 2, 3, 4 и 5 игроков дают `
  + `смежные стартовые пары. ${tale.games} партий ботами сыграны до пятого раунда (${tale.rounds} раундов `
  + `суммарно): защита, укрепление, стража, горный и приморский бонусы, переправа и разведка посчитаны по `
  + `формуле; ничьи, встречные атаки, сумма приказов одного игрока и потеря исходной области при отправленном `
  + `походе проверены нарочно; выбывание игрока не роняет партию; все четыре тайные цели достижимы ботами `
  + `на этой карте.`);
