// Живой фон игры: сцена появляется в тёмной теме и уходит из светлой.
//
// Перенос из превью-веток конца августа. Там у каждой игры была своя сцена со
// слоями, но жила она рядом с полной переделкой приложения в тёмный вид — с
// перекрытием заголовка, меню и панелей каждой игры через !important. Взята
// только сцена, и только туда, где ночной арт уместен: в тёмную тему. Светлая
// не меняется, и это здесь тоже проверяется — молча испорченный светлый вид
// заметить некому.
//
// Проверяется поведением, а не чтением стилей: приложение поднимается целиком,
// игры открываются по-настоящему, тема переключается на живой странице.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePng, meanLuminance } from './lib/png-luminance.mjs';

const root = process.cwd();
const failures = [];
const fail = (message) => failures.push(message);

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
  response.writeHead(200, {
    'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  response.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

// Каталог сцен читается из самого модуля: список игр не должен существовать
// в двух местах и расходиться.
const source = fs.readFileSync(path.join(root, 'web/js/game-scene-parallax.js'), 'utf8');
const catalogKeys = [...source.matchAll(/^\s{4}'?([a-z-]+)'?:\s*\[/gm)].map((match) => match[1]);
if (catalogKeys.length < 10) fail(`В каталоге сцен всего ${catalogKeys.length} игр — похоже, он не прочитался`);

// Каждый файл сцены обязан существовать: путь написан строкой, опечатку в нём
// браузер покажет пустым слоем и ничего не скажет.
for (const [, file] of source.matchAll(/layer\('([^']+)'/g)) {
  if (!fs.existsSync(path.join(root, file))) fail(`Слой сцены не найден: ${file}`);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
/*
  Фон — украшение, и уронить им приложение нельзя: если модуль сцены бросит
  исключение на старте, меню не откроется вовсе. Ошибки страницы собираются и
  предъявляются вместе с остальными, иначе проверка падала бы по таймауту
  ожидания меню и молчала о причине.
*/
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

await page.addInitScript(() => {
  window.Telegram = {
    WebApp: {
      initData: 'query_id=stub&user=%7B%22id%22%3A5883903220%7D&hash=stub',
      initDataUnsafe: { user: { id: 5883903220, first_name: 'Тест' } },
      ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
      setHeaderColor() {}, setBackgroundColor() {},
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
  try {
    localStorage.setItem('leaderboard_news_seen_v1', '1');
    const seen = {};
    for (const key of ['alias', 'spy', 'bible-wow', 'bible-wordsearch', 'sacred-word', 'kids-ark-pairs',
      'biblical-match-three', 'coimaginarium', 'guess', 'describe', 'quartet', 'bible-sketch']) seen[key] = 1;
    localStorage.setItem('game_rules_seen_v1', JSON.stringify(seen));
  } catch { /* приватный режим */ }
});
const telegramSdkStub = (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8', body: 'window.Telegram=window.Telegram||{};',
});
await page.route('https://telegram.org/**', telegramSdkStub);
const stub = (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ success: true, isBanned: false, lastGames: [], answered: true, rooms: [] }),
});
for (const pattern of ['https://*.workers.dev/**', 'https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, stub);
}

const sceneState = () => page.evaluate(() => {
  const scene = document.querySelector('.game-scene');
  if (!scene) return { present: false };
  const style = getComputedStyle(scene);
  const body = getComputedStyle(document.body);
  return {
    present: true,
    key: scene.dataset.scene || '',
    display: style.display,
    pointerEvents: style.pointerEvents,
    zIndex: style.zIndex,
    layers: scene.querySelectorAll('.game-scene__layer').length,
    veil: Boolean(scene.querySelector('.game-scene__veil')),
    bodyBackgroundImage: body.backgroundImage,
    containerZ: getComputedStyle(document.getElementById('game-container')).zIndex,
  };
});
const setTheme = (dark) => page.evaluate((on) => {
  document.documentElement.classList.toggle('theme-dark', on);
}, dark);
const openGame = async (key) => {
  await page.evaluate((game) => window.showGame?.(game), key);
  await page.waitForFunction((game) => document.body.dataset.currentGame === game, key, { timeout: 15_000 });
  /*
    Заставка входа в игру уходит по своему таймеру и лежит поверх сцены. Без
    ожидания замер яркости ловил именно её: «Алиас» показывал одно и то же
    число с пологом и без — мерился загрузочный экран, а не картина.
  */
  await page.waitForFunction(
    () => !document.querySelector('.game-entry-loader.is-active')
      && !document.documentElement.classList.contains('game-entry-loading'),
    null,
    { timeout: 20_000 },
  ).catch(() => {});
  await page.waitForTimeout(350);
};

try {
  await page.goto(`${baseURL}/#tgWebAppData=query_id%3Dstub`, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 })
    .catch(() => fail(`Меню не открылось${pageErrors.length ? `: ${pageErrors[0]}` : ''}`));
  await page.waitForFunction(() => !document.getElementById('gamehub-boot-scene'), null, { timeout: 20_000 });

  // 1. Светлая тема живёт как жила: сцены нет ни в меню, ни в игре.
  await setTheme(false);
  await openGame('alias');
  let state = await sceneState();
  if (state.present && state.display !== 'none') fail('В светлой теме сцена показывается, хотя ночной арт там не к месту');

  // 2. Тёмная тема: сцена встаёт под экран игры.
  await setTheme(true);
  await page.waitForTimeout(500);
  state = await sceneState();
  if (!state.present) fail('В тёмной теме сцена не появилась');
  else {
    if (state.key !== 'alias') fail(`Сцена показывает «${state.key}» вместо «alias»`);
    if (!state.layers) fail('У сцены нет ни одного слоя');
    if (!state.veil) fail('У сцены нет полога — текст игры лёг бы прямо на рисунок');
    // Касания обязаны идти сквозь: сцена лежит поверх всей страницы.
    if (state.pointerEvents !== 'none') fail(`Сцена ловит касания: pointer-events = ${state.pointerEvents}`);
    if (Number(state.containerZ) <= Number(state.zIndex || 0)) {
      fail(`Экран игры не поднят над сценой: контейнер ${state.containerZ}, сцена ${state.zIndex}`);
    }
    if (state.bodyBackgroundImage !== 'none') fail('Плоский фон тёмной темы остался поверх сцены');
  }

  /*
    3. Читаемость. Заголовок игры и подпись под ним стоят в верхней трети
    экрана, а на картинках там самое светлое: полная луна у «Соглядатая»,
    закатное небо у «Алиаса». Пока полог был слабым, «Выберите уровень
    сложности» пропадало в облаках — и никакая проверка разметки этого не
    видела: элементы на месте, цвета заданы, а прочесть нельзя.

    Меряется сама сцена, без игры поверх: содержимое прячется, снимок
    раскладывается на пиксели, берётся средняя яркость верхней трети.
  */
  const sceneBrightness = async () => {
    // Замер без этого шумит: часть слоёв помечена lazy и доезжает позже, и
    // снимок ловил то полную сцену, то половину — числа скакали в обе стороны.
    await page.waitForFunction(
      () => [...document.querySelectorAll('.game-scene__layer')].every((img) => img.complete && img.naturalWidth > 0),
      null,
      { timeout: 15_000 },
    ).catch(() => fail('Слои сцены не догрузились — яркость мерить не по чему'));
    await page.evaluate(() => {
      for (const node of document.querySelectorAll('#game-container, .app-header, .rules-help, .game-frame-exit')) {
        node.style.visibility = 'hidden';
      }
    });
    await page.waitForTimeout(120);
    const shot = await page.screenshot({ type: 'png' });
    await page.evaluate(() => {
      for (const node of document.querySelectorAll('#game-container, .app-header, .rules-help, .game-frame-exit')) {
        node.style.visibility = '';
      }
    });
    const image = decodePng(shot);
    return meanLuminance(image, { bottom: image.height / 3 });
  };

  /** То же, но без полога: видно, что именно он гасит. */
  const rawBrightness = async () => {
    await page.evaluate(() => { document.querySelector('.game-scene__veil')?.style.setProperty('display', 'none'); });
    const value = await sceneBrightness();
    await page.evaluate(() => { document.querySelector('.game-scene__veil')?.style.removeProperty('display'); });
    return value;
  };

  /*
    Порог подобран замерами, а не на глаз. Без полога верх «Алиаса» светит на
    0.25, «Соглядатая» — на 0.14. Прежний слабый полог опускал их до 0.18 и
    0.12, и на первом же снимке «Выберите уровень сложности» тонуло в облаках.
    Нынешний даёт 0.12 и 0.09. Предел 0.15 проходит нынешний и не проходит
    прежний — и заодно поймает картину ярче, если такую однажды добавят.
  */
  const MAX_TOP_BRIGHTNESS = 0.15;
  for (const key of ['alias', 'spy']) {
    await openGame(key);
    await page.waitForTimeout(700);
    const brightness = await sceneBrightness();
    if (brightness > MAX_TOP_BRIGHTNESS) {
      const raw = await rawBrightness();
      fail(`Сцена «${key}» слишком светлая сверху: ${brightness.toFixed(3)} при пределе ${MAX_TOP_BRIGHTNESS} `
        + `(сама картина светит на ${raw.toFixed(3)}, полог гасит недостаточно) — заголовок игры на ней не прочесть`);
    }
  }

  // 4. Своя сцена у каждой игры, а не одна на всех.
  await openGame('spy');
  await page.waitForTimeout(300);
  state = await sceneState();
  if (state.key !== 'spy') fail(`При переходе в «Соглядатая» сцена осталась «${state.key}»`);

  // 5. У «Моисея на Ниле» свой мир во весь экран — чужой фон под ним не нужен.
  await openGame('moses-nile');
  state = await sceneState();
  if (state.present && state.display !== 'none') fail('У «Моисея на Ниле» под трёхмерным миром висит лишняя сцена');

  // 6. Возврат в меню сцену убирает: у меню свой параллакс.
  await page.evaluate(() => window.goToMainMenu?.());
  await page.waitForTimeout(400);
  state = await sceneState();
  if (state.present && state.display !== 'none') fail('Сцена игры осталась висеть в меню');
  for (const error of pageErrors) fail(`Ошибка на странице: ${error}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`Живой фон игр не прошёл проверку (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`OK: живой фон игр — ${catalogKeys.length} сцен, в тёмной теме встают под экран игры и меняются вместе с ней, `
  + 'в светлой теме их нет, верх сцены достаточно тёмен для заголовка, касания идут сквозь, '
  + 'а меню и «Моисей на Ниле» остаются со своим.');
