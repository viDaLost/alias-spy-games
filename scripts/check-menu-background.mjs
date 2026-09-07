// Проверяет фон главного меню: что он возвращается после выхода из игры и что
// подписи секций читаются на нём в обеих темах.
//
// Фон меню — отдельная сцена поверх страницы, и её видимость держится на классе
// is-ready. Игры, которые рисуют своё во весь экран, прячут сцену под собой; та,
// что снимала класс, не возвращала его обратно — сцена возвращалась в разметку,
// но оставалась прозрачной, и меню открывалось на голом фоне. Заметить это можно
// только глазами, поэтому проверяется отдельно.
//
// Вторая беда того же рода — читаемость. «Ваш прогресс» и «Игры для компании»
// идут прямо по иллюстрации, без карточки под ними, а иллюстрация неровная:
// тёмно-синяя архитектура и золото ламп. Тёмная тема гасит её до brightness(.4),
// светлая — высветляет и накрывает пеленой. Обе дозы меряются по снимку: в
// разметке всё это выглядит одинаково исправным.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePng, blockLuminanceBounds } from './lib/png-luminance.mjs';

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
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const crashes = [];
page.on('pageerror', (error) => crashes.push(String(error?.message || error)));

const fail = async (message) => {
  console.error(`Проверка фона меню не прошла: ${message}`);
  await browser.close();
  server.close();
  process.exit(1);
};

await page.addInitScript(() => {
  window.Telegram = {
    WebApp: {
      initData: 'query_id=stub&user=%7B%22id%22%3A5883903220%7D&hash=stub',
      initDataUnsafe: { user: { id: 5883903220, first_name: 'Тест' } },
      ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
  try {
    localStorage.setItem('leaderboard_news_seen_v1', '1');
    const seen = {};
    for (const key of ['spy', 'bible-wow', 'bible-wordsearch', 'sacred-word', 'kids-ark-pairs', 'biblical-match-three']) seen[key] = 1;
    localStorage.setItem('game_rules_seen_v1', JSON.stringify(seen));
  } catch { /* приватный режим */ }
});
const stub = (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ success: true, isBanned: false, lastGames: [], answered: true, rooms: [] }),
});
// На GitHub telegram.org доступен, и настоящий SDK затирает поставленную
// здесь личность: прогресс начинает читаться под чужим ключом, и проверка
// падает только в CI. Отдаём вместо него ту же заглушку.
const telegramSdkStub = (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: `window.Telegram=window.Telegram||{WebApp:{initData:"user=%7B%22id%22%3A5883903220%7D&hash=qa",initDataUnsafe:{user:{id:5883903220,first_name:"Тест"}},ready(){},expand(){},colorScheme:"light",onEvent(){},offEvent(){},MainButton:{show(){},hide(){}},BackButton:{show(){},hide(){},onClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};`,
});
await page.route('https://telegram.org/**', telegramSdkStub);
for (const pattern of ['https://*.workers.dev/**', 'https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, stub);
}

await page.goto(`${baseURL}/#tgWebAppData=query_id%3Dstub`, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(3000);

const sceneState = () => page.evaluate(() => {
  const scene = document.querySelector('.home-gamehub-parallax__scene');
  if (!scene) return null;
  const style = getComputedStyle(scene);
  return {
    hidden: scene.hasAttribute('hidden'),
    ready: scene.classList.contains('is-ready'),
    opacity: Number(style.opacity),
    display: style.display,
  };
});

const before = await sceneState();
if (!before) await fail('сцены фона нет в разметке');
if (before.hidden || before.opacity < 0.9) {
  await fail(`в меню фон не виден: hidden=${before.hidden}, прозрачность ${before.opacity}`);
}

// Игры, которые прячут фон под собой. Художник делал это жёстче остальных,
// поэтому проверяются обе двери: обычная игра и он.
for (const [label, open] of [
  ['обычная игра', () => window.showGame('spy')],
  ['Библейский художник', () => document.getElementById('bible-sketch-card')?.click()],
]) {
  const opened = await page.evaluate(open);
  await page.waitForTimeout(3000);
  const mode = await page.evaluate(() => document.body.dataset.currentGame || '');
  if (!mode) await fail(`не удалось открыть «${label}» (${opened})`);

  await page.evaluate(() => (window.appGoToMainMenu || window.goToMainMenu)?.());
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 15_000 });
  await page.waitForTimeout(1500);

  const after = await sceneState();
  if (after.hidden || after.display === 'none') {
    await fail(`после выхода из «${label}» фон меню остался спрятанным`);
  }
  if (!after.ready || after.opacity < 0.9) {
    await fail(`после выхода из «${label}» фон меню остался прозрачным (is-ready=${after.ready}, прозрачность ${after.opacity})`);
  }
}

/*
  Читаемость подписей на фоне. Мерится сама сцена: всё остальное на странице
  прячется, иначе в замер попадают карточки и кнопки поверх неё.

  Пороги подобраны замерами. Светлая тема: подписи тёмные, и опасно тёмное
  пятно — с нынешней пеленой самый тёмный квадрат светит на 0.70, без неё на
  0.29. Тёмная: подписи светлые, и опасно светлое — с затемнением самый светлый
  квадрат даёт 0.15, без него 0.92. Пороги 0.55 и 0.35 стоят между.
*/
const MIN_LIGHT_DARKEST = 0.55;
const MAX_DARK_BRIGHTEST = 0.35;

const sceneBounds = async () => {
  await page.evaluate(() => {
    for (const node of document.body.children) {
      if (!node.classList.contains('home-gamehub-parallax__scene')) node.style.visibility = 'hidden';
    }
  });
  await page.waitForTimeout(250);
  const shot = await page.screenshot({ type: 'png' });
  await page.evaluate(() => {
    for (const node of document.body.children) node.style.visibility = '';
  });
  return blockLuminanceBounds(decodePng(shot));
};

await page.evaluate(() => document.documentElement.classList.remove('theme-dark'));
await page.waitForTimeout(600);
const light = await sceneBounds();
if (light.min < MIN_LIGHT_DARKEST) {
  await fail(`в светлой теме фон меню оставляет тёмное пятно: ${light.min.toFixed(3)} при минимуме `
    + `${MIN_LIGHT_DARKEST} — тёмные подписи секций на нём не прочесть`);
}

await page.evaluate(() => document.documentElement.classList.add('theme-dark'));
await page.waitForTimeout(600);
const dark = await sceneBounds();
if (dark.max > MAX_DARK_BRIGHTEST) {
  await fail(`в тёмной теме фон меню светит на ${dark.max.toFixed(3)} при пределе ${MAX_DARK_BRIGHTEST} `
    + '— светлые подписи секций тонут в его подсветке');
}
await page.evaluate(() => document.documentElement.classList.remove('theme-dark'));

if (crashes.length) await fail(`страница поймала исключение: ${crashes[0]}`);

console.log('Фон меню в порядке: он виден при открытии, возвращается после выхода '
  + 'и из обычной игры, и из «Библейского художника», а подписи секций читаются на нём '
  + 'и в светлой теме, и в тёмной.');

await browser.close();
server.close();
