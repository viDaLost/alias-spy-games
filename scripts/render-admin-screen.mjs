// Renders the admin panel to PNG so its layout can be reviewed like any game screen.
//
//   node scripts/render-admin-screen.mjs <out-dir>
//
// The panel only opens for one Telegram ID and only draws once Apps Script has
// answered, so it never appeared in the screen sweep. Both are stubbed here --
// an admin identity and a list of users in the shape normalizeUser() expects --
// and nothing leaves the machine.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node scripts/render-admin-screen.mjs <out-dir>');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

// The id the panel checks for. Kept in step with ADMIN_ID in admin-enhancements.js.
// initData below only has to be non-empty: backend-bridge answers locally with a
// 401 for anyone it reads as a guest, and never reaches the stubbed endpoints.
const ADMIN_ID = 1288379477;

const NAMES = ['anna_k', 'petr.ivanov', 'maria_s', 'guest_9921', 'daniil', 'sofia_v', 'igor', 'lev_m', 'nadia', 'roman_p', 'yulia', 'artem'];
const users = NAMES.map((username, index) => ({
  id: String(700100200 + index * 37),
  username,
  link: `https://t.me/${username}`,
  wowStars: (index * 17) % 240,
  wsStars: (index * 11) % 90,
  swLevel: index % 12,
  isBanned: index === 3 || index === 9,
  lastGames: JSON.stringify([
    { game: 'Алиас', date: '2025-12-20' },
    { game: 'Библейское WOW', date: '2025-12-18' },
  ]),
}));

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'],
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
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--force-prefers-reduced-motion'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
});
await context.addInitScript(() => {
  window.__APP_TELEMETRY_DISABLED__ = true;
  Math.random = () => 0.42;
  const RealDate = Date;
  const fixed = new RealDate('2026-01-01T00:00:00Z').getTime();
  window.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  };
});

const page = await context.newPage();
if (process.env.DEBUG_ADMIN) {
  page.on('console', (m) => console.log(`  [${m.type()}] ${m.text().slice(0, 170)}`));
  page.on('request', (r) => { if (/script\.google|workers\.dev/.test(r.url())) console.log(`  -> ${r.method()} ${r.url().slice(0, 70)} ${String(r.postData() || '').slice(0, 90)}`); });
}
page.on('pageerror', (error) => console.log(`  ошибка страницы: ${String(error).slice(0, 140)}`));

await page.route('https://telegram.org/**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: `window.Telegram={WebApp:{initData:"user=%7B%22id%22%3A${ADMIN_ID}%7D&auth_date=1767225600&hash=qa",initDataUnsafe:{user:{id:${ADMIN_ID},username:"root",first_name:"Root"}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},disableVerticalSwipes(){},requestFullscreen(){},lockOrientation(){},unlockOrientation(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};`,
}));

// backend-bridge rewrites Apps Script calls to the Core Worker, so both hosts have
// to answer, and one endpoint serves every action: the reply is chosen by the
// action the page asked for.
function backendReply(route) {
  const request = route.request();
  const body = `${request.postData() || ''}${request.url()}`;
  const payload = body.includes('getAdminData')
    ? { success: true, users }
    : body.includes('adminRoleStatus')
      ? { success: true, isAdmin: true }
      : { success: true, isBanned: false, wowStars: 20, wsStars: 0, swLevel: 0, lastGames: [] };
  return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
}
for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**', 'https://*.workers.dev/**']) {
  await page.route(pattern, backendReply);
}

await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(3000);

// A signed-in user is offered the referral survey on first launch; it opens over
// everything, so it is dismissed the way a person would.
await page.click('.referral-survey-later', { timeout: 6000 }).catch(() => {});
await page.waitForTimeout(600);

await page.evaluate(() => window.openAdminPanelV2());
await page.waitForSelector('.admin-v3-nav, .admin-v2-error', { timeout: 20_000 });
await page.waitForTimeout(1500);
await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });

// One capture per tab: each is now its own screen rather than a scroll position.
for (const tab of ['overview', 'support', 'users', 'broadcast']) {
  await page.click(`[data-admin-v3-target="${tab}"]`, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(outDir, `admin-${tab}-fold.png`) });
  await page.screenshot({ path: path.join(outDir, `admin-${tab}.png`), fullPage: true });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`${tab.padEnd(10)} ${height}px`);
}

await page.click('[data-admin-v3-target="users"]', { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(400);
const report = await page.evaluate(() => {
  const box = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return `${selector}: —`;
    const rect = node.getBoundingClientRect();
    return `${selector}: ${Math.round(rect.top + window.scrollY)}..${Math.round(rect.bottom + window.scrollY)} (h${Math.round(rect.height)})`;
  };
  return [
    `высота ${document.documentElement.scrollHeight}px, перелив по X ${document.documentElement.scrollWidth - document.documentElement.clientWidth}px`,
    `карточек пользователей: ${document.querySelectorAll('.admin-v2-user').length}`,
    box('.admin-v2__header'), box('.admin-v3-nav'), box('.admin-v2__toolbar'), box('.admin-v2-user'),
  ];
});
for (const line of report) console.log(line);

await browser.close();
server.close();
