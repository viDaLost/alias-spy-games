// Жребий «Земли обетованной»: кости честные, и это посчитано, а не обещано.
//
// «Кажется, выпадает одно и то же» — жалоба, которую нельзя ни подтвердить, ни
// опровергнуть на глаз: две кости дают треугольное распределение, семёрка
// выпадает вшестеро чаще двойки, и это правила, а не поломка. Поэтому здесь
// считается то, что действительно может быть сломано:
//
//   * каждая грань выпадает своей долей — ни одна не забыта и ни одна не любима;
//   * две кости независимы — по первой нельзя предсказать вторую;
//   * дубли случаются своей долей, а не чаще и не реже;
//   * кость не залипает: после шестёрки шестёрка не вероятнее прочих;
//   * сумма ложится треугольником, как ей и положено.
//
// Мерой служит хи-квадрат: он отвечает не «похоже ли», а «бывает ли такой
// перекос у честной кости и как часто». Порог взят для 5 степеней свободы на
// уровне 0.001 — раз в тысячу прогонов честная кость его перешагнёт, и это
// цена, которую стоит платить за то, чтобы проверка не мигала.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'cloudflare/promised-land-preview/public');

// Файлы игры — классические скрипты: они кладут себя в window.
const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
sandbox.window.crypto = globalThis.crypto;
for (const file of ['board.js', 'cards.js', 'engine.js']) {
  const code = fs.readFileSync(path.join(dir, file), 'utf8');
  new Function('window', 'crypto', code)(sandbox.window, globalThis.crypto);
}
const E = sandbox.window.PromisedLandEngine;

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

/*
  Кости считаются не выдуманным броском, а настоящим ходом движка: в roll есть
  темница, три дубля подряд и пропуск хода, и мерить надо то, что доходит до
  доски. Партия заводится заново каждые несколько сотен бросков, чтобы никто
  не разорился и не ушёл в наём — тогда бросков просто не станет.
*/
const ROLLS = 60_000;

/** Хи-квадрат наблюдённого против ожидаемого. */
const chi = (counts, expected) =>
  counts.reduce((sum, count) => sum + ((count - expected) ** 2) / expected, 0);

/*
  Одна выборка: ROLLS настоящих бросков и пять мер по ним. Пороги взяты на
  уровне 0.001, и мер пять — значит, честная кость перешагнёт хотя бы один
  раз примерно в двухстах прогонах. Так и случилось на CI: «вторая кость
  перекошена, хи-квадрат 21.5» при системном crypto-источнике.

  Ослаблять пороги нельзя — тогда перестанет ловиться настоящий перекос.
  Поэтому выборка, на которой мера сработала, переснимается заново: сломанный
  генератор перекошен в каждой выборке и провалит и вторую, а честной кости
  провалить две независимые выборки подряд — один шанс на десятки тысяч.
*/
function sample() {
  const failed = [];
  const check = (condition, message) => { if (!condition) failed.push(message); };
  const faces = [0, 0, 0, 0, 0, 0];
  const second = [0, 0, 0, 0, 0, 0];
  const pairs = new Map();          // «первая:вторая» — для проверки независимости
  const sums = new Array(13).fill(0);
  let doubles = 0;
  let repeats = 0;                  // сколько раз кость повторила своё же прошлое
  let previous = 0;

  let state = null;
  let inGame = 0;
  for (let i = 0; i < ROLLS; i += 1) {
    if (!state || inGame > 400 || state.status !== 'playing') {
      state = E.createGame({ players: [{ name: 'А' }, { name: 'Б' }], years: 7 });
      inGame = 0;
    }
    // Бросок требует своей фазы: счёт или карта на столе его не пустят.
    state.phase = 'roll';
    state.pending = null;
    const player = E.current(state);
    player.prison = 0;
    player.skip = false;
    player.servantOf = null;
    E.roll(state);
    inGame += 1;

    const [a, b] = state.dice;
    if (!a || !b) continue;         // пропуск хода костей не бросает
    faces[a - 1] += 1;
    second[b - 1] += 1;
    sums[a + b] += 1;
    if (a === b) doubles += 1;
    pairs.set(`${a}:${b}`, (pairs.get(`${a}:${b}`) || 0) + 1);
    if (a === previous) repeats += 1;
    previous = a;
  }

  const total = faces.reduce((sum, count) => sum + count, 0);
  check(total > ROLLS * 0.9, `до доски дошло ${total} бросков из ${ROLLS}`);

  // 1. Грани. Порог 20.5 — это 0.001 при пяти степенях свободы.
  const expected = total / 6;
  const chiFirst = chi(faces, expected);
  const chiSecond = chi(second, expected);
  check(chiFirst < 20.5, `первая кость перекошена: хи-квадрат ${chiFirst.toFixed(1)} при ${faces.join('/')}`);
  check(chiSecond < 20.5, `вторая кость перекошена: хи-квадрат ${chiSecond.toFixed(1)} при ${second.join('/')}`);

  /*
    2. Независимость. Если кости связаны, пары «первая-вторая» лягут неровно:
    какие-то сочетания станут частыми, какие-то редкими. Тридцать пять степеней
    свободы, порог 0.001 — 66.6.
  */
  const table = [];
  for (let a = 1; a <= 6; a += 1) {
    for (let b = 1; b <= 6; b += 1) table.push(pairs.get(`${a}:${b}`) || 0);
  }
  const chiPairs = chi(table, total / 36);
  check(chiPairs < 66.6, `кости связаны между собой: хи-квадрат пар ${chiPairs.toFixed(1)}`);

  // 3. Дубли — ровно шестая часть бросков, с поправкой на разброс.
  const doubleShare = doubles / total;
  check(Math.abs(doubleShare - 1 / 6) < 0.012,
    `дублей ${(doubleShare * 100).toFixed(2)}% вместо 16.67%`);

  /*
    4. Залипание. Кость не помнит прошлого броска, значит повтор случается ровно
    в шестой части случаев. Это ловит самую частую поломку генератора — когда
    соседние значения оказываются связаны.
  */
  const repeatShare = repeats / total;
  check(Math.abs(repeatShare - 1 / 6) < 0.012,
    `кость повторяет себя в ${(repeatShare * 100).toFixed(2)}% бросков вместо 16.67%`);

  // 5. Сумма ложится треугольником: семёрка — самая частая, двойка и двенадцать — самые редкие.
  const share = (value) => sums[value] / total;
  check(share(7) > share(6) && share(7) > share(8), 'семёрка не самая частая сумма');
  check(share(2) < share(3) && share(12) < share(11), 'края суммы не самые редкие');
  check(Math.abs(share(7) - 6 / 36) < 0.02, `семёрка выпадает в ${(share(7) * 100).toFixed(2)}% вместо 16.67%`);

  return { failed, total, chiFirst, chiSecond, chiPairs, doubleShare, repeatShare, share };
}

