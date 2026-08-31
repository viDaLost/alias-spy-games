// Проверяет, что «Священное слово» открывается без WebGL.
//
// Это единственная игра на three.js. Контекста может не оказаться вовсе: у браузера
// их ограниченное число, на слабой машине или с отключённым ускорением его не дадут
// совсем. Раньше исключение из конструктора WebGLRenderer роняло весь экран игры —
// вместо клавиатуры и уровней игрок видел «Не удалось загрузить игру». Теперь сцена
// просто не строится, а играть можно.
//
// Саму потерю уже полученного контекста обрабатывает three.js: в r128 его обработчик
// webglcontextlost вызывает preventDefault, поэтому своего здесь не нужно.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'], ['.obj', 'text/plain'],
]);

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

// Отнимаем WebGL до загрузки страницы — ровно так его не даёт браузер без ускорения.
await context.addInitScript(() => {
  window.__APP_TELEMETRY_DISABLED__ = true;
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
    if (String(type).includes('webgl')) return null;
    return original.call(this, type, ...rest);
  };
});

const page = await context.newPage();
const fail = async (message) => {
  await browser.close();
  server.close();
  console.error(`Sacred Word fallback check failed: ${message}`);
  process.exit(1);
};

await page.route('https://telegram.org/**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: 'window.Telegram={WebApp:{initData:"",initDataUnsafe:{user:{id:999999,username:"qa",first_name:"QA"}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},disableVerticalSwipes(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};',
}));
const gas = JSON.stringify({ success: true, isBanned: false, wowStars: 20, wsStars: 0, swLevel: 0, lastGames: [] });
for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: gas }));
}
await page.route('https://*.workers.dev/**', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: '{"ok":true}' }));

await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.showGame('sacred-word'));
await page.waitForTimeout(4000);

const state = await page.evaluate(() => ({
  keys: document.querySelectorAll('.sw-kb-key').length,
  text: document.querySelector('#game-container')?.textContent?.replace(/\s+/g, ' ').trim() || '',
}));

if (/Не удалось загрузить/i.test(state.text)) {
  await fail('без WebGL игра показывает ошибку загрузки вместо поля');
}
// Экранная клавиатура — это и есть игра: без неё играть нечем.
if (state.keys < 30) {
  await fail(`без WebGL на экране только ${state.keys} клавиш вместо полной раскладки`);
}

console.log(`Sacred Word fallback OK: без WebGL игра открывается, ${state.keys} клавиш на месте, трёхмерная сцена просто не строится.`);
await browser.close();
server.close();
