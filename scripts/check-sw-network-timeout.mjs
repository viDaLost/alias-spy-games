// Сервис-воркер не виснет вечно на зависшем сетевом запросе.
//
// Отзыв: «на некоторых телефонах не прогружаются игры или картинки». У
// fromNetwork() в sw.js не было потолка ожидания: запрос, который на
// нестабильной мобильной сети не ответил и не оборвался, — обычное дело для
// плохого интернета, не редкость, — оставлял fetch() висеть, а вместе с ним
// весь event.respondWith. Дальше по коду уже было куда упасть — навигация на
// кеш или index.html, неизменные бандлы на Response.error(), у остального
// есть кеш или тот же Response.error(), — но только если fromNetwork хоть
// когда-нибудь отклонится. Без таймаута зависший запрос не отклонялся
// никогда, и картинка или файл игры просто не появлялись — не ошибка, а
// вечная загрузка, которую со стороны не отличить от «сломалось».
//
// Проверять это чтением исходника мало: важно, что настоящий
// зарегистрированный воркер, столкнувшись с запросом без ответа, всё равно
// отпускает страницу за разумное время. Поэтому здесь поднимается настоящий
// браузер с настоящим sw.js, а один конкретный путь на сервере нарочно
// никогда не отвечает.
//
//     node scripts/check-sw-network-timeout.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const HANG_PATH = '/test-probe-hangs-forever.webp';

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  // Ни ответа, ни обрыва — соединение просто остаётся висеть, как это бывает
  // на реальной нестабильной мобильной сети.
  if (pathname === HANG_PATH) return;
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
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
await page.route('https://telegram.org/**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: 'window.Telegram=window.Telegram||{WebApp:{initData:"",initDataUnsafe:{},ready(){},expand(){}}};',
}));
await page.route('https://*.workers.dev/**', (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ success: true, isBanned: false, lastGames: [], answered: true }),
}));
await page.route('https://script.google*.com/**', (route) => route.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, isBanned: false, lastGames: [] }),
}));

try {
  await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });

  const registered = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'нет поддержки';
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    return registration ? 'ok' : 'нет регистрации';
  });
  check(registered === 'ok', `офлайн-работник не встал: ${registered}`);

  /*
    «ready» значит только то, что регистрация активировалась — страница,
    открытая ещё до неё, попадает под контроль воркера отдельным шагом
    (clients.claim() в activate) с небольшой задержкой. Без этого ожидания
    запрос ниже уходит мимо воркера напрямую на сервер и виснет по той же
    причине что при сломанной, что при рабочей версии — тест сравнивал бы
    два одинаковых «мимо», а не саму починку.
  */
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10_000 });

  /*
    15с — с запасом выше восьмисекундного потолка fromNetwork(): если правка
    держит слово, запрос отклонится заметно раньше и тег будет «settled»; без
    неё исходный fetch не отклоняется никогда, и полторы секунды спустя (тест
    ждёт именно столько, а не вечность) тег останется «still-hanging».
  */
  const probe = await page.evaluate(async (hangPath) => {
    const startedAt = performance.now();
    const result = await Promise.race([
      fetch(hangPath).then(() => 'settled', () => 'settled'),
      new Promise((resolve) => setTimeout(() => resolve('still-hanging'), 15_000)),
    ]);
    return { result, elapsedMs: performance.now() - startedAt };
  }, HANG_PATH);

  check(probe.result === 'settled',
    `запрос к зависшему пути так и не отклонился за 15с — работник ждёт сеть вечно, ровно как в жалобе`);
  check(probe.elapsedMs < 12_000,
    `запрос отклонился только через ${Math.round(probe.elapsedMs / 1000)}с — таймаут fromNetwork либо не сработал, либо выставлен намного выше восьми секунд`);
  check(probe.elapsedMs > 6_000,
    `запрос отклонился за ${Math.round(probe.elapsedMs / 1000)}с — подозрительно быстро для восьмисекундного таймаута, зависший путь мог не дойти до воркера`);
} catch (error) {
  failures.push(error.message);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`Service worker network-timeout check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('OK: сервис-воркер не виснет на запросе без ответа — fromNetwork отпускает его через восемь секунд, '
  + 'и картинка или файл игры получают явный отказ вместо вечной загрузки.');
