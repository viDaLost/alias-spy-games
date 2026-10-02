// Наблюдение за сетевыми партиями из админ-панели — глазами администратора.
//
// Жалоба была такая: игрок сидит в «Библейском художнике», а панель пишет
// «партия за одним столом — комнаты нет», хотя без сети эта игра не играется
// вовсе. И за партиями «Двенадцати колен» и «Земли обетованной» наблюдать было
// нельзя, хотя мониторы у них есть: код комнаты по дороге терялся. За
// «Царствами» и онлайн-«Соглядатаем» мониторов не было совсем.
//
// Проверка ставит панель на страницу и отдаёт ей список онлайна, где есть все
// случаи сразу: «Художник» в лобби, «Соглядатай» на одном телефоне и по
// игроку в комнате каждой сетевой игры. Дальше — как администратор: смотрит,
// у кого есть кнопка наблюдения и что написано у остальных, открывает монитор
// и читает отчёт.
//
// Отчёт комнаты собирают настоящие модули воркеров — те же, что отвечают
// панели на деле. Подставь сюда руками написанный ответ, и проверка проверяла
// бы своё представление о сервере, а разойтись могут как раз они.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

import { adminStateResponse as kingdomsState } from '../cloudflare/kingdoms-worker/src/admin-observer.js';
import {
  buildView as kingdomsView,
  createRoomState as kingdomsRoom,
  joinRoom as kingdomsJoin,
  setReady as kingdomsReady,
  setSettings as kingdomsSettings,
  startGame as kingdomsStart,
} from '../cloudflare/kingdoms-worker/src/room.js';
import { R as KR } from '../cloudflare/kingdoms-worker/src/rules.js';
import { adminStateResponse as spyState } from '../cloudflare/spy-worker/src/admin-observer.js';
import {
  addChatMessage as spyChat,
  buildView as spyView,
  createRoomState as spyRoom,
  joinRoom as spyJoin,
  startGame as spyStart,
} from '../cloudflare/spy-worker/src/engine.js';
import { LOCATIONS as SPY_LOCATIONS } from '../cloudflare/spy-worker/src/locations.js';
import { adminStateResponse as tribesState } from '../cloudflare/twelve-tribes-worker/src/admin-observer.js';
import {
  buildView as tribesView,
  createRoomState as tribesRoom,
  joinRoom as tribesJoin,
} from '../cloudflare/twelve-tribes-worker/src/room.js';

const root = process.cwd();
const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

// Адреса воркеров — из самой страницы приложения: панель берёт их оттуда же.
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const meta = (name) => (indexHtml.match(new RegExp(`<meta name="${name}" content="([^"]*)"`)) || [])[1] || '';
const BACKENDS = Object.fromEntries(['app-core-backend', 'app-observability', 'quartet-backend', 'bible-sketch-backend',
  'spy-backend', 'twelve-tribes-backend', 'kingdoms-backend', 'promised-land-app'].map((name) => [name, meta(name)]));
for (const [name, url] of Object.entries(BACKENDS)) need(url, `в index.html нет адреса ${name}`);

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const host = { playerId: 'tg:1', name: 'Хозяин' };
const guest = { playerId: 'tg:2', name: 'Гость' };
const GET = new Request('https://x/admin-state');

// ——— комнаты, о которых спросит панель ———

const kingdoms = kingdomsRoom('KNGDM', host, 1000);
kingdomsJoin(kingdoms, guest, 1001);
kingdomsSettings(kingdoms, host.playerId, { bots: 1 }, 1002);
kingdomsReady(kingdoms, guest.playerId, true, 1003);
kingdomsStart(kingdoms, host.playerId, 1004, seeded(7));

const spy = spyRoom('SPYRM', host, 1000);
spyJoin(spy, guest, 1001);
spyJoin(spy, { playerId: 'tg:3', name: 'Третий' }, 1002);
spyStart(spy, host.playerId, SPY_LOCATIONS, 1003);
spyChat(spy, guest.playerId, 'Здесь много воды?', 1004);

const tribes = tribesRoom('TRIBE', host, 1000);
tribesJoin(tribes, guest, 1001);

