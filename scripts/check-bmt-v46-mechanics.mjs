// Проверяет две новые механики «Библейских сокровищ» и эффекты особых фишек.
//
// До этого в игре было три препятствия одного рода: скрижали, цепи и
// светильники — все стоят на месте и ждут, пока по ним попадут. Добавлены
//
//   * тернии — единственное препятствие, которое разрастается само;
//   * ковчег — фишка, которую нельзя двигать: её опускают, убирая фишки
//     снизу, и засчитывают, когда она дойдёт до нижнего ряда.
//
// Обе легко сломать молча: ковчег на закрытой клетке фигурного поля просто не
// появится, а тернии перестанут расти, если сбросить счётчик ходов. Поэтому
// здесь игра действительно открывается в браузере и проходится руками.
//
// Заодно проверяется, что новые анимации доехали до CSS: эффект, у которого
// animation-name разрешился в none, — это невидимая пустышка.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'], ['.obj', 'text/plain'],
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
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { window.__APP_TELEMETRY_DISABLED__ = true; });
const page = await context.newPage();

const fail = async (message) => {
  await browser.close();
  server.close();
  console.error(`Проверка механик v46 не прошла: ${message}`);
  process.exit(1);
};
const expect = async (condition, message) => { if (!condition) await fail(message); };

await page.route('https://telegram.org/**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: 'window.Telegram={WebApp:{initData:"",initDataUnsafe:{user:{id:999999,username:"qa",first_name:"QA"}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},disableVerticalSwipes(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};',
}));
const gas = JSON.stringify({ success: true, isBanned: false, wowStars: 20, wsStars: 0, swLevel: 0, lastGames: [] });
for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: gas }));
}
await page.route('https://*.workers.dev/**', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: '{"ok":true}' }));

await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(2000);

// Открытые уровни, звёзды на бустеры и уже просмотренное обучение: иначе карта
// упрётся в первый уровень, а поверх поля ляжет туториал.
await page.evaluate(async () => {
  await window.openBiblicalMatchThree();
  const Progress = window.BiblicalMatchThreeProgress;
  const progress = Progress.load();
  progress.unlocked = 50;
  progress.tutorialSeen = { 'v18-first-run': true };
  Progress.save(progress);
  Progress.setStars(400, 'qa');
});
await page.waitForTimeout(500);
// Второй заход уже с открытой картой.
await page.evaluate(() => window.openBiblicalMatchThree());
await page.waitForSelector('.bmt-map-node, .bmt-journey-node', { state: 'attached', timeout: 20_000 });

const openLevel = async (title) => {
  const clicked = await page.evaluate((name) => {
    const node = [...document.querySelectorAll('.bmt-map-node, .bmt-journey-node, .bmt-v13-level')]
      .find((item) => item.textContent.includes(name) && !item.disabled);
    if (!node) return false;
    node.click();
    return true;
  }, title);
  if (!clicked) await fail(`на карте нет открытого уровня «${title}»`);
  await page.waitForSelector('.bmt-prelevel', { timeout: 10_000 });
  await page.evaluate(() => [...document.querySelectorAll('.bmt-prelevel__actions button')]
    .find((node) => node.textContent.includes('Начать'))?.click());
  await page.waitForSelector('.bmt-board', { timeout: 10_000 });
  await page.waitForTimeout(900);
};

// --- Ковчег -------------------------------------------------------------------
await openLevel('Ковчег в пути');

