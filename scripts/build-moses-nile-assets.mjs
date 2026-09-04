// Собирает ассеты «Моисея на Ниле» прямо в каталог игры, чтобы она работала
// в приложении сама по себе — без обращения к воркеру превью.
//
//   node scripts/build-moses-nile-assets.mjs           собрать
//   node scripts/build-moses-nile-assets.mjs --check   убедиться, что всё на месте
//
// Раньше в репозитории лежал только рантайм игры, а модели, текстуры и three.js
// клала сборка превью. Из приложения игра при этом открывалась во фрейме с
// чужого адреса, а по локальному пути уходила в запасной 2D-режим: ассетов
// рядом просто не было.
//
// Источники те же, что и у сборки превью, и закреплены так же — по коммиту и
// sha256, иначе однажды приедет не то, что проверяли:
//   * архив проверенного пакета моделей и текстур в самом репозитории;
//   * three.js r128 с загрузчиками оттуда же;
//   * фотограмметрический камень из BabylonJS/Assets (CC BY 4.0).
//
// Текстуры ужимаются до 512 px: в оригинале они по мегабайту и не проходят
// лимит репозитория на картинки, а на телефоне столько всё равно не нужно.
// Крокодил прогоняется через meshopt — 2.5 МБ в загрузке игры не оправданы.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const gameDir = path.join(root, 'web/games/moses-nile-v7');
const ownModels = path.join(root, 'web/assets/models/moses-nile');

// Что обязано лежать рядом с игрой, чтобы она поднялась в полном 3D.
const REQUIRED = [
  'vendor/three-r128.min.js',
  'vendor/GLTFLoader-r128.js',
  'vendor/OBJLoader-r128.js',
  'models/basket.obj',
  'models/woven-basket.obj',
  'models/v73/crocodile.glb',
  'models/v73/lotus-flower.obj',
  'models/v73/Boat.glb',
  'models/v73/Flowers.glb',
  'models/environment/nature_pack/Rock_1.glb',
  'models/environment/nature_pack/Bush_1.glb',
  'models/environment/nature_pack/Grass.glb',
  'models/environment/nature_pack/Plant_1.glb',
  'models/environment/nature_pack/Plant_2.glb',
  'models/environment/nature_pack/PalmTree_4.glb',
  'models/environment/survival_pack/WoodLog.glb',
  'models/v75/hippo.glb',
  'models/v75/ship.glb',
  'models/v75/papyrus.glb',
  'models/v75/lotus.glb',
  'models/v75/shield.glb',
  'models/v75/basket-token.glb',
  'models/v75/wings.glb',
  'models/v75/heart.glb',
  'textures/water/water-normal-primary.jpg',
  'textures/water/water-normal-detail.jpg',
  'textures/terrain/damp-sand-color.jpg',
  'textures/terrain/damp-sand-normal.jpg',
  'textures/terrain/sand-color.jpg',
  'textures/terrain/sand-normal.jpg',
  'textures/terrain/pebbles-color.jpg',
  'textures/terrain/pebbles-normal.jpg',
  'textures/terrain/rock-color.jpg',
  'textures/terrain/rock-normal.jpg',
  'textures/terrain/rock-orm.jpg',
];

if (process.argv.includes('--check')) {
  const missing = REQUIRED.filter((rel) => {
    const file = path.join(gameDir, rel);
    return !fs.existsSync(file) || fs.statSync(file).size < 512;
  });
  if (missing.length) {
    console.error('Ассеты «Моисея на Ниле» не собраны. Запустите node scripts/build-moses-nile-assets.mjs');
    for (const rel of missing) console.error(`  нет: ${rel}`);
    process.exit(1);
  }
  const total = REQUIRED.reduce((sum, rel) => sum + fs.statSync(path.join(gameDir, rel)).size, 0);
  console.log(`Ассеты «Моисея на Ниле» на месте: ${REQUIRED.length} файлов, ${(total / 1048576).toFixed(1)} МБ.`);
  process.exit(0);
}

