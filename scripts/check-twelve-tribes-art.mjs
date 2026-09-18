// Картинки «Двенадцати колен»: что уже лежит, что не так и чего ждать.
//
//     node scripts/check-twelve-tribes-art.mjs           посмотреть
//     node scripts/check-twelve-tribes-art.mjs --write   пересобрать art.json
//
// Набор рисует посторонняя модель, а раскладывает руками человек — и ошибиться
// тут можно пятью молчаливыми способами: файла нет; он назван чуть иначе, и
// игра его не найдёт; он без прозрачности, и на карте будет белый прямоугольник
// вокруг рисунка; он мельче, чем нужно, и на экране мылится; знак действия
// нарисован в цвете, хотя игра перекрашивает его под стан.
//
// Отсутствие файлов — не ошибка. Набор приходит частями, и пока части нет,
// игра рисует знак линиями и работает как ни в чём не бывало. Проверка
// падает только на том, что уже положено и положено неправильно.
//
// Список ожидаемого собирается из самой игры: имена станов и действий берутся
// из twelve-tribes-rules.js, разойтись им негде.

import fs from 'node:fs';
import path from 'node:path';
import { describe, locate } from './image-info.mjs';

const root = process.cwd();
const artDir = path.join(root, 'web/assets/twelve-tribes');
const write = process.argv.includes('--write');

const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
new Function('window', fs.readFileSync(path.join(root, 'web/games/twelve-tribes-rules.js'), 'utf8'))(sandbox.window);
const R = sandbox.window.TwelveTribesRules;

/*
  Чего ждём. Размеры — рабочие, с запасом вдвое на экраны удвоенной плотности:
  знак стана живёт на карте размером 22 точки и в кружке стана размером 30,
  рубашка колоды — 74×108.

  `alpha` — обязана иметь прозрачный фон; `flat` — обязана быть одноцветной
  (игра перекрашивает её под стан, и цветной рисунок перекрасить нечем);
  `ratio` — отношение сторон, если оно не квадратное.
*/
const EXPECT = [
  {
    dir: 'signs', what: 'знаки станов',
    names: R.CAMP_IDS, min: 384, alpha: true,
  },
  {
    dir: 'actions', what: 'знаки действий',
    names: ['sabbath', 'jordan', 'journey'], min: 384, alpha: true, flat: true,
  },
  {
    dir: 'cards', what: 'лица особых карт',
    names: ['lot', 'exile'], min: 576, alpha: true,
  },
  {
    dir: 'cards', what: 'рубашка колоды',
    names: ['back'], min: 576, alpha: false, ratio: 1152 / 768,
  },
];

const problems = [];
const missing = [];
const notes = [];
const manifest = { signs: [], actions: [], cards: [] };
let found = 0;
let total = 0;
let weight = 0;

for (const rule of EXPECT) {
  const dir = path.join(artDir, rule.dir);
  for (const name of rule.names) {
    total += 1;
    const file = locate(dir, name);
    if (!file) { missing.push(`${rule.dir}/${name}`); continue; }
    found += 1;
    const shown = path.relative(root, file);
    const info = describe(file);
    if (!info) { problems.push(`${shown} — не PNG и не WebP`); continue; }
    const bytes = fs.statSync(file).size;
    weight += bytes;
    manifest[rule.dir].push(path.relative(root, file).split(path.sep).join('/'));

    if (rule.alpha && !info.alpha) {
      problems.push(`${shown} — без прозрачного фона: на карте вокруг рисунка будет белый прямоугольник`);
    }
    if (!rule.alpha && info.alpha) {
      notes.push(`${shown} — с прозрачностью, хотя это лицо карты целиком; ничего не сломает, но фон будет виден насквозь`);
    }
    if (Math.min(info.width, info.height) < rule.min) {
      problems.push(`${shown} — ${info.width}×${info.height}, а нужно не меньше ${rule.min} по короткой стороне`);
    }
    const want = rule.ratio || 1;
    const got = info.height / info.width;
    if (Math.abs(got - want) > 0.06) {
      problems.push(`${shown} — отношение сторон ${got.toFixed(2)}, а нужно ${want.toFixed(2)}`);
    }
    /*
      Вес считается по факту, а не по обещанию. Полкилобайта на карту никто не
      заметит, а сто — заметят все: игра работает без сети, и весь набор уходит
      в кеш при установке.
    */
    const limit = rule.dir === 'cards' ? 90 * 1024 : 40 * 1024;
    if (bytes > limit) {
      problems.push(`${shown} — ${Math.round(bytes / 1024)} КБ, а больше ${Math.round(limit / 1024)} КБ класть нельзя`);
    }
    if (info.format === 'png') {
      notes.push(`${shown} — PNG. Работать будет, но WebP того же качества весит втрое меньше`);
    }
  }
}

// Лишние файлы: положили под именем, которого игра не спросит, — значит
// рисунок не появится нигде, и человек будет гадать почему.
const known = new Set(EXPECT.flatMap((rule) => rule.names.map((name) => `${rule.dir}/${name}`)));
for (const dir of ['signs', 'actions', 'cards']) {
  const full = path.join(artDir, dir);
  if (!fs.existsSync(full)) continue;
  for (const entry of fs.readdirSync(full)) {
    if (!/\.(?:webp|png)$/i.test(entry)) continue;
    const bare = `${dir}/${entry.replace(/\.(?:webp|png)$/i, '')}`;
    if (!known.has(bare)) problems.push(`${dir}/${entry} — такого имени игра не спрашивает; см. README в папке`);
  }
}

if (write) {
  const file = path.join(artDir, 'art.json');
  const body = {
    note: 'Что из набора уже лежит в папках. Пересобирается сама: node scripts/check-twelve-tribes-art.mjs --write.'
      + ' Пути написаны целиком: по ним же проверка целостности ссылок узнаёт, что картинки не брошены.',
    ...manifest,
  };
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
  console.log(`Список набора пересобран: ${path.relative(root, file)}`);
}

if (problems.length) {
  console.error(`Картинки «Двенадцати колен» не прошли проверку (${problems.length}):`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  if (missing.length) console.error(`\n  Ещё не положены: ${missing.join(', ')}`);
  process.exit(1);
}

for (const line of notes) console.log(`  · ${line}`);
if (!found) {
  console.log(`OK: набора пока нет ни одной картинки из ${total}. Игра рисует знаки линиями — `
    + 'это не поломка. Что рисовать и куда класть: docs/twelve-tribes-art-brief.md.');
} else if (missing.length) {
  console.log(`OK: ${found} картинок из ${total} на месте и верные (${Math.round(weight / 1024)} КБ). `
    + `Ещё ждём: ${missing.join(', ')}.`
    + (write ? '' : ' Не забудьте --write, чтобы игра их увидела.'));
} else {
  console.log(`OK: весь набор на месте — ${total} картинок, ${Math.round(weight / 1024)} КБ. `
    + 'Формы верные, прозрачность там, где нужна.'
    + (write ? '' : ' Не забудьте --write, чтобы игра их увидела.'));
}
