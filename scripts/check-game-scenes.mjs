// Живой фон игры: одна и та же сцена в обеих темах.
//
// Перенос из превью-веток конца августа. Там у каждой игры была своя сцена со
// слоями, но жила она рядом с полной переделкой приложения в тёмный вид — с
// перекрытием заголовка, меню и панелей каждой игры через !important. Взята
// только сцена; тему решают стили, и в каждой она решает свою задачу.
//
// Тёмная: арт ночной, полог гасит светлые места, чтобы белый заголовок игры не
// пропал в облаках. Светлая: тот же арт высветляется и уходит под прозрачный
// светлый градиент — картина проступает подмалёвком, а тёмный текст и белые
// карточки читаются как читались. Обе стороны меряются по снимку экрана:
// разметка тут ничего не докажет, элементы на месте и в нечитаемом виде.
//
// Проверяется поведением, а не чтением стилей: приложение поднимается целиком,
// игры открываются по-настоящему, тема переключается на живой странице.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePng, meanLuminance, blockLuminanceBounds, meanAbsoluteDifference } from './lib/png-luminance.mjs';

const root = process.cwd();
const failures = [];
// Повтор одной и той же жалобы ничего не добавляет: у сломанной сцены замер
// повторяется для каждой игры, и список вырастает в четыре копии одной строки.
const fail = (message) => { if (!failures.includes(message)) failures.push(message); };

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
    opacity: Number(style.opacity),
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

/*
  Сцену видно и в тёмной, и в светлой теме, а вот условия читаемости у них
  противоположные. Общая часть — «сцена стоит под экраном игры и не мешает» —
  проверяется одинаково в обеих.
*/
const checkSceneShell = (state, theme) => {
  if (!state.present) {
    fail(`В ${theme} теме сцена не появилась`);
    return false;
  }
  if (state.display === 'none' || !state.opacity) fail(`В ${theme} теме сцена есть в разметке, но не видна`);
  if (!state.layers) fail(`У сцены нет ни одного слоя (${theme} тема)`);
  if (!state.veil) fail(`У сцены нет полога — текст игры лёг бы прямо на рисунок (${theme} тема)`);
  // Касания обязаны идти сквозь: сцена лежит поверх всей страницы.
  if (state.pointerEvents !== 'none') fail(`Сцена ловит касания: pointer-events = ${state.pointerEvents} (${theme} тема)`);
  if (Number(state.containerZ) <= Number(state.zIndex || 0)) {
    fail(`Экран игры не поднят над сценой: контейнер ${state.containerZ}, сцена ${state.zIndex} (${theme} тема)`);
  }
  if (state.bodyBackgroundImage !== 'none') fail(`Плоский фон ${theme} темы остался поверх сцены`);
  return true;
};

/*
  Снимок одной только сцены: содержимое игры прячется, чтобы мерилась картина,
  а не карточки поверх неё.
*/
const shootScene = async () => {
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
  return decodePng(shot);
};

/** Средняя яркость верхней трети — там стоят заголовок игры и подпись под ним. */
const topBrightness = async () => {
  const image = await shootScene();
  return meanLuminance(image, { bottom: image.height / 3 });
};

/** То же, но без полога: видно, что именно он гасит. */
const rawTopBrightness = async () => {
  await page.evaluate(() => { document.querySelector('.game-scene__veil')?.style.setProperty('display', 'none'); });
  const value = await topBrightness();
  await page.evaluate(() => { document.querySelector('.game-scene__veil')?.style.removeProperty('display'); });
  return value;
};

/** Тот же экран со слоями и без них: насколько картина проступает сквозь полог. */
const artShowThrough = async () => {
  const withArt = await shootScene();
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('.game-scene__layer')) node.style.visibility = 'hidden';
  });
  await page.waitForTimeout(120);
  const withoutArt = await shootScene();
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('.game-scene__layer')) node.style.visibility = '';
  });
  return { showThrough: meanAbsoluteDifference(withArt, withoutArt), darkest: blockLuminanceBounds(withArt).min };
};

/*
  Пороги подобраны замерами, а не на глаз.

  Тёмная тема, верхняя треть. Без полога верх «Алиаса» светит на 0.25,
  «Соглядатая» — на 0.14. Прежний слабый полог опускал их до 0.18 и 0.12, и на
  первом же снимке «Выберите уровень сложности» тонуло в облаках. Нынешний даёт
  0.12 и 0.09. Предел 0.15 проходит нынешний и не проходит прежний.

  Светлая тема, самый тёмный квадрат экрана. Тёмные буквы боятся не яркого
  пятна, а тёмного, и одно такое пятно в средней яркости растворяется — поэтому
  меряется худшее место, а не общее. Сейчас по всем сценам выходит 0.83–0.84;
  без светлого полога — 0.42–0.48. Предел 0.70 разделяет их с запасом.

  Светлая тема, проступание. Полог можно сделать непрозрачным, и читаемость от
  этого только выиграет — но тогда светлой темы не коснулись вовсе, а просто
  спрятали от неё картину. Сейчас по играм выходит 0.044–0.065, у глухого
  полога — 0.003. Предел 0.02 ловит именно этот случай.
*/
const MAX_TOP_BRIGHTNESS = 0.15;
const MIN_LIGHT_DARKEST = 0.7;
const MIN_LIGHT_SHOW_THROUGH = 0.02;

