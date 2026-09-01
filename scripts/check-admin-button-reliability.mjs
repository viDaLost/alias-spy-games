// Проверяет, что вход в админ-панель у подтверждённого администратора не
// зависит от везения.
//
// На это жаловались двумя симптомами, но причина у них общая — серверная
// проверка роли:
//
//   * кнопки нет. Создать её умеет только app.js, и делал он это один раз, по
//     Telegram-id, прочитанному на DOMContentLoaded. Telegram отдаёт id позже —
//     кнопки не будет уже никогда, потому что запасной путь её создания вёл к
//     window.renderAdminButton, а тот не был экспортирован;
//   * кнопка есть, но не открывается. Клик перехватывается проверкой роли, и
//     любой сбой связи считался отказом: панель не открывалась, а кнопка ещё и
//     пряталась — в том числе при каждом возврате в приложение, потому что
//     pageshow и visibilitychange перепроверяют роль принудительно.
//
// Обратная половина не менее важна: если сервер прямо отвечает «не админ»,
// кнопки быть не должно.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const ADMIN_ID = fs.readFileSync(path.join(root, 'web/js/app.js'), 'utf8').match(/const ADMIN_ID = "(\d+)"/)?.[1];
if (!ADMIN_ID) {
  console.error('Admin button check failed: в web/js/app.js не нашёлся id главного админа');
  process.exit(1);
}

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
  console.error(`Admin button check failed: ${message}`);
  process.exit(1);
};

/**
 * Открывает приложение от лица главного админа.
 * idDelayMs — через сколько Telegram отдаёт пользователя и initData.
 * role — что отвечает сервер на adminRoleStatus: 'admin', 'denied' или 'offline'.
 */
async function boot({ idDelayMs = 0, role = 'admin' } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { window.__APP_TELEMETRY_DISABLED__ = true; });
  const page = await context.newPage();

  const telegram = `(() => {
    const app = { initData: "", initDataUnsafe: {}, ready(){}, expand(){}, setHeaderColor(){}, setBackgroundColor(){},
      enableClosingConfirmation(){}, openTelegramLink(){}, disableVerticalSwipes(){},
      HapticFeedback: { impactOccurred(){}, notificationOccurred(){}, selectionChanged(){} } };
    window.Telegram = { WebApp: app };
    const fill = () => {
      app.initData = "user=%7B%22id%22%3A${ADMIN_ID}%7D&auth_date=1&hash=qa";
      app.initDataUnsafe = { user: { id: ${ADMIN_ID}, username: "root", first_name: "Root" } };
    };
    ${idDelayMs ? `setTimeout(fill, ${idDelayMs});` : 'fill();'}
  })();`;
  await page.route('https://telegram.org/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: telegram,
  }));

  const roleModes = { admin: 'admin', denied: 'denied', offline: 'offline' };
  const control = { mode: roleModes[role] || 'admin' };
  const answers = {
    admin: { success: true, isAdmin: true, isRoot: true, userId: ADMIN_ID },
    denied: { success: true, isAdmin: false, isRoot: false },
  };

  // Настоящий адрес запроса — не Apps Script: backend-bridge перехватывает fetch
  // и отправляет всё на Cloudflare Worker в /compat, завернув действие в payload.
  const answer = (route, value) => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(value),
  });
  const handle = (route) => {
    const raw = route.request().postData() || '';
    let action = '';
    try { action = JSON.parse(raw)?.payload?.action || JSON.parse(raw)?.action || ''; } catch {}
    if (action === 'adminRoleStatus') {
      if (control.mode === 'offline') return route.fulfill({ status: 502, contentType: 'text/plain', body: 'down' });
      return answer(route, answers[control.mode]);
    }
    if (action === 'getAdminData') {
      return answer(route, { success: true, users: [{ id: '1', username: 'qa', wowStars: 3, isBanned: false }] });
    }
    return answer(route, { success: true, isBanned: false, lastGames: [] });
  };
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**', 'https://*.workers.dev/**']) {
    await page.route(pattern, handle);
  }

  await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
  return { page, context, control };
}

/**
 * Кнопка считается доступной, только если её реально видно на экране.
 *
 * Системные пункты переехали из главного меню в раздел «Ещё», поэтому замер
 * идёт там же, куда за ними пойдёт человек: сначала открывается раздел, потом
 * проверяется, видно ли кнопку. Так инвариант остался прежним — администратор
 * доберётся до панели, — а не превратился в проверку конкретного места в меню.
 */
