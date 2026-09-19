// «Двенадцать колен»: правила держатся сами.
//
// Карточная игра ломается тихо. Колода теряет карту — и никто не замечает
// полпартии; «Плен» уходит в ход, когда не должен, — и соперник просто
// проигрывает, не понимая почему; раздача не кончается вовсе — и телефон
// греется, пока игрок ждёт хода бота. Ни одну из этих бед не видно на экране,
// поэтому здесь играется несколько тысяч раздач, и после каждого действия
// пересматривается весь стол.
//
//   node scripts/check-twelve-tribes.mjs
//
// Случайность посеяна числом: упавшая проверка обязана падать снова на том же
// месте, иначе чинить нечего.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'web/games');

const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
for (const file of ['twelve-tribes-rules.js', 'twelve-tribes-engine.js', 'twelve-tribes-bots.js']) {
  const code = fs.readFileSync(path.join(dir, file), 'utf8');
  new Function('window', code)(sandbox.window);
}
const R = sandbox.window.TwelveTribesRules;
const E = sandbox.window.TwelveTribesEngine;
const Bots = sandbox.window.TwelveTribesBots;

const problems = [];
const seen = new Set();
const fault = (kind, detail) => {
  if (seen.has(kind)) return;
  seen.add(kind);
  problems.push(`${kind}: ${detail}`);
};
const need = (condition, message) => { if (!condition) problems.push(message); };

/** Тасовка с зерном: одна и та же партия воспроизводится дословно. */
function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ——————————————————————————————————————————————— состав колоды

const deck = R.buildDeck();
need(deck.length === 108, `в колоде ${deck.length} карт вместо ста восьми`);
const ids = new Set(deck.map((card) => card.id));
need(ids.size === deck.length, 'в колоде есть карты с одинаковым номером');
const count = (test) => deck.filter(test).length;
need(count((c) => c.kind === 'number') === 76,
  `цифровых карт ${count((c) => c.kind === 'number')} вместо 76`);
need(count((c) => c.kind === 'number' && c.rank === 0) === 4,
  'нулей должно быть четыре — по одному на стан');
for (let rank = 1; rank <= 9; rank += 1) {
  need(count((c) => c.kind === 'number' && c.rank === rank) === 8,
    `жребиев «${rank}» ${count((c) => c.kind === 'number' && c.rank === rank)} вместо восьми`);
}
for (const kind of ['sabbath', 'jordan', 'journey']) {
  need(count((c) => c.kind === kind) === 8,
    `карт «${R.KINDS[kind].title}» ${count((c) => c.kind === kind)} вместо восьми`);
}
need(count((c) => c.kind === 'lot') === 4, 'жребиев колен должно быть четыре');
need(count((c) => c.kind === 'exile') === 4, 'карт плена должно быть четыре');
need(count((c) => c.camp === null) === 8, 'без стана должны быть только жребий и плен');
for (const camp of R.CAMP_IDS) {
  need(count((c) => c.camp === camp) === 25, `в стане ${camp} не 25 карт`);
}
// Каждый стан назван своей стороной света и своими коленами — иначе это не
// станы из Чисел, а просто четыре цвета.
need(R.CAMPS.length === 4 && R.CAMPS.every((camp) => camp.tribes.length === 3),
  'станов должно быть четыре, по три колена в каждом');
need(new Set(R.CAMPS.flatMap((camp) => camp.tribes)).size === 12,
  'колен должно быть двенадцать, и все разные');

// ——————————————————————————————————————————————— стол после каждого действия

