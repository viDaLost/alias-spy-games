// Проверяет офлайн-режим и установку приложения на главный экран.
//
// Что ломается молча:
//
//   * список кеша отстаёт от бандла. Тогда офлайн открывает вчерашнее
//     приложение, и понять это со стороны невозможно;
//   * работник кеширует ответы сервера. Тогда чужой прогресс и просроченные
//     права приезжают из кеша, а приложение считает их свежими;
//   * офлайн-партия исчезает. История игр и очки уходят на сервер по ходу дела;
//     без очереди этот запрос в дороге просто умирает;
//   * вход по коду показывается внутри Telegram. Там есть подписанные initData,
//     и спрашивать Telegram ID у известного человека — заявка на фишинг;
//   * запросы установленного приложения уходят без подписи. Тогда сервер видит
//     гостя, и прогресс не сходится с Telegram.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const root = process.cwd();

// --- сборка ---------------------------------------------------------------------
{
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  const bundles = [...html.matchAll(/web\/dist\/(app\.[a-f0-9]+\.(?:css|js))/g)].map((match) => match[1]);
  assert.equal(bundles.length, 2, 'в index.html не нашлись оба бандла');
  for (const name of bundles) {
    assert.ok(sw.includes(`web/dist/${name}`), `список кеша не знает про ${name} — офлайн откроет старую сборку`);
  }
  assert.ok(/const VERSION = '[a-f0-9]{10}'/.test(sw), 'версия кеша не проставлена сборкой');

  // Данные уровней обязаны быть в кеше: без них игра в дороге не запустится.
  for (const rel of fs.readdirSync(path.join(root, 'web/data'))) {
    assert.ok(sw.includes(`web/data/${rel}`), `в кеш не попали данные ${rel}`);
  }
  for (const rel of fs.readdirSync(path.join(root, 'web/games')).filter((name) => name.endsWith('.js'))) {
    assert.ok(sw.includes(`web/games/${rel}`), `в кеш не попал скрипт игры ${rel}`);
  }

  // Чужие ответы кешировать нельзя ни при каких условиях.
  assert.ok(/url\.origin !== scope\.origin/.test(sw), 'работник не отсекает чужие домены от кеша');

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone', 'манифест не просит полноэкранный режим');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'), 'в манифесте нет иконки 192');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'), 'в манифесте нет иконки 512');
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(root, icon.src)), `иконка ${icon.src} из манифеста не собрана`);
  }
  assert.ok(html.includes('rel="manifest"'), 'index.html не подключает манифест');
  assert.ok(html.includes('apple-touch-icon'), 'нет иконки для главного экрана iPhone');
  assert.ok(html.includes('apple-mobile-web-app-capable'), 'iOS не откроет ярлык на полный экран');
}

// --- браузер ----------------------------------------------------------------------
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'],
]);
// Playwright умеет обещать offline, но запросы на 127.0.0.1 всё равно доходят.
// Настоящий офлайн тут — оборванное соединение: сервер рвёт сокет, и браузеру
// приходится обходиться тем, что лежит в кеше.
let served = 0;
let unplugged = false;
const server = http.createServer((request, response) => {
  if (unplugged) { request.socket.destroy(); return; }
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  served += 1;
  response.writeHead(200, {
    'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream',
    'Service-Worker-Allowed': '/',
  });
  response.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const crashes = [];
page.on('pageerror', (error) => crashes.push(String(error?.message || error)));

const fail = async (message) => {
  console.error(`Проверка офлайна не прошла: ${message}`);
  await browser.close();
  server.close();
  process.exit(1);
};

const calls = [];
await page.route('https://*.workers.dev/**', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  calls.push({ url: route.request().url(), auth: route.request().headers().authorization || '', body });
  return route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, isBanned: false, lastGames: [], answered: true }),
  });
});
await page.route('https://script.google*.com/**', (route) => route.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, isBanned: false, lastGames: [] }),
}));

