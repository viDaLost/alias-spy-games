// Картинки «Земли обетованной»: всё ли на месте и всё ли правильное.
//
// Восемьдесят пять файлов, которые рисует посторонняя модель и раскладывает
// руками человек. Ошибиться здесь можно четырьмя способами, и все четыре
// молчаливые: файла нет вовсе; он назван чуть иначе, и игра просто не найдёт
// рисунок; он без прозрачности, и в тёмной теме на месте карточки будет белый
// прямоугольник; он не той формы, и в кольце поедет вёрстка.
//
// Поэтому список ожидаемого собирается не руками, а из самой игры: имена
// уделов и карт берутся из board.js и cards.js. Разойтись им негде.
//
// Проверка намеренно не включена в CI: картинки приходят партиями по десять, и
// между партиями ветка не должна быть красной. Запускайте руками:
//     node scripts/check-promised-land-art.mjs

import fs from 'node:fs';
import path from 'node:path';
import { minSide } from './promised-land-art-spec.mjs';
// Чтение заголовков картинки общее с проверкой набора «Двенадцати колен»:
// два ответа про один файл — это хуже, чем отсутствие ответа.
import { describe, locate } from './image-info.mjs';

const root = process.cwd();
const gameDir = path.join(root, 'cloudflare/promised-land-preview/public');
const artDir = path.join(root, 'web/assets/promised-land');

const sandbox = { window: {} };
sandbox.window.window = sandbox.window;
for (const file of ['board.js', 'cards.js']) {
  new Function('window', fs.readFileSync(path.join(gameDir, file), 'utf8'))(sandbox.window);
}
const B = sandbox.window.PromisedLandBoard;
const CARDS = sandbox.window.PromisedLandCards;

// ————————————————————————————————————————————— что ожидается

const ownableSlugs = [...new Set(B.BOARD.filter((cell) => B.OWNABLE.has(cell.kind)).map((cell) => cell.slug))];
const iconSlugs = [...new Set(B.BOARD.filter((cell) => !B.OWNABLE.has(cell.kind)).map((cell) => cell.slug))];
const cardSlugs = [
  ...CARDS.PROVIDENCE.map((card) => `providence-${card.id}`),
  ...CARDS.MERCY.map((card) => `mercy-${card.id}`),
];

const UI_ICONS = ['ui-shekel', 'ui-heritage', 'ui-pot', 'ui-dice', 'ui-servant', 'ui-redeem', 'ui-jubilee', 'ui-sabbath'];
const BUILDS = ['build-well', 'build-tent', 'build-house', 'build-wall', 'build-tower', 'build-altar'];
const TOKENS = ['token-staff', 'token-jar', 'token-sheaf', 'token-lamp', 'token-scroll', 'token-sling'];
const BACKS = ['back-providence', 'back-mercy'];

/*
  Требования к каждой группе. `square` — картинка обязана быть квадратной;
  `alpha` — обязана иметь прозрачный фон; `min` — наименьшая допустимая
  сторона. Точный размер не требуется: модель может отдать 1024 или 1200, и
  ругаться на это незачем — важны форма, прозрачность и то, что картинка не
  превратилась в миниатюру.
*/
const GROUPS = [
  { dir: 'plots', names: ownableSlugs, square: true, alpha: true, min: minSide('plots'), what: 'уделы, пути и источники' },
  { dir: 'icons', names: [...iconSlugs, ...UI_ICONS], square: true, alpha: true, min: minSide('icons'), what: 'значки клеток и интерфейса' },
  { dir: 'build', names: BUILDS, square: true, alpha: true, min: minSide('build'), what: 'ступени поселения' },
  { dir: 'tokens', names: TOKENS, square: true, alpha: true, min: minSide('tokens'), what: 'фишки игроков' },
  { dir: 'cards', names: [...cardSlugs, ...BACKS], square: false, alpha: true, min: minSide('cards'), what: 'карты и рубашки' },
];
// Рубашка — не иллюстрация, а фон: прозрачность ей не нужна, а форма другая.
const BACK_RATIO = 1536 / 1024;

const SINGLES = [
  { file: 'web/assets/icons/promised-land-v2.webp', square: true, alpha: false, min: minSide('menu'), what: 'иконка игры в меню' },
  { file: 'web/assets/game-scenes/scenes/promised-land.webp', square: false, alpha: false, min: minSide('scene'), what: 'фон сцены игры' },
];

