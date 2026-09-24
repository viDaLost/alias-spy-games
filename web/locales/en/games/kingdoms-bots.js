// «Царства» — соперник от игры.
//
// Бот выбирает ход по тому же виду партии, что получил бы человек на его
// месте: visibleStateFor снимает с чужих закрытых приказов вид и силу, и
// бот их не видит тоже — ни здесь, ни на сервере. Если однажды это правило
// нарушится, бот начнёт ходить лучше человека не умом, а подглядыванием, и
// игра перестанет быть честной. Проверка это спрашивает прямо: боты играют
// друг против друга, и не должно быть видно, что кто-то из них подсматривал
// в общий объект партии.
//
// Расчёт — оценка каждого разрешённого приказа числом и выбор наибольшего.
// Одна выгода на всё: и защиту столицы, и слежку, и захват — сравнивать
// приходится в одних очках, иначе бот либо только нападает, либо только
// обороняется.

(function () {
  'use strict';

  const R = window.KingdomsRules;
  const E = window.KingdomsEngine;

  const AREA_BONUS = {
    capital: 3,
  };

  function myOrders(visible, seat) {
    return visible.orders.filter((one) => one.owner === seat);
  }

  function usedSlots(visible, seat) {
    const used = { outgoing: new Set(), internal: new Set() };
    for (const order of myOrders(visible, seat)) {
      const slot = R.orderOf(order.kind).slot;
      if (slot === 'outgoing') used.outgoing.add(order.area);
      else if (slot === 'internal') used.internal.add(order.area);
    }
    return used;
  }

  /** Область под видимой угрозой: на неё указывает хоть один чужой закрытый приказ. */
  function threatCount(visible, areaId) {
    return visible.orders.filter((one) => one.to === areaId).length;
  }

  /** Сведения разведки об этом раунде — если приказ, грозящий area, уже раскрыт боту. */
  function knownThreatForce(visible, seat, areaId) {
    let best = 0;
    for (const one of visible.scoutIntel) {
      if (one.atRound !== visible.round || one.to !== areaId) continue;
      const order = R.orderOf(one.kind);
      if (!order || !order.force) continue;
      best = Math.max(best, order.force);
    }
    return best;
  }

  function areaWeight(state, area, objectiveId) {
    let weight = area.value;
    if (area.capitalOf) weight += AREA_BONUS.capital;
    if (objectiveId === 'cities' && area.city) weight += 4;
    if (objectiveId === 'ford' && R.FORDS.some((edge) => edge.a === area.id || edge.b === area.id)) weight += 3;
    return weight;
  }

  /** Список всех приказов, которые бот вправе сейчас разместить, каждый со своей оценкой. */
  function candidates(state, seat, visible) {
    const player = visible.players[seat];
    const used = usedSlots(visible, seat);
    const ownedIds = Object.entries(visible.areas).filter(([, v]) => v.owner === seat).map(([id]) => id);
    const out = [];
    const available = new Set(visible.hand);

    for (const areaId of ownedIds) {
      const area = R.areaOf(areaId);
      const myThreat = threatCount(visible, areaId);
      const known = knownThreatForce(visible, seat, areaId);

      // — внутренний приказ: стража или укрепление —
      if (!used.internal.has(areaId)) {
        const current = state.areas[areaId].fortify;
        const cap = R.fortifyCapFor(player.kingdomId, area);
        if (myThreat > 0 && available.has('guard')) {
          const guardScore = 4 + myThreat * 3 + areaWeight(state, area, player.objectiveId)
            + (known ? known * 2 : 0);
          out.push({ kind: 'guard', area: areaId, score: guardScore });
        }
        if (available.has('fortify') && current < cap && (myThreat === 0 || area.capitalOf)) {
          // Укрепление — вложение впрок, а не срочная нужда (для неё есть
          // стража). Оценка нарочно скромная: иначе царство укрепляет
          // столицу два раунда подряд вместо того, чтобы расти, и к пятому
          // раунду остаётся при своих двух областях.
          const fortifyScore = 0.5 + areaWeight(state, area, player.objectiveId) * 0.18;
          out.push({ kind: 'fortify', area: areaId, score: fortifyScore });
        }
      }

      // — исходящий приказ: поход, переправа или манёвр —
      if (!used.outgoing.has(areaId)) {
        const connections = R.connectionsOf(areaId);
        let bestMarch = null;
        for (const link of connections) {
          if (visible.areas[link.to].owner === seat) continue;
          const targetArea = R.areaOf(link.to);
          const orderId = link.type === 'ford' ? (available.has('ford2') ? 'ford2' : null)
            : bestMarchFor(state, seat, area, targetArea, available);
          const order = R.orderOf(orderId);
          if (!order || order.edge !== link.type) continue;
          const force = E.forceOf(state, { kind: orderId, owner: seat, area: areaId, to: link.to });
          const defense = E.defenseOf(state, link.to, false).total;
          const margin = force - defense;
          if (margin <= 0) continue; // сила обязана СТРОГО превышать защиту, иначе спор не выигран
          const score = margin * 2.5 + areaWeight(state, targetArea, player.objectiveId) * 1.3
            + (targetArea.capitalOf ? 3 : 0)
            + (player.objectiveId === 'territory' ? 2 : 0);
          if (!bestMarch || score > bestMarch.score) bestMarch = { kind: orderId, area: areaId, to: link.to, score };
        }
        if (bestMarch) out.push(bestMarch);
        else {
          // Нечем выиграть спор — иногда стоит блефовать манёвром.
          const land = connections.find((link) => link.type === 'land' && visible.areas[link.to].owner !== seat);
          if (land && available.has('feint')) out.push({ kind: 'feint', area: areaId, to: land.to, score: 1.5 });
        }
      }
    }

    // — разведка: чужой закрытый приказ, направленный на что-то ценное —
    const scoutLimit = player.kingdomId === 'kedem' ? 2 : 1;
    const foreignOrders = visible.orders.filter((one) => one.owner !== seat && !one.kind
      && !visible.scoutIntel.some(i => i.atRound === visible.round && i.orderId === one.id));
    const scoutTargets = foreignOrders
      .map((one) => {
        const targetArea = R.areaOf(one.to || one.area);
        const mine = one.to && visible.areas[one.to]?.owner === seat;
        const value = targetArea ? areaWeight(state, targetArea, player.objectiveId) : 1;
        return { id: one.id, score: 2 + value * (mine ? 1.2 : 0.6) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, scoutLimit);
    if (scoutTargets.length && available.has('scout')) {
      out.push({
        kind: 'scout',
        scoutTargets: scoutTargets.map((one) => one.id),
        score: scoutTargets.reduce((sum, one) => sum + one.score, 0) / scoutTargets.length,
      });
    }

    return out;
  }

  /** Слабейший поход, которого хватает на цель; иначе сильнейший — брать через силу. */
  function bestMarchFor(state, seat, from, target, available) {
    const orderIds = ['march1', 'march2', 'march3'].filter((id) => available.has(id));
    const defense = E.defenseOf(state, target.id, false).total;
    for (const id of orderIds) {
      const force = E.forceOf(state, { kind: id, owner: seat, area: from.id, to: target.id });
      if (force > defense) return id;
    }
    return orderIds.at(-1);
  }

  /*
    Ход бота. state — полная партия (движок honest про неё), но кандидаты
    считаются только по visible — виду партии для этого места. Так ошибиться
    и подсмотреть чужую силу можно только нарочно, поменяв эту функцию.
  */
  function pick(state, seat) {
    const visible = E.visibleStateFor(state, seat);
    if (visible.turn !== seat) return null;
    const list = candidates(state, seat, visible);
    if (!list.length) return null;
    list.sort((a, b) => b.score - a.score);
    return list[0];
  }

  window.KingdomsBots = { pick, candidates, areaWeight, threatCount };
}());