const ASSET_PACKAGE_REV = '8887faf7638a4168d37583f17b1c8eec9c46dd3f';
const ASSET_PACKAGE_SHA256 = '06fd34662ba8424a9987f74f5c9592479ef3ec25a77a7f1b53dd36c4ed0d99e5';
const ASSET_PACKAGE_URL = `https://raw.githubusercontent.com/viDaLost/alias-spy-games/${ASSET_PACKAGE_REV}/downloads/moses-nile-v737-full.zip`;
const BJS_REV = '8be9384c7f8728cb45d27975ac92a412f97a98dd';
const BJS_RAW = `https://raw.githubusercontent.com/BabylonJS/Assets/${BJS_REV}/textures`;
const BJS_FILES = [
  ['rockyGround_basecolor.png', 'textures/terrain/rock-color.jpg', 'e0f9375b366c3bd3375581a329af36fe70ded07ffee8e1156aa6a210c16f486b', 78],
  ['rockyGround_normal.png', 'textures/terrain/rock-normal.jpg', '66fccd4db45e00fcc713907208b42aa9b64f4f26db35e9b5251b36756558b7a1', 82],
  ['rockyGround_metalRough.png', 'textures/terrain/rock-orm.jpg', '9c92d4710faa18a7e0f547ba0ac7a312732087656b079d9548062f1df09674e8', 80],
];

const work = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'moses-nile-assets-'));
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function fetchPinned(url, expected) {
  const out = path.join(work, path.basename(url));
  execFileSync('curl', ['-fsSL', '--retry', '3', url, '-o', out]);
  const actual = sha256(fs.readFileSync(out));
  if (expected && actual !== expected) throw new Error(`Хеш не сошёлся для ${url}\n  ждали ${expected}\n  пришло ${actual}`);
  return out;
}

