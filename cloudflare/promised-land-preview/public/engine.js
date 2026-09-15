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

  function createGame({ players, years = 5, rng = Math.random }) {
    const state = {
      version: 1,
      status: 'playing',
      years,
      year: 1,
      sabbath: years === 1,
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
        servantOf: null,
        debt: 0,
        extraRoll: false,
        skip: false,
        noRent: false,
        out: false,
      })),
      cells: B.BOARD.map(() => ({ owner: null, level: 0, altar: false, heldFrom: null })),
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

  /** Платёж. Не хватило — распродажа, а если и её мало — наём. */
  function pay(state, player, amount, target) {
    if (amount <= 0) return;
    if (player.servantOf) return;                 // с наёмника взять нечего
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

  function passExodus(state, player) {
    player.silver += B.HARVEST;
    player.passed = true;
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

  function applyCard(state, player, card, rng) {
    const notes = [];
    if (card.silver) {
      if (card.silver > 0) player.silver += card.silver;
      else pay(state, player, -card.silver, card.toTreasury ? 'treasury' : null);
    }
    if (card.heritage) player.heritage += card.heritage;
    if (card.key) player.keys += card.key;
    if (card.again) player.extraRoll = true;
    if (card.skip) player.skip = true;
    if (card.noRent) player.noRent = true;
    if (card.clearDebt && player.debt) { releaseServant(state, player); notes.push('долг прощён'); }

    if (card.perBuilding) {
      const amount = settlementSteps(state, player.id) * -card.perBuilding;
      if (amount > 0) { pay(state, player, amount, 'treasury'); notes.push(`${amount} сиклей`); }
    }
    if (card.perSettlement) {
      const amount = settlementSteps(state, player.id) * card.perSettlement;
      player.silver += amount;
      notes.push(`${amount} сиклей`);
    }
    if (card.toEach) {
      for (const other of activePlayers(state)) {
        if (other.id === player.id) continue;
        pay(state, player, card.toEach, other);
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
        player.silver -= excess;
        state.treasury += excess;
        player.heritage += Math.floor(excess / (card.heritagePer || 100));
        notes.push(`${excess} сиклей в казну`);
      }
    }
    if (card.giveToPoorest) {
      const target = poorest(state, player.id);
      if (target) { pay(state, player, card.giveToPoorest, target); notes.push(`${target.name} получает ${card.giveToPoorest}`); }
    }
    if (card.payDebtor) {
      const debtor = activePlayers(state).find((p) => p.debt > 0 && p.id !== player.id);
      if (debtor) {
        const amount = Math.min(card.payDebtor, debtor.debt);
        const creditor = state.players.find((p) => p.id === debtor.servantOf);
        pay(state, player, amount, creditor || 'treasury');
        debtor.debt -= amount;
        if (debtor.debt <= 0) releaseServant(state, debtor);
        notes.push(`долг ${debtor.name} уменьшен на ${amount}`);
      } else {
        notes.push('должников нет');
      }
    }
    if (card.titheNow) {
      const amount = titheAmount(player);
      pay(state, player, amount, 'treasury');
      player.tithePaid += card.doubleHeritage ? amount * 2 : amount;
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

    if (card.prison) { toPrison(state, player); return notes; }
    if (typeof card.moveTo === 'number') {
      goTo(state, player, card.moveTo);
      resolveLanding(state, player, rng, 1);
      return notes;
    }
    if (card.nearest) {
      goTo(state, player, nearestOfKind(state, player, card.nearest));
      resolveLanding(state, player, rng, card.payMult || 1);
      return notes;
    }
    return notes;
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
      if (rent <= 0) {
        state.pending = {
          type: 'note', title: spec.name,
          text: state.sabbath ? 'Субботний год: земля отдыхает, платы нет.'
            : (cell.altar ? 'Здесь жертвенник: платы нет.' : 'Платы нет.'),
        };
        return;
      }
      pay(state, player, rent, owner);
      log(state, `${player.name} платит ${owner.name} ${rent} за «${spec.name}»`);
      state.pending = { type: 'note', title: spec.name, text: `Плата ${rent} сиклей для ${owner.name}.` };
      return;
    }

    if (spec.kind === 'tithe') {
      const amount = titheAmount(player);
      pay(state, player, amount, 'treasury');
      player.tithePaid += amount;
      log(state, `${player.name} отдаёт десятину ${amount}`);
      state.pending = {
        type: 'note', title: 'Десятина',
        text: `${amount} сиклей. Наследие за десятину: ${Math.floor(player.tithePaid / B.HERITAGE_PER_TITHE)}.`,
      };
      return;
    }
    if (spec.kind === 'offering') {
      pay(state, player, B.OFFERING, 'treasury');
      player.offerings += 1;
      player.heritage += 1;
      state.pending = { type: 'note', title: 'Приношение', text: `${B.OFFERING} сиклей в казну, +1 наследия.` };
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
      const card = drawCard(state, spec.kind, rng);
      const notes = applyCard(state, player, card, rng);
      log(state, `${player.name}: ${card.text}`);
      if (state.pending && state.pending.type === 'buy') return;   // карта увела на свободный удел
      state.pending = {
        type: 'note',
        title: spec.kind === 'providence' ? 'Провидение' : 'Милость',
        // Имя картинки собирается из колоды и номера карты: интерфейсу иначе
        // неоткуда узнать, какой рисунок показывать.
        art: `${spec.kind}-${card.id}`,
        text: card.text, ref: card.ref, extra: notes.join(', '),
      };
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
          pay(state, player, B.RANSOM, 'treasury');
          log(state, `${player.name} платит выкуп ${B.RANSOM}`);
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
    if (state.phase !== 'decide') state.phase = 'act';
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
      if (state.year > state.years) return jubilee(state);
      state.sabbath = state.year === state.years;
      if (state.sabbath) {
        freeServants(state, 'субботний год прощает долги');
        log(state, `Субботний год: земля отдыхает, платы нет.`);
      } else {
        log(state, `Год ${state.year}.`);
      }
    }

    let next = (state.turn + 1) % state.players.length;
    let guard = 0;
    while (state.players[next].out && guard < state.players.length) {
      next = (next + 1) % state.players.length;
      guard += 1;
    }
    state.turn = next;
    state.phase = 'roll';
    state.doubles = 0;
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
    canBuild, canAltar, canSell, canRedeem, rentFor, ownsWholeGroup, ownedCount,
    scoreOf, titheAmount, liquidValue, settlementSteps, clone,
  };
})();
