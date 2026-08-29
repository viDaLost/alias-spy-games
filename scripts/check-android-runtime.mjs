import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'],
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
  window.AndroidApp = {
    getTelegramId() { return '555555555'; },
    getSessionToken() { return 'bgs_android_runtime_test_token'; },
    isAndroidApp() { return true; },
    getAppVersion() { return '3.0.3-web-parity'; },
    logout() {},
  };
});

const page = await context.newPage();
let androidCalls = 0;
let telegramCompatCalls = 0;

await page.route('https://telegram.org/js/telegram-web-app.js*', (route) => route.fulfill({
  status: 200,
  contentType: 'text/javascript; charset=utf-8',
  body: '/* standalone Android test: Telegram SDK intentionally absent */',
}));

await page.route('https://alias-spy-games-core.vitaledanilov.workers.dev/android/compat', async (route) => {
  androidCalls += 1;
  const request = route.request();
  const body = JSON.parse(request.postData() || '{}');
  if (String(body.androidUserId) !== '555555555') throw new Error(`Wrong Android ID: ${body.androidUserId}`);
  if (request.headers().authorization !== 'Bearer bgs_android_runtime_test_token') {
    throw new Error(`Missing Android bearer: ${request.headers().authorization || '(none)'}`);
  }
  const action = String(body.payload?.action || '');
  if (!['syncUser', 'updateHistory'].includes(action)) throw new Error(`Unexpected Android action: ${action}`);
  await route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ success: true, isBanned: false, wowStars: 20, wsStars: 0, swLevel: 0, lastGames: [], source: 'cloudflare-android' }),
  });
});

await page.route('https://alias-spy-games-core.vitaledanilov.workers.dev/compat', async (route) => {
  telegramCompatCalls += 1;
  await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'APK must not use Telegram compat route' }) });
});

await page.goto(`${baseURL}/?android=1&apk=103`, { waitUntil: 'commit', timeout: 20_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting') && !document.documentElement.classList.contains('app-menu-preparing'), null, { timeout: 10_000 });

const state = await page.evaluate(() => ({
  android: window.__ANDROID_APK__ === true,
  id: String(window.__ANDROID_TELEGRAM_ID__ || ''),
  telegramId: String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || ''),
  adminVisible: Boolean(document.getElementById('admin-btn')),
  source: window.AppCoreBridge?.source || '',
  authenticated: window.AppCoreBridge?.status?.().androidAuthenticated === true,
}));

if (!state.android) throw new Error('Android runtime marker was not enabled.');
if (state.id !== '555555555' || state.telegramId !== '555555555') throw new Error(`Android ID was not installed into runtime: ${JSON.stringify(state)}`);
if (state.adminVisible) throw new Error('Admin button must never be visible in standalone Android mode.');
if (state.source !== 'cloudflare') throw new Error(`Cloudflare bridge is missing: ${state.source}`);
if (!state.authenticated) throw new Error('Android Web bridge did not expose an authenticated session state.');
if (androidCalls < 1) throw new Error('Authenticated Android Cloudflare sync route was never called.');
if (telegramCompatCalls !== 0) throw new Error(`APK incorrectly called Telegram /compat ${telegramCompatCalls} time(s).`);

console.log(`OK: Android verified session reached the menu and used authenticated Cloudflare Android route (${androidCalls} call(s)).`);
await context.close();
await browser.close();
await new Promise((resolve) => server.close(resolve));
