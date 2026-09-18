// «Двенадцать колен» по сети — целиком, от кнопки до кнопки.
//
// Комнату как данные проверяет node --test в самом воркере, и там её гоняют
// без браузера. Здесь проверяется всё, что между: настоящий воркер с настоящим
// Durable Object, настоящее приложение и два настоящих телефона.
//
// Стережётся то, ради чего партию и перенесли на сервер:
//
//   * чужой руки не увидеть — ни в разметке, ни в состоянии вкладки;
//   * чужим ходом не походить, даже если попросить движок напрямую;
//   * лобби живое: второй игрок виден первому, переписка доходит обоим;
//   * партия начинается по нажатию хозяина и идёт у обоих разом;
//   * ушедший не вешает стол — за него ходит сервер.
//
// Воркер поднимается настоящий (wrangler dev --local): половина проверяемого
// живёт не в коде комнаты, а в устройстве — маршруты, подпись Telegram, сессия
// и то, что правила вообще запускаются там, где eval запрещён.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const dir = path.join(root, 'cloudflare/twelve-tribes-worker');
const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

const BOT_TOKEN = 'check-bot-token';
const SECRET = 'check-session-secret';

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

/*
  Подпись Telegram настоящая: воркер проверяет её по-честному, и обойти это
  проверке нельзя — иначе она проверяла бы не тот путь, которым ходят люди.
*/
function signInitData(user) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify(user),
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

// ——————————————————————————————————————————————— воркер

const workerPort = await freePort();
const appPort = await freePort();
const appOrigin = `http://127.0.0.1:${appPort}`;
const workerBase = `http://127.0.0.1:${workerPort}`;

/*
  Секреты кладутся рядом с воркером на время прогона: .dev.vars не уходит в
  репозиторий, а без него wrangler dev не знает ни ключа сессий, ни токена
  бота — и любой вход отвечал бы «не настроено».
*/
const devVars = path.join(dir, '.dev.vars');
fs.writeFileSync(devVars, [
  `SESSION_SECRET=${SECRET}`,
  `TELEGRAM_BOT_TOKEN=${BOT_TOKEN}`,
  `ALLOWED_ORIGINS=${appOrigin}`,
  'ALLOW_GUESTS=false',
  '',
].join('\n'));

/*
  Wrangler берётся свой, а если его не ставили — соседский: зависимости воркеров
  в репозиторий не уходят, и требовать npm install ради одной проверки значило
  бы не запускать её никогда.
*/
const wranglerPath = [
  path.join(dir, 'node_modules/.bin/wrangler'),
  path.join(root, 'cloudflare/promised-land-preview/node_modules/.bin/wrangler'),
  path.join(root, 'cloudflare/quartet-worker/node_modules/.bin/wrangler'),
].find((one) => fs.existsSync(one));

if (!wranglerPath) {
  console.error('Не нашёлся wrangler. Поставьте зависимости воркера: npm install в cloudflare/twelve-tribes-worker');
  fs.rmSync(devVars, { force: true });
  process.exit(1);
}