/** Всё, что обязано быть верно про раздачу в любой её миг. */
function audit(state, where) {
  const all = [...state.deck, ...state.pile, ...state.players.flatMap((one) => one.hand)];
  // 1. Карты не появляются и не пропадают.
  if (all.length !== 108) fault('карт на столе не 108', `${all.length} (${where})`);
  if (new Set(all.map((card) => card.id)).size !== all.length) {
    fault('карта раздвоилась', where);
  }
  // 2. Верхняя карта сброса всегда есть, и стан стола — её стан.
  const top = state.pile[state.pile.length - 1];
  if (!top) { fault('сброс пуст', where); return; }
  if (!top.camp) fault('на столе карта без стана', `${top.kind} (${where})`);
  if (state.camp !== top.camp) {
    fault('стан стола разошёлся с верхней картой', `${state.camp} ≠ ${top.camp} (${where})`);
  }
  // 3. Жребий, ушедший в колоду, снова без стана: иначе он вернётся покрашенным.
  for (const card of state.deck) {
    if (R.KINDS[card.kind].wild && card.camp) fault('жребий в колоде остался покрашенным', where);
  }
  // 4. Рука не бывает отрицательной, а очки — убывающими.
  for (const player of state.players) {
    if (player.hand.length < 0) fault('рука ушла в минус', where);
    if (player.score < 0) fault('очки ушли в минус', `${player.name} ${player.score}`);
  }
  // 5. Объявление стоит только на том, у кого одна карта.
  for (const player of state.players) {
    if (player.said && player.hand.length !== 1) {
      fault('«Шабат» объявлен не на последней карте', `${player.name}: ${player.hand.length} карт`);
    }
  }
}

/*
  Одна раздача ботами. Возвращает число ходов: по нему видно, что раздача
  вообще кончается, а не ходит по кругу.
*/
function playRound(state, random, tale) {
  let moves = 0;
  while (state.status === 'playing' && moves < 4000) {
    const seat = state.turn;
    const player = state.players[seat];
    const before = state.pile.length + state.deck.length
      + state.players.reduce((sum, one) => sum + one.hand.length, 0);
    if (before !== 108) fault('счёт карт сбился до хода', `${before}`);

    /*
      Подброс. Идёт до хода очередного игрока и вместо него: подбросивший
      перехватывает круг на себя. Здесь он делается всегда, когда есть чем, —
      проверке нужен не характер соперника, а сам путь: подбросов должно
      случиться много, и после каждого стол обязан сойтись.
    */
    let jumped = false;
    for (const one of state.players) {
      if (one.id === seat || one.out) continue;
      const hasJump = E.canJump(state, one.id);
      if (!hasJump.length) continue;
      const top = state.pile[state.pile.length - 1];
      const card = one.hand[hasJump[0]];
      if (card.kind !== top.kind || card.camp !== top.camp) {
        fault('подброшена не та же карта', `${card.kind} ${card.camp} на ${top.kind} ${top.camp}`);
      }
      const penaltyBefore = state.penalty;
      if (!E.jump(state, one.id, hasJump[0])) fault('движок отказал в законном подбросе', one.name);
      if (state.penalty !== penaltyBefore) {
        fault('подброшенная карта сработала действием', `${card.kind}`);
      }
      tale.jumped += 1;
      jumped = true;
      break;
    }
    if (jumped) {
      moves += 1;
      audit(state, `подброс, ход ${moves}`);
      continue;
    }

    const choice = Bots.pick(state, seat);
    if (choice) {
      const card = player.hand[choice.index];
      // «Плен» кладётся только при пустом стане — это проверяется до хода,
      // а не после: движок обязан отказать, если условие нарушено.
      // Под переводом запрет не действует: «Плен» кроют «Пленом» от беды, а
      // не от хорошей жизни.
      if (!state.penalty && card.kind === 'exile'
        && player.hand.some((one) => one.camp === state.camp)) {
        fault('плен предложен при своём стане на руках', `${player.name}`);
      }
      const scoreBefore = player.score;
      const covering = Boolean(state.penalty);
      const wasLast = player.hand.length === 1;
      const done = E.play(state, seat, choice.index, choice.camp);
      if (!done) fault('движок отказал в законном ходе', `${player.name}, ${card.kind}`);
      /*
        Счёт начисляется сразу и ровно за сброшенную карту. Проверяется это на
        каждом ходу, а не в конце: иначе ошибка в цене одной карты растворилась
        бы в сумме за всю партию.
      */
      const gained = player.score - scoreBefore;
      if (gained !== R.scoreOf(card)) {
        fault('за сброшенную карту начислено не то', `${card.kind} ${card.rank}: ${gained}`);
      }
      if (covering) tale.passed += 1;
      /*
        Выложил всё при игре на счёт — значит, добрал шесть. Считается по руке
        до хода, а не после: после хода в ней уже лежат те самые шесть, и по
        ней ничего не видно.
      */
      if (state.target && wasLast && !player.out && state.status === 'playing') {
        tale.topped += 1;
        if (player.hand.length !== 6 && state.deck.length + state.pile.length > 1) {
          fault('выложивший всё добрал не шесть', `${player.name}: ${player.hand.length}`);
        }
      }
    } else {
      /*
        Взял карту — сыграй её, если подошла. Так играет человек, и так
        раздача не превращается в бесконечное перекладывание колоды.
      */
      const penalty = state.penalty ? state.penalty.count : 0;
      const had = player.hand.length;
      E.draw(state, seat);
      if (penalty && player.hand.length !== had + penalty && state.deck.length + state.pile.length > 1) {
        fault('штраф выдан не полностью', `${player.name}: ${player.hand.length - had} из ${penalty}`);
      }
      if (penalty && state.penalty) fault('штраф взят, а долг остался', `${player.name}`);
      if (state.status === 'playing' && state.turn === seat && state.phase === 'drawn') {
        const after = Bots.pick(state, seat);
        if (after) E.play(state, seat, after.index, after.camp);
        else E.pass(state, seat);
      }
    }
    // Объявление и поимка — ботами же, по их забывчивости.
    for (const one of state.players) {
      if (one.hand.length === 1 && !one.said && Bots.remembers(one.botLevel, random)) {
        E.shabbat(state, one.id);
      }
    }
    if (E.riskOpen(state)) {
      const target = state.risk.seat;
      for (const one of state.players) {
        if (one.id === target || !Bots.notices(one.botLevel, random)) continue;
        const had = state.players[target].hand.length;
        if (E.catchOut(state, one.id, target)) {
          if (state.players[target].hand.length !== had + 2) {
            fault('поимка выдала не две карты', `${state.players[target].name}`);
          }
          tale.caught += 1;
          break;
        }
      }
    }
    moves += 1;
    audit(state, `${player.name}, ход ${moves}`);
  }
  if (state.status === 'playing') fault('раздача не кончилась за 4000 ходов', `раздача ${state.round}`);
  return moves;
}

