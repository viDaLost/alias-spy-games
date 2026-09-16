// «Земля обетованная»: правила считаются, а не обещаются.
//
// Весь замысел игры держится на четырёх утверждениях, и каждое из них
// проверяемо счётом, а не спором:
//
//   * партия кончается — и именно через объявленное число лет;
//   * никто не выбывает: разорившийся идёт в наём и продолжает ходить;
//   * в субботний год плата за проход не берётся вовсе;
//   * побеждает не обязательно богатейший.
//
// Движок написан чистым — без DOM, сети и часов, — поэтому прогнать тысячу
// партий можно прямо здесь, без браузера. Ради этого он таким и написан.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'cloudflare/promised-land-preview/public');

// Файлы игры — классические скрипты: они кладут себя в window. Здесь window
// подменяется объектом, и тот же код работает без страницы.
const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
for (const file of ['board.js', 'cards.js', 'engine.js', 'bots.js']) {
  const code = fs.readFileSync(path.join(dir, file), 'utf8');
  new Function('window', code)(sandbox.window);
}
const B = sandbox.window.PromisedLandBoard;
const E = sandbox.window.PromisedLandEngine;
const Bots = sandbox.window.PromisedLandBots;
const CARDS = sandbox.window.PromisedLandCards;

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

// --- 1. поле ----------------------------------------------------------------
need(B.BOARD.length === 36, `на поле ${B.BOARD.length} клеток вместо 36`);
B.BOARD.forEach((cell, index) => {
  need(cell.n === index, `клетка ${index} помнит свой номер как ${cell.n}`);
  need(Boolean(cell.name), `у клетки ${index} нет названия`);
});

const counts = B.BOARD.reduce((acc, cell) => { acc[cell.kind] = (acc[cell.kind] || 0) + 1; return acc; }, {});
need(counts.plot === 16, `уделов ${counts.plot}, а не 16`);
need(counts.road === 4, `караванных путей ${counts.road}, а не 4`);
need(counts.well === 2, `источников ${counts.well}, а не 2`);
need(counts.providence === 4 && counts.mercy === 3, 'карточных клеток стало другое число');

for (const key of Object.keys(B.GROUPS)) {
  const size = B.groupCells(key).length;
  need(size >= 2, `в уделе ${B.GROUPS[key].name} всего ${size} клетка`);
}

// Каждая клетка периметра занята ровно один раз: иначе фишки будут проходить
// сквозь поле или вставать друг на друга.
const places = new Set(B.BOARD.map((cell) => B.gridPlace(cell.n).join(':')));
need(places.size === 36, `в сетке 10×10 занято ${places.size} мест вместо 36`);

/*
  Лестница платы обязана расти вместе с ценой на каждой ступени. Множители у
  групп разные — у дешёвых уделов застройка должна окупаться кратно, — и
  разъехаться им ничего не мешает: проверка ловит ровно это.
*/
const plots = B.BOARD.filter((cell) => cell.kind === 'plot');
for (let i = 1; i < plots.length; i += 1) {
  const previous = B.ladderOf(plots[i - 1]);
  const currentLadder = B.ladderOf(plots[i]);
  need(plots[i].price > plots[i - 1].price,
    `«${plots[i].name}» не дороже предыдущего удела`);
  for (let level = 0; level < currentLadder.length; level += 1) {
    need(currentLadder[level] >= previous[level],
      `плата «${plots[i].name}» на ступени ${level} (${currentLadder[level]}) ниже, `
      + `чем у «${plots[i - 1].name}» (${previous[level]})`);
  }
}

// Полная застройка самого дорогого удела соразмерна стартовому капиталу:
// иначе такую плату просто никто никогда не заплатит.
const topLadder = B.ladderOf(plots[plots.length - 1]);
const topRent = topLadder[topLadder.length - 1];
need(topRent <= B.START_SILVER * 1.5,
  `башня на «${plots[plots.length - 1].name}» стоит ${topRent} при старте ${B.START_SILVER}`);