try {
  await page.goto(`${baseURL}/#tgWebAppData=query_id%3Dstub`, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 })
    .catch(() => fail(`Меню не открылось${pageErrors.length ? `: ${pageErrors[0]}` : ''}`));
  await page.waitForFunction(() => !document.getElementById('gamehub-boot-scene'), null, { timeout: 20_000 });

  // 1. Тёмная тема: сцена встаёт под экран игры.
  await setTheme(true);
  await openGame('alias');
  await page.waitForTimeout(500);
  let state = await sceneState();
  if (checkSceneShell(state, 'тёмной') && state.key !== 'alias') {
    fail(`Сцена показывает «${state.key}» вместо «alias»`);
  }

  // 2. Тёмная тема, читаемость: белый заголовок игры не должен тонуть в облаках.
  for (const key of ['alias', 'spy']) {
    await openGame(key);
    await page.waitForTimeout(700);
    const brightness = await topBrightness();
    if (brightness > MAX_TOP_BRIGHTNESS) {
      const raw = await rawTopBrightness();
      fail(`Сцена «${key}» слишком светлая сверху: ${brightness.toFixed(3)} при пределе ${MAX_TOP_BRIGHTNESS} `
        + `(сама картина светит на ${raw.toFixed(3)}, полог гасит недостаточно) — заголовок игры на ней не прочесть`);
    }
  }

  // 3. Светлая тема: та же сцена, но переосмысленная — картина видна, текст тёмный.
  await setTheme(false);
  await openGame('alias');
  await page.waitForTimeout(500);
  state = await sceneState();
  checkSceneShell(state, 'светлой');
  for (const key of ['alias', 'spy']) {
    await openGame(key);
    await page.waitForTimeout(700);
    const { showThrough, darkest } = await artShowThrough();
    if (darkest < MIN_LIGHT_DARKEST) {
      fail(`Сцена «${key}» в светлой теме оставляет тёмное пятно: ${darkest.toFixed(3)} при минимуме `
        + `${MIN_LIGHT_DARKEST} — тёмный текст на нём не прочесть`);
    }
    if (showThrough < MIN_LIGHT_SHOW_THROUGH) {
      fail(`Сцена «${key}» в светлой теме не проступает сквозь полог: ${showThrough.toFixed(4)} при минимуме `
        + `${MIN_LIGHT_SHOW_THROUGH} — картину просто закрасили, светлая тема её не получила`);
    }
  }

  /*
    4. Облегчённый полог отдельных игр жив. У «Квартета» и «Художника» поле
    занимает почти весь экран и само по себе тёмное, поэтому полог им сделан
    слабее общего. Правило это легко теряется молча: тёмную тему приложение
    выводит из тех же файлов машинально и дописывает копиям !important, а копия
    с !important сильнее любого правила без него. На вид разница неброская —
    поймать её может только сравнение.
  */
  await setTheme(true);
  const veilOf = async (key) => {
    await openGame(key);
    await page.waitForTimeout(300);
    return page.evaluate(() => getComputedStyle(document.querySelector('.game-scene__veil')).backgroundImage);
  };
  const commonVeil = await veilOf('alias');
  for (const key of ['quartet', 'bible-sketch', 'bible-wordsearch']) {
    if (await veilOf(key) === commonVeil) {
      fail(`У «${key}» полог стал общим — облегчённое правило проиграло тёмной теме`);
    }
  }
  await setTheme(false);

  // 5. Своя сцена у каждой игры, а не одна на всех.
  await openGame('spy');
  await page.waitForTimeout(300);
  state = await sceneState();
  if (state.key !== 'spy') fail(`При переходе в «Соглядатая» сцена осталась «${state.key}»`);

  // 6. У «Моисея на Ниле» свой мир во весь экран — чужой фон под ним не нужен.
  await openGame('moses-nile');
  state = await sceneState();
  if (state.present && state.display !== 'none') fail('У «Моисея на Ниле» под трёхмерным миром висит лишняя сцена');

  // 7. Возврат в меню сцену убирает: у меню свой параллакс.
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
console.log(`OK: живой фон игр — ${catalogKeys.length} сцен, встают под экран игры и меняются вместе с ней в обеих темах; `
  + 'в тёмной верх сцены достаточно тёмен для белого заголовка, в светлой нет тёмных пятен под тёмным текстом, '
  + 'но картина сквозь полог видна; касания идут сквозь, а меню и «Моисей на Ниле» остаются со своим.');
