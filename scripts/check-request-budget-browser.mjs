import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();

function testPage() {
  return `<!doctype html>
<html><head><meta charset="utf-8"></head><body>
<button data-live-refresh id="refresh">refresh</button>
<script>
  window.__clock = 1000000;
  Date.now = () => window.__clock;
  window.__counts = { live: 0, stats: 0, observer: 0 };
  window.fetch = async (input, init = {}) => {
    const url = new URL(String(input), location.href);
    if (url.pathname === '/admin/live') {
      window.__counts.live += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return new Response(JSON.stringify({ ok: true, generatedAt: Date.now(), seq: window.__counts.live }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/admin/stats') {
      window.__counts.stats += 1;
      return new Response(JSON.stringify({ ok: true, seq: window.__counts.stats }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (/^\\/admin\\/rooms\\//.test(url.pathname)) {
      window.__counts.observer += 1;
      const requestHeaders = new Headers(init.headers || {});
      if (requestHeaders.get('If-None-Match') === '"v1"') {
        return new Response(null, { status: 304, headers: { ETag: '"v1"' } });
      }
      return new Response(JSON.stringify({ ok: true, version: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"v1"' }
      });
    }
    return new Response('{}', { status: 404 });
  };
</script>
<script src="/web/js/cloudflare-request-budget.js?v=1"></script>
</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/budget-test.html') {
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
  await page.goto(`http://127.0.0.1:${port}/budget-test.html`, { waitUntil: 'domcontentloaded', timeout: 20_000 });

  const result = await page.evaluate(async () => {
    const live = 'https://alias-spy-games-observability.vitaledanilov.workers.dev/admin/live';
    const stats = 'https://alias-spy-games-observability.vitaledanilov.workers.dev/admin/stats';
    const observer = 'https://alias-spy-games-quartet.vitaledanilov.workers.dev/admin/rooms/73CYVA/state';

    // Concurrent identical reads should share one upstream request.
    await Promise.all([fetch(live), fetch(live), fetch(live)]);
    const concurrentLive = window.__counts.live;

    window.__clock += 14_999;
    await fetch(live);
    const liveWithinBudget = window.__counts.live;
    window.__clock += 2;
    await fetch(live);
    const liveAfterBudget = window.__counts.live;

    await fetch(stats);
    window.__clock += 299_999;
    await fetch(stats);
    const statsWithinBudget = window.__counts.stats;
    window.__clock += 2;
    await fetch(stats);
    const statsAfterBudget = window.__counts.stats;

    // First observer request has no ETag and returns a full 200 snapshot.
    const firstObserver = await fetch(observer);
    window.__clock += 8_001;
    const first304 = await fetch(observer, { headers: { 'If-None-Match': '"v1"' } });
    const observerAfter304 = window.__counts.observer;
    window.__clock += 19_999;
    const cached304 = await fetch(observer, { headers: { 'If-None-Match': '"v1"' } });
    const observerWithin304Budget = window.__counts.observer;
    window.__clock += 2;
    await fetch(observer, { headers: { 'If-None-Match': '"v1"' } });
    const observerAfter304Budget = window.__counts.observer;

    // Manual refresh invalidates only the live cache.
    document.getElementById('refresh').click();
    await fetch(live);
    const liveAfterManualRefresh = window.__counts.live;

    // Once a snapshot exists, a hidden WebView should keep serving it locally
    // even after the normal foreground TTL is exceeded.
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    window.__clock += 500_000;
    await fetch(live);
    const liveWhileHidden = window.__counts.live;

    return {
      concurrentLive,
      liveWithinBudget,
      liveAfterBudget,
      statsWithinBudget,
      statsAfterBudget,
      firstObserver: firstObserver.status,
      first304: first304.status,
      cached304: cached304.status,
      observerAfter304,
      observerWithin304Budget,
      observerAfter304Budget,
      liveAfterManualRefresh,
      liveWhileHidden,
      snapshot: window.CloudflareRequestBudget?.snapshot?.(),
    };
  });

  const expect = (condition, message) => { if (!condition) throw new Error(`${message}: ${JSON.stringify(result)}`); };
  expect(result.concurrentLive === 1, 'Concurrent live requests were not coalesced');
  expect(result.liveWithinBudget === 1 && result.liveAfterBudget === 2, '15-second live budget is incorrect');
  expect(result.statsWithinBudget === 1 && result.statsAfterBudget === 2, '5-minute stats budget is incorrect');
  expect(result.firstObserver === 200 && result.first304 === 304 && result.cached304 === 304, 'Observer 200/304 cache flow is invalid');
  expect(result.observerAfter304 === 2 && result.observerWithin304Budget === 2 && result.observerAfter304Budget === 3, 'Observer 304 budget is incorrect');
  expect(result.liveAfterManualRefresh === 3, 'Manual live refresh did not invalidate cache');
  expect(result.liveWhileHidden === 3, 'Hidden WebView still generated a live network request');
  expect(Array.isArray(result.snapshot), 'Request-budget debug snapshot is unavailable');

  console.log(`OK: request budget coalesces polling and pauses background network traffic: ${JSON.stringify(result)}`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
