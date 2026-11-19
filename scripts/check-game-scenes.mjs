import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from './lib/playwright-app-fixture.mjs';
import assert from 'node:assert/strict';

const root = process.cwd();
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  response.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.addInitScript(() => {
  /*
    Датчик наклона Telegram. Сцена берёт его у клиента, а не у браузера, и
    обязана включать только вместе с собой: здесь считается, сколько раз его
    запустили и остановили, и кто подписан на его события.
  */
  const sensor = { started: 0, stopped: 0, listeners: [] };
  window.__tiltSensor = sensor;
  window.Telegram = {
    WebApp: {
      initData: 'query_id=stub&user=%7B%22id%22%3A5883903220%7D&hash=stub',
      initDataUnsafe: { user: { id: 5883903220, first_name: 'Тест' } },
      ready() {}, expand() {}, colorScheme: 'light',
      onEvent(name, handler) { if (name === 'deviceOrientationChanged') sensor.listeners.push(handler); },
      offEvent(name, handler) { sensor.listeners = sensor.listeners.filter((one) => one !== handler); },
      isVersionAtLeast: (version) => Number(version) <= 8,
      DeviceOrientation: {
        isStarted: false, alpha: 0, beta: 0, gamma: 0,
        start() { this.isStarted = true; sensor.started += 1; },
        stop() { this.isStarted = false; sensor.stopped += 1; },
      },
      setHeaderColor() {}, setBackgroundColor() {},
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
  /*
    «Дыхание» камеры выключено на слабых телефонах — четыре ядра и меньше. У
    машины проверки ядер может оказаться сколько угодно, и без этой подмены
    проверка то видела бы анимацию, то нет.
  */
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8, configurable: true });
  try {
    const seen = {};
    for (const key of ['alias', 'spy', 'bible-wow', 'bible-wordsearch', 'sacred-word', 'kids-ark-pairs',
      'biblical-match-three', 'coimaginarium', 'guess', 'describe', 'quartet', 'bible-sketch']) seen[key] = 1;
    localStorage.setItem('game_rules_seen_v1', JSON.stringify(seen));
  } catch { /* приватный режим */ }
});
const telegramSdkStub = (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8', body: 'window.Telegram=window.Telegram||{};',
});
await page.route('https://telegram.org/**', telegramSdkStub);
const stub = (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ success: true, isBanned: false, lastGames: [], answered: true, rooms: [] }),
});
for (const pattern of ['https://*.workers.dev/**', 'https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, stub);
}

const gameKeys = ['quartet', 'alias', 'coimaginarium', 'guess', 'describe', 'spy', 'bible-wow',
  'bible-wordsearch', 'sacred-word', 'kids-ark-pairs', 'bible-sketch', 'bible-geography', 'twelve-tribes'];
const themeBackgrounds = [];
const openGame = async (key) => {
  await page.evaluate((game) => window.showGame(game), key);
  await page.waitForFunction((game) => document.body.dataset.currentGame === game, key);
};
async function returnHome() {
  await page.evaluate(() => window.appGoToMainMenu());
  await page.waitForFunction(() => document.body.dataset.mode !== 'game');
}

try {
  await page.goto(baseURL);
  await page.locator('#main-catalog').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.getElementById('gamehub-boot-scene'));
  for (const dark of [false, true]) {
    await page.evaluate((on) => document.documentElement.classList.toggle('theme-dark', on), dark);
    const backgrounds = new Set();
    for (const key of gameKeys) {
      await openGame(key);
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
      assert.match(background, /^radial-gradient\(/, key);
      assert.doesNotMatch(background, /url\(/, key);
      assert.equal(await page.locator('.game-scene').count(), 0, key);
      assert.equal(await page.locator('.home-gamehub-parallax__scene:visible').count(), 0, key);
      backgrounds.add(background);
      if (key === 'quartet' && process.env.GAME_SCENE_SCREENSHOTS) {
        await page.locator('#qv2-root').waitFor();
        await page.locator('.game-entry-loader.is-active').waitFor({ state: 'hidden' });
        await page.screenshot({ path: path.join(process.env.GAME_SCENE_SCREENSHOTS, `quartet-${dark ? 'dark' : 'light'}.png`) });
      }
      await returnHome();
    }
    assert.equal(backgrounds.size, gameKeys.length, 'each game has its own colors');
    themeBackgrounds.push([...backgrounds]);

    await openGame('biblical-match-three');
    const art = page.locator('.game-scene[data-scene="biblical-match-three"]');
    await art.locator('.game-scene__layer').first().waitFor({ state: 'attached' });
    await page.waitForFunction(() => [...document.querySelectorAll('.game-scene__layer')]
      .every((image) => image.complete && image.naturalWidth > 0));
    assert.equal(await art.locator('.game-scene__layer').count(), 3);
    assert.equal(await art.evaluate((node) => getComputedStyle(node).pointerEvents), 'none');
    assert.ok(await art.locator('.game-scene__layer').first().getAttribute('src').then((url) => url.includes('temple-base-v3.webp')));
    await returnHome();
    assert.equal(await art.count(), 0);
  }
  assert.notDeepEqual(themeBackgrounds[0], themeBackgrounds[1], 'themes render different gradients');
  assert.deepEqual(pageErrors, []);
  console.log('Game backgrounds: distinct light/dark gradients, no decorative images, and all three Treasures layers preserved.');
} finally {
  await browser.close();
  server.close();
}
