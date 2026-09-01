// Guards the fix for "swiping down on a Biblical Treasures tile collapses the Mini App".
//
// Reproduces the conditions that made it happen: the Telegram SDK resolves *after*
// DOMContentLoaded, which is what a slow connection produces and what made the single
// startup call to disableVerticalSwipes() a no-op for the whole session.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { skipFirstRunRules } from './lib/rules-sheet.mjs';

const root = process.cwd();
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'], ['.jpg', 'image/jpeg'],
]);

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream', 'Cache-Control': 'no-store' });
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
await skipFirstRunRules(context);
const page = await context.newPage();

const fail = async (message) => {
  await browser.close();
  server.close();
  console.error(`Telegram swipe guard check failed: ${message}`);
  process.exit(1);
};

// The SDK arrives a second late, well after DOMContentLoaded.
await page.route('https://telegram.org/js/telegram-web-app.js*', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: `window.__tgCalls={disable:0,enable:0};
window.Telegram={WebApp:{initData:'',initDataUnsafe:{user:{id:999999,username:'qa',first_name:'QA'}},
ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},
disableVerticalSwipes(){window.__tgCalls.disable+=1},
enableVerticalSwipes(){window.__tgCalls.enable+=1},
HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};`,
  });
});
const gas = JSON.stringify({ success: true, isBanned: false, wowStars: 20, lastGames: [] });
for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: gas }));
}
await page.route('https://*.workers.dev/**', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: '{"ok":true}' }));

await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });

// The guard must catch up with the late SDK rather than having given up at DOMContentLoaded.
await page.waitForFunction(() => window.__tgCalls?.disable > 0, null, { timeout: 15_000 })
  .catch(() => fail('disableVerticalSwipes was never called after the SDK loaded late'));

await page.click('#biblical-match-three-card', { timeout: 10_000 });
await page.waitForTimeout(6000);
try {
  await page.locator('.bmt-v13-level:not([disabled]), .bmt-map-node:not([disabled]), .bmt-journey-node:not([disabled])').first().click({ timeout: 6000 });
  await page.getByRole('button', { name: /Начать уровень/ }).click({ timeout: 6000 });
  await page.waitForSelector('.bmt-board .bmt-tile', { timeout: 10_000 });
} catch (error) {
  await fail(`could not reach the board: ${String(error).slice(0, 140)}`);
}

const currentGame = await page.evaluate(() => document.body.dataset.currentGame);
if (currentGame !== 'biblical-match-three') await fail(`board screen did not mark the game (data-current-game=${currentGame})`);

// The board must own its gestures: if the browser is allowed to pan, a downward drag
// on a tile becomes a scroll and Telegram turns that into "close the app".
const touchAction = await page.evaluate(() => getComputedStyle(document.querySelector('.bmt-board')).touchAction);
if (touchAction !== 'none') await fail(`board touch-action is "${touchAction}", so a vertical drag can still become a scroll`);

const callsBefore = await page.evaluate(() => window.__tgCalls.disable);

// Drag downward on a tile and confirm the fallback cancels the gesture for clients
// whose Telegram build predates disableVerticalSwipes.
const box = await page.locator('.bmt-board .bmt-tile').first().boundingBox();
const prevented = await page.evaluate(async ({ x, y }) => {
  let cancelled = false;
  const record = (event) => { if (event.defaultPrevented) cancelled = true; };
  document.addEventListener('touchmove', record, { passive: true });
  const target = document.elementFromPoint(x, y) || document.body;
  const touch = (clientY) => new Touch({ identifier: 1, target, clientX: x, clientY });
  target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch(y)], targetTouches: [touch(y)], changedTouches: [touch(y)] }));
  for (const offset of [12, 40, 90]) {
    target.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch(y + offset)], targetTouches: [touch(y + offset)], changedTouches: [touch(y + offset)] }));
  }
  target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch(y + 90)] }));
  document.removeEventListener('touchmove', record);
  return cancelled;
}, { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) });

if (!prevented) await fail('a downward swipe on a board tile is not cancelled, so Telegram can still close the app');

const callsAfter = await page.evaluate(() => window.__tgCalls.disable);
if (callsAfter <= callsBefore) await fail('touching the board does not re-assert disableVerticalSwipes');

console.log('Telegram swipe guard OK: the late SDK is caught, the board owns its gestures, and a downward tile swipe never reaches Telegram.');
await browser.close();
server.close();
