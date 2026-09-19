// «Моисей на Ниле»: кнопки и свайпы — два разных режима, а не один общий.
//
// Отзыв игрока: управление кнопками и свайпами было включено одновременно —
// палец, промахнувшийся мимо кнопки «Нырок», превращался в свайп вниз и топил
// корзинку, а свайп в сторону во время прицеливания в кнопку поворота сбивал
// дорожку. Теперь это выбор на стартовом экране: либо только кнопки на
// экране, либо только свайпы, — и выбор запоминается между заплывами.
//
// Проверять переключатель чтением разметки мало: важно, что в режиме
// «кнопки» свайп пальцем по экрану корзинку не двигает, а в режиме «свайпы»
// нажатие на видимую кнопку — тоже. Поэтому игра поднимается по-настоящему,
// оба режима включаются через тот же переключатель, что видит игрок, и по
// каждому бьют оба вида ввода — должен сработать только один.
//
//     node scripts/check-moses-nile-control-modes.mjs

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
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
await page.route('**/vendor/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await page.route('**/js/assets.js*', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.assetManager={};' }));
await page.route('**/js/sound.js*', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'window.gameAudio={init(){},playSplash(){},playCollect(){},playPowerup(){},playHit(){},playGrowl(){},playJump(){},playNearMiss(){}};',
}));

