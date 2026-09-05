// HUD и управление «Моисея на Ниле» не уезжают под чужие кнопки.
//
// Отзыв владельца со скриншотом: «кнопки управления находятся под другими
// кнопками, счётчик пройденного расстояния и счётчик собранных лотосов — под
// кнопками Telegram мини-приложения».
//
// Причина у обеих бед одна: игра открывается во фрейме, а внутри фрейма
// env(safe-area-inset-*) всегда ноль. Вырез экрана принадлежит внешнему
// документу, кнопки Telegram рисуются поверх веб-вида и в раскладке не
// участвуют вовсе — оттуда, изнутри, их не видно ни тем ни другим способом.
// Игра считала, что сверху свободно, и ставила первую строку HUD под
// «Закрыть» и «⋯»; снизу её «Нырок» ложился под кнопку «Главное меню» самой
// оболочки, а правая кнопка поворота — под круглую «?».
//
// Проверять это чтением стилей бесполезно: перекрытие — это пересечение
// прямоугольников на живом экране. Поэтому приложение поднимается целиком, в
// Telegram с вырезом и кнопками клиента, игра открывается по-настоящему, и
// каждая плашка HUD и каждая кнопка управления сверяется с чужими рамками.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const failures = [];

// Кнопки клиента Telegram: столько занимает полоса с «Закрыть» и «⋯» под
// вырезом экрана. Ровно это число отдаёт contentSafeAreaInset.top на клиентах
// с Bot API 8.0; здесь оно подставляется вместо клиента.
const TELEGRAM_HEADER = 46;
const NOTCH = 59;   // вырез экрана: его отдаёт Telegram в safeAreaInset

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'], ['.glb', 'model/gltf-binary'],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  response.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();

/*
  Личность и отметки о прочитанных правилах ставятся до первого скрипта: без
  них приложение показывает окно правил поверх игры, и мерить было бы нечего.
  Здесь же живут безопасные зоны Telegram — вырез экрана и полоса под кнопками
  клиента: Playwright их не эмулирует, а именно из-за них беда и возникает.
*/
await page.addInitScript(([notch, header]) => {
  window.Telegram = {
    WebApp: {
      initData: 'query_id=stub&user=%7B%22id%22%3A5883903220%7D&hash=stub',
      initDataUnsafe: { user: { id: 5883903220, first_name: 'Тест' } },
      ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
      setHeaderColor() {}, setBackgroundColor() {},
      safeAreaInset: { top: notch, bottom: 34, left: 0, right: 0 },
      contentSafeAreaInset: { top: header, bottom: 0, left: 0, right: 0 },
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
  try {
    localStorage.setItem('leaderboard_news_seen_v1', '1');
    localStorage.setItem('moses-nile-tutorial-seen-v1', '1');
    const seen = {};
    for (const key of ['spy', 'bible-wow', 'bible-wordsearch', 'sacred-word', 'kids-ark-pairs', 'biblical-match-three', 'moses-nile']) seen[key] = 1;
    localStorage.setItem('game_rules_seen_v1', JSON.stringify(seen));
  } catch { /* приватный режим */ }
}, [NOTCH, TELEGRAM_HEADER]);

const telegramSdkStub = (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: `window.Telegram=window.Telegram||{WebApp:{initData:"user=%7B%22id%22%3A5883903220%7D&hash=qa",`
    + `initDataUnsafe:{user:{id:5883903220,first_name:"Тест"}},ready(){},expand(){},colorScheme:"light",`
    + `safeAreaInset:{top:${NOTCH},bottom:34,left:0,right:0},`
    + `contentSafeAreaInset:{top:${TELEGRAM_HEADER},bottom:0,left:0,right:0},`
    + `setHeaderColor(){},setBackgroundColor(){},onEvent(){},offEvent(){},`
    + `MainButton:{show(){},hide(){}},BackButton:{show(){},hide(){},onClick(){}},`
    + `HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};`,
});
await page.route('https://telegram.org/**', telegramSdkStub);
const stub = (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ success: true, isBanned: false, lastGames: [], answered: true, rooms: [] }),
});
for (const pattern of ['https://*.workers.dev/**', 'https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, stub);
}
// Движок и звук игре здесь не нужны: она проверяется как раскладка.
await page.route('**/moses-nile-v7/vendor/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await page.route('**/moses-nile-v7/js/sound.js*', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'window.gameAudio={init(){},playSplash(){},playCollect(){},playPowerup(){},playHit(){},playGrowl(){}};',
}));

try {
  await page.goto(`${baseURL}/#tgWebAppData=query_id%3Dstub`, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });

  await page.evaluate(() => window.showGame?.('moses-nile'));
  await page.waitForSelector('.game-frame', { timeout: 15_000 });
  const frame = await (await page.$('.game-frame')).contentFrame();
  await frame.waitForSelector('#hud', { timeout: 20_000 });

  // Игра могла ещё не получить сообщение: числа приходят и адресом, и им.
  await frame.waitForFunction(
    () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chrome-top')) > 0,
    null,
    { timeout: 10_000 },
  );
  await frame.locator('#start-btn').click().catch(() => {});
  await page.waitForTimeout(700);

  // --- 1. Сверху: HUD не залезает под кнопки Telegram --------------------------
  const forbiddenTop = NOTCH + TELEGRAM_HEADER;
  const topBoxes = await frame.evaluate(() => {
    const named = [
      ['счётчик пройденного пути', '#dist-txt'],
      ['счётчик лотосов', '#score-txt'],
      ['сердца', '#hearts'],
      ['счётчик звёзд', '#score-chip'],
      ['множитель', '#combo-chip'],
    ];
    return named.map(([name, selector]) => {
      const node = document.querySelector(selector);
      const box = (node?.closest('.hud-chip, .hud-mini, #hearts') || node)?.getBoundingClientRect();
      return { name, top: box ? box.top : null };
    });
  });
  for (const row of topBoxes) {
    if (row.top === null) { failures.push(`${row.name}: элемент не найден`); continue; }
    if (row.top < forbiddenTop) {
      failures.push(`${row.name} начинается на ${Math.round(row.top)}px — под кнопками Telegram, `
        + `которые занимают верхние ${forbiddenTop}px`);
    }
  }

  // --- 2. Снизу: управление не под кнопками оболочки ---------------------------
  const shell = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    return { exit: rect('.game-frame-exit'), help: rect('.rules-help') };
  });
  const controls = await frame.evaluate(() => {
    const named = [['влево', '#btn-left'], ['волна', '#btn-jump'], ['нырок', '#btn-dive'], ['вправо', '#btn-right']];
    return named.map(([name, selector]) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { name, left: box.left, right: box.right, top: box.top, bottom: box.bottom } : { name, left: null };
    });
  });
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  for (const control of controls) {
    if (control.left === null) { failures.push(`кнопка «${control.name}» не найдена`); continue; }
    for (const [name, box] of Object.entries(shell)) {
      if (!box) continue;
      const title = name === 'exit' ? 'кнопкой «Главное меню»' : 'кнопкой «?»';
      if (overlaps(control, box)) failures.push(`кнопка «${control.name}» перекрыта ${title}`);
    }
    if (control.bottom > 844) failures.push(`кнопка «${control.name}» уехала за нижний край экрана`);
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`Раскладка «Моисея на Ниле» не прошла проверку (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`OK: HUD «Моисея на Ниле» ниже кнопок Telegram (${NOTCH}+${TELEGRAM_HEADER}px), `
  + 'а «влево», «волна», «нырок» и «вправо» не перекрыты ни «Главным меню», ни «?».');
