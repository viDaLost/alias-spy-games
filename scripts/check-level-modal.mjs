// Guards the level picker in «Поиск библейских слов».
//
// Two bugs met here, and they had one cause. Screen-entry animations run with
// animation-fill-mode: both, so after they finish the element keeps the final
// keyframe -- and a final keyframe of «transform: none» still computes to an
// identity matrix. Any element with a transform becomes the containing block for
// position: fixed inside it, so the modal stopped being measured against the screen
// and was measured against #game-container instead. With forty levels the card still
// happened to fit; at ninety it grew past 1500px, hung off both edges of an 844px
// screen with no scrolling of its own, and the buttons that fell outside could not
// be tapped at all.
//
// So this asserts the three things that were broken: nothing above the modal holds a
// transform, the card fits the screen and scrolls its own list, and the very last
// level can be reached and opened by tapping it.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { skipFirstRunRules } from './lib/rules-sheet.mjs';

const root = process.cwd();
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
await skipFirstRunRules(context);
const page = await context.newPage();

const fail = async (message) => {
  await browser.close();
  server.close();
  console.error(`Level modal check failed: ${message}`);
  process.exit(1);
};

await page.route('https://telegram.org/**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: 'window.Telegram={WebApp:{initData:"",initDataUnsafe:{user:{id:999999,username:"qa",first_name:"QA"}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},disableVerticalSwipes(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};',
}));
const gas = JSON.stringify({ success: true, isBanned: false, wowStars: 20, wsStars: 500, swLevel: 0, lastGames: [] });
for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: gas }));
}
await page.route('https://*.workers.dev/**', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: '{"ok":true}' }));

await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.showGame('bible-wordsearch'));
await page.waitForSelector('.ws-board .ws-cell', { timeout: 20_000 }).catch(() => fail('the word search board never rendered'));
await page.waitForTimeout(1500);

const levels = JSON.parse(fs.readFileSync(path.join(root, 'web/data/bible_wordsearch_levels.json'), 'utf8')).levels;
const last = levels.length;

await page.click('#ws-level-btn', { timeout: 10_000 }).catch(() => fail('the level button does not open the picker'));
await page.waitForSelector('.ws-level-item', { timeout: 8000 }).catch(() => fail('the picker opened without any level buttons'));
await page.waitForTimeout(600);

const buttons = await page.locator('.ws-level-item').count();
if (buttons !== last) await fail(`the picker lists ${buttons} levels, but the data file has ${last}`);

// A transformed ancestor silently re-anchors the fixed modal. This is the root cause,
// and it comes back the moment someone adds an entry animation with fill-mode: both.
const transformed = await page.evaluate(() => {
  const found = [];
  let node = document.querySelector('.ws-modal')?.parentElement;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    if (style.transform !== 'none' || style.filter !== 'none' || style.perspective !== 'none') {
      found.push(`${node.tagName.toLowerCase()}.${String(node.className).trim().split(/\s+/)[0] || ''} (transform: ${style.transform})`);
    }
    node = node.parentElement;
  }
  return found;
});
if (transformed.length) {
  await fail(`${transformed.join('; ')} holds a transform, so the fixed modal is measured against it instead of the screen`);
}

const geometry = await page.evaluate(() => {
  const card = document.querySelector('.ws-modal-content');
  const grid = document.querySelector('#ws-levels-grid');
  const box = card.getBoundingClientRect();
  return {
    top: Math.round(box.top),
    bottom: Math.round(box.bottom),
    viewport: window.innerHeight,
    scrollable: grid.scrollHeight > grid.clientHeight + 4,
    overflowY: getComputedStyle(grid).overflowY,
  };
});
if (geometry.top < 0 || geometry.bottom > geometry.viewport) {
  await fail(`the picker card spans ${geometry.top}..${geometry.bottom} in a ${geometry.viewport}px screen — part of it cannot be reached`);
}
if (!geometry.scrollable || geometry.overflowY === 'visible') {
  await fail(`the level list does not scroll (overflow-y: ${geometry.overflowY}) — everything past the fold is unreachable`);
}

// The last level is the one furthest from the top: reach it the way a player does.
await page.evaluate(() => {
  const grid = document.querySelector('#ws-levels-grid');
  grid.scrollTop = grid.scrollHeight;
});
await page.waitForTimeout(400);

const target = await page.evaluate((label) => {
  const button = [...document.querySelectorAll('.ws-level-item')].find((item) => item.textContent.trim().startsWith(label));
  if (!button) return null;
  const box = button.getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, onScreen: box.top >= 0 && box.bottom <= window.innerHeight };
}, String(last));
if (!target) await fail(`level ${last} has no button in the picker`);
if (!target.onScreen) await fail(`level ${last} stays off screen even after scrolling the list to the end`);

const before = await page.evaluate(() => document.getElementById('ws-lvl-label')?.textContent?.trim());
await page.touchscreen.tap(target.x, target.y);
await page.waitForTimeout(1800);

const after = await page.evaluate(() => ({
  level: document.getElementById('ws-lvl-label')?.textContent?.trim(),
  theme: document.getElementById('ws-theme-label')?.textContent?.trim(),
  cells: document.querySelectorAll('.ws-board .ws-cell').length,
  modalOpen: !document.getElementById('ws-level-modal')?.classList.contains('hidden'),
}));
if (after.level !== String(last)) await fail(`tapping level ${last} left the game on level ${after.level} (was ${before})`);
if (after.modalOpen) await fail('the picker stayed open after choosing a level');
if (!after.cells) await fail(`level ${last} opened without a board`);

console.log(`Level modal OK: все ${last} уровней в списке, окно помещается в экран и прокручивается, `
  + `а тап по последнему открывает «${after.theme}» с ${after.cells} клетками.`);
await browser.close();
server.close();
