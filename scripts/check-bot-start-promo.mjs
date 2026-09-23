// Баннер «Начните диалог с ботом».
//
// Мини-приложение открывается и без того, чтобы человек хоть раз написал
// боту, — по прямой ссылке, через друга, из вложений, — и тогда Telegram не
// даёт боту написать первым: важные рассылки, ответ из поддержки и
// оповещения до такого человека не доходят. Кто уже писал боту, а кто нет,
// со стороны клиента не определить — сервер знает это, только когда сам
// пробует что-то доставить, — поэтому баннер, как и приглашение в канал
// рядом с ним, показывается всем один раз.
//
// Что здесь легко сломать молча:
//
//   * баннер перестаёт быть одноразовым и лезет при каждом запуске;
//   * «Не сейчас» закрывает баннер на этот раз, но не запоминает отказ;
//   * ссылка на бота открывается обычной вкладкой внутри Telegram — и там же
//     теряется контекст мини-приложения;
//   * ссылка ведёт не на того бота.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const BOT_URL = 'https://t.me/bibleiskie_bot';
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
  // 1. Первый запуск: баннер на месте, с иконкой, объяснением и обеими кнопками.
  await openMenu();
  check(await page.locator('#bot-start-promo').count() === 1, 'баннер про бота не показался при первом запуске');
  const art = page.locator('#bot-start-promo .channel-promo__art');
  check(await art.count() === 1, 'у баннера нет иконки');
  check(await art.evaluate((node) => node.complete && node.naturalWidth > 0).catch(() => false),
    'иконка баннера не загрузилась');
  check(await page.locator('[data-bot-start-open]').count() === 1, 'в баннере нет кнопки «Открыть бота»');
  check(await page.locator('[data-bot-start-later]').count() === 1, 'в баннере нет кнопки «Не сейчас»');
  const text = await page.locator('#bot-start-promo').innerText();
  for (const word of ['рассылки', 'техподдержки', 'оповещения']) {
    check(text.includes(word), `в тексте баннера нет слова «${word}» — не объяснено, зачем нужен бот`);
  }

  // 2. «Не сейчас» убирает баннер и запоминает отказ.
  await page.locator('[data-bot-start-later]').click();
  await page.waitForTimeout(500);
  check(await page.locator('#bot-start-promo').count() === 0, 'баннер не закрылся по «Не сейчас»');
  await openMenu();
  check(await page.locator('#bot-start-promo').count() === 0, 'баннер вернулся после перезапуска — он одноразовый');

  // 3. «Открыть бота» ведёт на правильный адрес средствами Telegram, а не
  // вкладкой браузера, и тоже закрывает баннер навсегда.
  await page.evaluate(() => localStorage.removeItem('bot_start_promo_seen_v1'));
  await openMenu();
  check(await page.locator('#bot-start-promo').count() === 1, 'после сброса памяти баннер не вернулся — проверять нечего');
  await page.locator('[data-bot-start-open]').click();
  await page.waitForTimeout(500);
  const opened = await page.evaluate(() => window.__openedTelegramLinks || []);
  check(opened.length === 1 && opened[0] === BOT_URL, `кнопка открыла «${opened.join(', ') || 'ничего'}» вместо «${BOT_URL}»`);
  check(await page.locator('#bot-start-promo').count() === 0, 'баннер не закрылся после «Открыть бота»');
  await openMenu();
  check(await page.locator('#bot-start-promo').count() === 0, 'после «Открыть бота» баннер показался снова');

  for (const crash of crashes) check(false, `страница поймала исключение: ${crash}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`Баннер «Начните диалог с ботом» не прошёл проверку (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Баннер «Начните диалог с ботом» в порядке: приходит один раз, объясняет, зачем нужен бот '
  + '(рассылки, техподдержка, оповещения), «Не сейчас» и «Открыть бота» запоминают отказ, '
  + 'а ссылка ведёт на настоящего бота средствами Telegram.');
