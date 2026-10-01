// Проверяет фон главного меню: что он возвращается после выхода из игры и что
// подписи секций читаются на нём в обеих темах.
//
// Фон меню — отдельная сцена поверх страницы, и её видимость держится на классе
// is-ready. Игры, которые рисуют своё во весь экран, прячут сцену под собой; та,
// что снимала класс, не возвращала его обратно — сцена возвращалась в разметку,
// но оставалась прозрачной, и меню открывалось на голом фоне. Заметить это можно
// только глазами, поэтому проверяется отдельно.
//
// Вторая беда того же рода — читаемость. Иллюстрация неровная: тёмно-синяя
// архитектура и золото ламп. Тёмная тема гасит её до brightness(.4), и светлые
// подписи читаются прямо по ней. Светлая тема прежде высветляла её и накрывала
// весь экран белой пеленой — меню стояло будто под белым стеклом. Теперь
// картина в полном цвете, а подложку получают только подписи: проверка стережёт
// и то, что пелена не вернулась, и то, что каждая строка, оставшаяся прямо на
// картине, читается на том месте, где стоит. Всё меряется по снимку: в разметке
// всё это выглядит одинаково исправным.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { decodePng, meanLuminance, blockLuminanceBounds } from './lib/png-luminance.mjs';

const root = process.cwd();
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
  response.writeHead(200, { 'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream' });
  response.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const crashes = [];
page.on('pageerror', (error) => crashes.push(String(error?.message || error)));

const fail = async (message) => {
  console.error(`Проверка фона меню не прошла: ${message}`);
  await browser.close();
  server.close();
  process.exit(1);
};

await page.addInitScript(() => {
  window.Telegram = {
    WebApp: {
      initData: 'query_id=stub&user=%7B%22id%22%3A5883903220%7D&hash=stub',
      initDataUnsafe: { user: { id: 5883903220, first_name: 'Тест' } },
      ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
  try {
    const seen = {};
    for (const key of ['spy', 'bible-wow', 'bible-wordsearch', 'sacred-word', 'kids-ark-pairs', 'biblical-match-three']) seen[key] = 1;
    localStorage.setItem('game_rules_seen_v1', JSON.stringify(seen));
  } catch { /* приватный режим */ }
});
const stub = (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ success: true, isBanned: false, lastGames: [], answered: true, rooms: [] }),
});
// На GitHub telegram.org доступен, и настоящий SDK затирает поставленную
// здесь личность: прогресс начинает читаться под чужим ключом, и проверка
// падает только в CI. Отдаём вместо него ту же заглушку.
const telegramSdkStub = (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: `window.Telegram=window.Telegram||{WebApp:{initData:"user=%7B%22id%22%3A5883903220%7D&hash=qa",initDataUnsafe:{user:{id:5883903220,first_name:"Тест"}},ready(){},expand(){},colorScheme:"light",onEvent(){},offEvent(){},MainButton:{show(){},hide(){}},BackButton:{show(){},hide(){},onClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};`,
});
await page.route('https://telegram.org/**', telegramSdkStub);
for (const pattern of ['https://*.workers.dev/**', 'https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, stub);
}

await page.goto(`${baseURL}/#tgWebAppData=query_id%3Dstub`, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(3000);

const sceneState = () => page.evaluate(() => {
  const scene = document.querySelector('.home-gamehub-parallax__scene');
  if (!scene) return null;
  const style = getComputedStyle(scene);
  return {
    hidden: scene.hasAttribute('hidden'),
    ready: scene.classList.contains('is-ready'),
    opacity: Number(style.opacity),
    display: style.display,
  };
});

const before = await sceneState();
if (!before) await fail('сцены фона нет в разметке');
if (before.hidden || before.opacity < 0.9) {
  await fail(`в меню фон не виден: hidden=${before.hidden}, прозрачность ${before.opacity}`);
}

// Игры, которые прячут фон под собой. Художник делал это жёстче остальных,
// поэтому проверяются обе двери: обычная игра и он.
for (const [label, open] of [
  ['обычная игра', () => window.showGame('spy')],
  ['Библейский художник', () => document.getElementById('bible-sketch-card')?.click()],
]) {
  const opened = await page.evaluate(open);
  await page.waitForTimeout(3000);
  const mode = await page.evaluate(() => document.body.dataset.currentGame || '');
  if (!mode) await fail(`не удалось открыть «${label}» (${opened})`);

  await page.evaluate(() => (window.appGoToMainMenu || window.goToMainMenu)?.());
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 15_000 });
  await page.waitForTimeout(1500);

  const after = await sceneState();
  if (after.hidden || after.display === 'none') {
    await fail(`после выхода из «${label}» фон меню остался спрятанным`);
  }
  if (!after.ready || after.opacity < 0.9) {
    await fail(`после выхода из «${label}» фон меню остался прозрачным (is-ready=${after.ready}, прозрачность ${after.opacity})`);
  }
}

