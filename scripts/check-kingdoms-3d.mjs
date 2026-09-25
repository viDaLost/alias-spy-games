// «Царства» в объёме: карта-диорама поднимается, читается и нажимается.
//
// Плоскую карту проверяет check-kingdoms-browser.mjs. Здесь — объёмная, и
// спрашивается то, что в ней может сломаться незаметно для глаз разработчика:
//
//   * объём действительно поднялся (а не остался плоский вид молча), сцена
//     нарисована и укладывается в бюджет — вызовов отрисовки и треугольников;
//   * в покое карта не рисуется: кадры идут только когда что-то меняется;
//   * все 24 маркера стоят на своих местах на экране, а не свалены в угол;
//   * цвет владельца и подсветка целей доходят до рельефа;
//   * нажатие по самой земле (не по маркеру) выбирает ту область, над которой
//     палец, — это сверяется лучом, и после выбора приказа ведёт к
//     подтверждению, как и на плоской карте;
//   * один палец поворачивает и наклоняет карту, как доску «Земли
//     обетованной», а не таскает её; сдвиг — правой кнопкой (двумя пальцами);
//     колесо и кнопки приближают, «Показать всю карту» возвращает общий вид;
//   * карта лежит в окне между плашками: ни один маркер общего вида не
//     спрятан под шапкой или рукой;
//   * рука и стоймя, и боком — полоса внизу во всю ширину, жетоны одной
//     лентой, которую листают пальцем вбок;
//   * свой край светится рубежом, а выбранный приказ обводит цели и дышит —
//     только пока выбран: сняли выбор, и карта снова не рисуется в покое;
//   * поставленный поход ложится на карту объёмной фишкой со стрелой;
//   * после подлёта к области каждый видимый маркер стоит над своей
//     областью — ни один не висит в воздухе за краем диорамы;
//   * переключатель 2D/3D работает в обе стороны и выбор помнится;
//   * ни одной ошибки в консоли — ни боком, ни стоймя.
//
//     node scripts/check-kingdoms-3d.mjs

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
  response.writeHead(200, { 'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream', 'Cache-Control': 'no-store' });
  response.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || chromium.executablePath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

function telegramStub() {
  window.Telegram = { WebApp: {
    initData: 'user=%7B%22id%22%3A1288379477%7D&hash=qa',
    initDataUnsafe: { user: { id: 1288379477, first_name: 'Тест' } },
    ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
    MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
    HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
  } };
  try {
    localStorage.setItem('game_rules_seen_v1', JSON.stringify({ kingdoms: Date.now() }));
    localStorage.setItem('bot_start_promo_seen_v1', '1');
    localStorage.setItem('channel_promo_seen_v1', '1');
    if (!sessionStorage.getItem('kd3d-view-set')) {
      sessionStorage.setItem('kd3d-view-set', '1');
      localStorage.removeItem('kingdoms_view_v1');
    }
  } catch { /* приватный режим */ }
}

async function openGame(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.addInitScript(telegramStub);
  const body = JSON.stringify({ success: true, isBanned: false, lastGames: [], users: [], isAdmin: true, isRoot: true,
    role: 'owner', userId: '1288379477', answered: true, skip: true, eligible: false });
  await page.route('https://telegram.org/**', (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**', 'https://*.workers.dev/**']) {
    await page.route(pattern, (route) => route.fulfill({ contentType: 'application/json', body }));
  }
  await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.showGame('kingdoms'));
  await page.waitForSelector('[data-start], [data-teach-skip]', { timeout: 15_000 });
  if (await page.locator('[data-teach-skip]').count()) {
    await page.locator('[data-teach-skip]').click();
    await page.waitForSelector('[data-start]');
  }
  await page.locator('[data-count] button[data-value="2"]').click().catch(() => {});
  await page.locator('[data-start]').click();
  await page.waitForSelector('[data-area]', { timeout: 15_000 });
  const up = await page.waitForFunction(() => {
    const view = window.KingdomsGame?.board?.view3d;
    return Boolean(view && view.info().frames > 0 && document.querySelector('.kd-map-wrap.kd-3d'));
  }, null, { timeout: 60_000 }).then(() => true, () => false);
  return { context, page, errors, up };
}

const info = (page) => page.evaluate(() => window.KingdomsGame.board.view3d?.info() || null);