const buttonState = async (page) => {
  await page.evaluate(() => {
    if (!document.getElementById('more-screen')) document.getElementById('more-entry')?.click();
  });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const button = document.getElementById('admin-btn');
    if (!button) return { present: false, visible: false };
    const box = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      present: true,
      visible: !button.hidden && style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0,
    };
  });
};

// --- 1. Telegram отдаёт id с опозданием ---------------------------------------
{
  const { page, context } = await boot({ idDelayMs: 1200 });
  await page.waitForTimeout(5000);
  const state = await buttonState(page);
  if (!state.visible) {
    await fail(`при опоздании Telegram-id на 1200 мс кнопка админа ${state.present ? 'осталась скрытой' : 'не появилась'}`);
  }
  await page.evaluate(() => document.getElementById('admin-btn').click());
  await page.waitForTimeout(2500);
  const opened = await page.evaluate(() => ({
    mode: document.body.dataset.mode || '',
    text: (document.getElementById('game-container')?.innerText || '').replace(/\s+/g, ' ').slice(0, 90),
  }));
  if (opened.mode !== 'admin') await fail(`панель не открылась после опоздавшего id: режим «${opened.mode}», на экране «${opened.text}»`);
  await context.close();
}

// --- 2. Роль подтверждена, потом сервер замолчал -------------------------------
{
  const { page, context, control } = await boot();
  await page.waitForTimeout(3500);
  if (!(await buttonState(page)).visible) await fail('кнопка не появилась даже при исправном сервере');

  // Дальше сервер отвечает 502 — ровно как при обрыве связи в Telegram.
  control.mode = 'offline';
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await page.waitForTimeout(2000);
  if (!(await buttonState(page)).visible) {
    await fail('кнопка админа исчезла из-за одного неудачного запроса к серверу');
  }

  // Роль уже подтверждена сервером, поэтому вход открывается по последнему
  // известному статусу: сервер всё равно проверяет каждое привилегированное
  // действие, а прятать кнопку из-за обрыва связи нельзя.
  await page.evaluate(() => document.getElementById('admin-btn').click());
  await page.waitForTimeout(2500);
  const afterClick = await page.evaluate(() => ({
    visible: Boolean(document.getElementById('admin-btn')) && !document.getElementById('admin-btn').hidden,
    mode: document.body.dataset.mode || '',
  }));
  if (!afterClick.visible) await fail('после клика при молчащем сервере кнопка админа спряталась');
  if (afterClick.mode !== 'admin') {
    await fail(`подтверждённый админ не попал в панель при обрыве связи: режим «${afterClick.mode}»`);
  }
  await context.close();
}

// --- 4. Сервер молчит с самого начала: прав не было и не появилось ------------
{
  const { page, context } = await boot({ role: 'offline' });
  await page.waitForTimeout(3500);
  if ((await buttonState(page)).visible) {
    await fail('роль ни разу не подтверждалась, а кнопка админ-панели видна');
  }
  const broken = await page.evaluate(() => document.body.innerText.includes('Не удалось'));
  if (broken) await fail('молчащий сервер сломал главное меню');
  await context.close();
}

// --- 3. Сервер прямо отказал ----------------------------------------------------
{
  const { page, context } = await boot({ role: 'denied' });
  await page.waitForTimeout(3500);
  if ((await buttonState(page)).visible) {
    await fail('сервер ответил «не админ», а кнопка админ-панели всё равно видна');
  }
  await context.close();
}

// --- 5. Сервер не ответил на старте, потом ожил ---------------------------------
// Это и есть «кнопка появляется не всегда»: один неудачный запрос при запуске
// оставлял администратора без входа до перезапуска приложения, потому что
// повторной проверки не было вовсе.
{
  const { page, context, control } = await boot({ role: 'offline' });
  await page.waitForTimeout(2500);
  if ((await buttonState(page)).visible) await fail('кнопка появилась до подтверждения роли');

  control.mode = 'admin';
  await page.waitForTimeout(8000);
  if (!(await buttonState(page)).visible) {
    await fail('после восстановления связи кнопка админа сама не вернулась');
  }
  await context.close();
}

console.log('Вход в админ-панель надёжен: кнопка появляется даже при опоздавшем Telegram-id, '
  + 'переживает обрыв связи и по последнему подтверждённому статусу пускает в панель, '
  + 'сама возвращается, когда связь восстановилась, и её нет по явному «не админ».');

await browser.close();
server.close();
