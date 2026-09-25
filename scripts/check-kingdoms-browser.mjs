// «Царства» на телефоне: карта открывается пальцем.
//
// Счётный прогон рядом (check-kingdoms.mjs) доказывает правила — но их можно
// доказать и на пустом экране. Здесь проверяется другое: что игра открывается
// из меню, что карту видно и по ней можно попасть пальцем, что соперники от
// игры ходят сами, и что при этом ничего не вылезает за край и не падает в
// консоль — ни в вертикальной, ни в горизонтальной ориентации.
//
// И отдельно — замок. Игра идёт обкатку и открыта только главному
// администратору: у всех остальных карточки в меню нет, а прямой вызов
// showGame отвечает отказом.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
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
  response.writeHead(200, {
    'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  response.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || chromium.executablePath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const problems = [];

/*
  Расстановка и тайная цель — до первого хода: человек нажимает свободную
  область и подтверждает, соперники от игры ходят сами; карточку с двумя
  целями закрывает выбор первой.
*/
async function finishSetup(page) {
  for (let i = 0; i < 160; i += 1) {
    const ready = await page.evaluate(() => {
      const board = window.KingdomsGame?.board;
      if (!board?.view) return false;
      document.querySelector('[data-objective-pick]')?.click();
      if (board.view.phase === 'planning' && board.view.turn === board.you) return true;
      if (board.view.phase === 'setup' && board.view.turn === board.you) {
        const free = document.querySelector('[data-area].is-eligible');
        if (free) { board.tapArea(free.dataset.area); document.querySelector('[data-confirm-ok]')?.click(); }
      }
      return false;
    });
    if (ready) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

const need = (condition, message) => { if (!condition) problems.push(message); };

/*
  page.addInitScript сериализует функцию в текст и выполняет её заново в
  чужом контексте страницы — замыкание на userId/name снаружи в этот текст
  не попадает, и обращение к ним обернулось бы ReferenceError внутри
  страницы. Поэтому значения идут вторым аргументом (Playwright сам
  подставляет их параметром), а не через замыкание.
*/
function telegramStub({ userId, name }) {
  window.Telegram = {
    WebApp: {
      initData: `user=%7B%22id%22%3A${userId}%7D&hash=qa`,
      initDataUnsafe: { user: { id: userId, first_name: name } },
      ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
}

async function roleContext({ width, height, admin }) {
  const context = await browser.newContext({
    viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.addInitScript(telegramStub, {
    userId: admin ? 1288379477 : 777000,
    name: admin ? 'Тест' : 'Гость',
  });
  const roleBody = JSON.stringify({
    success: true, isBanned: false, lastGames: [], users: [],
    isAdmin: admin, isRoot: admin, role: admin ? 'owner' : 'none', userId: admin ? '1288379477' : '777000',
    answered: true, skip: true, eligible: false,
  });
  await page.route('https://telegram.org/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: 'window.Telegram=window.Telegram||{};',
  }));
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**',
    'https://*.workers.dev/**']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: roleBody }));
  }
  await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
  await page.evaluate(() => {
    try {
      localStorage.setItem('game_rules_seen_v1', JSON.stringify({ kingdoms: Date.now() }));
      // Здесь проверяется плоская карта; объёмную проверяет check-kingdoms-3d.mjs.
      localStorage.setItem('kingdoms_view_v1', '2d');
    } catch { /* приватный режим */ }
  });
  return { context, page, errors };
}

/*
  Замок. Обычный человек не видит карточку в меню и не попадает в игру даже
  прямым вызовом showGame — вместо стола он получает отказ и кнопку в меню.
*/
async function locked() {
  const { context, page } = await roleContext({ width: 390, height: 844, admin: false });
  await page.waitForTimeout(2000);
  const seen = await page.evaluate(() => {
    const card = document.querySelector('[onclick*="kingdoms"]');
    return {
      exists: Boolean(card),
      shown: card ? getComputedStyle(card).display !== 'none' : false,
      root: document.documentElement.classList.contains('admin-rbac-root'),
      others: document.querySelectorAll('[onclick*="quartet"]').length,
    };
  });
  need(!seen.root, 'обычному человеку выдали роль главного администратора');
  need(seen.others > 0, 'у обычного человека пропали и прочие игры — дело не в замке');
  need(!seen.shown, 'карточка «Царств» видна тому, кому игра ещё не открыта');

  await page.evaluate(() => window.showGame('kingdoms'));
  await page.waitForTimeout(1500);
  const refused = await page.evaluate(() => ({
    text: document.getElementById('game-container')?.innerText || '',
    map: document.querySelectorAll('.kd-map').length,
  }));
  need(/ещё не открыта/i.test(refused.text), `прямой вызов игры не отказал: «${refused.text.slice(0, 60)}»`);
  need(refused.map === 0, 'по прямому вызову карта всё-таки открылась');
  await context.close();
}

/** Партия на экране заданного размера. */
async function play(width, height) {
  const { context, page, errors } = await roleContext({ width, height, admin: true });
  await page.waitForSelector('html.admin-rbac-root', { timeout: 15_000 });
  const card = page.locator('[onclick*="kingdoms"]').first();
  need(await card.isVisible(), 'у главного администратора карточка игры не видна');
  await card.click();

  await page.waitForSelector('[data-start]', { timeout: 20_000 });
  await page.locator('[data-tutorial]').click();
  await page.waitForSelector('[data-teach]:not([hidden])');
  need(await page.locator('.kd-area.is-demo-focus').count() > 0, 'обучение не выделяет область карты');
  for (let step = 2; step <= 5; step += 1) await page.locator('[data-teach-next]').click();
  const teaching = await page.evaluate(() => ({
    step: document.querySelector('[data-teach-count]')?.textContent,
    chips: document.querySelectorAll('.kd-teach-chip').length,
    motion: getComputedStyle(document.querySelector('.kd-token.is-demo-travel')).animationName,
    spill: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    saved: localStorage.getItem('kd_campaign_v4'),
  }));
  need(teaching.step === '5 / 12' && teaching.chips === 6, 'показ руки или шага похода неполон');
  need(teaching.motion.includes('kd-demo-march'), 'жетон похода не анимирован');
  need(teaching.spill === 0, `обучение шире экрана на ${teaching.spill}px (${width}×${height})`);
  need(teaching.saved === null, 'обучение создало игровое сохранение');
  if (process.env.KINGDOMS_SCREENSHOTS && width === 390) {
    fs.mkdirSync(process.env.KINGDOMS_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.KINGDOMS_SCREENSHOTS, 'kingdoms-tutorial.png'), fullPage: true });
  }
  await page.locator('[data-teach-skip]').click();
  await page.waitForSelector('[data-start]');
  await page.locator('[data-count] button[data-value="2"]').click();
  await page.locator('[data-start]').click();
  await page.waitForSelector('[data-area]', { timeout: 10_000 });
  need(await finishSetup(page), 'расстановка не дошла до первого хода человека');

  // ——— карта нарисована целиком ———
  const board = await page.evaluate(() => ({
    areas: document.querySelectorAll('[data-area]').length,
    orders: document.querySelectorAll('[data-order]:not([hidden])').length,
    cards: document.querySelectorAll('[data-card]:not([hidden])').length,
    regions: document.querySelectorAll('.kd-region').length,
  }));
  need(board.areas === 24, `на карте ${board.areas} областей вместо 24`);
  need(board.orders >= 2 && board.orders <= 6, `в руке ${board.orders} видов жетонов — а их от двух до шести`);
  need(board.cards >= 2, `в ленте ${board.cards} карт — соглядатаи и пророк должны быть видны`);
  need(board.regions === 6, `на карте ${board.regions} регионов вместо 6`);
  const ownership = await page.evaluate(() => {
    const owned = document.querySelector('.kd-area:not(.is-neutral)');
    const fill = owned?.querySelector('.kd-area-fill');
    const border = owned?.querySelector('.kd-area-ring');
    return { tint: Number.parseFloat(getComputedStyle(fill).fillOpacity),
      border: Number.parseFloat(getComputedStyle(border).strokeWidth) };
  });
  need(ownership.tint >= .3 && ownership.border >= 4, 'цвет территории или граница слабо видны');

  /*
    ——— область и связь нажимаются пальцем ———
    Область — круг диаметром не меньше пальца; связь размещения приказа
    подсвечивается, и по ней можно попасть нажатием, а не только мышью
    по волосяной линии.
  */
  const areaSize = await page.evaluate(() => {
    const box = document.querySelector('[data-area]').getBoundingClientRect();
    return { w: Math.round(box.width), h: Math.round(box.height) };
  });
  need(areaSize.w >= 40 && areaSize.h >= 40, `область на карте ${areaSize.w}×${areaSize.h} — меньше пальца`);

  const attackKind = await page.evaluate(() => ['march1', 'march2', 'march3', 'march4', 'march5', 'feint']
    .find((kind) => { const b = document.querySelector(`[data-order="${kind}"]`); return b && !b.hidden && !b.disabled; }));
  need(Boolean(attackKind), 'в стартовой руке нет доступного боевого жетона');
  if (attackKind) await page.locator(`[data-order="${attackKind}"]`).click();
  await page.waitForTimeout(150);
  const eligible = await page.evaluate(() => document.querySelectorAll('.kd-edge.is-eligible').length);
  need(eligible > 0, 'после выбора боевого жетона ни одна связь не подсветилась');
  if (eligible > 0) {
    await page.evaluate(() => document.querySelector('.kd-edge.is-eligible').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(150);
    const confirmVisible = await page.evaluate(() => {
      const bar = document.querySelector('[data-confirm]');
      return bar && getComputedStyle(bar).display !== 'none';
    });
    need(confirmVisible, 'после нажатия на связь панель подтверждения не появилась');
    if (confirmVisible) {
      await page.locator('[data-confirm-ok]').click();
      await page.waitForTimeout(400);
      const stillOpen = await page.evaluate(() => {
        const bar = document.querySelector('[data-confirm]');
        return bar && getComputedStyle(bar).display !== 'none';
      });
      need(!stillOpen, 'панель подтверждения осталась открытой после подтверждения приказа');
      const token = await page.evaluate(() => [...document.querySelectorAll('.kd-token.is-mine .kd-token-face')]
        .map((one) => Math.round(one.getBoundingClientRect().width)));
      need(token.length && Math.max(...token) >= 26, `жетон войск слишком мал на телефоне: ${token.join(', ')}`);
    }
  }

  /*
    ——— область можно открыть подробно, не размещая приказ ———
    Первая по разметке область — не обязательно первая на экране: наезд
    касания уводит края карты за рамку, и это правильно, для них есть
    панорама. Проверке нужна область, которая видна прямо сейчас, — берём ту,
    что ближе всего к центру экрана.
  */
  await page.evaluate(() => document.querySelectorAll('[data-order].is-active').forEach((b) => b.click()));
  await page.waitForTimeout(100);
  const visibleArea = await page.evaluate(() => {
    // Видимость решает рамка .kd-map-scroll (у неё overflow:hidden), а не всё
    // окно: за пределами окна ничего и так нет, а за пределами этой рамки —
    // обрезанный собственным контейнером кусок карты.
    const frame = document.querySelector('[data-scroll]').getBoundingClientRect();
    const cx = frame.x + frame.width / 2;
    const cy = frame.y + frame.height / 2;
    let best = null;
    let bestDist = Infinity;
    for (const node of document.querySelectorAll('[data-area]')) {
      const box = node.getBoundingClientRect();
      if (box.right < frame.left || box.left > frame.right || box.bottom < frame.top || box.top > frame.bottom) continue;
      const dist = Math.hypot(box.x + box.width / 2 - cx, box.y + box.height / 2 - cy);
      if (dist < bestDist) { bestDist = dist; best = node.dataset.area; }
    }
    return best;
  });
  need(Boolean(visibleArea), 'на экране после наезда не осталось ни одной видимой области');
  if (visibleArea) await page.locator(`[data-area="${visibleArea}"]`).click({ force: true });
  await page.waitForTimeout(200);
  const detail = await page.evaluate(() => document.querySelector('.kd-sheet')?.innerText || '');
  need(/Ценность/.test(detail), `карточка области не открылась или неполна: «${detail.slice(0, 60)}»`);
  await page.locator('.kd-sheet [data-cancel]').click({ timeout: 4_000 }).catch(() => {});

  // Масштаб привязан к точке касания, перемещение ограничено размерами карты.
  await page.locator('[data-zoom-fit]').click();
  await page.locator('[data-zoom-in]').click();
  const zoomed = await page.evaluate(() => document.querySelector('[data-svg]').style.transform);
  need(/scale\(1\.25/.test(zoomed), 'кнопка приближения не изменила масштаб');
  const frame = await page.locator('[data-scroll]').boundingBox();
  if (frame) {
    await page.mouse.move(frame.x + frame.width * .65, frame.y + frame.height * .6);
    await page.mouse.down();
    await page.mouse.move(frame.x + frame.width * .45, frame.y + frame.height * .6, { steps: 5 });
    await page.mouse.up();
    const moved = await page.evaluate(() => document.querySelector('[data-svg]').style.transform);
    need(moved !== zoomed, 'перетаскивание увеличенной карты не сдвинуло изображение');
  }
  await page.locator('[data-zoom-fit]').click();
  const fitted = await page.evaluate(() => document.querySelector('[data-svg]').style.transform);
  need(/scale\(1\)/.test(fitted) && /translate\(0px,\s*0px\)/.test(fitted),
    `кнопка обзора не восстановила весь лист: ${fitted}`);
  const pinch = await page.evaluate(() => {
    const frame = document.querySelector('[data-scroll]');
    const box = frame.getBoundingClientRect();
    const x = box.left + box.width / 2; const y = box.top + box.height / 2;
    const fire = (name, id, dx) => frame.dispatchEvent(new PointerEvent(name,
      { bubbles: true, pointerId: id, pointerType: 'touch', clientX: x + dx, clientY: y }));
    fire('pointerdown', 70, -40); fire('pointerdown', 71, 40);
    fire('pointermove', 71, 85);
    const transform = document.querySelector('[data-svg]').style.transform;
    fire('pointerup', 70, -40); fire('pointerup', 71, 85);
    return transform;
  });
  need(/scale\(1\.[3-9]/.test(pinch), 'жест двумя пальцами не приближает карту');
  await page.locator('[data-zoom-fit]').click();

  // ——— ничего не вылезло за край ———
  const spill = await page.evaluate(() => {
    const doc = document.documentElement;
    /*
      Карту можно приблизить — и приближенная область по замыслу выходит за
      свой обрезающий прямоугольник (.kd-map-scroll держит overflow:hidden);
      это не поломка вёрстки, а весь смысл кнопок масштаба и панорамы. Считать
      здесь нужно то, что вылезло за пределы САМОЙ СТРАНИЦЫ, а не то, что
      обрезано собственной рамкой карты.
    */
    const wide = [...document.querySelectorAll('.kd-wrap *')]
      .filter((node) => !node.closest('.kd-map-scroll'))
      .filter((node) => node.getBoundingClientRect().right > doc.clientWidth + 1).length;
    return { wide, scroll: doc.scrollWidth - doc.clientWidth };
  });
  need(spill.scroll === 0, `страница шире экрана на ${spill.scroll} точек (${width}×${height})`);
  need(spill.wide === 0, `${spill.wide} частей игры вылезли за правый край (${width}×${height})`);

  // ——— описания приказов не сжаты в узкую полосу ———
  const readable = await page.evaluate(() => {
    const text = document.querySelector('.kd-order-btn:not([hidden]) .kd-order-text');
    if (!text) return null;
    const box = text.getBoundingClientRect();
    return { w: Math.round(box.width), lines: getComputedStyle(text).webkitLineClamp };
  });
  need(readable && readable.w >= 60, `описание приказа сжато до ${readable?.w}px`);

  if (process.env.KINGDOMS_SCREENSHOTS) {
    fs.mkdirSync(process.env.KINGDOMS_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.KINGDOMS_SCREENSHOTS, `kingdoms-${width}x${height}.png`), fullPage: true });
  }
  await context.close();
  return { errors };
}

