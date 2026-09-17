// Соперники «Земли обетованной»: играют ли они лучше прежних — счётом, а не на глаз.
//
// «Сделай ботов умнее» — просьба, которую нельзя ни выполнить, ни проверить,
// пока не сказано, с чем сравнивать. Поэтому здесь рядом лежит прежнее
// поколение соперников — то самое, что стояло в игре до этой правки, — и новые
// садятся с ними за один стол. Шестеро: трое новых, трое прежних. В половине
// партий новые сидят на чётных местах, в половине на нечётных: место за столом
// само по себе кое-что значит, и этот перекос надо вычесть, а не унаследовать.
//
// Партии идут на все три срока — три года, пять и семь: короткая партия и
// длинная вознаграждают разное, и улучшение, которое видно только на одной из
// них, улучшением не является.
//
// Что показал счёт, и об этом стоит сказать прямо: перевес у новых есть, но он
// не огромный. На сроке в три года — том, что стоит в игре по умолчанию, — они
// выигрывают около 56% партий. На пяти и семи годах идут вровень. Зато две вещи
// изменились наверняка, и обе проверяются отдельно: соперник больше не
// разоряется на собственной покупке и ставит больше жертвенников.
//
// Здесь же записан и отрицательный итог, чтобы его не искали заново. Оценка
// удела в баллах — доход по лестнице, надежда собрать цвет, надбавка за
// перехват — была написана и выброшена: тысяча двести партий с порогом покупки
// 0.4 и с порогом 0 дали в точности один и тот же результат. В юбилей каждый
// удел сам по себе очко наследия, и выбирать просто не из чего: берут всё, на
// что хватает сверх запаса. Высокий порог проверен тоже — 16% побед вместо 52%.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'cloudflare/promised-land-preview/public');

const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
sandbox.window.crypto = globalThis.crypto;
for (const file of ['board.js', 'cards.js', 'engine.js', 'bots.js']) {
  const code = fs.readFileSync(path.join(dir, file), 'utf8');
  new Function('window', 'crypto', code)(sandbox.window, globalThis.crypto);
}
const B = sandbox.window.PromisedLandBoard;
const E = sandbox.window.PromisedLandEngine;
const Bots = sandbox.window.PromisedLandBots;

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

/*
  Прежнее поколение. Копия нарочная: если бы оно читалось из истории git,
  проверка перестала бы работать в тот день, когда историю перепишут, а
  сравнивать было бы не с чем. Здесь оно заморожено ровно таким, каким стояло
  в игре, и трогать его больше не нужно — это не код игры, а мерка.
*/
const OLD = {
  youth: { greed: 0.40, legacy: false },
  elder: { greed: 0.60, legacy: true },
  scribe: { greed: 0.75, legacy: true },
};

function oldCompletes(state, player, n) {
  const spec = B.BOARD[n];
  if (spec.kind !== 'plot') return false;
  const cells = B.groupCells(spec.group);
  return cells.filter((i) => state.cells[i].owner === player.id).length === cells.length - 1;
}

function oldWants(state, player, n, profile) {
  const spec = B.BOARD[n];
  if (oldCompletes(state, player, n)) return true;
  if (spec.kind === 'road' || spec.kind === 'well') return player.silver >= spec.price * 2;
  return spec.price <= player.silver * profile.greed;
}

