#!/usr/bin/env node
/*
  Локальная сборка превью «Моисей на Ниле» и съёмка кадров.

  Зачем: превью живёт на Cloudflare, а из среды агента *.workers.dev закрыт
  прокси — посмотреть на результат правки через сеть нельзя. Скрипт повторяет
  ровно те шаги, что делает .github/workflows/deploy-moses-nile-v740-preview.yml,
  поднимает статику на localhost и снимает кадры из игры headless-браузером.
  Так правку графики видно глазами, а не по коду.

  Использование:
    node scripts/preview-moses-nile-local.mjs                 # собрать и снять
    node scripts/preview-moses-nile-local.mjs --out ./shots   # куда класть кадры
    node scripts/preview-moses-nile-local.mjs --build-only    # только собрать
    CHROME_BIN=/opt/pw-browsers/chromium node scripts/...     # свой браузер

  Кадры: 01-menu.png (стартовый экран) и 02..05-run.png (заплыв на 1.5, 5.5,
  11.5 и 20.5 секунде). Консольные ошибки страницы пишутся в log.txt.
*/
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const buildOnly = args.includes('--build-only');
const outDir = path.resolve(flag('--out', path.join(os.tmpdir(), 'moses-nile-shots')));
const workDir = path.resolve(flag('--work', path.join(os.tmpdir(), 'moses-nile-preview')));

// Те же значения, что и в воркфлоу деплоя: архив закреплён по коммиту и хешу.
const ASSET_PACKAGE_REV = '8887faf7638a4168d37583f17b1c8eec9c46dd3f';
const ASSET_PACKAGE_URL = `https://raw.githubusercontent.com/viDaLost/alias-spy-games/${ASSET_PACKAGE_REV}/downloads/moses-nile-v737-full.zip`;
const THREE_RAW = 'https://raw.githubusercontent.com/mrdoob/three.js/r128';
// Настоящий камень русла — та же закреплённая ревизия, что и в воркфлоу.
const BJS_REV = '8be9384c7f8728cb45d27975ac92a412f97a98dd';
const BJS_RAW = `https://raw.githubusercontent.com/BabylonJS/Assets/${BJS_REV}/textures`;

const game = path.join(repo, 'web/games/moses-nile-v7');
const site = path.join(workDir, 'site');
const pkg = path.join(workDir, 'package');