// ——————————————————————————————————————————————— много партий подряд

const tale = {
  rounds: 0, moves: 0, caught: 0, refills: 0, longest: 0, wins: new Map(),
  // Отдельно по способам игры: партия на счёт и партия по местам — это две
  // разные по длине игры, и мерить их одной цифрой значит не померить ни одну.
  score: { games: 0, moves: 0, longest: 0 },
  places: { games: 0, moves: 0, longest: 0 },
  passed: 0,   // сколько раз долг перевели дальше, а не взяли
  jumped: 0,   // сколько раз подбросили карту вне очереди
  topped: 0,   // сколько раз выложивший всё добрал шесть карт на счёт
};
const GAMES = 240;
for (let game = 0; game < GAMES; game += 1) {
  const random = seeded(1917 + game * 7919);
  /*
    За столом от двоих до восьмерых. Восьмером колода уходит на руки почти
    наполовину (56 карт из 108), перетасовка сброса случается в каждой второй
    раздаче, а «Иордан» меняет сторону там, где сторон много, — то есть ровно
    то, что вдвоём и втроём не проверяется вовсе.
  */
  const seats = 2 + (game % (R.SEATS_MAX - 1));
  const state = E.createGame({
    random,
    target: game % 2 ? 300 : 0,
    players: Array.from({ length: seats }, (_, i) => ({ name: `Игрок ${i + 1}`, isBot: true })),
  });
  for (const player of state.players) player.botLevel = player.id % 2 ? 'scribe' : 'elder';

  /*
    Партия идёт целиком, без раздач: на счёт — пока кто-нибудь не наберёт
    трёхсот, по местам — пока за столом не останется один. Раздача больше не
    обрывает партию, поэтому и внешнего круга по раздачам здесь нет.
  */
  const moves = playRound(state, random, tale);
  tale.rounds += 1;
  tale.moves += moves;
  tale.longest = Math.max(tale.longest, moves);
  const kind = state.target ? tale.score : tale.places;
  kind.games += 1;
  kind.moves += moves;
  kind.longest = Math.max(kind.longest, moves);
  need(state.status === 'over', `партия ${game} не кончилась за ${moves} ходов`);

  if (state.target) {
    need(state.players[state.winner].score >= state.target,
      `партия до ${state.target} кончилась на ${state.players[state.winner].score}`);
    for (const one of state.players) {
      if (one.id === state.winner) continue;
      need(one.score < state.target, `${one.name} тоже набрал ${one.score}, а партия кончилась не им`);
    }
  } else {
    /*
      Места. Каждому — своё, по порядку выхода: первый вышедший первый, и так
      до последнего, у которого карты так и остались. Ни одного пропущенного
      места и ни одного повторённого.
    */
    const places = state.players.map((one) => one.place).sort((a, b) => a - b);
    const wanted = state.players.map((_, at) => at + 1);
    need(places.join(',') === wanted.join(','), `места розданы как ${places.join(',')}`);
    need(state.players.every((one) => one.out), 'партия кончилась, а кто-то ещё за столом');
    need(state.places.length === state.players.length,
      `в списке выхода ${state.places.length} мест на ${state.players.length} игроков`);
    need(state.winner === state.places[0], 'первым вышел не тот, кого объявили победителем');
    const last = state.players.find((one) => one.place === state.players.length);
    need(last.hand.length > 0 || state.deck.length + state.pile.length <= 1,
      'последним остался игрок без карт');
  }
  const winner = state.players[state.winner].name;
  tale.wins.set(winner, (tale.wins.get(winner) || 0) + 1);
}