// --- 1. вне Telegram: гость, вход предлагается карточкой ---------------------------
//
// Заодно считаются переходы: первая установка работника забирает контроль над
// страницей, и на этом легко перезагрузить приложение прямо посреди партии.
// Перезагрузка допустима только по кнопке «Обновить».
let navigations = 0;
page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations += 1; });

await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(2500);

if (await page.locator('#web-session-overlay').count()) {
  await fail('вход по коду открылся сам в обычной вкладке браузера, а не в установленном приложении');
}
if (!(await page.locator('#web-session-btn').count())) await fail('вне Telegram нет карточки входа в профиль');

// Иконки системных карточек — из набора: рисованная заглушка выбивается из
// ряда прорисованных плиток, а битый путь оставит пустое место.
const systemIcons = await page.evaluate(() => Object.fromEntries(
  ['web-session-btn', 'game-rules-btn'].map((id) => {
    const img = document.querySelector(`#${id} img`);
    return [id, img ? { src: img.getAttribute('src') || '', width: img.naturalWidth } : null];
  }),
));
for (const [id, expected] of [['web-session-btn', 'web/assets/icons/profile.webp'], ['game-rules-btn', 'web/assets/icons/rules.webp']]) {
  const icon = systemIcons[id];
  if (!icon) await fail(`у карточки ${id} нет картинки-иконки`);
  if (!icon.src.startsWith(expected)) await fail(`иконка ${id} берётся не из набора: ${icon.src}`);
  if (!icon.width) await fail(`иконка ${id} не загрузилась`);
}

// --- 2. работник встал и держит оболочку ------------------------------------------
const registered = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'нет поддержки';
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  return registration ? 'ok' : 'нет регистрации';
});
if (registered !== 'ok') await fail(`офлайн-работник не встал: ${registered}`);
await page.waitForTimeout(2500);
if (navigations > 1) {
  await fail(`после установки работника страница перезагрузилась сама (${navigations} переходов) — так игра прервётся посреди партии`);
}

const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  let total = 0;
  const has = {};
  for (const name of names) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    total += keys.length;
    for (const request of keys) {
      if (request.url.includes('/web/data/bible_wow_levels.json')) has.wow = true;
      if (request.url.includes('/web/games/bible-wow.js')) has.game = true;
      if (request.url.includes('/web/dist/app.')) has.bundle = true;
      if (request.url.includes('workers.dev')) has.foreign = true;
    }
  }
  return { names, total, has };
});
if (!cached.has.bundle) await fail('в кеше нет бандла приложения');
if (!cached.has.game) await fail('в кеше нет скриптов игр — в дороге игра не откроется');
if (!cached.has.wow) await fail('в кеше нет данных уровней');
if (cached.has.foreign) await fail('работник закешировал ответ сервера — офлайн покажет чужой прогресс');

// --- 3. приложение открывается без сети --------------------------------------------
await context.setOffline(true);
unplugged = true;
served = 0;
await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(2500);
const offlineMenu = await page.evaluate(() => ({
  cards: document.querySelectorAll('.menu-grid .game-card').length,
  bar: document.getElementById('offline-bar')?.classList.contains('is-visible') || false,
}));
if (served > 0) await fail('сервер отвечал, хотя должен был молчать — офлайн не проверен');
if (offlineMenu.cards < 8) await fail(`без сети меню собралось из ${offlineMenu.cards} карточек`);
if (!offlineMenu.bar) await fail('без сети приложение не сообщает, что играет офлайн');

// --- 4. игра запускается без сети ----------------------------------------------------
await page.evaluate(() => window.showGame('bible-wow'));
await page.waitForTimeout(4000);
const gameStarted = await page.evaluate(() => ({
  mode: document.body.dataset.currentGame || '',
  loading: (document.getElementById('game-container')?.textContent || '').includes('Не удалось'),
}));
if (gameStarted.mode !== 'bible-wow') await fail('без сети игра не открылась');
if (gameStarted.loading) await fail('без сети игра показала ошибку загрузки уровней');
await page.evaluate(() => (window.appGoToMainMenu || window.goToMainMenu)?.());
await page.waitForTimeout(600);