/*
  Читаемость подписей на фоне. Мерится сама сцена: всё остальное на странице
  прячется, иначе в замер попадают карточки и кнопки поверх неё.

  Пороги подобраны замерами.

  Светлая тема, картина. С прежней белой пеленой самый тёмный квадрат сцены
  светил на 0.70, без неё — на 0.29: тёмно-синее остаётся тёмно-синим. Предел
  0.45 ловит возврат пелены, даже вдвое более лёгкой.

  Светлая тема, строки прямо на картине. Подписи секций, «Ваш прогресс» и
  «Скрыть» стоят на своих плашках, и прямо на картине остаётся только шапка —
  над светлым центром иллюстрации. Каждая такая строка меряется против
  неудобных мест под собой: для тёмных букв — тёмных, для светлых — светлых.
  Не против одного худшего квадрата: крупный заголовок с бликом читается и
  тогда, когда под одной буквой мелькнула тёмная деталь, — а против десятой
  доли самых неудобных. Контраст не ниже 3:1 — норма WCAG для крупного и
  жирного текста. Шапка даёт 3.4–5.7, подписи без плашек — 1.05–2.5.

  Тёмная тема: подписи светлые, и опасно светлое — с затемнением самый светлый
  квадрат даёт 0.15, без него 0.92. Предел 0.35 стоит между.
*/
const MAX_LIGHT_DARKEST = 0.45;
const MIN_SCENE_TEXT_CONTRAST = 3;
const MAX_DARK_BRIGHTEST = 0.35;

const hideAllButScene = (hidden) => page.evaluate((on) => {
  for (const node of document.body.children) {
    if (!node.classList.contains('home-gamehub-parallax__scene')) node.style.visibility = on ? 'hidden' : '';
  }
}, hidden);

const shootScene = async () => {
  await hideAllButScene(true);
  await page.waitForTimeout(250);
  const shot = decodePng(await page.screenshot({ type: 'png' }));
  await hideAllButScene(false);
  return shot;
};

const sceneBounds = async () => blockLuminanceBounds(await shootScene());

/*
  Строки, у которых между буквами и картиной нет ни одной подложки: ни заливки
  плотнее 0.55, ни градиента. Вместе с ними — яркость букв с учётом их
  собственной прозрачности, наложенной на белое или чёрное не важно: меряется
  цвет, который задан тексту.
*/
const textOnScene = () => page.evaluate(() => {
  const channels = (text) => {
    const match = String(text).match(/rgba?\(([^)]*)\)/);
    if (!match) return null;
    const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1 };
  };
  const luminance = ([r, g, b]) => {
    const linear = (value) => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  };
  const found = [];
  const seen = new Set();
  for (const root of [document.querySelector('.app-header'), document.getElementById('menu-container')]) {
    if (!root) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode.parentElement;
      if (!walker.currentNode.textContent.trim() || seen.has(node)) continue;
      seen.add(node);
      // Меряются сами буквы, а не блок: блок строки тянется во всю ширину
      // экрана, к тёмным иконкам у краёв, до которых текст не доходит.
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      const box = range.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      let covered = false;
      let shown = true;
      for (let at = node; at && at !== document.body; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) { shown = false; break; }
        const fill = channels(style.backgroundColor);
        if ((fill && fill.alpha >= 0.55) || style.backgroundImage !== 'none') { covered = true; break; }
      }
      if (!shown || covered) continue;
      const ink = channels(getComputedStyle(node).color);
      if (!ink) continue;
      found.push({
        text: walker.currentNode.textContent.trim().slice(0, 40),
        top: box.top + window.scrollY, left: box.left, width: box.width, height: box.height,
        luminance: luminance(ink.rgb),
      });
    }
  }
  return found;
});