async function play(width, height) {
  const { context, page, errors, up } = await openGame(width, height);
  const tag = `${width}×${height}`;
  need(up, `${tag}: объёмная карта не поднялась`);
  if (!up) { await context.close(); return { errors }; }
  await page.waitForTimeout(600);

  // ——— сцена нарисована и укладывается в бюджет ———
  const scene = await info(page);
  need(scene.calls >= 20, `${tag}: в кадре всего ${scene.calls} вызовов отрисовки — сцена пустая`);
  need(scene.calls <= 120, `${tag}: ${scene.calls} вызовов отрисовки на кадр — слишком дорого для телефона`);
  need(scene.triangles >= 30_000, `${tag}: в кадре ${scene.triangles} треугольников — рельефа нет`);
  need(scene.triangles <= 600_000, `${tag}: ${scene.triangles} треугольников — слишком тяжело`);
  need(scene.owned >= 2, `${tag}: цвет владельцев не дошёл до карты (${scene.owned} областей)`);
  need(scene.realm >= 20, `${tag}: рубеж своего царства не нарисован (${scene.realm} отрезков)`);

  // ——— в покое кадров нет ———
  const idleFrom = (await info(page)).frames;
  await page.waitForTimeout(1500);
  const idleTo = (await info(page)).frames;
  need(idleTo - idleFrom <= 1, `${tag}: в покое нарисовано ${idleTo - idleFrom} кадров — карта жжёт батарею`);

  // ——— маркеры стоят на своих местах ———
  const markers = await page.evaluate(() => {
    const frame = document.querySelector('[data-scroll]').getBoundingClientRect();
    const view = window.KingdomsGame.board.view3d;
    const out = { inside: 0, total: 0, far: 0, spots: new Set() };
    for (const group of document.querySelectorAll('.kd-area[data-area]')) {
      out.total += 1;
      const box = group.querySelector('.kd-area-marker').getBoundingClientRect();
      const cx = box.x + box.width / 2; const cy = box.y + box.height / 2;
      if (cx >= frame.left && cx <= frame.right && cy >= frame.top && cy <= frame.bottom) out.inside += 1;
      out.spots.add(`${Math.round(cx / 20)}:${Math.round(cy / 20)}`);
      const want = view.screenOf(group.dataset.area);
      if (Math.hypot(want.x - cx, want.y - cy) > 30) out.far += 1;
    }
    return { inside: out.inside, total: out.total, far: out.far, distinct: out.spots.size };
  });
  need(markers.total === 24, `${tag}: маркеров ${markers.total} вместо 24`);
  need(markers.inside === 24, `${tag}: на общем виде в рамке только ${markers.inside} маркеров из 24`);
  need(markers.distinct >= 20, `${tag}: маркеры свалены в кучу (${markers.distinct} разных мест)`);
  need(markers.far === 0, `${tag}: ${markers.far} маркеров стоят не над своей областью`);

  // ——— поле в основе: плашки не закрывают карту ———
  const covered = await page.evaluate(() => {
    const boxes = ['.kd-header', '.kd-panel', '.kd-standings', '.kd-status']
      .map((selector) => document.querySelector(selector))
      .filter((node) => node && node.offsetParent !== null && node.textContent.trim())
      .map((node) => [node.className.split(' ')[0], node.getBoundingClientRect()]);
    const out = [];
    for (const group of document.querySelectorAll('.kd-area[data-area]')) {
      const box = group.querySelector('.kd-area-marker').getBoundingClientRect();
      const cx = box.x + box.width / 2; const cy = box.y + box.height / 2;
      const under = boxes.find(([, r]) => cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom);
      if (under) out.push(`${group.dataset.area} под ${under[0]}`);
    }
    return out;
  });
  need(covered.length === 0, `${tag}: маркеры общего вида спрятаны под плашками: ${covered.slice(0, 4).join(', ')}`);

  // ——— рука: внизу во всю ширину, жетоны одной лентой со свайпом вбок — и стоймя, и боком ———
  const hand = await page.evaluate(() => {
    const panel = document.querySelector('.kd-panel').getBoundingClientRect();
    const strip = document.querySelector('.kd-orders');
    const tops = new Set([...strip.querySelectorAll('.kd-order-btn')].map((button) => Math.round(button.getBoundingClientRect().top)));
    return {
      wide: panel.width / window.innerWidth,
      bottomGap: window.innerHeight - panel.bottom,
      rows: tops.size,
      swipe: getComputedStyle(strip).overflowX,
    };
  });
  need(hand.wide > 0.85, `${tag}: рука занимает ${Math.round(hand.wide * 100)}% ширины, а должна лежать полосой внизу`);
  need(hand.bottomGap < 40, `${tag}: рука не прижата к низу экрана (зазор ${Math.round(hand.bottomGap)} точек)`);
  need(hand.rows === 1, `${tag}: жетоны в руке разложены в ${hand.rows} ряда, а должны идти одной лентой`);
  need(hand.swipe === 'auto' || hand.swipe === 'scroll', `${tag}: ленту жетонов нельзя листать вбок (overflow-x: ${hand.swipe})`);

  // ——— нажатие по земле выбирает область под пальцем ———
  const attackKind = await page.evaluate(() => ['march1', 'march2', 'march3', 'ford2', 'feint']
    .find((kind) => !document.querySelector(`[data-order="${kind}"]`)?.disabled));
  need(Boolean(attackKind), `${tag}: в стартовой руке нет доступного боевого жетона`);
  if (attackKind) {
    await page.locator(`[data-order="${attackKind}"]`).click();
    // Сцена узнаёт о выборе в следующем кадре; на программном рендере кадр долог — ждём сам результат.
    await page.waitForFunction(() => window.KingdomsGame.board.view3d.info().rims > 0, null, { timeout: 5000 }).catch(() => {});
    const glow = await info(page);
    need(glow.glowing > 0, `${tag}: цели приказа подсвечены в разметке, но не на рельефе`);
    need(glow.rims > 0, `${tag}: цели приказа не обведены рубежом`);
    need(glow.breathing, `${tag}: подсветка целей не дышит, пока приказ выбран`);
    const breathFrom = glow.frames;
    // Программный рендер в CI рисует кадр за сотни миллисекунд — ждём с запасом.
    await page.waitForTimeout(2000);
    need((await info(page)).frames - breathFrom >= 2, `${tag}: подсветка целей объявлена дышащей, но кадры не идут`);
    /*
      Точка нажатия — внутри подходящей области, но в стороне от её маркера:
      маркер сам по себе нажимается и так, а проверяется именно луч в землю.
    */
    const spot = await page.evaluate(() => {
      const view = window.KingdomsGame.board.view3d;
      const frame = document.querySelector('[data-scroll]').getBoundingClientRect();
      // Своя область-источник выбирается однозначно; с неё и начинаем.
      const eligible = [...document.querySelectorAll('[data-area].is-eligible')]
        .sort((a, b) => Number(b.classList.contains('is-mine')) - Number(a.classList.contains('is-mine')))
        .map((node) => node.dataset.area);
      for (const id of eligible) {
        const center = view.screenOf(id);
        for (const [dx, dy] of [[34, 0], [-34, 0], [0, 30], [0, -34], [28, 26], [-28, 26], [44, -20], [-44, -20]]) {
          const x = center.x + dx; const y = center.y + dy;
          if (x < frame.left + 4 || x > frame.right - 4 || y < frame.top + 4 || y > frame.bottom - 4) continue;
          const top = document.elementFromPoint(x, y);
          if (!top || !(top.tagName === 'CANVAS' || top.classList.contains('kd-3d-canvas'))) continue;
          if (view.areaAtScreen(x, y) === id) return { id, x, y };
        }
      }
      return null;
    });
    need(Boolean(spot), `${tag}: не нашлось открытой земли подходящей области, куда нажать`);
    if (spot) {
      await page.mouse.click(spot.x, spot.y);
      await page.waitForTimeout(300);
      const picked = await page.evaluate(() => ({
        selected: document.querySelector('[data-area].is-selected')?.dataset.area || null,
        confirm: (() => { const bar = document.querySelector('[data-confirm]'); return Boolean(bar && !bar.hidden && getComputedStyle(bar).display !== 'none'); })(),
        pending: window.KingdomsGame.board.pending,
      }));
      need(picked.selected === spot.id || picked.confirm || picked.pending?.from === spot.id || picked.pending?.area === spot.id,
        `${tag}: нажатие по земле области «${spot.id}» не выбрало её (выбрано ${picked.selected || 'ничего'})`);

      // Поход до конца: цель, подтверждение — и на карте фишка со стрелой.
      const placed = await page.evaluate(async () => {
        const board = window.KingdomsGame.board;
        const target = [...document.querySelectorAll('[data-area].is-eligible')].find((node) => !node.classList.contains('is-mine'));
        if (target) board.tapArea(target.dataset.area);
        await new Promise((resolve) => setTimeout(resolve, 200));
        document.querySelector('[data-confirm-ok]')?.click();
        for (let waited = 0; waited < 5000 && !window.KingdomsGame.board.view3d.info().arrows; waited += 100) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return window.KingdomsGame.board.view3d.info();
      });
      need(placed.tokens >= 1, `${tag}: поставленный приказ не лёг на карту объёмной фишкой`);
      need(placed.arrows >= 1, `${tag}: у похода нет стрелы от источника к цели`);
    }
    await page.evaluate(() => { const board = window.KingdomsGame.board; board.pending = null; board.renderAll(); });
    await page.waitForTimeout(1200);
    const calm = await info(page);
    need(!calm.breathing && calm.rims === 0, `${tag}: выбор приказа снят, а цели всё ещё обведены`);
    /*
      Снятие выбора меняет подсказку, окно карты пересчитывается — это один-два
      разовых кадра, и на программном рендере они приходят с опозданием.
      Батарею жжёт другое: непрерывные кадры. Поэтому ищем тихое окно в две
      секунды — ту же, за которую дыхание обязано дать два кадра, — и ждём его
      до восьми секунд; дыхание, которое не остановилось, тихого окна не даст.
    */
    let busiest = Infinity;
    for (let window = 0; window < 4 && busiest > 1; window += 1) {
      const from = (await info(page)).frames;
      await page.waitForTimeout(2000);
      busiest = Math.min(busiest, (await info(page)).frames - from);
    }
    need(busiest <= 1, `${tag}: после снятия выбора карта рисует без остановки (${busiest} кадров в самое тихое окно)`);
  }

  // ——— один палец поворачивает и наклоняет, правая кнопка сдвигает ———
  /*
    Камера меняется в кадрах, а кадр программного рендера долог: ждём
    результата, а не таймера. Условие — функция, не строка: политика
    безопасности страницы запрещает вычислять строки, и строковое ожидание
    падало мгновенно и молча.
  */
  const camWhen = (test, arg) => page.waitForFunction(test, arg, { timeout: 4000 }).catch(() => {});
  const atHome = () => {
    const c = window.KingdomsGame.board.view3d.info().camera;
    return Math.abs(c.x) < 2 && Math.abs(c.yaw) < 0.01;
  };
  await page.locator('[data-zoom-fit]').click();
  await camWhen(atHome);
  await page.waitForTimeout(300);
  const before = (await info(page)).camera;
  const frame = await page.locator('[data-scroll]').boundingBox();
  const cx = frame.x + frame.width / 2; const cy = frame.y + frame.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const turned = (await info(page)).camera;
  // Палец вправо — карта поворачивается вслед за ним; палец вниз — камера поднимается над картой.
  need(turned.yaw < before.yaw - 0.15, `${tag}: палец вправо не повернул карту вслед за собой (угол ${before.yaw.toFixed(2)} → ${turned.yaw.toFixed(2)})`);
  need(turned.tilt < before.tilt - 0.08, `${tag}: палец вниз не поднял камеру (наклон ${before.tilt.toFixed(2)} → ${turned.tilt.toFixed(2)})`);
  need(Math.hypot(turned.x - before.x, turned.z - before.z) < 2, `${tag}: один палец таскает карту, а должен поворачивать`);
  const noSheet = await page.evaluate(() => !document.querySelector('.kd-sheet'));
  need(noSheet, `${tag}: поворот открыл карточку области, как будто это нажатие`);
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(cx + 60, cy + 40, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(200);
  const dragged = (await info(page)).camera;
  need(Math.hypot(dragged.x - turned.x, dragged.z - turned.z) > 15, `${tag}: сдвиг правой кнопкой не сдвинул карту`);
  need(Math.abs(dragged.yaw - turned.yaw) < 0.01, `${tag}: сдвиг правой кнопкой ещё и повернул карту`);
  await page.locator('[data-zoom-in]').click();
  await camWhen((limit) => window.KingdomsGame.board.view3d.info().camera.dist < limit, dragged.dist * 0.9);
  await page.waitForTimeout(300);
  const zoomed = (await info(page)).camera;
  need(zoomed.dist < dragged.dist * 0.9, `${tag}: кнопка «+» не приблизила карту`);
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, 300);
  await camWhen((limit) => window.KingdomsGame.board.view3d.info().camera.dist > limit, zoomed.dist);
  const wheeled = (await info(page)).camera;
  need(wheeled.dist > zoomed.dist, `${tag}: колесо не отдалило карту`);
  await page.locator('[data-zoom-fit]').click();
  await camWhen(atHome);
  const fitted = (await info(page)).camera;
  need(Math.abs(fitted.x) < 2 && Math.abs(fitted.yaw) < 0.01, `${tag}: «Показать всю карту» не вернула общий вид (x ${fitted.x.toFixed(1)}, угол ${fitted.yaw.toFixed(2)})`);

  // ——— подлёт к области: видимые маркеры — над своими областями ———
  const focused = await page.evaluate(async () => {
    const view = window.KingdomsGame.board.view3d;
    view.focusArea('primorye-rim', 2.6);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const out = [];
    let shown = 0;
    for (const group of document.querySelectorAll('.kd-area[data-area]')) {
      if (group.style.display === 'none') continue;
      shown += 1;
      const box = group.querySelector('.kd-area-marker').getBoundingClientRect();
      const want = view.screenOf(group.dataset.area);
      const miss = Math.hypot(want.x - (box.x + box.width / 2), want.y - (box.y + box.height / 2));
      if (miss > 30) out.push(`${group.dataset.area} на ${Math.round(miss)} точек`);
    }
    return { out, shown };
  });
  need(focused.shown >= 3, `${tag}: после подлёта к Тарсийской Гавани видно ${focused.shown} маркеров`);
  need(focused.out.length === 0, `${tag}: после подлёта маркеры висят не над своими областями: ${focused.out.slice(0, 4).join(', ')}`);
  await page.locator('[data-zoom-fit]').click();
  await page.waitForTimeout(600);

  // ——— страница не шире экрана ———
  const spill = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  need(spill <= 0, `${tag}: страница шире экрана на ${spill} точек`);

  // ——— переключатель вида ———
  await page.locator('[data-view-toggle]').click();
  await page.waitForTimeout(400);
  const flat = await page.evaluate(() => ({
    canvas: Boolean(document.querySelector('.kd-3d-canvas')),
    view: Boolean(window.KingdomsGame.board.view3d),
    saved: localStorage.getItem('kingdoms_view_v1'),
    areas: document.querySelectorAll('[data-area]').length,
    label: document.querySelector('[data-view-toggle]')?.textContent.trim(),
  }));
  need(!flat.canvas && !flat.view && flat.areas === 24, `${tag}: «2D» не вернуло плоскую карту`);
  need(flat.saved === '2d' && flat.label === '3D', `${tag}: выбор плоского вида не запомнился`);
  await page.locator('[data-view-toggle]').click();
  const back = await page.waitForFunction(() => Boolean(window.KingdomsGame.board.view3d?.info().frames), null,
    { timeout: 30_000 }).then(() => true, () => false);
  need(back, `${tag}: «3D» не подняло объёмную карту обратно`);

  if (process.env.KINGDOMS_SCREENSHOTS) {
    fs.mkdirSync(process.env.KINGDOMS_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path: path.join(process.env.KINGDOMS_SCREENSHOTS, `kingdoms-3d-${width}x${height}.png`) });
  }
  const summary = await info(page);
  await context.close();
  return { errors, summary };
}

