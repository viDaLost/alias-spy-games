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
  + `Поле: 36 клеток, лестница платы монотонна по всем ступеням.`);
