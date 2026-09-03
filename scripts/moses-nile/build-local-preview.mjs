/*
  Локальная сборка превью «Моисея на Ниле».

  Повторяет шаги воркфлоу `deploy-moses-nile-v740-preview.yml`, но без
  Cloudflare: раскладывает игру, библиотеки three.js и модели в каталог,
  который можно отдать статикой. Нужна, чтобы видеть игру с настоящими
  моделями, а не с процедурными заглушками.

  Архив моделей берётся из самого репозитория (ветка `package/moses-nile-v737`),
  поэтому сеть нужна только для three.js. Если и его нет, положите файлы
  вручную в <out>/vendor.

  Запуск: node scripts/moses-nile/build-local-preview.mjs [каталог]
*/
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const gameRoot = path.join(root, 'web/games/moses-nile-v7');
const out = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'moses-nile-preview'));

const ASSET_PACKAGE_REF = 'origin/package/moses-nile-v737';
const ASSET_PACKAGE_PATH = 'downloads/moses-nile-v737-full.zip';
const ASSET_PACKAGE_SHA256 = '06fd34662ba8424a9987f74f5c9592479ef3ec25a77a7f1b53dd36c4ed0d99e5';
const THREE_RAW = 'https://raw.githubusercontent.com/mrdoob/three.js/r128';

const dirs = [
  'js', 'vendor',
  'models/environment/nature_pack', 'models/environment/survival_pack', 'models/v73',
  'textures/water', 'textures/terrain',
];

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, stdio: 'pipe', maxBuffer: 1 << 28, ...options });
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

fs.rmSync(out, { recursive: true, force: true });
for (const dir of dirs) fs.mkdirSync(path.join(out, dir), { recursive: true });

fs.copyFileSync(path.join(gameRoot, 'index.html'), path.join(out, 'index.html'));
copyTree(path.join(gameRoot, 'js'), path.join(out, 'js'));
fs.copyFileSync(
  path.join(root, 'web/assets/models/moses-nile/woven-basket.obj'),
  path.join(out, 'models/basket.obj'),
);

// three.js и загрузчики той же ревизии, что тянет воркфлоу.
const vendor = [
  ['build/three.min.js', 'three-r128.min.js'],
  ['examples/js/loaders/GLTFLoader.js', 'GLTFLoader-r128.js'],
  ['examples/js/loaders/OBJLoader.js', 'OBJLoader-r128.js'],
  ['examples/js/utils/SkeletonUtils.js', 'SkeletonUtils-r128.js'],
];
for (const [remote, local] of vendor) {
  const target = path.join(out, 'vendor', local);
  try {
    run('curl', ['-fsSL', '--retry', '3', `${THREE_RAW}/${remote}`, '-o', target]);
  } catch {
    console.warn(`[preview] не удалось скачать ${local} — положите файл в ${path.join(out, 'vendor')}`);
  }
}

// Архив моделей достаём из истории репозитория: он закреплён по SHA-256.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moses-nile-assets-'));
const archive = path.join(workDir, 'models.zip');
fs.writeFileSync(archive, run('git', ['show', `${ASSET_PACKAGE_REF}:${ASSET_PACKAGE_PATH}`], { encoding: 'buffer' }));
const digest = run('sha256sum', [archive], { encoding: 'utf8' }).split(/\s+/)[0];
if (digest !== ASSET_PACKAGE_SHA256) throw new Error(`Архив моделей не совпал по SHA-256: ${digest}`);
run('unzip', ['-q', '-o', archive, '-d', workDir]);

const models = [
  ['models/environment/nature_pack/Rock_1.glb', 'models/environment/nature_pack/Rock_1.glb'],
  ['models/environment/nature_pack/Plant_1.glb', 'models/environment/nature_pack/Plant_1.glb'],
  ['models/environment/nature_pack/Plant_2.glb', 'models/environment/nature_pack/Plant_2.glb'],
  ['models/environment/nature_pack/Bush_1.glb', 'models/environment/nature_pack/Bush_1.glb'],
  ['models/environment/nature_pack/Grass.glb', 'models/environment/nature_pack/Grass.glb'],
  ['models/environment/nature_pack/PalmTree_4.glb', 'models/environment/nature_pack/PalmTree_4.glb'],
  ['models/environment/survival_pack/WoodLog.glb', 'models/environment/survival_pack/WoodLog.glb'],
  ['models/v73/crocodile.glb', 'models/v73/crocodile.glb'],
  ['models/v73/lotus-flower.obj', 'models/v73/lotus-flower.obj'],
  ['models/v73/Boat.glb', 'models/v73/Boat.glb'],
  ['models/v73/Flowers.glb', 'models/v73/Flowers.glb'],
  ['models/v73/human.glb', 'models/v73/human.glb'],
];
for (const [from, to] of models) fs.copyFileSync(path.join(workDir, from), path.join(out, to));

// Текстуры кладутся без пережатия: локально размер не важен.
const textures = [
  ['textures/Water_1_M_Normal.jpg', 'textures/water/water-normal-primary.jpg'],
  ['textures/Water_2_M_Normal.jpg', 'textures/water/water-normal-detail.jpg'],
  ['textures/damp-sand-diffuse-1k.jpg', 'textures/terrain/damp-sand-color.jpg'],
  ['textures/damp-sand-normal-gl-1k.jpg', 'textures/terrain/damp-sand-normal.jpg'],
  ['textures/sand-03-diffuse-1k.jpg', 'textures/terrain/sand-color.jpg'],
  ['textures/sand-03-normal-gl-1k.jpg', 'textures/terrain/sand-normal.jpg'],
  ['textures/ganges-pebbles-diffuse-1k.jpg', 'textures/terrain/pebbles-color.jpg'],
  ['textures/ganges-pebbles-normal-gl-1k.jpg', 'textures/terrain/pebbles-normal.jpg'],
];
for (const [from, to] of textures) fs.copyFileSync(path.join(workDir, from), path.join(out, to));

fs.rmSync(workDir, { recursive: true, force: true });
console.log(`Превью собрано: ${out}`);
console.log(`Снять кадры: node scripts/moses-nile/capture.mjs ${out} ./nile-shots`);