function sh(command, commandArgs) {
  execFileSync(command, commandArgs, { stdio: 'inherit' });
}

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function build() {
  fs.rmSync(site, { recursive: true, force: true });
  for (const dir of [
    'js', 'vendor', 'models/environment/nature_pack', 'models/environment/survival_pack',
    'models/v73', 'models/v75', 'textures/water', 'textures/terrain',
  ]) fs.mkdirSync(path.join(site, dir), { recursive: true });

  copy(path.join(game, 'index.html'), path.join(site, 'index.html'));
  for (const file of fs.readdirSync(path.join(game, 'js'))) {
    copy(path.join(game, 'js', file), path.join(site, 'js', file));
  }
  const basket = path.join(repo, 'web/assets/models/moses-nile/woven-basket.obj');
  copy(basket, path.join(site, 'models/basket.obj'));
  copy(basket, path.join(site, 'models/woven-basket.obj'));
  for (const [from, to] of [
    ['nile-hippo.glb', 'hippo.glb'], ['nile-ship.glb', 'ship.glb'],
    ['nile-papyrus.glb', 'papyrus.glb'], ['nile-lotus.glb', 'lotus.glb'],
  ]) copy(path.join(repo, 'web/assets/models/moses-nile', from), path.join(site, 'models/v75', to));
  fs.writeFileSync(path.join(site, 'build.json'), '{"commit":"local","version":"V7.5.1"}\n');

  // Библиотеки и архив тянутся один раз и переиспользуются между запусками.
  const vendor = [
    ['build/three.min.js', 'three-r128.min.js'],
    ['examples/js/loaders/GLTFLoader.js', 'GLTFLoader-r128.js'],
    ['examples/js/loaders/OBJLoader.js', 'OBJLoader-r128.js'],
  ];
  fs.mkdirSync(path.join(workDir, 'vendor'), { recursive: true });
  for (const [remote, local] of vendor) {
    const cached = path.join(workDir, 'vendor', local);
    if (!fs.existsSync(cached)) sh('curl', ['-fsSL', '--retry', '3', `${THREE_RAW}/${remote}`, '-o', cached]);
    copy(cached, path.join(site, 'vendor', local));
  }

  const zip = path.join(workDir, 'assets.zip');
  if (!fs.existsSync(zip)) sh('curl', ['-fsSL', '--retry', '3', ASSET_PACKAGE_URL, '-o', zip]);
  if (!fs.existsSync(pkg)) sh('unzip', ['-q', zip, '-d', pkg]);

  for (const file of fs.readdirSync(path.join(pkg, 'models/environment/nature_pack'))) {
    copy(path.join(pkg, 'models/environment/nature_pack', file), path.join(site, 'models/environment/nature_pack', file));
  }
  copy(path.join(pkg, 'models/environment/survival_pack/WoodLog.glb'), path.join(site, 'models/environment/survival_pack/WoodLog.glb'));
  for (const file of ['crocodile.glb', 'lotus-flower.obj', 'Boat.glb', 'Flowers.glb']) {
    copy(path.join(pkg, 'models/v73', file), path.join(site, 'models/v73', file));
  }
  // Имена совпадают с теми, что раскладывает воркфлоу после оптимизации.
  const textures = [
    ['Water_1_M_Normal.jpg', 'water/water-normal-primary.jpg'],
    ['Water_2_M_Normal.jpg', 'water/water-normal-detail.jpg'],
    ['damp-sand-diffuse-1k.jpg', 'terrain/damp-sand-color.jpg'],
    ['damp-sand-normal-gl-1k.jpg', 'terrain/damp-sand-normal.jpg'],
    ['sand-03-diffuse-1k.jpg', 'terrain/sand-color.jpg'],
    ['sand-03-normal-gl-1k.jpg', 'terrain/sand-normal.jpg'],
    ['ganges-pebbles-diffuse-1k.jpg', 'terrain/pebbles-color.jpg'],
    ['ganges-pebbles-normal-gl-1k.jpg', 'terrain/pebbles-normal.jpg'],
  ];
  for (const [from, to] of textures) copy(path.join(pkg, 'textures', from), path.join(site, 'textures', to));

  const stone = [
    ['rockyGround_basecolor.png', 'rock-color.jpg'],
    ['rockyGround_normal.png', 'rock-normal.jpg'],
    ['rockyGround_metalRough.png', 'rock-orm.jpg'],
  ];
  fs.mkdirSync(path.join(workDir, 'stone'), { recursive: true });
  for (const [remote, local] of stone) {
    const cached = path.join(workDir, 'stone', local);
    if (!fs.existsSync(cached)) sh('curl', ['-fsSL', '--retry', '3', `${BJS_RAW}/${remote}`, '-o', cached]);
    copy(cached, path.join(site, 'textures/terrain', local));
  }
  console.log(`Собрано: ${site}`);
}

const MIME = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.obj': 'text/plain',
}));

async function shoot() {
  const { chromium } = await import('playwright-core');
  const server = http.createServer((request, response) => {
    const url = decodeURIComponent(request.url.split('?')[0]);
    const file = path.join(site, url === '/' ? 'index.html' : url);
    if (!file.startsWith(site) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404);
      return response.end('not found');
    }
    response.writeHead(200, { 'Content-Type': MIME.get(path.extname(file)) || 'application/octet-stream' });
    return fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    // SwiftShader: на раннере и в контейнере агента нет GPU, но WebGL нужен.
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const log = [];
  page.on('console', (message) => log.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => log.push(`PAGEERROR: ${error.message}`));
  page.on('response', (r) => { if (r.status() >= 400) log.push(`HTTP ${r.status()}: ${r.url()}`); });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(6000);
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, '01-menu.png') });
  await page.evaluate(() => document.getElementById('start-btn')?.click());
  for (const [index, wait] of [[2, 1500], [3, 4000], [4, 6000], [5, 9000]]) {
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(outDir, `0${index}-run.png`) });
  }
  fs.writeFileSync(path.join(outDir, 'log.txt'), `${log.join('\n')}\n`);
  await browser.close();
  server.close();
  console.log(`Кадры: ${outDir}`);
  const problems = log.filter((line) => line.startsWith('PAGEERROR') || line.startsWith('HTTP 5'));
  if (problems.length) console.log(`Ошибки страницы:\n${problems.join('\n')}`);
}

build();
if (!buildOnly) await shoot();
