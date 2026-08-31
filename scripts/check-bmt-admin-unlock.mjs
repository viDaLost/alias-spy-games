// Проверяет, что карта уровней «Библейских сокровищ» открыта главному админу
// целиком — и только ему.
//
// Раньше вся кампания открывалась разом только на превью-хостах и по
// ?unlockAll=1, поэтому в боевом приложении новые уровни было не посмотреть,
// не пройдя всё заново. Теперь её открывает ещё и Telegram-id главного админа.
//
// Обратная половина проверки важна не меньше прямой: обычному игроку карта
// должна остаться закрытой, иначе кампания перестанет быть кампанией.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const ADMIN_ID = fs.readFileSync(path.join(root, 'web/js/app.js'), 'utf8').match(/const ADMIN_ID = "(\d+)"/)?.[1];
if (!ADMIN_ID) {
  console.error('Admin unlock check failed: в web/js/app.js не нашёлся id главного админа');
  process.exit(1);
}
const levels = JSON.parse(fs.readFileSync(path.join(root, 'web/data/biblical_match_three_levels.json'), 'utf8')).levels;

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'], ['.obj', 'text/plain'],
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

const fail = async (message) => {
  await browser.close();
  server.close();
  console.error(`Admin unlock check failed: ${message}`);
  process.exit(1);
};

/** Открывает игру от лица заданного Telegram-id и считает доступные узлы карты. */
async function mapFor(telegramId) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { window.__APP_TELEMETRY_DISABLED__ = true; });
  const page = await context.newPage();
  await page.route('https://telegram.org/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8',
    body: `window.Telegram={WebApp:{initData:"",initDataUnsafe:{user:{id:${telegramId},username:"qa",first_name:"QA"}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},disableVerticalSwipes(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};`,
  }));
  const gas = JSON.stringify({ success: true, isBanned: false, wowStars: 0, wsStars: 0, swLevel: 0, lastGames: [] });
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: gas }));
  }
  await page.route('https://*.workers.dev/**', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: '{"ok":true}' }));

  await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.openBiblicalMatchThree());
  await page.waitForSelector('.bmt-map-node', { state: 'attached', timeout: 20_000 });
  await page.waitForTimeout(600);

  const state = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.bmt-map-node')];
    return {
      total: nodes.length,
      open: nodes.filter((node) => !node.disabled && !node.classList.contains('is-locked')).length,
      admin: Boolean(window.BiblicalMatchThreeV10?.isRootAdmin?.()),
      hostUnlock: Boolean(window.BiblicalMatchThreeV10?.testUnlock),
    };
  });
  await context.close();
  return state;
}

const asAdmin = await mapFor(ADMIN_ID);
if (asAdmin.hostUnlock) await fail('локальный хост сам по себе открыл кампанию — проверка не измерила бы права админа');
if (!asAdmin.admin) await fail(`id ${ADMIN_ID} не опознан как главный админ`);
if (asAdmin.total !== levels.length) await fail(`на карте ${asAdmin.total} узлов вместо ${levels.length}`);
if (asAdmin.open !== levels.length) await fail(`главному админу открыто ${asAdmin.open} уровней из ${levels.length}`);

const asPlayer = await mapFor('424242424');
if (asPlayer.admin) await fail('обычный игрок опознан как главный админ');
if (asPlayer.open !== 1) await fail(`обычному игроку открыто ${asPlayer.open} уровней вместо одного — кампания перестала быть кампанией`);

console.log(`Доступ к кампании в порядке: главному админу открыты все ${asAdmin.open} уровней «Библейских сокровищ», `
  + `обычному игроку — по-прежнему только первый.`);

await browser.close();
server.close();