// ——————————————————————————————————————————————— нарочные положения

/** Стол под опыт: рука, стан и верхняя карта задаются прямо. */
function bench({ hands, camp, kind = 'number', rank = 5, seats = 2 }) {
  const state = E.createGame({
    random: seeded(7),
    target: 0,
    players: Array.from({ length: seats }, (_, i) => ({ name: `И${i + 1}`, isBot: true })),
  });
  const pool = R.buildDeck();
  const take = (test) => {
    const at = pool.findIndex(test);
    return pool.splice(at, 1)[0];
  };
  state.pile = [take((c) => c.kind === kind && c.camp === camp && (kind !== 'number' || c.rank === rank))];
  state.camp = camp;
  state.deck = pool;
  state.turn = 0;
  state.dir = 1;
  state.phase = 'play';
  state.players.forEach((player, seat) => {
    player.hand = (hands[seat] || []).map((spec) => take(
      (c) => c.kind === spec.kind && (spec.camp === undefined || c.camp === spec.camp)
        && (spec.rank === undefined || c.rank === spec.rank),
    ));
  });
  return state;
}

// 1. «Плен» при своём стане на руках — ход невозможен.
{
  const state = bench({
    camp: 'judah',
    hands: [[{ kind: 'exile' }, { kind: 'number', camp: 'judah', rank: 3 }]],
  });
  need(!R.playable(state, state.players[0].hand[0], state.players[0].hand),
    'плен разрешён, хотя в руке есть карта нынешнего стана');
  need(E.play(state, 0, 0, 'dan') === false, 'движок принял плен при своём стане на руках');
  // А без своего стана — можно, и сосед берёт ровно четыре.
  const clean = bench({
    camp: 'judah', seats: 2,
    hands: [[{ kind: 'exile' }, { kind: 'number', camp: 'dan', rank: 3 }], [{ kind: 'number', camp: 'dan', rank: 1 }]],
  });
  const had = clean.players[1].hand.length;
  need(E.play(clean, 0, 0, 'reuben'), 'плен не принят при чужом стане на руках');
  /*
    Плен теперь не выдаёт карты сразу: он кладёт на стол долг, и ход переходит
    соседу — тому надо дать ответить. Карты соседу достаются, когда он этот
    долг возьмёт, и на этом его ход кончается.
  */
  need(clean.players[1].hand.length === had, 'плен выдал карты сразу, не дав ответить');
  need(clean.penalty && clean.penalty.count === 4, `на столе долг ${clean.penalty?.count} вместо четырёх`);
  need(clean.camp === 'reuben', 'плен не сменил стан на названный');
  need(clean.turn === 1, 'после плена ход не перешёл к тому, на кого он положен');
  need(E.draw(clean, 1) === null, 'взятие долга вернуло карту, как обычный добор');
  need(clean.players[1].hand.length === had + 4, 'по плену сосед взял не четыре карты');
  need(clean.penalty === null, 'долг взят, а на столе остался');
  need(clean.turn === 0, 'взявший долг не кончил ход');
}

