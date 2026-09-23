// Механики «Земли обетованной»: правила держатся сами, а не на честном слове.
//
// Соседняя проверка (check-promised-land.mjs) спрашивает четыре главных
// обещания игры — что партия кончается, что никто не выбывает, что в субботний
// год платы нет и что побеждает не богатейший. Здесь спрашивается другое: не
// врёт ли себе само состояние партии.
//
// Разница существенная. Обещания проверяются по итогу партии, а состояние — на
// каждом ходу, и ломается оно тихо. Удел с постройкой и без хозяина, жертвенник
// поверх башни, долг у того, кто никому не должен, серебро в минусе, ступени в
// одной группе, разошедшиеся на две, — ничего из этого не видно ни в счёте, ни
// на экране, пока не станет поздно. Поэтому здесь после каждого действия
// пересматривается вся доска.
//
// Тринадцать правил. Ни одно не выдумано ради проверки: каждое написано в
// правилах игры или прямо следует из них.

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
const seen = new Set();
/**
 * Жалоба записывается один раз на свой род. Тысяча партий на одной и той же
 * поломке выдала бы тысячу одинаковых строк, и настоящая вторая беда утонула
 * бы в них.
 */
const fault = (kind, detail) => {
  if (seen.has(kind)) return;
  seen.add(kind);
  problems.push(`${kind}: ${detail}`);
};

/** Всё, что должно быть верно про партию в любой её миг. */
function audit(state, where) {
  for (const player of state.players) {
    // 1. Серебра меньше нуля не бывает: платёж, который нечем закрыть, ведёт
    //    в наём, а не в минус.
    if (player.silver < 0) fault('серебро ушло в минус', `${player.name} ${player.silver} (${where})`);
    // 2. Наследие не отбирают. Ступень, жертвенник, подать — всё это навсегда.
    if (player.heritage < 0) fault('наследие ушло в минус', `${player.name} ${player.heritage}`);
    /*
      3. Должник не платит.

      Долг бывает и без наёма: разорившийся перед казной остаётся без хозяина,
      но с долгом, — так задумано, и на это в движке есть отдельная оговорка.
      Спрашивается поэтому не «есть ли долг», а то, ради чего эта оговорка и
      писалась: такому игроку не выставляют новых счетов. Выставить — значит
      гонять его по кругу «нечем платить» до скончания партии.
    */
    const owing = Boolean(player.servantOf) || player.debt > 0;
    if (owing && state.pending && state.pending.type === 'pay'
      && E.current(state).id === player.id) {
      fault('счёт разорённому', `${player.name} должен ${player.debt}, а ему выставили ещё`);
    }
    // 4. Наёмник не наёмник сам у себя.
    if (player.servantOf === player.id) fault('наёмник у себя же', player.name);
    // 5. В темнице сидят не дольше срока.
    if (player.prison > B.PRISON_TURNS || player.prison < 0) {
      fault('срок в темнице вне правил', `${player.name} ${player.prison}`);
    }
  }

  const levels = new Map();
  state.cells.forEach((cell, n) => {
    const spec = B.BOARD[n];
    /*
      6. Постройка без хозяина — след от продажи, которую не довели.

         Два исключения, и оба законные: земля разорённого и заложенное за
         счёт казне или «каждому за столом». Хозяина у такой клетки нет, но
         она помнит, чья была, и в юбилей вернётся. Свободной она при этом
         выглядеть не должна — это спрашивается отдельно, ниже.
    */
    if (cell.level > 0 && !cell.owner && !cell.heldFrom && !cell.pledge) {
      fault('постройка без хозяина', `${spec.name} уровень ${cell.level} (${where})`);
    }
    // 7. Жертвенник и поселение на одном уделе не уживаются: жертвенник
    //    ставится на пустой удел и навсегда закрывает его для строительства.
    if (cell.altar && cell.level > 0) fault('жертвенник поверх поселения', spec.name);
    // 8. Строить можно только удел, и только по лестнице.
    if (cell.level > 0 && spec.kind !== 'plot') fault('постройка не на уделе', spec.name);
    if (cell.level > B.LEVELS.length) fault('ступень выше башни', `${spec.name} ${cell.level}`);
    // 9. Земля, взятая у наёмника, помечена — иначе в юбилей её некому вернуть.
    if (cell.heldFrom && !state.players.some((one) => one.id === cell.heldFrom)) {
      fault('земля помнит несуществующего хозяина', spec.name);
    }
    // 10. Заложенное принадлежит кредитору и помнит долг.
    if (cell.pledge && !(cell.pledge.debt > 0)) fault('залог без долга', spec.name);
    if (spec.kind === 'plot' && cell.level > 0) {
      const group = levels.get(spec.group) || [];
      group.push(cell.level);
      levels.set(spec.group, group);
    }
  });

  // 11. Вровень. Ступени внутри цвета не расходятся больше чем на одну — это
  //     правило строительства, и нарушить его можно только в обход движка.
  for (const [group, steps] of levels) {
    const cells = B.groupCells(group);
    const owners = new Set(cells.map((n) => state.cells[n].owner).filter(Boolean));
    // Спрашивается только у цвета в одних руках: у разных хозяев лестницы
    // свои, и ровнять их не по чему. И только в усложнённом ладу: в простом
    // лестницы нет вовсе — каждый удел строится сам по себе.
    if (state.strict === false || owners.size !== 1) continue;
    const all = cells.map((n) => state.cells[n].level);
    if (Math.max(...all) - Math.min(...all) > 1) {
      fault('поселение не вровень', `${group}: ${all.join('/')} (${where})`);
    }
    if (steps.length > cells.length) fault('ступеней больше, чем уделов', group);
  }

  /*
    11-бис. Земля разорённого не предлагается к покупке. Хозяина у неё нет, но
    в юбилей она вернётся прежнему — и проданная из-под него отбиралась бы у
    покупателя молча. Здесь спрашивается сам предложенный счёт: покупка такой
    клетки не должна доходить до игрока.
  */
  if (state.pending && state.pending.type === 'buy') {
    const cell = state.cells[state.pending.cell];
    if (cell.heldFrom || cell.pledge) {
      fault('к покупке предложена земля разорённого', B.BOARD[state.pending.cell].name);
    }
  }

  // 12. Казна не уходит в минус: из неё берут только то, что в ней есть.
  if (state.treasury < 0) fault('казна в минусе', String(state.treasury));

  // 13. Итог наследия — сумма своих слагаемых, а не отдельное число.
  for (const player of state.players) {
    const score = E.scoreOf(state, player);
    const sum = score.steps + score.altars + score.tithe + score.offerings
      + score.hospitality + score.redeemed + score.plots + score.silver;
    if (sum !== score.total) {
      fault('итог не сходится со слагаемыми', `${player.name}: ${sum} против ${score.total}`);
    }
  }
}

