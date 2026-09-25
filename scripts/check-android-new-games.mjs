// Новые игры веб-версии открываются в Android-приложении так же, как в вебе.
//
// Отзыв в поддержку: «в канале новые игры есть, а в установленном приложении —
// нет». Android-приложение не ходит за интерфейсом на сайт: оно раздаёт копию
// веб-версии из самого APK. Поэтому всё, что появилось в вебе после сборки,
// в установленном приложении появляется только с новой сборкой, — и важно,
// чтобы в этой сборке игры не просто стояли в меню, а открывались и выглядели
// так же, как в вебе.
//
// Здесь приложение поднимается дважды: как веб внутри Telegram и так, как его
// запускает APK (мост AndroidApp, ?android=1). В обоих меню сверяются
// карточки, а каждая игра, живущая только в вебе, — «Моисей: Путь по Нилу»,
// «Земля обетованная», «Двенадцать колен», — открывается и сверяется по
// своему первому экрану: тот же источник, тот же экран, никакой карточки
// ошибки вместо игры.
//
//     node scripts/check-android-new-games.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const promisedLandRoot = path.join(root, 'cloudflare/promised-land-preview/public');
const PROMISED_LAND_HOST = 'alias-spy-games-promised-land-preview.vitaledanilov.workers.dev';
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'], ['.glb', 'model/gltf-binary'],
]);
const fileFrom = (base, pathname) => {
  const target = path.resolve(base, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(base + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  return target;
};
const server = http.createServer((request, response) => {
  const target = fileFrom(root, decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname));
  if (!target) { response.writeHead(404).end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream' });
  response.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  // Без WebGL «Моисей» встаёт в запасной режим за секунды; здесь сверяется
  // то, что игра открылась, а не её 3D.
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-webgl'],
});

async function openApp(android) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
  });
  await context.addInitScript((isAndroid) => {
    window.__APP_TELEMETRY_DISABLED__ = true;
    if (isAndroid) {
      window.AndroidApp = {
        getTelegramId: () => '555555555', getSessionToken: () => 'bgs_android_runtime_test_token',
        isAndroidApp: () => true, getAppVersion: () => 'check', logout() {},
      };
    } else {
      window.Telegram = { WebApp: {
        initData: 'signed-test-data', initDataUnsafe: { user: { id: 555555555, first_name: 'Тест' } },
        ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
        setHeaderColor() {}, setBackgroundColor() {}, disableVerticalSwipes() {}, openTelegramLink() {},
        MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
        HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
      } };
    }
    // Одноразовые баннеры и листы правил проверяют свои проверки; здесь они
    // только заслоняют меню и игру.
    try {
      localStorage.setItem('bot_start_promo_seen_v1', '1');
      localStorage.setItem('channel_promo_seen_v1', '1');
      localStorage.setItem('moses-nile-tutorial-seen-v1', '1');
      localStorage.setItem('game_rules_seen_v1', JSON.stringify({
        'moses-nile': Date.now(), 'promised-land': Date.now(), 'twelve-tribes': Date.now(),
      }));
    } catch { /* приватный режим */ }
  }, android);
  const page = await context.newPage();
  const crashes = [];
  page.on('pageerror', (error) => crashes.push(String(error?.message || error)));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL) return route.continue();
    if (url.host === 'telegram.org') return route.fulfill({ contentType: 'text/javascript', body: '' });
    // «Земля обетованная» живёт на своём адресе и открывается фреймом: её
    // страница берётся из репозитория, а комнаты ей здесь не нужны.
    if (url.host === PROMISED_LAND_HOST) {
      if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
      const target = fileFrom(promisedLandRoot, url.pathname);
      if (!target) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: mime.get(path.extname(target)) || 'application/octet-stream', body: fs.readFileSync(target) });
    }
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch { /* не наш запрос */ }
    const action = String((body.payload || body).action || '');
    let reply = { success: true, ok: true, isBanned: false, lastGames: [], answered: true, eligible: false };
    if (action === 'adminRoleStatus') reply = { success: true, role: { isAdmin: false, isRoot: false } };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(reply) });
  });
  await page.goto(`${baseURL}/${android ? '?android=1&apk=check&native=bundled-web' : ''}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
  await page.waitForTimeout(1500);
  return { context, page, crashes };
}

const menuCards = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll('[onclick*="showGame("]')]
  .filter((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  })
  .map((node) => node.getAttribute('onclick').match(/showGame\('([^']+)'/)?.[1])
  .filter(Boolean))].sort());

const backToMenu = async (page) => {
  await page.evaluate(() => (window.appGoToMainMenu || window.goToMainMenu)?.());
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
  await page.waitForTimeout(400);
};

/** Первый экран игры, сведённый к тому, что должно совпасть в вебе и в APK. */
async function openGame(page, key) {
  await page.evaluate((game) => window.showGame(game), key);
  await page.waitForFunction((game) => document.body.dataset.currentGame === game, key, { timeout: 10_000 });
  const errorCard = async () => page.evaluate(() => Boolean(document.querySelector('#game-container .app-error-card')));

  if (key === 'twelve-tribes') {
    await page.waitForSelector('.tt-setup [data-start]', { timeout: 15_000 });
    await page.locator('.tt-setup [data-start]').click();
    await page.waitForSelector('.tt-hand .tt-card', { timeout: 10_000 });
    return page.evaluate(() => ({
      error: Boolean(document.querySelector('#game-container .app-error-card')),
      hand: document.querySelectorAll('.tt-hand .tt-card').length,
      exit: Boolean(document.querySelector('.tt-topbar [data-menu]')),
      // Стол въезжает анимацией, и точная ширина плавает на пиксель от
      // прогона к прогону (364 в вебе и 365 в APK на CI). Сверяется то, что
      // видно глазом: стол занимает ширину телефона.
      tableFills: (document.querySelector('.tt-table')?.getBoundingClientRect().width || 0) >= 320,
    }));
  }

  await page.waitForSelector('#game-container iframe.game-frame', { timeout: 10_000 });
  const frameHandle = await page.$('#game-container iframe.game-frame');
  const frame = await frameHandle.contentFrame();
  const src = new URL(await frameHandle.getAttribute('src'), page.url());
  const landmark = key === 'moses-nile' ? '#start-btn' : '#mode';
  await frame.waitForSelector(`${landmark}:not([hidden])`, { timeout: 20_000 });
  // Кадр въезжает на экран с анимацией: ширина снимается, когда он встал.
  await page.waitForFunction(() => {
    const node = document.querySelector('#game-container iframe.game-frame');
    const width = Math.round(node?.getBoundingClientRect().width || 0);
    const settled = width > 0 && width === window.__frameWidth;
    window.__frameWidth = width;
    return settled;
  }, null, { timeout: 5_000, polling: 250 }).catch(() => {});
  const box = await frameHandle.boundingBox();
  return {
    error: await errorCard(),
    host: src.origin === new URL(page.url()).origin ? 'app' : src.host,
    path: src.pathname,
    parentOriginMatches: key !== 'promised-land' || src.searchParams.get('parentOrigin') === new URL(page.url()).origin,
    landmark: await frame.locator(landmark).isVisible(),
    fillsWidth: Math.round(box?.width || 0) >= 380,
  };
}

/*
  Быстрое переключение: вошёл в игру, не дождался её, вернулся в меню и сразу
  открыл другую. Заставка ушедшей игры убирает за собой с задержкой, и раньше
  эта уборка гасила таймеры и наблюдатель новой: заставка «Двенадцати колен»
  оставалась поверх стола навсегда и перехватывала каждое нажатие.
*/
async function quickSwitch(page) {
  await page.evaluate(() => window.showGame('promised-land'));
  await page.waitForTimeout(250);
  // Новая игра открывается ровно тогда, когда заставка прежней начала уходить:
  // её отложенная уборка ещё впереди — так, как бывает у человека, который
  // быстро передумал, и без гонки таймингов в самой проверке.
  await page.evaluate(() => new Promise((resolve) => {
    (window.appGoToMainMenu || window.goToMainMenu)?.();
    const tick = () => {
      if (document.querySelector('#game-entry-loader.is-leaving')) {
        window.showGame('twelve-tribes');
        resolve();
      } else requestAnimationFrame(tick);
    };
    tick();
  }));
  await page.waitForSelector('.tt-setup [data-start]', { timeout: 15_000 });
  // Страховка заставки — MAX_VISIBLE_MS (9 с): дольше неё не ждём.
  const released = await page.waitForFunction(
    () => !document.querySelector('#game-entry-loader.is-active'), null, { timeout: 11_000 },
  ).then(() => true, () => false);
  if (!released) return 'заставка входа осталась поверх «Двенадцати колен»';
  try {
    await page.locator('.tt-setup [data-start]').click({ timeout: 5_000 });
    await page.waitForSelector('.tt-hand .tt-card', { timeout: 10_000 });
  } catch (error) {
    return `стол не открылся: ${String(error.message).split('\n')[0]}`;
  }
  return '';
}

const NEW_GAMES = ['moses-nile', 'promised-land', 'twelve-tribes'];
const results = {};

try {
  for (const mode of ['web', 'apk']) {
    const { context, page, crashes } = await openApp(mode === 'apk');
    results[mode] = { cards: await menuCards(page), games: {} };
    if (mode === 'apk') {
      check(await page.evaluate(() => window.__ANDROID_APK__ === true), 'режим APK не включился — сверять не с чем');
    }
    for (const key of NEW_GAMES) {
      try {
        results[mode].games[key] = await openGame(page, key);
      } catch (error) {
        results[mode].games[key] = { failed: String(error.message).split('\n')[0] };
      }
      await backToMenu(page);
    }
    const stuck = await quickSwitch(page);
    check(!stuck, `${mode}: быстрое переключение «Земля обетованная» → меню → «Двенадцать колен»: ${stuck}`);
    await backToMenu(page);
    for (const crash of crashes) check(false, `${mode}: страница поймала исключение: ${crash}`);
    await context.close();
  }

  const { web, apk } = results;
  check(JSON.stringify(web.cards) === JSON.stringify(apk.cards),
    `меню в APK и в вебе разное: только в вебе — ${web.cards.filter((key) => !apk.cards.includes(key)).join(', ') || 'нет'}, `
    + `только в APK — ${apk.cards.filter((key) => !web.cards.includes(key)).join(', ') || 'нет'}`);
  for (const key of NEW_GAMES) {
    check(apk.cards.includes(key), `в меню APK нет карточки «${key}»`);
    const inWeb = web.games[key];
    const inApk = apk.games[key];
    check(!inWeb.failed, `${key} не открылась даже в вебе: ${inWeb.failed}`);
    check(!inApk.failed, `${key} не открылась в APK: ${inApk.failed}`);
    if (inWeb.failed || inApk.failed) continue;
    check(!inApk.error, `${key}: в APK вместо игры карточка ошибки`);
    check(JSON.stringify(inApk) === JSON.stringify(inWeb),
      `${key}: первый экран в APK не такой, как в вебе — веб ${JSON.stringify(inWeb)}, APK ${JSON.stringify(inApk)}`);
  }
  check(apk.games['moses-nile']?.host === 'app', '«Моисей» в APK грузится не из самого пакета');
  check(apk.games['promised-land']?.host === PROMISED_LAND_HOST, '«Земля обетованная» в APK открывается не со своего адреса');
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`Новые игры в Android не прошли проверку (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Новые игры в Android — как в вебе: меню APK совпадает с вебом (${results.apk.cards.length} игр), `
  + '«Моисей: Путь по Нилу» грузится из самого пакета, «Земля обетованная» — со своего адреса с верным адресом родителя, '
  + '«Двенадцать колен» раздаёт руку за столом, и у каждой первый экран тот же, что в вебе; '
  + 'быстрое переключение игр не оставляет заставку входа поверх стола.');