// 2. «Суббота» пропускает соседа, «Иордан» разворачивает круг.
{
  // В руке нарочно две карты: сыграв последнюю, игрок выиграл бы раздачу, и
  // ход никуда бы не пошёл — опыт спрашивал бы не про субботу, а про конец.
  const state = bench({
    camp: 'judah', seats: 3,
    hands: [[{ kind: 'sabbath', camp: 'judah' }, { kind: 'number', camp: 'dan', rank: 7 }], [], []],
  });
  E.play(state, 0, 0, null);
  need(state.turn === 2, `после субботы ходит место ${state.turn}, а должно третье`);

  const back = bench({
    camp: 'judah', seats: 3,
    hands: [[{ kind: 'jordan', camp: 'judah' }, { kind: 'number', camp: 'judah', rank: 1 }], [], []],
  });
  E.play(back, 0, 0, null);
  need(back.dir === -1 && back.turn === 2,
    `после иордана направление ${back.dir}, ход у места ${back.turn}`);
}

// 3. Вдвоём «Иордан» работает как суббота: ход возвращается к тому же игроку.
{
  const state = bench({
    camp: 'judah', seats: 2,
    hands: [[{ kind: 'jordan', camp: 'judah' }, { kind: 'number', camp: 'judah', rank: 1 }], []],
  });
  E.play(state, 0, 0, null);
  need(state.turn === 0, 'вдвоём иордан отдал ход сопернику вместо возврата');
}

// 4. «Шабат»: объявившего не перебить, забывшего — перебить и выдать две.
{
  const state = bench({
    camp: 'judah', seats: 2,
    hands: [[{ kind: 'number', camp: 'judah', rank: 2 }, { kind: 'number', camp: 'dan', rank: 4 }], []],
  });
  E.play(state, 0, 0, null);
  need(E.riskOpen(state), 'после хода на последнюю карту окно поимки не открылось');
  need(E.canCatch(state, 1), 'соперник не может поймать забывшего');
  need(!E.canCatch(state, 0), 'игрок может поймать сам себя');
  need(E.shabbat(state, 0), '«Шабат» не принят у того, у кого одна карта');
  need(!E.canCatch(state, 1), 'объявившего всё ещё можно поймать');

  const late = bench({
    camp: 'judah', seats: 2,
    hands: [[{ kind: 'number', camp: 'judah', rank: 2 }, { kind: 'number', camp: 'dan', rank: 4 }], []],
  });
  E.play(late, 0, 0, null);
  need(E.catchOut(late, 1, 0), 'поимка не сработала');
  need(late.players[0].hand.length === 3, 'пойманный получил не две карты');
  need(!E.riskOpen(late), 'после поимки окно осталось открытым');
}

// 5. Колода кончилась — в неё уходит сброс, кроме верхней карты.
{
  const state = bench({
    camp: 'judah', seats: 2,
    hands: [[{ kind: 'number', camp: 'dan', rank: 9 }], [{ kind: 'number', camp: 'dan', rank: 8 }]],
  });
  // Всё, что не на руках и не на столе, перекладывается в сброс: колода пуста.
  state.pile = [state.pile[0], ...state.deck.splice(0, state.deck.length)];
  const top = state.pile[state.pile.length - 1];
  state.camp = top.camp;
  const card = E.draw(state, 0);
  need(card !== null, 'при пустой колоде карта не взялась даже после перетасовки');
  need(state.pile.length === 1, `после перетасовки в сбросе осталось ${state.pile.length} карт`);
  /*
    Верхняя карта остаётся верхней. Это и есть смысл правила: игра не
    прерывается, ход продолжается с той же карты, а под колоду уходит только
    то, что уже отыграно.
  */
  need(state.pile[0].id === top.id, 'перетасовка унесла под колоду верхнюю карту, с которой идёт игра');
  need(state.camp === top.camp, 'после перетасовки стан стола разошёлся с верхней картой');
  need(state.deck.length > 90, 'сброс не вернулся в колоду');
  need(state.reshuffled >= 0, 'перетасовка не отмечена — столу нечего показать игроку');
  tale.refills += 1;
}