await locked();
const portrait = await play(390, 844);
need(portrait.errors.length === 0, `в портретной ориентации ошибки: ${portrait.errors.slice(0, 3).join(' | ')}`);
const narrow = await play(320, 568);
need(narrow.errors.length === 0, `на 320 точках ошибки: ${narrow.errors.slice(0, 3).join(' | ')}`);
/*
  Горизонтальная ориентация — карта и панель приказов в ряд (раздел 13
  задания). Проверяется тот же набор: карта, приказы, отсутствие обрезки.
*/
const landscape = await play(844, 390);
need(landscape.errors.length === 0, `в горизонтальной ориентации ошибки: ${landscape.errors.slice(0, 3).join(' | ')}`);

await browser.close();
server.close();

if (problems.length) {
  console.error(`«Царства» на телефоне не прошли проверку (${problems.length}):`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log('OK: замок держит — обычный человек не видит карточку и получает отказ на прямой вызов; '
  + 'у главного администратора игра открывается из меню, карта рисует 24 области в 6 регионах, '
  + 'область и связь нажимаются пальцем, приказ размещается и подтверждается, карточка области '
  + 'открывается отдельно от размещения приказа; на 390, 320 и в горизонтальной ориентации 844×390 '
  + 'ничего не вылезает за край и консоль чистая.');
