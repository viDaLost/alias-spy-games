// Ошибки, которых на самом деле не было.
//
// В списке ошибок администратора за день набегали сотни записей трёх видов, и
// ни одна из них не была поломкой:
//
//   * unhandled-promise CLIENT_RECONNECT_BACKOFF и CLIENT_BACKGROUND_PAUSE —
//     это бюджет запросов придержал обращение к воркеру, как и задумано;
//   * console-error «API Error» — обрыв связи на мобильной сети;
//   * они же приходили необработанным отказом, потому что обработчик нажатий
//     писал «return createRoom(target)» внутри try: промис из try не ждут, и
//     catch, который должен был показать человеку причину, уже пройден.
//
// Настоящих поломок за этими сотнями было не видно. Проверка следит за тем, что
// они не вернутся, и заодно за поведением, которое из-за них скрывалось: вход в
// комнату, отложенный бюджетом, не должен терять саму комнату, а возвращение
// приложения на экран — восстанавливать связь.

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

// --- источники ------------------------------------------------------------------

for (const [file, name] of [['web/games/quartet.js', 'Квартет'], ['web/games/bible-sketch.js', 'Библейский художник']]) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  // Комментарии выкидываем: в них эта же строка приведена как пример беды.
  const dispatcher = source
    .slice(source.indexOf("addEventListener('click', async"), source.indexOf('showToast(String(error?.message || error)'))
    .replace(/\/\/[^\n]*/g, '');
  const bare = [...dispatcher.matchAll(/return (?!await\b)([a-zA-Z][\w.]*)\(/g)].map((match) => match[1]);
  if (bare.length) failures.push(`${name}: в обработчике нажатий «return ${bare[0]}(...)» без await — отказ уйдёт мимо catch`);
  if (!source.includes("headers.get('X-Client-Backoff')")) failures.push(`${name} не отличает отложенный запрос от неудачного`);
  if (!source.includes('clientBackoff')) failures.push(`${name} теряет пометку отложенного запроса`);
  if (!source.includes("document.addEventListener('visibilitychange', onVisible)")) failures.push(`${name} не восстанавливает связь при возвращении на экран`);
}
const errors = fs.readFileSync(path.join(root, 'web/js/error-system.js'), 'utf8');
if (!/CLIENT_RECONNECT_BACKOFF\|CLIENT_BACKGROUND_PAUSE/.test(errors)) {
  failures.push('error-system снова считает решения бюджета запросов ошибками приложения');
}

if (failures.length) {
  console.error(`Room backoff check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

// --- поведение в браузере -------------------------------------------------------

const QUARTET = 'https://alias-spy-games-quartet.vitaledanilov.workers.dev';

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

try {
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  await context.addInitScript(() => {
    window.__APP_TELEMETRY_DISABLED__ = true;
    window.__rejections = [];
    window.addEventListener('unhandledrejection', (event) => {
      window.__rejections.push(String(event.reason?.message || event.reason));
    });
    // Свёрнутым приложение считает себя по document.hidden — им и управляем.
    window.__hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__hidden ? 'hidden' : 'visible') });
    // Комната живёт по WebSocket, поднять его в проверке нечем: подменяем на
    // сокет, который сразу «открылся» и молчит. Проверяется вход в комнату, а
    // не обмен состояниями.
    class FakeSocket extends EventTarget {
      constructor() { super(); this.readyState = 1; window.__sockets = (window.__sockets || 0) + 1; setTimeout(() => this.dispatchEvent(new Event('open')), 0); }
      send() {}
      close() { this.readyState = 3; }
    }
    FakeSocket.OPEN = 1; FakeSocket.CONNECTING = 0; FakeSocket.CLOSED = 3;
    window.WebSocket = FakeSocket;
    localStorage.setItem('game_rules_seen_v1', JSON.stringify({ quartet: 1 }));
    localStorage.setItem('quartet_v2_player_name', 'Проверка');
  });

  const page = await context.newPage();
  await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8',
    body: 'window.Telegram={WebApp:{initData:"",initDataUnsafe:{user:{id:4242}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},disableClosingConfirmation(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};',
  }));
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**', 'https://alias-spy-games-core.vitaledanilov.workers.dev/**']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"ok":true}' }));
  }

  let joinCalls = 0;
  let joinStatus = 200;
  await page.route(`${QUARTET}/rooms/*/join`, (route) => {
    joinCalls += 1;
    if (joinStatus !== 200) return route.fulfill({ status: joinStatus, contentType: 'application/json', body: '{"ok":false,"error":"Комната закрыта"}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"sessionToken":"t","roomId":"TEST12"}' });
  });
  await page.route(`${QUARTET}/rooms`, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"Сервер занят"}' }));

  const openQuartet = async () => {
    await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 15_000 });
    await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'), null, { timeout: 15_000 });
    await page.evaluate(() => window.showGame('quartet'));
    await page.waitForSelector('#qv2-root', { timeout: 15_000 });
  };

  // 1. Беда в нажатии доходит до человека, а не до администратора.
  await page.goto(baseURL, { waitUntil: 'commit', timeout: 20_000 });
  await openQuartet();
  await page.waitForSelector('[data-action="create"]', { timeout: 10_000 });
  await page.click('[data-action="create"]');
  await page.waitForTimeout(800);
  const toast = await page.evaluate(() => document.querySelector('.qv2-toast')?.textContent || '');
  check(/Сервер занят/.test(toast), `Отказ сервера не показан человеку: «${toast}»`);
  const afterClick = await page.evaluate(() => window.__rejections);
  check(afterClick.length === 0, `Отказ ушёл мимо catch: ${afterClick.join(' | ')}`);

  // 2. Свёрнутое приложение: вход откладывается, комната не теряется.
  joinCalls = 0;
  await page.evaluate(() => {
    localStorage.setItem('quartet_v2_room_id', 'TEST12');
    window.__hidden = true;
  });
  await page.goto(baseURL, { waitUntil: 'commit', timeout: 20_000 });
  await page.evaluate(() => { window.__hidden = true; });
  await openQuartet();
  await page.waitForTimeout(1200);
  check(joinCalls === 0, `Свёрнутое приложение всё же пошло в сеть: ${joinCalls}`);
  const kept = await page.evaluate(() => localStorage.getItem('quartet_v2_room_id'));
  check(kept === 'TEST12', `Отложенный вход стёр комнату: ${kept}`);
  const hiddenRejections = await page.evaluate(() => window.__rejections);
  check(hiddenRejections.length === 0, `Отказ бюджета всплыл как ошибка: ${hiddenRejections.join(' | ')}`);

  // 3. Возвращение на экран восстанавливает связь само.
  await page.evaluate(() => {
    window.__hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => document.querySelector('#qv2-root')?.textContent?.includes('Комната') || false, null, { timeout: 10_000 })
    .catch(() => {});
  check(joinCalls === 1, `Возвращение на экран не вернуло в комнату: запросов ${joinCalls}`);
  const finalRejections = await page.evaluate(() => window.__rejections);
  check(finalRejections.length === 0, `Необработанные отказы: ${finalRejections.join(' | ')}`);

  await context.close();
  console.log('OK: решения бюджета запросов больше не ошибки — беда в нажатии доходит до человека, '
    + 'свёрнутое приложение не ходит в сеть и не теряет комнату, а возвращение на экран само восстанавливает связь.');
} catch (error) {
  failures.push(error.message);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`Room backoff check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