// 7. Стол на восьмерых: раздача сдаётся всем, и колода этого не замечает.
{
  const state = E.createGame({
    random: seeded(20250918),
    players: Array.from({ length: R.SEATS_MAX }, (_, i) => ({ name: `Место ${i + 1}`, isBot: true })),
  });
  need(state.players.length === 8, `за стол село ${state.players.length} вместо восьми`);
  for (const player of state.players) {
    need(player.hand.length === R.HAND, `${player.name} получил ${player.hand.length} карт вместо семи`);
  }
  const onHands = state.players.reduce((sum, one) => sum + one.hand.length, 0);
  need(onHands === 56, `на руках ${onHands} карт вместо пятидесяти шести`);
  need(state.deck.length + state.pile.length + onHands === 108,
    'восьмером колода не сошлась в сто восемь карт');
}

// 6. Пустой стол: брать нечего — ход просто уходит дальше, а не зависает.
{
  const state = bench({ camp: 'judah', seats: 2, hands: [[{ kind: 'number', camp: 'dan', rank: 9 }], []] });
  state.deck = [];
  state.pile = [state.pile[state.pile.length - 1]];
  need(E.draw(state, 0) === null, 'из пустой колоды взялась карта');
  need(state.turn === 1, 'при пустом столе ход не перешёл дальше');
}

/*
  8. Перевод штрафа. Подкинули «Странствие» — сосед волен не брать, а положить
  своё: долг растёт и уходит дальше. Проверяется вся цепочка, потому что
  ломается она посередине: долг может не сложиться, не перейти или выдаться не
  тому.
*/
{
  const state = bench({
    camp: 'judah', seats: 3,
    hands: [
      [{ kind: 'journey', camp: 'judah' }],
      [{ kind: 'journey', camp: 'dan' }, { kind: 'number', camp: 'judah', rank: 4 }],
      [{ kind: 'number', camp: 'judah', rank: 7 }],
    ],
  });
  need(E.play(state, 0, 0, 'judah'), 'странствие не принято');
  need(state.penalty?.count === 2, `после странствия долг ${state.penalty?.count} вместо двух`);
  need(state.turn === 1, 'долг положен не на соседа');

  // Под долгом законна одна карта — такая же. Цифра своего стана не спасает.
  const moves = R.legalMoves(state, 1);
  need(moves.length === 1 && state.players[1].hand[moves[0]].kind === 'journey',
    `под долгом законны ходы ${moves.length}, а должен быть один`);
  need(!R.playable(state, state.players[1].hand[1], state.players[1].hand),
    'цифра своего стана прошла под долгом');

  need(E.play(state, 1, 0, 'dan'), 'перевод странствия не принят');
  need(state.penalty?.count === 4, `после перевода долг ${state.penalty?.count} вместо четырёх`);
  need(state.turn === 2, 'переведённый долг не ушёл дальше');
  need(state.players[1].hand.length === 1, 'переводивший всё-таки взял карты');

  const had = state.players[2].hand.length;
  E.draw(state, 2);
  need(state.players[2].hand.length === had + 4, 'последний в цепочке взял не четыре карты');
  need(state.penalty === null, 'взятый долг остался на столе');
  /*
    Ход уходит не к первому игроку, а мимо него: он сыграл здесь свою
    единственную карту и вышел из раздачи первым. Проверяется заодно и это —
    очередь обязана обходить вышедшего, иначе стол встанет на пустом месте.
  */
  need(state.players[0].out === true && state.players[0].place === 1,
    'сыгравший последнюю карту не вышел из раздачи');
  need(state.turn === 1, `после взятия долга ходит ${state.turn}, а должен второй игрок`);
}

