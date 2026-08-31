// Guards the admin panel's tabs.
//
// The four buttons used to only scroll: every section stayed on the page, so picking
// "Пользователи" still left the stats, the support queue and the broadcast form
// between you and the list. Now each tab owns its sections. This asserts that a tab
// really does show its own and hide the others, that the choice survives the
// re-render every filter change triggers, and that the broadcast form is not left
// collapsed on a tab where it is the only content.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const ADMIN_ID = 1288379477;

const users = ['anna_k', 'petr_i', 'maria_s', 'guest_9921'].map((username, index) => ({
  id: String(700100200 + index * 37),
  username,
  link: `https://t.me/${username}`,
  wowStars: index * 17,
  wsStars: index * 11,
  swLevel: index,
  isBanned: index === 3,
  lastGames: '[]',
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
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { window.__APP_TELEMETRY_DISABLED__ = true; });
const page = await context.newPage();

const fail = async (message) => {
  await browser.close();
  server.close();
  console.error(`Admin sections check failed: ${message}`);
  process.exit(1);
};

await page.route('https://telegram.org/**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  // initData only has to be non-empty: backend-bridge answers a guest locally with a
  // 401 and never reaches the stubbed endpoints.
  body: `window.Telegram={WebApp:{initData:"user=%7B%22id%22%3A${ADMIN_ID}%7D&auth_date=1767225600&hash=qa",initDataUnsafe:{user:{id:${ADMIN_ID},username:"root",first_name:"Root"}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},disableVerticalSwipes(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};`,
}));

// backend-bridge rewrites Apps Script calls to the Core Worker, so both hosts answer,
// and one endpoint serves every action.
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
await page.waitForTimeout(2500);
await page.click('.referral-survey-later', { timeout: 6000 }).catch(() => {});

await page.evaluate(() => window.openAdminPanelV2());
await page.waitForSelector('.admin-v3-nav [data-admin-v3-target="users"]', { timeout: 20_000 })
  .catch(() => fail('the admin panel never rendered its section tabs'));

/** Which owners currently have at least one section on screen. */
const visibleOwners = () => page.evaluate(() => {
  const shown = new Set();
  for (const node of document.querySelectorAll('[data-admin-v3-owner]')) {
    if (node.offsetParent !== null || node.getClientRects().length) shown.add(node.dataset.adminV3Owner);
  }
  return [...shown].sort();
});

const openTab = async (tab) => {
  await page.click(`[data-admin-v3-target="${tab}"]`, { timeout: 6000 });
  await page.waitForTimeout(400);
};

for (const tab of ['overview', 'support', 'users', 'broadcast']) {
  await openTab(tab);
  const shown = await visibleOwners();
  if (shown.length !== 1 || shown[0] !== tab) {
    await fail(`tab "${tab}" shows sections ${JSON.stringify(shown)} instead of only its own`);
  }
}

// The user list is the panel's working surface: on its tab it must actually be there.
await openTab('users');
if (!(await page.locator('.admin-v2-user').first().isVisible())) {
  await fail('the users tab does not show the user list');
}
if (!(await page.locator('.admin-v2__toolbar').first().isVisible())) {
  await fail('the users tab does not show the search and filter toolbar');
}

// Filtering re-renders the whole panel. The chosen tab has to survive that, otherwise
// every filter click throws the admin back to the overview.
await page.click('[data-admin-filter="banned"], [data-admin-action="filter-banned"], .admin-v2__toolbar button:nth-of-type(3)', { timeout: 6000 }).catch(() => {});
await page.waitForTimeout(700);
const afterFilter = await visibleOwners();
if (afterFilter.length !== 1 || afterFilter[0] !== 'users') {
  await fail(`filtering knocked the panel off the users tab (visible: ${JSON.stringify(afterFilter)})`);
}

// The broadcast form is a <details>; collapsed on its own tab it leaves a blank screen.
await openTab('broadcast');
const broadcastReady = await page.evaluate(() => {
  const node = document.querySelector('.admin-broadcast, .admin-v2__broadcast');
  if (!node) return 'missing';
  if (node.tagName === 'DETAILS' && !node.open) return 'collapsed';
  // Two broadcast forms exist -- the plain textarea and the richer Cloudflare one --
  // so look for a message field rather than for one of their field names.
  const field = node.querySelector('textarea, input[type="text"]');
  if (!field) return 'no-field';
  return field.getClientRects().length ? 'ok' : 'field-hidden';
});
if (broadcastReady !== 'ok') await fail(`the broadcast tab is not usable on arrival: ${broadcastReady}`);

console.log('Admin sections OK: each tab shows only its own sections, the choice survives a re-render, and the broadcast form opens ready to type.');
await browser.close();
server.close();
