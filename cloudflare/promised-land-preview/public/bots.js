// bots.js — соперники для игры за одним столом и по сети.
//
// Просчёта наперёд здесь нет: перебирать ходы на телефоне дорого, а в этой игре
// и незачем — жребий решает больше, чем любой план на два хода вперёд. Всё
// умение соперника в трёх решениях, и каждое из них проверено счётом на
// тысяче двухстах партиях против прежнего поколения (check-promised-land-bots).
//
//   * Сколько держать про запас. Прежние держали зашитое число — триста
//     сиклей, — и разорялись на собственной покупке: вставали на чужую башню,
//     где просят полторы тысячи. Теперь запас считается по доске: во столько-то
//     худших чужих арен, какие на ней сейчас есть. И у запаса есть потолок —
//     без него к седьмому году соперник переставал и покупать, и строить,
//     берёг серебро от разорения, которого уже не могло случиться.
//
//   * Где строить. Прежние строили на самом дорогом уделе. Теперь — там, где
//     ступень окупится быстрее: прирост платы на вложенный сикль.
//
//   * Когда ставить жертвенник. Он даёт три очка наследия — столько же, сколько
//     полторы тысячи серебра, — но отменяет плату с удела навсегда. Прежние
//     ставили его наугад в субботний год. Теперь он ставится тогда, когда плата
//     всё равно уже не собирается: в субботний год и в последний перед юбилеем,
//     начиная с самого дешёвого цвета.
//
// А покупка осталась простой, и это тоже вывод счёта, а не лень: см. LEVELS.