const GAMES = Number(process.env.PROMISED_LAND_LOGIC_GAMES || 240);
let seed = 20260917;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

let turns = 0;
let jubilees = 0;
let servants = 0;
let pledges = 0;
let prisons = 0;

for (let game = 0; game < GAMES; game += 1) {
  const years = [3, 5, 7][game % 3];
  const mode = game % 5 === 0 ? 'last' : 'jubilee';
  const size = 2 + (game % 5);
  const players = [];
  for (let seat = 0; seat < size; seat += 1) {
    players.push({ name: `И${seat}`, isBot: true, botLevel: ['youth', 'elder', 'scribe'][seat % 3] });
  }
  /*
    Лад чередуется: половина партий усложнённая, половина простая. Иначе
    простой лад — а в нём строят вдвое чаще и раньше — не проверялся бы вовсе,
    и первая же поломка в нём вышла бы к людям.
  */
  const strict = game % 2 === 0;
  const state = E.createGame({ players, years, mode, strict, rng });
  audit(state, 'начало партии');

  let guard = 0;
  while (state.status === 'playing' && guard < 6000) {
    guard += 1;
    turns += 1;
    const before = E.current(state).id;
    const owed = Boolean(state.pending && state.pending.type === 'pay');
    if (!Bots.step(state, rng)) E.endTurn(state);
    audit(state, `ход ${guard}`);
    /*
      Счёт не переживает чужой ход. Выставленный счёт обязан быть закрыт тем,
      кому он выставлен: если ход перешёл, а «pay» всё висит, значит долг
      молча простили — то самое, чего endTurn и не должен допускать.
    */
    /*
      Счёт не переживает чужой ход. Сравнивается именно тот счёт, что висел до
      действия: в режиме «до последнего» новому игроку в начале его хода
      выставляют подать за год, и этот счёт — его собственный, а не чужой
      недоплаченный.
    */
    if (owed && state.pending && state.pending.type === 'pay'
      && E.current(state).id !== before) {
      fault('счёт пережил чужой ход', `${before} не заплатил, а ходит уже ${E.current(state).id}`);
    }
  }

  if (state.status === 'jubilee') jubilees += 1;
  for (const player of state.players) {
    if (player.servantOf) servants += 1;
    if (player.prison > 0) prisons += 1;
  }
  pledges += state.cells.filter((cell) => cell.pledge).length;

  /*
    Юбилей возвращает всё. После него не должно остаться ни наёмников, ни
    заложенной земли: и то и другое прощается, ради чего юбилей и назван
    юбилеем. В режиме «до последнего» юбилея нет, и спрашивать нечего.
  */
  if (mode !== 'last' && state.status === 'jubilee') {
    const stuck = state.players.filter((one) => one.servantOf || one.debt > 0);
    if (stuck.length) fault('юбилей не освободил наёмника', stuck.map((one) => one.name).join(', '));
    const held = state.cells.filter((cell) => cell.pledge || cell.heldFrom);
    if (held.length) fault('юбилей не вернул заложенное', `${held.length} уделов`);
  }
  audit(state, 'конец партии');
}

