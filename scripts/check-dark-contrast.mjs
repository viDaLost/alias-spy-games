// Проверяет читаемость текста в тёмной теме.
//
// Тема выводится механически: генератор отражает светлоту каждого цвета. Для
// фона это верно, для текста — почти всегда, но не для белых букв на цветной
// кнопке: там белый превращался в #141414, и «Опубликовать мой рейтинг»
// показывала почти чёрные буквы на тёмно-синем — контраст 1.74 при пороге 4.5.
// Так и написал человек в отзыве: «сделать светлее шрифт на тёмных кнопках».
//
// Дефект этого рода не виден в светлой теме, не ломает ни одной проверки и
// возвращается от любой правки генератора — поэтому он закреплён здесь.
//
// Второе: стили окон опросов вставляет скрипт, и генератор их не видит — он
// читает только файлы стилей. Без собственного тёмного блока такое окно
// остаётся белым листом посреди тёмного приложения.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const { chromium } = await import('playwright-core');
const root = path.resolve(process.cwd());

// Текст в тёмной теме всегда лежит на тёмной поверхности, поэтому тёмным он
// быть не может. Порог с запасом: сейчас самый тёмный текст темы — 0.40.
const MIN_TEXT_LIGHTNESS = 0.35;
const MIN_BUTTON_CONTRAST = 4.5;

const lightness = (hex) => {
  const value = parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
};

// --- 1. в теме нет тёмного текста ---------------------------------------------
{
  const css = fs.readFileSync(path.join(root, 'web/styles/dark-theme.css'), 'utf8');
  const dark = [...css.matchAll(/(?:^|\s)color: (#[0-9a-f]{6})\b/gm)]
    .map((match) => match[1])
    .filter((hex) => lightness(hex) < MIN_TEXT_LIGHTNESS);
  assert.equal(dark.length, 0,
    `в тёмной теме ${dark.length} объявлений тёмного текста, например ${[...new Set(dark)].slice(0, 4).join(', ')} — на тёмном фоне их не прочесть`);

  // Само правило генератора: без него тема соберётся прежней при первой пересборке.
  const generator = fs.readFileSync(path.join(root, 'scripts/build-dark-theme.mjs'), 'utf8');
  assert.ok(/ink && hsl\.l >/.test(generator),
    'генератор снова отражает светлоту текста — белые буквы на кнопках станут чёрными');
}

// --- 2. у вставляемых скриптом окон есть свой тёмный вид -------------------------
for (const [file, prefix] of [
  ['web/js/referral-survey.js', 'referral-survey'],
  ['web/js/feedback-survey.js', 'feedback-survey'],
]) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.ok(/prefers-color-scheme:\s*dark/.test(source),
    `${file}: окно вставляет свои стили, но тёмного вида у него нет — в тёмной теме это белый лист`);
  assert.ok(new RegExp(`prefers-color-scheme[\\s\\S]{0,900}\\.${prefix}-card\\s*\\{`).test(source),
    `${file}: тёмный блок есть, но карточку окна он не красит`);
}

// --- живой замер ------------------------------------------------------------------
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
// Тема идёт от настройки системы: другого способа её включить в приложении нет.
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark',
});
await context.addInitScript(() => { window.__APP_TELEMETRY_DISABLED__ = true; });

const fail = async (message) => {
  await browser.close();
  server.close();
  console.error(`Проверка контраста не прошла: ${message}`);
  process.exit(1);
};

const page = await context.newPage();
await page.route('https://telegram.org/**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: 'window.Telegram={WebApp:{initData:"user=%7B%22id%22%3A5883903220%7D&hash=qa",'
    + 'initDataUnsafe:{user:{id:5883903220,username:"root"}},ready(){},expand(){},setHeaderColor(){},'
    + 'setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},openLink(){},'
    + 'disableVerticalSwipes(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};',
}));
for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**', 'https://*.workers.dev/**']) {
  await page.route(pattern, (route) => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch { /* не наш запрос */ }
    const action = String((body?.payload || body || {}).action || '');
    const answer = (value) => route.fulfill({
      status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(value),
    });
    // Вопрос «откуда узнали» ещё не отвечен — окно выйдет, и его будет чем мерить.
    if (action === 'referralStatus') return answer({ ok: true, success: true, answered: false });
    if (action === 'ratingSync') {
      return answer({ success: true, player: { name: '', published: false, points: 40, breakdown: {} }, breakdown: {} });
    }
    if (action === 'ratingTop') return answer({ success: true, top: [], totalPublished: 0, me: { published: false, points: 40 } });
    return answer({ success: true, isBanned: false, lastGames: [] });
  });
}

await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(3200);

/** Контраст текста узла к его ближайшему непрозрачному фону — как это видит глаз. */
const measure = (selector) => page.evaluate((css) => {
  const luminance = (rgb) => {
    const channel = (value) => {
      const v = value / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  };
  const parse = (text) => {
    const match = String(text).match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(',').map(Number);
    return { rgb: [parts[0], parts[1], parts[2]], a: parts.length > 3 ? parts[3] : 1 };
  };
  const node = document.querySelector(css);
  if (!node) return null;
  const style = getComputedStyle(node);
  const gradient = style.backgroundImage.match(/rgba?\([^)]+\)/g) || [];
  let background = gradient.length ? parse(gradient[0]) : parse(style.backgroundColor);
  let parent = node.parentElement;
  while ((!background || background.a < 0.5) && parent) {
    const outer = getComputedStyle(parent);
    background = parse(outer.backgroundColor);
    parent = parent.parentElement;
  }
  const foreground = parse(style.color);
  if (!foreground || !background) return null;
  const a = luminance(foreground.rgb);
  const b = luminance(background.rgb);
  return {
    ratio: Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)),
    color: style.color,
    background: `rgb(${background.rgb.join(', ')})`,
    backgroundLightness: Number(((Math.max(...background.rgb) + Math.min(...background.rgb)) / 510).toFixed(2)),
  };
}, selector);

// --- 3. окно опроса не белое ---------------------------------------------------------
const survey = await measure('.referral-survey-card');
if (!survey) await fail('окно опроса не показалось — мерить нечего');
if (survey.backgroundLightness > 0.5) {
  await fail(`окно опроса в тёмной теме белое (${survey.background}) — оно вставляет свои стили и требует своего тёмного блока`);
}

// --- 4. главная кнопка читается ------------------------------------------------------
await page.evaluate(() => document.querySelector('.referral-survey-later')?.click());
await page.waitForTimeout(400);
await page.evaluate(() => document.getElementById('leaderboard-btn')?.click());
await page.waitForTimeout(3500);

const primary = await measure('.lb-primary');
if (!primary) await fail('главная кнопка рейтинга не найдена');
if (primary.ratio < MIN_BUTTON_CONTRAST) {
  await fail(`«Опубликовать мой рейтинг»: ${primary.color} на ${primary.background} — контраст ${primary.ratio} при пороге ${MIN_BUTTON_CONTRAST}`);
}

console.log('Контраст тёмной темы в порядке: тёмного текста в теме нет, генератор оставляет светлые буквы '
  + `светлыми, окна опросов не белые, а главная кнопка рейтинга читается с контрастом ${primary.ratio}.`);

await browser.close();
server.close();