window.PromisedLandBots = (() => {
  'use strict';

  const B = window.PromisedLandBoard;
  const E = window.PromisedLandEngine;

  /*
    Уровни. Ручка здесь одна, и она настоящая: во сколько худших чужих арен
    соперник держит запас. Всё остальное — следствие.

    Оценки удела в баллах тут нет, и это не упущение. Она была написана — доход
    по лестнице, надежда собрать цвет, надбавка за перехват, — и счёт показал,
    что она не меняет ничего: тысяча двести партий с порогом 0.4 и с порогом 0
    дали в точности один и тот же итог. Причина простая и лежит в правилах: в
    юбилей каждый удел, доживший в твоих руках, — очко наследия сам по себе.
    Значит, отказ от покупки не бережёт партию, а проигрывает её, и выбирать
    не из чего: берут всё, на что хватает сверх запаса. Порог с высоким
    значением проверен отдельно — соперник перестаёт покупать и выигрывает
    16% партий вместо 52%.
  */
  const LEVELS = {
    youth:  { name: 'Отрок',       reserve: 0.3, legacy: false },
    elder:  { name: 'Старейшина',  reserve: 0.6, legacy: true },
    scribe: { name: 'Книжник',     reserve: 0.9, legacy: true },
  };

  /*
    Худшая плата, на которую можно наскочить. Считается по всей доске, а не по
    соседним клеткам: круг замкнут, и через три хода соперник окажется где
    угодно. Это и есть та сумма, без которой нельзя выходить из хода, — она же
    и мера всему остальному: удел, стоящий трёх таких аренд, дорог, а стоящий
    половины — дёшев, независимо от того, сколько сиклей в кошельке.
  */
  function worstRent(state, player) {
    let worst = 0;
    for (let n = 0; n < B.BOARD.length; n += 1) {
      const cell = state.cells[n];
      if (!cell.owner || cell.owner === player.id) continue;
      const rent = E.rentFor(state, n, 7);
      if (rent > worst) worst = rent;
    }
    // Пустая доска — не повод тратить всё: первая же чужая покупка её наполнит.
    return Math.max(worst, 60);
  }

  /*
    Потолок запаса — не осторожность, а мера осторожности.

    Без него запас растёт вместе с доской: к седьмому году на чужих уделах
    стоят башни, худшая аренда переваливает за тысячу, и соперник перестаёт
    и покупать, и строить — бережёт серебро от разорения, которого уже не
    будет, потому что разоряться не на чем. Счётом это видно прямо: без
    потолка на семилетней партии он ставил вдвое меньше ступеней и приходил
    к юбилею с наследием 23 против 27 у прежнего.

    Поэтому запас растёт только до предела. Дальше разумнее не беречь, а
    вкладывать: ступень и жертвенник считаются в наследие сразу, а серебро —
    по очку за пятьсот.
  */
  const RESERVE_CAP = 420;

  const reserveOf = (state, player, profile) =>
    Math.min(Math.round(worstRent(state, player) * profile.reserve) + 80, RESERVE_CAP);

  /** Сколько в цвете уже моего и сколько чужого. */
  function groupCount(state, player, group) {
    const cells = B.groupCells(group);
    let mine = 0;
    let theirs = 0;
    for (const i of cells) {
      const owner = state.cells[i].owner;
      if (!owner) continue;
      if (owner === player.id) mine += 1;
      else theirs += 1;
    }
    return { mine, theirs, size: cells.length };
  }

  /*
    Покупка. Условие одно: после неё должно остаться на чужую аренду. Удел,
    достраивающий цвет, берётся и в долг у самого себя — он открывает стройку,
    и следующий ход меняет всю партию.
  */
  function wantsToBuy(state, player, n, profile) {
    const spec = B.BOARD[n];
    const { mine, size } = groupCount(state, player, spec.group);
    const closes = spec.kind === 'plot' && mine === size - 1;
    const reserve = reserveOf(state, player, profile);
    const keep = closes ? Math.round(reserve / 3) : reserve;
    return player.silver - spec.price >= keep;
  }

  /*
    Где строить. Не «где дороже удел», а где ступень окупится быстрее: прирост
    платы на вложенный сикль. Лестница у дешёвых цветов круче, и соперник,
    строивший по цене удела, годами вкладывал в «Отцов» то, что вернулось бы
    втрое быстрее в Негеве.
  */
  function bestBuild(state, player) {
    let best = -1;
    let bestGain = 0;
    for (let n = 0; n < B.BOARD.length; n += 1) {
      if (!E.canBuild(state, player, n)) continue;
      const spec = B.BOARD[n];
      const ladder = B.ladderOf(spec);
      const level = state.cells[n].level;
      const cost = B.GROUPS[spec.group].build;
      const gain = (ladder[level + 1] - ladder[level]) / cost;
      if (gain > bestGain) { bestGain = gain; best = n; }
    }
    return best;
  }

  /**
   * Один шаг соперника. Возвращает название сделанного действия: интерфейс
   * зовёт шаги по таймеру, чтобы ход было видно, а не мгновенную телепортацию.
   * rng приходит параметром — тем же, каким играет вся партия: иначе счётный
   * прогон перестанет быть воспроизводимым ровно там, где он нужнее всего.
   */
  function step(state, rng = Math.random) {
    const player = E.current(state);
    const profile = LEVELS[player.botLevel] || LEVELS.elder;
    const reserve = reserveOf(state, player, profile);

    if (state.phase === 'roll') {
      /*
        Выкуп из темницы. Раньше порог был зашит числом — шестьсот сиклей, — и
        от положения на доске не зависел вовсе. Теперь он считается: сидеть
        стоит трёх ходов, а ход стоит того, что за него можно сделать. Пока
        своя стройка открыта или на доске есть что покупать, три хода дороже
        сотни; когда покупать нечего и строить некуда, дешевле подождать.
      */
      if (E.canBail(state, player) && player.silver - B.BAIL > reserve) {
        const worthLeaving = bestBuild(state, player) >= 0
          || state.cells.some((cell, n) => !cell.owner && B.OWNABLE.has(B.BOARD[n].kind));
        if (worthLeaving && E.bail(state)) return 'bail';
      }
      return E.roll(state, rng) && 'roll';
    }

    // Карта только выпала — её надо принять. Человеку здесь показывают, как она
    // вылетает из колоды и переворачивается; боту показывать нечего.
    if (state.pending && state.pending.type === 'card') return E.takeCard(state, rng) && 'card';

    /*
      Обещанная ступень. Держать слово стоит, когда ступень дешевле, чем плата,
      которую иначе придётся отдавать по этой земле снова и снова. Считается
      так же, как всё остальное: через запас.
    */
    if (state.pending && state.pending.type === 'promise') {
      if (player.silver - state.pending.cost > reserve && E.keepPromise(state)) return 'promise';
      return E.breakPromise(state) && 'break';
    }

    if (state.pending && state.pending.type === 'pay') {
      /*
        Договор вместо платы. Ступень уходит хозяину земли — значит, дороже
        становится его удел, а не свой. Идти на это стоит только тогда, когда
        иначе пришлось бы отдать больше деньгами, и когда запас это выдержит.
      */
      const deal = state.pending.deal;
      const straight = state.pending.amount;
      if (deal && player.silver - deal.build - deal.half > reserve) {
        if (deal.build + deal.half < straight && E.dealBuild(state, true)) return 'deal-half';
        if (deal.build < straight * 0.8 && E.dealBuild(state, false)) return 'deal-barter';
      }
      if (E.settle(state)) return 'pay';
      /*
        Заложить дешевле, чем продать: заложенное можно выкупить, проданное —
        нет. Поэтому залог идёт раньше распродажи, и закладывается самый дешёвый
        из подходящих уделов — тот, которого не так жалко.
      */
      const pledges = E.pledgeable(state, player, state.pending.amount);
      if (pledges.length && E.pledge(state, pledges[0])) return 'pledge';
      if (E.settle(state, true)) return 'sell-pay';
      return E.serve(state) && 'serve';
    }

    if (state.pending && state.pending.type === 'buy') {
      const n = state.pending.cell;
      return (wantsToBuy(state, player, n, profile) ? E.buy(state) : E.decline(state)) && 'buy';
    }

    if (state.phase === 'act') {
      // Сначала выкуп человека из наёма: пять очков наследия — больше, чем даёт
      // любая постройка, и дешевле, пока долг невелик.
      if (profile.legacy) {
        const debtor = state.players.find((p) => p.debt > 0 && p.id !== player.id
          && E.canRedeem(state, player, p.id) && player.silver - p.debt > reserve);
        if (debtor && E.redeem(state, debtor.id)) return 'redeem';
      }

      // Выкуп своего заложенного удела — прежде новой стройки: пока он в залоге,
      // плату за проход по нему берёт кредитор.
      const mine = E.pledgesOf(state, player.id)
        .filter((n) => E.canRedeemPledge(state, player, n)
          && player.silver - state.cells[n].pledge.debt > reserve);
      if (mine.length && E.redeemPledge(state, mine[0])) return 'unpledge';

      /*
        Стройка. Ступеней за ход ставится столько, сколько выдержит запас, —
        по одной за шаг, чтобы на доске это было видно. Раньше строилась одна
        и самая дорогая; теперь — самая окупаемая, и пока есть на что.
      */
      const spot = bestBuild(state, player);
      if (spot >= 0) {
        const cost = B.GROUPS[B.BOARD[spot].group].build;
        /*
          На стройку запас смотрит мягче, чем на покупку, и потолок ему тот же,
          что был у прежних соперников. Ступень — это и плата вперёд, и очко
          наследия сразу; беречь от неё серебро дороже, чем потратить.
        */
        if (player.silver - cost > Math.min(reserve, 320) && E.build(state, spot)) return 'build';
      }

      /*
        Жертвенник. Он стоит столько же, сколько ступень в том же цвете —
        пятьдесят сиклей в Негеве, — и даёт три очка наследия. Очко за серебро
        стоит пятисот. То есть в дешёвом цвете он обращает серебро в очки в
        тридцать раз выгоднее кошелька. Цена одна: плата с этого удела больше
        не берётся никогда.

        Отсюда и два разных правила. Пока платят — жертвенник ставится только
        там, где платы всё равно не ждут: в цвете, который своим уже не станет.
        А в субботний год платы нет ни с чего, и цена жертвенника падает до
        нуля: в этот год он ставится на всё, что можно, начиная с самого
        дешёвого цвета. Тот же год — последний перед юбилеем, и серебро,
        не обращённое в очки, так и останется серебром по очку за пятьсот.
      */
      if (profile.legacy) {
        /*
          Год, когда плату уже почти не собрать: субботний — платы нет вовсе, и
          последний перед юбилеем — её осталось на один круг. В режиме «до
          последнего» такого года нет, там плата нужна до конца.
        */
        const free = state.sabbath
          || (state.mode !== 'last' && state.year >= state.years);
        const spots = [];
        if (free) {
          for (let n = 0; n < B.BOARD.length; n += 1) {
            if (E.canAltar(state, player, n)) spots.push(n);
          }
        }
        spots.sort((a, b) => B.GROUPS[B.BOARD[a].group].build - B.GROUPS[B.BOARD[b].group].build);
        const spot = spots[0];
        if (spot !== undefined) {
          const cost = B.GROUPS[B.BOARD[spot].group].build;
          const cushion = free ? Math.min(reserve, 150) : reserve;
          if (player.silver - cost > cushion && E.altar(state, spot)) return 'altar';
        }
      }

      return E.endTurn(state) && 'end';
    }

    return false;
  }

  return { LEVELS, step, reserveOf };
})();
