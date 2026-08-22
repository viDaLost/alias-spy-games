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

function testPage() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="app-core-backend" content="https://alias-spy-games-core.vitaledanilov.workers.dev">
  <meta name="app-observability" content="https://alias-spy-games-observability.vitaledanilov.workers.dev">
  <link rel="stylesheet" href="/web/styles/admin-enhancements.css?v=24">
  <link rel="stylesheet" href="/web/styles/admin-live-v3.css?v=6">
  <link rel="stylesheet" href="/web/styles/admin-shell-v3.css?v=1">
</head>
<body data-mode="admin">
  <main id="game-container">
    <section class="admin-v2">
      <header class="admin-v2__header">
        <button class="admin-v2__icon-btn" type="button">←</button>
        <div class="admin-v2__heading">
          <div class="admin-v2__eyebrow">ADMIN • Telegram ID 1288379477</div>
          <h2>Управление приложением</h2>
          <p>Обновлено: <span data-admin-loaded-at>17:33</span></p>
        </div>
        <button class="admin-v2__refresh" data-admin-action="refresh" type="button">↻ <span>Обновить</span></button>
      </header>
      <div class="admin-v2__stats">
        <div class="admin-v2-stat"><span>Всего</span><strong>141</strong></div>
        <div class="admin-v2-stat admin-v2-stat--active"><span>Активных</span><strong>141</strong></div>
        <div class="admin-v2-stat admin-v2-stat--banned"><span>Заблокировано</span><strong>0</strong></div>
      </div>
      <section id="support-admin-panel" class="support-admin-panel"><div class="support-admin-panel__head"><h3>🎧 Техподдержка</h3></div><div id="support-admin-list"></div></section>
      <section class="admin-v2__toolbar"><label class="admin-v2__search"><span>⌕</span><input data-admin-search></label><div class="admin-v2__filters"><button>Все</button><button>Активные</button><button>Блок.</button></div></section>
      <details class="admin-v2__broadcast"><summary>Рассылка</summary></details>
      <section class="admin-v2__users-section"><div class="admin-v2__list-title"><b>Пользователи</b></div><div class="admin-v2__list"></div></section>
    </section>
  </main>
  <script>window.Telegram={WebApp:{initData:'signed_test_init_data',initDataUnsafe:{user:{id:1288379477,username:'admin_test',first_name:'Admin'}}}};</script>
  <script src="/web/js/admin-live-rescue.js?v=2"></script>
  <script src="/web/js/admin-shell-v3.js?v=1"></script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/admin-live-test.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(testPage());
      return;
    }
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
  const page = await context.newPage();
  page.on('request', (request) => requestedUrls.push(request.url()));

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
    await route.fulfill({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
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
            id: '55555', username: 'online_tester', displayName: 'Online Tester',
            platform: 'telegram', game: 'quartet', roomId: 'ABCD', updatedAt: Date.now(),
          }],
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
  });

  await page.goto(`${baseURL}/admin-live-test.html`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForSelector('.admin-v3-shell', { state: 'visible', timeout: 5_000 });
  await page.waitForSelector('#admin-live-rescue', { state: 'visible', timeout: 5_000 });
  await page.waitForFunction(() => {
    const panel = document.getElementById('admin-live-rescue');
    const text = panel?.innerText || '';
    return text.includes('@online_tester') && text.includes('Квартет') && text.includes('ABCD');
  }, null, { timeout: 8_000 });

  const state = await page.evaluate(() => {
    const shell = document.querySelector('.admin-v3-shell');
    const stats = shell?.querySelector('.admin-v2__stats');
    const rescue = document.getElementById('admin-live-rescue');
    const support = document.getElementById('support-admin-panel');
    const toolbar = shell?.querySelector('.admin-v2__toolbar');
    const broadcast = shell?.querySelector('.admin-v2__broadcast');
    const users = shell?.querySelector('.admin-v2__users-section');
    const order = [stats, rescue, support, toolbar, broadcast, users].map((node) => node ? [...shell.children].indexOf(node) : -1);
    return {
      version: shell?.dataset.adminVersion || '',
      title: shell?.querySelector('.admin-v2__heading h2')?.textContent || '',
      eyebrow: shell?.querySelector('.admin-v2__eyebrow')?.textContent || '',
      navButtons: shell?.querySelectorAll('.admin-v3-nav button').length || 0,
      order,
      text: rescue?.innerText || '',
      width: shell?.getBoundingClientRect().width || 0,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  if (state.version !== '3') throw new Error(`Admin shell version is ${state.version || 'missing'}, expected 3`);
  if (state.title !== 'Панель управления') throw new Error(`Admin shell title was not upgraded: ${state.title}`);
  if (!state.eyebrow.includes('V3')) throw new Error(`Admin V3 marker is missing: ${state.eyebrow}`);
  if (state.navButtons !== 4) throw new Error(`Admin V3 navigation has ${state.navButtons} buttons, expected 4`);
  if (state.order.some((index) => index < 0) || state.order.some((index, i) => i > 0 && index <= state.order[i - 1])) {
    throw new Error(`Admin sections are in the wrong order: ${state.order.join(',')}`);
  }
  if (state.width <= 0 || state.width > 390) throw new Error(`Admin V3 shell mobile width is invalid: ${state.width}`);
  if (state.overflow) throw new Error('Admin V3 shell causes horizontal document overflow');
  if (requestedUrls.some((url) => /[?&]initData=/i.test(url))) throw new Error('Telegram initData leaked into a request URL');

  console.log('OK: 390px admin V3 shell is active, ordered correctly, shows live player/game/room and keeps initData out of URLs.');
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}