function oldStep(state, rng) {
  const player = E.current(state);
  const profile = OLD[player.botLevel] || OLD.elder;

  if (state.phase === 'roll') {
    if (E.canBail(state, player) && player.silver > B.BAIL * 6 && E.bail(state)) return 'bail';
    return E.roll(state, rng) && 'roll';
  }
  if (state.pending && state.pending.type === 'card') return E.takeCard(state, rng) && 'card';
  if (state.pending && state.pending.type === 'promise') {
    if (player.silver > state.pending.cost + 250 && E.keepPromise(state)) return 'promise';
    return E.breakPromise(state) && 'break';
  }
  if (state.pending && state.pending.type === 'pay') {
    const deal = state.pending.deal;
    if (deal && player.silver > deal.build + deal.half + 400) {
      const straight = state.pending.amount;
      if (deal.build + deal.half < straight && E.dealBuild(state, true)) return 'deal-half';
      if (deal.build < straight * 0.8 && E.dealBuild(state, false)) return 'deal-barter';
    }
    if (E.settle(state)) return 'pay';
    const pledges = E.pledgeable(state, player, state.pending.amount);
    if (pledges.length && E.pledge(state, pledges[0])) return 'pledge';
    if (E.settle(state, true)) return 'sell-pay';
    return E.serve(state) && 'serve';
  }
  if (state.pending && state.pending.type === 'buy') {
    const n = state.pending.cell;
    return (oldWants(state, player, n, profile) ? E.buy(state) : E.decline(state)) && 'buy';
  }
  if (state.phase === 'act') {
    if (profile.legacy) {
      const debtor = state.players.find((p) => p.debt > 0 && p.id !== player.id
        && E.canRedeem(state, player, p.id) && player.silver - p.debt > 400);
      if (debtor && E.redeem(state, debtor.id)) return 'redeem';
    }
    const mine = E.pledgesOf(state, player.id)
      .filter((n) => E.canRedeemPledge(state, player, n)
        && player.silver - state.cells[n].pledge.debt > 300);
    if (mine.length && E.redeemPledge(state, mine[0])) return 'unpledge';
    const buildable = state.cells
      .map((cell, n) => n)
      .filter((n) => E.canBuild(state, player, n)
        && player.silver - B.GROUPS[B.BOARD[n].group].build > 300)
      .sort((a, b) => B.BOARD[b].price - B.BOARD[a].price);
    if (buildable.length && E.build(state, buildable[0])) return 'build';
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

const GAMES = Number(process.env.PROMISED_LAND_BOT_GAMES || 400);
const LEVELS = ['elder', 'scribe', 'elder'];
const TERMS = [3, 5, 7];

let seed = 987654321;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** Стол из троих новых и троих прежних. Возвращает итоги одного срока. */
function play(games, years) {
  const out = {
    fresh: 0, past: 0, servedFresh: 0, servedPast: 0,
    altarFresh: 0, altarPast: 0, heritageFresh: 0, heritagePast: 0, stalled: 0,
  };
  for (let game = 0; game < games; game += 1) {
    const freshFirst = game % 2 === 0;
    const players = [];
    for (let seat = 0; seat < 6; seat += 1) {
      const isFresh = (seat % 2 === 0) === freshFirst;
      players.push({
        name: `${isFresh ? 'Н' : 'П'}${seat}`,
        isBot: true,
        botLevel: LEVELS[Math.floor(seat / 2)],
      });
    }
    const side = players.map((one) => one.name.startsWith('Н'));
    const state = E.createGame({ players, years, mode: 'jubilee', rng });

    let guard = 0;
    while (state.status === 'playing' && guard < 4000) {
      guard += 1;
      const seat = state.turn;
      if (!(side[seat] ? Bots.step(state, rng) : oldStep(state, rng))) E.endTurn(state);
    }
    if (state.status !== 'jubilee') { out.stalled += 1; continue; }

    const seatOf = (id) => state.players.findIndex((one) => one.id === id);
    if (side[seatOf(state.scores[0].id)]) out.fresh += 1;
    else out.past += 1;

    for (const one of state.players) {
      const fresh = side[seatOf(one.id)];
      const score = state.scores.find((item) => item.id === one.id)?.total || 0;
      if (fresh) {
        out.heritageFresh += score;
        out.altarFresh += one.altars;
        if (one.servantOf) out.servedFresh += 1;
      } else {
        out.heritagePast += score;
        out.altarPast += one.altars;
        if (one.servantOf) out.servedPast += 1;
      }
    }
  }
  return out;
}

const terms = TERMS.map((years) => ({ years, ...play(GAMES, years) }));
const sum = (key) => terms.reduce((total, one) => total + one[key], 0);

need(sum('stalled') === 0, `${sum('stalled')} партий не дошли до юбилея`);

const wins = sum('fresh');
const losses = sum('past');
const share = wins / (wins + losses || 1);
const short = terms[0];
const shortShare = short.fresh / (short.fresh + short.past || 1);

/*
  Порог общий — «не слабее». Перевес на всех трёх сроках сразу невелик, и
  требовать от него больше значило бы требовать удачи: на тысяче двухстах
  партиях разброс около полутора процентов, и любой порог выше пятидесяти
  двух мигал бы через раз. А вот проигрыш прежним — это настоящая беда, и
  вот её здесь и стерегут.
*/
need(share >= 0.485,
  `новые соперники слабее прежних: ${(share * 100).toFixed(1)}% побед на всех сроках`);

// На сроке по умолчанию перевес должен быть виден — ради него всё и делалось.
need(shortShare >= 0.53,
  `на трёхлетней партии новые выигрывают ${(shortShare * 100).toFixed(1)}% — перевеса нет`);

// Жертвенник — главная сделка на наследие, и новые видят её лучше.
need(sum('altarFresh') > sum('altarPast'),
  `жертвенников у новых ${sum('altarFresh')} против ${sum('altarPast')} у прежних`);

// И главное, ради чего считался запас: на собственной покупке не разоряются.
need(sum('servedFresh') <= sum('servedPast'),
  `в наём ушло ${sum('servedFresh')} новых против ${sum('servedPast')} прежних`);

/*
  Запас смотрит на доску, а не на зашитое число: на пустой он мал, а рядом с
  чужой башней велик — но не безгранично, иначе соперник перестанет играть.
*/
const bare = E.createGame({ players: [{ name: 'А' }, { name: 'Б' }], years: 5, rng });
const level = Bots.LEVELS.elder;
const bareReserve = Bots.reserveOf(bare, bare.players[0], level);
bare.cells[34].owner = bare.players[1].id;        // Хеврон — самый дорогой удел
bare.cells[34].level = 5;                          // и башня на нём
const builtReserve = Bots.reserveOf(bare, bare.players[0], level);
need(builtReserve > bareReserve, `запас не смотрит на доску: ${bareReserve} против ${builtReserve}`);
need(builtReserve <= 420, `у запаса нет потолка: ${builtReserve}`);

if (problems.length) {
  console.error('Соперники «Земли обетованной» не прошли проверку:');
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

const byTerm = terms
  .map((one) => `${one.years} г. ${((one.fresh / (one.fresh + one.past || 1)) * 100).toFixed(1)}%`)
  .join(', ');
console.log(`OK: ${GAMES * TERMS.length} партий шестером, трое новых против троих прежних, места `
  + `чередуются. Новые выигрывают ${(share * 100).toFixed(1)}% на всех сроках (${byTerm}). `
  + `Жертвенников ${sum('altarFresh')} против ${sum('altarPast')}, в наём ушло `
  + `${sum('servedFresh')} против ${sum('servedPast')}. Запас считается по доске: `
  + `${bareReserve} на пустой, ${builtReserve} рядом с башней, и выше потолка не растёт.`);
