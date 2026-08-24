import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();

function testPage() {
  return `<!doctype html><html><head>
    <meta charset="utf-8">
    <meta name="app-core-backend" content="https://core.test">
    <meta name="app-observability" content="https://presence.test">
  </head><body>
  <script>
    window.Telegram = { WebApp: {
      initData: 'signed_backoff_test',
      initDataUnsafe: { user: { id: 55555, username: 'backoff_test' } },
    }};
    window.__wsAttempts = 0;
    window.__sessionRequests = 0;
    window.fetch = async (url) => {
      if (String(url).includes('/web/session')) {
        window.__sessionRequests += 1;
        return new Response(JSON.stringify({
          ok: true,
          token: 'bgw_presence_backoff_token',
          expiresAt: Date.now() + 30 * 60_000,
          scope: 'presence',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    };

    class FailingWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      constructor(url) {
        super();
        this.url = url;
        this.readyState = FailingWebSocket.CONNECTING;
        window.__wsAttempts += 1;
        setTimeout(() => {
          this.readyState = FailingWebSocket.CLOSED;
          const event = new Event('close');
          Object.defineProperty(event, 'code', { value: 1006 });
          this.dispatchEvent(event);
        }, 25);
      }
      send() { return false; }
      close(code = 1000) {
        if (this.readyState === FailingWebSocket.CLOSED) return;
        this.readyState = FailingWebSocket.CLOSED;
        const event = new Event('close');
        Object.defineProperty(event, 'code', { value: code });
        this.dispatchEvent(event);
      }
    }
    window.WebSocket = FailingWebSocket;
  </script>
  <script src="/web/js/presence-identity.js?v=7"></script>
  </body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/presence-backoff-test.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(testPage());
    return;
  }
  const target = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
let browser;

try {
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/presence-backoff-test.html`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForFunction(() => window.__wsAttempts >= 1, null, { timeout: 2_000 });

  // The passive context detector runs every 2 seconds. A broken implementation
  // would therefore reconnect at ~2s, 4s and 6s and bypass exponential backoff.
  // Correct behavior is initial attempt + one retry at ~2.5s; the next retry is
  // not due until ~7.5s.
  await page.waitForTimeout(6_200);
  const result = await page.evaluate(() => ({
    attempts: window.__wsAttempts,
    sessions: window.__sessionRequests,
  }));

  if (result.attempts > 2) {
    throw new Error(`Presence backoff was bypassed by passive timers: ${JSON.stringify(result)}`);
  }
  if (result.attempts < 2) {
    throw new Error(`Presence did not perform the expected scheduled retry: ${JSON.stringify(result)}`);
  }
  if (result.sessions !== 1) {
    throw new Error(`Presence session token was unnecessarily reissued: ${JSON.stringify(result)}`);
  }

  console.log(`OK: failed presence connection produced ${result.attempts} WS attempts in 6.2s; passive 2s context checks did not bypass backoff.`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