const ROOMS = {
  KNGDM: () => kingdomsState(GET, kingdoms, kingdomsView(kingdoms, '', new Set([host.playerId])), KR),
  SPYRM: () => spyState(GET, spy, spyView(spy, '', new Set([host.playerId]))),
  TRIBE: () => tribesState(GET, tribes, tribesView(tribes, '', new Set([host.playerId]))),
};

const ONLINE = [
  { id: '1000001', username: 'sketch_lobby', game: 'bible-sketch', roomId: '' },
  { id: '1000002', username: 'spy_alone', game: 'spy', roomId: '' },
  { id: '1000003', username: 'tribes_room', game: 'twelve-tribes', roomId: 'TRIBE' },
  { id: '1000004', username: 'kingdoms_room', game: 'kingdoms', roomId: 'KNGDM' },
  { id: '1000005', username: 'spy_room', game: 'spy', roomId: 'SPYRM' },
  { id: '1000006', username: 'land_room', game: 'promised-land', roomId: 'LANDS' },
  { id: '1000007', username: 'sketch_room', game: 'bible-sketch', roomId: 'DRAWS' },
].map((one) => ({ ...one, displayName: one.username, platform: 'telegram', updatedAt: Date.now() }));

function testPage() {
  const metas = Object.entries(BACKENDS).map(([name, url]) => `<meta name="${name}" content="${url}">`).join('\n  ');
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  ${metas}
  <link rel="stylesheet" href="/web/styles/admin-live-v3.css">
  <link rel="stylesheet" href="/web/styles/admin-live-compact.css">
</head>
<body data-mode="admin">
  <main id="game-container">
    <section class="admin-v2">
      <header class="admin-v2__header"><div class="admin-v2__heading"><h2>Управление</h2></div></header>
      <div class="admin-v2__stats"></div>
    </section>
  </main>
  <script>window.Telegram={WebApp:{initData:'signed_test_init_data',initDataUnsafe:{user:{id:1288379477,username:'admin_test'}}}};</script>
  <script src="/web/js/admin-live-v3.js"></script>
</body>
</html>`;
}

const mime = new Map([['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8']]);
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/observers.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(testPage());
    return;
  }
  const target = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
  'Access-Control-Expose-Headers': 'ETag',
};
const TOKEN = 'bgw_admin_browser_token';
const observerAsks = [];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

  await page.route(`${BACKENDS['app-core-backend']}/**`, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({
      status: 200, contentType: 'application/json', headers: CORS,
      body: JSON.stringify({ ok: true, token: TOKEN, scope: 'admin', expiresAt: Date.now() + 15 * 60_000 }),
    });
  });
  await page.route(`${BACKENDS['app-observability']}/**`, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const { pathname } = new URL(route.request().url());
    const body = pathname === '/admin/live'
      ? { ok: true, onlineNow: ONLINE.length, menuNow: 0, activeRoomsNow: 5, generatedAt: Date.now(), onlineUsers: ONLINE, strictPresenceWindowMs: 75_000 }
      : { ok: true };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
  });
  for (const name of ['spy-backend', 'twelve-tribes-backend', 'kingdoms-backend']) {
    await page.route(`${BACKENDS[name]}/**`, async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const match = new URL(request.url()).pathname.match(/^\/admin\/rooms\/([A-Z0-9]+)\/state$/);
      observerAsks.push({ name, path: new URL(request.url()).pathname, auth: request.headers().authorization || '' });
      if (!match || !ROOMS[match[1]]) {
        return route.fulfill({ status: 404, contentType: 'application/json', headers: CORS, body: '{"ok":false}' });
      }
      const response = ROOMS[match[1]]();
      return route.fulfill({
        status: response.status,
        contentType: 'application/json',
        headers: { ...CORS, ETag: response.headers.get('ETag') || '' },
        body: await response.text(),
      });
    });
  }

  await page.goto(`${baseURL}/observers.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((count) => document.querySelectorAll('[data-live-user]').length === count,
    ONLINE.length, { timeout: 10_000 }).catch(() => {});

  const cards = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-live-user]')].map((card) => [
    card.dataset.liveUser,
    {
      text: card.innerText,
      observe: card.querySelector('[data-observe-room]')?.dataset.observeGame || '',
    },
  ])));
  need(Object.keys(cards).length === ONLINE.length, `в списке онлайна ${Object.keys(cards).length} карточек вместо ${ONLINE.length}`);

  // 1. Честная строка вместо кнопки.
  need(/В лобби игры/.test(cards['1000001']?.text || ''),
    `«Художник» без комнаты описан как «${(cards['1000001']?.text || '').split('\n').pop()}» — без сети он не играется, это лобби`);
  need(!cards['1000001']?.observe, 'у «Художника» без комнаты есть кнопка наблюдения — наблюдать не за чем');
  need(/на одном устройстве/.test(cards['1000002']?.text || ''),
    '«Соглядатай» без комнаты не сказал, что партия может идти на одном устройстве');
  const allText = Object.values(cards).map((one) => one.text).join('\n');
  need(!/Партия за одним столом/.test(allText), 'в панели осталась строка «Партия за одним столом»');

  // 2. Кнопка наблюдения у каждого, кто в комнате.
  for (const [id, game] of [['1000003', 'twelve-tribes'], ['1000004', 'kingdoms'], ['1000005', 'spy'],
    ['1000006', 'promised-land'], ['1000007', 'bible-sketch']]) {
    need(cards[id]?.observe === game, `у игрока в комнате «${game}» нет кнопки наблюдения`);
  }

  // 3. Монитор открывается и читается.
  const observe = async (id, expect) => {
    const button = page.locator(`[data-live-user="${id}"] [data-observe-room]`);
    // Кнопки нет — об этом уже сказано выше; монитор открывать нечем.
    if (!(await button.count())) return '';
    await button.click();
    await page.waitForFunction((text) => (document.querySelector('.admin-live-v3__observer-body')?.innerText || '').includes(text),
      expect, { timeout: 8_000 }).catch(() => {});
    const text = await page.evaluate(() => document.getElementById('admin-room-observer')?.innerText || '');
    await page.locator('[data-observer-close]').click().catch(() => {});
    await page.waitForTimeout(100);
    return text;
  };

  const kingdomsText = await observe('1000004', 'обл.');
  need(/Царства · KNGDM/.test(kingdomsText), 'заголовок монитора «Царств» не назвал игру и комнату');
  need(/обл\./.test(kingdomsText) && /Расстановка|Приказы/.test(kingdomsText),
    `монитор «Царств» не показал землю и этап: «${kingdomsText.slice(0, 160)}»`);
  const kingdomNames = kingdoms.game.players.map((one) => KR.kingdomOf(one.kingdomId)?.name).filter(Boolean);
  need(kingdomNames.some((name) => kingdomsText.includes(name)), 'монитор «Царств» не назвал царства игроков');

  const spyText = await observe('1000005', 'Общий чат');
  need(/Соглядатай · SPYRM/.test(spyText), 'заголовок монитора «Соглядатая» не назвал игру и комнату');
  need(/Раздача ролей/.test(spyText), `монитор «Соглядатая» не назвал этап: «${spyText.slice(0, 160)}»`);
  need(spyText.includes('Здесь много воды?'), 'общий чат — ход игры — в мониторе не виден');
  need(!spyText.includes(spy.location), 'монитор показал администратору локацию до итогов');
  need(!/соглядатай ·|горожанин ·/.test(spyText), 'монитор показал роли до итогов');

  const tribesText = await observe('1000003', 'Гость');
  need(/Двенадцать колен · TRIBE/.test(tribesText) && /Лобби/.test(tribesText),
    `монитор «Двенадцати колен» не открылся: «${tribesText.slice(0, 160)}»`);

  need(observerAsks.length > 0 && observerAsks.every((ask) => ask.auth === `Bearer ${TOKEN}`),
    'монитор спрашивал комнату без токена администратора');
  for (const error of pageErrors) need(false, `ошибка на странице: ${error}`);
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error(`Наблюдение за комнатами в админ-панели не прошло проверку (${problems.length}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('OK: админ-панель честно пишет, почему кнопки наблюдения нет — «Художник» в лобби, «Соглядатай» '
  + 'на одном устройстве, — и даёт наблюдать за комнатой каждой сетевой игры; мониторы «Царств», '
  + '«Соглядатая» и «Колен» открываются с токеном администратора и показывают партию без её тайн.');