// --- 5. подтверждённая веб-сессия подписывает запросы ---------------------------------
//
// Дальше нужен настоящий запрос к серверу, а гостя приложение обслуживает
// локально и никуда не ходит. Поэтому сначала вход, потом очередь.
unplugged = false;
await context.setOffline(false);
await page.evaluate(() => {
  localStorage.setItem('web_session_v1', JSON.stringify({
    token: `bgs_${'a'.repeat(64)}`, userId: '5883903220', expiresAt: Date.now() + 86_400_000,
  }));
});
calls.length = 0;
await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.apiRequest({ action: 'updateHistory', game: 'spy' }, { quiet: true }));
await page.waitForTimeout(1200);

const signed = calls.find((call) => call.body?.payload?.action === 'updateHistory');
if (!signed) await fail('с подтверждённой сессией запрос вообще не ушёл');
if (!signed.url.includes('/android/compat')) await fail(`запрос ушёл на ${signed.url} вместо /android/compat`);
if (!/^Bearer bgs_/.test(signed.auth)) await fail('запрос ушёл без токена сессии — сервер увидит гостя');
if (String(signed.body.androidUserId) !== '5883903220') await fail('в запросе не тот Telegram ID');
if (!(await page.locator('#web-session-btn').count())) await fail('с активной сессией пропала карточка профиля');
const cardText = await page.evaluate(() => document.getElementById('web-session-btn')?.innerText || '');
if (!/Выйти/.test(cardText)) await fail(`карточка профиля с активной сессией говорит «${cardText.split('\n')[0]}»`);

// --- 6. обращения к серверу ждут связи в очереди и уходят сами -------------------------
await context.setOffline(true);
unplugged = true;
const queued = await page.evaluate(async () => {
  const before = window.OfflineQueue.size();
  await window.apiRequest({ action: 'updateHistory', game: 'bible-wow', at: Date.now() }, { quiet: true });
  return { before, after: window.OfflineQueue.size() };
});
if (queued.after <= queued.before) await fail('офлайн-запрос не попал в очередь и просто пропал');
if (!(await page.evaluate(() => document.getElementById('offline-bar')?.textContent || '')).includes('ждёт')) {
  await fail('приложение не сообщает, что запись ждёт отправки');
}

const historyBefore = calls.filter((call) => call.body?.payload?.action === 'updateHistory').length;
unplugged = false;
await context.setOffline(false);
await page.evaluate(() => { window.dispatchEvent(new Event('online')); });
await page.waitForTimeout(2500);
const historyAfter = calls.filter((call) => call.body?.payload?.action === 'updateHistory').length;
if (historyAfter <= historyBefore) await fail('после возврата связи очередь не ушла на сервер');
if (await page.evaluate(() => window.OfflineQueue.size()) !== 0) await fail('очередь не опустела после отправки');

const flushed = calls.filter((call) => call.body?.payload?.action === 'updateHistory').at(-1);
if (!/^Bearer bgs_/.test(flushed.auth)) await fail('отложенный запрос ушёл без подписи сессии');

