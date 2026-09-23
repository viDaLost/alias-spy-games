// Обмен уделами в «Земле обетованной»: уговор не создаёт и не теряет добра.
//
// Обмен — единственное место игры, где имущество переходит между игроками не
// по правилу, а по согласию. Значит, и ломается оно не как правило, а как
// согласие: удел уходит дважды, серебро появляется из воздуха, заложенная земля
// переходит через голову кредитора, соперник от игры отдаёт последний удел
// цвета за его же цену.
//
// Ничего из этого не видно на экране: доска остаётся правильной, счёт сходится,
// партия идёт дальше. Видно только по итогу — и поздно.
//
// Поэтому здесь после каждого уговора пересчитывается всё имущество стола: у
// кого сколько серебра, кому какая земля принадлежит и сколько её всего.
//
//     node scripts/check-promised-land-trade.mjs

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

/** Одинаковые партии от запуска к запуску: иначе упавшую проверку не повторить. */
function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const plotsOf = (state, id) => state.cells.reduce((sum, cell) => sum + (cell.owner === id ? 1 : 0), 0);
const silverOf = (state) => state.players.reduce((sum, one) => sum + one.silver, 0);
const owned = (state) => state.cells.reduce((sum, cell) => sum + (cell.owner ? 1 : 0), 0);

function table(rng = seeded(11)) {
  const state = E.createGame({
    players: [{ name: 'Первый' }, { name: 'Второй' }, { name: 'Третий' }],
    years: 5,
    rng,
  });
  return state;
}

/** Отдать уделы прямо в руки: проверке нужен стол, а не путь к нему. */
function give(state, id, list) {
  for (const n of list) {
    state.cells[n].owner = id;
    state.cells[n].level = 0;
    state.cells[n].altar = false;
    state.cells[n].pledge = null;
    state.cells[n].heldFrom = null;
  }
}

// ——————————————————————————————————————————————— уговор состоялся

{
  const state = table();
  give(state, 'p0', [1, 3]);      // Вирсавия и Герар — Негев
  give(state, 'p1', [6, 8]);      // Фекоя и Вифлеем — Иудея
  const beforeSilver = silverOf(state);
  const beforeOwned = owned(state);
  const purse = [state.players[0].silver, state.players[1].silver];

  need(E.canOfferTrade(state), 'в начале своего хода уговор предложить нельзя');
  need(E.tradeOffer(state, { to: 'p1', give: [1], take: [6], silver: 100 }),
    'уговор не принят к рассмотрению');
  need(Boolean(state.trade), 'уговор не записан в состояние');
  need(!E.tradeOffer(state, { to: 'p1', give: [3], take: [8], silver: 0 }),
    'второй уговор лёг поверх первого');

  need(E.tradeAccept(state), 'согласие не сработало');
  need(state.trade === null, 'уговор остался висеть после согласия');
  need(state.cells[1].owner === 'p1', 'отданный удел не сменил хозяина');
  need(state.cells[6].owner === 'p0', 'полученный удел не сменил хозяина');
  need(state.players[0].silver === purse[0] - 100, `у платившего ${state.players[0].silver} вместо ${purse[0] - 100}`);
  need(state.players[1].silver === purse[1] + 100, `у получившего ${state.players[1].silver} вместо ${purse[1] + 100}`);
  need(silverOf(state) === beforeSilver, 'серебро стола изменилось само собой');
  need(owned(state) === beforeOwned, 'число занятых уделов изменилось');
  need(plotsOf(state, 'p0') === 2 && plotsOf(state, 'p1') === 2, 'уделы разошлись неровно');
}

// ——————————————————————————————————————————————— чего уговор не может