let portrait;
let landscape;
try {
  portrait = await play(390, 844);
  landscape = await play(844, 390);
} finally {
  await browser.close();
  server.close();
}
need(portrait.errors.length === 0, `стоймя ошибки в консоли: ${portrait.errors.slice(0, 3).join(' | ')}`);
need(landscape.errors.length === 0, `боком ошибки в консоли: ${landscape.errors.slice(0, 3).join(' | ')}`);

if (problems.length) {
  console.error(`«Царства» в объёме не прошли проверку (${problems.length}):`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}
const s = portrait.summary;
console.log(`OK: объёмная карта «Царств» поднимается (${s.calls} вызовов отрисовки, ${s.triangles} треугольников, качество «${s.quality}»), `
  + 'в покое не рисуется, все 24 маркера стоят над своими областями, цвет владельцев и подсветка целей доходят до рельефа, '
  + 'плашки не закрывают карту, свой край светится рубежом, цели приказа обведены и дышат только пока приказ выбран, '
  + 'поход ложится объёмной фишкой со стрелой, нажатие по земле выбирает область под пальцем, '
  + 'один палец поворачивает и наклоняет, правая кнопка сдвигает, колесо и кнопки приближают, общий вид возвращается, '
  + 'после подлёта маркеры стоят над своими областями, '
  + 'переключатель 2D/3D работает в обе стороны и помнит выбор; стоймя и боком консоль чистая.');