need(CARDS.PROVIDENCE.length === 16 && CARDS.MERCY.length === 14,
  `в колодах ${CARDS.PROVIDENCE.length} и ${CARDS.MERCY.length} карт`);
for (const card of [...CARDS.PROVIDENCE, ...CARDS.MERCY]) {
  need(Boolean(card.ref), `у карты «${card.text}» нет ссылки на Писание`);
}

// --- 2. прогон партий --------------------------------------------------------

/** Генератор с зерном: партии воспроизводимы, и упавшая чинится, а не ловится. */
function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function playOut(seed, years, playerCount) {
  const rng = seeded(seed);
  const players = Array.from({ length: playerCount }, (unused, i) => ({
    name: 'И' + i, isBot: true, botLevel: i % 2 ? 'scribe' : 'elder',
  }));
  const state = E.createGame({ players, years, rng });

  let turns = 0;
  let servantSeen = false;
  let sabbathRentSeen = false;
  let steps = 0;

  while (state.status === 'playing' && steps < 40000) {
    steps += 1;
    const before = state.turn;

    // В субботний год плата обязана быть нулевой на любой чужой клетке.
    if (state.sabbath) {
      const owned = state.cells.findIndex((cell) => cell.owner);
      if (owned >= 0 && E.rentFor(state, owned, 7) !== 0) sabbathRentSeen = true;
    }

    const done = Bots.step(state, rng);
    if (!done) { E.endTurn(state); }
    if (state.players.some((p) => p.servantOf)) servantSeen = true;
    if (state.turn !== before) turns += 1;
  }

  return {
    finished: state.status === 'jubilee',
    year: state.year,
    turns,
    steps,
    servantSeen,
    sabbathRentSeen,
    negative: state.players.some((p) => p.silver < 0),
    scores: state.scores || [],
    players: state.players,
  };
}

/*
  Платит игрок, а не игра. Движок только выставляет счёт: до решения игрока
  серебро не двигается, а по решению уходит ровно сумма счёта. Раньше плата
  списывалась сама, и разницу между «спросили» и «списали» на экране было не
  видно — поэтому здесь она считается, а не подразумевается.
*/
function paymentWaits(seed) {
  const rng = seeded(seed);
  const state = E.createGame({
    players: [{ name: 'Человек' }, { name: 'Бот', isBot: true, botLevel: 'elder' }],
    years: 7,
    rng,
  });
  for (let step = 0; step < 20000 && state.status === 'playing'; step += 1) {
    const player = E.current(state);
    if (player.isBot) {
      if (!Bots.step(state, rng)) E.endTurn(state);
      continue;
    }
    // Карта только выпала — её принимают нажатием, и лишь тогда она срабатывает.
    if (state.pending && state.pending.type === 'card') { E.takeCard(state, rng); continue; }
    if (state.phase === 'roll') {
      E.roll(state);
      if (state.pending && state.pending.type === 'card') E.takeCard(state, rng);
      if (!state.pending || state.pending.type !== 'pay') continue;
      /*
        Счёт выставлен — значит движок спросил, а не взял: пока он висит, ход
        стоит в фазе решения и деньги на месте. Сравнивать серебро до и после
        броска нельзя: тот же бросок мог принести двести за пройденный Исход.
      */
      const owed = state.pending.amount;
      const held = player.silver;
      if (state.phase !== 'settle') {
        return { why: `счёт выставлен, а ход уже в фазе «${state.phase}»` };
      }
      if (!(owed > 0)) return { why: `счёт выставлен на ${owed}` };
      E.settle(state);
      if (player.silver !== held - owed) {
        return { why: `по решению игрока списали ${held - player.silver} вместо ${owed}` };
      }
      return { owed, held };
    }
    if (state.pending && state.pending.type === 'buy') E.decline(state);
    else E.endTurn(state);
  }
  return { why: 'за всю партию счёт игроку не выставили ни разу' };
}

