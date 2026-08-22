import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
]);

function testPage() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="app-core-backend" content="https://alias-spy-games-core.vitaledanilov.workers.dev">
  <meta name="app-observability" content="https://alias-spy-games-observability.vitaledanilov.workers.dev">
  <link rel="stylesheet" href="/web/styles/admin-live-v3.css?v=6">
  <link rel="stylesheet" href="/web/styles/admin-live-compact.css?v=1">
</head>
<body>
  <main id="game-container"></main>
  <script>
    window.Telegram = { WebApp: {
      initData: 'signed_test_init_data',
      initDataUnsafe: { user: { id: 1288379477, username: 'admin_test', first_name: 'Admin' } },
      HapticFeedback: { selectionChanged(){}, notificationOccurred(){} },
    }};
    window.apiRequest = async (payload) => {
      if (payload?.action === 'getAdminUsersByIds') {
        return { ok: true, users: (payload.ids || []).map((id, index) => ({
          id, username: index ? 'second_user' : 'first_user', link: '',
          wowStars: 32 + index, wsStars: 87 + index, swLevel: 5 + index,
          bmtStars: index ? 50 : 9999, bmtRevision: 1, isBanned: false,
        })) };
      }
      if (payload?.action === 'updateUser') return { ok: true, success: true };
      return { ok: true, success: true };
    };

    window.__adminInsertedAt = 0;
    window.__liveMountedAt = 0;
    const mountWatch = new MutationObserver(() => {
      if (!window.__liveMountedAt && document.getElementById('admin-live-v3')) {
        window.__liveMountedAt = performance.now();
      }
    });
    mountWatch.observe(document.documentElement, { subtree: true, childList: true });

    let churnTick = false;
    const churn = setInterval(() => {
      churnTick = !churnTick;
      document.body.classList.toggle('admin-test-churn', churnTick);
    }, 20);
    setTimeout(() => clearInterval(churn), 1200);

    setTimeout(() => {
      window.__adminInsertedAt = performance.now();
      document.getElementById('game-container').innerHTML = ` + "`" + `
        <section class="admin-v2">
          <header class="admin-v2__header"><div class="admin-v2__heading"><h2>Панель управления</h2></div></header>
          <div class="admin-v2__stats"><div>Всего 141</div><div>Активных 141</div><div>Заблокировано 0</div></div>
        </section>` + "`" + `;
    }, 120);
  </script>
  <script src="/web/js/admin-live-v3.js?v=7"></script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/admin-live-entry-test.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(testPage());
      return;
    }
    const target = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
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
const { port } = server.address();
const baseURL = `http://127.0.0.1:${port}`;
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
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

  await page.route('https://alias-spy-games-core.vitaledanilov.workers.dev/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }});
      return;
    }
    if (new URL(request.url()).pathname === '/web/session') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ok: true, token: 'bgw_entry_test', expiresAt: Date.now() + 15 * 60_000, scope: 'admin' }),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
  });

  await page.route('https://alias-spy-games-observability.vitaledanilov.workers.dev/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }});
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
          onlineNow: 2,
          menuNow: 1,
          activeRoomsNow: 0,
          currentGames: {},
          strictPresenceWindowMs: 35_000,
          generatedAt: Date.now(),
          onlineUsers: [
            { id: '55555', username: 'first_user', platform: 'telegram', game: '', roomId: '' },
            { id: '66666', username: 'second_user', platform: 'telegram', game: 'biblical-match-three', roomId: '' },
          ],
        }),
      });
      return;
    }
    if (pathname === '/admin/stats') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ok: true, peakOnlineToday: 9, errorsToday: 0 }),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
  });

  await page.goto(`${baseURL}/admin-live-entry-test.html`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForSelector('#admin-live-v3', { state: 'visible', timeout: 900 });
  await page.waitForSelector('[data-live-user="55555"] .admin-live-v3__balance', { state: 'visible', timeout: 4_000 });

  const result = await page.evaluate(() => {
    const firstPerson = document.querySelector('[data-live-user="55555"]');
    const balances = firstPerson?.querySelector('.admin-live-v3__balances');
    const buttons = [...(firstPerson?.querySelectorAll('.admin-live-v3__balance button') || [])];
    const columns = balances ? getComputedStyle(balances).gridTemplateColumns.split(/\s+/).filter(Boolean) : [];
    const rect = firstPerson?.getBoundingClientRect();
    const buttonRects = buttons.map((button) => button.getBoundingClientRect());
    return {
      mountDelay: window.__liveMountedAt - window.__adminInsertedAt,
      columns: columns.length,
      personHeight: rect?.height || 0,
      minButtonWidth: Math.min(...buttonRects.map((item) => item.width)),
      minButtonHeight: Math.min(...buttonRects.map((item) => item.height)),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      users: document.querySelectorAll('[data-live-user]').length,
    };
  });

  if (!(result.mountDelay >= 0 && result.mountDelay < 500)) {
    throw new Error(`Admin live mounted too late on first open: ${result.mountDelay.toFixed(1)}ms`);
  }
  if (result.users !== 2) throw new Error(`Expected 2 online users, got ${result.users}`);
  if (result.columns !== 2) throw new Error(`Compact balances must render as 2 columns, got ${result.columns}`);
  if (result.personHeight <= 0 || result.personHeight > 250) throw new Error(`Online player card is still too tall: ${result.personHeight}px`);
  if (result.minButtonWidth < 44 || result.minButtonHeight < 44) {
    throw new Error(`Touch targets shrank below 44px: ${result.minButtonWidth}x${result.minButtonHeight}`);
  }
  if (result.overflow > 1) throw new Error(`Compact live panel causes horizontal overflow: ${result.overflow}px`);

  console.log(`OK: first admin open mounts live in ${Math.round(result.mountDelay)}ms under DOM churn; online cards use a compact 2x2 balance grid with 44px controls.`);
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