const worker = spawn(wranglerPath, ['dev', '--local', '--ip', '127.0.0.1', '--port', String(workerPort)], {
  cwd: dir,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let workerLog = '';
worker.stdout.on('data', (chunk) => { workerLog += chunk; });
worker.stderr.on('data', (chunk) => { workerLog += chunk; });
worker.on('error', (error) => { workerLog += `\nwrangler не запустился: ${error.message}`; });

const stop = () => {
  try { worker.kill('SIGTERM'); } catch { /* уже не жив */ }
  fs.rmSync(devVars, { force: true });
};
process.on('exit', stop);

async function waitForWorker() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${workerBase}/health`);
      if (response.ok) return true;
    } catch { /* ещё поднимается */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

if (!await waitForWorker()) {
  console.error('Воркер комнат не поднялся за минуту.');
  console.error(workerLog.split('\n').slice(-12).join('\n'));
  stop();
  process.exit(1);
}

// ——————————————————————————————————————————————— приложение

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end('нет такого файла');
    return;
  }
  let body = fs.readFileSync(file);
  // Адрес комнат подменяется на поднятый рядом воркер: проверка ходит к нему,
  // а не к живому серверу в интернете.
  if (file.endsWith('index.html')) {
    /*
      Заодно правится политика безопасности страницы: в живом приложении она
      разрешает только https://*.workers.dev, и это верно — поднятый рядом
      воркер живёт на 127.0.0.1, и без этой строчки браузер режет запрос ещё
      до сети. Правка здесь, в проверке, а не в приложении.
    */
    body = Buffer.from(String(body)
      .replace(/(<meta name="twelve-tribes-backend" content=")[^"]*(")/, `$1${workerBase}$2`)
      .replace(/connect-src ([^;"]+)/, `connect-src $1 ${workerBase} ws://127.0.0.1:${workerPort}`));
  }
  response.writeHead(200, {
    'Content-Type': mime.get(path.extname(file)) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  response.end(body);
});
await new Promise((resolve) => server.listen(appPort, '127.0.0.1', resolve));

// ——————————————————————————————————————————————— два телефона

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const errors = [];

async function openPlayer(user) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${user.first_name}: ${String(error?.message || error)}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`${user.first_name}: ${message.text()}`); });
  const initData = signInitData(user);
  await page.addInitScript(([data, info]) => {
    window.Telegram = {
      WebApp: {
        initData: data,
        initDataUnsafe: { user: info },
        ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
        MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
        HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
      },
    };
  }, [initData, user]);
  const stub = (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true, isBanned: false, lastGames: [], users: [],
      isAdmin: true, isRoot: true, role: 'owner', userId: String(user.id),
      answered: true, skip: true, eligible: false,
    }),
  });
  await page.route('https://telegram.org/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: 'window.Telegram=window.Telegram||{};',
  }));
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**',
    'https://*.workers.dev/**']) await page.route(pattern, stub);

  await page.goto(appOrigin, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    try { localStorage.setItem('game_rules_seen_v1', JSON.stringify({ 'twelve-tribes': Date.now() })); } catch { /* приват */ }
  });
  await page.waitForSelector('html.admin-rbac-root', { timeout: 15_000 });
  await page.evaluate(() => window.showGame('twelve-tribes'));
  await page.waitForSelector('.tt-setup [data-mode="online"]', { timeout: 20_000 });
  await page.locator('.tt-wrap [data-mode="online"]').click();
  await page.waitForSelector('.tt-wrap [data-create]', { timeout: 10_000 });
  return { context, page };
}

const hostUser = { id: 1288379477, first_name: 'Хозяин' };
const guestUser = { id: 555000111, first_name: 'Гость' };
const host = await openPlayer(hostUser);
const guest = await openPlayer(guestUser);

// ——— хозяин создаёт комнату ———
await host.page.locator('.tt-wrap [data-create]').click();
await host.page.waitForSelector('.tt-lobby', { timeout: 20_000 }).catch(async () => {
  const said = await host.page.evaluate(() => document.querySelector('.tt-wrap [data-message]')?.textContent || '');
  console.error(`Комната не создалась: «${said}»`);
  console.error(workerLog.split('\n').slice(-14).join('\n'));
  process.exit(1);
});
const code = (await host.page.locator('.tt-lobby h2').textContent() || '').replace(/\D+/g, '')
  || (await host.page.evaluate(() => document.querySelector('.tt-lobby h2').textContent.trim().split(' ').pop()));
const roomCode = await host.page.evaluate(() => document.querySelector('.tt-lobby h2').textContent.trim().split(' ').pop());
need(/^[A-Z0-9]{4,10}$/.test(roomCode), `код комнаты не похож на код: «${roomCode}» (${code})`);

// ——— гость входит по коду ———
await guest.page.locator('.tt-wrap [data-code]').fill(roomCode);
await guest.page.locator('.tt-wrap [data-join]').click();
await guest.page.waitForSelector('.tt-lobby', { timeout: 20_000 });

const seatsOf = (page) => page.evaluate(() => [...document.querySelectorAll('.tt-seat-name')]
  .map((one) => one.textContent.trim().replace(/\s+хозяин$/, '')));
await host.page.waitForFunction(() => document.querySelectorAll('.tt-seat').length === 2, null, { timeout: 15_000 })
  .catch(() => {});
