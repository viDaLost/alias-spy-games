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
const SINGLES = new Set(['scene.webp', 'menu-icon.webp', 'three-r128.min.js',
  'GLTFLoader-r128.js']);

const KEPT_DIRS = new Set(['models']);

function prune(source, destination) {
  if (!fs.existsSync(destination)) return;
  for (const entry of fs.readdirSync(destination, { withFileTypes: true })) {
    if (entry.isDirectory() && KEPT_DIRS.has(entry.name)) continue;
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
  ['web/assets/icons/promised-land-v2.webp', 'menu-icon.webp'],
  // three.js уже лежит в репозитории — у «Моисея на Ниле». Второй копии в
  // git быть не должно: шестьсот килобайт одного и того же разойдутся.
  ['web/games/moses-nile-v7/vendor/three-r128.min.js', 'three-r128.min.js'],
  ['web/games/moses-nile-v7/vendor/GLTFLoader-r128.js', 'GLTFLoader-r128.js'],
  /*
    Окружение доски: пальмы, камни, кусты и трава. Модели тоже уже лежат в
    репозитории — у «Моисея на Ниле», и второй копии в git им не нужно, как и
    самой библиотеке. Все семеро вместе весят полторы сотни килобайт.
  */
  ['web/games/moses-nile-v7/models/environment/nature_pack/PalmTree_4.glb', 'models/PalmTree_4.glb'],
  ['web/games/moses-nile-v7/models/environment/nature_pack/Bush_1.glb', 'models/Bush_1.glb'],
  ['web/games/moses-nile-v7/models/environment/nature_pack/Rock_1.glb', 'models/Rock_1.glb'],
  ['web/games/moses-nile-v7/models/environment/nature_pack/Grass.glb', 'models/Grass.glb'],
  ['web/games/moses-nile-v7/models/environment/nature_pack/Plant_1.glb', 'models/Plant_1.glb'],
  ['web/games/moses-nile-v7/models/environment/nature_pack/Plant_2.glb', 'models/Plant_2.glb'],
  ['web/games/moses-nile-v7/models/environment/survival_pack/WoodLog.glb', 'models/WoodLog.glb'],
  // Постройки: пять ступеней поселения. Собраны из исходников 0 A.D.
  // скриптом build-promised-land-models.mjs, лицензия лежит рядом с ними.
  ['web/assets/promised-land/models/build-well.glb', 'models/build-well.glb'],
  ['web/assets/promised-land/models/build-tent.glb', 'models/build-tent.glb'],
  ['web/assets/promised-land/models/build-house.glb', 'models/build-house.glb'],
  ['web/assets/promised-land/models/build-wall.glb', 'models/build-wall.glb'],
  ['web/assets/promised-land/models/build-tower.glb', 'models/build-tower.glb'],
  // Фишки игроков: шесть людей, по одному на место за столом.
  ['web/assets/promised-land/models/token-citizen.glb', 'models/token-citizen.glb'],
  ['web/assets/promised-land/models/token-healer.glb', 'models/token-healer.glb'],
  ['web/assets/promised-land/models/token-fisher.glb', 'models/token-fisher.glb'],
  ['web/assets/promised-land/models/token-archer.glb', 'models/token-archer.glb'],
  ['web/assets/promised-land/models/token-spearman.glb', 'models/token-spearman.glb'],
  ['web/assets/promised-land/models/token-javelin.glb', 'models/token-javelin.glb'],
  ['web/assets/promised-land/models/LICENSE.txt', 'models/LICENSE.txt'],
]) {
  const src = path.join(root, source);
  const dst = path.join(to, name);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
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
