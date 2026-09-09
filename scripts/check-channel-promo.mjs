// Баннер канала обновлений и кнопка в меню.
//
// Что здесь легко сломать молча:
//
//   * баннер перестаёт быть одноразовым и лезет при каждом запуске — это ровно
//     то, из-за чего приложение закрывают;
//   * «Не сейчас» закрывает баннер на этот раз, но не запоминает отказ;
//   * ссылка внутри Telegram открывается обычной вкладкой: приглашение в
//     приватный канал в браузере просит войти заново, и человек до канала не
//     доходит;
//   * кнопка в меню исчезает вместе с баннером, и вернуться к каналу нечем.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const CHANNEL_URL = 'https://t.me/+WEBlCGtAywEyZmNi';
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

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

/** Одно окно на весь сценарий: одноразовость баннера живёт в памяти браузера. */
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await context.addInitScript(() => {
  window.__openedTelegramLinks = [];
  window.Telegram = {
    WebApp: {
      initData: 'signed-test-data',
      initDataUnsafe: { user: { id: 5883903220, first_name: 'Тест' } },
      ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
      setHeaderColor() {}, setBackgroundColor() {}, disableVerticalSwipes() {},
      openTelegramLink(url) { window.__openedTelegramLinks.push(String(url)); },
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
    },
  };
});
const page = await context.newPage();
const crashes = [];
page.on('pageerror', (error) => crashes.push(String(error?.message || error)));
/*
  Один перехватчик на всё. Отдельное правило для telegram.org не годится:
  Playwright примеряет правила с конца, и общее правило перебивало бы его —
  SDK приезжал бы JSON-ом, а страница падала на разборе.
*/
await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith(baseURL)) return route.continue();
  if (url.startsWith('https://telegram.org/')) return route.fulfill({ contentType: 'text/javascript', body: '' });
  let body = {};
  try { body = route.request().postDataJSON() || {}; } catch { /* не наш запрос */ }
  const action = String((body.payload || body).action || '');
  let response = { success: true, isBanned: false, lastGames: [], rooms: [], answered: true };
  if (action === 'adminRoleStatus') response = { success: true, isRoot: false, isAdmin: false, userId: '5883903220' };
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
});

const openMenu = async () => {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
  await page.waitForFunction(() => document.querySelector('.home-dashboard')?.dataset.contentReady === '1', null, { timeout: 20_000 })
    .catch(() => {});
  await page.waitForTimeout(600);
};

try {
  // 1. Первый запуск: баннер на месте, с логотипом и обеими кнопками.
  await openMenu();
  check(await page.locator('#channel-promo').count() === 1, 'баннер канала не показался при первом запуске');
  const art = page.locator('#channel-promo .channel-promo__art');
  check(await art.count() === 1, 'у баннера нет логотипа канала');
  check(await art.evaluate((node) => node.complete && node.naturalWidth > 0).catch(() => false),
    'логотип баннера не загрузился');
  check(await page.locator('[data-channel-join]').count() === 1, 'в баннере нет кнопки подписки');
  check(await page.locator('[data-channel-later]').count() === 1, 'в баннере нет кнопки «Не сейчас»');

  // 2. Кнопка в главном меню — не за дверью «Ещё», а на виду.
  const button = page.locator('.home-channel-trigger');
  check(await button.count() === 1, 'в главном меню нет кнопки канала');
  check(await button.evaluate((node) => Boolean(node.closest('#menu-container')) && !node.closest('#system-actions'))
    .catch(() => false), 'кнопка канала уехала в служебный раздел');

  // 3. Ссылка открывается средствами Telegram, а не вкладкой браузера.
  await button.click();
  await page.waitForTimeout(300);
  const opened = await page.evaluate(() => window.__openedTelegramLinks || []);
  check(opened.length === 1 && opened[0] === CHANNEL_URL, `кнопка открыла «${opened.join(', ') || 'ничего'}»`);

  // 4. «Не сейчас» убирает баннер и запоминает отказ.
  await page.locator('[data-channel-later]').click();
  await page.waitForTimeout(500);
  check(await page.locator('#channel-promo').count() === 0, 'баннер не закрылся по «Не сейчас»');
  await openMenu();
  check(await page.locator('#channel-promo').count() === 0, 'баннер вернулся после перезапуска — он одноразовый');
  check(await page.locator('.home-channel-trigger').count() === 1, 'вместе с баннером пропала и кнопка канала');

  // 5. Подписка тоже закрывает баннер навсегда — и открывает тот же адрес.
  await page.evaluate(() => localStorage.removeItem('channel_promo_seen_v1'));
  await openMenu();
  check(await page.locator('#channel-promo').count() === 1, 'после сброса памяти баннер не вернулся — проверять нечего');
  await page.evaluate(() => { window.__openedTelegramLinks = []; });
  await page.locator('[data-channel-join]').click();
  await page.waitForTimeout(500);
  const joined = await page.evaluate(() => window.__openedTelegramLinks || []);
  check(joined.length === 1 && joined[0] === CHANNEL_URL, `подписка открыла «${joined.join(', ') || 'ничего'}»`);
  await openMenu();
  check(await page.locator('#channel-promo').count() === 0, 'после подписки баннер показался снова');

  for (const crash of crashes) check(false, `страница поймала исключение: ${crash}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`Баннер канала не прошёл проверку (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Канал обновлений в порядке: баннер приходит один раз, «Не сейчас» и подписка запоминаются, '
  + 'кнопка остаётся в главном меню, а ссылка открывается средствами Telegram.');