const ark = await page.evaluate(() => ({
  relics: [...document.querySelectorAll('.bmt-tile.is-relic')].map((tile) => Number(tile.dataset.index)),
  gates: document.querySelectorAll('.bmt-tile.is-relic-gate').length,
  gate: document.querySelectorAll('.bmt-board.has-relic-gate').length,
  goals: [...document.querySelectorAll('.bmt-goal')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
}));

await expect(ark.relics.length === 1, `на уровне «Ковчег в пути» ожидался один ковчег, найдено ${ark.relics.length}`);
await expect(ark.gate === 1 && ark.gates === 8, `ворота ковчега не размечены: доска ${ark.gate}, клеток ${ark.gates}`);
await expect(ark.goals.some((text) => text.includes('Опустить ковчег')), `цели уровня не показывают ковчег: ${ark.goals.join(' | ')}`);

// Ковчег не двигают руками — по нему нельзя даже выбрать ход.
await page.evaluate((index) => document.querySelector(`.bmt-tile[data-index="${index}"]`)?.click(), ark.relics[0]);
await page.waitForTimeout(300);
const refusal = await page.evaluate(() => ({
  toast: document.querySelector('.bmt-toast')?.textContent || '',
  selected: document.querySelectorAll('.bmt-tile.is-selected').length,
}));
await expect(/Ковчег не двигают/.test(refusal.toast), `тапом по ковчегу игра не объясняет отказ: «${refusal.toast}»`);
await expect(refusal.selected === 0, 'ковчег выделился как обычная фишка');

// «Посох Моисея» очищает столбец — ковчег падает в ворота и засчитывается.
const column = ark.relics[0] % 8;
// Баланс звёзд принадлежит всему приложению: setStars шлёт app:stars-changed,
// и общий кошелёк тут же возвращает серверный ноль. Поэтому для проверки
// баланс кладётся прямо в хранилище игры, без события.
await page.evaluate(() => localStorage.setItem(window.BiblicalMatchThreeProgress.starsKey(), '400'));
await page.waitForTimeout(200);
await page.evaluate(() => document.querySelector('[data-booster="staff"]')?.click());
await page.waitForTimeout(250);
await page.evaluate((col) => {
  const rows = Number(document.querySelector('.bmt-board').dataset.rows);
  document.querySelector(`.bmt-tile[data-index="${(rows - 1) * 8 + col}"]`)?.click();
}, column);
await page.waitForTimeout(2600);

const delivered = await page.evaluate(() => ({
  goals: [...document.querySelectorAll('.bmt-goal')].map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
  relics: document.querySelectorAll('.bmt-tile.is-relic').length,
}));
const deliverGoal = delivered.goals.find((text) => text.includes('Опустить ковчег')) || '';
await expect(/1\/1/.test(deliverGoal), `ковчег не дошёл до ворот: «${deliverGoal}»`);
await expect(delivered.relics === 0, 'доставленный ковчег остался на доске');

// --- Эффекты особых фишек ------------------------------------------------------
// Каждая новая анимация должна не только создать узел, но и получить из CSS
// настоящее имя анимации: правило, до которого стили не доехали, даёт none.
const fx = await page.evaluate(() => {
  const FX = window.BiblicalMatchThreeEffects;
  const layer = document.querySelector('.bmt-fx-layer') || document.querySelector('.bmt-board');
  const before = layer.querySelectorAll('i, div').length;
  FX.trumpet(20, 'h');
  FX.lightBurst(21);
  FX.covenant(22, [23, 24, 25]);
  FX.forge(26, 'rainbow');
  FX.relicLanded(27);
  FX.vineSprout(28);
  FX.boardShake('hard');
  const live = document.querySelector('.bmt-fx-layer');
  const named = (selector) => {
    const node = live?.querySelector(selector);
    return node ? getComputedStyle(node).animationName : 'нет узла';
  };
  return {
    grew: live.querySelectorAll('i, div').length > before,
    quaking: document.querySelector('.bmt-board').classList.contains('is-quaking-hard'),
    blast: named('.bmt-fx-blast'),
    halo: named('.bmt-fx-trumpet-halo'),
    flash: named('.bmt-fx-flash'),
    ray: named('.bmt-fx-ray'),
    sweep: named('.bmt-fx-covenant-sweep'),
    arc: named('.bmt-fx-covenant-arc'),
    forge: named('.bmt-fx-forge'),
    pillar: named('.bmt-fx-pillar'),
    sprout: named('.bmt-fx-vine-sprout'),
  };
});

await expect(fx.grew, 'ни один новый эффект не добавил узлов на слой');
await expect(fx.quaking, 'доска не тряхнулась на самом сильном эффекте');
for (const [name, value] of Object.entries(fx)) {
  if (name === 'grew' || name === 'quaking') continue;
  await expect(value && value !== 'none' && value !== 'нет узла', `эффект ${name}: animation-name = ${value}`);
}

// Тряска не должна оставлять на доске остаточный transform: с ним доска
// становится содержащим блоком для любого position:fixed внутри неё.
await page.waitForTimeout(900);
const settled = await page.evaluate(() => getComputedStyle(document.querySelector('.bmt-board')).transform);
await expect(settled === 'none', `после тряски на доске остался transform: ${settled}`);

// --- Тернии ---------------------------------------------------------------------
await page.evaluate(() => document.querySelector('.bmt-gamebar .bmt-icon-button')?.click());
await page.waitForTimeout(400);
await page.evaluate(() => [...document.querySelectorAll('.bmt-pause-card button')]
  .find((node) => node.textContent.includes('В меню'))?.click());
await page.waitForSelector('.bmt-map-node, .bmt-journey-node', { state: 'attached', timeout: 10_000 });

await openLevel('Первая поросль');

const vines = await page.evaluate(() => {
  const Rules = window.BiblicalMatchThreeV20Rules;
  const count = () => document.querySelectorAll('.bmt-tile.has-vine').length;
  const seeded = count();
  // Интервал роста на этом уровне — три хода: два вызова ничего не меняют.
  Rules.spreadVines();
  Rules.spreadVines();
  const waiting = count();
  Rules.spreadVines();
  return { seeded, waiting, grown: count(), sprout: document.querySelectorAll('.bmt-fx-vine-sprout').length };
});

await expect(vines.seeded === 6, `на уровне «Первая поросль» ожидалось 6 терний, найдено ${vines.seeded}`);
await expect(vines.waiting === 6, `тернии разрослись раньше своего интервала: ${vines.waiting}`);
await expect(vines.grown === 7, `тернии не разрослись за свой интервал: ${vines.grown}`);
await expect(vines.sprout === 1, 'разрастание прошло без анимации');

console.log('Механики v46 в порядке: ковчег опускается в ворота и не двигается руками, '
  + `тернии разрастаются строго по своему интервалу (${vines.seeded} → ${vines.grown}), `
  + 'все новые эффекты особых фишек получают анимацию из CSS и не оставляют transform на доске.');

await browser.close();
server.close();
