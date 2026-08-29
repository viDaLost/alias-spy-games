import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const failures = [];
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.ico', 'image/x-icon'],
]);

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
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
const address = server.address();
const baseURL = `http://127.0.0.1:${address.port}`;
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
  ],
});

async function makePage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { window.__APP_TELEMETRY_DISABLED__ = true; });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: `window.Telegram={WebApp:{initData:'',initDataUnsafe:{user:{id:999999,username:'qa_user',first_name:'QA'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},requestFullscreen(){},lockOrientation(){},unlockOrientation(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};`,
  }));

  const gasReply = JSON.stringify({ success: true, isBanned: false, wowStars: 20, wsStars: 0, swLevel: 0, lastGames: [] });
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: gasReply }));
  }

  await page.goto(baseURL, { waitUntil: 'commit', timeout: 20_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting') && !document.documentElement.classList.contains('app-menu-preparing'), null, { timeout: 10_000 });
  await page.waitForSelector('#bible-sketch-card', { timeout: 5_000 });
  return { context, page, pageErrors, consoleErrors };
}

let gameKeys = [];
{
  const session = await makePage();
  gameKeys = await session.page.locator('.game-card[onclick*="showGame("]').evaluateAll((buttons) => buttons
    .map((button) => button.getAttribute('onclick') || '')
    .map((text) => text.match(/showGame\(['\"]([^'\"]+)['\"]\)/)?.[1])
    .filter(Boolean));
  gameKeys = [...new Set(gameKeys)];
  await session.context.close();
}

if (!gameKeys.length) failures.push('Главное меню не содержит ни одной запускаемой игры.');
if (!gameKeys.includes('bible-sketch')) failures.push('Библейский художник не зарегистрирован в главном меню.');
console.log(`Discovered ${gameKeys.length} games: ${gameKeys.join(', ')}`);

for (const gameKey of gameKeys) {
  const session = await makePage();
  const { page, context, pageErrors, consoleErrors } = session;
  try {
    // Do not return showGame() from page.evaluate. Bible Sketch deliberately
    // uses an async launcher, and Playwright would otherwise await that Promise
    // instead of observing the rendered game with the bounded checks below.
    await page.evaluate((key) => {
      window.showGame(key);
      return true;
    }, gameKey);
    await page.waitForFunction((key) => document.body.dataset.currentGame === key, gameKey, { timeout: 10_000 });
    await page.waitForFunction(() => {
      const container = document.getElementById('game-container');
      return container && container.children.length > 0 && !container.querySelector('.app-game-loading');
    }, null, { timeout: 15_000 });
    await page.waitForTimeout(800);

    const state = await page.evaluate(() => {
      const container = document.getElementById('game-container');
      const text = (container?.innerText || '').replace(/\s+/g, ' ').trim();
      const fatal = Boolean(container?.querySelector('.app-error-card'))
        || /Ошибка:\s*Библиотека|Ошибка запуска|Файл игры не найден|Игра не найдена/i.test(text);
      return { text: text.slice(0, 240), fatal, childCount: container?.children.length || 0 };
    });

    if (state.fatal || state.childCount === 0) throw new Error(`Игра показала критическую ошибку: ${state.text || 'пустой экран'}`);
    if (pageErrors.length) throw new Error(`pageerror: ${pageErrors.join(' | ')}`);

    const meaningfulConsoleErrors = consoleErrors.filter((text) => !/favicon|Failed to load resource.*404/i.test(text));
    if (meaningfulConsoleErrors.length) throw new Error(`console.error: ${meaningfulConsoleErrors.join(' | ')}`);

    await page.evaluate(() => window.goToMainMenu());
    await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 5_000 });
    await page.waitForFunction(() => !document.documentElement.classList.contains('app-menu-preparing'), null, { timeout: 5_000 });
    const returnedCleanly = await page.evaluate(() => !document.body.dataset.currentGame && !(document.getElementById('game-container')?.textContent || '').trim());
    if (!returnedCleanly) throw new Error('После выхода игра не вернулась в чистое главное меню.');

    console.log(`✓ ${gameKey}`);
  } catch (error) {
    failures.push(`${gameKey}: ${error.message}`);
    console.error(`✗ ${gameKey}: ${error.message}`);
  } finally {
    await context.close();
  }
}

await browser.close();
await new Promise((resolve) => server.close(resolve));

if (failures.length) {
  console.error(`\nAll-games smoke test failed (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nOK: all ${gameKeys.length} games opened and returned to the menu without critical browser errors.`);
