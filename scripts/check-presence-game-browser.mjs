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
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="app-core-backend" content="https://core.test">
  <meta name="app-observability" content="https://presence.test">
</head>
<body>
  <main id="game-container"></main>
  <script>
    window.Telegram = { WebApp: {
      initData: 'signed_test_init_data',
      initDataUnsafe: { user: { id: 55555, username: 'presence_test' } },
    }};
    window.__presenceMessages = [];
    window.fetch = async (url) => {
      if (String(url).includes('/web/session')) {
        return new Response(JSON.stringify({
          ok: true,
          token: 'bgw_presence_test_token',
          expiresAt: Date.now() + 30 * 60_000,
          scope: 'presence',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    };

    class FakeWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      constructor(url) {
        super();
        this.url = url;
        this.readyState = FakeWebSocket.CONNECTING;
        window.__presenceSocket = this;
        setTimeout(() => {
          this.readyState = FakeWebSocket.OPEN;
          this.dispatchEvent(new Event('open'));
        }, 10);
      }
      send(value) {
        try { window.__presenceMessages.push(JSON.parse(String(value))); }
        catch { window.__presenceMessages.push({ raw: String(value) }); }
      }
      close(code = 1000, reason = '') {
        if (this.readyState === FakeWebSocket.CLOSED) return;
        this.readyState = FakeWebSocket.CLOSED;
        const event = new Event('close');
        Object.defineProperties(event, {
          code: { value: code },
          reason: { value: reason },
        });
        this.dispatchEvent(event);
      }
    }
    window.WebSocket = FakeWebSocket;

    window.showGame = function showGame(gameName) {
      document.body.dataset.mode = 'game';
      document.body.dataset.currentGame = String(gameName || '');
      document.getElementById('game-container').dataset.testGame = String(gameName || '');
    };
    window.goToMainMenu = function goToMainMenu() {
      delete document.body.dataset.currentGame;
      delete document.body.dataset.mode;
      document.getElementById('game-container').dataset.testGame = '';
    };
    window.appGoToMainMenu = window.goToMainMenu;
  </script>
  <script src="/web/js/presence-identity.js?v=5"></script>
  <script src="/web/js/presence-game-bridge.js?v=1"></script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/presence-game-test.html') {
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
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
let browser;

try {
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/presence-game-test.html`, { waitUntil: 'domcontentloaded', timeout: 20_000 });

  await page.waitForFunction(() => window.__presenceMessages.some((m) => m?.type === 'presence'), null, { timeout: 2_000 });

  await page.evaluate(() => window.showGame('spy'));
  await page.waitForFunction(() => window.__presenceMessages.some((m) => m?.type === 'presence' && m.game === 'spy'), null, { timeout: 1_500 });

  // Simulate a custom launcher which does not call showGame but does update the
  // canonical body marker, like Biblical Treasures / other specialized launchers.
  await page.evaluate(() => {
    document.body.dataset.mode = 'game';
    document.body.dataset.currentGame = 'biblical-match-three';
  });
  await page.waitForFunction(() => window.__presenceMessages.some((m) => m?.type === 'presence' && m.game === 'biblical-match-three'), null, { timeout: 1_500 });

  await page.evaluate(() => window.goToMainMenu());
  await page.waitForFunction(() => {
    const messages = window.__presenceMessages.filter((m) => m?.type === 'presence');
    return messages.length >= 3 && messages.at(-1)?.game === '';
  }, null, { timeout: 1_500 });

  const result = await page.evaluate(() => {
    const states = window.__presenceMessages
      .filter((m) => m?.type === 'presence')
      .map((m) => ({ game: m.game, roomId: m.roomId }));
    return {
      states,
      snapshot: window.AppPresenceContext?.snapshot?.(),
      bridgeWrapped: typeof window.showGame === 'function',
    };
  });

  const games = result.states.map((state) => state.game);
  if (!games.includes('spy')) throw new Error(`Presence never reported spy: ${JSON.stringify(result.states)}`);
  if (!games.includes('biblical-match-three')) throw new Error(`Presence never reported Biblical Treasures: ${JSON.stringify(result.states)}`);
  if (result.states.at(-1)?.game !== '') throw new Error(`Presence did not return to menu: ${JSON.stringify(result.states)}`);
  if (result.snapshot?.game !== '') throw new Error(`Presence snapshot stayed in a game after menu: ${JSON.stringify(result.snapshot)}`);

  console.log(`OK: presence game states transition correctly: ${games.map((g) => g || 'menu').join(' -> ')}`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
