// «Двенадцать колен» — ход партии. Тоже без единого слова про экран.
//
// Движок держит всё, что можно проверить машиной: раздачу, законность хода,
// действия карт, объявление «Шофар», подсчёт очков и конец раздачи. Разметка
// его только спрашивает и показывает — своих правил у неё нет ни одного.
//
// Случайность приходит снаружи (createGame({ random })). Это не педантизм: без
// этого проверка на десять тысяч раздач падала бы по-разному от запуска к
// запуску, и поломку нельзя было бы повторить.

(function () {
  'use strict';

  const R = window.TwelveTribesRules;

  /** Кто сейчас ходит. */
  const current = (state) => state.players[state.turn];

  /** Следующее место по нынешнему направлению хода. */
  const nextSeat = (state, from = state.turn, step = 1) => {
    const size = state.players.length;
    return ((from + state.dir * step) % size + size) % size;
  };

  function note(state, text) {
    state.log.push({ round: state.round, text });
    // Журнал не растёт бесконечно: партия до трёхсот очков — это десяток
    // раздач и несколько сотен записей, а на экране видно последние.
    if (state.log.length > 240) state.log.splice(0, state.log.length - 240);
  }

  /*
    Колода кончилась — в неё уходит сброс, кроме верхней карты.

    Это не редкость, а обычный ход дела: ста восьми карт на четверых хватает
    примерно на раздачу, и почти каждая длинная раздача доживает до
    перетасовки. Стан, объявленный жребием, при этом не меняется: перетасовка —
    дело колоды, а не хода.
  */
  function refill(state) {
    if (state.deck.length || state.pile.length < 2) return;
    const top = state.pile.pop();
    const back = state.pile.splice(0, state.pile.length);
    /*
      Жребий, уходящий в колоду, теряет выбранный стан. Иначе он вернулся бы
      на руку уже покрашенным — и лёг бы на стол, ничего не спрашивая.
    */
    for (const card of back) if (R.KINDS[card.kind].wild) card.camp = null;
    state.deck = R.shuffle(back, state.random);
    state.pile = [top];
    note(state, 'Сброс ушёл в колоду и перетасован.');
  }

  /** Одна карта в руку. Возвращает её или null, если брать нечего. */
  function drawCard(state, seat) {
    refill(state);
    if (!state.deck.length) return null;
    const card = state.deck.pop();
    const player = state.players[seat];
    player.hand.push(card);
    /*
      Взял карты — объявление больше не в силе. «Шофар» говорит «у меня одна
      карта», и говорит он это про сейчас: тот, кого накрыло странствием или
      пленом, держит уже три или пять, и прошлое объявление за него не
      отвечает. Оставленная метка молчала бы потом, когда игрок снова дойдёт
      до последней карты, — то есть ровно тогда, когда правило и нужно.
    */
    if (player.hand.length > 1) player.said = false;
    return card;
  }

  function drawMany(state, seat, count) {
    let taken = 0;
    for (let i = 0; i < count; i += 1) if (drawCard(state, seat)) taken += 1;
    return taken;
  }

  /*
    Раздача. Каждому по семь карт, первой на стол ложится карта из колоды.

    Первой обязана лечь цифра: действие, выпавшее первым, уходит под низ колоды
    и тянется следующее. В родительской игре первое действие исполняют над
    первым же игроком — и партия начинается с того, что кто-то, ещё не сделав
    хода, берёт две карты или пропускает. Это не строгость правил, а их
    случайный угол, и мы его срезали: игра начинается одинаково для всех.
  */
  function deal(state) {
    state.deck = R.shuffle(R.buildDeck(), state.random);
    state.pile = [];
    for (const player of state.players) {
      player.hand = [];
      player.said = false;
    }
    for (let i = 0; i < R.HAND; i += 1) {
      for (let seat = 0; seat < state.players.length; seat += 1) drawCard(state, seat);
    }
    let first = state.deck.pop();
    while (first && first.kind !== 'number') {
      state.deck.unshift(first);
      first = state.deck.pop();
    }
    state.pile.push(first);
    state.camp = first.camp;
    state.dir = 1;
    state.turn = state.dealer;
    state.phase = 'play';
    state.drawn = null;
    state.risk = null;
    state.status = 'playing';
    note(state, `Раздача ${state.round}. На столе ${R.campOf(first.camp).name}, los ${first.rank}.`);
  }

  function createGame(options) {
    const random = options.random || Math.random;
    const players = options.players.map((one, index) => ({
      id: index, name: one.name, isBot: Boolean(one.isBot),
      hand: [], score: 0, said: false,
    }));
    const state = {
      players, random,
      deck: [], pile: [], camp: null,
      turn: 0, dealer: 0, dir: 1,
      phase: 'play', drawn: null, risk: null,
      round: 1, moves: 0,
      // Ноль значит «одна раздача»: выиграл тот, кто первым остался без карт.
      target: Number(options.target) || 0,
      status: 'playing', winner: null,
      log: [],
    };
    deal(state);
    return state;
  }

  /*
    Объявление. Оставшись с одной картой, игрок обязан затрубить в шофар —
    иначе соперник ловит его и выдаёт две карты.

    Окно поимки закрывается не по часам, а по ходу: поймать можно, пока
    следующий игрок не сделал свой ход. Часы тут были бы несправедливы к тому,
    кто читает медленнее, а ход — общая для всех мера.
  */
  function markRisk(state, seat) {
    state.risk = { seat, until: state.moves + 1 };
  }

  const riskOpen = (state) => Boolean(state.risk) && state.moves <= state.risk.until
    && state.players[state.risk.seat].hand.length === 1
    && !state.players[state.risk.seat].said;

  /** Может ли этот игрок поймать соседа на необъявленном шофаре. */
  function canCatch(state, accuser) {
    return riskOpen(state) && state.risk.seat !== accuser;
  }

  function shofar(state, seat) {
    const player = state.players[seat];
    if (player.hand.length !== 1 || player.said) return false;
    player.said = true;
    state.risk = null;
    note(state, `${player.name}: шофар — осталась одна карта.`);
    return true;
  }

  function catchOut(state, accuser, seat) {
    if (!canCatch(state, accuser) || state.risk.seat !== seat) return false;
    const caught = state.players[seat];
    drawMany(state, seat, 2);
    caught.said = false;
    state.risk = null;
    note(state, `${state.players[accuser].name} поймал: ${caught.name} не затрубил и берёт две.`);
    return true;
  }

  /*
    Конец раздачи. Очки считаются с рук проигравших и достаются победителю —
    как в родительской игре, и по той же причине: так карта на руке имеет цену,
    и «Плен» в полсотни очков жжёт руки тому, кто копит его до последнего.
  */
  function finishRound(state, seat) {
    const winner = state.players[seat];
    let gain = 0;
    for (const player of state.players) {
      if (player === winner) continue;
      for (const card of player.hand) gain += R.costOf(card);
    }
    winner.score += gain;
    state.risk = null;
    /*
      Объявление снимается со всех. «Шофар» говорит «у меня последняя карта», и
      карты этой больше нет ни у кого: победитель её сбросил, остальные пойдут
      в новую раздачу с семью. Оставленная метка соврала бы в следующей же
      раздаче — и соперник поймал бы человека за то, чего тот не делал.
    */
    for (const player of state.players) player.said = false;
    note(state, `${winner.name} сбросил последнюю карту и берёт ${gain} очков.`);
    if (state.target && winner.score >= state.target) {
      state.status = 'over';
      state.winner = winner.id;
      note(state, `${winner.name} набрал ${winner.score} — партия окончена.`);
      return;
    }
    if (!state.target) {
      state.status = 'over';
      state.winner = winner.id;
      return;
    }
    state.status = 'round';
    state.winner = winner.id;
  }

  /** Следующая раздача после подведения итогов. Сдаёт следующий по кругу. */
  function nextRound(state) {
    if (state.status !== 'round') return false;
    state.round += 1;
    state.dealer = (state.dealer + 1) % state.players.length;
    state.winner = null;
    deal(state);
    return true;
  }

  /*
    Действие сыгранной карты. Всё, что карта делает с соседом, случается здесь
    и сразу: взять карты и пропустить ход — одно действие, а не два.
  */
  function applyEffect(state, card) {
    const size = state.players.length;
    if (card.kind === 'jordan') {
      /*
        Вдвоём «Иордан» — это «Суббота»: обратить круг из двух значит вернуть
        ход себе же. Так в родительской игре, и так честнее, чем карта, которая
        вдвоём не делает ничего.
      */
      if (size === 2) { note(state, 'Иордан вдвоём: ход возвращается.'); return { skip: true }; }
      state.dir *= -1;
      note(state, 'Иордан обратился назад: ход пошёл в другую сторону.');
      return { skip: false };
    }
    if (card.kind === 'sabbath') {
      note(state, `${state.players[nextSeat(state)].name} покоится и пропускает ход.`);
      return { skip: true };
    }
    if (card.kind === 'journey' || card.kind === 'exile') {
      const seat = nextSeat(state);
      const count = card.kind === 'journey' ? 2 : 4;
      const taken = drawMany(state, seat, count);
      note(state, `${state.players[seat].name} берёт ${taken} и пропускает ход.`);
      return { skip: true };
    }
    return { skip: false };
  }

  /*
    Ход картой. Стан для жребия и плена приходит сюда же: разметка спрашивает
    его до хода, а движок без него карту не примет — покрашенный жребий на
    столе обязан иметь стан, иначе следующий ход не с чем сравнивать.
  */
  function play(state, seat, index, camp) {
    if (state.status !== 'playing' || state.turn !== seat) return false;
    const player = state.players[seat];
    const card = player.hand[index];
    if (!card || !R.playable(state, card, player.hand)) return false;
    if (R.KINDS[card.kind].wild && !R.CAMP_IDS.includes(camp)) return false;

    player.hand.splice(index, 1);
    if (R.KINDS[card.kind].wild) card.camp = camp;
    state.pile.push(card);
    state.camp = card.camp;
    state.drawn = null;
    state.phase = 'play';
    state.moves += 1;

    const title = card.kind === 'number'
      ? `${R.campOf(card.camp).name}, los ${card.rank}`
      : `${R.KINDS[card.kind].title} (${R.campOf(card.camp).name})`;
    note(state, `${player.name}: ${title}.`);

    if (!player.hand.length) { finishRound(state, seat); return true; }
    /*
      Объявление спрашивается с того, у кого осталась одна карта, — и окно
      поимки открывается тут же. Само объявление игрок делает отдельным
      нажатием: в этом и смысл правила.
    */
    if (player.hand.length === 1) { player.said = false; markRisk(state, seat); }

    const effect = applyEffect(state, card);
    state.turn = nextSeat(state, state.turn, effect.skip ? 2 : 1);
    return true;
  }

  /*
    Взять карту. Берут одну и только один раз за ход: взятую можно сыграть
    сразу, если она подошла, или отказаться — тогда ход переходит дальше.
  */
  function draw(state, seat) {
    if (state.status !== 'playing' || state.turn !== seat || state.phase !== 'play') return null;
    const card = drawCard(state, seat);
    state.moves += 1;
    if (!card) {
      // Брать нечего: и колода, и сброс пусты. Ход просто уходит дальше.
      note(state, `${state.players[seat].name}: брать нечего, ход мимо.`);
      state.turn = nextSeat(state);
      return null;
    }
    state.phase = 'drawn';
    state.drawn = card.id;
    note(state, `${state.players[seat].name} берёт карту.`);
    return card;
  }

  /** Отказаться от взятой карты и закончить ход. */
  function pass(state, seat) {
    if (state.status !== 'playing' || state.turn !== seat || state.phase !== 'drawn') return false;
    state.phase = 'play';
    state.drawn = null;
    state.moves += 1;
    state.turn = nextSeat(state);
    return true;
  }

  window.TwelveTribesEngine = {
    createGame, deal, nextRound, current, nextSeat,
    play, draw, pass, shofar, canCatch, catchOut,
    legalMoves: (state, seat) => R.legalMoves(state, seat),
    riskOpen,
  };
}());
