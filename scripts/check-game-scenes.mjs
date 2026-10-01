// Живой фон игры: одна и та же сцена в обеих темах.
//
// Перенос из превью-веток конца августа. Там у каждой игры была своя сцена со
// слоями, но жила она рядом с полной переделкой приложения в тёмный вид — с
// перекрытием заголовка, меню и панелей каждой игры через !important. Взята
// только сцена; тему решают стили.
//
// Сцена в обеих темах одна и та же, в полном цвете: полог гасит светлые места,
// чтобы заголовок игры не пропал в облаках, текст прямо на картине светлый, а
// панели светлой темы плотные. Прежде светлая тема прятала картину под
// молочный полог — экран выглядел так, будто стоит под белым стеклом, — и
// проверка теперь стережёт обратное. Всё меряется по снимку экрана и по
// вычисленным стилям: разметка тут ничего не докажет, элементы на месте и в
// нечитаемом виде.
//
// Глубина проверяется движением: наклон уводит ближние слои дальше дальних,
// «дыхание» камеры идёт на каждом слое с глубиной, и ни в одной крайней точке
// хода из-под слоя не выглядывает край.
//
// Проверяется поведением, а не чтением стилей: приложение поднимается целиком,
// игры открываются по-настоящему, тема переключается на живой странице.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePng, meanLuminance, meanAbsoluteDifference } from './lib/png-luminance.mjs';

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
  /*
    Датчик наклона Telegram. Сцена берёт его у клиента, а не у браузера, и
    обязана включать только вместе с собой: здесь считается, сколько раз его
    запустили и остановили, и кто подписан на его события.
  */
  const sensor = { started: 0, stopped: 0, listeners: [] };
  window.__tiltSensor = sensor;
  window.Telegram = {
    WebApp: {
      initData: 'query_id=stub&user=%7B%22id%22%3A5883903220%7D&hash=stub',
      initDataUnsafe: { user: { id: 5883903220, first_name: 'Тест' } },
      ready() {}, expand() {}, colorScheme: 'light',
      onEvent(name, handler) { if (name === 'deviceOrientationChanged') sensor.listeners.push(handler); },
      offEvent(name, handler) { sensor.listeners = sensor.listeners.filter((one) => one !== handler); },
      isVersionAtLeast: (version) => Number(version) <= 8,
      DeviceOrientation: {
        isStarted: false, alpha: 0, beta: 0, gamma: 0,
        start() { this.isStarted = true; sensor.started += 1; },
        stop() { this.isStarted = false; sensor.stopped += 1; },
      },
      setHeaderColor() {}, setBackgroundColor() {},
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
  /*
    «Дыхание» камеры выключено на слабых телефонах — четыре ядра и меньше. У
    машины проверки ядер может оказаться сколько угодно, и без этой подмены
    проверка то видела бы анимацию, то нет.
  */
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8, configurable: true });
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
  Общая часть — «сцена стоит под экраном игры и не мешает» — проверяется
  одинаково в обеих темах.
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
  Сцена в покое. Слои движутся сами — «дышат» и наезжают при входе, — и два
  снимка подряд без этого расходились бы на несколько пикселей сдвига. Наезд
  доводится до конца, «дыхание» ставится в начало круга, камера — в центр.
*/
const stillScene = () => page.evaluate(() => {
  for (const node of document.querySelectorAll('.game-scene__layer')) {
    for (const animation of node.getAnimations()) {
      if (animation.effect.getTiming().iterations === Infinity) {
        animation.pause();
        animation.currentTime = 0;
      } else animation.finish();
    }
  }
  window.__gameScene?.pose();
});

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
  await stillScene();
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
const topBrightness = (image) => meanLuminance(image, { bottom: image.height / 3 });

/** То же, но без полога: видно, что именно он гасит. */
const rawTopBrightness = async () => {
  await page.evaluate(() => { document.querySelector('.game-scene__veil')?.style.setProperty('display', 'none'); });
  const value = topBrightness(await shootScene());
  await page.evaluate(() => { document.querySelector('.game-scene__veil')?.style.removeProperty('display'); });
  return value;
};