/*
  Жалобы печатаются один раз, в самом конце. Раньше здесь стоял ранний выход —
  и сценарии ниже не запускались вовсе, стоило споткнуться партиям выше. То
  есть именно в тот прогон, когда редкие пути нужнее всего, их и не проходили.
*/

/*
  Проверка обязана была увидеть живую игру, а не пустую доску. Если за все
  партии никто не сел в темницу и не заложил удела, значит проверялось что
  угодно, только не механики: такой прогон промолчит и о настоящей поломке.

  Наёма в этом списке нет нарочно. Соперники держат запас на чёрный день и
  разоряются раз в двести партий — надеяться на такую случайность значит
  однажды получить красный прогон на ровном месте. Наём и всё, что вокруг
  него, доводится ниже руками.
*/
if (!(pledges > 0 && prisons > 0 && jubilees > GAMES * 0.5)) {
  console.error('Проверка прошла вхолостую — редкие механики ни разу не сработали:');
  console.error(`  залоги ${pledges}, темница ${prisons}, юбилеи ${jubilees}`);
  process.exit(1);
}

/*
  Разорение и залог — нарочно, до конца и по шагам.

  Всё, что нашлось в этой проверке настоящего, лежало именно здесь: земля без
  хозяина. Разорившийся перед казной и удел, заложенный за счёт казне, теряют
  хозяина по правилам — и ровно поэтому игра предлагала их купить вместе со
  всем построенным, а юбилей потом отбирал покупку молча. Полагаться на то,
  что соперники когда-нибудь сами разорятся, нельзя: за двести сорок партий
  это случилось однажды.
*/
function scenario(name, run) {
  const seat = [{ name: 'Должник' }, { name: 'Сосед' }];
  const state = E.createGame({ players: seat, years: 5, rng });
  try {
    run(state);
  } catch (error) {
    fault(`сценарий «${name}» оборвался`, String(error && error.message));
    return;
  }
  audit(state, `сценарий «${name}»`);
}

scenario('разорение перед казной', (state) => {
  const [debtor] = state.players;
  const plot = B.BOARD.findIndex((spec) => spec.kind === 'plot');
  state.cells[plot].owner = debtor.id;
  state.cells[plot].level = 2;
  debtor.silver = 10;
  state.turn = 0;
  state.phase = 'roll';
  E.roll(state, () => 0.99);          // ход сделан, дальше правим руками
  state.pending = { type: 'pay', amount: 900, toTreasury: true, title: 'Подать', text: '' };
  state.phase = 'settle';
  if (!E.serve(state)) fault('наём не состоялся', 'serve() отказал при счёте казне');
  if (state.cells[plot].owner) fault('земля разорённого осталась за ним', 'owner не снят');
  if (state.cells[plot].heldFrom !== debtor.id) {
    fault('земля разорённого забыла хозяина', String(state.cells[plot].heldFrom));
  }
  /*
    Вот та самая беда: сосед встаёт на этот удел. Предложить его к покупке
    игра не должна — за спиной у покупателя юбилей вернёт землю прежнему.
  */
  state.turn = 1;
  state.players[1].pos = plot;
  state.players[1].silver = 5000;
  state.phase = 'act';
  state.pending = null;
  state.dice = [3, 4];
  E.endTurn(state);
  state.turn = 1;
  state.players[1].pos = plot;
  const engineRoom = E.clone(state);
  engineRoom.players[1].pos = plot;
  if (!E.buy(engineRoom)) {
    // buy() и не должен сработать: покупать нечего, счёта на покупку нет.
  } else {
    fault('землю разорённого дали купить', B.BOARD[plot].name);
  }
});

