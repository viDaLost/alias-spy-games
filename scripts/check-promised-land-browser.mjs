// «Земля обетованная» на телефоне: партия доигрывается, и поле влезает.
//
// Счётный прогон рядом доказывает правила, но правила можно доказать и на
// пустом экране. Здесь проверяется другое: что игру можно доиграть пальцем.
// Партия проходится целиком, до юбилея, на экране 390 и на 320 — и по дороге
// смотрится то, что ломается тихо: вылезшая за край строка, кнопка меньше
// пальца, ошибка в консоли, застрявший ход бота.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const root = process.cwd();
const dir = path.join(root, 'cloudflare/promised-land-preview/public');
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.webp', 'image/webp'], ['.png', 'image/png'],
]);

/*
  Картинки лежат в web/assets/promised-land, а игра ищет их рядом с собой.
  Копию кладёт тот же скрипт, что и перед выкладкой: проверять надо ровно то,
  что поедет на Cloudflare, а не отдельно собранную для проверки сборку.
*/
execFileSync(process.execPath, [path.join(root, 'scripts/sync-promised-land-art.mjs')],
  { cwd: root, stdio: 'pipe' });

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(dir, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(dir + path.sep) || !fs.existsSync(target)) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

/** Партия целиком на экране заданной ширины. Возвращает, чем она кончилась. */
async function play(width, height, years) {
  const context = await browser.newContext({
    viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.locator(`.choice[data-key="years"] button[data-value="${years}"]`).click();
  await page.locator('#start-btn').click();
  await page.waitForSelector('#game:not([hidden])', { timeout: 5_000 });

  const overflow = async () => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  need(await overflow() === 0, `${width}px: страница уехала вбок сразу после начала партии`);

  // Кольцо обязано остаться квадратным: карточка в его середине легко
  // растягивает строки сетки под свой текст, и поле перестаёт быть полем.
  const ring = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.cell')].map((node) => node.getBoundingClientRect());
    const widths = cells.map((r) => r.width);
    const heights = cells.map((r) => r.height);
    return {
      count: cells.length,
      minSide: Math.min(...widths, ...heights),
      ratio: Math.max(...heights) / Math.max(...widths),
    };
  });
  need(ring.count === 36, `${width}px: на поле ${ring.count} клеток вместо 36`);
  need(ring.ratio < 1.25 && ring.ratio > 0.8,
    `${width}px: клетки кольца вытянулись, отношение сторон ${ring.ratio.toFixed(2)}`);

  // Ход человека и ходы ботов идут вперемешку: жать надо то, что появилось.
  let guard = 0;
  let clicks = 0;
  while (guard < 1400) {
    guard += 1;
    if (await page.locator('#jubilee:not([hidden])').count()) break;
    const primary = page.locator('#actions .btn--primary');
    if (await primary.count()) {
      const box = await primary.first().boundingBox();
      if (box && box.height < 44) {
        need(false, `${width}px: главная кнопка ниже пальца — ${Math.round(box.height)}px`);
      }
      await primary.first().click({ timeout: 4_000 }).catch(() => {});
      clicks += 1;
    } else {
      await page.waitForTimeout(160);   // ходит бот
    }
  }

  const finished = Boolean(await page.locator('#jubilee:not([hidden])').count());
  need(finished, `${width}px: партия на ${years} года не дошла до юбилея за ${guard} шагов`);

  let winner = '';
  let rows = 0;
  if (finished) {
    winner = (await page.locator('#winner').textContent()) || '';
    rows = await page.locator('.score').count();
    need(await overflow() === 0, `${width}px: экран юбилея уехал вбок`);
    need(rows > 1, `${width}px: в итогах ${rows} строк`);
    need(/\d/.test(winner), `${width}px: победитель без счёта наследия — «${winner}»`);

    /*
      Итог у каждого обязан быть виден целиком. Своей прокруткой вбок таблица
      прячет его молча: страница не переливается, проверка ширины довольна, а
      на экране нет ровно той цифры, ради которой на него и смотрят.
    */
    const cut = await page.evaluate((w) => [...document.querySelectorAll('.score-total')]
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return box.right > w || box.left < 0 || box.width === 0;
      }).length, width);
    need(cut === 0, `${width}px: у ${cut} игроков итог наследия не помещается на экран`);
  }

  need(errors.length === 0, `${width}px: ошибки в консоли — ${errors.slice(0, 2).join(' | ')}`);

  /*
    Картинка, которой нет, ошибку в консоль даёт, но браузер её иногда
    проглатывает молча. Поэтому отдельно спрашивается у самой страницы,
    сколько её картинок не загрузилось: имя собирается из slug, и одна
    опечатка тихо вынимает рисунок из игры.
  */
  const brokenImages = await page.evaluate(() => [...document.images]
    // complete && naturalWidth === 0 — это именно неудача. Ленивая картинка в
    // скрытом окне ещё не начинала грузиться, у неё complete === false, и
    // считать её сломанной нельзя.
    .filter((node) => node.getAttribute('src') && node.complete && node.naturalWidth === 0)
    .map((node) => node.getAttribute('src')));
  need(brokenImages.length === 0,
    `${width}px: не загрузились картинки — ${[...new Set(brokenImages)].slice(0, 3).join(', ')}`);

  const shot = `/tmp/promised-land-${width}.png`;
  await page.screenshot({ path: shot });
  await context.close();
  return { clicks, winner: winner.trim(), rows, shot };
}

let narrow = null;
let wide = null;
try {
  wide = await play(390, 844, 3);
  narrow = await play(320, 720, 3);

  // Правила должны открываться: без них новичок не поймёт, чем это отличается
  // от «Монополии», а отличается оно в основном правилами.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.locator('#rules-btn').click();
  await page.waitForSelector('#rules:not([hidden])', { timeout: 3_000 });
  const groups = await page.locator('.rule-group').count();
  need(groups === 6, `в правилах ${groups} уделов вместо шести`);
  const cardsLine = await page.locator('.cards-count').textContent();
  need(/16.*14/.test(cardsLine || ''), `строка про колоды не сходится с ними: «${cardsLine}»`);
  await context.close();
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error('Превью «Земли обетованной» не прошло проверку:');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log(`OK: партия доигрывается до юбилея пальцем — ${wide.clicks} нажатий на 390px `
  + `и ${narrow.clicks} на 320px, победитель объявлен («${wide.winner}»), `
  + `в таблице ${wide.rows} игроков. Кольцо осталось квадратным из 36 клеток, `
  + 'страница никуда не уехала вбок, консоль чистая, правила открываются.');