// --- 7. внутри Telegram вход по коду не показывается ------------------------------------
const telegramPage = await context.newPage();
await telegramPage.addInitScript(() => {
  window.Telegram = {
    WebApp: {
      initData: 'query_id=stub&user=%7B%22id%22%3A1288379477%7D&hash=stub',
      initDataUnsafe: { user: { id: 1288379477, first_name: 'Тест' } },
      ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
});
await telegramPage.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await telegramPage.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await telegramPage.waitForTimeout(2500);
if (await telegramPage.locator('#web-session-overlay').count()) {
  await fail('внутри Telegram открылось окно с просьбой ввести Telegram ID');
}
// Карточка профиля внутри Telegram есть, но входом по коду не притворяется:
// личность там приходит от мессенджера, и просьба ввести Telegram ID выглядела
// бы как фишинг.
const telegramProfile = await telegramPage.evaluate(() => {
  const card = document.getElementById('web-session-btn');
  return card ? {
    title: card.querySelector('.game-card__title')?.textContent?.trim() || '',
    desc: card.querySelector('.game-card__desc')?.textContent?.trim() || '',
  } : null;
});
if (!telegramProfile) await fail('внутри Telegram нет карточки профиля');
if (/Вход в профиль|Выйти/.test(telegramProfile.title) || /Код из бота/.test(telegramProfile.desc)) {
  await fail(`внутри Telegram карточка предлагает вход по коду: «${telegramProfile.title}» / «${telegramProfile.desc}»`);
}
await telegramPage.evaluate(() => document.getElementById('web-session-btn').click());
await telegramPage.waitForTimeout(700);
if (await telegramPage.locator('#web-session-overlay').count()) {
  await fail('внутри Telegram по карточке профиля открылось окно с просьбой ввести Telegram ID');
}
if (await telegramPage.locator('#install-app-btn').count()) {
  await fail('внутри Telegram предлагается установка на главный экран');
}

// --- 8. главному администратору установка показывается всегда ---------------------
//
// Ему она нужна, чтобы посмотреть, что увидит человек с iPhone. Признак роли
// ставит серверная проверка — тот же шлюз, что у кнопки админки.
const ownerPage = await context.newPage();
await ownerPage.route('https://*.workers.dev/**', (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  const action = String(body?.payload?.action || '');
  if (action === 'adminRoleStatus') {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, isAdmin: true, isRoot: true, userId: '1288379477' }),
    });
  }
  return route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, isBanned: false, lastGames: [], answered: true }),
  });
});
await ownerPage.addInitScript(() => {
  window.Telegram = {
    WebApp: {
      initData: 'query_id=stub&user=%7B%22id%22%3A1288379477%7D&hash=stub',
      initDataUnsafe: { user: { id: 1288379477, first_name: 'Владелец' } },
      ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
});
await ownerPage.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await ownerPage.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await ownerPage.waitForTimeout(3000);
if (!(await ownerPage.locator('html.admin-rbac-root').count())) {
  await fail('серверная проверка роли не подтвердила главного администратора — дальше проверять нечего');
}
if (!(await ownerPage.locator('#install-app-btn').count())) {
  await fail('главному администратору не показана карточка установки на iPhone');
}
const installIcon = await ownerPage.evaluate(() => {
  const img = document.querySelector('#install-app-btn img');
  return img ? { src: img.getAttribute('src') || '', width: img.naturalWidth } : null;
});
if (!installIcon) await fail('у карточки установки нет картинки-иконки');
if (!installIcon.src.startsWith('web/assets/icons/install-ios.webp')) {
  await fail(`иконка установки берётся не из набора: ${installIcon.src}`);
}
if (!installIcon.width) await fail('иконка установки не загрузилась');
await ownerPage.evaluate(() => document.getElementById('install-app-btn').click());
await ownerPage.waitForTimeout(600);
const sheetText = await ownerPage.evaluate(() => document.getElementById('install-ios-sheet')?.innerText || '');
if (!/Поделиться/.test(sheetText) || !/На экран/.test(sheetText)) {
  await fail('карточка установки не показывает, куда нажимать в Safari');
}

if (crashes.length) await fail(`страница поймала исключение: ${crashes[0]}`);

console.log('Офлайн и установка в порядке: список кеша собран сборкой и знает текущие бандлы, '
  + 'ответы сервера не кешируются, без сети открывается меню и запускается игра, '
  + 'обращения к серверу ждут связи в очереди и уходят сами, '
  + 'подтверждённая веб-сессия подписывает запросы, внутри Telegram профиль показывается, но вход по коду не предлагается, '
  + 'а главный администратор видит карточку установки, чтобы проверить её сам.');

await browser.close();
server.close();