need((await seatsOf(host.page)).length === 2, `хозяин видит ${(await seatsOf(host.page)).length} игроков вместо двоих`);
need((await seatsOf(guest.page)).length === 2, 'гость не видит хозяина за столом');

// ——— переписка доходит обоим ———
await guest.page.locator('.tt-wrap [data-chat-text]').fill('мир вам');
await guest.page.locator('.tt-wrap [data-chat-send]').click();
await host.page.waitForFunction(() => /мир вам/.test(document.querySelector('.tt-wrap [data-lines]')?.textContent || ''),
  null, { timeout: 10_000 }).catch(() => {});
const chatSeen = await host.page.evaluate(() => document.querySelector('.tt-wrap [data-lines]')?.textContent || '');
need(/мир вам/.test(chatSeen), `сообщение гостя не дошло до хозяина: «${chatSeen.slice(0, 60)}»`);
need(/Гость/.test(chatSeen), 'в переписке не видно, кто написал');

// ——— настройки меняет только хозяин ———
need(await guest.page.locator('.tt-wrap [data-bots]').count() === 0, 'гость видит настройки хозяина');
await host.page.locator('.tt-wrap [data-bots] button[data-value="1"]').click();
await host.page.waitForFunction(() => document.querySelector('.tt-wrap [data-bots] button[data-value="1"]')?.getAttribute('aria-pressed') === 'true',
  null, { timeout: 10_000 }).catch(() => {});

// ——— партия начинается по нажатию хозяина ———
need(await host.page.locator('.tt-wrap [data-start]').isDisabled(), 'сдавать можно, пока гость не готов');
await guest.page.locator('.tt-wrap [data-ready]').click();
await host.page.waitForFunction(() => !document.querySelector('.tt-wrap [data-start]')?.disabled, null, { timeout: 15_000 })
  .catch(() => {});
await host.page.locator('.tt-wrap [data-start]').click();
const dealt = async (page, who) => {
  await page.waitForSelector('.tt-hand .tt-card', { timeout: 20_000 }).catch(async () => {
    const said = await page.evaluate(() => ({
      message: document.querySelector('.tt-wrap [data-message]')?.textContent || '',
      head: document.querySelector('.tt-wrap h2')?.textContent || '',
      phase: window.TwelveTribesOnline?.current()?.view?.phase || 'нет вида',
    }));
    console.error(`${who}: карты не сдались — ${JSON.stringify(said)}`);
    console.error(workerLog.split('\n').slice(-12).join('\n'));
    process.exit(1);
  });
};
await dealt(host.page, 'хозяин');
await dealt(guest.page, 'гость');

const handOf = (page) => page.evaluate(() => window.TwelveTribesGame.state().players[0].hand.map((one) => one.id));
const tableOf = (page) => page.evaluate(() => {
  const state = window.TwelveTribesGame.state();
  return {
    players: state.players.length,
    others: state.players.slice(1).map((one) => one.hand.filter(Boolean).length),
    counts: state.players.map((one) => one.hand.length),
    turn: state.turn,
  };
});

const hostHand = await handOf(host.page);
const guestHand = await handOf(guest.page);
need(hostHand.length === 7 && guestHand.length === 7, `сдали ${hostHand.length} и ${guestHand.length} карт`);
const shared = hostHand.filter((id) => guestHand.includes(id));
need(shared.length === 0, `одна и та же карта у двоих: ${shared.join(', ')}`);

/*
  Чужая рука не приходит на телефон вовсе. Проверяется не разметка, а само
  состояние вкладки: в разметке чужих карт не видно и тогда, когда они пришли,
  — а пришли значит, что их прочитают.
*/
const seen = await tableOf(host.page);
need(seen.players === 3, `за столом ${seen.players} мест вместо троих (хозяин, гость и соперник от игры)`);
need(seen.others.every((many) => many === 0), `на телефон пришли чужие карты: ${seen.others.join(',')}`);
need(seen.counts.slice(1).every((many) => many === 7), `у соседей ${seen.counts.slice(1).join(',')} карт вместо семи`);

