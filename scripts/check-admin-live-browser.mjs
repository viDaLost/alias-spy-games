import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
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
const requestedUrls = [];
let browser;

try {
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  await context.addInitScript(() => { window.__APP_TELEMETRY_DISABLED__ = true; });
  const page = await context.newPage();
  page.on('request', (request) => requestedUrls.push(request.url()));

  await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: `window.Telegram={WebApp:{initData:'signed_test_init_data',initDataUnsafe:{user:{id:1288379477,username:'admin_test',first_name:'Admin'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},requestFullscreen(){},lockOrientation(){},unlockOrientation(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};`,
  }));

  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
    await page.route(pattern, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, isBanned: false, users: [], lastGames: [] }),
    }));
  }

  await page.route('https://alias-spy-games-core.vitaledanilov.workers.dev/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data',
        },
      });
      return;
    }
    if (new URL(request.url()).pathname === '/web/session') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ok: true, token: 'bgw_browser_test_token', expiresAt: Date.now() + 15 * 60_000, scope: 'admin' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, ok: true, isBanned: false, users: [], lastGames: [] }),
    });
  });

  await page.route('https://alias-spy-games-observability.vitaledanilov.workers.dev/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match, X-Telegram-Init-Data',
        },
      });
      return;
    }
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/admin/live') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          ok: true,
          onlineNow: 1,
          menuNow: 0,
          activeRoomsNow: 1,
          generatedAt: Date.now(),
          onlineUsers: [{
            id: '55555',
            username: 'online_tester',
            displayName: 'Online Tester',
            platform: 'telegram',
            game: 'quartet',
            roomId: 'ABCD',
            updatedAt: Date.now(),
          }],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForSelector('#game-container', { state: 'attached', timeout: 10_000 });

  await page.evaluate(() => {
    document.documentElement.classList.remove('app-booting', 'app-menu-preparing');
    const container = document.getElementById('game-container');
    container.style.visibility = 'visible';
    container.style.opacity = '1';
    container.style.pointerEvents = 'auto';
    container.innerHTML = `
      <section class="admin-v2">
        <header class="admin-v2__header"><h2>Управление приложением</h2></header>
        <div class="admin-v2__stats"><div>Всего 141</div><div>Активных 141</div><div>Заблокировано 0</div></div>
        <section class="support-center">Техподдержка</section>
      </section>`;
  });

  await page.waitForSelector('#admin-live-rescue', { state: 'attached', timeout: 5_000 });
  await page.waitForFunction(() => {
    const panel = document.getElementById('admin-live-rescue');
    const text = panel?.innerText || '';
    return text.includes('@online_tester') && text.includes('Квартет') && text.includes('ABCD');
  }, null, { timeout: 8_000 });

  const state = await page.evaluate(() => {
    const stats = document.querySelector('.admin-v2__stats');
    const rescue = document.getElementById('admin-live-rescue');
    return {
      mounted: Boolean(rescue),
      immediatelyAfterStats: stats?.nextElementSibling?.id === 'admin-live-rescue',
      text: rescue?.innerText || '',
      width: rescue?.getBoundingClientRect().width || 0,
    };
  });

  if (!state.mounted) throw new Error('Recovery live panel did not mount');
  if (!state.immediatelyAfterStats) throw new Error('Recovery live panel is not mounted after admin statistics');
  if (state.width <= 0 || state.width > 390) throw new Error(`Recovery panel mobile width is invalid: ${state.width}`);
  if (requestedUrls.some((url) => /[?&]initData=/i.test(url))) {
    throw new Error('Telegram initData leaked into a request URL');
  }

  console.log('OK: admin recovery live panel mounts on 390px mobile, shows an online player/game/room, and keeps initData out of URLs.');
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