let measured = sample();
if (measured.failed.length) {
  const first = measured.failed;
  measured = sample();
  if (!measured.failed.length) {
    console.log(`Первая выборка перешагнула порог (${first.join('; ')}), вторая — ровная: случайный выброс честной кости.`);
  }
}
problems.push(...measured.failed);
const { total, chiFirst, chiSecond, chiPairs, doubleShare, repeatShare, share } = measured;

/*
  6. Источник случайности. Движок по умолчанию берёт её у системы — там, где
  система её даёт. Проверяется не название, а поведение: два прогона подряд,
  начатых одинаково, обязаны разойтись. С Math.random это тоже верно, но
  отметка в исходнике говорит, что источник выбран, а не достался по
  умолчанию, — и что запасной путь на месте.
*/
const engineSource = fs.readFileSync(path.join(dir, 'engine.js'), 'utf8');
need(engineSource.includes('getRandomValues'), 'движок не спрашивает случайность у системы');
need(engineSource.includes('return Math.random();'), 'у системного источника нет запасного пути');
const twice = [0, 1].map(() => {
  const game = E.createGame({ players: [{ name: 'А' }, { name: 'Б' }], years: 7 });
  const out = [];
  for (let i = 0; i < 40; i += 1) {
    game.phase = 'roll';
    game.pending = null;
    E.current(game).prison = 0;
    E.roll(game);
    out.push(game.dice.join(''));
  }
  return out.join(' ');
});
need(twice[0] !== twice[1], 'два прогона подряд дали один и тот же жребий');

// 7. Зерно по-прежнему работает: проверкам нужен повторяемый прогон.
const seeded = () => {
  let seed = 12345;
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
};
const sown = [0, 1].map(() => {
  const rng = seeded();
  const game = E.createGame({ players: [{ name: 'А' }, { name: 'Б' }], years: 7, rng });
  const out = [];
  for (let i = 0; i < 40; i += 1) {
    game.phase = 'roll';
    game.pending = null;
    E.current(game).prison = 0;
    E.roll(game, rng);
    out.push(game.dice.join(''));
  }
  return out.join(' ');
});
need(sown[0] === sown[1], 'прогон с зерном перестал повторяться — проверкам не на что опереться');

if (problems.length) {
  console.error('Жребий «Земли обетованной» не прошёл проверку:');
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log(`OK: ${total} бросков. Грани ровные (хи-квадрат ${chiFirst.toFixed(1)} и `
  + `${chiSecond.toFixed(1)} при пороге 20.5), кости независимы (${chiPairs.toFixed(1)} при 66.6), `
  + `дублей ${(doubleShare * 100).toFixed(2)}%, повторов подряд ${(repeatShare * 100).toFixed(2)}% — `
  + `оба около 16.67%. Сумма легла треугольником: семёрка ${(share(7) * 100).toFixed(2)}%. `
  + 'Случайность берётся у системы, два одинаково начатых прогона расходятся, а с зерном — сходятся.');
