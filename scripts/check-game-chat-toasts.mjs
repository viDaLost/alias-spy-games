// Всплывающие сообщения чата — по просьбе игрока не отвлекаться на сам чат.
//
// Проверка гоняет модуль в собранном приложении, а не в отдельной песочнице:
// он приезжает в бандле, и «работает у меня в файле» здесь ничего не значит.
//
// Отдельно сверяется, что все три чата к нему подключены. Модуль может быть
// исправен и никем не вызван — со стороны игрока это ровно то же самое, что
// сломанный.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const failures = [];
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
]);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

// --- подключение чатов ----------------------------------------------------------

const WIRED = [
  ['web/js/quartet-chat-addon.js', 'quartet:'],
  ['web/games/bible-sketch.js', 'bible-sketch:'],
  ['web/games/spy-online.js', 'spy:'],
];
for (const [file, key] of WIRED) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (!source.includes('GameChatToasts?.sync')) failures.push(`${file} не отдаёт сообщения уведомлениям`);
  if (!source.includes('GameChatToasts?.reset')) failures.push(`${file} не убирает уведомления при выходе`);
  if (!source.includes(key)) failures.push(`${file} не помечает комнату ключом «${key}»`);
}

const sources = await import('./web-sources.mjs');
if (!sources.isBundled('web/js/game-chat-toasts.js')) failures.push('Модуль уведомлений не входит в бандл');
if (!sources.isBundled('web/styles/game-chat-toasts.css')) failures.push('Оформление уведомлений не входит в бандл');

if (failures.length) {
  console.error(`Chat toasts check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

// --- поведение в браузере -------------------------------------------------------

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(target).pipe(res);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
let browser;

const message = (id, playerId, text) => ({ id, playerId, name: playerId === 'me' ? 'Я' : 'Соседка', text, at: Date.now() });

try {
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { window.__APP_TELEMETRY_DISABLED__ = true; });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: 'window.Telegram={WebApp:{initData:"",initDataUnsafe:{},ready(){},expand(){}}};',
  }));
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }));
  }

  await page.goto(baseURL, { waitUntil: 'commit', timeout: 20_000 });
  await page.waitForFunction(() => Boolean(window.GameChatToasts), null, { timeout: 15_000 });

  const count = () => page.evaluate(() => document.querySelectorAll('.chat-toast').length);
  const sync = (options) => page.evaluate((value) => {
    window.__chatToastOpened = window.__chatToastOpened || 0;
    window.GameChatToasts.sync({ ...value, onOpen: () => { window.__chatToastOpened += 1; } });
  }, options);

  // 1. Первый список — это история комнаты, а не новости.
  await sync({ key: 'room', messages: [message('1', 'her', 'привет'), message('2', 'her', 'начинаем')], selfId: 'me' });
  check(await count() === 0, 'При входе в комнату всплыла история сообщений');

  // 2. Новое чужое сообщение всплывает и показывает, кто написал.
  await sync({ key: 'room', messages: [message('1', 'her', 'привет'), message('2', 'her', 'начинаем'), message('3', 'her', 'чья очередь?')], selfId: 'me' });
  check(await count() === 1, 'Новое сообщение не всплыло');
  const shown = await page.evaluate(() => document.querySelector('.chat-toast')?.textContent || '');
  check(shown.includes('Соседка') && shown.includes('чья очередь?'), `В уведомлении не то: «${shown}»`);

  // 3. Своё сообщение не всплывает: его только что отправили.
  await sync({ key: 'room', messages: [message('3', 'her', 'чья очередь?'), message('4', 'me', 'моя')], selfId: 'me' });
  check(await count() === 1, 'Всплыло собственное сообщение');

  // 4. Нажатие открывает чат и убирает карточку.
  await page.click('.chat-toast');
  await page.waitForTimeout(450);
  check(await page.evaluate(() => window.__chatToastOpened) === 1, 'Нажатие на уведомление не открыло чат');
  check(await count() === 0, 'Уведомление осталось на экране после нажатия');

  // 5. Пока чат на экране, уведомления не нужны — они повторяли бы видимое.
  await sync({ key: 'room', messages: [message('5', 'her', 'я вижу чат')], selfId: 'me', chatVisible: true });
  check(await count() === 0, 'Уведомление всплыло при открытом чате');

  // 6. Пачка сообщений разом не заслоняет игру.
  await sync({ key: 'room', messages: [6, 7, 8, 9, 10].map((n) => message(String(n), 'her', `реплика ${n}`)), selfId: 'me' });
  const many = await count();
  check(many === 3, `Пачка сообщений дала ${many} карточек вместо трёх`);
  const last = await page.evaluate(() => document.querySelector('.chat-toast:last-child')?.textContent || '');
  check(last.includes('реплика 10'), `Последним показано не самое свежее: «${last}»`);

  // 7. Карточка уходит сама, без единого нажатия.
  await page.waitForFunction(() => document.querySelectorAll('.chat-toast').length === 0, null, { timeout: 9_000 });

  // 8. Выход из игры забывает комнату целиком.
  await sync({ key: 'room', messages: [message('11', 'her', 'ещё одно')], selfId: 'me' });
  check(await count() === 1, 'После автоскрытия уведомления перестали появляться');
  await page.evaluate(() => window.GameChatToasts.reset('room'));
  check(await count() === 0, 'reset не убрал уведомления');
  check(await page.evaluate(() => !document.getElementById('game-chat-toasts')), 'reset оставил пустой контейнер в DOM');

  check(pageErrors.length === 0, `pageerror: ${pageErrors.join(' | ')}`);
  await context.close();
  console.log('OK: сообщения чата всплывают сверху — история при входе молчит, свои реплики не всплывают, '
    + 'при открытом чате уведомлений нет, пачка ограничена тремя, карточка уходит сама и открывает чат по нажатию; '
    + 'подключены все три игры с комнатами.');
} catch (error) {
  failures.push(error.message);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`Chat toasts check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