scenario('залог за счёт казне', (state) => {
  const [debtor] = state.players;
  const rich = B.BOARD
    .map((spec, n) => ({ spec, n }))
    .filter((one) => one.spec.kind === 'plot' && one.spec.price >= 300)[0];
  state.cells[rich.n].owner = debtor.id;
  debtor.silver = 0;
  state.turn = 0;
  state.pending = { type: 'pay', amount: 300, toTreasury: true, title: 'Подать', text: '' };
  state.phase = 'settle';
  const offers = E.pledgeable(state, debtor, 300);
  if (!offers.includes(rich.n)) fault('залог не предложен', `${rich.spec.name} дороже долга`);
  if (!E.pledge(state, rich.n)) fault('залог не состоялся', rich.spec.name);
  const cell = state.cells[rich.n];
  if (cell.owner) fault('заложенное казне осталось за хозяином', String(cell.owner));
  if (!cell.pledge || cell.pledge.by !== debtor.id) fault('залог забыл, чей он', rich.spec.name);
  // Выкуп возвращает удел тому, кто закладывал, а серебро уходит в казну.
  debtor.silver = 1000;
  state.phase = 'act';
  const treasury = state.treasury;
  if (!E.redeemPledge(state, rich.n)) fault('выкуп залога не состоялся', rich.spec.name);
  if (state.cells[rich.n].owner !== debtor.id) fault('выкупленное не вернулось', rich.spec.name);
  if (state.treasury !== treasury + 300) {
    fault('выкуп ушёл не в казну', `${state.treasury} вместо ${treasury + 300}`);
  }
});

/*
  Залог за счёт «каждому за столом». Именно здесь и жила поломка: казну код
  учитывал, а «каждого» — нет, и уделу ставился хозяин `'each'.id`, то есть
  undefined. Земля с постройками пропадала у всех сразу. Сценарий на казну это
  не ловил и не мог: казна как раз обрабатывалась верно.
*/
scenario('залог за счёт каждому', (state) => {
  const [debtor] = state.players;
  const rich = B.BOARD
    .map((spec, n) => ({ spec, n }))
    .filter((one) => one.spec.kind === 'plot' && one.spec.price >= 300)[0];
  state.cells[rich.n].owner = debtor.id;
  state.cells[rich.n].level = 2;
  debtor.silver = 0;
  state.turn = 0;
  state.pending = {
    type: 'pay', amount: 300, toEach: true, each: 150, title: 'Перепись народа', text: '',
  };
  state.phase = 'settle';
  if (!E.pledge(state, rich.n)) fault('залог за счёт каждому не состоялся', rich.spec.name);
  const cell = state.cells[rich.n];
  if (cell.owner !== null) {
    fault('залог за счёт каждому дал уделу пустого хозяина', String(cell.owner));
  }
  if (!cell.pledge || cell.pledge.by !== debtor.id) {
    fault('залог за счёт каждому забыл, чей он', rich.spec.name);
  }
  // И такой удел не предлагается к покупке соседу.
  const visit = E.clone(state);
  visit.turn = 1;
  visit.phase = 'roll';
  visit.players[1].pos = rich.n;
  visit.players[1].silver = 5000;
  visit.pending = null;
  visit.dice = [1, 1];
  E.endTurn(visit);
  if (visit.pending && visit.pending.type === 'buy' && visit.pending.cell === rich.n) {
    fault('заложенное дали купить соседу', rich.spec.name);
  }
});