// Свайп по window — так же, как слушает сама игра: без настоящего пальца, но
// с теми же полями события, которые она читает (touches/changedTouches).
async function swipe(page, dx, dy) {
  await page.evaluate(([dx, dy]) => {
    const start = new Event('touchstart');
    Object.defineProperty(start, 'touches', { value: [{ clientX: 200, clientY: 500 }] });
    window.dispatchEvent(start);
    const move = new Event('touchmove');
    Object.defineProperty(move, 'touches', { value: [{ clientX: 200 + dx, clientY: 500 + dy }] });
    Object.defineProperty(move, 'cancelable', { value: false });
    window.dispatchEvent(move);
    const end = new Event('touchend');
    Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 200 + dx, clientY: 500 + dy }] });
    window.dispatchEvent(end);
  }, [dx, dy]);
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForFunction(() => window.__mosesV75Mode === 'fallback', null, { timeout: 10_000 });
  await page.evaluate(() => localStorage.setItem('moses-nile-tutorial-seen-v1', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mosesV75Mode === 'fallback', null, { timeout: 10_000 });

  // По умолчанию — кнопки, и они видны: старое поведение при первом заходе
  // не должно исчезать без выбора игрока.
  const initialMode = await page.evaluate(() => document.body.dataset.controlMode);
  check(initialMode === 'arrows', `По умолчанию режим «${initialMode}», а должен быть «arrows»`);
  const arrowsPressed = await page.getAttribute('#control-mode-arrows', 'aria-pressed');
  check(arrowsPressed === 'true', `Кнопка «Кнопки» не отмечена нажатой при режиме по умолчанию (aria-pressed=${arrowsPressed})`);
  const controlsVisible = await page.locator('.mobile-controls').isVisible();
  check(controlsVisible, 'Кнопки управления не видны в режиме «arrows» по умолчанию');

  // Переключение на свайпы: кнопки прячутся, выбор помечен и сохранён.
  await page.locator('#control-mode-swipe').click();
  const swipeMode = await page.evaluate(() => document.body.dataset.controlMode);
  check(swipeMode === 'swipe', `После нажатия «Свайпы» режим остался «${swipeMode}»`);
  const controlsHiddenNow = await page.locator('.mobile-controls').isVisible();
  check(!controlsHiddenNow, 'Кнопки управления всё ещё видны после выбора режима «Свайпы»');
  const savedMode = await page.evaluate(() => localStorage.getItem('moses-nile-control-mode-v1'));
  check(savedMode === 'swipe', `Выбор не сохранён в localStorage (там «${savedMode}»)`);

  // Выбор переживает перезагрузку — это настройка, а не разовый клик.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mosesV75Mode === 'fallback', null, { timeout: 10_000 });
  const modeAfterReload = await page.evaluate(() => document.body.dataset.controlMode);
  check(modeAfterReload === 'swipe', `После перезагрузки режим «${modeAfterReload}», а должен был остаться «swipe»`);

  // Играем в режиме «свайпы»: кнопка на экране не должна сдвигать дорожку,
  // а свайп — должен.
  await page.locator('#start-btn').click();
  await page.waitForFunction(() => document.body.classList.contains('is-playing'), null, { timeout: 5_000 });
  await page.waitForTimeout(150);

  // Кнопка спрятана (display:none) — по-настоящему нажать на неё нельзя,
  // но клик всё равно отправляется в обход хит-теста: проверка целится не в
  // «дойдёт ли палец», а в то, что сам обработчик отказывается действовать
  // не в своём режиме, — вторая, независимая от вёрстки защита.
  const laneBeforeButtonInSwipe = await page.evaluate(() => window.__mosesV75State.lane);
  await page.evaluate(() => document.getElementById('btn-left').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(150);
  const laneAfterButtonInSwipe = await page.evaluate(() => window.__mosesV75State.lane);
  check(laneAfterButtonInSwipe === laneBeforeButtonInSwipe,
    `В режиме «свайпы» нажатие на кнопку всё равно сдвинуло дорожку (${laneBeforeButtonInSwipe} → ${laneAfterButtonInSwipe})`);

  const laneBeforeSwipe = await page.evaluate(() => window.__mosesV75State.lane);
  await swipe(page, -120, 0);
  await page.waitForTimeout(150);
  const laneAfterSwipe = await page.evaluate(() => window.__mosesV75State.lane);
  check(laneAfterSwipe === laneBeforeSwipe - 1,
    `В режиме «свайпы» свайп влево не сдвинул дорожку (${laneBeforeSwipe} → ${laneAfterSwipe})`);

  // Переключатель живёт на стартовом экране — возвращаемся туда через паузу
  // и выбираем «кнопки» для второй половины проверки.
  await page.locator('#btn-pause').click({ force: true });
  await page.waitForTimeout(150);
  await page.locator('#quit-btn').click();
  await page.locator('#control-mode-arrows').click();
  const modeAfterQuit = await page.evaluate(() => document.body.dataset.controlMode);
  check(modeAfterQuit === 'arrows', `Переключение на стартовом экране не сработало (режим «${modeAfterQuit}»)`);
  await page.locator('#start-btn').click();
  await page.waitForFunction(() => document.body.classList.contains('is-playing'), null, { timeout: 5_000 });
  await page.waitForTimeout(150);

  const laneBeforeSwipeInArrows = await page.evaluate(() => window.__mosesV75State.lane);
  await swipe(page, 120, 0);
  await page.waitForTimeout(150);
  const laneAfterSwipeInArrows = await page.evaluate(() => window.__mosesV75State.lane);
  check(laneAfterSwipeInArrows === laneBeforeSwipeInArrows,
    `В режиме «кнопки» свайп всё равно сдвинул дорожку (${laneBeforeSwipeInArrows} → ${laneAfterSwipeInArrows})`);

  const laneBeforeButtonInArrows = await page.evaluate(() => window.__mosesV75State.lane);
  await page.locator('#btn-right').click();
  await page.waitForTimeout(150);
  const laneAfterButtonInArrows = await page.evaluate(() => window.__mosesV75State.lane);
  check(laneAfterButtonInArrows === laneBeforeButtonInArrows + 1,
    `В режиме «кнопки» нажатие на кнопку не сдвинуло дорожку (${laneBeforeButtonInArrows} → ${laneAfterButtonInArrows})`);

  check(!pageErrors.length, `pageerror: ${pageErrors.join(' | ')}`);
} catch (error) {
  failures.push(error.message);
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`Moses Nile control modes check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('OK: управление «кнопки» и «свайпы» разделены — по умолчанию кнопки, выбор сохраняется, '
  + 'и в каждом режиме дорожку двигает только его собственный ввод.');