/*
  Яркость фона под строкой в тех же единицах, что и яркость букв. Снимок
  отдаёт значения в гамме экрана, а контраст по WCAG считается по линейной
  яркости: без перевода тёмный фон казался втрое светлее, и подпись по
  тёмно-синему проходила проверку.
*/
const linear = (value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

/** Квадраты 8×8 под прямоугольником строки, от тёмного к светлому. */
const blocksUnder = (image, box) => {
  const blocks = [];
  const size = 8;
  for (let top = Math.max(0, Math.floor(box.top)); top + size <= Math.min(image.height, box.top + box.height); top += size) {
    for (let left = Math.max(0, Math.floor(box.left)); left + size <= Math.min(image.width, box.left + box.width); left += size) {
      blocks.push(linear(meanLuminance(image, { left, top, right: left + size, bottom: top + size })));
    }
  }
  return blocks.sort((a, b) => a - b);
};

await page.evaluate(() => document.documentElement.classList.remove('theme-dark'));
await page.waitForTimeout(600);
const light = await sceneBounds();
if (light.min > MAX_LIGHT_DARKEST) {
  await fail(`в светлой теме фон меню высветлен: самое тёмное место светит на ${light.min.toFixed(3)} при пределе `
    + `${MAX_LIGHT_DARKEST} — картину снова накрыли белой пеленой`);
}

/*
  Сцена закреплена, а строки едут вместе со страницей и за время прокрутки
  проходят над разными местами картины: подпись секции у левого края побывает
  и над светлым небом, и над тёмными иконками. Поэтому снимков сцены много —
  через каждые 150 пикселей прокрутки, со своим сдвигом слоёв, — и каждая
  строка меряется во всех положениях, где её видно. В зачёт идёт худшее.
*/
const lines = await textOnScene();
const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
const worstContrast = new Map();
for (let wanted = 0; wanted < maxScroll + 150; wanted += 150) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.min(wanted, maxScroll));
  await page.waitForTimeout(450);
  const scroll = await page.evaluate(() => window.scrollY);
  const shot = await shootScene();
  for (const line of lines) {
    const top = line.top - scroll;
    if (top < 0 || top + line.height > shot.height) continue;
    const blocks = blocksUnder(shot, { ...line, top });
    if (!blocks.length) continue;
    // Тёмным буквам мешает тёмное место, светлым — светлое.
    const tenth = Math.floor(blocks.length * 0.1);
    const worst = line.luminance < 0.18 ? blocks[tenth] : blocks[blocks.length - 1 - tenth];
    const contrast = (Math.max(line.luminance, worst) + 0.05) / (Math.min(line.luminance, worst) + 0.05);
    if (contrast < (worstContrast.get(line.text) ?? Infinity)) worstContrast.set(line.text, contrast);
  }
}
for (const [text, contrast] of worstContrast) {
  if (contrast < MIN_SCENE_TEXT_CONTRAST) {
    await fail(`в светлой теме строка «${text}» лежит прямо на картине и местами читается с контрастом `
      + `${contrast.toFixed(2)} при минимуме ${MIN_SCENE_TEXT_CONTRAST} — ей нужна своя плашка`);
  }
}
await page.evaluate(() => window.scrollTo(0, 0));

await page.evaluate(() => document.documentElement.classList.add('theme-dark'));
await page.waitForTimeout(600);
const dark = await sceneBounds();
if (dark.max > MAX_DARK_BRIGHTEST) {
  await fail(`в тёмной теме фон меню светит на ${dark.max.toFixed(3)} при пределе ${MAX_DARK_BRIGHTEST} `
    + '— светлые подписи секций тонут в его подсветке');
}
await page.evaluate(() => document.documentElement.classList.remove('theme-dark'));

if (crashes.length) await fail(`страница поймала исключение: ${crashes[0]}`);

console.log('Фон меню в порядке: он виден при открытии, возвращается после выхода '
  + 'и из обычной игры, и из «Библейского художника»; в светлой теме картина в полном цвете, '
  + 'без белой пелены, и всё, что стоит прямо на ней, читается; в тёмной подписи не тонут в подсветке.');

await browser.close();
server.close();
