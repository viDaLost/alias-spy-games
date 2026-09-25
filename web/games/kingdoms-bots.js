// «Царства» — соперник от игры.
//
// Бот выбирает ход по тому же виду партии, что получил бы человек на его
// месте: visibleStateFor снимает с чужих закрытых жетонов вид и силу, и бот
// их не видит тоже — ни здесь, ни на сервере. Если однажды это правило
// нарушится, бот начнёт ходить лучше человека не умом, а подглядыванием.
//
// Расчёт — оценка каждого разрешённого хода числом и выбор наибольшего.
// Одна выгода на всё: и защиту столицы, и захват, и благословение, и завет
// мира приходится сравнивать в одних очках, иначе бот либо только нападает,
// либо только обороняется.

(function () {
  'use strict';

  const R = window.KingdomsRules;
  const E = window.KingdomsEngine;

  // Сколько, по опыту, стоит чужой закрытый жетон: среднее по запасу с поправкой на пустой.
  const HIDDEN_FORCE = 2.2;

  const OBJECTIVE_TASTE = {
    capital: 6, territory: 4.5, ford: 3.5, cities: 4.5, coast: 3, mountains: 3,
    desert: 3, hubs: 3.5, peace: 4, veterans: 4.5,
  };
  const HOME_TASTE = { tarsis: 'coast', or: 'mountains', kedem: 'desert' };

  function pickObjective(state, seat) {
    const player = state.players[seat];
    const score = (id) => (OBJECTIVE_TASTE[id] || 3)
      + (HOME_TASTE[player.kingdomId] === id ? 3 : 0)
      + (id === 'ford' && ['yor', 'prestol', 'tarsis'].includes(player.kingdomId) ? 2 : 0);
    return [...player.objectiveChoices].sort((a, b) => score(b) - score(a))[0];
  }

  function objectiveBonus(area, objectiveId) {
    switch (objectiveId) {
      case 'cities': return area.city ? 3 : 0;
      case 'coast': return R.isCoastal(area.id) ? 2.5 : 0;
      case 'mountains': return area.terrain === 'mountains' ? 2.5 : 0;
      case 'desert': return area.terrain === 'desert' ? 2.5 : 0;
      case 'hubs': return area.role === 'hub' ? 3 : 0;
      case 'ford': return R.FORDS.some((edge) => edge.a === area.id || edge.b === area.id) ? 2.5 : 0;
      case 'territory': return 1;
      default: return 0;
    }
  }

  function areaWeight(state, area, objectiveId) {
    let weight = area.value;
    if (area.capitalOf) weight += 2;
    const cell = state.areas[area.id];
    if (cell.special === 'honor2') weight += 2;
    if (cell.special === 'defense2') weight += 1;
    return weight + objectiveBonus(area, objectiveId);
  }

  /** Расстановка: свободная область поближе к своим, подороже и под свою цель. */
  function pickControl(state, seat) {
    const player = state.players[seat];
    let best = null;
    for (const area of R.AREAS) {
      const cell = state.areas[area.id];
      if (cell.owner !== null || cell.special === 'scorched') continue;
      const near = R.neighborsOf(area.id);
      const mine = near.filter((id) => state.areas[id].owner === seat).length;
      const enemy = near.filter((id) => state.areas[id].owner !== null && state.areas[id].owner !== seat).length;
      const score = area.value * 2 + (area.city ? 1.5 : 0) + mine * 3 - enemy * 0.8
        + objectiveBonus(area, player.objectiveId || pickObjective(state, seat)) * 1.5
        + (area.region === R.kingdomOf(player.kingdomId).region ? 1 : 0);
      if (!best || score > best.score) best = { area: area.id, score };
    }
    return best ? best.area : null;
  }

  // ——————————————————————————————————————————————— оценка поля

  const isCombatKind = (kind) => R.COMBAT_FAMILIES.has(R.familyOf(kind));

  /** Сила жетона, как её видит этот бот: свой и открытый — точно, чужой закрытый — по опыту или по разведке. */
  function seenForce(state, visible, order) {
    if (order.kind) return isCombatKind(order.kind) ? E.forceOf(state, order) : 0;
    const intel = visible.scoutIntel.find((one) => one.orderId === order.id);
    if (intel) return isCombatKind(intel.kind) ? E.forceOf(state, { ...order, kind: intel.kind }) : 0;
    return HIDDEN_FORCE;
  }

  /** Куда бьёт жетон (по месту на карте): цель атаки или область, которую он защищает. */
  function pointOf(order) {
    return order.to || order.area;
  }

  /** Ожидаемая защита области X против нас: постоянная плюс защитные жетоны хозяина, что уже лежат. */
  function expectedDefense(state, visible, areaId, seat) {
    const cell = visible.areas[areaId];
    let total = E.defenseOf(state, areaId).total;
    if (cell.owner === null) return total;
    for (const order of visible.orders) {
      if (order.owner !== cell.owner || pointOf(order) !== areaId || order.to) continue;
      total += seenForce(state, visible, order);
    }
    // Хозяин ещё может усилить защиту, если его ход впереди.
    if (cell.owner !== seat) total += 0.8;
    return total;
  }

  /** Сила, которую этот игрок уже направил на область X. */
  function ourPush(state, visible, areaId, seat) {
    let total = 0;
    for (const order of visible.orders) {
      if (order.owner !== seat || !order.kind || !isCombatKind(order.kind)) continue;
      const side = E.battleSide(state, order);
      if (side && side.area === areaId && side.attack) total += E.forceOf(state, order);
    }
    return total;
  }

  /** Угроза нашей области: сумма чужих жетонов, нацеленных на неё. */
  function threatOn(state, visible, areaId, seat) {
    let total = 0; let count = 0;
    for (const order of visible.orders) {
      if (order.owner === seat) continue;
      if (order.to === areaId || (order.area === areaId && !order.to)) {
        total += seenForce(state, visible, order);
        count += 1;
      }
    }
    return { total, count };
  }

  function ownDefense(state, visible, areaId, seat) {
    let total = E.defenseOf(state, areaId).total;
    for (const order of visible.orders) {
      if (order.owner !== seat || order.to || order.area !== areaId || !order.kind || !isCombatKind(order.kind)) continue;
      total += E.forceOf(state, order);
    }
    return total;
  }

  // ——————————————————————————————————————————————— кандидаты

  function candidates(state, seat, visible) {
    const player = state.players[seat];
    const out = [];
    const hand = visible.hand;
    if (hand.length <= 1) return out;
    const have = (kind) => hand.includes(kind);
    const kindsOf = (familyId) => [...new Set(hand.filter((kind) => R.familyOf(kind) === familyId))]
      .sort((a, b) => R.orderOf(a).force - R.orderOf(b).force);
    const armies = kindsOf('army');
    const navies = kindsOf('navy');
    const ambushes = kindsOf('ambush');
    const owned = R.AREAS.filter((area) => visible.areas[area.id].owner === seat).map((area) => area.id);
    const blocked = (id) => ['peace', 'scorched'].includes(visible.areas[id].special);
    const attackable = (id) => visible.areas[id].owner !== seat && !blocked(id) && visible.areas[id].special !== 'shrine';

    /** Жетон наименьшей силы, которой хватит; иначе сильнейший с пометкой «не хватит». */
    const enough = (kinds, need, ctx) => {
      for (const kind of kinds) if (E.forceOf(state, { ...ctx, kind, owner: seat }) >= need) return { kind, short: false };
      return kinds.length ? { kind: kinds.at(-1), short: true } : null;
    };

    // — атаки —
    const attackScore = (targetId, kind, short) => {
      const area = R.areaOf(targetId);
      const cell = visible.areas[targetId];
      const force = R.orderOf(kind).force;
      return areaWeight(state, area, player.objectiveId) * 1.5 + (cell.owner !== null ? 1.2 : 0)
        - force * 0.35 + (short ? -2.5 : 1.5);
    };
    const targets = R.AREAS.filter((area) => attackable(area.id)).map((area) => area.id);
    for (const to of targets) {
      const need = expectedDefense(state, visible, to, seat) - ourPush(state, visible, to, seat) + 1;
      if (need <= 0) continue; // уже хватает
      // войско через границу
      if (armies.length) {
        const sources = player.ronin ? R.neighborsOf(to) : R.neighborsOf(to).filter((id) => owned.includes(id) && !blocked(id));
        for (const from of sources) {
          if (E.borderTaken(state, from, to)) continue;
          const pickKind = enough(armies, need, { area: from, to });
          if (!pickKind) continue;
          out.push({ kind: pickKind.kind, area: from, to, score: attackScore(to, pickKind.kind, pickKind.short) });
        }
      }
      // корабли с воды
      if (navies.length && !player.ronin && R.isCoastal(to) && !E.seaTaken(state, to)) {
        const pickKind = enough(navies, need, { area: null, to });
        if (pickKind) out.push({ kind: pickKind.kind, to, score: attackScore(to, pickKind.kind, pickKind.short) + 0.3 });
      }
      // засада в сердце
      if (ambushes.length && !player.ronin) {
        const pickKind = enough(ambushes, need, { area: to, to: null });
        if (pickKind && !pickKind.short) out.push({ kind: pickKind.kind, area: to, score: attackScore(to, pickKind.kind, false) - 1.2 });
      }
    }

    // — оборона —
    if (!player.ronin) {
      for (const id of owned) {
        if (blocked(id)) continue;
        const threat = threatOn(state, visible, id, seat);
        if (!threat.count) continue;
        const current = ownDefense(state, visible, id, seat);
        const need = threat.total - current + 0.5;
        if (need <= 0) continue;
        const area = R.areaOf(id);
        const worth = areaWeight(state, area, player.objectiveId) * 1.3 + threat.count * 1.5;
        const armyKind = enough(armies, need, { area: id, to: null });
        if (armyKind) out.push({ kind: armyKind.kind, area: id, score: worth - R.orderOf(armyKind.kind).force * 0.3 - (armyKind.short ? 1.5 : 0) });
        if (R.isCoastal(id)) {
          const navyKind = enough(navies, need, { area: id, to: null });
          if (navyKind) out.push({ kind: navyKind.kind, area: id, score: worth - 0.2 - (navyKind.short ? 1.5 : 0) });
        }
        if (ambushes.length) {
          const ambushKind = enough(ambushes, need, { area: id, to: null });
          if (ambushKind && !ambushKind.short) out.push({ kind: ambushKind.kind, area: id, score: worth - 1.5 });
        }
        // Завет мира — для самой ценной земли под серьёзной угрозой.
        if (have('peace') && (area.capitalOf || area.value >= 3) && threat.total >= current) {
          out.push({ kind: 'peace', area: id, score: 3 + areaWeight(state, area, player.objectiveId) + threat.count * 1.5 });
        }
      }
      if (have('peace') && player.objectiveId === 'peace') {
        const calm = owned.filter((id) => visible.areas[id].special !== 'peace' && !blocked(id));
        if (calm.length) out.push({ kind: 'peace', area: calm[0], score: 4.5 });
      }
    }

    /*
      Спокойная оборона. По правилам защитник, поставивший войско в центр
      своей области, побеждает, даже если никто не пришёл, — и кладёт
      открытый жетон контроля: +1 к защите и +1 очко. Свободный слабый жетон
      так работает лучше пропуска.
    */
    if (!player.ronin && armies.length) {
      for (const id of owned) {
        if (blocked(id)) continue;
        if (visible.orders.some((one) => one.owner === seat && one.area === id && !one.to)) continue;
        const area = R.areaOf(id);
        out.push({ kind: armies[0], area: id, score: 0.9 + areaWeight(state, area, player.objectiveId) * 0.2 - R.orderOf(armies[0]).force * 0.25 });
      }
    }

    // — благословение на свой уже лежащий жетон, где спор тесен —
    for (const kind of kindsOf('bless')) {
      for (const order of visible.orders) {
        if (order.owner !== seat || !order.kind || !isCombatKind(order.kind)) continue;
        if (visible.orders.some((one) => one.target === order.id)) continue;
        const side = E.battleSide(state, order);
        if (!side) continue;
        const area = R.areaOf(side.area);
        let tight;
        if (side.attack) tight = ourPush(state, visible, side.area, seat) <= expectedDefense(state, visible, side.area, seat) + 0.5;
        else tight = threatOn(state, visible, side.area, seat).total >= ownDefense(state, visible, side.area, seat) - 0.5;
        if (!tight) continue;
        out.push({ kind, target: order.id, score: 2 + areaWeight(state, area, player.objectiveId) * 0.9 + R.orderOf(kind).force * 0.4 });
      }
    }

    // — поджог: ценная чужая земля, которую не взять силой. «Набегу
    //   всадников» Кидара соседство не нужно, обычному поджогу — нужно. —
    const raids = ['raid', 'raider'].filter(have);
    if (raids.length && !player.ronin) {
      for (const to of targets) {
        const cell = visible.areas[to];
        if (cell.owner === null) continue;
        const near = R.neighborsOf(to).some((id) => owned.includes(id));
        const kind = near ? raids[0] : raids.includes('raider') ? 'raider' : null;
        if (!kind) continue;
        const area = R.areaOf(to);
        const defense = expectedDefense(state, visible, to, seat);
        if (defense < 5 || area.value < 3) continue;
        out.push({ kind, area: to, score: 0.8 + area.value * 0.5 });
      }
    }

    /*
      Запасные ходы — только когда лучше нечем: поджечь соседнюю чужую
      землю, заключить мир в самой ценной своей области, благословить любой
      свой жетон. Иначе бот копит их за ширмой до конца партии.
    */
    if (!player.ronin) {
      for (const kind of raids) {
        for (const to of targets) {
          if (kind === 'raid' && !R.neighborsOf(to).some((id) => owned.includes(id))) continue;
          const cell = visible.areas[to];
          if (cell.owner === null) continue;
          out.push({ kind, area: to, score: 0.2 + R.areaOf(to).value * 0.05 });
        }
      }
      if (have('peace')) {
        for (const id of owned) {
          if (blocked(id)) continue;
          const inner = R.neighborsOf(id).every((n) => visible.areas[n].owner === seat || blocked(n));
          out.push({ kind: 'peace', area: id, score: 0.1 + R.areaOf(id).value * 0.05 + (inner ? 0.35 : 0) });
        }
      }
      for (const kind of kindsOf('bless')) {
        const mineOrder = visible.orders.find((one) => one.owner === seat && one.kind && isCombatKind(one.kind)
          && !visible.orders.some((other) => other.target === one.id));
        if (mineOrder) out.push({ kind, target: mineOrder.id, score: 0.5 });
      }
    }

    // — пустой жетон: угроза без силы, когда больше нечем ходить —
    if (have('feint') && !player.ronin) {
      for (const from of owned) {
        if (blocked(from)) continue;
        const to = R.neighborsOf(from).find((id) => attackable(id) && !E.borderTaken(state, from, id));
        if (to) { out.push({ kind: 'feint', area: from, to, score: 0.6 }); break; }
      }
    }

    return out.filter((choice) => E.validatePlacement(state, seat, choice).ok);
  }

  /*
    Карта в начале хода. Первенство и пророк бьют по самой опасной для нас
    угрозе, соглядатаи — смотрят на неё, если её сила неизвестна.
  */
  function pickCard(state, seat) {
    const visible = E.visibleStateFor(state, seat);
    if (visible.turn !== seat || visible.phase !== 'planning') return null;
    const player = state.players[seat];
    const threats = visible.orders
      .filter((order) => order.owner !== seat && !order.kind && !order.open)
      .filter((order) => !visible.orders.some((one) => one.target === order.id))
      .map((order) => {
        const at = pointOf(order);
        const cell = visible.areas[at];
        const area = R.areaOf(at);
        const mine = cell && cell.owner === seat;
        return { order, mine, value: mine ? areaWeight(state, area, player.objectiveId) : 0 };
      })
      .filter((one) => one.mine)
      .sort((a, b) => b.value - a.value);
    const unknown = threats.filter((one) => !visible.scoutIntel.some((i) => i.orderId === one.order.id));
    if (visible.herald === seat && threats.length && threats[0].value >= 3) {
      return { card: 'herald', target: threats[0].order.id };
    }
    if (player.cards.prophet > 0 && visible.round >= 2 && threats.length && threats[0].value >= 4) {
      const known = visible.scoutIntel.find((i) => i.orderId === threats[0].order.id);
      if (!known || isCombatKind(known.kind)) return { card: 'prophet', target: threats[0].order.id };
    }
    if (player.cards.scout > 0 && unknown.length && unknown[0].value >= 3) {
      return { card: 'scout', target: unknown[0].order.id };
    }
    return null;
  }

  /*
    Ход бота в размещении. state — полная партия, но кандидаты считаются
    только по visible — виду партии для этого места.
  */
  function pick(state, seat) {
    const visible = E.visibleStateFor(state, seat);
    if (visible.turn !== seat || visible.phase !== 'planning') return null;
    const list = candidates(state, seat, visible);
    if (!list.length) return null;
    list.sort((a, b) => b.score - a.score);
    const { score, ...choice } = list[0];
    return choice;
  }

  /*
    Весь ход этого места — то, что делают и экран, и сервер комнаты:
    в расстановке — цель (всем ботам сразу) и жетон контроля; в размещении —
    карта, если она к месту, и жетон или пропуск. Возвращает описание хода.
  */
  function play(state, seat) {
    if (state.phase === 'setup') {
      for (const one of state.players) {
        if (one.isBot && !one.objectiveId) E.chooseObjective(state, one.id, pickObjective(state, one.id));
      }
      if (E.currentTurn(state) !== seat) return null;
      const area = pickControl(state, seat);
      if (area) { E.placeControl(state, seat, area); return { control: area }; }
      E.skipTurn(state, seat);
      return { skip: true };
    }
    if (state.phase !== 'planning' || E.currentTurn(state) !== seat) return null;
    const card = pickCard(state, seat);
    if (card) {
      try { E.useCard(state, seat, card); } catch { /* карта не легла — ход продолжается без неё */ }
    }
    const choice = pick(state, seat);
    try {
      if (choice) { E.placeOrder(state, seat, choice); return { card, choice }; }
    } catch { /* незаконный ход — пропускаем, но не роняем партию */ }
    E.skipTurn(state, seat);
    return { card, skip: true };
  }

  window.KingdomsBots = { pick, pickCard, pickControl, pickObjective, play, candidates, areaWeight };
}());