{
  const state = table();
  give(state, 'p0', [1, 3]);
  give(state, 'p1', [6, 8]);

  need(!E.tradeOffer(state, { to: 'p0', give: [1], take: [1], silver: 0 }), 'уговор с самим собой прошёл');
  need(!E.tradeOffer(state, { to: 'p9', give: [1], take: [6], silver: 0 }), 'уговор с несуществующим игроком прошёл');
  need(!E.tradeOffer(state, { to: 'p1', give: [6], take: [1], silver: 0 }),
    'отдали чужой удел как свой');
  need(!E.tradeOffer(state, { to: 'p1', give: [1], take: [8, 8], silver: 0 }),
    'один и тот же удел взят дважды');
  need(!E.tradeOffer(state, { to: 'p1', give: [], take: [], silver: 500 }),
    'уговор об одном серебре прошёл — это дарение, а не обмен');
  need(!E.tradeOffer(state, { to: 'p1', give: [1], take: [6], silver: 99999 }),
    'доплата больше кошелька прошла');
  need(!E.tradeOffer(state, { to: 'p1', give: [1], take: [6], silver: -99999 }),
    'встречная доплата больше чужого кошелька прошла');

  // Заложенное и застроенное не меняют.
  state.cells[1].pledge = { by: 'p0', debt: 100 };
  need(!E.tradeOffer(state, { to: 'p1', give: [1], take: [6], silver: 0 }), 'заложенный удел ушёл в обмен');
  state.cells[1].pledge = null;
  state.cells[3].level = 2;
  need(!E.tradeOffer(state, { to: 'p1', give: [3], take: [6], silver: 0 }), 'застроенный удел ушёл в обмен');
  state.cells[3].level = 0;
  state.cells[3].altar = true;
  need(!E.tradeOffer(state, { to: 'p1', give: [3], take: [6], silver: 0 }), 'удел с жертвенником ушёл в обмен');
  state.cells[3].altar = false;

  /*
    Пустой удел из застроенного цвета тоже не меняют: поселение стоит на цвете
    целиком, и уход одного удела оставил бы ступени соседей на чужой земле.
    Проверка механик поймала это на сто первом ходу партии — здесь оно
    спрашивается прямо.
  */
  give(state, 'p0', [1, 3]);
  state.cells[1].level = 2;
  need(!E.tradeOffer(state, { to: 'p1', give: [3], take: [6], silver: 0 }),
    'пустой удел из застроенного цвета ушёл в обмен');
  state.cells[1].level = 0;

  need(!E.tradeOffer(state, { to: 'p1', give: [0], take: [6], silver: 0 }), '«Исход» ушёл в обмен');
  need(!E.tradeOffer(state, { to: 'p1', give: [1, 3, 5, 11, 12], take: [6], silver: 0 }),
    'в уговор влезло больше уделов, чем можно');
}

// ——————————————————————————————————————————————— уговор расстроился

{
  const state = table();
  give(state, 'p0', [1, 3]);
  give(state, 'p1', [6]);
  E.tradeOffer(state, { to: 'p1', give: [1], take: [6], silver: 200 });
  // Пока уговор ждал ответа, серебро ушло на другое.
  state.players[0].silver = 10;
  need(!E.tradeValid(state), 'уговор считается годным без серебра на доплату');
  need(!E.tradeAccept(state), 'согласие прошло, хотя платить нечем');
  need(state.trade === null, 'расстроенный уговор остался висеть');
  need(state.cells[1].owner === 'p0' && state.cells[6].owner === 'p1', 'земля ушла по расстроенному уговору');
}

{
  const state = table();
  give(state, 'p0', [1]);
  give(state, 'p1', [6]);
  E.tradeOffer(state, { to: 'p1', give: [1], take: [6], silver: 0 });
  need(E.tradeDecline(state), 'отказ не сработал');
  need(state.trade === null, 'после отказа уговор остался');
  need(state.cells[1].owner === 'p0', 'после отказа земля всё-таки ушла');
}

{
  const state = table();
  give(state, 'p0', [1]);
  give(state, 'p1', [6]);
  E.tradeOffer(state, { to: 'p1', give: [1], take: [6], silver: 0 });
  E.endTurn(state);
  need(state.trade === null, 'уговор пережил ход того, кто его предложил');
}

// ——————————————————————————————————————————————— цена удела для разных рук

{
  const state = table();
  // Негев — два удела: 1 и 3. Тому, у кого уже есть один, второй дороже.
  give(state, 'p0', [1]);
  const plain = E.tradeWorth(state, 3, 'p1');
  const closing = E.tradeWorth(state, 3, 'p0');
  need(closing > plain, `замыкающий группу удел стоит ${closing}, а чужому ${plain}`);
  /*
    Иудея — три удела (Фекоя, Вифлеем, Ен-Геди). Первый из трёх ничего не
    замыкает и не приближает к застройке, и стоить он должен ровно свою цену.
  */
  const lonely = E.tradeWorth(state, 6, 'p2');
  need(lonely === B.BOARD[6].price, `одинокий удел стоит ${lonely} вместо цены ${B.BOARD[6].price}`);

  give(state, 'p0', [5]);
  const road = E.tradeWorth(state, 14, 'p0');
  need(road > B.BOARD[14].price, 'вторая дорога не дороже первой');
}

// ——————————————————————————————————————————————— соперник от игры не дарит

{
  // Уговор «последний удел моего цвета за его же цену» — подарок, и соперник
  // от игры обязан его отклонить.
  let gifts = 0;
  for (let round = 0; round < 200; round += 1) {
    const rng = seeded(500 + round);
    const state = table(rng);
    state.players[1].isBot = true;
    state.players[1].botLevel = round % 2 ? 'elder' : 'scribe';
    give(state, 'p0', [1]);
    give(state, 'p1', [3]);
    // Человек просит удел, замыкающий его группу, и предлагает ровно цену.
    E.tradeOffer(state, { to: 'p1', give: [], take: [3], silver: B.BOARD[3].price });
    Bots.judgeTrade(state, rng);
    if (state.cells[3].owner === 'p0') gifts += 1;
  }
  need(gifts === 0, `соперник от игры отдал замыкающий удел по цене в ${gifts} случаях из 200`);
}

