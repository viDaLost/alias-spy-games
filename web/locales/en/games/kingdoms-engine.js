// «Царства»: правила держатся сами.
//
// Правила — «Битвы за Рокуган», облик — библейский (см. kingdoms-rules.js).
// Стратегия ломается тихо: область меняет хозяина без причины, жетон ложится
// туда, где граница уже занята, пепелище снова кому-то достаётся, ничья
// уходит атакующему — и ни одну из этих бед не видно на экране. Поэтому всё
// проверяется числом: scripts/check-kingdoms.mjs прогоняет сотни партий
// ботами в Node, без браузера.
//
//   node scripts/check-kingdoms.mjs
//
// Здесь же и единственное место, где решается, что можно увидеть каждому
// игроку: visibleStateFor. Её же зовут боты (иначе они видели бы чужие
// закрытые жетоны) и сервер комнаты (иначе секрет читался бы в сетевом
// ответе). Расходиться этим трём сторонам нельзя ни на строчку.

(function () {
  'use strict';

  const R = window.KingdomsRules;

  function defaultRandom() { return Math.random(); }

  function freshAreas() {
    const map = {};
    for (const area of R.AREAS) map[area.id] = { owner: null, veterans: 0, special: null };
    return map;
  }

  const family = (kind) => R.familyOf(kind);
  const isCombat = (kind) => R.COMBAT_FAMILIES.has(family(kind));
  const blocked = (state, areaId) => ['peace', 'scorched'].includes(state.areas[areaId]?.special);

  /*
    Партия. kingdomIds — по одному на место, в порядке мест. Начинается с
    расстановки: у каждого царства есть его столица, остальные стартовые
    земли игроки берут сами, по очереди, начиная с первого игрока; тем
    временем каждый выбирает одну тайную цель из двух.
  */
  function createGame({ kingdomIds, players, random = defaultRandom }) {
    if (!Array.isArray(kingdomIds) || kingdomIds.length < 2 || kingdomIds.length > 5) {
      throw new Error('Царств должно быть от двух до пяти');
    }
    const areas = freshAreas();
    const dealt = R.dealObjectives(kingdomIds.length, random);
    const statePlayers = kingdomIds.map((kingdomId, seat) => ({
      id: seat,
      name: (players && players[seat] && players[seat].name) || R.kingdomOf(kingdomId).name,
      isBot: Boolean(players && players[seat] && players[seat].isBot),
      botLevel: (players && players[seat] && players[seat].botLevel) || 'captain',
      kingdomId,
      objectiveChoices: dealt[seat],
      objectiveId: null,
      ronin: false,
      supply: R.supplyOf(kingdomId),
      hand: [],
      spent: 0,
      cards: R.startingCards(kingdomId),
      setupLeft: R.SETUP_TOKENS[kingdomIds.length],
    }));
    for (let seat = 0; seat < kingdomIds.length; seat += 1) {
      for (const id of R.startingAreasOf(kingdomIds[seat])) areas[id].owner = seat;
    }
    const firstPlayer = Math.floor(random() * kingdomIds.length);
    const state = {
      players: statePlayers,
      areas,
      round: 1,
      phase: 'setup',
      status: 'playing',
      orders: [],
      scoutIntel: statePlayers.map(() => []),
      regionCards: Object.fromEntries(R.REGION_IDS.map((id) => [id, null])),
      herald: null,
      log: [],
      lastResolution: null,
      finalScore: null,
      winner: null,
      random,
      orderSeq: 0,
      firstPlayer,
    };
    state.turnOrder = kingdomIds.map((_, i) => (firstPlayer + i) % kingdomIds.length);
    state.turnPointer = 0;
    logEvent(state, `Расстановка: первым берёт землю ${nameOf(state, firstPlayer)}.`);
    return state;
  }

  const nameOf = (state, seat) => (state.players[seat] ? state.players[seat].name : `Place ${seat}`);
  const logEvent = (state, text) => { state.log.push({ round: state.round, text }); };
  const activeSeats = (state) => state.players.map((one) => one.id);

  /** Чей сейчас ход (расстановка или размещение), или −1. */
  function currentTurn(state) {
    if (state.phase !== 'planning' && state.phase !== 'setup') return -1;
    if (!state.turnOrder || !state.turnOrder.length) return -1;
    return state.turnOrder[state.turnPointer] ?? -1;
  }

  // ——————————————————————————————————————————————— расстановка

  function validateControl(state, seat, areaId) {
    if (state.phase !== 'setup') return fail('Расстановка уже закончилась');
    if (currentTurn(state) !== seat) return fail('Сейчас не ваш ход');
    if (!state.players[seat].setupLeft) return fail('Все ваши жетоны контроля уже на карте');
    const cell = state.areas[areaId];
    if (!cell) return fail('Такой области нет на карте');
    if (cell.owner !== null) return fail('Эта область уже занята');
    if (cell.special === 'scorched') return fail('На пепелище нельзя поставить жетон');
    return { ok: true };
  }

  function placeControl(state, seat, areaId) {
    const check = validateControl(state, seat, areaId);
    if (!check.ok) throw engineError(check.reason);
    state.areas[areaId].owner = seat;
    state.players[seat].setupLeft -= 1;
    logEvent(state, `${nameOf(state, seat)} берёт «${R.areaOf(areaId).name}».`);
    advanceSetup(state);
  }

  function advanceSetup(state) {
    const n = state.turnOrder.length;
    for (let step = 1; step <= n; step += 1) {
      const next = (state.turnPointer + step) % n;
      if (state.players[state.turnOrder[next]].setupLeft > 0) { state.turnPointer = next; return; }
    }
    finishSetup(state);
  }

  function finishSetup(state) {
    for (const player of state.players) {
      if (!player.objectiveId) player.objectiveId = player.objectiveChoices[0];
      player.setupLeft = 0;
    }
    beginRound(state, true);
  }

  function chooseObjective(state, seat, objectiveId) {
    const player = state.players[seat];
    if (!player) throw engineError('Нет такого места');
    if (player.objectiveId) throw engineError('Тайная цель уже выбрана');
    if (!player.objectiveChoices.includes(objectiveId)) throw engineError('Такой цели вам не раздавали');
    player.objectiveId = objectiveId;
  }

  // ——————————————————————————————————————————————— раунд

  function beginRound(state, first = false) {
    if (!first) state.round += 1;
    state.phase = 'planning';
    state.orders = [];
    state.lastResolution = null;
    for (const player of state.players) {
      player.ronin = !Object.values(state.areas).some((cell) => cell.owner === player.id);
      player.placed = 0;
      // Пустой жетон всегда возвращается за ширму; остальное добирается до шести.
      player.hand = player.hand.filter((kind) => kind !== 'feint');
      player.hand.push('feint');
      while (player.hand.length < R.HAND_SIZE && player.supply.length) {
        const index = Math.floor(state.random() * player.supply.length);
        player.hand.push(player.supply.splice(index, 1)[0]);
      }
    }
    // Первый игрок меняется по кругу; в первом раунде — тот, кто начинал расстановку.
    if (!first) state.firstPlayer = (state.firstPlayer + 1) % state.players.length;
    state.herald = state.players.length > 2 ? state.firstPlayer : null;
    state.cycle = 0;
    setCycleOrder(state);
    logEvent(state, `Round ${state.round}: первым размещает ${nameOf(state, state.firstPlayer)}.`);
  }

  function setCycleOrder(state) {
    const n = state.players.length;
    state.turnOrder = Array.from({ length: n }, (_, i) => (state.firstPlayer + i) % n);
    state.turnPointer = 0;
  }

  /** Сколько жетонов игрок положил в этом раунде (снятые картами тоже считаются). */
  function ordersPlacedBy(state, seat) {
    return state.players[seat]?.placed || 0;
  }

  // ——————————————————————————————————————————————— размещение

  const fail = (reason) => ({ ok: false, reason });
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  /** Занята ли граница: на одной границе — один жетон, чей бы он ни был. */
  function borderTaken(state, a, b) {
    const key = pairKey(a, b);
    return state.orders.some((one) => one.area && one.to && pairKey(one.area, one.to) === key);
  }
  /** Занята ли прибрежная граница области X (атака «Кораблями» с воды). */
  function seaTaken(state, areaId) {
    return state.orders.some((one) => !one.area && one.to === areaId);
  }

  /*
    Как жетон лёг на карту — одна из трёх форм:
      border  граница между своей областью area и соседней to (атака);
      sea     прибрежная граница области to (атака «Кораблями» с воды);
      center  центр области area (оборона своей или засада, поджог, мир).
  */
  function formOf(placement) {
    if (placement.area && placement.to) return 'border';
    if (!placement.area && placement.to) return 'sea';
    if (placement.area && !placement.to) return 'center';
    return null;
  }

  function validateForm(state, seat, kind, placement) {
    const player = state.players[seat];
    const fam = family(kind);
    const form = formOf(placement);
    const { area, to } = placement;
    if (!form) return fail('Укажите, куда положить жетон');
    if (area && !R.areaOf(area)) return fail('Такой области нет на карте');
    if (to && !R.areaOf(to)) return fail('Нет такой цели');
    const own = (id) => state.areas[id].owner === seat;

    if (form === 'border') {
      if (fam !== 'army' && fam !== 'blank') return fail('Через границу атакует только войско');
      const edge = R.edgeType(area, to);
      if (!edge) return fail('Эти области не соседствуют');
      if (!own(area) && !player.ronin) return fail('Атаковать можно только из своей области');
      if (own(to)) return fail('Нельзя атаковать собственную область');
      if (blocked(state, area)) return fail('Из области под заветом мира не атакуют');
      if (blocked(state, to)) return fail(state.areas[to].special === 'peace' ? 'Эта область под заветом мира' : 'На пепелище не ставят жетонов');
      if (state.areas[to].special === 'shrine') return fail('Область с жертвенником нельзя атаковать');
      if (borderTaken(state, area, to)) return fail('На этой границе уже лежит жетон');
      return { ok: true, form };
    }
    if (form === 'sea') {
      if (fam !== 'navy' && fam !== 'blank') return fail('С воды атакуют только корабли');
      if (!R.isCoastal(to)) return fail('Эта область не у воды');
      if (own(to)) return fail('Нельзя атаковать собственную область');
      if (player.ronin && fam === 'navy') return fail('Изгнанник ставит только войско');
      if (blocked(state, to)) return fail(state.areas[to].special === 'peace' ? 'Эта область под заветом мира' : 'На пепелище не ставят жетонов');
      if (state.areas[to].special === 'shrine') return fail('Область с жертвенником нельзя атаковать');
      if (seaTaken(state, to)) return fail('С воды эту область уже атакуют');
      return { ok: true, form };
    }
    // center
    if (blocked(state, area)) return fail(state.areas[area].special === 'peace' ? 'Эта область под заветом мира' : 'На пепелище не ставят жетонов');
    if (player.ronin && fam !== 'army') return fail('Изгнанник ставит только войско на границы');
    if (player.ronin) return fail('Изгнанник не защищает областей — у него их нет');
    if (fam === 'army') return own(area) ? { ok: true, form } : fail('Войско защищает только свою область');
    if (fam === 'navy') {
      if (!own(area)) return fail('Корабли защищают только свою область');
      if (!R.isCoastal(area)) return fail('Корабли защищают только прибрежную область');
      return { ok: true, form };
    }
    if (fam === 'ambush' || fam === 'blank') {
      if (!own(area) && state.areas[area].special === 'shrine') return fail('Область с жертвенником нельзя атаковать');
      return { ok: true, form };
    }
    if (fam === 'peace') return own(area) ? { ok: true, form } : fail('Завет мира заключают только в своей области');
    if (fam === 'raid') {
      if (own(area)) return fail('Свою область не поджигают');
      if (state.areas[area].special === 'shrine') return fail('Жертвенник поджечь нельзя');
      return { ok: true, form };
    }
    return fail('Этот жетон так не кладут');
  }

  /*
    Проверка жетона. Возвращает { ok:true } или { ok:false, reason } —
    причина словами, потому что кнопка «Подтвердить» обязана объяснить отказ.
  */
  function validatePlacement(state, seat, placement) {
    if (state.phase !== 'planning') return fail('Сейчас не фаза размещения');
    if (currentTurn(state) !== seat) return fail('Сейчас не ваш ход');
    if (ordersPlacedBy(state, seat) >= R.ORDERS_PER_ROUND) return fail('Вы уже разместили пять жетонов');
    const order = R.orderOf(placement && placement.kind);
    if (!order) return fail('Неизвестный жетон');
    const player = state.players[seat];
    if (!player.hand.includes(order.id)) return fail('Такого жетона нет в вашей руке');
    if (player.hand.length <= 1) return fail('Один жетон остаётся за ширмой до следующего раунда');

    if (order.family === 'bless') {
      if (player.ronin) return fail('Изгнанник ставит только войско');
      const target = state.orders.find((one) => one.id === placement.target);
      if (!target) return fail('Выберите свой жетон на карте');
      if (target.owner !== seat) return fail('Благословляют только свой жетон');
      if (!isCombat(target.kind)) return fail('Благословляют войско, корабли или засаду');
      if (state.orders.some((one) => family(one.kind) === 'bless' && one.target === target.id)) {
        return fail('Этот жетон уже благословлён');
      }
      return { ok: true, order, form: 'bless' };
    }
    if (player.ronin && !['army', 'blank'].includes(order.family)) return fail('Изгнанник ставит только войско');
    const check = validateForm(state, seat, order.id, placement);
    if (!check.ok) return check;
    return { ok: true, order, form: check.form };
  }

  /** Разместить жетон. Возвращает его или бросает — цена ошибки решается вызывающим. */
  function placeOrder(state, seat, placement) {
    const check = validatePlacement(state, seat, placement);
    if (!check.ok) throw engineError(check.reason);
    const isBless = check.order.family === 'bless';
    const target = isBless ? state.orders.find((one) => one.id === placement.target) : null;
    const order = {
      id: `o${state.orderSeq += 1}`,
      owner: seat,
      kind: check.order.id,
      area: isBless ? target.area : placement.area || null,
      to: isBless ? target.to : placement.to || null,
      target: isBless ? target.id : null,
      round: state.round,
      // Благословение кладётся лицом вверх — его видят все сразу.
      open: isBless,
    };
    state.orders.push(order);
    const player = state.players[seat];
    player.hand.splice(player.hand.indexOf(order.kind), 1);
    player.placed = (player.placed || 0) + 1;
    advanceTurn(state);
    return order;
  }

  /*
    Карта в начале своего хода, до жетона. Ход она не заканчивает.
    Благословлённый жетон картам неподвластен.
  */
  function validateCard(state, seat, card, targetId) {
    if (state.phase !== 'planning') return fail('Карты играют в фазе размещения');
    if (currentTurn(state) !== seat) return fail('Сейчас не ваш ход');
    const player = state.players[seat];
    if (card === 'herald') {
      if (state.herald !== seat) return fail('Право первенства только у первого игрока раунда');
    } else if (!(player.cards[card] > 0)) return fail('Такой карты у вас нет');
    const target = state.orders.find((one) => one.id === targetId);
    if (!target) return fail('Выберите закрытый жетон на карте');
    if (target.open || target.revealed) return fail('Этот жетон уже открыт');
    if (card !== 'herald' && target.owner === seat) return fail('Выберите чужой жетон');
    if (state.orders.some((one) => family(one.kind) === 'bless' && one.target === target.id)) {
      return fail('Благословлённый жетон картам неподвластен');
    }
    if (card === 'scout' && state.scoutIntel[seat].some((one) => one.orderId === target.id)) {
      return fail('Этот жетон вы уже видели');
    }
    return { ok: true, target };
  }

  function useCard(state, seat, { card, target: targetId } = {}) {
    const check = validateCard(state, seat, card, targetId);
    if (!check.ok) throw engineError(check.reason);
    const target = check.target;
    const player = state.players[seat];
    if (card === 'herald') state.herald = null;
    else player.cards[card] -= 1;
    if (card === 'scout') {
      state.scoutIntel[seat].push({ atRound: state.round, orderId: target.id, owner: target.owner,
        kind: target.kind, area: target.area, to: target.to });
      logEvent(state, `${nameOf(state, seat)} посылает соглядатаев.`);
      return { card, orderId: target.id };
    }
    removeOrder(state, target, card === 'herald' ? 'supply' : 'discard');
    if (card === 'prophet') {
      logEvent(state, `Prophet ${nameOf(state, seat)} открыл замысел ${nameOf(state, target.owner)}: «${R.orderOf(target.kind).title}» — жетон сброшен.`);
      return { card, orderId: target.id, kind: target.kind };
    }
    logEvent(state, `${nameOf(state, seat)} пользуется правом первенства: один закрытый жетон ${nameOf(state, target.owner)} вернулся в запас.`);
    return { card, orderId: target.id };
  }

  /** Убрать жетон с поля: в сброс, в руку (пустой) или обратно в запас. */
  function removeOrder(state, order, where) {
    state.orders = state.orders.filter((one) => one.id !== order.id);
    const owner = state.players[order.owner];
    if (order.kind === 'feint') owner.hand.push('feint');
    else if (where === 'supply') owner.supply.push(order.kind);
    else owner.spent += 1;
    // Благословение лежит на жетоне — уходит вместе с ним.
    for (const bless of state.orders.filter((one) => one.target === order.id)) removeOrder(state, bless, where === 'supply' ? 'discard' : where);
  }

  function advanceTurn(state) {
    state.turnPointer += 1;
    if (state.turnPointer < state.turnOrder.length) return;
    state.cycle += 1;
    if (state.cycle >= R.ORDERS_PER_ROUND) { state.phase = 'reveal'; return; }
    setCycleOrder(state);
  }

  /** Пропуск хода — тоже ход: вручную или по часам сервера. В расстановке — отказ от жетона. */
  function skipTurn(state, seat) {
    if (currentTurn(state) !== seat) throw engineError('Сейчас не ваш ход');
    if (state.phase === 'setup') {
      state.players[seat].setupLeft = Math.max(0, state.players[seat].setupLeft - 1);
      advanceSetup(state);
      return;
    }
    advanceTurn(state);
  }

  // ——————————————————————————————————————————————— исполнение

  function blessingOf(state, order) {
    return state.orders.filter((one) => family(one.kind) === 'bless' && one.target === order.id)
      .reduce((sum, one) => sum + R.orderOf(one.kind).force, 0);
  }

  /** Сила жетона битвы с благословением и способностью царства. */
  function forceOf(state, order) {
    const base = R.orderOf(order.kind)?.force || 0;
    if (!isCombat(order.kind)) return family(order.kind) === 'blank' ? 0 : base;
    const kingdomId = state.players[order.owner]?.kingdomId;
    let force = base + (state.orders ? blessingOf(state, order) : 0);
    if (family(order.kind) === 'navy' && kingdomId === 'tarsis') force += 1;
    if (family(order.kind) === 'army' && order.area && order.to && kingdomId === 'yor'
      && R.edgeType(order.area, order.to) === 'ford') force += 1;
    return force;
  }

  /** Постоянная защита области (без жетонов этого раунда) — с разложением для показа игроку. */
  function defenseOf(state, areaId) {
    const area = R.areaOf(areaId);
    const cell = state.areas[areaId];
    const printed = R.printedDefense(area);
    const special = cell.special === 'defense2' ? 2 : 0;
    if (cell.owner === null) return { printed, special, veterans: 0, ability: 0, tokens: 0, total: printed + special };
    const kingdomId = state.players[cell.owner].kingdomId;
    let ability = 0;
    if (kingdomId === 'or' && area.terrain === 'mountains') ability += 1;
    if (kingdomId === 'prestol' && area.city) ability += 1;
    const veterans = cell.veterans || 0;
    return { printed, special, veterans, ability, tokens: 0, total: printed + special + veterans + ability };
  }

  /** Куда и за кого бьёт жетон битвы: { area, seat, attack } или null. */
  function battleSide(state, order) {
    if (!isCombat(order.kind)) return null;
    const areaId = order.to || order.area;
    if (!areaId) return null;
    const controller = state.areas[areaId].owner;
    const attack = order.owner !== controller;
    return { area: areaId, seat: order.owner, attack };
  }

  /*
    Исполнение — по порядку «Рокугана»: открыть всё; пустые жетоны — в руку;
    поджоги; заветы мира; сражения — все разом; карты регионов.

    Хозяева читаются до сражений, и приказ, отправленный из области, остаётся
    приказом того, кто его положил, даже если сама область в этот же раунд
    перейдёт к другому.
  */
  function resolveRound(state) {
    if (state.phase !== 'reveal') throw engineError('Раскрывать пока нечего');
    const events = [];
    for (const order of state.orders) order.revealed = true;

    // 2) пустые жетоны — обратно за ширму; благословение без жетона — в сброс.
    for (const order of state.orders.filter((one) => one.kind === 'feint')) removeOrder(state, order, 'hand');
    for (const order of state.orders.filter((one) => family(one.kind) === 'bless'
      && !state.orders.some((other) => other.id === one.target))) removeOrder(state, order, 'discard');

    const clearAround = (areaId) => {
      for (const order of [...state.orders]) {
        if (!state.orders.includes(order)) continue;
        if (order.area === areaId || order.to === areaId) removeOrder(state, order, 'discard');
      }
    };

    // 3) поджоги: срабатывают, если рядом своя область или в самой области своя засада;
    //    «Набегу всадников» Кедема соседство не нужно.
    for (const raid of state.orders.filter((one) => family(one.kind) === 'raid')) {
      if (!state.orders.includes(raid)) continue;
      const areaId = raid.area;
      const cell = state.areas[areaId];
      const near = R.neighborsOf(areaId).some((id) => state.areas[id].owner === raid.owner);
      const ambush = state.orders.some((one) => one.owner === raid.owner && family(one.kind) === 'ambush'
        && one.area === areaId && !one.to);
      const anywhere = raid.kind === 'raider';
      if ((!near && !ambush && !anywhere) || cell.special === 'peace' || cell.special === 'scorched') {
        removeOrder(state, raid, 'discard');
        events.push({ type: 'raidFailed', area: areaId, seat: raid.owner });
        continue;
      }
      const previousOwner = cell.owner;
      removeOrder(state, raid, 'discard');
      clearAround(areaId);
      cell.owner = null;
      cell.veterans = 0;
      cell.special = 'scorched';
      events.push({ type: 'scorched', area: areaId, seat: raid.owner, previousOwner });
      logEvent(state, `${nameOf(state, raid.owner)} предаёт огню «${R.areaOf(areaId).name}» — там пепелище.`);
    }

    // 4) заветы мира.
    for (const peace of state.orders.filter((one) => one.kind === 'peace')) {
      if (!state.orders.includes(peace)) continue;
      const areaId = peace.area;
      removeOrder(state, peace, 'discard');
      if (state.areas[areaId].owner !== peace.owner || state.areas[areaId].special === 'scorched') continue;
      clearAround(areaId);
      state.areas[areaId].special = 'peace';
      events.push({ type: 'peace', area: areaId, seat: peace.owner });
      logEvent(state, `${nameOf(state, peace.owner)} заключает завет мира в «${R.areaOf(areaId).name}».`);
    }

    // 5) сражения — все разом: хозяева меняются только после подсчёта всех.
    const battles = new Map();
    for (const order of state.orders) {
      const side = battleSide(state, order);
      if (!side) continue;
      if (!battles.has(side.area)) battles.set(side.area, { attackers: new Map(), defense: 0, defenders: [] });
      const battle = battles.get(side.area);
      const force = forceOf(state, order);
      if (side.attack) {
        const entry = battle.attackers.get(side.seat) || { total: 0, orders: [] };
        entry.total += force;
        entry.orders.push(order.id);
        battle.attackers.set(side.seat, entry);
      } else {
        battle.defense += force;
        battle.defenders.push(order.id);
      }
    }
    const report = [];
    const pendingOwners = new Map();
    for (const [areaId, battle] of battles) {
      const cell = state.areas[areaId];
      const base = defenseOf(state, areaId);
      const defense = { ...base, tokens: battle.defense, total: base.total + battle.defense };
      const attackers = [...battle.attackers.entries()]
        .map(([seat, entry]) => ({ seat, total: entry.total, orders: entry.orders }))
        .sort((a, b) => b.total - a.total);
      const previousOwner = cell.owner;
      let outcome = 'held';
      let newOwner = previousOwner;
      if (attackers.length) {
        const top = attackers[0];
        const tiedTop = attackers.filter((one) => one.total === top.total).length > 1;
        // Ничья наверху — всегда победа защитника, даже если спорили двое атакующих.
        if (!tiedTop && top.total > defense.total) { outcome = 'captured'; newOwner = top.seat; }
        else if (tiedTop && top.total > defense.total) outcome = 'standoff';
      } else outcome = 'guarded';
      // Победа защитника — открытый жетон контроля: +1 к защите и +1 очко.
      if (previousOwner !== null && newOwner === previousOwner) cell.veterans = (cell.veterans || 0) + 1;
      report.push({ area: areaId, defense, attackers, previousOwner, newOwner, outcome });
      if (newOwner !== previousOwner) pendingOwners.set(areaId, newOwner);
    }
    for (const [areaId, seat] of pendingOwners) {
      state.areas[areaId].owner = seat;
      state.areas[areaId].veterans = 0;
    }
    // Все участвовавшие жетоны уходят в сброс.
    for (const order of [...state.orders]) if (state.orders.includes(order)) removeOrder(state, order, 'discard');

    // 6) карты регионов.
    for (const regionId of R.REGION_IDS) {
      if (state.regionCards[regionId] !== null) continue;
      const seat = regionController(state, regionId);
      if (seat === null) continue;
      state.regionCards[regionId] = seat;
      const card = R.REGION_CARDS[regionId];
      if (card.card) state.players[seat].cards[card.card] = (state.players[seat].cards[card.card] || 0) + 1;
      if (card.special && !['peace', 'scorched'].includes(state.areas[card.area].special)) {
        state.areas[card.area].special = card.special;
      }
      events.push({ type: 'regionCard', region: regionId, seat });
      logEvent(state, `${nameOf(state, seat)} берёт весь регион «${R.REGIONS.find((r) => r.id === regionId).name}» и его награду: «${card.title}».`);
    }

    state.lastResolution = report;
    state.lastEvents = events;
    for (const line of report) if (line.outcome !== 'guarded') logEvent(state, resolutionText(state, line));

    for (const player of state.players) {
      player.ronin = !Object.values(state.areas).some((one) => one.owner === player.id);
    }
    state.phase = 'results';
    if (state.round >= R.ROUNDS) finishGame(state);
    return report;
  }

  /** Хозяин региона: тот, кто держит все его области, кроме пепелищ. */
  function regionController(state, regionId) {
    const areas = R.areasOfRegion(regionId).filter((area) => state.areas[area.id].special !== 'scorched');
    if (!areas.length) return null;
    const owner = state.areas[areas[0].id].owner;
    if (owner === null) return null;
    return areas.every((area) => state.areas[area.id].owner === owner) ? owner : null;
  }

  function resolutionText(state, line) {
    const area = R.areaOf(line.area);
    const top = line.attackers[0];
    if (line.outcome === 'captured') {
      return `${nameOf(state, line.newOwner)} берёт «${area.name}» (${top.total} против ${line.defense.total}).`;
    }
    if (line.outcome === 'standoff') {
      return `Ничья за «${area.name}»: сильнейшие атаки равны — побеждает защита.`;
    }
    return `«${area.name}» устояла: защита ${line.defense.total} против ${top ? top.total : 0}.`;
  }

  function nextRound(state) {
    if (state.phase !== 'results' || state.status !== 'playing') return false;
    if (state.round >= R.ROUNDS) return false;
    beginRound(state, false);
    return true;
  }

  // ——————————————————————————————————————————————— цели и счёт

  function connectedCount(state, seat) {
    const owned = new Set(Object.entries(state.areas).filter(([, v]) => v.owner === seat).map(([id]) => id));
    let best = 0;
    const seen = new Set();
    for (const start of owned) {
      if (seen.has(start)) continue;
      let size = 0;
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const at = stack.pop();
        size += 1;
        for (const to of R.neighborsOf(at)) {
          if (owned.has(to) && !seen.has(to)) { seen.add(to); stack.push(to); }
        }
      }
      best = Math.max(best, size);
    }
    return best;
  }

  /*
    objectiveId по умолчанию берётся с самого игрока, но его можно указать
    прямо — чтобы проверить достижимость цели независимо от раздачи.
  */
  function checkObjective(state, seat, objectiveId = state.players[seat].objectiveId) {
    const player = state.players[seat];
    const mine = R.AREAS.filter((area) => state.areas[area.id].owner === seat);
    const count = (test) => mine.filter(test).length;
    switch (objectiveId) {
      case 'capital': {
        const capitalId = R.capitalOf(player.kingdomId);
        return capitalId ? state.areas[capitalId].owner === seat : false;
      }
      case 'territory': return connectedCount(state, seat) >= 5;
      case 'ford': return R.FORDS.some((edge) => state.areas[edge.a].owner === seat && state.areas[edge.b].owner === seat);
      case 'cities': return count((area) => area.city) >= 3;
      case 'coast': return count((area) => R.isCoastal(area.id)) >= 3;
      case 'mountains': return count((area) => area.terrain === 'mountains') >= 3;
      case 'desert': return count((area) => area.terrain === 'desert') >= 3;
      case 'hubs': return count((area) => area.role === 'hub') >= 3;
      case 'peace': return count((area) => state.areas[area.id].special === 'peace') >= 2;
      case 'veterans': return mine.reduce((sum, area) => sum + (state.areas[area.id].veterans || 0), 0) >= 3;
      default: return false;
    }
  }

  function regionFullyControlledBy(state, regionId, seat) {
    return regionController(state, regionId) === seat;
  }

  /** Очки чести одной области для её хозяина: ценность, особый жетон и открытые жетоны контроля. */
  function honorOf(state, areaId) {
    const cell = state.areas[areaId];
    const area = R.areaOf(areaId);
    return area.value + (cell.special === 'honor2' ? 2 : 0) + (cell.special === 'defense2' ? 1 : 0);
  }

  function scoreOf(state, seat) {
    const player = state.players[seat];
    const mine = R.AREAS.filter((area) => state.areas[area.id].owner === seat);
    const areaValue = mine.reduce((sum, area) => sum + honorOf(state, area.id), 0);
    const veterans = mine.reduce((sum, area) => sum + (state.areas[area.id].veterans || 0), 0);
    const regions = R.REGION_IDS.filter((regionId) => regionController(state, regionId) === seat).length;
    const objectiveDone = Boolean(player.objectiveId) && checkObjective(state, seat);
    const objective = R.objectiveOf(player.objectiveId);
    const objectivePoints = objectiveDone ? objective.points : 0;
    return {
      seat, areaValue, veterans, regions, objectiveDone, objectivePoints,
      areasHeld: mine.length, cities: mine.filter((area) => area.city).length,
      total: areaValue + veterans + regions * R.REGION_BONUS + objectivePoints,
    };
  }

  function finishGame(state) {
    const scores = state.players.map((player) => scoreOf(state, player.id));
    // Больше очков; при равенстве — больше регионов, затем больше областей; иначе победа делится.
    const better = (a, b) => (a.total - b.total) || (a.regions - b.regions) || (a.areasHeld - b.areasHeld);
    let winners = [scores[0]];
    for (const score of scores.slice(1)) {
      const cmp = better(score, winners[0]);
      if (cmp > 0) winners = [score];
      else if (cmp === 0) winners.push(score);
    }
    state.finalScore = scores;
    state.winner = winners.length === 1 ? winners[0].seat : winners.map((one) => one.seat);
    state.status = 'over';
    state.phase = 'over';
  }

  // ——————————————————————————————————————————————— видимость

  /*
    Единственное место, где решается, что видит игрок. Карта — вся: хозяева,
    особые жетоны, открытые жетоны контроля. Свой жетон — целиком. Чужой
    закрытый — только хозяин и место (граница, вода или центр области);
    открытый — целиком: благословение лежит лицом вверх с самого начала,
    остальное открывается при исполнении. Тайные цели соперников видны
    только в конце, своя разведка — только своя.
  */
  function visibleStateFor(state, seat) {
    const revealed = state.phase === 'results' || state.phase === 'over';
    const me = state.players[seat];
    return {
      you: seat,
      round: state.round,
      phase: state.phase,
      status: state.status,
      cycle: state.cycle,
      turn: currentTurn(state),
      firstPlayer: state.firstPlayer,
      herald: state.herald,
      areas: state.areas,
      regionCards: state.regionCards,
      players: state.players.map((one) => ({
        id: one.id, name: one.name, kingdomId: one.kingdomId, isBot: one.isBot, ronin: one.ronin,
        eliminated: one.ronin,
        setupLeft: one.setupLeft,
        cards: { ...one.cards },
        objectiveId: one.id === seat || state.status === 'over' ? one.objectiveId : null,
      })),
      objectiveChoices: me && !me.objectiveId ? [...me.objectiveChoices] : null,
      orders: state.orders.map((order) => (order.owner === seat || order.revealed || order.open
        ? { ...order }
        : { id: order.id, owner: order.owner, area: order.area, to: order.to })),
      scoutIntel: state.scoutIntel[seat] || [],
      lastResolution: revealed ? state.lastResolution : null,
      lastEvents: revealed ? state.lastEvents || [] : [],
      finalScore: state.finalScore,
      winner: state.winner,
      log: state.log.slice(-14),
      ordersPlaced: seat >= 0 ? ordersPlacedBy(state, seat) : 0,
      ordersLimit: R.ORDERS_PER_ROUND,
      hand: seat >= 0 ? [...(me?.hand || [])] : [],
      supplyRemaining: seat >= 0 ? me?.supply.length || 0 : 0,
    };
  }

  function engineError(message) {
    const error = new Error(message);
    error.code = 'KINGDOMS_ENGINE';
    return error;
  }

  window.KingdomsEngine = {
    createGame, beginRound, currentTurn, validatePlacement, placeOrder, skipTurn,
    validateControl, placeControl, chooseObjective, validateCard, useCard,
    resolveRound, nextRound, forceOf, defenseOf, battleSide, checkObjective, connectedCount,
    regionFullyControlledBy, regionController, honorOf, scoreOf, finishGame, visibleStateFor,
    ordersPlacedBy, activeSeats, formOf, borderTaken, seaTaken,
  };
}());