// ————————————————————————————————————————————— сама проверка

const missing = [];
const wrong = [];
const extra = [];
const asPng = [];
let found = 0;
let total = 0;

function inspect(file, rule, label) {
  const info = describe(file);
  const shown = path.relative(root, file);
  if (!info) { wrong.push(`${shown} — не PNG и не WebP`); return; }
  if (info.format === 'png') asPng.push(shown);
  if (rule.square && info.width !== info.height) {
    wrong.push(`${shown} — не квадрат: ${info.width}×${info.height}`);
  }
  /*
    Меряется длинная сторона: перегон вписывает картинку в квадрат по ней, и
    у рубашки 512×768 короткая сторона заведомо меньше порога. Раньше здесь
    стояла короткая — и проверка ругалась на правильные файлы.
  */
  if (Math.max(info.width, info.height) < rule.min) {
    wrong.push(`${shown} — мелковата: ${info.width}×${info.height}, нужно от ${rule.min} по длинной стороне`);
  }
  if (rule.alpha && !info.alpha) {
    wrong.push(`${shown} — без прозрачного фона (${label}); в тёмной теме это будет светлое пятно`);
  }
}

for (const group of GROUPS) {
  const dir = path.join(artDir, group.dir);
  const present = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => /\.(?:webp|png)$/i.test(name))
    : [];
  const known = new Set(group.names);

  for (const name of group.names) {
    total += 1;
    const file = locate(dir, name);
    if (!file) { missing.push(`${group.dir}/${name}.webp — ${group.what}`); continue; }
    found += 1;
    const isBack = BACKS.includes(name);
    const rule = isBack
      ? { square: false, alpha: false, min: group.min }
      : group;
    inspect(file, rule, group.what);
    if (isBack) {
      const info = describe(file);
      const ratio = info ? info.height / info.width : 0;
      if (Math.abs(ratio - BACK_RATIO) > 0.12) {
        wrong.push(`${group.dir}/${name} — рубашка должна быть вытянутой как карта (около 2:3), а она ${ratio.toFixed(2)}:1`);
      }
    }
  }

  for (const name of present) {
    if (!known.has(name.replace(/\.(?:webp|png)$/i, ''))) {
      extra.push(`${group.dir}/${name} — такого имени игра не ждёт, проверьте написание`);
    }
  }
}

for (const single of SINGLES) {
  total += 1;
  // Одиночные файлы искались только как .webp, тогда как у всех остальных
  // принимался и .png. Из-за этого лежащая рядом иконка считалась пропавшей.
  const dir = path.dirname(path.join(root, single.file));
  const name = path.basename(single.file).replace(/\.[^.]+$/, '');
  const file = locate(dir, name);
  if (!file) { missing.push(`${single.file} — ${single.what}`); continue; }
  found += 1;
  inspect(file, single, single.what);
}

// ————————————————————————————————————————————— вывод

if (!found) {
  console.log(`Картинок пока нет ни одной. Ожидается ${total} файлов; куда какие класть — `
    + 'в docs/promised-land-art-brief.md, папки уже созданы в web/assets/promised-land/.');
  process.exit(0);
}

const lines = [];
if (missing.length) {
  lines.push(`Не хватает ${missing.length} из ${total}:`);
  for (const item of missing) lines.push(`  · ${item}`);
}
if (wrong.length) {
  lines.push(`Не в порядке ${wrong.length}:`);
  for (const item of wrong) lines.push(`  ✗ ${item}`);
}
if (extra.length) {
  lines.push(`Лишние или названные иначе (${extra.length}):`);
  for (const item of extra) lines.push(`  ? ${item}`);
}

if (lines.length) {
  console.error(`Картинки «Земли обетованной»: на месте ${found} из ${total}.`);
  for (const line of lines) console.error(line);
  process.exit(1);
}

console.log(`OK: все ${total} картинок на месте — ${ownableSlugs.length} уделов, путей и источников, `
  + `${iconSlugs.length + UI_ICONS.length} значков, ${BUILDS.length} ступеней поселения, `
  + `${TOKENS.length} фишек, ${cardSlugs.length} карт и ${BACKS.length} рубашки, иконка меню и фон сцены. `
  + 'Формы верные, прозрачность там, где нужна.'
  + (asPng.length ? ` В PNG остались ${asPng.length} файлов — переведите их в WebP, это вдвое легче.` : ''));
