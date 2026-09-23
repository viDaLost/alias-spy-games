// Вход в веб-версии: «бот не может написать» — с рабочей ссылкой, а не текстом.
//
// Сервер уже умел отличать этот отказ от прочих (код BOT_START_REQUIRED,
// имя бота в ответе) — оставалось показать это тем, кто ошибку видит: раньше
// строка так и говорила «откройте @бота» без единой ссылки, и человеку без
// Telegram под рукой (а вход в веб-версию — это и есть человек без Telegram
// под рукой) приходилось искать бота вручную по имени.
//
// Что здесь легко сломать молча:
//
//   * ссылка пропадает, и снова остаётся текст без возможности нажать;
//   * ссылка ведёт не на того бота, если сервер вдруг вернул другое имя;
//   * ссылка открывает саму себя (навигация уводит из мини-приложения) вместо
//     новой вкладки;
//   * необъяснённое имя бота (не то, что цифробуквенное имя Telegram) рушит
//     разметку — сервер шлёт то, что сам собрал, а не то, что ввёл человек.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const BOT_USERNAME = 'bibleiskie_bot';
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
// Никакого window.Telegram: вход по коду показывается только вне Telegram,
// и настоящий человек с этой формой — именно такой гость.
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await context.newPage();
const crashes = [];
page.on('pageerror', (error) => crashes.push(String(error?.message || error)));

await page.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith(baseURL)) return route.continue();
  if (url.startsWith('https://telegram.org/')) return route.fulfill({ contentType: 'text/javascript', body: '' });
  if (url.includes('/android/auth/request')) {
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        code: 'BOT_START_REQUIRED',
        requiresBotStart: true,
        botUsername: BOT_USERNAME,
        error: 'Бот пока не может написать вам. Откройте бота, нажмите Start и запросите код ещё раз.',
      }),
    });
  }
  let body = {};
  try { body = route.request().postDataJSON() || {}; } catch { /* не наш запрос */ }
  const action = String((body.payload || body).action || '');
  let response = { success: true, isBanned: false, lastGames: [], rooms: [], answered: true };
  if (action === 'adminRoleStatus') response = { success: true, isRoot: false, isAdmin: false, userId: '' };
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
});

try {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });

  await page.evaluate(() => window.WebSession?.open?.());
  await page.waitForSelector('#web-session-overlay #ws-login-id', { timeout: 10_000 });
  await page.locator('#ws-login-id').fill('123456789');
  await page.locator('[data-ws-request]').click();

  const errorNode = page.locator('[data-ws-error]');
  await errorNode.waitFor({ state: 'visible', timeout: 10_000 });
  check(!(await errorNode.evaluate((node) => node.hidden)), 'сообщение об ошибке не показалось вовсе');

  const link = errorNode.locator('a[data-ws-bot-link]');
  check(await link.count() === 1, 'в сообщении об ошибке нет ссылки на бота — только текст, как раньше');
  const href = await link.getAttribute('href').catch(() => '');
  check(href === `https://t.me/${BOT_USERNAME}`, `ссылка ведёт на «${href}» вместо «https://t.me/${BOT_USERNAME}»`);
  const target = await link.getAttribute('target').catch(() => '');
  check(target === '_blank', 'ссылка открывается в текущей вкладке — уводит из приложения');

  const text = await errorNode.innerText();
  for (const word of ['рассылки', 'техподдержки', 'оповещения']) {
    check(text.includes(word), `в сообщении об ошибке нет слова «${word}» — не объяснено, зачем нужен бот`);
  }

  for (const crash of crashes) check(false, `страница поймала исключение: ${crash}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`Ссылка на бота при отказе входа не прошла проверку (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Отказ входа «бот не может написать» ведёт делом, а не только словом: ссылка настоящая, открывается новой '
  + 'вкладкой и объясняет, зачем боту вообще писать — рассылки, техподдержка, оповещения.');
