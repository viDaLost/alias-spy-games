// «Двенадцать колен» — ход партии. Тоже без единого слова про экран.
//
// Движок держит всё, что можно проверить машиной: раздачу, законность хода,
// действия карт, объявление «Шабат», подсчёт очков и конец раздачи. Разметка
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

  /*
    Следующее место по нынешнему направлению хода — мимо тех, кто уже вышел.

    Вышедший из раздачи остаётся за столом на экране: видно, какое место он
    занял. Но ходить ему больше нечем, и очередь его обходит. Без этого стол,
    в котором первый вышел, а трое доигрывают, вставал бы на пустом месте.
  */
  const nextSeat = (state, from = state.turn, step = 1) => {
    const size = state.players.length;
    let at = from;
    for (let made = 0; made < step; made += 1) {
      let guard = 0;
      do {
        at = ((at + state.dir) % size + size) % size;
        guard += 1;
      } while (state.players[at].out && guard <= size);
    }
    return at;
  };

  /** Кто ещё в раздаче. */
  const playing = (state) => state.players.filter((one) => !one.out);

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
    /*
      Перетасовка отмечается ходом, на котором случилась. Стол по этой отметке
      показывает, что колода собралась заново: без неё колода просто
      «вдруг» толстеет, и игрок думает, что игра ошиблась в счёте.
    */
    state.reshuffled = state.moves;
    note(state, `Колода кончилась: сброс перевёрнут и перетасован — ${state.deck.length} карт.`);
  }

  /** Одна карта в руку. Возвращает её или null, если брать нечего. */
  function drawCard(state, seat) {
    refill(state);
    if (!state.deck.length) return null;
    const card = state.deck.pop();
    const player = state.players[seat];
    player.hand.push(card);
    /*
      Взял карты — объявление больше не в силе. «Шабат» говорит «у меня одна
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
      player.out = false;
      player.place = 0;
    }
    state.places = [];
    state.penalty = null;
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
    note(state, `Раздача ${state.round}. На столе ${R.campOf(first.camp).name}, suerte ${first.rank}.`);
  }

  function createGame(options) {
    const random = options.random || Math.random;
    const players = options.players.map((one, index) => ({
      id: index, name: one.name, isBot: Boolean(one.isBot),
      hand: [], score: 0, said: false,
      // Вышедший из раздачи и его место: первый вышел — первое, и так до
      // последнего, оставшегося с картами на руках.
      out: false, place: 0,
    }));
    const state = {
      players, random,
      deck: [], pile: [], camp: null,
      turn: 0, dealer: 0, dir: 1,
      phase: 'play', drawn: null, risk: null, reshuffled: -1,
      /*
        Накопленный штраф: «Странствие» или «Плен», который тот, чей ход,
        обязан взять — или перевести дальше такой же картой. Пока он висит,
        законный ход в раздаче ровно один род карт.
      */
      penalty: null,
      // Места по выходу из раздачи: первый вышел — первый в списке.
      places: [],
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
    Объявление. Оставшись с одной картой, игрок обязан сказать «Шабат!» —
    иначе соперник перебивает его и выдаёт две карты.

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

  /** Может ли этот игрок перебить соседа, не сказавшего «Шабат». */
  function canCatch(state, accuser) {
    return riskOpen(state) && state.risk.seat !== accuser;
  }

  function shabbat(state, seat) {
    const player = state.players[seat];
    if (player.hand.length !== 1 || player.said) return false;
    player.said = true;
    state.risk = null;
    note(state, `${player.name}: Шабат! — осталась одна карта.`);
    return true;
  }

  function catchOut(state, accuser, seat) {
    if (!canCatch(state, accuser) || state.risk.seat !== seat) return false;
    const caught = state.players[seat];
    drawMany(state, seat, 2);
    caught.said = false;
    state.risk = null;
    note(state, `${state.players[accuser].name} перебил: ${caught.name} не сказал «Шабат» и берёт две.`);
    return true;
  }

  /*
    Конец раздачи по местам.

    Очки больше не снимаются с чужих рук: счёт растёт по ходу игры, за каждую
    сброшенную карту (см. R.scoreOf). Поэтому выход из раздачи — не подведение
    итогов, а занятое место: первый, кто остался без карт, берёт первое место,
    следующий — второе, и так до последнего, у которого карты ещё есть.

    Играть при этом продолжают остальные: раздача идёт, пока за столом не
    останется один. Иначе третье и четвёртое места были бы не местами, а
    случайным порядком, в котором игроки сидели.
  */
  function takePlace(state, seat) {
    const player = state.players[seat];
    if (player.out) return;
    player.out = true;
    player.place = state.places.length + 1;
    state.places.push(seat);
    player.said = false;
    if (state.risk && state.risk.seat === seat) state.risk = null;
    note(state, `${player.name} вышел из раздачи — ${player.place}-е место.`);

    const left = playing(state);
    if (left.length > 1) return;
    /*
      Остался один — раздача кончилась, и последнее место достаётся ему. Слово
      «проиграл» здесь не звучит нарочно: счёт у него свой, набранный по ходу
      игры, и место — только место.
    */
    if (left.length === 1) {
      const last = left[0];
      last.out = true;
      last.place = state.places.length + 1;
      state.places.push(last.id);
      note(state, `${last.name} остался с картами — ${last.place}-е место.`);
    }
    state.status = 'over';
    state.winner = state.places.length ? state.places[0] : null;
    state.penalty = null;
    state.risk = null;
  }

  /*
    Кончились карты при игре на счёт.

    До трёхсот очков одной руки не хватает никому, а раздавать заново значило
    бы обнулять стол на середине партии. Поэтому тот, кто выложил всё, просто
    берёт ещё шесть и играет дальше — партия одна и идёт до счёта.

    Брать может оказаться неоткуда: и колода, и сброс пусты. Тогда игрок
    выходит, как в раздаче по местам, — иначе стол встал бы на человеке,
    которому нечем ходить.
  */
  const REFILL_HAND = 6;
  function refillHand(state, seat) {
    const player = state.players[seat];
    const taken = drawMany(state, seat, REFILL_HAND);
    if (taken) {
      note(state, `${player.name} выложил всё и берёт ещё ${taken}.`);
      return true;
    }
    note(state, `${player.name} выложил всё, а брать неоткуда.`);
    takePlace(state, seat);
    return false;
  }

  /*
    Счёт за сброшенную карту. Начисляется сразу, тем же ходом: игрок видит, за
    что ему дали очки, пока карта ещё на виду.
  */
  function award(state, seat, card) {
    const player = state.players[seat];
    player.score += R.scoreOf(card);
    if (!state.target || player.score < state.target) return false;
    state.status = 'over';
    state.winner = seat;
    state.penalty = null;
    state.risk = null;
    note(state, `${player.name} набрал ${player.score} — партия окончена.`);
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
    if (R.drawsOf(card)) {
      /*
        Штраф не выдаётся сразу: он кладётся на стол и переходит к соседу. Тот
        волен взять его — или перевести дальше такой же картой, добавив к нему
        свою. Поэтому здесь ход соседа не пропускается: ему как раз и надо
        дать возможность ответить. Пропуск случится сам собой, когда штраф
        возьмут: взявший на этом ход и кончает.
      */
      state.penalty = state.penalty
        ? { kind: card.kind, count: state.penalty.count + R.drawsOf(card) }
        : { kind: card.kind, count: R.drawsOf(card) };
      const seat = nextSeat(state);
      note(state, `${state.players[seat].name}: ${state.penalty.count} карт — взять или перевести дальше.`);
      return { skip: false };
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
    /*
      Объявление снимается с опустевшей руки сразу. «Шабат» говорит «у меня
      одна карта»; карты нет ни одной — и метка, оставленная висеть, соврала
      бы в следующем же ходу, когда игрок возьмёт шесть новых.
    */
    if (!player.hand.length) player.said = false;
    if (R.KINDS[card.kind].wild) card.camp = camp;
    state.pile.push(card);
    state.camp = card.camp;
    state.drawn = null;
    state.phase = 'play';
    state.moves += 1;

    const title = card.kind === 'number'
      ? `${R.campOf(card.camp).name}, suerte ${card.rank}`
      : `${R.KINDS[card.kind].title} (${R.campOf(card.camp).name})`;
    note(state, `${player.name}: ${title}.`);

    // Счёт растёт сразу, за сброшенную карту, и может кончить партию прямо тут.
    if (award(state, seat, card)) return true;

    /*
      Рука опустела. При игре на счёт это не конец: игрок берёт ещё шесть и
      продолжает. В раздаче по местам — конец для него: он занял место, а
      остальные доигрывают.
    */
    if (!player.hand.length) {
      if (state.target) refillHand(state, seat);
      else takePlace(state, seat);
      if (state.status !== 'playing') return true;
    }
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
    Подброс — ход вне очереди.

    Отличий от обычного хода три, и все три нарочные.

    Первое: действие подброшенной карты не срабатывает. «Суббота», брошенная
    вне очереди, никого не отправляет отдыхать, «Странствие» не выдаёт карт.
    Иначе подброс был бы не ловкостью, а оружием: сидя с двумя субботами,
    можно было бы держать соседа без хода сколько угодно.

    Второе: ход продолжается от подбросившего. В этом весь смысл — круг
    перескакивает к нему, и следующим ходит тот, кто сидит за ним.

    Третье: подбросить может кто угодно, кроме того, чей ход сейчас, — тому
    подбрасывать не надо, он и так ходит.
  */
  function canJump(state, seat) {
    if (state.status !== 'playing' || state.phase !== 'play') return [];
    if (state.turn === seat) return [];
    const player = state.players[seat];
    if (!player || player.out) return [];
    const out = [];
    for (let i = 0; i < player.hand.length; i += 1) {
      if (R.jumpable(state, player.hand[i])) out.push(i);
    }
    return out;
  }

  function jump(state, seat, index) {
    if (!canJump(state, seat).includes(index)) return false;
    const player = state.players[seat];
    const card = player.hand[index];

    player.hand.splice(index, 1);
    if (!player.hand.length) player.said = false;
    state.pile.push(card);
    state.camp = card.camp;
    state.drawn = null;
    state.phase = 'play';
    state.moves += 1;
    note(state, `${player.name} подбросил: ${R.campOf(card.camp).name}, ${card.kind === 'number'
      ? `suerte ${card.rank}` : R.KINDS[card.kind].title.toLowerCase()} — ход перешёл к нему.`);

    if (award(state, seat, card)) return true;
    if (!player.hand.length) {
      if (state.target) refillHand(state, seat);
      else takePlace(state, seat);
      if (state.status !== 'playing') return true;
    }
    if (player.hand.length === 1) { player.said = false; markRisk(state, seat); }

    /*
      Действие не срабатывает, поэтому и пропускать некого: ход просто идёт от
      подбросившего дальше по кругу. Если он сам этой картой и вышел, очередь
      обойдёт его — за тем она и умеет обходить вышедших.
    */
    state.turn = nextSeat(state, seat, 1);
    return true;
  }

  /*
    Взять карту. Берут одну и только один раз за ход: взятую можно сыграть
    сразу, если она подошла, или отказаться — тогда ход переходит дальше.
  */
  function draw(state, seat) {
    if (state.status !== 'playing' || state.turn !== seat || state.phase !== 'play') return null;
    /*
      Штраф на столе — берут его целиком, и ход на этом кончается. Сыграть
      взятое нельзя: это не «взял карту, вдруг подойдёт», а расплата за то,
      что перевести долг дальше оказалось нечем.
    */
    if (state.penalty) {
      const count = state.penalty.count;
      const taken = drawMany(state, seat, count);
      state.penalty = null;
      state.moves += 1;
      note(state, `${state.players[seat].name} берёт ${taken} и пропускает ход.`);
      state.turn = nextSeat(state);
      return null;
    }
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
    createGame, deal, current, nextSeat, playing,
    play, draw, pass, shabbat, canCatch, catchOut, canJump, jump,
    legalMoves: (state, seat) => R.legalMoves(state, seat),
    riskOpen,
  };
}());
