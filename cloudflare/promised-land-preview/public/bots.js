// bots.js — соперники для игры за одним столом.
//
// Пороговые правила, без просчёта наперёд: этого хватает, чтобы бот покупал
// осмысленно, достраивал собранные уделы и не разорялся на первом же круге.
// Уровни отличаются долей серебра, которую бот готов потратить, и тем,
// смотрит ли он на наследие помимо аренды.

window.PromisedLandBots = (() => {
  'use strict';

  const B = window.PromisedLandBoard;
  const E = window.PromisedLandEngine;

  const LEVELS = {
    youth:  { name: 'Отрок',       greed: 0.40, legacy: false },
    elder:  { name: 'Старейшина',  greed: 0.60, legacy: true },
    scribe: { name: 'Книжник',     greed: 0.75, legacy: true },
  };

  /** Достраивает ли этот удел группу, которая уже почти собрана. */
  function completesGroup(state, player, n) {
    const spec = B.BOARD[n];
    if (spec.kind !== 'plot') return false;
    const cells = B.groupCells(spec.group);
    const mine = cells.filter((i) => state.cells[i].owner === player.id).length;
    return mine === cells.length - 1;
  }

  function wantsToBuy(state, player, n, profile) {
    const spec = B.BOARD[n];
    if (completesGroup(state, player, n)) return true;
    if (spec.kind === 'road' || spec.kind === 'well') {
      return player.silver >= spec.price * 2;
    }
    return spec.price <= player.silver * profile.greed;
  }

  /**
   * Один шаг бота. Возвращает название сделанного действия: интерфейс зовёт
   * шаги по таймеру, чтобы ход было видно, а не мгновенную телепортацию.
   * rng приходит параметром — тем же, каким играет вся партия: иначе счётный
   * прогон перестанет быть воспроизводимым ровно там, где он нужнее всего.
   */
  function step(state, rng = Math.random) {
    const player = E.current(state);
    const profile = LEVELS[player.botLevel] || LEVELS.elder;

    if (state.phase === 'roll') return E.roll(state, rng) && 'roll';

    /*
      Счёт оплачивается сразу: за соперника под управлением игры решать нечего,
      а человеку это же место отдаёт выбор — заплатить, продать что-нибудь или
      пойти в наём. Порядок тот же, что выбрал бы осторожный игрок: сперва из
      кошелька, потом с распродажей, и лишь потом наём.
    */
    if (state.pending && state.pending.type === 'pay') {
      if (E.settle(state)) return 'pay';
      if (E.settle(state, true)) return 'sell-pay';
      return E.serve(state) && 'serve';
    }

    if (state.pending && state.pending.type === 'buy') {
      const n = state.pending.cell;
      return (wantsToBuy(state, player, n, profile) ? E.buy(state) : E.decline(state)) && 'buy';
    }

    if (state.phase === 'act') {
      // Сначала выкуп: он даёт больше наследия, чем любая постройка, и
      // обходится дешевле, пока долг невелик.
      if (profile.legacy) {
        const debtor = state.players.find((p) => p.debt > 0 && p.id !== player.id
          && E.canRedeem(state, player, p.id) && player.silver - p.debt > 400);
        if (debtor && E.redeem(state, debtor.id)) return 'redeem';
      }

      // Застройка: пока остаётся запас на пару чужих аренд.
      const buildable = state.cells
        .map((cell, n) => n)
        .filter((n) => E.canBuild(state, player, n)
          && player.silver - B.GROUPS[B.BOARD[n].group].build > 300)
        .sort((a, b) => B.BOARD[b].price - B.BOARD[a].price);
      if (buildable.length && E.build(state, buildable[0])) return 'build';

      // В субботний год платы нет, и лишнее серебро обращается в наследие.
      if (profile.legacy && state.sabbath) {
        const spot = state.cells
          .map((cell, n) => n)
          .find((n) => E.canAltar(state, player, n) && player.silver > 700);
        if (spot !== undefined && E.altar(state, spot)) return 'altar';
      }

      return E.endTurn(state) && 'end';
    }

    return false;
  }

  return { LEVELS, step };
})();