/*
  Что лежит прямо на сцене. Текст, у которого между буквами и картиной нет ни
  одной подложки, и светлые панели, которые стоят на картине сами, а не внутри
  другой панели. Подложкой считается заливка плотнее 0.55 или градиент.
*/
const onScene = () => page.evaluate(() => {
  const channels = (text) => [...String(text).matchAll(/rgba?\(([^)]*)\)/g)].map((match) => {
    const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1 };
  });
  const luminance = ([r, g, b]) => {
    const linear = (value) => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  };
  const container = document.getElementById('game-container');
  const surfaceOf = (start) => {
    for (let node = start; node && node !== container.parentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      const fill = channels(style.backgroundColor)[0];
      if ((fill && fill.alpha >= 0.55) || style.backgroundImage !== 'none') return node;
    }
    return null;
  };
  const visible = (node) => {
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    for (let at = node; at && at !== document.body; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  };

  const text = [];
  const seen = new Set();
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode.parentElement;
    if (!walker.currentNode.textContent.trim() || seen.has(node)) continue;
    seen.add(node);
    if (!visible(node) || surfaceOf(node)) continue;
    const ink = channels(getComputedStyle(node).color)[0];
    if (ink) text.push({ text: walker.currentNode.textContent.trim().slice(0, 40), luminance: luminance(ink.rgb) });
  }

  const panels = [];
  for (const node of container.querySelectorAll('*')) {
    const box = node.getBoundingClientRect();
    if (box.width < 40 || box.height < 28 || !visible(node) || surfaceOf(node.parentElement)) continue;
    const style = getComputedStyle(node);
    // Картинка вместо заливки — это рисунок, а не стекло; плотность у него своя.
    if (style.backgroundImage.includes('url(') || Number(style.opacity) < 1) continue;
    const fill = channels(style.backgroundColor)[0] || { rgb: [0, 0, 0], alpha: 0 };
    // Слои фона разделены запятыми верхнего уровня; запятые внутри скобок — это
    // аргументы градиента.
    const layers = [];
    let depth = 0;
    let from = 0;
    const image = style.backgroundImage === 'none' ? '' : style.backgroundImage;
    for (let at = 0; at <= image.length; at += 1) {
      const char = image[at];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      else if ((char === ',' && !depth) || at === image.length) {
        if (image.slice(from, at).trim()) layers.push(channels(image.slice(from, at)));
        from = at + 1;
      }
    }
    const all = [fill, ...layers.flat()].filter((one) => one.alpha > 0.02);
    // Только белые панели: у цветных кнопок своя заливка, и серыми они не станут.
    if (!all.length || all.some((one) => (one.rgb[0] + one.rgb[1] + one.rgb[2]) / 3 < 200)) continue;
    // Слои кладутся друг на друга: плотность каждого — его самое прозрачное место,
    // а сквозь всю стопку проходит то, что пропустили все слои разом. Блик,
    // уходящий в прозрачность, поверх плотного градиента панели не делает её
    // прозрачной.
    const through = layers.reduce(
      (rest, stops) => rest * (1 - (stops.length ? Math.min(...stops.map((one) => one.alpha)) : 0)),
      1 - fill.alpha,
    );
    const density = 1 - through;
    panels.push({ name: `${node.tagName.toLowerCase()}.${String(node.className).trim().split(/\s+/).join('.')}`, density });
  }
  return { text, panels };
});

/*
  Пороги подобраны замерами, а не на глаз.

  Верхняя треть, обе темы. Без полога верх «Алиаса» светит на 0.25,
  «Соглядатая» — на 0.14. Прежний слабый полог опускал их до 0.18 и 0.12, и на
  первом же снимке «Выберите уровень сложности» тонуло в облаках. Нынешний даёт
  0.11 и 0.07 в тёмной теме и 0.14 и 0.10 в светлой — там слоям не досталось
  общего затемнения картинок тёмной темы. Предел 0.15 проходит нынешний и не
  проходит прежний.

  Светлая тема против тёмной. Сцена одна и та же, и снимки обеих тем
  расходятся на 0.003–0.02 — ровно на то общее затемнение. Под прежним
  молочным пологом расхождение было 0.6 и больше. Предел 0.05 ловит любой
  возврат к белому стеклу, даже вдесятеро более лёгкому.

  Текст на сцене светлый: относительная яркость букв не ниже 0.5 — белый с
  тенью даёт 0.87–0.9, а тёмно-синий заголовок светлой темы 0.04.

  Панели светлой темы на сцене плотные: не меньше 0.9. Задуманы они были от
  0.54 до 0.88, и над ночной картиной такие становились грязно-серыми; с
  подложкой выходит 0.94 и выше.
*/
const MAX_TOP_BRIGHTNESS = 0.15;
const MAX_THEME_DIFFERENCE = 0.05;
const MIN_SCENE_TEXT_LUMINANCE = 0.5;
const MIN_PANEL_DENSITY = 0.9;

