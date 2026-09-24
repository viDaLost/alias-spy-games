// «Царства»: правила держатся сами.
//
// Стратегия ломается тихо. Область меняет хозяина без причины — и это
// заметно только через раунд, когда счёт не сходится; приказ проходит там,
// где карты нет, — и один игрок получает область без спора; раскрытие
// применяет укрепление после атаки, а не до, — и защитник проигрывает бой,
// который должен был выиграть. Ни одну из этих бед не видно на экране,
// поэтому здесь после каждого приказа и после каждого раунда пересматривается
// вся партия — этим и занимается scripts/check-kingdoms.mjs, сотнями партий,
// без браузера.
//
//   node scripts/check-kingdoms.mjs
//
// Здесь же и единственное место, где решается, что можно увидеть каждому
// игроку: visibleStateFor. Её же зовут боты (иначе они видели бы чужие
// закрытые приказы) и сервер комнаты (иначе секрет читался бы в сетевом
// ответе). Расходиться этим трём сторонам нельзя ни на строчку.

(function () {
  'use strict';

  const R = window.KingdomsRules;

  /*
    Карта и раскладки заданы; случайность нужна для тайных целей и добора
    жетонов из конечного запаса. Она всегда
    приходит снаружи (createGame({ random })), чтобы проверку можно было
    повторить дословно.
  */
  function defaultRandom() { return Math.random(); }

  function cloneAreas() {
    const map = {};
    for (const area of R.AREAS) map[area.id] = { owner: null, fortify: 0, veterans: 0, guardedRound: 0 };
    return map;
  }

  /*
    Партия. kingdomIds — по одному на место, в порядке мест (место 0 — тот,
    кто держит устройство или откроет партию первым по сети). Раскладка не
    выбирается здесь: её решает вызывающий (обычно R.STARTING_LAYOUTS[N]),
    потому что только он знает, сколько за столом людей и ботов.
  */
  function createGame({ kingdomIds, players, random = defaultRandom }) {
    if (!Array.isArray(kingdomIds) || kingdomIds.length < 2 || kingdomIds.length > 5) {
      throw new Error('Царств должно быть от двух до пяти');
    }
    const areas = cloneAreas();
    const objectiveIds = R.assignObjectives(kingdomIds, random);
    const statePlayers = kingdomIds.map((kingdomId, seat) => ({
      id: seat,
      name: (players && players[seat] && players[seat].name) || R.kingdomOf(kingdomId).name,
      isBot: Boolean(players && players[seat] && players[seat].isBot),
      botLevel: (players && players[seat] && players[seat].botLevel) || 'captain',
      kingdomId,
      objectiveId: objectiveIds[seat],
      eliminated: false,
      supply: Object.entries(R.TOKEN_SUPPLY).flatMap(([kind, count]) => Array(count).fill(kind)),
      hand: [],
    }));
    for (let seat = 0; seat < kingdomIds.length; seat += 1) {
      for (const id of R.startingAreasOf(kingdomIds[seat])) areas[id].owner = seat;
    }
    const state = {
      players: statePlayers,
      areas,
      round: 1,
      phase: 'planning',
      status: 'playing',
      orders: [],
      scoutIntel: statePlayers.map(() => []),
      log: [],
      lastResolution: null,
      finalScore: null,
      winner: null,
      random,
      orderSeq: 0,
    };
    beginRound(state, true);
    return state;
  }

  const activeSeats = (state) => state.players.filter((one) => !one.eliminated).map((one) => one.id);

  function beginRound(state, first = false) {
    if (!first) state.round += 1;
    state.phase = 'planning';
    state.orders = [];
    state.lastResolution = null;
    for (const player of state.players) {
      if (player.eliminated) continue;
      // Сохранённый жетон остаётся; повторный блеф доступен каждый раунд.
      player.hand = player.hand.filter((kind) => kind !== 'feint');
      player.hand.push('feint');
      while (player.hand.length < R.HAND_SIZE && player.supply.length) {
        const index = Math.floor(state.random() * player.supply.length);
        player.hand.push(player.supply.splice(index, 1)[0]);
      }
    }
    const active = activeSeats(state);
    // Первый игрок меняется по кругу — местом, а не живым человеком: ушедший
    // всё равно занимает своё место в очереди, если оно ещё за столом.
    const rotation = state.round - 1;
    state.firstPlayer = active.length ? active[rotation % active.length] : 0;
    state.cycle = 0;
    setCycleOrder(state);
    logEvent(state, `Runde ${state.round}: первым размещает ${nameOf(state, state.firstPlayer)}.`);
  }

  function setCycleOrder(state) {
    const active = activeSeats(state);
    const at = active.indexOf(state.firstPlayer);
    const start = at < 0 ? 0 : at;
    state.turnOrder = active.map((_, i) => active[(start + i) % active.length]);
    state.turnPointer = 0;
  }

  const nameOf = (state, seat) => (state.players[seat] ? state.players[seat].name : `Platz ${seat}`);
  const logEvent = (state, text) => { state.log.push({ round: state.round, text }); };

  /** Чей сейчас ход в планировании, или -1, если фаза не планирование. */
  function currentTurn(state) {
    if (state.phase !== 'planning') return -1;
    if (!state.turnOrder.length) return -1;
    return state.turnOrder[state.turnPointer];
  }

  function ordersPlacedBy(state, seat) {
    return state.orders.filter((one) => one.owner === seat).length;
  }

  /*
    ——— проверка приказа ———

    Возвращает { ok:true } или { ok:false, reason } — причина словами, потому
    что кнопка «Подтвердить» обязана объяснить отказ, а не просто не
    нажаться.
  */
  function validatePlacement(state, seat, placement) {
    if (state.phase !== 'planning') return fail('Сейчас не фаза планирования');
    if (currentTurn(state) !== seat) return fail('Сейчас не ваш ход');
    if (ordersPlacedBy(state, seat) >= R.ORDERS_PER_ROUND) return fail('Вы уже разместили пять приказов');
    const order = R.orderOf(placement && placement.kind);
    if (!order) return fail('Неизвестный приказ');
    const player = state.players[seat];
    if (!player.hand.includes(order.id)) return fail('Такого жетона нет в вашей руке');

    if (order.id === 'scout') {
      const targets = normalizeScoutTargets(placement.scoutTargets);
      const limit = player.kingdomId === 'kedem' ? 2 : 1;
      if (!targets.length) return fail('Укажите чужой закрытый приказ');
      if (targets.length > limit) return fail(`Разведка раскрывает не больше ${limit} приказ(а)`);
      for (const targetId of targets) {
        const target = state.orders.find((one) => one.id === targetId);
        if (!target) return fail('Такого приказа уже нет на карте');
        if (target.owner === seat) return fail('Разведка нацелена на чужой приказ');
      }
      return { ok: true, order, targets };
    }

    const areaId = placement && placement.area;
    const area = R.areaOf(areaId);
    if (!area) return fail('Такой области нет на карте');
    if (state.areas[areaId].owner !== seat) return fail('Область вам не принадлежит');

    if (order.slot === 'internal') {
      if (hasSlotOrder(state, seat, areaId, 'internal')) {
        return fail('В этой области уже есть внутренний приказ');
      }
      if (order.id === 'fortify') {
        const cap = R.fortifyCapFor(player.kingdomId, area);
        if (state.areas[areaId].fortify >= cap) return fail('Область уже укреплена до предела');
      }
      return { ok: true, order, area: areaId };
    }

    // outgoing: поход любой силы, переправа, отвлекающий манёвр
    if (hasSlotOrder(state, seat, areaId, 'outgoing')) {
      return fail('Из этой области уже выходит приказ');
    }
    const to = placement && placement.to;
    const toArea = R.areaOf(to);
    if (!toArea) return fail('Нет такой цели');
    if (R.edgeType(areaId, to) !== order.edge) {
      return fail(order.edge === 'ford' ? 'Переправа возможна только через брод' : 'Похода здесь нет — нужна переправа или соседняя область по суше');
    }
    if (state.areas[to].owner === seat) return fail('Нельзя атаковать собственную область');
    return { ok: true, order, area: areaId, to };
  }

  const fail = (reason) => ({ ok: false, reason });
  const normalizeScoutTargets = (value) => (Array.isArray(value) ? value : value ? [value] : [])
    .map((one) => String(one)).filter(Boolean);

  function hasSlotOrder(state, seat, areaId, slot) {
    return state.orders.some((one) => one.owner === seat && one.area === areaId && R.orderOf(one.kind).slot === slot);
  }

  /** Разместить приказ. Возвращает приказ или бросает — цена ошибки решается вызывающим. */
  function placeOrder(state, seat, placement) {
    const check = validatePlacement(state, seat, placement);
    if (!check.ok) throw engineError(check.reason);
    const isScout = check.order.id === 'scout';
    /*
      У разведки нет своей области — она ссылается на чужой приказ. Но
      соперники обязаны увидеть закрытый приказ где-то на карте («его
      положение и направление» — чужого вида и силы это не выдаёт), поэтому
      место на доске разведка занимает то же, что и первая из её целей:
      это только координаты показа, на предел приказов по области они не
      влияют — у разведки slot:'none', и hasSlotOrder её не считает.
    */
    const firstTarget = isScout ? state.orders.find((one) => one.id === check.targets[0]) : null;
    const order = {
      id: `o${state.orderSeq += 1}`,
      owner: seat,
      kind: check.order.id,
      area: isScout ? (firstTarget ? firstTarget.area : null) : (check.area || null),
      to: isScout ? (firstTarget ? firstTarget.to : null) : (check.order.slot === 'outgoing' ? check.to : null),
      scoutTargets: isScout ? check.targets : null,
      round: state.round,
    };
    state.orders.push(order);
    state.players[seat].hand.splice(state.players[seat].hand.indexOf(order.kind), 1);
    if (order.kind === 'scout') applyScoutIntel(state, order);
    advanceTurn(state);
    return order;
  }

  /*
    Разведка раскрывает сведения сразу же, а не при общем раскрытии: правило
    прямое — «позволяет учитывать сведения при следующих размещениях», и
    держать эти сведения до конца планирования значило бы нарушить его же.
    Видит их только тот, кто разведал: сведения кладутся в его собственный
    список scoutIntel, а не в общий.
  */
  function applyScoutIntel(state, order) {
    for (const targetId of order.scoutTargets) {
      const target = state.orders.find((one) => one.id === targetId);
      if (!target) continue;
      state.scoutIntel[order.owner].push({
        atRound: state.round,
        orderId: target.id,
        owner: target.owner,
        kind: target.kind,
        area: target.area,
        to: target.to,
      });
    }
  }

  function advanceTurn(state) {
    state.turnPointer += 1;
    if (state.turnPointer < state.turnOrder.length) return;
    state.cycle += 1;
    if (state.cycle >= R.ORDERS_PER_ROUND) { state.phase = 'reveal'; return; }
    setCycleOrder(state);
  }

  /** Пропуск хода — тоже ход: вручную или по часам сервера. */
  function skipTurn(state, seat) {
    if (state.phase !== 'planning' || currentTurn(state) !== seat) throw engineError('Сейчас не ваш ход');
    advanceTurn(state);
  }

  // ——————————————————————————————————————————————— раскрытие и разрешение

  const isCombatOrder = (kind) => kind === 'march1' || kind === 'march2' || kind === 'march3' || kind === 'ford2';

  /** Сила приказа с учётом способности царства — до сложения с чужими приказами. */
  function forceOf(state, order) {
    const base = R.orderOf(order.kind).force;
    if (!isCombatOrder(order.kind)) return base;
    const kingdomId = state.players[order.owner].kingdomId;
    const from = R.areaOf(order.area);
    const to = R.areaOf(order.to);
    let force = base;
    if (order.kind === 'ford2' && kingdomId === 'yor') force += 1;
    if ((order.kind === 'march1' || order.kind === 'march2' || order.kind === 'march3')
      && kingdomId === 'tarsis' && from.terrain === 'coast' && to.terrain === 'coast') force += 1;
    return force;
  }

  /** Защита области по формуле правил — с разложением по слагаемым для показа игроку. */
  function defenseOf(state, areaId, guarded) {
    const area = R.areaOf(areaId);
    const owner = state.areas[areaId].owner;
    if (owner === null) {
      return { base: R.neutralDefense(area), fortify: 0, guard: 0, terrain: 0, ability: 0, total: R.neutralDefense(area) };
    }
    const kingdomId = state.players[owner].kingdomId;
    const fortify = state.areas[areaId].fortify;
    const guard = guarded ? 2 : 0;
    let terrain = area.terrain === 'mountains' ? R.MOUNTAIN_DEFENSE_BONUS : 0;
    let ability = 0;
    if (kingdomId === 'or' && area.terrain === 'mountains') ability += 1;
    const veterans = state.areas[areaId].veterans || 0;
    const total = 1 + fortify + veterans + guard + terrain + ability;
    return { base: 1, fortify, veterans, guard, terrain, ability, total };
  }

  /*
    Раскрытие и разрешение — одним вызовом, по порядку из правил:
    укрепления, затем стража, затем атаки, затем — все хозяева разом.

    Исходные владения читаются один раз, до всякой мутации: area.owner из
    state.areas на входе в функцию — и есть тот самый «момент завершения
    планирования». Приказ, отправленный из области, остаётся приказом
    прежнего хозяина, даже если у этой области к концу функции будет другой
    хозяин: он взят из order.area/order.owner, а не пересчитан заново.
  */
  function resolveRound(state) {
    if (state.phase !== 'reveal') throw engineError('Раскрывать пока нечего');
    for (const order of state.orders) order.revealed = true;

    // 1) укрепления — постоянный прирост, тут же участвует в защите.
    for (const order of state.orders) {
      if (order.kind !== 'fortify') continue;
      const area = R.areaOf(order.area);
      const cap = R.fortifyCapFor(state.players[order.owner].kingdomId, area);
      state.areas[order.area].fortify = Math.min(cap, state.areas[order.area].fortify + 1);
    }

    // 2) стража — только на этот раунд, не хранится дальше резолва.
    const guarded = new Set(state.orders.filter((one) => one.kind === 'guard').map((one) => one.area));

    // 3) атаки — по каждой целевой области суммируются приказы одного игрока.
    const attacksByArea = new Map();
    for (const order of state.orders) {
      if (!isCombatOrder(order.kind)) continue;
      if (!attacksByArea.has(order.to)) attacksByArea.set(order.to, new Map());
      const byPlayer = attacksByArea.get(order.to);
      const seat = order.owner;
      const entry = byPlayer.get(seat) || { total: 0, orders: [] };
      entry.total += forceOf(state, order);
      entry.orders.push(order.id);
      byPlayer.set(seat, entry);
    }

    // 4) итог по каждой упомянутой области — но хозяева меняются только
    //    после того, как посчитаны все области разом.
    const report = [];
    const pendingOwners = new Map();
    for (const [areaId, byPlayer] of attacksByArea) {
      const defense = defenseOf(state, areaId, guarded.has(areaId));
      const attackers = [...byPlayer.entries()]
        .map(([seat, entry]) => ({ seat, total: entry.total, orders: entry.orders }))
        .sort((a, b) => b.total - a.total);
      const top = attackers[0];
      const tiedTop = attackers.filter((one) => one.total === top.total).length > 1;
      const previousOwner = state.areas[areaId].owner;
      let outcome = 'held';
      let newOwner = previousOwner;
      if (!tiedTop && top.total > defense.total) { outcome = 'captured'; newOwner = top.seat; }
      else if (tiedTop && top.total > defense.total) outcome = 'standoff';
      // Отбитая атака укрепляет гарнизон: открытый жетон защиты действует
      // в будущих раундах и приносит одно очко при итоговом подсчёте.
      if (previousOwner !== null && newOwner === previousOwner && top.total > 0 && top.total <= defense.total) {
        state.areas[areaId].veterans = (state.areas[areaId].veterans || 0) + 1;
      }
      report.push({ area: areaId, defense, attackers, previousOwner, newOwner, outcome });
      if (newOwner !== previousOwner) pendingOwners.set(areaId, newOwner);
    }
    for (const [areaId, seat] of pendingOwners) {
      state.areas[areaId].owner = seat;
      state.areas[areaId].veterans = 0;
    }

    state.lastResolution = report;
    for (const line of report) logEvent(state, resolutionText(state, line));

    for (const player of state.players) {
      player.eliminated = !Object.values(state.areas).some((one) => one.owner === player.id);
    }

    state.phase = 'results';
    if (state.round >= R.ROUNDS) finishGame(state);
    return report;
  }

  function resolutionText(state, line) {
    const area = R.areaOf(line.area);
    if (line.outcome === 'captured') {
      return `${nameOf(state, line.newOwner)} берёт «${area.name}» (${line.attackers[0].total} против ${line.defense.total}).`;
    }
    if (line.outcome === 'standoff') {
      return `Ничья за «${area.name}»: атакующие силы равны, область осталась прежней.`;
    }
    return `«${area.name}» устояла: защита ${line.defense.total} против ${line.attackers[0].total}.`;
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
    if (!owned.size) return 0;
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
    прямо — например, чтобы проверить достижимость цели независимо от того,
    кому она в этой партии досталась по жребию (см. scripts/check-kingdoms.mjs).
  */
  function checkObjective(state, seat, objectiveId = state.players[seat].objectiveId) {
    const player = state.players[seat];
    if (objectiveId === 'capital') {
      const capitalId = R.AREAS.find((one) => one.capitalOf === player.kingdomId)?.id;
      return capitalId ? state.areas[capitalId].owner === seat : false;
    }
    if (objectiveId === 'territory') return connectedCount(state, seat) >= 5;
    if (objectiveId === 'ford') {
      return R.FORDS.some((edge) => state.areas[edge.a].owner === seat && state.areas[edge.b].owner === seat);
    }
    if (objectiveId === 'cities') {
      return R.AREAS.filter((area) => area.city && state.areas[area.id].owner === seat).length >= 2;
    }
    return false;
  }

  function regionFullyControlledBy(state, regionId, seat) {
    return R.areasOfRegion(regionId).every((area) => state.areas[area.id].owner === seat);
  }

  function finishGame(state) {
    const scores = state.players.map((player) => {
      const seat = player.id;
      const areaValue = R.AREAS.reduce((sum, area) => (
        state.areas[area.id].owner === seat ? sum + area.value : sum), 0);
      const regions = R.REGION_IDS.filter((regionId) => regionFullyControlledBy(state, regionId, seat));
      const objectiveDone = checkObjective(state, seat);
      const objective = R.objectiveOf(player.objectiveId);
      const cities = R.AREAS.filter((area) => area.city && state.areas[area.id].owner === seat).length;
      const areasHeld = R.AREAS.filter((area) => state.areas[area.id].owner === seat).length;
      const veterans = R.AREAS.reduce((sum, area) => state.areas[area.id].owner === seat
        ? sum + (state.areas[area.id].veterans || 0) : sum, 0);
      const total = areaValue + veterans + regions.length * R.REGION_BONUS + (objectiveDone ? objective.points : 0);
      return {
        seat, areaValue, veterans, regions: regions.length, objectiveDone,
        objectivePoints: objectiveDone ? objective.points : 0, total, cities, areasHeld,
      };
    });
    let winners = [scores[0]];
    for (const score of scores.slice(1)) {
      if (score.total > winners[0].total) winners = [score];
      else if (score.total === winners[0].total) winners.push(score);
    }
    if (winners.length > 1) {
      const mostCities = Math.max(...winners.map((one) => one.cities));
      let byCities = winners.filter((one) => one.cities === mostCities);
      if (byCities.length > 1) {
        const mostAreas = Math.max(...byCities.map((one) => one.areasHeld));
        byCities = byCities.filter((one) => one.areasHeld === mostAreas);
      }
      winners = byCities;
    }
    state.finalScore = scores;
    state.winner = winners.length === 1 ? winners[0].seat : winners.map((one) => one.seat);
    state.status = 'over';
    state.phase = 'over';
  }

  // ——————————————————————————————————————————————— видимость

  /*
    Единственное место, где решается, что видит игрок. Своя область — вся,
    чужая — тоже вся (владение и укрепление на карте не прячутся, прячутся
    только приказы). Свой приказ — целиком. Чужой закрытый — только хозяин,
    область и направление; раскрытый — целиком, как только фаза дошла до
    раскрытия. Собственная разведка — только своя, и только уже случившаяся.
  */
  function visibleStateFor(state, seat) {
    const revealed = state.phase === 'results' || state.phase === 'over';
    return {
      you: seat,
      round: state.round,
      phase: state.phase,
      status: state.status,
      cycle: state.cycle,
      turn: currentTurn(state),
      firstPlayer: state.firstPlayer,
      areas: state.areas,
      players: state.players.map((one) => ({
        id: one.id, name: one.name, kingdomId: one.kingdomId, isBot: one.isBot, eliminated: one.eliminated,
        objectiveId: one.id === seat || revealed ? one.objectiveId : null,
      })),
      orders: state.orders.map((order) => (order.owner === seat || order.revealed
        ? { ...order }
        : { id: order.id, owner: order.owner, area: order.area, to: order.to })),
      scoutIntel: state.scoutIntel[seat] || [],
      lastResolution: state.lastResolution,
      finalScore: state.finalScore,
      winner: state.winner,
      log: state.log.slice(-12),
      ordersPlaced: ordersPlacedBy(state, seat),
      ordersLimit: R.ORDERS_PER_ROUND,
      hand: seat >= 0 ? [...(state.players[seat]?.hand || [])] : [],
      supplyRemaining: seat >= 0 ? state.players[seat]?.supply.length || 0 : 0,
    };
  }

  function engineError(message) {
    const error = new Error(message);
    error.code = 'KINGDOMS_ENGINE';
    return error;
  }

  window.KingdomsEngine = {
    createGame, beginRound, currentTurn, validatePlacement, placeOrder, skipTurn,
    resolveRound, nextRound, forceOf, defenseOf, checkObjective, connectedCount,
    regionFullyControlledBy, finishGame, visibleStateFor, ordersPlacedBy, activeSeats,
  };
}());
