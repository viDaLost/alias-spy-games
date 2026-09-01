// Проверяет, что фон главного меню возвращается после выхода из игры.
//
// Фон меню — отдельная сцена поверх страницы, и её видимость держится на классе
// is-ready. Игры, которые рисуют своё во весь экран, прячут сцену под собой; та,
// что снимала класс, не возвращала его обратно — сцена возвращалась в разметку,
// но оставалась прозрачной, и меню открывалось на голом фоне. Заметить это можно
// только глазами, поэтому проверяется отдельно.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

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
  response.writeHead(200, { 'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream' });
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
const crashes = [];
page.on('pageerror', (error) => crashes.push(String(error?.message || error)));

const fail = async (message) => {
  console.error(`Проверка фона меню не прошла: ${message}`);
  await browser.close();
  server.close();
  process.exit(1);
};

await page.addInitScript(() => {
  window.Telegram = {
    WebApp: {
      initData: 'query_id=stub&user=%7B%22id%22%3A5883903220%7D&hash=stub',
      initDataUnsafe: { user: { id: 5883903220, first_name: 'Тест' } },
      ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
  try {
    localStorage.setItem('leaderboard_news_seen_v1', '1');
    const seen = {};
    for (const key of ['spy', 'bible-wow', 'bible-wordsearch', 'sacred-word', 'kids-ark-pairs', 'biblical-match-three']) seen[key] = 1;
    localStorage.setItem('game_rules_seen_v1', JSON.stringify(seen));
  } catch { /* приватный режим */ }
});
const stub = (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ success: true, isBanned: false, lastGames: [], answered: true, rooms: [] }),
});
for (const pattern of ['https://*.workers.dev/**', 'https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, stub);
}

await page.goto(`${baseURL}/#tgWebAppData=query_id%3Dstub`, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(3000);

const sceneState = () => page.evaluate(() => {
  const scene = document.querySelector('.home-gamehub-parallax__scene');
  if (!scene) return null;
  const style = getComputedStyle(scene);
  return {
    hidden: scene.hasAttribute('hidden'),
    ready: scene.classList.contains('is-ready'),
    opacity: Number(style.opacity),
    display: style.display,
  };
});

const before = await sceneState();
if (!before) await fail('сцены фона нет в разметке');
if (before.hidden || before.opacity < 0.9) {
  await fail(`в меню фон не виден: hidden=${before.hidden}, прозрачность ${before.opacity}`);
}

// Игры, которые прячут фон под собой. Художник делал это жёстче остальных,
// поэтому проверяются обе двери: обычная игра и он.
for (const [label, open] of [
  ['обычная игра', () => window.showGame('spy')],
  ['Библейский художник', () => document.getElementById('bible-sketch-card')?.click()],
]) {
  const opened = await page.evaluate(open);
  await page.waitForTimeout(3000);
  const mode = await page.evaluate(() => document.body.dataset.currentGame || '');
  if (!mode) await fail(`не удалось открыть «${label}» (${opened})`);

  await page.evaluate(() => (window.appGoToMainMenu || window.goToMainMenu)?.());
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 15_000 });
  await page.waitForTimeout(1500);

  const after = await sceneState();
  if (after.hidden || after.display === 'none') {
    await fail(`после выхода из «${label}» фон меню остался спрятанным`);
  }
  if (!after.ready || after.opacity < 0.9) {
    await fail(`после выхода из «${label}» фон меню остался прозрачным (is-ready=${after.ready}, прозрачность ${after.opacity})`);
  }
}

if (crashes.length) await fail(`страница поймала исключение: ${crashes[0]}`);

console.log('Фон меню в порядке: он виден при открытии и возвращается после выхода '
  + 'и из обычной игры, и из «Библейского художника».');

await browser.close();
server.close();
