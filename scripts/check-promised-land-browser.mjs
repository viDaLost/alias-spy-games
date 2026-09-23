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

/*
  Без WebGL — намеренно. У игры два поля: сцена на three.js и та же партия на
  разметке, которая остаётся ей, когда WebGL не дают. Здесь проверяется вторая:
  клетки как элементы страницы, попадание пальцем по ним, кольцо, не поехавшее
  от собственного текста. Дай браузеру WebGL — и всё это проверять будет не на
  чем: поле подменится холстом. Сцену проверяет check-promised-land-3d.mjs.
*/
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-webgl'],
});

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

/** Пропустить обучение, если оно открылось: партия проверяется отдельно. */
async function skipTeaching(page) {
  const skip = page.locator('#teach-skip');
  if (!(await skip.count()) || !(await skip.isVisible())) return;
  await skip.click();
  await page.waitForSelector('#teach[hidden]', { state: 'attached', timeout: 3_000 });
}

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
  // Первый экран — выбор способа игры; настройки партии за ним, и до выбора
  // они скрыты: нажимать в них что-либо раньше нечего.
  await page.locator('.mode-card[data-mode="solo"]').click();
  await page.locator(`.choice[data-key="years"] button[data-value="${years}"]`).click();
  await page.locator('#start-btn').click();
  await page.waitForSelector('#game:not([hidden])', { timeout: 5_000 });
  // Первую партию встречает обучение. Здесь проверяется сама игра, поэтому
  // показ пропускается — его проверяет check-promised-land-3d.mjs.
  await skipTeaching(page);

  const overflow = async () => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  need(await overflow() === 0, `${width}px: страница уехала вбок сразу после начала партии`);

  /*
    Боком раскладка обязана умещаться целиком: ради этого она и делалась.
    Прокрутка на телефоне, лежащем в руке, означает, что половина игры за
    краем, а крутить экран посреди хода — ровно то, от чего уходили.
  */
  if (width > height) {
    const down = await page.evaluate(() =>
      document.documentElement.scrollHeight - document.documentElement.clientHeight);
    need(down === 0, `${width}×${height}: боком экран прокручивается на ${down}px`);
  }

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

  /*
    Палец должен попадать в плитку, а не в доску под ней. Доска наклонена в
    перспективе, и плитка, лежащая с ней в одной плоскости, перестаёт
    нажиматься, оставаясь при этом на вид нажимаемой: ни ошибки, ни следа —
    просто карточка клетки не открывается.
  */
  const hitsTile = await page.evaluate(() => {
    const cell = document.querySelector('.cell[aria-label="Хеврон"]');
    if (!cell) return false;
    const box = cell.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return Boolean(top) && (top === cell || cell.contains(top));
  });
  need(hitsTile, `${width}px: нажатие в середину клетки уходит мимо неё`);
  need(ring.ratio < 1.25 && ring.ratio > 0.8,
    `${width}px: клетки кольца вытянулись, отношение сторон ${ring.ratio.toFixed(2)}`);

  /*
    Лад игры доходит от кнопки до партии.

    Переключатель стоит в настройках партии, и проверяется не он сам, а то, что
    выбранное им правило доехало до движка: одинокий удел в простом ладу должен
    строиться, а сама пометка — лежать в состоянии партии. Без этого кнопка
    нажималась бы, а игра шла бы по-старому.
  */
  const simple = await page.evaluate(() => {
    const game = window.PromisedLandGame.state();
    return { strict: game.strict };
  });
  need(simple.strict === true, `по умолчанию лад «${simple.strict}» вместо усложнённого`);

  /*
    Неспешность соперников. Человек написал, что не успевает сообразить, что и
    куда, — и пауза между чужими ходами выросла до полутора секунд. Проверка
    сторожит именно её: вернуть прежние девятьсот миллисекунд легко и незаметно,
    а жалоба была ровно про это.

    После проверки пауза сбивается почти в ноль — уже для самой проверки:
    доиграть партию до юбилея с полутора секундами на шаг значит просидеть над
    ней полчаса, а на ход партии это число не влияет ничем.
  */
  const pace = await page.evaluate(() => {
    const was = window.PromisedLandGame.pace();
    window.PromisedLandGame.pace(20);
    return was;
  });
  need(pace >= 1200, `${width}px: соперники ходят через ${pace} мс — человеку этого мало`);

  /*
    Чужой ход читается словами.

    Человек написал, что не успевает сообразить, что и куда, — и не мог: на
    экране во время чужого хода было написано только «ходит Ефрем», а что
    Ефрем сделал, лежало в отдельной вкладке журнала. Теперь последняя запись
    летописи стоит прямо под строкой хода, и проверяется именно это: не
    «есть ли такой элемент», а что в нём то самое, что записано в летописи.
  */
  const said = await page.evaluate(() => {
    const game = window.PromisedLandGame.state();
    game.turn = game.players.findIndex((one) => one.isBot);
    if (game.turn < 0) return { skipped: true };
    game.pending = null;
    game.phase = 'roll';
    game.log.push({ year: game.year, text: 'Ефрем купил Вирсавию за 60' });
    window.PromisedLandGame.refresh();
    const seen = {
      line: document.querySelector('.turnline-last')?.textContent || '',
      who: document.querySelector('.turnline-who')?.textContent || '',
    };
    /*
      Ход отдан сопернику руками — значит, руками же надо и пустить его
      дальше: перерисовка ходов не делает. Без этого стол вставал бы прямо
      здесь, и партия не доходила бы до юбилея.
    */
    window.PromisedLandGame.wake();
    return seen;
  });
  if (!said.skipped) {
    need(said.line.includes('Ефрем купил Вирсавию за 60'),
      `${width}px: о чужом ходе не сказано словами: «${said.line}»`);
    need(/ходит/.test(said.who), `${width}px: не видно, чей ход: «${said.who}»`);
  }

  /*
    Темпа и автоигры в игре больше нет: обе кнопки отбирали ход у человека —
    одна торопила чужой, вторая играла за него самого. Спрашивается, что их
    не осталось и в разметке.
  */
  const gone = await page.locator('#game button',
    { hasText: /^(Быстрее|Помедленнее|Авто|Играю сам)$/ }).count();
  need(gone === 0, `${width}px: на экране осталось ${gone} кнопок убранного темпа`);

  // Ход человека и ходы ботов идут вперемешку: жать надо то, что появилось.
  let guard = 0;
  let clicks = 0;
  while (guard < 1800) {
    guard += 1;
    if (await page.locator('#jubilee:not([hidden])').count()) break;
    // Кнопка броска гаснет на время кувырка костей: жать в неё в этот миг —
    // значит считать нажатия, которых игрок не сделал бы.
    // Решения клетки переехали под карточку на середине экрана, и внизу их
    // больше нет: ищем главную кнопку по её группе, а не по полосе.
    const primary = page.locator('.actions-main .btn--primary:not([disabled])');
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
let side = null;
try {
  wide = await play(390, 844, 3);
  narrow = await play(320, 720, 3);
  // Телефон боком: партия должна доигрываться и в этой раскладке, а не только
  // в вертикальной. Проверяется тем же прогоном — другой здесь ничего не даст.
  side = await play(844, 390, 3);

  // Правила и карточка клетки — то, по чему новичок разбирается в игре.
  // Если они не открываются или пусты, игра остаётся непонятной, а больше
  // ничего при этом не ломается: поле рисуется, ходы идут.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  // Первый экран — выбор способа игры; правила и настройки за ним.
  await page.locator('.mode-card[data-mode="solo"]').click();
  await page.locator('#rules-btn').click();
  await page.waitForSelector('#rules:not([hidden])', { timeout: 3_000 });
  const groups = await page.locator('.rule-group').count();
  need(groups === 6, `в правилах ${groups} уделов вместо шести`);
  const cardsLine = await page.locator('.cards-count').textContent();
  need(/16.*14/.test(cardsLine || ''), `строка про колоды не сходится с ними: «${cardsLine}»`);
  need(!/онопол/i.test(await page.locator('#rules-body').innerText()),
    'в правилах осталась отсылка к другой игре');
  await page.locator('#rules-close').click();

  /*
    Карточка клетки: открылась, показала название, цену и лестницу платы.
    Открытие обёрнуто: если клетка перестала нажиматься, проверка должна
    сказать об этом словами, а не рухнуть с таймаутом посреди списка.
  */
  await page.locator('#start-btn').click();
  await page.waitForSelector('#game:not([hidden])', { timeout: 5_000 });
  await skipTeaching(page);
  let cardOpened = true;
  try {
    await page.locator('.cell[aria-label="Хеврон"]').click({ timeout: 4_000 });
    await page.waitForSelector('#cell-card:not([hidden])', { timeout: 3_000 });
  } catch {
    cardOpened = false;
    need(false, 'карточка клетки не открылась по нажатию на поле');
  }
  const card = cardOpened ? await page.locator('#cell-body').innerText() : '';
  if (cardOpened) {
    need(/Хеврон/.test(card), `карточка клетки открылась без названия: «${card.slice(0, 40)}»`);
    need(/400/.test(card), 'в карточке удела нет его цены');
    need(await page.locator('.cell-row').count() >= 6,
      'в карточке удела нет лестницы платы по ступеням');
    const cardArt = await page.locator('.cell-art').getAttribute('src');
    need(/plots\/hebron\.webp$/.test(cardArt || ''), `в карточке чужая картинка: ${cardArt}`);
  }

  // Особая клетка объясняет себя словами, а не значком.
  if (cardOpened) {
    await page.locator('#cell-close').click();
    await page.locator('.cell[aria-label="Темница"]').click();
    await page.waitForSelector('#cell-card:not([hidden])', { timeout: 3_000 });
    const prison = await page.locator('#cell-body').innerText();
    need(prison.length > 120, `особая клетка почти ничего не объясняет: «${prison}»`);
  }
  await context.close();

  /*
    ——— простой лад доходит от кнопки до доски ———

    Отдельной вкладкой, потому что лад выбирается до партии и в уже начатой не
    меняется. Проверяется не нажатие, а следствие: пометка легла в партию, и
    одинокий удел — тот, чей цвет чужой, — в ней строится. В усложнённом ладу
    он же не строился бы; это доказано счётом в check-promised-land-logic.
  */
  const simpleContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const simplePage = await simpleContext.newPage();
  await simplePage.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await simplePage.locator('.mode-card[data-mode="solo"]').click();
  const toggle = simplePage.locator('.choice[data-key="strict"] button[data-value="0"]');
  if (!(await toggle.count())) problems.push('переключателя лада нет в настройках партии');
  else {
    await toggle.click();
    await simplePage.locator('#start-btn').click();
    await simplePage.waitForSelector('#game:not([hidden])', { timeout: 5_000 });
    const skipTeach = simplePage.locator('#teach-skip');
    if (await skipTeach.count() && await skipTeach.isVisible()) await skipTeach.click();
    const built = await simplePage.evaluate(() => {
      const game = window.PromisedLandGame.state();
      const B = window.PromisedLandBoard;
      const E = window.PromisedLandEngine;
      const group = B.BOARD.find((spec) => spec.kind === 'plot').group;
      const cells = B.groupCells(group);
      const [mine, ...rest] = cells;
      const [player, other] = game.players;
      game.cells[mine].owner = player.id;
      for (const n of rest) game.cells[n].owner = other.id;
      player.silver = 2000;
      game.turn = 0;
      game.phase = 'act';
      game.pending = null;
      window.PromisedLandGame.refresh();
      return { strict: game.strict, can: E.canBuild(game, player, mine) };
    });
    need(built.strict === false, `простой лад не доехал до партии: strict = ${built.strict}`);
    need(built.can === true, 'в простом ладу одинокий удел всё равно не строится');
  }
  await simpleContext.close();
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error('Превью «Земли обетованной» не прошло проверку:');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log('OK: партия доигрывается до юбилея пальцем в трёх раскладках — '
  + `${wide.clicks} нажатий на 390×844, ${narrow.clicks} на 320×720 и ${side.clicks} на 844×390 боком; `
  + `победитель объявлен («${wide.winner}»), в таблице ${wide.rows} игроков. `
  + 'Кольцо осталось квадратным из 36 клеток, нажатие попадает в плитку, боком ничего '
  + 'не прокручивается, консоль чистая, карточка клетки и правила открываются, а кнопок '
  + 'темпа и автоигры не осталось и без объёмной сцены. Лад игры выбирается до партии: по '
  + 'умолчанию усложнённый, а выбранный простой доезжает до доски — одинокий удел в нём '
  + 'строится.');