{
  // А выгодный уговор он принимает: вдвое больше цены за ненужный ему удел.
  let deals = 0;
  for (let round = 0; round < 200; round += 1) {
    const rng = seeded(900 + round);
    const state = table(rng);
    state.players[1].isBot = true;
    state.players[1].botLevel = 'youth';
    give(state, 'p1', [3]);
    E.tradeOffer(state, { to: 'p1', give: [], take: [3], silver: B.BOARD[3].price * 3 });
    Bots.judgeTrade(state, rng);
    if (state.cells[3].owner === 'p0') deals += 1;
  }
  need(deals > 150, `выгодный уговор принят только ${deals} раз из 200`);
}

// ——————————————————————————————————————————————— соперник предлагает сам

{
  let offers = 0;
  for (let round = 0; round < 300; round += 1) {
    const rng = seeded(1300 + round);
    const state = table(rng);
    state.players[0].isBot = true;
    state.players[0].botLevel = 'elder';
    give(state, 'p0', [1]);       // Негев без одного
    give(state, 'p1', [3]);       // и этот один — у соседа
    state.players[0].silver = 1500;
    if (Bots.proposeTrade(state, rng)) {
      offers += 1;
      need(state.trade.take.includes(3), 'соперник просит не тот удел, которого ему не хватает');
      need(state.trade.silver >= 0, 'соперник просит доплату у соседа за свою же выгоду');
      need(state.trade.silver <= state.players[0].silver, 'соперник обещает больше, чем имеет');
    }
  }
  need(offers > 150, `соперник предложил уговор ${offers} раз из 300 — слишком редко`);
  need(offers < 300, 'соперник предлагает уговор каждый ход — это назойливо');
}

// ——————————————————————————————————————————————— партия с обменами доигрывается

{
  let trades = 0;
  let longest = 0;
  for (let game = 0; game < 60; game += 1) {
    const rng = seeded(2100 + game * 17);
    const state = E.createGame({
      players: [
        { name: 'Первый', isBot: true, botLevel: 'elder' },
        { name: 'Второй', isBot: true, botLevel: 'scribe' },
        { name: 'Третий', isBot: true, botLevel: 'youth' },
      ],
      years: 3,
      rng,
    });
    let steps = 0;
    while (state.status === 'playing' && steps < 4000) {
      if (state.trade) {
        /*
          Главная проверка и делается здесь, вокруг самого уговора: серебро
          стола и число занятых уделов до и после обмена обязаны совпасть.
          Мерить это на любом шаге нельзя — плата, урожай, подать и разорение
          законно двигают и то, и другое.
        */
        const silverWas = silverOf(state);
        const ownedWas = owned(state);
        const deal = state.trade;
        trades += 1;
        Bots.judgeTrade(state, rng);
        need(state.trade === null, 'уговор остался без ответа после суда соперника');
        need(silverOf(state) === silverWas,
          `после уговора серебра стало ${silverOf(state)} вместо ${silverWas}`);
        need(owned(state) === ownedWas,
          `после уговора занятых уделов стало ${owned(state)} вместо ${ownedWas}`);
        for (const n of deal.give.concat(deal.take)) {
          need(state.cells[n].owner === deal.from || state.cells[n].owner === deal.to,
            'удел из уговора достался третьему');
        }
      } else if (!Bots.step(state, rng)) {
        E.endTurn(state);
      }
      steps += 1;
    }
    longest = Math.max(longest, steps);
    need(state.status !== 'playing', `партия ${game} не кончилась за ${steps} шагов`);
  }
  need(trades > 0, 'за шестьдесят партий соперники ни разу не предложили уговор');
  console.log(`  · 60 партий соперниками: уговоров ${trades}, самая длинная ${longest} шагов`);
}

if (problems.length) {
  console.error(`Обмен в «Земле обетованной» не прошёл проверку (${problems.length}):`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log('OK: уговор переносит уделы и серебро и ничего не создаёт из воздуха; '
  + 'заложенное, застроенное и чужое в обмен не уходит, одним серебром уговор не бывает; '
  + 'расстроенный уговор отменяется сам, а ход его не переживает; '
  + 'замыкающий группу удел стоит дороже одинокого, и соперник от игры не отдаёт его по цене, '
  + 'но сам предлагает уговор, когда ему не хватает одного удела.');