/*
  9. Плен кроется пленом, и вдвоём тоже: долг доходит до восьми и возвращается
  тому, кто его начал, — если крыть ему нечем.
*/
{
  const state = bench({
    camp: 'judah', seats: 2,
    hands: [
      [{ kind: 'exile' }, { kind: 'number', camp: 'dan', rank: 2 }],
      [{ kind: 'exile' }, { kind: 'number', camp: 'dan', rank: 6 }],
    ],
  });
  need(E.play(state, 0, 0, 'reuben'), 'плен не принят');
  need(state.penalty?.count === 4, 'плен положил не четыре');
  /*
    Запрет «плен только при пустом стане» под долгом не действует: иначе
    перевести было бы нечем как раз тогда, когда это и нужно.
  */
  need(R.playable(state, state.players[1].hand[0], state.players[1].hand),
    'плен не кроется пленом');
  need(E.play(state, 1, 0, 'dan'), 'перевод плена не принят');
  need(state.penalty?.count === 8, `после перевода долг ${state.penalty?.count} вместо восьми`);
  need(state.turn === 0, 'долг не вернулся к начавшему');
  const had = state.players[0].hand.length;
  E.draw(state, 0);
  need(state.players[0].hand.length === had + 8, 'начавший взял не восемь карт');
}

/*
  10. Кончились карты при игре на счёт — берёшь ещё шесть и играешь дальше.
  Раздача при этом не кончается: до трёхсот одной руки не хватает никому.
*/
{
  const state = bench({
    camp: 'judah', seats: 2,
    hands: [[{ kind: 'number', camp: 'judah', rank: 4 }], [{ kind: 'number', camp: 'dan', rank: 6 }]],
  });
  state.target = 300;
  need(E.play(state, 0, 0, 'judah'), 'последняя карта не сыгралась');
  need(state.status === 'playing', 'партия на счёт кончилась на пустой руке');
  need(state.players[0].hand.length === 6,
    `выложившему всё досталось ${state.players[0].hand.length} карт вместо шести`);
  need(state.players[0].out === false, 'на счёт игрок вышел из партии, а не добрал карты');
  need(state.players[0].score === 4, `за жребий 4 начислено ${state.players[0].score}`);
}

/*
  11. Места. В раздаче по местам выложивший всё выходит и получает место, а
  остальные доигрывают: иначе третье и четвёртое места были бы не местами, а
  порядком, в котором игроки сидели.
*/
{
  const state = bench({
    camp: 'judah', seats: 3,
    hands: [
      [{ kind: 'number', camp: 'judah', rank: 4 }],
      [{ kind: 'number', camp: 'dan', rank: 6 }, { kind: 'number', camp: 'dan', rank: 8 }],
      [{ kind: 'number', camp: 'reuben', rank: 3 }],
    ],
  });
  need(E.play(state, 0, 0, 'judah'), 'последняя карта не сыгралась');
  need(state.players[0].out === true, 'выложивший всё остался за столом');
  need(state.players[0].place === 1, `первому вышедшему дали ${state.players[0].place}-е место`);
  need(state.status === 'playing', 'раздача кончилась на первом же вышедшем');
  need(state.turn === 1, 'ход не перешёл к тому, кто ещё играет');
  need(E.nextSeat(state, 1) === 2, 'очередь не обходит вышедшего');
  need(E.nextSeat(state, 2) === 1, 'очередь вернулась к вышедшему');

  // Счёт за сброшенное начисляется и в раздаче по местам.
  need(state.players[0].score === 4, `за жребий 4 начислено ${state.players[0].score}`);
}

/*
  12. Действие стоит три очка — любое, и жребий колен тоже. Цена сброшенной
  карты живёт в правилах, а не в движке, и спрашивается прямо.
*/
{
  need(R.scoreOf({ kind: 'number', rank: 7 }) === 7, 'жребий стоит не своей цифры');
  for (const kind of ['sabbath', 'jordan', 'journey', 'lot', 'exile']) {
    need(R.scoreOf({ kind }) === 3, `${kind} стоит не три очка`);
  }
}

