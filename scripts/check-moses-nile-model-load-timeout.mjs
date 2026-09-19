// «Моисей на Ниле» стартует, даже если одна из моделей зависла на сети.
//
// Отзыв: «на некоторых телефонах игры не прогружаются». Загрузка текстур уже
// защищена своим потолком ожидания (waitForTextures — 9с: если карты песка и
// воды не успели, заплыв всё равно начинается). У загрузки самих 3D-моделей
// такой защиты не было: AssetManager ловит ошибку каждой отдельной модели и
// подставляет процедурную заглушку, но запрос, который не упал и не пришёл, —
// обычное дело на нестабильной мобильной сети, — эту ловушку обходит. Await
// на Promise.all внутри preloadGameplayModels ждёт такой запрос вечно, и
// заставка «ЗАГРУЖАЕМ МОДЕЛИ…» остаётся на экране навсегда — для игрока это и
// есть «игра не грузится».
//
// Проверять это чтением исходника мало: важно, что живая игра стартует за
// разумное время, даже когда настоящий сетевой запрос до модели никогда не
// отвечает. Поэтому здесь поднимается не запасной 2D-режим (он вообще не
// грузит модели), а настоящий WebGL через программный SwiftShader, и один
// конкретный .glb намеренно никогда не отвечает на запрос.
//
//     node scripts/check-moses-nile-model-load-timeout.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

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
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
await page.route('**/js/sound.js*', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'window.gameAudio={init(){},playSplash(){},playCollect(){},playPowerup(){},playHit(){},playGrowl(){},playJump(){},playNearMiss(){}};',
}));
// Один конкретный запрос повисает навсегда — ни ответа, ни обрыва. Все
// остальные модели, текстуры и файлы движка грузятся по-настоящему.
await page.route('**/models/v73/crocodile.glb', () => { /* нарочно ничего не отвечаем */ });

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
    hasCrocodile: Boolean(window.assetManager?.models?.crocodile),
    hasLotus: Boolean(window.assetManager?.models?.lotus),
    hasRock: Boolean(window.assetManager?.models?.rock),
  }));
  check(!state.hasCrocodile, 'модель крокодила почему-то оказалась загружена — зависший запрос не был настоящим тестом');
  check(state.hasLotus, 'модель лотоса не загрузилась, хотя её запрос никто не блокировал');
  check(state.hasRock, 'модель камня не загрузилась, хотя её запрос никто не блокировал');

  check(!pageErrors.length, `pageerror: ${pageErrors.join(' | ')}`);
} catch (error) {
  failures.push(error.message);
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`Moses Nile model-load timeout check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('OK: заплыв стартует даже когда один из .glb навсегда завис на сети — таймаут отпускает загрузку моделей, '
  + 'и заставка не остаётся на экране навечно; недогруженная модель просто отсутствует, остальные на месте.');