/*
  Ничего не уходит без нажатия. Это правило шире, чем «плата выставляется
  счётом»: у человека серебро не должно убывать ни от броска, ни от принятой
  карты, ни от конца хода — только от того нажатия, которым он сам закрывает
  счёт, и ровно на сумму счёта. Проверяется это прогоном, где человек не делает
  ничего, кроме обязательного: бросает, принимает карту, отказывается от
  покупки и платит по счёту.
*/
function nothingTakenQuietly(seed) {
  const rng = seeded(seed);
  const state = E.createGame({
    players: [{ name: 'Человек' }, { name: 'Бот', isBot: true, botLevel: 'scribe' }],
    years: 7,
    rng,
  });
  const human = state.players[0];
  let bills = 0;
  for (let step = 0; step < 20000 && state.status === 'playing'; step += 1) {
    const player = E.current(state);
    if (player.isBot) {
      if (!Bots.step(state, rng)) E.endTurn(state);
      continue;
    }
    const had = human.silver;
    if (state.pending && state.pending.type === 'pay') {
      const owed = state.pending.amount;
      if (E.settle(state)) {
        bills += 1;
        if (human.silver !== had - owed) {
          return { why: `по счёту на ${owed} списали ${had - human.silver}` };
        }
      } else if (!E.serve(state)) {
        return { why: 'счёт нечем закрыть и в наём не берут' };
      }
      continue;
    }
    if (state.pending && state.pending.type === 'card') E.takeCard(state, rng);
    else if (state.phase === 'roll') E.roll(state, rng);
    else if (state.pending && state.pending.type === 'buy') E.decline(state);
    else E.endTurn(state);
    if (human.silver < had) {
      return { why: `серебро убыло на ${had - human.silver} без счёта` };
    }
  }
  return { bills };
}

const quiet = [11, 22, 33, 44, 55, 66].map((seed) => nothingTakenQuietly(seed));
const noisy = quiet.find((result) => result.why);
need(!noisy, `у человека берут молча: ${noisy?.why}`);
need(quiet.every((result) => result.bills > 0),
  'ни в одном прогоне человеку не выставили ни одного счёта — проверять нечего');

const asked = [1, 2, 3, 4, 5].map((seed) => paymentWaits(seed));
const brokenAsk = asked.find((result) => result.why);
need(!brokenAsk, `плата мимо решения игрока: ${brokenAsk?.why}`);

/*
  Залог. Правило обещает три вещи: заложить можно удел не дешевле долга, счёт
  при этом закрывается, а выкуп возвращает землю за ту же сумму. Проверяется
  каждая: на слово тут верить нечему — залог легко превратить в способ закрыть
  любой счёт любым клочком земли.
*/
function pledgeWorks() {
  const rng = seeded(77);
  const state = E.createGame({
    players: [{ name: 'Должник' }, { name: 'Кредитор' }], years: 7, rng,
  });
  const [debtor, creditor] = state.players;
  const plots = B.BOARD.filter((cell) => cell.kind === 'plot');
  const cheap = plots[0];
  const dear = plots[plots.length - 1];
  state.cells[cheap.n].owner = debtor.id;
  state.cells[dear.n].owner = debtor.id;
  debtor.silver = 10;

  const owed = Math.floor((cheap.price + dear.price) / 2);
  state.pending = {
    type: 'pay', amount: owed, toId: creditor.id, toTreasury: false,
    title: 'Плата за проход', text: '',
  };
  state.phase = 'settle';

  const offered = E.pledgeable(state, debtor, owed);
  if (offered.includes(cheap.n)) {
    return { why: `в залог предложен «${cheap.name}» за ${cheap.price} под долг ${owed}` };
  }
  if (!offered.includes(dear.n)) return { why: `дорогой удел в залог не предложен` };

  const creditorBefore = creditor.silver;
  if (!E.pledge(state, dear.n)) return { why: 'залог не принят' };
  if (state.pending && state.pending.type === 'pay') return { why: 'счёт после залога остался' };
  if (state.cells[dear.n].owner !== creditor.id) return { why: 'заложенное не ушло кредитору' };
  if (state.cells[dear.n].pledge.debt !== owed) return { why: 'долг по залогу записан другой' };
  if (debtor.silver !== 10) return { why: `залог тронул серебро: ${debtor.silver}` };

  // Выкуп: денег не хватает — нельзя, хватает — земля возвращается.
  if (E.canRedeemPledge(state, debtor, dear.n)) return { why: 'выкуп разрешён без денег' };
  debtor.silver = owed + 5;
  state.turn = state.players.indexOf(debtor);
  state.phase = 'act';
  if (!E.redeemPledge(state, dear.n)) return { why: 'выкуп не сработал при деньгах' };
  if (state.cells[dear.n].owner !== debtor.id) return { why: 'выкупленное не вернулось' };
  if (state.cells[dear.n].pledge) return { why: 'залог остался после выкупа' };
  if (debtor.silver !== 5) return { why: `за выкуп списали ${owed + 5 - debtor.silver}` };
  if (creditor.silver !== creditorBefore + owed) {
    return { why: `кредитор получил ${creditor.silver - creditorBefore} вместо ${owed}` };
  }
  return { owed };
}