function copy(from, to) {
  const target = path.join(gameDir, to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(from, target);
}

console.log('Скачиваем пакет моделей…');
const zip = fetchPinned(ASSET_PACKAGE_URL, ASSET_PACKAGE_SHA256);
const pack = path.join(work, 'pack');
fs.mkdirSync(pack, { recursive: true });
execFileSync('unzip', ['-q', zip, '-d', pack]);

// three.js и загрузчики лежат в том же пакете — отдельная ходка в сеть не нужна.
for (const file of ['three-r128.min.js', 'GLTFLoader-r128.js', 'OBJLoader-r128.js']) {
  copy(path.join(pack, 'vendor', file), `vendor/${file}`);
}

copy(path.join(ownModels, 'woven-basket.obj'), 'models/basket.obj');
copy(path.join(ownModels, 'woven-basket.obj'), 'models/woven-basket.obj');

// Модели, присланные владельцем игры, уже ужаты и лежат в репозитории.
for (const [from, to] of [
  ['nile-hippo.glb', 'hippo.glb'], ['nile-ship.glb', 'ship.glb'],
  ['nile-papyrus.glb', 'papyrus.glb'], ['nile-lotus.glb', 'lotus.glb'],
  ['nile-shield.glb', 'shield.glb'], ['nile-basket-token.glb', 'basket-token.glb'],
  ['nile-wings.glb', 'wings.glb'], ['nile-heart.glb', 'heart.glb'],
]) copy(path.join(ownModels, from), `models/v75/${to}`);

for (const file of ['Rock_1.glb', 'Bush_1.glb', 'Grass.glb', 'Plant_1.glb', 'Plant_2.glb', 'PalmTree_4.glb']) {
  copy(path.join(pack, 'models/environment/nature_pack', file), `models/environment/nature_pack/${file}`);
}
copy(path.join(pack, 'models/environment/survival_pack/WoodLog.glb'), 'models/environment/survival_pack/WoodLog.glb');
// human.glb из пакета намеренно не берём: фигуры людей с берегов убраны по
// просьбе владельца, и проверка следит, чтобы модель не вернулась.
for (const file of ['lotus-flower.obj', 'Boat.glb', 'Flowers.glb']) {
  copy(path.join(pack, 'models/v73', file), `models/v73/${file}`);
}

console.log('Ужимаем крокодила…');
await optimiseCrocodile(path.join(pack, 'models/v73/crocodile.glb'), path.join(gameDir, 'models/v73/crocodile.glb'));

console.log('Готовим текстуры…');
const browser = await launchBrowser();
try {
  for (const [from, to, quality] of [
    ['Water_1_M_Normal.jpg', 'textures/water/water-normal-primary.jpg', 0.8],
    ['Water_2_M_Normal.jpg', 'textures/water/water-normal-detail.jpg', 0.8],
    ['damp-sand-diffuse-1k.jpg', 'textures/terrain/damp-sand-color.jpg', 0.76],
    ['damp-sand-normal-gl-1k.jpg', 'textures/terrain/damp-sand-normal.jpg', 0.82],
    ['sand-03-diffuse-1k.jpg', 'textures/terrain/sand-color.jpg', 0.76],
    ['sand-03-normal-gl-1k.jpg', 'textures/terrain/sand-normal.jpg', 0.82],
    ['ganges-pebbles-diffuse-1k.jpg', 'textures/terrain/pebbles-color.jpg', 0.76],
    ['ganges-pebbles-normal-gl-1k.jpg', 'textures/terrain/pebbles-normal.jpg', 0.82],
  ]) {
    await shrink(browser, path.join(pack, 'textures', from), path.join(gameDir, to), quality);
  }
  for (const [name, to, hash, quality] of BJS_FILES) {
    const source = fetchPinned(`${BJS_RAW}/${name}`, hash);
    await shrink(browser, source, path.join(gameDir, to), quality / 100);
  }
} finally {
  await browser.close();
}

fs.rmSync(work, { recursive: true, force: true });

const total = REQUIRED.reduce((sum, rel) => sum + fs.statSync(path.join(gameDir, rel)).size, 0);
console.log(`Готово: ${REQUIRED.length} файлов, ${(total / 1048576).toFixed(1)} МБ рядом с игрой.`);

async function launchBrowser() {
  const { chromium } = await import('playwright-core');
  return chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

/*
  Уменьшение до 512 px рисованием на канве. ImageMagick в этой среде нет, а
  тянуть ради ресайза нативную зависимость незачем: браузер для сборки иконок
  меню в проекте уже используется.
*/
async function shrink(browser, from, to, quality) {
  const page = await browser.newPage();
  try {
    const mime = from.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mime};base64,${fs.readFileSync(from).toString('base64')}`;
    const url = await page.evaluate(async ({ source, max, jpegQuality }) => {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = source; });
      const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // Карты нормалей и цвета одинаково не любят альфу: подложка белая.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', jpegQuality);
    }, { source: dataUrl, max: 512, jpegQuality: quality });
    const buffer = Buffer.from(url.split(',')[1], 'base64');
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, buffer);
    console.log(`  ${path.relative(gameDir, to)}  ${(buffer.length / 1024).toFixed(0)} КБ`);
  } finally {
    await page.close();
  }
}

/*
  Крокодил приезжает на 2.5 МБ и 22 тысячи треугольников — это половина всей
  загрузки игры ради одного препятствия. Плавание ему считает вершинный шейдер
  по осям ограничивающего объёма, а не скелет, поэтому упрощение сетки анимацию
  не ломает.
*/
async function optimiseCrocodile(from, to) {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { dedup, prune, weld, join, flatten, simplify, textureCompress, resample } = await import('@gltf-transform/functions');
  const { MeshoptSimplifier } = await import('meshoptimizer');
  const sharp = (await import('sharp')).default;

  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(from);
  await doc.transform(dedup(), prune({ keepAttributes: false, keepLeaves: false }), flatten(), join({ keepNamed: false }));
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) primitive.setAttribute('TANGENT', null);
  }
  await doc.transform(weld({ tolerance: 0.0001 }));
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: 0.55, error: 0.03, lockBorder: false }));
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [512, 512], quality: 78 }));
  await doc.transform(resample(), prune());
  fs.mkdirSync(path.dirname(to), { recursive: true });
  await io.write(to, doc);
  console.log(`  models/v73/crocodile.glb  ${(fs.statSync(to).size / 1024).toFixed(0)} КБ`);
}
