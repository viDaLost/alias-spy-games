import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'],
]);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => {
  window.__APP_TELEMETRY_DISABLED__ = true;
  localStorage.setItem('last_games_history', JSON.stringify(['Опиши, но не называй', 'Священное слово', 'Поиск библейских слов']));
  localStorage.removeItem('home_hidden_sections_v1');
});
const page = await context.newPage();

await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
  status: 200,
  contentType: 'text/javascript; charset=utf-8',
  body: `window.Telegram={WebApp:{initData:'',initDataUnsafe:{user:{id:999999,username:'qa_user',first_name:'QA'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};`,
}));
for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ success: true, isBanned: false, wowStars: 20, wsStars: 0, swLevel: 0, lastGames: ['Опиши, но не называй', 'Священное слово', 'Поиск библейских слов'] }) }));
}

await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
await page.waitForSelector('#home-dashboard .home-section-hide', { timeout: 5_000 });

const initial = await page.locator('#home-dashboard .home-section-hide').count();
if (initial !== 3) throw new Error(`Ожидалось 3 кнопки «Скрыть», найдено ${initial}`);

for (let i = 0; i < 3; i += 1) {
  await page.locator('#home-dashboard .home-section-hide').first().click();
  await page.waitForTimeout(120);
}

const hiddenState = await page.evaluate(() => ({
  hidden: JSON.parse(localStorage.getItem('home_hidden_sections_v1') || '[]').sort(),
  restore: Boolean(document.querySelector('.home-hidden-restore button')),
  visibleHideButtons: document.querySelectorAll('#home-dashboard .home-section-hide').length,
}));
if (hiddenState.hidden.join(',') !== ['continue', 'progress', 'recent'].join(',')) throw new Error(`Неверное сохранённое состояние: ${hiddenState.hidden.join(',')}`);
if (!hiddenState.restore || hiddenState.visibleHideButtons !== 0) throw new Error('После скрытия трёх разделов не появилась кнопка восстановления.');

await page.locator('.home-hidden-restore button').click();
await page.waitForTimeout(120);
const restored = await page.locator('#home-dashboard .home-section-hide').count();
if (restored !== 3) throw new Error(`После восстановления ожидалось 3 кнопки «Скрыть», найдено ${restored}`);

console.log('OK: home dashboard sections can be hidden and restored.');
await context.close();
await browser.close();
await new Promise((resolve) => server.close(resolve));
