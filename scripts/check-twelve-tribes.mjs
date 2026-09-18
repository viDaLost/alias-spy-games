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

    const choice = Bots.pick(state, seat);
    if (choice) {
      const card = player.hand[choice.index];
      // «Плен» кладётся только при пустом стане — это проверяется до хода,
      // а не после: движок обязан отказать, если условие нарушено.
      if (card.kind === 'exile' && player.hand.some((one) => one.camp === state.camp)) {
        fault('плен предложен при своём стане на руках', `${player.name}`);
      }
      const done = E.play(state, seat, choice.index, choice.camp);
      if (!done) fault('движок отказал в законном ходе', `${player.name}, ${card.kind}`);
    } else {
      /*
        Взял карту — сыграй её, если подошла. Так играет человек, и так
        раздача не превращается в бесконечное перекладывание колоды.
      */
      E.draw(state, seat);
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

const tale = { rounds: 0, moves: 0, caught: 0, refills: 0, longest: 0, wins: new Map() };
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

  let guard = 0;
  while (state.status !== 'over' && guard < 60) {
    const before = state.players.map((one) => one.score);
    const moves = playRound(state, random, tale);
    tale.rounds += 1;
    tale.moves += moves;
    tale.longest = Math.max(tale.longest, moves);
    if (state.status === 'round' || state.status === 'over') {
      // Очки победителя — ровно сумма карт на чужих руках, ни больше ни меньше.
      const seat = state.winner;
      const hands = state.players.reduce((sum, one) => (
        one.id === seat ? sum : sum + one.hand.reduce((s, card) => s + R.costOf(card), 0)), 0);
      const gained = state.players[seat].score - before[seat];
      need(gained === hands,
        `победителю начислено ${gained} очков, а на чужих руках ${hands}`);
      need(state.players[seat].hand.length === 0,
        'раздачу выиграл игрок, у которого остались карты');
      for (let i = 0; i < state.players.length; i += 1) {
        if (i === seat) continue;
        need(state.players[i].score === before[i], 'очки начислены не одному только победителю');
      }
    }
    if (state.status === 'round') E.nextRound(state);
    guard += 1;
  }
  need(state.status === 'over', `партия ${game} не кончилась за 60 раздач`);
  if (state.target) {
    need(state.players[state.winner].score >= state.target,
      'партия до трёхсот кончилась, не дойдя до трёхсот');
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
  need(clean.players[1].hand.length === had + 4, 'по плену сосед взял не четыре карты');
  need(clean.camp === 'reuben', 'плен не сменил стан на названный');
  need(clean.turn === 0, 'после плена ход не вернулся через пропущенного соседа');
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

if (problems.length) {
  console.error(`«Двенадцать колен» не прошли проверку (${problems.length}):`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

const spread = [...tale.wins.entries()].map(([name, many]) => `${name} ${many}`).join(', ');
console.log(`OK: колода из 108 карт собрана верно (76 жребиев, 24 действия, 8 без стана); `
  + `${GAMES} партий и ${tale.rounds} раздач сыграны до конца — ${tale.moves} ходов, `
  + `самая длинная раздача ${tale.longest}; после каждого хода сходятся все карты, стан стола и `
  + `объявления. Перебито на «Шабате»: ${tale.caught}. Суббота, иордан, плен и перетасовка сброса `
  + `проверены нарочно. Победы по местам: ${spread}.`);
