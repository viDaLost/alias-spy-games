// Подсказка в «Библейских словах» открывает то, чего на поле ещё не видно.
//
// Отзыв: «иногда при нажатии на подсказку открывается буква или слово, которое
// уже есть в кроссворде». Причин было три, и проверка ловит каждую:
//
// 1. Подсказка брала любую клетку неразгаданного слова — и клетку на
//    пересечении с уже найденным словом тоже. Буква там уже стояла, звёзды
//    списывались, на поле ничего не прибавлялось.
// 2. «Слово» за 20⭐ могло выбрать слово, все буквы которого уже видны через
//    пересечения и подсказки.
// 3. Кроссворд собирается заново при каждом входе и ложится то по
//    горизонтали, то по вертикали, а открытые буквы хранились номерами клеток.
//    После возвращения на уровень они оказывались не на своих местах.
//
// Поэтому здесь находится одно слово, затем подсказка нажимается, пока есть
// что открывать, и каждое нажатие обязано прибавить на поле ровно одну букву;
// потом «Слово» не должно брать звёзды; потом уровень открывается заново
// несколько раз — и ни одна открытая буква не должна потеряться.
//
//     node scripts/check-bible-wow-hint.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { skipFirstRunRules } from './lib/rules-sheet.mjs';

const root = process.cwd();
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
]);

const first = JSON.parse(fs.readFileSync(path.join(root, 'web/data/bible_wow_levels.json'), 'utf8')).levels[0];
// Самое длинное слово пересекает больше всего остальных — пересечений, на
// которых спотыкалась подсказка, будет больше.
const FOUND = [...first.words].sort((a, b) => b.length - a.length)[0];
const REENTRIES = 6;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const target = path.resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

let summary = '';
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    window.__APP_TELEMETRY_DISABLED__ = true;
    // Звёзд с запасом: проверяется подсказка, а не бережливость.
    if (!sessionStorage.getItem('wow-hint-seeded')) {
      sessionStorage.setItem('wow-hint-seeded', '1');
      localStorage.setItem('bibleWowData_v5', JSON.stringify({ coins: 500, levelIndex: 0 }));
      localStorage.setItem('bibleWowCoinsFix_v1', 'done');
    }
  });
  await skipFirstRunRules(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
  await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
    contentType: 'text/javascript; charset=utf-8',
    body: "window.Telegram={WebApp:{initData:'',initDataUnsafe:{user:{id:999999,first_name:'QA'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},disableVerticalSwipes(){},openTelegramLink(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};",
  }));
  const reply = JSON.stringify({ success: true, isBanned: false, wowStars: 0, wsStars: 0, lastGames: [] });
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
    await page.route(pattern, (route) => route.fulfill({ contentType: 'application/json', body: reply }));
  }

  await page.goto(baseURL, { waitUntil: 'commit', timeout: 20_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 15_000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting')
    && !document.documentElement.classList.contains('app-menu-preparing'), null, { timeout: 10_000 });

  async function enterLevel() {
    await page.evaluate(() => window.showGame('bible-wow'));
    await page.waitForSelector('.wow-cell', { timeout: 15_000 });
    await page.waitForFunction(() => {
      const button = document.querySelector('.wow-btn-let');
      if (!button) return false;
      const rect = button.getBoundingClientRect();
      return !!document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('#wow-wheel');
    }, null, { timeout: 15_000 });
  }

  /** Поле, каким его видит человек: сколько клеток и какие буквы в них видны. */
  const board = () => page.evaluate(() => {
    const cells = [...document.querySelectorAll('#wow-grid .wow-cell, .wow-cell')];
    const open = cells.filter((cell) => cell.textContent.trim());
    return {
      total: cells.length,
      open: open.length,
      letters: open.map((cell) => cell.textContent.trim()).sort().join(''),
      stars: Number(document.getElementById('wow-score')?.textContent || 0),
      message: document.getElementById('wow-bonus-msg')?.textContent || '',
    };
  });

  async function spell(word) {
    const points = await page.evaluate((text) => {
      const buttons = [...document.querySelectorAll('.wow-btn-let')];
      const used = new Set();
      const out = [];
      for (const letter of text) {
        const button = buttons.find((one) => one.dataset.letter === letter && !used.has(one.dataset.idx));
        if (!button) return null;
        used.add(button.dataset.idx);
        const rect = button.getBoundingClientRect();
        out.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
      return out;
    }, word);
    if (!points) throw new Error(`на колесе не хватило букв для «${word}»`);
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  }

  await enterLevel();
  await spell(FOUND);
  const start = await board();
  check(start.message === 'Отлично!', `основное слово «${FOUND}» не засчитано: «${start.message}»`);
  const hidden = start.total - start.open;
  check(hidden > 0, 'после одного слова на поле не осталось закрытых букв — проверять нечего');

  // 1. Подсказка, пока есть что открывать: каждая — ровно одна новая буква.
  let before = start;
  let wasted = 0;
  let presses = 0;
  while (presses < hidden + 3) {
    await page.click('#wow-hint');
    presses += 1;
    await page.waitForTimeout(80);
    const after = await board();
    if (after.stars === before.stars) break;
    if (after.open !== before.open + 1) wasted += 1;
    before = after;
    if (after.open === after.total) break;
  }
  check(wasted === 0, `${wasted} из ${presses} подсказок списали 6⭐ и не открыли на поле новой буквы`);
  check(before.open === before.total, `подсказки открыли ${before.open - start.open} букв из ${hidden} закрытых`);
  check(before.stars === start.stars - hidden * 6, `за ${hidden} букв списано ${start.stars - before.stars}⭐ вместо ${hidden * 6}`);

  // 2. Лишняя подсказка и «Слово», когда всё уже видно, звёзд не берут.
  await page.waitForTimeout(1500);
  await page.click('#wow-hint');
  await page.waitForTimeout(80);
  const extraHint = await board();
  check(extraHint.stars === before.stars, `подсказка при открытом поле списала ${before.stars - extraHint.stars}⭐`);
  await page.click('#wow-reveal');
  await page.waitForTimeout(80);
  const extraWord = await board();
  check(extraWord.stars === before.stars, `«Слово» при открытом поле списало ${before.stars - extraWord.stars}⭐ за уже видное слово`);
  check(/уже открыты/.test(extraWord.message), `«Слово» при открытом поле ответило «${extraWord.message}»`);

  // 3. Уровень заново: открытое остаётся открытым, как бы ни лёг кроссворд.
  const lost = [];
  for (let round = 0; round < REENTRIES; round += 1) {
    await page.evaluate(() => (window.appGoToMainMenu || window.goToMainMenu)?.());
    await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
    await enterLevel();
    const again = await board();
    if (again.open !== again.total || again.letters !== before.letters) {
      lost.push(`вход ${round + 1}: открыто ${again.open} из ${again.total}`);
    }
  }
  check(lost.length === 0, `после возвращения на уровень открытые буквы потерялись или сдвинулись: ${lost.join('; ')}`);
  check(pageErrors.length === 0, `ошибки на странице: ${pageErrors.join(' | ')}`);

  summary = `после «${FOUND}» ${hidden} подсказок открыли ${hidden} новых букв по 6⭐, лишняя подсказка и «Слово» при `
    + `открытом поле звёзд не взяли, и ${REENTRIES} возвращений на уровень ни одной буквы не потеряли`;
  await context.close();
} catch (error) {
  failures.push(String(error.message).split('\n')[0]);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`Подсказка в «Библейских словах» не прошла проверку (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`OK: подсказка в «Библейских словах» открывает только закрытое — ${summary}.`);
