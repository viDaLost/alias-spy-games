// engine.js — правила «Земли обетованной».
//
// Чистый модуль: ни DOM, ни сети, ни Math.random(), ни Date.now(). Случайность
// приходит параметром rng. Это не педантизм: те же правила должны будут
// работать внутри Durable Object, где кости бросает сервер, а иначе клиент
// бросает себе что хочет и вся экономика — фикция. Заодно чистый движок можно
// прогнать две тысячи партий без браузера и посмотреть, сколько они длятся.
//
// Состояние меняется на месте и возвращается вместе с событиями — так же
// устроен движок «Квартета» в этом же репозитории.

window.PromisedLandEngine = (() => {
  'use strict';

  const B = window.PromisedLandBoard;
  const DECKS = window.PromisedLandCards;
  const SIZE = B.BOARD.length;

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const activePlayers = (state) => state.players.filter((p) => !p.out);

  function shuffle(items, rng) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function log(state, text) {
    state.log.push({ year: state.year, text });
    if (state.log.length > 120) state.log.splice(0, state.log.length - 120);
  }

  // ————————————————————————————————————————————————— создание партии

  /*
    Два способа кончить партию. Обычный — юбилей: объявленное число лет, и
    считается наследие. Второй — «до последнего»: лет нет, партия идёт, пока за
    столом не останется один платёжеспособный. В нём нет и субботнего года:
    прощение долгов там означало бы, что партия не кончится никогда.
  */
  function createGame({ players, years = 5, mode = 'jubilee', rng = Math.random }) {
    const last = mode === 'last';
    const state = {
      version: 1,
      status: 'playing',
      mode: last ? 'last' : 'jubilee',
      years,
      year: 1,
      sabbath: !last && years === 1,
      treasury: 0,
      turn: 0,
      phase: 'roll',
      dice: [0, 0],
      doubles: 0,
      pending: null,
      log: [],
      players: players.map((p, i) => ({
        id: 'p' + i,
        name: p.name,
        isBot: Boolean(p.isBot),
        botLevel: p.botLevel || 'elder',
        pos: 0,
        silver: B.START_SILVER,
        heritage: 0,
        tithePaid: 0,
        steps: 0,          // построенных ступеней — для наследия навсегда
        altars: 0,
        offerings: 0,
        hospitality: 0,
        redeemed: 0,
        prison: 0,
        keys: 0,
        passed: false,     // прошёл «Исход» в этом году
        tribute: 0,        // подать за год, накопленная к следующему ходу
        promises: [],      // кому обещана ступень по уговору
        servantOf: null,
        debt: 0,
        extraRoll: false,
        skip: false,
        noRent: false,
        out: false,
      })),
      cells: B.BOARD.map(() => ({ owner: null, level: 0, altar: false, heldFrom: null, pledge: null })),
      decks: {
        providence: shuffle(DECKS.PROVIDENCE.map((c) => c.id), rng),
        mercy: shuffle(DECKS.MERCY.map((c) => c.id), rng),
      },
      discard: { providence: [], mercy: [] },
    };
    log(state, `Первый год. У каждого по ${B.START_SILVER} сиклей.`);
    return state;
  }

  const current = (state) => state.players[state.turn];

  // ————————————————————————————————————————————————— деньги

  /** Сколько стоит всё имущество игрока, если продать его за полцены. */
  function liquidValue(state, player) {
    let total = player.silver;
    state.cells.forEach((cell, n) => {
      if (cell.owner !== player.id) return;
      const spec = B.BOARD[n];
      total += Math.floor(spec.price / 2);
      if (spec.kind === 'plot') total += cell.level * Math.floor(B.GROUPS[spec.group].build / 2);
    });
    return total;
  }

  /*
    Вынужденная распродажа. Продаётся самое дешёвое: сначала ступени поселений
    от дешёвых уделов, потом сами уделы по возрастанию цены. Так игрок дольше
    держится за дорогое, ради чего он его и покупал.
  */
  function raiseFunds(state, player, need) {
    const steps = [];
    const plots = [];
    state.cells.forEach((cell, n) => {
      if (cell.owner !== player.id) return;
      const spec = B.BOARD[n];
      if (spec.kind === 'plot' && cell.level > 0) {
        steps.push({ n, price: Math.floor(B.GROUPS[spec.group].build / 2) });
      }
      plots.push({ n, price: Math.floor(spec.price / 2) });
    });
    steps.sort((a, b) => a.price - b.price);
    plots.sort((a, b) => a.price - b.price);

    for (const item of steps) {
      while (player.silver < need && state.cells[item.n].level > 0) {
        state.cells[item.n].level -= 1;
        player.silver += item.price;
        log(state, `${player.name} разбирает постройку в «${B.BOARD[item.n].name}» за ${item.price}`);
      }
      if (player.silver >= need) return true;
    }
    for (const item of plots) {
      if (player.silver >= need) return true;
      const cell = state.cells[item.n];
      if (cell.owner !== player.id || cell.level > 0) continue;
      cell.owner = null;
      cell.altar = false;
      player.silver += item.price;
      log(state, `${player.name} отдаёт «${B.BOARD[item.n].name}» за ${item.price}`);
    }
    return player.silver >= need;
  }

  /*
    Наёмник вместо банкрота (Лев. 25:39-41). Разорившийся не выбывает: он идёт
    в наём к тому, кому должен. Уделы переходят кредитору до юбилея, половина
    урожая гасит долг, плату с наёмника не берут — а в юбилей он свободен, и
    земля возвращается. Ради этого правила игра и строилась: иначе
    проигравший встаёт из-за стола и полчаса смотрит, как играют другие.
  */
  function becomeServant(state, player, creditor, debt) {
    player.servantOf = creditor ? creditor.id : null;
    player.debt = Math.max(0, debt);
    state.cells.forEach((cell) => {
      if (cell.owner !== player.id) return;
      cell.heldFrom = player.id;
      cell.owner = creditor ? creditor.id : null;
    });
    player.silver = 0;
    log(state, creditor
      ? `${player.name} идёт в наём к ${creditor.name}: долг ${player.debt}`
      : `${player.name} разорён и ждёт юбилея`);
  }

  /*
    Залог. Платить нечем, но земля есть — удел уходит кредитору, и счёт закрыт.
    Потом, когда серебро появится, удел выкупается за ту самую сумму долга.
    Это не продажа: проданное не вернётся, а заложенное ждёт. Закладывать можно
    удел не дешевле долга — иначе шестидесятисиклевым клочком закрывался бы
    любой счёт, и плата за проход перестала бы что-либо значить.
  */
  function pledgeable(state, player, amount) {
    const out = [];
    state.cells.forEach((cell, n) => {
      if (cell.owner !== player.id || cell.pledge || cell.heldFrom) return;
      if (!B.OWNABLE.has(B.BOARD[n].kind)) return;
      if (B.BOARD[n].price < amount) return;
      out.push(n);
    });
    return out.sort((a, b) => B.BOARD[a].price - B.BOARD[b].price);
  }

  function pledge(state, n) {
    const pending = state.pending;
    if (!pending || pending.type !== 'pay') return false;
    const player = current(state);
    if (!pledgeable(state, player, pending.amount).includes(n)) return false;
    const target = payee(state);
    const cell = state.cells[n];
    cell.pledge = { by: player.id, debt: pending.amount };
    cell.owner = target && target !== 'treasury' ? target.id : null;
    const to = target && target !== 'treasury' ? target.name : 'казна';
    log(state, `${player.name} закладывает «${B.BOARD[n].name}» за ${pending.amount} (${to})`);
    state.pending = {
      type: 'note',
      title: B.BOARD[n].name,
      text: `Удел в залоге за ${pending.amount} сиклей. Выкупите его, когда появится серебро.`,
    };
    state.phase = 'act';
    return true;
  }

  /** Свои заложенные уделы: их можно выкупить назад. */
  function pledgesOf(state, playerId) {
    const out = [];
    state.cells.forEach((cell, n) => {
      if (cell.pledge && cell.pledge.by === playerId) out.push(n);
    });
    return out;
  }

  function canRedeemPledge(state, player, n) {
    const cell = state.cells[n];
    return Boolean(cell && cell.pledge && cell.pledge.by === player.id
      && player.silver >= cell.pledge.debt);
  }

  function redeemPledge(state, n) {
    const player = current(state);
    if (state.phase === 'decide' || !canRedeemPledge(state, player, n)) return false;
    const cell = state.cells[n];
    const amount = cell.pledge.debt;
    const holder = state.players.find((p) => p.id === cell.owner);
    player.silver -= amount;
    if (holder) holder.silver += amount;
    else state.treasury += amount;
    cell.owner = player.id;
    cell.pledge = null;
    log(state, `${player.name} выкупает «${B.BOARD[n].name}» за ${amount}`);
    return true;
  }

  /** В юбилей заложенное возвращается домой — как и земля наёмника. */
  function returnPledges(state, reason) {
    let back = 0;
    state.cells.forEach((cell) => {
      if (!cell.pledge) return;
      cell.owner = cell.pledge.by;
      cell.pledge = null;
      back += 1;
    });
    if (back) log(state, `${reason}: заложенное возвращается (${back})`);
  }

  function freeServants(state, reason) {
    for (const player of state.players) {
      if (!player.servantOf && !player.debt) continue;
      player.servantOf = null;
      player.debt = 0;
      log(state, `${player.name} свободен: ${reason}`);
    }
    state.cells.forEach((cell) => {
      if (!cell.heldFrom) return;
      cell.owner = cell.heldFrom;
      cell.heldFrom = null;
    });
  }

  /*
    Счёт игроку. Раньше плата списывалась молча: игрок видел уже уменьшившееся
    серебро и должен был догадаться, за что. Теперь счёт выставляется и ждёт —
    заплатить, продать что-нибудь и заплатить или пойти в наём решает человек.
    Соперники под управлением игры платят сразу: за них решать нечего.
  */
  /*
    Разорившийся — это не только наёмник. Тот, кто не смог заплатить казне,
    остаётся без хозяина, но с долгом: `servantOf` у него пуст. Считать такого
    платёжеспособным значит выставлять ему счёт за счётом до скончания века —
    и в режиме «до последнего» партия на этом и застревала.
  */
  const ruined = (player) => Boolean(player.servantOf) || player.debt > 0;

  function requestPayment(state, player, amount, target, title, text) {
    if (amount <= 0 || ruined(player)) return;
    state.pending = {
      type: 'pay',
      amount,
      toId: target && target !== 'treasury' && target !== 'each' ? target.id : null,
      toTreasury: target === 'treasury',
      toEach: target === 'each',
      title,
      text,
    };
    state.phase = 'settle';
  }

  /** Кому уходит то, что выставлено счётом. */
  const payee = (state) => {
    const pending = state.pending;
    if (!pending) return null;
    if (pending.toEach) return 'each';
    if (pending.toTreasury) return 'treasury';
    return state.players.find((p) => p.id === pending.toId) || null;
  };

  /**
   * Заплатить по счёту. `sell` — сперва распродать постройки и уделы: без него
   * платёж не тронет имущество, и не хватившему предложат наём.
   */
  function settle(state, sell = false) {
    const pending = state.pending;
    if (!pending || pending.type !== 'pay') return false;
    const player = current(state);
    if (sell) raiseFunds(state, player, pending.amount);
    if (player.silver < pending.amount) return false;
    if (pending.each) {
      // Счёт всем сразу: у плательщика уходит целое, а приходит по доле.
      player.silver -= pending.amount;
      for (const other of activePlayers(state)) {
        if (other.id !== player.id) other.silver += pending.each;
      }
    } else {
      pay(state, player, pending.amount, payee(state));
    }
    log(state, `${player.name} платит ${pending.amount}: ${pending.title}`);
    /*
      Счёт «за должника» — не просто платёж: на эту же сумму уменьшается чужой
      долг, а погашенный целиком освобождает наёмника. Дело доводится здесь,
      при уплате: до неё ничего не случилось.
    */
    if (pending.debtor) {
      const debtor = state.players.find((p) => p.id === pending.debtor.id);
      if (debtor && debtor.debt > 0) {
        debtor.debt -= pending.debtor.amount;
        if (debtor.debt <= 0) releaseServant(state, debtor);
      }
    }
    state.pending = { type: 'note', title: pending.title, text: pending.text, art: pending.art };
    state.phase = 'act';
    return true;
  }

  /**
   * Принять выпавшую карту: вот теперь она срабатывает. Если карта требует
   * серебра, вместо списания выставляется счёт — платит игрок, а не игра.
   */
  function takeCard(state, rng = Math.random) {
    const pending = state.pending;
    if (!pending || pending.type !== 'card') return false;
    const player = current(state);
    const source = pending.deck === 'providence' ? DECKS.PROVIDENCE : DECKS.MERCY;
    const card = source.find((item) => item.id === pending.cardId);
    if (!card) return false;
    state.pending = null;
    const { notes, bill } = applyCard(state, player, card, rng);
    log(state, `${player.name}: ${card.text}`);
    // Карта увела на другую клетку — что там, уже решено разбором приземления.
    if (state.pending) return true;
    if (bill.amount > 0) {
      const target = bill.to === 'treasury' ? 'treasury'
        : state.players.find((p) => p.id === bill.to);
      requestPayment(state, player, bill.amount,
        bill.to === 'each' ? 'each' : (target || 'treasury'), pending.title, card.text);
      if (state.pending) {
        state.pending.art = pending.art;
        state.pending.ref = card.ref;
        if (bill.debtor) state.pending.debtor = bill.debtor;
        if (bill.each) state.pending.each = bill.each;
        return true;
      }
    }
    state.pending = {
      type: 'note', title: pending.title, art: pending.art,
      text: card.text, ref: card.ref, extra: notes.join(', '),
    };
    state.phase = 'act';
    return true;
  }

  /**
   * Договор «строю и плачу половину»: гость ставит хозяину ступень за свой
   * счёт и отдаёт половину платы. Хозяину достаётся земля дороже прежней,
   * гостю — половина счёта; наследие за ступень идёт тому, кто её оплатил.
   */
  function dealBuild(state, half = true) {
    const pending = state.pending;
    if (!pending || pending.type !== 'pay' || !pending.deal) return false;
    const player = current(state);
    const { cell: n, build, ownerId } = pending.deal;
    const owner = state.players.find((p) => p.id === ownerId);
    const owed = half ? pending.deal.half : 0;
    if (!owner || player.silver < build + owed) return false;
    if (!canBuild(state, owner, n, true)) return false;

    player.silver -= build;
    state.cells[n].level += 1;
    player.steps += 1;
    player.heritage += 1;
    if (half) {
      player.silver -= owed;
      owner.silver += owed;
      log(state, `${player.name} строит ступень в «${B.BOARD[n].name}» за ${build} `
        + `и платит половину: ${owed}`);
      state.pending = {
        type: 'note', title: B.BOARD[n].name,
        text: `Ступень поставлена за ваш счёт, платы ушла половина — ${owed}.`,
      };
    } else {
      owner.promises.push(player.id);
      log(state, `${player.name} строит ступень в «${B.BOARD[n].name}» за ${build}; `
        + `${owner.name} обязан ответить тем же`);
      state.pending = {
        type: 'note', title: B.BOARD[n].name,
        text: `Ступень поставлена за ваш счёт, платы нет. ${owner.name} построит вам `
          + 'ступень, когда встанет на вашу землю.',
      };
    }
    state.phase = 'act';
    return true;
  }

  /** Исполнить обещание: ступень на земле того, кому обещали. */
  function keepPromise(state) {
    const pending = state.pending;
    if (!pending || pending.type !== 'promise') return false;
    const player = current(state);
    const owner = state.players.find((p) => p.id === pending.toId);
    if (!owner || player.silver < pending.cost) return false;
    if (!canBuild(state, owner, pending.cell, true)) return false;
    player.silver -= pending.cost;
    state.cells[pending.cell].level += 1;
    player.steps += 1;
    player.heritage += 1;
    const at = player.promises.indexOf(owner.id);
    if (at >= 0) player.promises.splice(at, 1);
    log(state, `${player.name} держит слово: ступень в «${B.BOARD[pending.cell].name}» `
      + `за ${pending.cost}`);
    state.pending = {
      type: 'note', title: B.BOARD[pending.cell].name,
      text: 'Слово сдержано: ступень поставлена, платы за проход нет.',
    };
    state.phase = 'act';
    return true;
  }

  /**
   * Откупиться от обещания деньгами: платится плата за проход, как если бы
   * уговора не было, а обещание остаётся висеть до следующего раза.
   */
  function breakPromise(state) {
    const pending = state.pending;
    if (!pending || pending.type !== 'promise') return false;
    const player = current(state);
    const owner = state.players.find((p) => p.id === pending.toId);
    // Плата считается по тому же жребию, каким сюда и пришли.
    const rent = rentFor(state, pending.cell, (state.dice[0] || 3) + (state.dice[1] || 4));
    state.pending = null;
    state.phase = 'act';
    if (rent > 0 && owner) {
      requestPayment(state, player, rent, owner, B.BOARD[pending.cell].name,
        `Слово отложено: плата ${rent} сиклей ушла ${owner.name}.`);
    }
    if (!state.pending) {
      state.pending = {
        type: 'note', title: B.BOARD[pending.cell].name,
        text: 'Слово отложено до следующего раза.',
      };
    }
    return true;
  }

  /** Пойти в наём вместо уплаты (Лев. 25:39-41). */
  function serve(state) {
    const pending = state.pending;
    if (!pending || pending.type !== 'pay') return false;
    const player = current(state);
    const target = payee(state);
    const creditor = target && target !== 'treasury' && target !== 'each' ? target : null;
    const short = pending.amount - player.silver;
    if (creditor) creditor.silver += player.silver;
    else state.treasury += player.silver;
    becomeServant(state, player, creditor, short);
    state.pending = { type: 'note', title: pending.title, text: 'Платить нечем — вы идёте в наём.' };
    state.phase = 'act';
    return true;
  }

  /** Платёж. Не хватило — распродажа, а если и её мало — наём. */
  function pay(state, player, amount, target) {
    if (amount <= 0) return;
    if (ruined(player)) return;                   // с разорённого взять нечего
    if (player.silver < amount) raiseFunds(state, player, amount);
    if (player.silver < amount) {
      const short = amount - player.silver;
      if (target && target !== 'treasury') target.silver += player.silver;
      else if (target === 'treasury') state.treasury += player.silver;
      becomeServant(state, player, target && target !== 'treasury' ? target : null, short);
      return;
    }
    player.silver -= amount;
    if (target === 'treasury') state.treasury += amount;
    else if (target) target.silver += amount;
  }

  // ————————————————————————————————————————————————— аренда

  function ownedCount(state, ownerId, kind) {
    let count = 0;
    state.cells.forEach((cell, n) => {
      if (cell.owner === ownerId && B.BOARD[n].kind === kind) count += 1;
    });
    return count;
  }

  function ownsWholeGroup(state, ownerId, group) {
    return B.groupCells(group).every((n) => state.cells[n].owner === ownerId);
  }

  /** Сколько платит тот, кто встал на чужую клетку. */
  function rentFor(state, n, diceSum, multiplier = 1) {
    const spec = B.BOARD[n];
    const cell = state.cells[n];
    if (!cell.owner || cell.altar) return 0;
    if (state.sabbath) return 0;                  // земля отдыхает
    if (spec.kind === 'road') {
      return B.ROAD_RENT[ownedCount(state, cell.owner, 'road') - 1] * multiplier;
    }
    if (spec.kind === 'well') {
      const both = ownedCount(state, cell.owner, 'well') === 2;
      const base = multiplier > 1 ? multiplier : B.WELL_MULT[both ? 1 : 0];
      return diceSum * base;
    }
    const ladder = B.ladderOf(spec);
    if (cell.level > 0) return ladder[cell.level] * multiplier;
    const whole = ownsWholeGroup(state, cell.owner, spec.group);
    return ladder[0] * (whole ? 2 : 1) * multiplier;
  }

  // ————————————————————————————————————————————————— перемещение

  function goTo(state, player, target, { harvest = true } = {}) {
    if (harvest && target <= player.pos) passExodus(state, player);
    player.pos = target;
  }

  /*
    Подать за год — только в режиме «до последнего», и она растёт: год умножается
    на шаг подати. Без неё этот режим не кончается вовсе. Проверено счётом:
    круг замкнут, земля вся разобрана, плата за проход по неполным уделам мала,
    и партия ходит по кругу тысячами ходов, никого не разоряя. Подать — та
    растущая тяжесть, которая рано или поздно ломает слабейшего; в первые годы
    она меньше урожая, и разницы почти не видно.
  */
  function passExodus(state, player) {
    player.silver += B.HARVEST;
    player.passed = true;
    if (state.mode === 'last') player.tribute += state.year * B.TRIBUTE_STEP;
    if (player.servantOf) {
      // Половина урожая наёмника гасит долг перед хозяином.
      const share = Math.min(Math.floor(B.HARVEST / 2), player.debt);
      const creditor = state.players.find((p) => p.id === player.servantOf);
      player.silver -= share;
      player.debt -= share;
      if (creditor) creditor.silver += share;
      if (player.debt <= 0) {
        player.debt = 0;
        log(state, `${player.name} выплатил долг и свободен`);
        releaseServant(state, player);
      }
    }
  }

  function releaseServant(state, player) {
    player.servantOf = null;
    player.debt = 0;
    state.cells.forEach((cell) => {
      if (cell.heldFrom === player.id) {
        cell.owner = player.id;
        cell.heldFrom = null;
      }
    });
  }

  /*
    Досрочный выкуп. Дубль выпадает не всякий раз, а ждать освобождения — это
    до трёх ходов на круге, где чужие уделы растут. Кому ходы нужнее серебра,
    тот платит выкуп и выходит сразу же, в свой ход и до броска: серебро уходит
    в казну, а бросок остаётся при игроке.
  */
  function canBail(state, player) {
    return Boolean(player && player.prison > 0 && state.phase === 'roll'
      && !player.servantOf && !state.pending && player.silver >= B.BAIL);
  }

  function bail(state) {
    const player = current(state);
    if (!canBail(state, player)) return false;
    player.silver -= B.BAIL;
    player.prison = 0;
    log(state, `${player.name} выкупился из темницы за ${B.BAIL}`);
    return true;
  }

  function toPrison(state, player) {
    player.pos = 9;
    player.prison = B.PRISON_TURNS;
    state.doubles = 0;
    player.extraRoll = false;
    log(state, `${player.name} — в темнице`);
  }

  // ————————————————————————————————————————————————— карты

  function drawCard(state, deckName, rng) {
    if (!state.decks[deckName].length) {
      state.decks[deckName] = shuffle(state.discard[deckName], rng);
      state.discard[deckName] = [];
    }
    const id = state.decks[deckName].shift();
    state.discard[deckName].push(id);
    const source = deckName === 'providence' ? DECKS.PROVIDENCE : DECKS.MERCY;
    return source.find((card) => card.id === id);
  }

  function poorest(state, exceptId) {
    return activePlayers(state)
      .filter((p) => p.id !== exceptId)
      .sort((a, b) => a.silver - b.silver)[0] || null;
  }

  function settlementSteps(state, ownerId) {
    let total = 0;
    state.cells.forEach((cell) => { if (cell.owner === ownerId) total += cell.level; });
    return total;
  }

  function nearestOfKind(state, player, kind) {
    for (let step = 1; step <= SIZE; step += 1) {
      const n = (player.pos + step) % SIZE;
      if (B.BOARD[n].kind === kind) return n;
    }
    return player.pos;
  }

  /**
   * Действие карты. Всё, что карта даёт, она даёт сразу — решать тут нечего.
   * Всё, что карта берёт, она не берёт сама: сумма собирается в `bill`, и
   * счёт по ней выставляется игроку, как за проход по чужой земле. Денежное
   * требование у карты ровно одно — колода так и написана, — поэтому счёт
   * один, а не список.
   */
  function applyCard(state, player, card, rng) {
    const notes = [];
    const bill = { amount: 0, to: null, debtor: null, each: 0 };
    if (card.silver) {
      if (card.silver > 0) player.silver += card.silver;
      else { bill.amount = -card.silver; bill.to = card.toTreasury ? 'treasury' : null; }
    }
    if (card.heritage) player.heritage += card.heritage;
    if (card.key) player.keys += card.key;
    if (card.again) player.extraRoll = true;
    if (card.skip) player.skip = true;
    if (card.noRent) player.noRent = true;
    if (card.clearDebt && player.debt) { releaseServant(state, player); notes.push('долг прощён'); }

    if (card.perBuilding) {
      const amount = settlementSteps(state, player.id) * -card.perBuilding;
      if (amount > 0) { bill.amount = amount; bill.to = 'treasury'; notes.push(`${amount} сиклей`); }
    }
    if (card.perSettlement) {
      const amount = settlementSteps(state, player.id) * card.perSettlement;
      player.silver += amount;
      notes.push(`${amount} сиклей`);
    }
    if (card.toEach) {
      // Единственная карта, которая платит всем сразу. Счёт один на всех, а
      // делится он при уплате: списывать по кругу значило бы брать деньги
      // столько раз, сколько за столом народу, и ни разу не спросив.
      const others = activePlayers(state).filter((other) => other.id !== player.id);
      if (others.length) {
        bill.amount = card.toEach * others.length;
        bill.to = 'each';
        bill.each = card.toEach;
        notes.push(`по ${card.toEach} каждому — всего ${bill.amount}`);
      }
    }
    if (card.takeTreasury) {
      notes.push(`${state.treasury} сиклей из казны`);
      player.silver += state.treasury;
      state.treasury = 0;
    }
    if (card.overToTreasury) {
      const excess = Math.max(0, player.silver - card.overToTreasury);
      if (excess > 0) {
        // Наследие за отданное считается сразу: отдать придётся в любом случае,
        // а вот нажать на «заплатить» — игроку.
        player.heritage += Math.floor(excess / (card.heritagePer || 100));
        bill.amount = excess;
        bill.to = 'treasury';
        notes.push(`${excess} сиклей в казну`);
      }
    }
    if (card.giveToPoorest) {
      const target = poorest(state, player.id);
      if (target) {
        bill.amount = card.giveToPoorest;
        bill.to = target.id;
        notes.push(`${target.name} получает ${card.giveToPoorest}`);
      }
    }
    if (card.payDebtor) {
      const debtor = activePlayers(state).find((p) => p.debt > 0 && p.id !== player.id);
      if (debtor) {
        const amount = Math.min(card.payDebtor, debtor.debt);
        const creditor = state.players.find((p) => p.id === debtor.servantOf);
        bill.amount = amount;
        bill.to = creditor ? creditor.id : 'treasury';
        bill.debtor = { id: debtor.id, amount };
        notes.push(`долг ${debtor.name} уменьшится на ${amount}`);
      } else {
        notes.push('должников нет');
      }
    }
    if (card.titheNow) {
      const amount = titheAmount(player);
      player.tithePaid += card.doubleHeritage ? amount * 2 : amount;
      bill.amount = amount;
      bill.to = 'treasury';
      notes.push(`десятина ${amount}`);
    }
    if (card.freeStep) {
      const target = bestFreeStep(state, player);
      if (target !== null) {
        state.cells[target].level += 1;
        player.steps += 1;
        player.heritage += 1;
        notes.push(`ступень в «${B.BOARD[target].name}»`);
      } else { player.silver += 100; notes.push('строить негде, 100 сиклей'); }
    }
    if (card.freeAltar) {
      const target = state.cells.findIndex((cell, n) =>
        cell.owner === player.id && !cell.altar && cell.level === 0 && B.BOARD[n].kind === 'plot');
      if (target >= 0) {
        state.cells[target].altar = true;
        player.altars += 1;
        player.heritage += B.HERITAGE_ALTAR;
        notes.push(`жертвенник в «${B.BOARD[target].name}»`);
      } else { player.heritage += 1; notes.push('ставить негде, +1 наследия'); }
    }

    if (card.prison) { toPrison(state, player); return { notes, bill }; }
    if (typeof card.moveTo === 'number') {
      goTo(state, player, card.moveTo);
      resolveLanding(state, player, rng, 1);
      return { notes, bill, moved: true };
    }
    if (card.nearest) {
      goTo(state, player, nearestOfKind(state, player, card.nearest));
      resolveLanding(state, player, rng, card.payMult || 1);
      return { notes, bill, moved: true };
    }
    return { notes, bill };
  }

  function bestFreeStep(state, player) {
    let best = null;
    state.cells.forEach((cell, n) => {
      if (!canBuild(state, player, n, true)) return;
      if (best === null || B.BOARD[n].price > B.BOARD[best].price) best = n;
    });
    return best;
  }

  // ————————————————————————————————————————————————— клетки

  function titheAmount(player) {
    const tenth = Math.ceil(player.silver * B.TITHE_RATE / 10) * 10;
    return Math.min(B.TITHE_MAX, Math.max(B.TITHE_MIN, tenth));
  }

  function resolveLanding(state, player, rng, multiplier = 1) {
    const n = player.pos;
    const spec = B.BOARD[n];
    const cell = state.cells[n];
    const diceSum = state.dice[0] + state.dice[1];

    if (B.OWNABLE.has(spec.kind)) {
      if (!cell.owner) {
        if (player.silver >= spec.price && !player.servantOf) {
          state.pending = { type: 'buy', cell: n };
          state.phase = 'decide';
          return;
        }
        state.pending = { type: 'note', title: spec.name, text: 'Удел свободен, но денег на него нет.' };
        return;
      }
      if (cell.owner === player.id) {
        state.pending = { type: 'note', title: spec.name, text: 'Ваша земля.' };
        return;
      }
      if (player.noRent) {
        state.pending = { type: 'note', title: spec.name, text: 'В этом круге вы не платите за проход.' };
        return;
      }
      const owner = state.players.find((p) => p.id === cell.owner);
      const rent = rentFor(state, n, diceSum, multiplier);
      /*
        Долг по уговору идёт прежде платы: вы обещали этому хозяину ступень —
        вот его земля, вот и стройте. Плата за проход в этот раз не берётся:
        стройка её и заменяет.
      */
      const owed = player.promises.indexOf(owner.id);
      if (owed >= 0 && canBuild(state, owner, n, true) && !player.servantOf) {
        const cost = B.GROUPS[spec.group].build;
        state.pending = {
          type: 'promise', cell: n, cost, toId: owner.id,
          title: spec.name,
          text: `Уговор с ${owner.name}: ступень здесь за ваш счёт, ${cost} сиклей. `
            + 'Платы за проход в этот раз нет.',
        };
        state.phase = 'promise';
        return;
      }
      if (rent <= 0) {
        state.pending = {
          type: 'note', title: spec.name,
          text: state.sabbath ? 'Субботний год: земля отдыхает, платы нет.'
            : (cell.altar ? 'Здесь жертвенник: платы нет.' : 'Платы нет.'),
        };
        return;
      }
      requestPayment(state, player, rent, owner, spec.name,
        `Плата ${rent} сиклей ушла ${owner.name}.`);
      /*
        Договор вместо платы. Он возможен там, где на этой земле вообще можно
        поставить ступень: тогда гость волен не просто отдать плату, а вложиться
        в чужую землю — и заплатить половину или не платить вовсе, взяв на
        хозяина встречное обещание.
      */
      if (state.pending && state.pending.type === 'pay'
        && canBuild(state, owner, n, true)) {
        state.pending.deal = {
          cell: n,
          build: B.GROUPS[spec.group].build,
          half: Math.ceil(rent / 2),
          ownerId: owner.id,
        };
      }
      return;
    }

    if (spec.kind === 'tithe') {
      const amount = titheAmount(player);
      // Наследие за десятину начисляется сразу: платить всё равно придётся, а
      // видеть, ради чего платишь, стоит до того, как нажал.
      player.tithePaid += amount;
      requestPayment(state, player, amount, 'treasury', 'Десятина',
        `${amount} сиклей в казну. Наследие за десятину: ${Math.floor(player.tithePaid / B.HERITAGE_PER_TITHE)}.`);
      return;
    }
    if (spec.kind === 'offering') {
      player.offerings += 1;
      player.heritage += 1;
      requestPayment(state, player, B.OFFERING, 'treasury', 'Приношение',
        `${B.OFFERING} сиклей в казну, +1 наследия.`);
      return;
    }
    if (spec.kind === 'tent') {
      const taken = state.treasury;
      player.silver += taken;
      state.treasury = 0;
      player.hospitality += 1;
      player.heritage += 1;
      state.pending = {
        type: 'note', title: 'Шатёр Авраама',
        text: taken ? `Казна ваша: ${taken} сиклей, +1 наследия.` : 'Казна пуст, но +1 наследия.',
      };
      return;
    }
    if (spec.kind === 'slander') { toPrison(state, player); state.pending = { type: 'note', title: 'Навет', text: 'Оговорили перед царём — в темницу.' }; return; }
    if (spec.kind === 'providence' || spec.kind === 'mercy') {
      /*
        Карта только вынимается из колоды — и ждёт. Раньше она в тот же миг и
        применялась: игрок видел уже случившееся и читал объяснение задним
        числом. Теперь между «выпала» и «сработала» стоит нажатие, и между ними
        же успевает пролететь сама карта на доске.
      */
      const card = drawCard(state, spec.kind, rng);
      state.pending = {
        type: 'card',
        deck: spec.kind,
        cardId: card.id,
        title: spec.kind === 'providence' ? 'Провидение' : 'Милость',
        // Имя картинки собирается из колоды и номера карты: интерфейсу иначе
        // неоткуда узнать, какой рисунок показывать.
        art: `${spec.kind}-${card.id}`,
        text: card.text,
        ref: card.ref,
      };
      state.phase = 'card';
      return;
    }
    state.pending = { type: 'note', title: spec.name, text: spec.note || '' };
  }

  // ————————————————————————————————————————————————— действия игрока

  function roll(state, rng = Math.random) {
    if (state.phase !== 'roll' || state.status !== 'playing') return false;
    const player = current(state);

    if (player.skip) {
      player.skip = false;
      log(state, `${player.name} пропускает ход`);
      state.pending = { type: 'note', title: 'Пропуск хода', text: 'Сорок лет в пустыне.' };
      state.phase = 'act';
      return true;
    }

    const d1 = 1 + Math.floor(rng() * 6);
    const d2 = 1 + Math.floor(rng() * 6);
    state.dice = [d1, d2];
    const double = d1 === d2;

    if (player.prison > 0) {
      if (double) {
        player.prison = 0;
        log(state, `${player.name} выбросил дубль и вышел из темницы`);
      } else {
        player.prison -= 1;
        if (player.prison === 0) {
          requestPayment(state, player, B.RANSOM, 'treasury', 'Выкуп из темницы',
            `${B.RANSOM} сиклей — и вы свободны.`);
          return true;
        } else {
          state.pending = { type: 'note', title: 'Темница', text: `Дубля нет. Осталось попыток: ${player.prison}.` };
          state.phase = 'act';
          return true;
        }
      }
    }

    if (double) {
      state.doubles += 1;
      if (state.doubles >= 3) {
        state.doubles = 0;
        toPrison(state, player);
        state.pending = { type: 'note', title: 'Три дубля подряд', text: 'Навет — в темницу.' };
        state.phase = 'act';
        return true;
      }
      player.extraRoll = true;
    } else {
      state.doubles = 0;
    }

    goTo(state, player, (player.pos + d1 + d2) % SIZE);
    resolveLanding(state, player, rng);
    /*
      Фаза после приземления говорит, чего ход ждёт. «Решить» — выбора игрока
      по карте, «счёт» — его решения по плате. Затирать их общим «ход идёт»
      нельзя: тогда ход выглядит законченным при невыплаченном счёте, и
      endTurn ниже нечем его удержать.
    */
    if (state.phase !== 'decide' && state.phase !== 'settle') state.phase = 'act';
    return true;
  }

  function buy(state) {
    if (!state.pending || state.pending.type !== 'buy') return false;
    const player = current(state);
    const n = state.pending.cell;
    const spec = B.BOARD[n];
    if (player.silver < spec.price) return false;
    player.silver -= spec.price;
    state.cells[n].owner = player.id;
    log(state, `${player.name} берёт «${spec.name}» за ${spec.price}`);
    state.pending = { type: 'note', title: spec.name, text: `Ваш удел за ${spec.price} сиклей.` };
    state.phase = 'act';
    return true;
  }

  function decline(state) {
    if (!state.pending || state.pending.type !== 'buy') return false;
    state.pending = { type: 'note', title: B.BOARD[state.pending.cell].name, text: 'Удел остался свободным.' };
    state.phase = 'act';
    return true;
  }

  function canBuild(state, player, n, free = false) {
    const spec = B.BOARD[n];
    if (!spec || spec.kind !== 'plot') return false;
    const cell = state.cells[n];
    if (cell.owner !== player.id || cell.altar || cell.level >= B.LEVELS.length) return false;
    if (!ownsWholeGroup(state, player.id, spec.group)) return false;
    // Строить вровень: нельзя поставить второй дом, пока рядом стоит шатёр.
    const levels = B.groupCells(spec.group).map((i) => state.cells[i].level);
    if (cell.level > Math.min(...levels)) return false;
    if (free) return true;
    return player.silver >= B.GROUPS[spec.group].build;
  }

  function build(state, n) {
    const player = current(state);
    if (state.phase === 'decide' || !canBuild(state, player, n)) return false;
    const spec = B.BOARD[n];
    player.silver -= B.GROUPS[spec.group].build;
    state.cells[n].level += 1;
    player.steps += 1;
    player.heritage += 1;                 // ступень даёт наследие навсегда
    log(state, `${player.name} строит в «${spec.name}»: ${B.LEVELS[state.cells[n].level - 1]}`);
    return true;
  }

  function canAltar(state, player, n) {
    const spec = B.BOARD[n];
    if (!spec || spec.kind !== 'plot') return false;
    const cell = state.cells[n];
    if (cell.owner !== player.id || cell.altar || cell.level > 0) return false;
    return player.silver >= B.GROUPS[spec.group].build;
  }

  function altar(state, n) {
    const player = current(state);
    if (state.phase === 'decide' || !canAltar(state, player, n)) return false;
    const spec = B.BOARD[n];
    player.silver -= B.GROUPS[spec.group].build;
    state.cells[n].altar = true;
    player.altars += 1;
    player.heritage += B.HERITAGE_ALTAR;
    log(state, `${player.name} ставит жертвенник в «${spec.name}»: +${B.HERITAGE_ALTAR} наследия`);
    return true;
  }

  function canSell(state, player, n) {
    const cell = state.cells[n];
    if (cell.owner !== player.id) return false;
    const spec = B.BOARD[n];
    if (spec.kind === 'plot' && cell.level > 0) return true;
    if (spec.kind !== 'plot') return true;
    return !B.groupCells(spec.group).some((i) => state.cells[i].level > 0);
  }

  function sell(state, n) {
    const player = current(state);
    if (state.phase === 'decide' || !canSell(state, player, n)) return false;
    const spec = B.BOARD[n];
    const cell = state.cells[n];
    if (spec.kind === 'plot' && cell.level > 0) {
      cell.level -= 1;
      player.silver += Math.floor(B.GROUPS[spec.group].build / 2);
      return true;
    }
    cell.owner = null;
    cell.altar = false;
    player.silver += Math.floor(spec.price / 2);
    log(state, `${player.name} отдаёт «${spec.name}»`);
    return true;
  }

  /** Выкуп наёмника (Лев. 25:47-49) — самый дорогой источник наследия в игре. */
  function canRedeem(state, player, targetId) {
    const target = state.players.find((p) => p.id === targetId);
    if (!target || !target.debt || target.id === player.id) return false;
    return player.silver >= target.debt;
  }

  function redeem(state, targetId) {
    const player = current(state);
    if (state.phase === 'decide' || !canRedeem(state, player, targetId)) return false;
    const target = state.players.find((p) => p.id === targetId);
    const creditor = state.players.find((p) => p.id === target.servantOf);
    const amount = target.debt;
    player.silver -= amount;
    if (creditor) creditor.silver += amount;
    releaseServant(state, target);
    player.redeemed += 1;
    player.heritage += B.HERITAGE_REDEEM;
    log(state, `${player.name} выкупает ${target.name} за ${amount}: +${B.HERITAGE_REDEEM} наследия`);
    return true;
  }

  function endTurn(state) {
    if (state.status !== 'playing') return false;
    const player = current(state);
    /*
      Невыплаченный счёт ход не закрывает. Сама разметка этого и не предложит —
      при счёте на экране только «заплатить», «продать и заплатить» и «наём», —
      но правило должно держаться движком, а не тем, какие кнопки нарисованы:
      иначе один лишний вызов молча прощает долг.
    */
    if (state.pending && (state.pending.type === 'pay' || state.pending.type === 'card'
      || state.pending.type === 'promise')) return false;
    state.pending = null;

    if (player.extraRoll && player.prison === 0 && !player.skip) {
      player.extraRoll = false;
      state.phase = 'roll';
      return true;
    }
    player.extraRoll = false;
    player.noRent = false;

    // Год сменяется, когда «Исход» прошёл каждый, а не кто-то один: иначе
    // у одних было бы вдвое больше кругов, чем у других.
    const alive = activePlayers(state);
    if (alive.length && alive.every((p) => p.passed)) {
      for (const p of state.players) p.passed = false;
      state.year += 1;
      if (state.mode !== 'last' && state.year > state.years) return jubilee(state);
      state.sabbath = state.mode !== 'last' && state.year === state.years;
      if (state.sabbath) {
        freeServants(state, 'субботний год прощает долги');
        returnPledges(state, 'Субботний год');
        log(state, `Субботний год: земля отдыхает, платы нет.`);
      } else {
        log(state, `Год ${state.year}.`);
      }
    }

    // «До последнего»: партия кончается, когда платёжеспособный остался один.
    if (state.mode === 'last' && standing(state).length <= 1) return lastOne(state);

    let next = (state.turn + 1) % state.players.length;
    let guard = 0;
    while (state.players[next].out && guard < state.players.length) {
      next = (next + 1) % state.players.length;
      guard += 1;
    }
    state.turn = next;
    state.phase = 'roll';
    state.doubles = 0;

    /*
      Подать спрашивается в начале хода, а не посреди движения: пройденный
      «Исход» только записывает её, а счёт выставляется тому, чей ход начался.
      Иначе плата случалась бы прямо во время шага фишки — то есть сама.
    */
    const ahead = state.players[next];
    if (state.mode === 'last' && ahead.tribute > 0 && !ahead.servantOf) {
      const owed = ahead.tribute;
      ahead.tribute = 0;
      requestPayment(state, ahead, owed, 'treasury', 'Подать за год',
        `Земля просит своё: ${owed} сиклей в казну.`);
    }
    return true;
  }

  /** Кто ещё держится на своих ногах: не в наёме и не выбыл. */
  const standing = (state) => activePlayers(state).filter((player) => !ruined(player));

  /** Конец партии «до последнего»: победил уцелевший, прочие — по наследию. */
  function lastOne(state) {
    const left = standing(state).map((player) => player.id);
    state.status = 'jubilee';
    state.phase = 'done';
    state.scores = state.players.map((player) => ({
      id: player.id, name: player.name, ...scoreOf(state, player), tithePaid: player.tithePaid,
    }));
    state.scores.sort((a, b) => (left.includes(b.id) ? 1 : 0) - (left.includes(a.id) ? 1 : 0)
      || b.total - a.total || b.tithePaid - a.tithePaid);
    log(state, `За столом остался один: ${state.scores[0].name}.`);
    return true;
  }

  // ————————————————————————————————————————————————— юбилей

  function scoreOf(state, player) {
    let plots = 0;
    state.cells.forEach((cell) => {
      const id = cell.heldFrom || cell.owner;
      if (id === player.id) plots += 1;
    });
    const tithe = Math.floor(player.tithePaid / B.HERITAGE_PER_TITHE);
    const silver = Math.floor(player.silver / B.HERITAGE_PER_SILVER);
    return {
      steps: player.steps,
      altars: player.altars * B.HERITAGE_ALTAR,
      tithe,
      offerings: player.offerings,
      hospitality: player.hospitality,
      redeemed: player.redeemed * B.HERITAGE_REDEEM,
      plots,
      silver,
      total: player.steps + player.altars * B.HERITAGE_ALTAR + tithe + player.offerings
        + player.hospitality + player.redeemed * B.HERITAGE_REDEEM + plots + silver,
    };
  }

  function jubilee(state) {
    freeServants(state, 'юбилей возвращает землю');
    returnPledges(state, 'Юбилей');
    state.status = 'jubilee';
    state.phase = 'done';
    state.scores = state.players.map((player) => ({
      id: player.id, name: player.name, ...scoreOf(state, player), tithePaid: player.tithePaid,
    }));
    // При равенстве наследия выигрывает тот, кто больше отдал десятиной.
    state.scores.sort((a, b) => b.total - a.total || b.tithePaid - a.tithePaid);
    log(state, `Юбилей. Побеждает ${state.scores[0].name}: ${state.scores[0].total} наследия.`);
    return true;
  }

  return {
    createGame, current, roll, buy, decline, build, altar, sell, redeem, endTurn,
    settle, serve, payee, takeCard, dealBuild, keepPromise, breakPromise,
    canBail, bail,
    pledgeable, pledge, pledgesOf, canRedeemPledge, redeemPledge,
    canBuild, canAltar, canSell, canRedeem, rentFor, ownsWholeGroup, ownedCount,
    scoreOf, titheAmount, liquidValue, settlementSteps, standing, clone,
  };
})();