/*
  Чужим ходом не походить. Просьба уходит прямо в комнату, минуя кнопки, —
  ровно так сделал бы тот, кто открыл вкладку разработчика. Сервер обязан
  отказать, и на столе не должно измениться ничего.
*/
const whoWaits = seen.turn === 0 ? guest.page : host.page;
const waitingHand = seen.turn === 0 ? guestHand : hostHand;
const pileWas = await whoWaits.evaluate(() => window.TwelveTribesGame.state().pile.length);
await whoWaits.evaluate((card) => {
  window.TwelveTribesOnline.current().link.send('play', { card, camp: 'judah' });
}, waitingHand[0]);
await new Promise((resolve) => setTimeout(resolve, 1200));
const pileNow = await whoWaits.evaluate(() => window.TwelveTribesGame.state().pile.length);
const stillMine = await whoWaits.evaluate((card) => window.TwelveTribesGame.state()
  .players[0].hand.some((one) => one.id === card), waitingHand[0]);
need(pileNow === pileWas, 'чужой ход прошёл: сброс изменился не в свою очередь');
need(stillMine, 'карта ушла с руки, хотя ход был не наш');

// ——— ход одного виден другому ———
const mover = seen.turn === 0 ? host : guest;
const watcher = seen.turn === 0 ? guest : host;
const pileBefore = await watcher.page.evaluate(() => window.TwelveTribesGame.state().pile.length);
const live = mover.page.locator('.tt-hand .tt-card.is-live:not(.tt-card--wild)').first();
let moved = false;
if (await live.count()) {
  await live.click({ timeout: 5_000 }).catch(() => {});
  moved = true;
} else if (!(await mover.page.locator('[data-draw]').isDisabled())) {
  await mover.page.locator('[data-draw]').click({ timeout: 5_000 }).catch(() => {});
  moved = true;
}
need(moved, 'ходивший не смог ни положить карту, ни взять её');
await watcher.page.waitForFunction((was) => window.TwelveTribesGame.state().pile.length !== was
  || window.TwelveTribesGame.state().turn !== undefined, pileBefore, { timeout: 10_000 }).catch(() => {});
await new Promise((resolve) => setTimeout(resolve, 1200));
const watched = await watcher.page.evaluate(() => {
  const state = window.TwelveTribesGame.state();
  return { pile: state.pile.length, moves: state.moves };
});
need(watched.moves > 0, 'ход соседа не дошёл до второго телефона');

/*
  ——— оборвалась связь, а стол идёт ———

  Самый частый случай, а не самый редкий: человек свернул приложение, уехал в
  метро, потерял сеть. Остальные не должны на это смотреть — комната ждёт
  двадцать секунд и ходит за него сама.

  Связь рвётся именно у того, чей сейчас ход: обрыв у того, кто и так ждёт,
  ничего бы не проверил.
*/
const turnNow = await watcher.page.evaluate(() => window.TwelveTribesGame.state().turn);
const silent = turnNow === 0 ? watcher : mover;   // чей ход — тот и пропадает
const looker = turnNow === 0 ? mover : watcher;   // а этот смотрит, что будет
const movesBefore = await looker.page.evaluate(() => window.TwelveTribesGame.state().moves);
await silent.page.evaluate(() => window.TwelveTribesOnline.close());
await looker.page.waitForFunction((was) => window.TwelveTribesGame.state().moves > was,
  movesBefore, { timeout: 60_000, polling: 1000 }).catch(() => {});
const kept = await looker.page.evaluate(() => window.TwelveTribesGame.state().moves);
need(kept > movesBefore, `после обрыва связи стол замер: ходов было ${movesBefore}, стало ${kept}`);

await browser.close();
server.close();
stop();

need(errors.length === 0, `ошибки в консоли: ${errors.slice(0, 3).join(' | ')}`);

if (problems.length) {
  console.error(`«Двенадцать колен» по сети не прошли проверку (${problems.length}):`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log('OK: комната поднялась на настоящем воркере; хозяин создал её, гость вошёл по коду, '
  + 'оба видят друг друга и переписку; настройки у хозяина, партия начинается по его нажатию; '
  + 'каждому сдана своя рука и чужих карт на телефоне нет; чужим ходом не походить; '
  + 'ход одного доходит до другого, а ушедшего доигрывает сервер.');
