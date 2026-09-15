// Картинки «Земли обетованной» → в превью на Cloudflare.
//
// Дом у картинок один: web/assets/promised-land. Туда они лягут и когда игра
// переедет в само приложение, и менять его ради превью незачем.
//
// Но воркер превью раздаёт только своё public/: ничего за его пределами он
// не видит. Значит, перед выкладкой картинки надо положить внутрь. Копия
// собирается этим скриптом и не коммитится (см. .gitignore) — иначе те же
// три с половиной мегабайта легли бы в репозиторий дважды, и однажды
// разошлись бы между собой.
//
// Скрипт зовут двое: workflow выкладки перед wrangler deploy и браузерная
// проверка перед тем, как поднять игру у себя. Один механизм, а не два.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const from = path.join(root, 'web/assets/promised-land');
const to = path.join(root, 'cloudflare/promised-land-preview/public/art');

if (!fs.existsSync(from)) {
  console.error(`Нечего копировать: нет ${path.relative(root, from)}`);
  process.exit(1);
}

let copied = 0;
let bytes = 0;

function walk(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const src = path.join(source, entry.name);
    const dst = path.join(destination, entry.name);
    if (entry.isDirectory()) { walk(src, dst); continue; }
    if (!/\.(?:webp|png)$/i.test(entry.name)) continue;
    // Копируется только изменившееся: проверка зовёт скрипт на каждом прогоне,
    // и перекладывать сотню файлов впустую незачем.
    const source_stat = fs.statSync(src);
    if (fs.existsSync(dst) && fs.statSync(dst).size === source_stat.size) continue;
    fs.copyFileSync(src, dst);
    copied += 1;
    bytes += source_stat.size;
  }
}

/*
  Файлы, которых в источнике больше нет, из копии убираются: иначе
  переименованная картинка осталась бы в превью под старым именем навсегда.
  Одиночные файлы — исключение: они приходят из других мест и своего двойника
  в общей папке не имеют, так что уборка сносила бы их на каждом прогоне.
*/
const SINGLES = new Set(['scene.webp', 'menu-icon.webp', 'three-r128.min.js']);

function prune(source, destination) {
  if (!fs.existsSync(destination)) return;
  for (const entry of fs.readdirSync(destination, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(destination, entry.name);
    if (entry.isDirectory()) { prune(src, dst); continue; }
    if (SINGLES.has(entry.name)) continue;
    if (!fs.existsSync(src)) { fs.unlinkSync(dst); console.log(`убрано лишнее: art/${entry.name}`); }
  }
}

walk(from, to);
prune(from, to);

/*
  Фон сцены и иконка игры лежат не в общей папке, а среди таких же файлов
  других игр — там их место в приложении. Превью фон нужен, поэтому он
  переносится отдельно и под коротким именем.
*/
for (const [source, name] of [
  ['web/assets/game-scenes/scenes/promised-land.webp', 'scene.webp'],
  ['web/assets/icons/promised-land.webp', 'menu-icon.webp'],
  // three.js уже лежит в репозитории — у «Моисея на Ниле». Второй копии в
  // git быть не должно: шестьсот килобайт одного и того же разойдутся.
  ['web/games/moses-nile-v7/vendor/three-r128.min.js', 'three-r128.min.js'],
]) {
  const src = path.join(root, source);
  const dst = path.join(to, name);
  if (!fs.existsSync(src)) continue;
  if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size) continue;
  fs.copyFileSync(src, dst);
  copied += 1;
  bytes += fs.statSync(src).size;
}

const count = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .reduce((sum, entry) => sum + (entry.isDirectory() ? count(path.join(dir, entry.name)) : 1), 0);
const total = count(to);

console.log(copied
  ? `Скопировано в превью ${copied} картинок (${(bytes / 1024 / 1024).toFixed(1)} МБ), всего там ${total}.`
  : `Картинки в превью уже свежие: ${total} файлов.`);