/*
  13. Подброс вне очереди. Кто-то положил пятёрку Иуды, а у вас такая же — её
  можно бросить сразу, и круг перескочит к вам. Проверяется и то, что подброс
  разрешён, и то, чем он ограничен: совпасть карта должна целиком.
*/
{
  const state = bench({
    camp: 'judah', rank: 5, seats: 3,
    hands: [
      [{ kind: 'number', camp: 'judah', rank: 9 }],
      [{ kind: 'number', camp: 'judah', rank: 5 }, { kind: 'number', camp: 'dan', rank: 5 }],
      [{ kind: 'number', camp: 'judah', rank: 3 }],
    ],
  });
  need(E.canJump(state, 1).length === 1,
    `подбросить можно ${E.canJump(state, 1).length} картами вместо одной`);
  need(!R.jumpable(state, state.players[1].hand[1]), 'подброс прошёл по одному жребию, без стана');
  need(!R.jumpable(state, state.players[2].hand[0]), 'подброс прошёл по одному стану, без жребия');
  need(E.canJump(state, 0).length === 0, 'тому, чей ход, предложили подбросить');

  need(E.jump(state, 1, 0), 'подброс не принят');
  need(state.pile[state.pile.length - 1].rank === 5, 'подброшенная карта не легла на стол');
  need(state.turn === 2, `после подброса ходит ${state.turn}, а должен сосед за подбросившим`);
  need(state.players[1].score === 5, `за подброшенный жребий 5 начислено ${state.players[1].score}`);
}

/*
  14. Подброшенное действие не срабатывает. Иначе, сидя с двумя субботами,
  можно было бы держать соседа без хода сколько угодно — а подброс придуман
  как ловкость, а не как оружие.
*/
{
  const state = bench({
    camp: 'judah', kind: 'journey', seats: 3,
    hands: [
      [{ kind: 'number', camp: 'judah', rank: 9 }],
      [{ kind: 'journey', camp: 'judah' }, { kind: 'number', camp: 'dan', rank: 2 }],
      [{ kind: 'number', camp: 'judah', rank: 3 }],
    ],
  });
  const had = state.players[2].hand.length;
  need(E.jump(state, 1, 0), 'подброс странствия не принят');
  need(state.penalty === null, 'подброшенное странствие положило долг');
  need(state.players[2].hand.length === had, 'подброшенное странствие выдало карты');
  need(state.turn === 2, 'после подброса странствия ход ушёл не туда');
  need(state.players[1].score === 3, `за подброшенное действие начислено ${state.players[1].score}`);
}

/*
  15. Под долгом подбрасывать нельзя: стол занят другим разговором, и до
  ответа на перевод очередь никуда не идёт.
*/
{
  const state = bench({
    camp: 'judah', seats: 3,
    hands: [
      [{ kind: 'journey', camp: 'judah' }],
      [{ kind: 'number', camp: 'dan', rank: 2 }],
      [{ kind: 'journey', camp: 'judah' }],
    ],
  });
  need(E.play(state, 0, 0, 'judah'), 'странствие не сыгралось');
  need(state.penalty?.count === 2, 'долг не положен');
  need(E.canJump(state, 2).length === 0, 'под долгом разрешили подбросить');
}

if (problems.length) {
  console.error(`«Двенадцать колен» не прошли проверку (${problems.length}):`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

const spread = [...tale.wins.entries()].map(([name, many]) => `${name} ${many}`).join(', ');
const mean = (part) => (part.games ? Math.round(part.moves / part.games) : 0);
console.log(`OK: колода из 108 карт собрана верно (76 жребиев, 24 действия, 8 без стана); `
  + `${GAMES} партий сыграны до конца — ${tale.moves} ходов. На счёт: ${tale.score.games} партий, `
  + `${mean(tale.score)} ходов в среднем, самая длинная ${tale.score.longest}. По местам: `
  + `${tale.places.games} партий, ${mean(tale.places)} ходов в среднем, самая длинная `
  + `${tale.places.longest}. После каждого хода сходятся все карты, стан стола и объявления, а счёт `
  + `растёт ровно на цену сброшенной карты. Карту подбросили вне очереди ${tale.jumped} раз, `
  + `долг переведён дальше ${tale.passed} раз, `
  + `${tale.topped} раз выложивший всё добрал шесть. Перебито на «Шабате»: ${tale.caught}. Суббота, `
  + `иордан, плен, перевод долга, подброс вне очереди, места и перетасовка сброса проверены `
  + `нарочно. `
  + `Победы: ${spread}.`);
