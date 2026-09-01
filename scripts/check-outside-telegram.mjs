// Проверяет, что вне Telegram приложение выглядит так же, как внутри.
//
// Вёрстка писалась под Telegram: сверху зарезервировано место под его кнопки,
// высоты считаются от экрана. В браузере и в ярлыке на главном экране этих
// кнопок нет, а Safari прячет часть экрана под свои панели. Что ломается молча:
//
//   * над каждым экраном остаётся пустая полоса в сотню пикселей;
//   * экран уезжает вбок, и появляется горизонтальная прокрутка;
//   * содержимое встаёт под вырез экрана или под полосу жестов;
//   * плавающие кнопки перекрывают то, на что нужно нажать.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream' });
  response.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const problems = [];
const crashes = [];

async function openApp(insideTelegram, width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => crashes.push(`${insideTelegram ? 'telegram' : 'браузер'}: ${error?.message || error}`));
  await page.addInitScript((tg) => {
    window.__APP_TELEMETRY_DISABLED__ = true;
    try {
      localStorage.setItem('leaderboard_news_seen_v1', '1');
      const seen = {};
      for (const key of ['spy', 'bible-wow', 'bible-wordsearch', 'sacred-word', 'kids-ark-pairs', 'biblical-match-three']) seen[key] = 1;
      localStorage.setItem('game_rules_seen_v1', JSON.stringify(seen));
    } catch { /* приватный режим */ }
    if (!tg) return;
    window.Telegram = {
      WebApp: {
        initData: 'query_id=stub&user=%7B%22id%22%3A5883903220%7D&hash=stub',
        initDataUnsafe: { user: { id: 5883903220, first_name: 'Тест' } },
        ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
        MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
        HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
      },
    };
  }, insideTelegram);
  const stub = (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, isBanned: false, lastGames: [], answered: true, players: [], totalPublished: 0 }),
  });
  // На GitHub telegram.org доступен, и настоящий SDK затирает поставленную
  // здесь личность: тест начинает видеть чужое состояние и падает только в CI.
  await page.route('https://telegram.org/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8',
    body: 'window.Telegram=window.Telegram||{WebApp:{initData:"",initDataUnsafe:{},ready(){},expand(){}}};',
  }));
  for (const pattern of ['https://*.workers.dev/**', 'https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
    await page.route(pattern, stub);
  }
  await page.goto(insideTelegram ? `${baseURL}/#tgWebAppData=query_id%3Dstub` : baseURL, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
  await page.waitForTimeout(2500);
  return { context, page };
}

const measure = (page) => page.evaluate(() => {
  const view = { w: document.documentElement.clientWidth, h: window.innerHeight };
  const overflowing = [...document.querySelectorAll('body *')]
    .filter((node) => {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return false;
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
      // Фоновая иллюстрация нарочно шире экрана и обрезается родителем.
      if (node.closest('.home-gamehub-parallax, .gamehub-boot')) return false;
      return box.right > view.w + 1 || box.left < -1;
    })
    .map((node) => `${node.tagName.toLowerCase()}.${String(node.className || '').split(' ')[0]}`)
    .slice(0, 5);
  return {
    scrollW: document.documentElement.scrollWidth,
    clientW: view.w,
    overflowing,
    topGap: getComputedStyle(document.documentElement).getPropertyValue('--tg-top-gap').trim(),
    outside: document.documentElement.classList.contains('app-outside-telegram'),
    // Само зарезервированное место, а не положение заголовка: заголовок несёт
    // собственные отступы и сдвигается недостаточно, чтобы поломку было видно.
    headerPad: Math.round(parseFloat(getComputedStyle(document.querySelector('.app-header')).paddingTop) || 0),
    firstMeaningfulTop: Math.round(document.querySelector('.app-header h1')?.getBoundingClientRect().top ?? -1),
    // Только игры: в системном разделе состав нарочно разный — вне Telegram
    // там есть вход по коду и установка на главный экран.
    cards: document.querySelectorAll('#company-games .game-card, #word-games .game-card, #kids-games .game-card').length,
  };
});

const inTelegram = await openApp(true);
const inBrowser = await openApp(false);

const tg = await measure(inTelegram.page);
const web = await measure(inBrowser.page);

if (tg.outside) problems.push('внутри Telegram приложение считает себя браузерной версией');
if (!web.outside) problems.push('вне Telegram приложение считает себя запущенным из мессенджера');
if (web.cards !== tg.cards) problems.push(`в браузере ${web.cards} карточек игр против ${tg.cards} в Telegram`);
if (web.cards < 10) problems.push(`в браузере собралось всего ${web.cards} карточек игр`);

// Место под кнопки мессенджера вне Telegram не нужно: сотня пустых пикселей над
// каждым экраном — самый заметный дефект веб-версии. Но и в ноль его сводить
// нельзя: под вырезом экрана заголовок окажется наполовину срезан.
if (tg.headerPad - web.headerPad < 40) {
  problems.push(`вне Telegram сверху зарезервировано ${web.headerPad}px против ${tg.headerPad}px в Telegram — пустая полоса под кнопки мессенджера осталась`);
}
if (web.headerPad < 12) {
  problems.push(`вне Telegram сверху всего ${web.headerPad}px — под вырезом экрана заголовок будет срезан`);
}

for (const [name, snapshot] of [['Telegram', tg], ['браузер', web]]) {
  if (snapshot.scrollW > snapshot.clientW + 1) {
    problems.push(`${name}: страница шире экрана (${snapshot.scrollW} против ${snapshot.clientW}), появилась прокрутка вбок`);
  }
  if (snapshot.overflowing.length) {
    problems.push(`${name}: за край экрана выходят ${snapshot.overflowing.join(', ')}`);
  }
}

// Экраны, которые открываются поверх меню, тоже должны помещаться.
const screens = [
  ['рейтинг', () => window.openGameRules && document.getElementById('leaderboard-btn')?.click(), '.lb-shell'],
  ['справочник', () => document.getElementById('game-rules-btn')?.click(), '.rules-shell'],
  ['сброс', () => window.openProgressReset?.(), '.pr-shell'],
];
for (const [label, action, selector] of screens) {
  for (const [name, { page }] of [['Telegram', inTelegram], ['браузер', inBrowser]]) {
    await page.evaluate(action);
    try { await page.waitForSelector(selector, { timeout: 12_000 }); } catch {
      problems.push(`${name}: экран «${label}» не открылся`);
      continue;
    }
    await page.waitForTimeout(600);
    const shot = await page.evaluate((sel) => {
      const node = document.querySelector(sel);
      const box = node.getBoundingClientRect();
      return {
        top: Math.round(box.top),
        wide: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    }, selector);
    if (shot.wide) problems.push(`${name}: экран «${label}» растягивает страницу вбок`);
    if (shot.top < 0) problems.push(`${name}: экран «${label}» начинается выше края экрана (${shot.top}px)`);
    await page.evaluate(() => (window.appGoToMainMenu || window.goToMainMenu)?.());
    await page.waitForTimeout(500);
  }
}

// Узкий экран: 320px — самый маленький из живых айфонов.
const narrow = await openApp(false, 320);
const narrowShot = await measure(narrow.page);
if (narrowShot.scrollW > narrowShot.clientW + 1) {
  problems.push(`на экране 320px страница шире экрана (${narrowShot.scrollW})`);
}
if (narrowShot.overflowing.length) {
  problems.push(`на экране 320px за край выходят ${narrowShot.overflowing.join(', ')}`);
}
await narrow.context.close();

await inTelegram.context.close();
await inBrowser.context.close();
await browser.close();
server.close();

if (crashes.length) problems.push(`страница поймала исключение: ${crashes[0]}`);

if (problems.length) {
  console.error(`Вне Telegram приложение выглядит иначе (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

console.log('Вне Telegram всё на месте: место под кнопки мессенджера не резервируется, '
  + 'заголовок не уходит под вырез, страница никуда не уезжает вбок ни на 390, ни на 320 пикселях, '
  + 'а рейтинг, справочник и сброс открываются так же, как в Telegram.');
