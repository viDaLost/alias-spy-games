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
  { dir: 'plots', names: ownableSlugs, square: true, alpha: true, min: 768, what: 'уделы, пути и источники' },
  { dir: 'icons', names: [...iconSlugs, ...UI_ICONS], square: true, alpha: true, min: 384, what: 'значки клеток и интерфейса' },
  { dir: 'build', names: BUILDS, square: true, alpha: true, min: 384, what: 'ступени поселения' },
  { dir: 'tokens', names: TOKENS, square: true, alpha: true, min: 384, what: 'фишки игроков' },
  { dir: 'cards', names: [...cardSlugs, ...BACKS], square: false, alpha: true, min: 768, what: 'карты и рубашки' },
];
// Рубашка — не иллюстрация, а фон: прозрачность ей не нужна, а форма другая.
const BACK_RATIO = 1536 / 1024;

const SINGLES = [
  { file: 'web/assets/icons/promised-land.webp', square: true, alpha: false, min: 256, what: 'иконка игры в меню' },
  { file: 'web/assets/game-scenes/scenes/promised-land.webp', square: false, alpha: false, min: 1024, what: 'фон сцены игры' },
];

// ————————————————————————————————————————————— чтение заголовков

/** Размеры и прозрачность по заголовку файла: без библиотек, только байты. */
function describe(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length > 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    const colorType = buffer[25];
    const hasTRNS = buffer.includes(Buffer.from('tRNS', 'ascii'));
    return {
      format: 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      alpha: colorType === 4 || colorType === 6 || (colorType === 3 && hasTRNS),
    };
  }
  if (buffer.length > 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return {
        format: 'webp',
        width: (buffer.readUIntLE(24, 3) & 0xffffff) + 1,
        height: (buffer.readUIntLE(27, 3) & 0xffffff) + 1,
        alpha: Boolean(buffer[20] & 0x10),
      };
    }
    if (chunk === 'VP8L') {
      const bits = buffer.readUInt32LE(21);
      return {
        format: 'webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
        alpha: Boolean((bits >> 28) & 1),
      };
    }
    if (chunk === 'VP8 ') {
      return {
        format: 'webp',
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
        alpha: false,           // простой lossy WebP прозрачности не несёт
      };
    }
  }
  return null;
}

/** Файл ищется и как .webp, и как .png: перевести в webp можно и потом. */
function locate(dir, name) {
  for (const ext of ['.webp', '.png']) {
    const file = path.join(dir, name + ext);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

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
  if (Math.min(info.width, info.height) < rule.min) {
    wrong.push(`${shown} — мелковата: ${info.width}×${info.height}, нужно от ${rule.min}`);
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
  const file = path.join(root, single.file);
  if (!fs.existsSync(file)) { missing.push(`${single.file} — ${single.what}`); continue; }
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