try {
  await page.goto(`${baseURL}/#tgWebAppData=query_id%3Dstub`, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 })
    .catch(() => fail(`Меню не открылось${pageErrors.length ? `: ${pageErrors[0]}` : ''}`));
  await page.waitForFunction(() => !document.getElementById('gamehub-boot-scene'), null, { timeout: 20_000 });

  // 1. Обе темы: сцена встаёт под экран игры.
  for (const dark of [true, false]) {
    const theme = dark ? 'тёмной' : 'светлой';
    await setTheme(dark);
    await openGame('alias');
    await page.waitForTimeout(500);
    const state = await sceneState();
    if (checkSceneShell(state, theme) && state.key !== 'alias') {
      fail(`Сцена показывает «${state.key}» вместо «alias» (${theme} тема)`);
    }
  }

  /*
    2. Читаемость сверху и одна картина на обе темы. Белый заголовок игры не
    должен тонуть в облаках ни в одной теме, а светлая не должна прятать
    картину под белым стеклом: её снимок обязан совпасть со снимком тёмной.
  */
  for (const key of ['alias', 'spy']) {
    const shots = {};
    for (const dark of [true, false]) {
      const theme = dark ? 'тёмной' : 'светлой';
      await setTheme(dark);
      await openGame(key);
      await page.waitForTimeout(700);
      shots[theme] = await shootScene();
      const brightness = topBrightness(shots[theme]);
      if (brightness > MAX_TOP_BRIGHTNESS) {
        const raw = await rawTopBrightness();
        fail(`Сцена «${key}» в ${theme} теме слишком светлая сверху: ${brightness.toFixed(3)} при пределе `
          + `${MAX_TOP_BRIGHTNESS} (сама картина светит на ${raw.toFixed(3)}, полог гасит недостаточно) — `
          + 'заголовок игры на ней не прочесть');
      }
    }
    const difference = meanAbsoluteDifference(shots['тёмной'], shots['светлой']);
    if (difference > MAX_THEME_DIFFERENCE) {
      fail(`Сцена «${key}» в светлой теме не та же, что в тёмной: расхождение ${difference.toFixed(3)} при пределе `
        + `${MAX_THEME_DIFFERENCE} — картину снова высветлили или накрыли пологом, экран под белым стеклом`);
    }
  }

  /*
    3. Светлая тема, всё, что лежит прямо на картине. Каждая игра каталога, кроме
    «Сокровищ»: те открываются своим лаунчером, а на сцене у них нет ни строки
    — всё стоит в плотных белых панелях.
  */
  await setTheme(false);
  for (const key of catalogKeys.filter((one) => one !== 'biblical-match-three')) {
    await openGame(key);
    await page.waitForTimeout(400);
    const { text, panels } = await onScene();
    for (const line of text) {
      if (line.luminance < MIN_SCENE_TEXT_LUMINANCE) {
        fail(`«${key}», светлая тема: текст «${line.text}» лежит прямо на картине и тёмный `
          + `(яркость ${line.luminance.toFixed(2)}) — его нет в списке светлого текста game-scene-parallax.css`);
      }
    }
    for (const panel of panels) {
      if (panel.density < MIN_PANEL_DENSITY) {
        fail(`«${key}», светлая тема: панель ${panel.name} на картине прозрачна на ${(1 - panel.density).toFixed(2)} `
          + '— над ночной сценой она становится грязно-серой; её нет в списке плотных панелей game-scene-parallax.css');
      }
    }
  }

  /*
    4. Облегчённый полог отдельных игр жив в обеих темах. У «Квартета» и
    «Художника» поле занимает почти весь экран и само по себе тёмное, поэтому
    полог им сделан слабее общего. Правило это легко теряется молча: тёмную тему
    приложение выводит из тех же файлов машинально и дописывает копиям
    !important, а копия с !important сильнее любого правила без него. На вид
    разница неброская — поймать её может только сравнение.
  */
  const veilOf = async (key) => {
    await openGame(key);
    await page.waitForTimeout(300);
    return page.evaluate(() => getComputedStyle(document.querySelector('.game-scene__veil')).backgroundImage);
  };
  for (const dark of [true, false]) {
    await setTheme(dark);
    const commonVeil = await veilOf('alias');
    for (const key of ['quartet', 'bible-sketch', 'bible-wordsearch']) {
      if (await veilOf(key) === commonVeil) {
        fail(`У «${key}» полог стал общим в ${dark ? 'тёмной' : 'светлой'} теме — облегчённое правило проиграло`);
      }
    }
  }
  await setTheme(false);

  // 5. Своя сцена у каждой игры, а не одна на всех.
  await openGame('spy');
  await page.waitForTimeout(300);
  let state = await sceneState();
  if (state.key !== 'spy') fail(`При переходе в «Соглядатая» сцена осталась «${state.key}»`);

  /*
    6. Глубина. Наклон телефона приходит от Telegram в радианах; ближний слой
    обязан уйти заметно дальше дальнего, иначе это сдвиг картинки, а не объём.
    «Дыхание» камеры идёт на каждом слое, у которого есть глубина.
  */
  for (const key of ['alias', 'spy']) {
    await openGame(key);
    await page.waitForTimeout(400);
    const motion = await page.evaluate(async () => {
      const app = window.Telegram.WebApp;
      const tilt = (beta, gamma) => {
        app.DeviceOrientation.beta = beta;
        app.DeviceOrientation.gamma = gamma;
        for (const handler of window.__tiltSensor.listeners) handler();
      };
      tilt(0.7, 0);
      await new Promise((resolve) => setTimeout(resolve, 40));
      tilt(0.7, 0.3);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return [...document.querySelectorAll('.game-scene__layer')].map((node) => ({
        depth: Number(node.dataset.depth),
        shift: Math.abs(parseFloat(node.style.getPropertyValue('--layer-x')) || 0),
        breathing: node.getAnimations().some((animation) => animation.effect.getTiming().iterations === Infinity),
      }));
    });
    const sorted = [...motion].sort((a, b) => a.depth - b.depth);
    const far = sorted[0];
    const near = sorted[sorted.length - 1];
    if (!near?.shift) fail(`Сцена «${key}» не откликается на наклон телефона`);
    else if (near.shift < far.shift * 3) {
      fail(`Сцена «${key}» на наклоне двигается плоско: ближний слой ушёл на ${near.shift.toFixed(1)} px, `
        + `дальний на ${far.shift.toFixed(1)} px — глубины не видно`);
    }
    const still = motion.filter((layer) => layer.depth > 0 && !layer.breathing);
    if (still.length) fail(`Сцена «${key}»: ${still.length} слоёв с глубиной не «дышат» — без наклона сцена стоит плоской`);
  }

  /*
    7. Края. Ближний слой ездит дальше всех, и запас по краям у него свой. В
    каждой крайней точке хода — наклон до упора в любую сторону, прокрутка до
    предела, «дыхание» на пике — слой обязан закрывать экран целиком: иначе из-
    под переднего плана выглянет его обрез. Проверяется и в альбомной
    ориентации, где высоты мало и вертикальный ход другой.
  */
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    for (const key of ['alias', 'spy']) {
      await openGame(key);
      await page.waitForTimeout(400);
      const gaps = await page.evaluate(async () => {
        const found = [];
        const layers = [...document.querySelectorAll('.game-scene__layer')];
        for (const x of [-1, 1]) {
          for (const y of [-1, 1]) {
            for (const scroll of [0, 1e5]) {
              for (const phase of [0.125, 0.25, 0.375, 0.75]) {
                for (const node of layers) {
                  for (const animation of node.getAnimations()) {
                    const { iterations, duration } = animation.effect.getTiming();
                    animation.pause();
                    if (iterations === Infinity) animation.currentTime = duration * phase;
                    else animation.finish();
                  }
                }
                window.__gameScene.pose({ x, y, scroll });
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                for (const node of layers) {
                  const box = node.getBoundingClientRect();
                  const gap = Math.min(-box.left, -box.top, box.right - innerWidth, box.bottom - innerHeight);
                  if (gap < -0.5) found.push(`глубина ${node.dataset.depth}: ${gap.toFixed(1)} px`);
                }
              }
            }
          }
        }
        window.__gameScene.pose();
        for (const node of layers) for (const animation of node.getAnimations()) animation.play();
        return [...new Set(found)];
      });
      if (gaps.length) {
        fail(`Сцена «${key}» на ${viewport.width}×${viewport.height} в крайней точке хода открывает край слоя: `
          + gaps.slice(0, 3).join(', '));
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // 8. У «Моисея на Ниле» свой мир во весь экран — чужой фон под ним не нужен.
  await openGame('moses-nile');
  state = await sceneState();
  if (state.present && state.display !== 'none') fail('У «Моисея на Ниле» под трёхмерным миром висит лишняя сцена');

  // 9. Возврат в меню сцену убирает: у меню свой параллакс. И датчик наклона
  // уходит вместе со сценой — в меню он только тратил бы батарею.
  await page.evaluate(() => window.goToMainMenu?.());
  await page.waitForTimeout(400);
  state = await sceneState();
  if (state.present && state.display !== 'none') fail('Сцена игры осталась висеть в меню');
  const sensor = await page.evaluate(() => ({ ...window.__tiltSensor, listeners: window.__tiltSensor.listeners.length }));
  if (!sensor.started) fail('Датчик наклона Telegram ни разу не включился — сцена не знает о наклоне телефона');
  if (sensor.started !== sensor.stopped || sensor.listeners) {
    fail(`Датчик наклона пережил сцену: включён ${sensor.started} раз, выключен ${sensor.stopped}, `
      + `подписок осталось ${sensor.listeners}`);
  }
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
  + 'картина одна и та же в обеих, без белого стекла, верх достаточно тёмен для заголовка, текст на ней светлый, '
  + 'панели плотные; наклон уводит ближние слои дальше дальних, края не открываются, датчик живёт только со сценой; '
  + 'касания идут сквозь, а меню и «Моисей на Ниле» остаются со своим.');
