// Проверяет переключатель светлой и тёмной темы.
//
// Раньше тему выбирал только телефон: палитра жила в @media
// (prefers-color-scheme: dark), и переключить её из приложения было нечем.
// Теперь она включается классом на html, а класс ставит человек или система.
//
// Четыре вещи, которые ломаются молча:
//
//   * кнопки нет или она за экраном. Её просили заметить, а не найти;
//   * выбор не переживает перезапуск. Тогда он и не выбор;
//   * без выбора приложение перестаёт слушать телефон. Человек включил ночной
//     режим на устройстве, а приложение осталось светлым;
//   * тема ставится после первой отрисовки, и тёмное приложение мелькает белым.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const { chromium } = await import('playwright-core');
const root = path.resolve(process.cwd());

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
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const fail = async (message) => {
  await browser.close();
  server.close();
  console.error(`Проверка переключателя темы не прошла: ${message}`);
  process.exit(1);
};

const SDK = 'window.Telegram={WebApp:{initData:"user=%7B%22id%22%3A5883903220%7D&hash=qa",'
  + 'initDataUnsafe:{user:{id:5883903220,username:"root"}},ready(){},expand(){},setHeaderColor(){},'
  + 'setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},openLink(){},'
  + 'disableVerticalSwipes(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};';

async function openApp(colorScheme) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme,
  });
  await context.addInitScript(() => { window.__APP_TELEMETRY_DISABLED__ = true; });
  const page = await context.newPage();
  await page.route('https://telegram.org/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: SDK,
  }));
  for (const pattern of ['https://script.google.com/**', 'https://*.workers.dev/**']) {
    await page.route(pattern, (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"success":true,"isBanned":false,"lastGames":[]}',
    }));
  }
  await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
  await page.waitForTimeout(2800);
  return { context, page };
}

const state = (page) => page.evaluate(() => {
  const node = document.getElementById('theme-switch');
  const box = node?.getBoundingClientRect();
  return {
    dark: document.documentElement.classList.contains('theme-dark'),
    choice: localStorage.getItem('theme_choice_v1'),
    label: (node?.innerText || '').trim(),
    hasIcon: Boolean(node?.querySelector('svg')),
    // «Заметная» — это про размер и место на первом экране, а не про наличие узла.
    onScreen: Boolean(box && box.width >= 36 && box.height >= 32 && box.top >= 0 && box.top < 420
      && box.right <= window.innerWidth + 1),
  };
});

// --- 1. светлая система: кнопка на месте и зовёт в тёмную ---------------------------
const light = await openApp('light');
let now = await state(light.page);
if (!now.label) await fail('переключателя темы нет в шапке главного меню');
if (!now.onScreen) await fail('переключатель есть, но его не видно на первом экране');
if (!now.hasIcon) await fail('у переключателя нет значка — одной подписи мало');
if (now.dark) await fail('при светлой настройке телефона приложение открылось тёмным');
if (!/Тёмная/i.test(now.label)) await fail(`кнопка в светлой теме подписана «${now.label}» вместо «Тёмная»`);
if (now.choice) await fail('выбор темы записан, хотя человек ничего не нажимал');

// --- 2. нажатие переключает ---------------------------------------------------------
await light.page.evaluate(() => document.getElementById('theme-switch').click());
await light.page.waitForTimeout(500);
now = await state(light.page);
if (!now.dark) await fail('нажатие не включило тёмную тему');
if (now.choice !== 'dark') await fail(`выбор сохранён как «${now.choice}» вместо «dark»`);
if (!/Светл/i.test(now.label)) await fail(`после переключения кнопка подписана «${now.label}»`);

const painted = await light.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
if (!/^rgb\(\s*(\d+)/.test(painted) || Number(painted.match(/\d+/g).slice(0, 3).reduce((a, b) => Number(a) + Number(b))) > 300) {
  await fail(`тёмная тема включилась, но фон остался светлым: ${painted}`);
}

// --- 3. выбор переживает перезапуск --------------------------------------------------
await light.page.reload({ waitUntil: 'commit', timeout: 30_000 });
await light.page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await light.page.waitForTimeout(2500);
now = await state(light.page);
if (!now.dark) await fail('после перезапуска приложение вернулось к светлой теме');

// --- 4. обратно в светлую ------------------------------------------------------------
await light.page.evaluate(() => document.getElementById('theme-switch').click());
await light.page.waitForTimeout(500);
now = await state(light.page);
if (now.dark || now.choice !== 'light') await fail('обратно в светлую тему переключиться нельзя');
await light.context.close();

// --- 5. без выбора идём за телефоном --------------------------------------------------
const dark = await openApp('dark');
now = await state(dark.page);
if (!now.dark) await fail('телефон в тёмной теме, а приложение открылось светлым');
if (now.choice) await fail('выбор записан сам собой — приложение перестанет слушать телефон');
await dark.context.close();

// --- 6. никакой вспышки при запуске ----------------------------------------------------
//
// Класс должен стоять до того, как страница что-то нарисует. Проверяется по самой
// ранней возможной точке: скрипт в <head> исполняется раньше разметки страницы.
const early = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
const earlyPage = await early.newPage();
await earlyPage.route('https://telegram.org/**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8', body: SDK,
}));
await earlyPage.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
const atBodyStart = await earlyPage.evaluate(() => document.documentElement.classList.contains('theme-dark'));
if (!atBodyStart) await fail('к началу отрисовки тема ещё не выбрана — приложение мелькнёт светлым');
await early.close();

console.log('Переключатель темы в порядке: кнопка видна в шапке меню, переключает в обе стороны, '
  + 'выбор переживает перезапуск, без выбора приложение идёт за настройкой телефона, '
  + 'а тема ставится до первой отрисовки.');

await browser.close();
server.close();
