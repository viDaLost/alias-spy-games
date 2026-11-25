import { serveSabbathTestAsset } from './lib/sabbath-test-assets.mjs';
// Один медленный GLB не задерживает остальные модели. При поздней загрузке
// настоящий меш заменяет временный в уже начавшемся заплыве.
//
//     node scripts/check-moses-nile-model-load-timeout.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from './lib/playwright-app-fixture.mjs';

const root = process.cwd();
const gameRoot = path.join(root, 'web/games/moses-nile-v7');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'], ['.glb', 'model/gltf-binary'],
]);
const server = http.createServer((req, res) => {
  if (serveSabbathTestAsset(req, res)) return;
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(gameRoot, `.${pathname}`);
    if (!target.startsWith(gameRoot + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(target).pipe(res);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  // Настоящий WebGL, не отключённый: запасной 2D-режим вообще не грузит
  // модели, и без него сама проверка не имела бы смысла.
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.addInitScript(() => localStorage.setItem('moses-nile-tutorial-seen-v1', '1'));
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() === 'error' && message.text().includes('THREE.WebGLProgram')) pageErrors.push(message.text());
});
await page.route('**/js/sound.js*', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'window.gameAudio={init(){},playSplash(){},playCollect(){},playPowerup(){},playHit(){},playGrowl(){},playJump(){},playNearMiss(){}};',
}));
// Бревно гарантированно есть в первых рядах. Отдаём его уже после старта,
// чтобы проверить замену объекта, который игрок успел увидеть издалека.
let releaseLog;
const delayedLog = new Promise(resolve => { releaseLog = resolve; });
await page.route('**/models/environment/survival_pack/WoodLog.glb', async (route) => {
  await delayedLog;
  await route.continue();
});

try {
  const startedAt = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 20_000 });
  await page.waitForFunction(
    () => window.__mosesV75Mode === 'webgl' && document.getElementById('start-btn')?.disabled === false,
    null, { timeout: 25_000 },
  );
  const elapsedMs = Date.now() - startedAt;

  check(elapsedMs < 22_000, `заплыв стартовал только через ${Math.round(elapsedMs / 1000)}с — таймаут загрузки моделей не сработал`);
  check(elapsedMs > 9_000, `заплыв стартовал за ${Math.round(elapsedMs / 1000)}с — подозрительно быстро, будто зависший запрос не был настоящим`);

  const state = await page.evaluate(() => ({
    hasLog: Boolean(window.assetManager?.models?.log),
    hasCrocodile: Boolean(window.assetManager?.models?.crocodile),
    hasLotus: Boolean(window.assetManager?.models?.lotus),
    hasRock: Boolean(window.assetManager?.models?.rock),
    hasShip: Boolean(window.assetManager?.models?.ship),
    hasHippo: window.assetManager?.hippoRigCount() > 0,
    basket: window.__mosesBasketSource,
  }));
  check(!state.hasLog, 'отложенное бревно успело загрузиться до старта');
  check(state.hasCrocodile, 'отложенное бревно заблокировало загрузку крокодила');
  check(state.hasLotus, 'модель лотоса не загрузилась, хотя её запрос никто не блокировал');
  check(state.hasRock, 'модель камня не загрузилась, хотя её запрос никто не блокировал');
  check(state.hasShip && state.hasHippo, 'ладья и бегемот не загрузились независимо от бревна');
  check(state.basket === 'woven-obj', 'игра запустилась без плетёной модели корзинки');

  await page.locator('#start-btn').click();
  await page.waitForFunction(() => window.__mosesV75State.items.some(item => (
    item.type === 'log' && item.z < -32 && item.mesh?.userData.assetSource === 'emergency-procedural'
  )));
  releaseLog();
  await page.waitForFunction(() => window.__mosesV75State.items.some(item => (
    item.type === 'log' && item.mesh?.userData.assetSource === 'models/environment/survival_pack/WoodLog.glb'
  )), null, { timeout: 10_000 });

  check(!pageErrors.length, `pageerror: ${pageErrors.join(' | ')}`);
} catch (error) {
  failures.push(error.message);
} finally {
  releaseLog();
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`Moses Nile model-load timeout check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('OK: реальные модели загружаются независимо, а опоздавшее бревно заменяет временный меш прямо в заплыве.');