/*
  Договоры. Гость, вставший на чужую землю, волен не просто заплатить: он может
  поставить хозяину ступень за свой счёт и отдать половину платы — или не
  платить вовсе, взяв с хозяина встречное обещание построить ему такую же
  ступень. Каждое из трёх обещаний проверяется числами: сколько ушло, сколько
  пришло, что стало с землёй и с самим обещанием.
*/
function dealsWork() {
  const rng = seeded(2024);
  const group = Object.keys(B.GROUPS).find((key) => B.groupCells(key).length >= 2);
  const cells = B.groupCells(group);
  const build = B.GROUPS[group].build;

  const setup = () => {
    const state = E.createGame({
      players: [{ name: 'Гость' }, { name: 'Хозяин' }], years: 7, rng,
    });
    const [guest, owner] = state.players;
    for (const n of cells) state.cells[n].owner = owner.id;
    guest.silver = 3000;
    owner.silver = 100;
    state.turn = 0;
    state.phase = 'roll';
    return { state, guest, owner, n: cells[0] };
  };

  /*
    Приземление на нужную клетку. Кости бросает сам движок, поэтому сюда
    передаётся зерно, дающее двойку на каждой: ход выходит ровно на четыре
    клетки вперёд, и гость встаёт туда, куда нужно проверке.
  */
  const TWO = () => 0.25;
  function stand(kit, who, cell) {
    kit.state.turn = kit.state.players.indexOf(who);
    kit.state.phase = 'roll';
    kit.state.pending = null;
    who.pos = (cell - 4 + B.BOARD.length) % B.BOARD.length;
    E.roll(kit.state, TWO);
    return kit.state.pending;
  }

  const one = setup();
  let pending = stand(one, one.guest, one.n);
  if (!pending || pending.type !== 'pay') return { why: `на чужой земле выставили «${pending?.type}»` };
  if (!pending.deal) return { why: 'к счёту не приложен договор' };
  const rent = pending.amount;
  const half = pending.deal.half;
  if (half !== Math.ceil(rent / 2)) return { why: `половина платы посчитана как ${half} от ${rent}` };

  // 1. Просто заплатить.
  const beforeGuest = one.guest.silver;
  const beforeOwner = one.owner.silver;
  if (!E.settle(one.state)) return { why: 'простая уплата не прошла' };
  if (one.guest.silver !== beforeGuest - rent || one.owner.silver !== beforeOwner + rent) {
    return { why: 'простая уплата сдвинула не те деньги' };
  }

  // 2. Построить и заплатить половину.
  const two = setup();
  pending = stand(two, two.guest, two.n);
  const levelBefore = two.state.cells[two.n].level;
  const guestBefore = two.guest.silver;
  const ownerBefore = two.owner.silver;
  if (!E.dealBuild(two.state, true)) return { why: 'договор «строю и плачу половину» не прошёл' };
  if (two.state.cells[two.n].level !== levelBefore + 1) return { why: 'ступень не выросла' };
  if (two.guest.silver !== guestBefore - build - pending.deal.half) {
    return { why: `у гостя ушло ${guestBefore - two.guest.silver} вместо ${build + pending.deal.half}` };
  }
  if (two.owner.silver !== ownerBefore + pending.deal.half) {
    return { why: `хозяину пришло ${two.owner.silver - ownerBefore} вместо ${pending.deal.half}` };
  }
  if (two.owner.promises.length) return { why: 'за половину платы на хозяина повис долг' };

  // 3. Уговор: строю сейчас, платы нет, хозяин должен ответить.
  const three = setup();
  stand(three, three.guest, three.n);
  const guestHad = three.guest.silver;
  const ownerHad = three.owner.silver;
  if (!E.dealBuild(three.state, false)) return { why: 'уговор не прошёл' };
  if (three.guest.silver !== guestHad - build) {
    return { why: `по уговору с гостя взяли ${guestHad - three.guest.silver} вместо ${build}` };
  }
  if (three.owner.silver !== ownerHad) return { why: 'по уговору хозяину что-то заплатили' };
  if (!three.owner.promises.includes(three.guest.id)) return { why: 'обещание хозяина не записано' };

  // 4. Обещание спрашивается на земле того, кому обещали.
  const four = three;
  const mine = B.BOARD.find((spec) => spec.kind === 'plot' && !cells.includes(spec.n));
  four.state.cells[mine.n].owner = four.guest.id;
  for (const n of B.groupCells(mine.group)) four.state.cells[n].owner = four.guest.id;
  four.owner.silver = 3000;
  const asked = stand(four, four.owner, mine.n);
  if (!asked || asked.type !== 'promise') {
    return { why: `на земле того, кому обещали, выставили «${asked?.type}»` };
  }
  const payerHad = four.owner.silver;
  const levelHad = four.state.cells[mine.n].level;
  if (!E.keepPromise(four.state)) return { why: 'обещание не исполнилось' };
  if (four.state.cells[mine.n].level !== levelHad + 1) return { why: 'обещанная ступень не выросла' };
  if (four.owner.silver !== payerHad - asked.cost) return { why: 'за обещание взяли не столько' };
  if (four.owner.promises.includes(four.guest.id)) return { why: 'исполненное обещание осталось висеть' };

  return { rent, half, build };
}