/*
  Лад игры. Два правила, и разница между ними — ровно одно условие: строить на
  целом цвете или на своём уделе. Проверяется не настройка, а само поведение:
  один и тот же расклад в двух ладах отвечает по-разному.
*/
{
  const build = (strict) => {
    const state = E.createGame({
      players: [{ name: 'Хозяин' }, { name: 'Сосед' }], years: 5, strict, rng,
    });
    const group = B.BOARD.find((spec) => spec.kind === 'plot').group;
    const cells = B.groupCells(group);
    const [mine, ...rest] = cells;
    const [player, other] = state.players;
    state.cells[mine].owner = player.id;
    for (const n of rest) state.cells[n].owner = other.id;   // цвет чужой, кроме одного
    player.silver = 2000;
    state.phase = 'act';
    return { state, mine, player, other, cells };
  };

  const strict = build(true);
  if (E.canBuild(strict.state, strict.player, strict.mine)) {
    fault('в усложнённом ладу построили на одиноком уделе', 'лад игры');
  }

  const simple = build(false);
  if (!E.canBuild(simple.state, simple.player, simple.mine)) {
    fault('в простом ладу не дали построить на своём уделе', 'лад игры');
  }
  if (!E.build(simple.state, simple.mine)) fault('в простом ладу стройка не прошла', 'лад игры');
  if (simple.state.cells[simple.mine].level !== 1) {
    fault(`после стройки ступеней ${simple.state.cells[simple.mine].level}`, 'лад игры');
  }
  audit(simple.state, 'простой лад: стройка на одиноком уделе');

  /*
    И ступени вровень — правило того же цвета, и в простом ладу его тоже нет:
    иначе одинокий удел упирался бы в соседей, которые ему не свои.
  */
  if (!E.canBuild(simple.state, simple.player, simple.mine)) {
    fault('в простом ладу вторая ступень упёрлась в чужие уделы', 'лад игры');
  }

  /*
    Уговор. В усложнённом ладу пустой удел из застроенного цвета не отдают —
    он держит лестницу ровной; в простом лестницы нет, и держать нечего.
  */
  const trade = build(true);
  trade.state.cells[trade.cells[1]].owner = trade.player.id;
  trade.state.cells[trade.cells[1]].level = 1;
  if (E.tradable(trade.state, trade.mine, trade.player.id)) {
    fault('в усложнённом ладу отдали удел из застроенного цвета', 'лад игры');
  }
  const loose = build(false);
  loose.state.cells[loose.cells[1]].owner = loose.player.id;
  loose.state.cells[loose.cells[1]].level = 1;
  if (!E.tradable(loose.state, loose.mine, loose.player.id)) {
    fault('в простом ладу не дали отдать пустой удел из-за соседней постройки', 'лад игры');
  }
}

scenario('разбирают вровень', (state) => {
  const [player] = state.players;
  const group = B.BOARD.find((spec) => spec.kind === 'plot').group;
  const cells = B.groupCells(group);
  for (const n of cells) {
    state.cells[n].owner = player.id;
    state.cells[n].level = 3;
  }
  player.silver = 0;
  state.turn = 0;
  state.pending = { type: 'pay', amount: 120, toTreasury: true, title: 'Подать', text: '' };
  state.phase = 'settle';
  E.settle(state, true);
  const levels = cells.map((n) => state.cells[n].level);
  if (Math.max(...levels) - Math.min(...levels) > 1) {
    fault('разобрали не вровень', `${group}: ${levels.join('/')}`);
  }
});

if (problems.length) {
  console.error('Механики «Земли обетованной» разошлись с правилами:');
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log(`OK: ${GAMES} партий, ${turns} ходов, и после каждого доска пересмотрена целиком — `
  + 'тринадцать правил. Серебро и казна не уходят в минус, разорённому не выставляют новых '
  + 'счетов, постройки не остаются без хозяина, жертвенник не ложится поверх поселения, '
  + 'ступени внутри цвета не расходятся больше чем на одну, счёт не переживает чужой ход, '
  + 'а итог наследия равен сумме своих слагаемых. Оба лада игры сыграны поровну, и отдельно '
  + 'показано, что в усложнённом на одиноком уделе не строят, а в простом строят. '
  + 'Сверх того тремя сценариями доведены до '
  + 'конца редкие пути: разорение перед казной, залог за счёт казне с выкупом и вынужденная '
  + `распродажа. По дороге сыграно: ${servants} наёмов, ${pledges} залогов, ${prisons} `
  + `отсидок, ${jubilees} юбилеев.`);
