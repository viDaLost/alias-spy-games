// Проверка бонусных слов в «Библейских словах» — по отзыву о том, что игра
// отвергает верные слова.
//
// Проверка играет по-настоящему: ведёт пальцем по колесу букв и смотрит, что
// ответила игра. Списком в JSON тут не обойтись — сломаться может и разбор
// набранного слова, и подключение бонусов к уровню, а отзыв был именно про то,
// что видит человек.
//
// Проверяются четыре ответа на одном уровне: основное слово, бонусное, бонусное
// повторно и слово, которого в Библии нет. Последнее — не придирка: если
// принимать всё подряд, бонус перестаёт быть наградой.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { skipFirstRunRules } from './lib/rules-sheet.mjs';

const root = process.cwd();
const failures = [];
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.ico', 'image/x-icon'],
]);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const levels = JSON.parse(fs.readFileSync(path.join(root, 'web/data/bible_wow_levels.json'), 'utf8')).levels;
const first = levels[0];

// Слова для проверки берутся из самих данных, а не вписаны сюда: уровень могут
// переделать, и проверка должна проверять игру, а не своё представление о ней.
const TARGET = [...first.words].sort((a, b) => a.length - b.length)[0];
// Короткое и длинное: короткое набирается двумя движениями, длинное проходит
// через половину колеса, и путь по буквам у них устроен по-разному.
const byLength = [...first.bonus].sort((a, b) => a.length - b.length);
const BONUSES = [...new Set([byLength[0], byLength[byLength.length - 1]])];
const BONUS = BONUSES[0];
// Слово из букв уровня, которого нет ни в основных, ни в бонусных.
const bag = (word) => { const m = new Map(); for (const c of word) m.set(c, (m.get(c) || 0) + 1); return m; };
const fits = (word, b) => { const left = new Map(b); for (const c of word) { const n = left.get(c) || 0; if (!n) return false; left.set(c, n - 1); } return true; };
const known = new Set([...first.words, ...first.bonus]);
const UNKNOWN = ['НОРА', 'РОДИНА', 'ДРОВА', 'АРИЯ', 'ИРОНИЯ']
  .find((word) => !known.has(word) && fits(word, bag(first.letters)));

// Отдельная ветка: без этих слов проверять нечего, и сказать об этом надо так
// же понятно, как о неудаче в самой игре. Пустой список бонусов — то самое
// состояние, с которого начался отзыв, и молчать о нём нельзя.
if (!TARGET || BONUSES.length !== 2 || !UNKNOWN) {
  console.error('Bible WOW bonus check failed:\n- '
    + `уровень 1 не даёт слов для проверки: основное «${TARGET || '—'}», `
    + `бонусные «${BONUSES.filter(Boolean).join('», «') || '—'}», небиблейское «${UNKNOWN || '—'}»`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(target).pipe(res);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
let browser;

try {
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => { window.__APP_TELEMETRY_DISABLED__ = true; });
  await skipFirstRunRules(context);

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

  await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: "window.Telegram={WebApp:{initData:'',initDataUnsafe:{user:{id:999999,username:'qa_user',first_name:'QA'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},disableVerticalSwipes(){},openTelegramLink(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};",
  }));
  const gasReply = JSON.stringify({ success: true, isBanned: false, wowStars: 0, wsStars: 0, swLevel: 0, lastGames: [] });
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: gasReply }));
  }

  await page.goto(baseURL, { waitUntil: 'commit', timeout: 20_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('app-booting')
      && !document.documentElement.classList.contains('app-menu-preparing'),
    null,
    { timeout: 10_000 },
  );
  await page.evaluate(() => window.showGame('bible-wow'));
  await page.waitForSelector('.wow-btn-let', { timeout: 15_000 });
  // Ждём не появления колеса, а того, что до него доходит касание. Стартовая
  // заставка и загрузчик входа в игру уезжают анимацией и ещё какое-то время
  // перекрывают экран: буквы уже нарисованы, а палец достаётся не им.
  await page.waitForFunction(() => {
    const button = document.querySelector('.wow-btn-let');
    if (!button) return false;
    const rect = button.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return !!top?.closest('#wow-wheel');
  }, null, { timeout: 15_000 });

  /** Ведёт «пальцем» по буквам колеса так же, как это делает человек. */
  async function spell(word) {
    const points = await page.evaluate((text) => {
      const buttons = Array.from(document.querySelectorAll('.wow-btn-let'));
      const used = new Set();
      const path = [];
      for (const letter of text) {
        const button = buttons.find((item) => item.dataset.letter === letter && !used.has(item.dataset.idx));
        if (!button) return null;
        used.add(button.dataset.idx);
        const rect = button.getBoundingClientRect();
        path.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
      return path;
    }, word);
    check(points, `На колесе не хватило букв для «${word}»`);

    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (const point of points.slice(1)) await page.mouse.move(point.x, point.y, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    return page.evaluate(() => ({
      message: document.getElementById('wow-bonus-msg')?.textContent || '',
      stars: Number(document.getElementById('wow-score')?.textContent || 0),
      bonuses: Number(document.getElementById('wow-bonus-count')?.textContent || 0),
    }));
  }

  const before = await page.evaluate(() => Number(document.getElementById('wow-score')?.textContent || 0));

  const target = await spell(TARGET);
  check(target.message === 'Отлично!', `Основное слово «${TARGET}» не засчитано: «${target.message}»`);

  let bonus;
  for (const [index, word] of BONUSES.entries()) {
    bonus = await spell(word);
    check(bonus.message === 'Бонус! +2⭐', `Бонусное слово «${word}» не засчитано: «${bonus.message}»`);
    check(bonus.bonuses === index + 1, `Счётчик бонусов не вырос на «${word}»: ${bonus.bonuses}`);
    check(bonus.stars === before + (index + 1) * 2, `За «${word}» начислено не две звезды: ${bonus.stars}`);
  }

  const again = await spell(BONUS);
  check(again.message === 'Уже в бонусах', `Повтор бонуса даёт «${again.message}»`);
  check(again.stars === bonus.stars, `Повтор бонуса начислил звёзды: ${bonus.stars} → ${again.stars}`);

  const unknown = await spell(UNKNOWN);
  check(/нет в Библии/i.test(unknown.message), `Небиблейское «${UNKNOWN}» получило «${unknown.message}»`);
  check(unknown.stars === bonus.stars, `Небиблейское слово начислило звёзды: ${unknown.stars}`);

  // Бонус попадает в список уровня — иначе награда есть, а показать её негде.
  await page.click('#wow-bonus-open');
  await page.waitForTimeout(200);
  const listed = await page.evaluate((word) => document.body.textContent.includes(word), BONUS);
  check(listed, `Бонусное слово «${BONUS}» не попало в список бонусов уровня`);

  check(pageErrors.length === 0, `pageerror: ${pageErrors.join(' | ')}`);
  await context.close();

  const total = levels.reduce((sum, level) => sum + level.bonus.length, 0);
  console.log(`OK: «Библейские слова» — бонусы работают, ${total} бонусных слов на ${levels.length} уровнях; `
    + `«${BONUSES.join('» и «')}» засчитаны, «${UNKNOWN}» отклонено с объяснением.`);
} catch (error) {
  failures.push(error.message);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`Bible WOW bonus check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