const deals = dealsWork();
need(!deals.why, `договоры работают не так, как обещано: ${deals.why}`);

const pledged = pledgeWorks();
need(!pledged.why, `залог работает не так, как обещано: ${pledged.why}`);

/*
  «До последнего». Партия без объявленного срока обязана всё-таки кончаться —
  и кончаться тем, ради чего затевалась: за столом остаётся один
  платёжеспособный. Если она не кончается, режим не режим, а вечный круг.
*/
function playLast(seed, playerCount) {
  const rng = seeded(seed);
  const players = Array.from({ length: playerCount }, (unused, i) => ({
    name: 'И' + i, isBot: true, botLevel: i % 2 ? 'scribe' : 'elder',
  }));
  const state = E.createGame({ players, mode: 'last', rng });
  let steps = 0;
  let turns = 0;
  while (state.status === 'playing' && steps < 60000) {
    steps += 1;
    const before = state.turn;
    if (!Bots.step(state, rng)) E.endTurn(state);
    if (state.turn !== before) turns += 1;
  }
  return { finished: state.status === 'jubilee', turns, left: E.standing(state).length, state };
}

const lastGames = [];
for (let seed = 1; seed <= 120; seed += 1) {
  lastGames.push(playLast(seed * 7, 2 + (seed % 5)));
}
const stuck = lastGames.filter((game) => !game.finished).length;
need(stuck === 0, `${stuck} партий «до последнего» из ${lastGames.length} не кончились`);
const wrongLeft = lastGames.filter((game) => game.finished && game.left > 1).length;
need(wrongLeft === 0, `${wrongLeft} партий «до последнего» кончились, пока держались двое`);
const lastSabbath = lastGames.filter((game) => game.state.sabbath).length;
need(lastSabbath === 0, `${lastSabbath} партий «до последнего» встретили субботний год`);

