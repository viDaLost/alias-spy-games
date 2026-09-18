// «Двенадцать колен» — соперники от игры.
//
// Бот здесь не считает вероятностей и не помнит сброса: он играет так, как
// играет человек за столом, и ошибается там же, где ошибается человек, — иногда
// забывает сказать «Шабат». Это не слабость, а условие: соперник, который
// никогда не забывает, отнимает у правила «перебей соседа» всякий смысл, а
// правило это — половина веселья.
//
// Два уровня. «Отрок» играет прямо: что подошло, тем и пошёл. «Старейшина»
// смотрит на соседа: если тому осталась пара карт, он бьёт действием, а не
// сбрасывает цифру, и бережёт жребий на чёрный день.

(function () {
  'use strict';

  const R = window.TwelveTribesRules;
  const E = window.TwelveTribesEngine;

  /** Какого стана у бота больше всего — тот он и назовёт по жребию. */
  function richestCamp(hand) {
    const count = new Map(R.CAMP_IDS.map((id) => [id, 0]));
    for (const card of hand) {
      if (card.camp && count.has(card.camp)) count.set(card.camp, count.get(card.camp) + 1);
    }
    let best = R.CAMP_IDS[0];
    for (const [id, many] of count) if (many > count.get(best)) best = id;
    return best;
  }

  /*
    Цена хода для бота. Чем больше, тем охотнее он так пойдёт.

    Три соображения, и все три — человеческие:
      * дорогая карта на руке жжётся: у проигравшего её сосчитают в очки;
      * соседу с двумя картами лучше помешать, чем сбросить лишнюю единицу;
      * жребий и плен — последний довод, их держат до тех пор, пока есть чем
        ходить иначе.
  */
  function weigh(state, seat, card, level) {
    const kind = R.KINDS[card.kind];
    const tight = state.players[E.nextSeat(state, seat)].hand.length <= 2;
    let value = kind.wild ? 0 : 10;
    if (card.kind === 'number') value += card.rank;
    else value += 24;
    if (level === 'elder') {
      if (tight && (card.kind === 'sabbath' || card.kind === 'journey')) value += 40;
      if (tight && card.kind === 'exile') value += 30;
      // Свой стан менять незачем, пока в руке его много: ход по стану дешевле
      // жребия и не тратит карту, которой можно спастись позже.
      if (card.camp === state.camp) value += 6;
    }
    return value;
  }

  /**
   * Чем ходить. Возвращает { index, camp } или null — «беру карту».
   * Стан для жребия называется здесь же: разметка ботов не спрашивает.
   */
  function pick(state, seat) {
    const player = state.players[seat];
    const moves = E.legalMoves(state, seat);
    if (!moves.length) return null;
    const level = player.botLevel || 'elder';
    let best = moves[0];
    let bestValue = -Infinity;
    for (const index of moves) {
      const value = weigh(state, seat, player.hand[index], level);
      if (value > bestValue) { bestValue = value; best = index; }
    }
    const card = player.hand[best];
    return { index: best, camp: R.KINDS[card.kind].wild ? richestCamp(player.hand) : card.camp };
  }

  /*
    Забывчивость. «Отрок» говорит «Шабат» в трёх случаях из четырёх, а
    «Старейшина» — в девяти из десяти. Ноль был бы издевательством, единица —
    скукой: правило, которое никогда не срабатывает, лучше убрать вовсе.
  */
  const remembers = (level, random) => random() < (level === 'elder' ? 0.9 : 0.75);

  /** Перебивает ли бот соседа, забывшего сказать «Шабат». Отрок замечает не всегда. */
  const notices = (level, random) => random() < (level === 'elder' ? 0.85 : 0.5);

  window.TwelveTribesBots = { pick, richestCamp, remembers, notices };
}());