const GAMES = 600;
const results = [];
for (let seed = 1; seed <= GAMES; seed += 1) {
  const years = [3, 5, 7][seed % 3];
  const playerCount = 2 + (seed % 5);
  const game = playOut(seed, years, playerCount);
  results.push({ ...game, years, playerCount, seed });
}

const unfinished = results.filter((game) => !game.finished);
need(unfinished.length === 0,
  `${unfinished.length} партий из ${GAMES} не дошли до юбилея (например зерно ${unfinished[0]?.seed})`);

const wrongYear = results.filter((game) => game.finished && game.year !== game.years + 1);
need(wrongYear.length === 0,
  `${wrongYear.length} партий кончились не на объявленном году (зерно ${wrongYear[0]?.seed}: ` +
  `год ${wrongYear[0]?.year} при ${wrongYear[0]?.years} годах)`);

need(!results.some((game) => game.negative), 'у кого-то оказалось отрицательное серебро');
need(!results.some((game) => game.sabbathRentSeen), 'в субботний год с клетки всё ещё берут плату');

// Никто не выбывает: игроки в конце партии — те же, что в начале.
const lost = results.filter((game) => game.players.some((p) => p.out));
need(lost.length === 0, `${lost.length} партий выбросили игрока из-за стола`);

// Наём должен хотя бы иногда случаться: если он не срабатывает никогда, правило
// написано, но не проверено ничем.
const withServants = results.filter((game) => game.servantSeen).length;
need(withServants > 0, 'наём не случился ни разу за 600 партий — правило мёртвое');

// Богатейший — не обязательно победитель: ради этого наследие и вводилось.
let richestWins = 0;
let counted = 0;
for (const game of results) {
  if (!game.scores.length) continue;
  counted += 1;
  const richest = game.players.slice().sort((a, b) => b.silver - a.silver)[0];
  if (game.scores[0].id === richest.id) richestWins += 1;
}
const richestShare = counted ? richestWins / counted * 100 : 100;
need(richestShare < 80,
  `богатейший выигрывает в ${richestShare.toFixed(0)}% партий — наследие ничего не решает`);

const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const turnsBy = (years) => median(results.filter((game) => game.years === years).map((game) => game.turns));

if (problems.length) {
  console.error('«Земля обетованная» не прошла проверку:');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log(`OK: ${GAMES} партий дошли до юбилея и кончились ровно на объявленном году. `
  + `Ходов в партии (медиана): ${turnsBy(3)} за три года, ${turnsBy(5)} за пять, ${turnsBy(7)} за семь. `
  + `Наём сработал в ${withServants} партиях, никто не выбыл из-за стола, `
  + `в субботний год плата нулевая, а богатейший побеждает лишь в ${richestShare.toFixed(0)}% случаев. `
  + `Поле: 36 клеток, лестница платы монотонна по всем ступеням. `
  + `Счёт игроку выставляется, а не списывается: в пяти прогонах серебро тронулось `
  + `только после решения и ровно на сумму счёта (${asked.map((r) => r.owed).join(', ')}). `
  + `За ${quiet.length} прогонов у человека не убыло ни сикля помимо счетов `
  + `(${quiet.reduce((sum, r) => sum + r.bills, 0)} счетов на всех). `
  + `Договоры: плата ${deals.rent} уходит целиком, со ступенью за ${deals.build} — `
  + `половиной (${deals.half}), а по уговору не уходит вовсе, и хозяин отвечает ступенью. `
  + `Залог: удел дешевле долга в залог не идёт, дорогой уходит кредитору и выкупается `
  + `за ту же сумму (${pledged.owed}). «До последнего»: ${lastGames.length} партий дошли до `
  + `конца, в каждой остался один, медиана ${median(lastGames.map((game) => game.turns))} ходов.`);
