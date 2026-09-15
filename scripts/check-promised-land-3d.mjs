// «Земля обетованная» в объёме: доска рисуется, читается и слушается пальца.
//
// Соседняя проверка проходит партию на разметочном поле — на том, что остаётся
// игре, когда WebGL не дают. Здесь проверяется другая половина: поле, собранное
// на three.js. У него свои способы сломаться тихо, и каждый стоит игроку игры:
//
//   * доска вылезает за край холста — часть клеток просто не видна;
//   * подписи не попали в текстуру — поле красивое и немое;
//   * луч мимо плиток — клетка на вид нажимается, но карточка не открывается;
//   * за игрока платят сами — он смотрит, как тают его сиклы, и не решает.
//
// Ни одну из этих поломок не видно ни в консоли, ни в разметке: доска — один
// холст. Поэтому здесь считаются пиксели этого холста.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const root = process.cwd();
const dir = path.join(root, 'cloudflare/promised-land-preview/public');
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.webp', 'image/webp'], ['.png', 'image/png'],
]);

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
  Железной видеокарты на сборочной машине нет, и без этих ключей браузер
  отказывает в WebGL молча. Рисует тогда SwiftShader — медленно, зато теми же
  кадрами, и считать пиксели можно так же, как считал бы их телефон.
*/
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

/** Серебро человека — то самое число, на которое он смотрит, решая, платить ли. */
const silverOf = (page) => page.evaluate(() => {
  const card = [...document.querySelectorAll('.player')]
    .find((node) => node.querySelector('.player-name')?.textContent.startsWith('Игрок'));
  return Number(card?.querySelector('.player-figs .fig b')?.textContent);
});

/** Разбор PNG до пикселей: холст умеет отдать себя только картинкой. */
function decodePng(file) {
  const data = fs.readFileSync(file);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const parts = [];
  while (pos < data.length) {
    const length = data.readUInt32BE(pos);
    const type = data.toString('ascii', pos + 4, pos + 8);
    const body = data.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body[9];
    }
    if (type === 'IDAT') parts.push(body);
    pos += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const channels = colorType === 6 ? 4 : (colorType === 2 ? 3 : 1);
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let previous = Buffer.alloc(stride);
  for (let y = 0, at = 0; y < height; y += 1) {
    const filter = raw[at];
    at += 1;
    const line = Buffer.from(raw.subarray(at, at + stride));
    at += stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 255;
      else if (filter === 2) line[x] = (line[x] + b) & 255;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c))) & 255;
      }
    }
    line.copy(out, y * stride);
    previous = line;
  }
  return { width, height, channels, pixels: out };
}

/** Где на холсте доска и сколько на ней тёмного: подписи — это тёмное. */
function measure(file) {
  const { width, height, channels, pixels } = decodePng(file);
  const at = (x, y) => pixels.subarray((y * width + x) * channels, (y * width + x) * channels + 3);
  const back = at(0, 0);
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = at(x, y);
      const away = Math.abs(px[0] - back[0]) + Math.abs(px[1] - back[1]) + Math.abs(px[2] - back[2]);
      if (away <= 18) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const boardWidth = maxX - minX;
  const boardHeight = maxY - minY;
  /*
    Ближний ряд плиток — это нижняя восьмая доски. Подписи на нём самые
    крупные, а картинки в середину доски сюда не попадают: если тёмного в этой
    полосе нет, значит на плитках не написано ничего.
  */
  let ink = 0;
  let seen = 0;
  const from = Math.max(0, maxY - Math.round(boardHeight * 0.13));
  for (let y = from; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = at(x, y);
      seen += 1;
      if (px[0] * 0.3 + px[1] * 0.59 + px[2] * 0.11 < 120) ink += 1;
    }
  }
  return {
    width, height, minX, maxX, minY, maxY, boardWidth, boardHeight,
    inkShare: seen ? ink / seen : 0,
  };
}

const shot = path.join(process.env.RUNNER_TEMP || '/tmp', 'promised-land-3d.png');
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});
const page = await context.newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));

let ran = false;
let side = null;
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.locator('#start-btn').click();
  await page.waitForSelector('#game:not([hidden])', { timeout: 5_000 });
  await page.waitForTimeout(900);

  const webgl = await page.evaluate(() => {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
  });
  const live = await page.evaluate(() => {
    const canvas = document.getElementById('board3d');
    const box = canvas.getBoundingClientRect();
    return {
      shown: !canvas.hidden, marked: canvas.parentElement.classList.contains('is-3d'),
      width: Math.round(box.width), height: Math.round(box.height),
    };
  });

  if (!webgl && !live.shown) {
    // Машине не дали WebGL вовсе. Проверять тут нечего: игра в этом случае
    // играется на разметочном поле, и его проверяет соседний скрипт.
    console.log('WebGL на этой машине не дают — проверка поля в объёме пропущена.');
  } else {
    ran = true;
    need(webgl, 'браузер не дал WebGL, хотя ключи SwiftShader переданы');
    need(live.shown && live.marked, 'поле в объёме не включилось: холст скрыт');
    need(live.width > 200 && live.height > 140,
      `коробка холста вышла ${live.width}×${live.height}`);

    // ——— доска влезает в кадр и на ней написаны слова ———
    await page.locator('#board3d').screenshot({ path: shot });
    const view = measure(shot);
    need(view.minX >= 1 && view.minY >= 1
      && view.maxX <= view.width - 2 && view.maxY <= view.height - 2,
      `доска упирается в край холста: ${view.minX}/${view.minY}/`
      + `${view.width - view.maxX}/${view.height - view.maxY} точек по краям`);
    need(view.boardWidth >= view.width * 0.82,
      `доска занимает ${Math.round(view.boardWidth / view.width * 100)}% ширины холста`);
    need(view.boardHeight >= view.height * 0.72,
      `доска занимает ${Math.round(view.boardHeight / view.height * 100)}% высоты холста`);
    need(view.inkShare > 0.012,
      `на ближнем ряду плиток тёмного ${(view.inkShare * 100).toFixed(2)}% — подписей нет`);

    /*
      Палец по плитке. Доска — один холст, и попадание считает луч: промахнись
      он, и разметка об этом не скажет ничего. Ближний ряд обходится поперёк, и
      названия обязаны быть разными: один и тот же ответ на все точки значил бы,
      что луч упирается не в плитки, а во что-то одно.
    */
    const known = await page.evaluate(() => window.PromisedLandBoard.BOARD.map((cell) => cell.name));
    const named = new Set();
    const stray = [];
    const box = await page.locator('#board3d').boundingBox();
    const scale = box.width / view.width;            // снимок снят в двойном масштабе
    /*
      Доска обходится сеткой точек. Где именно на экране лежит какая плитка,
      заранее не знает никто: это считает камера, и высчитывать то же самое тут
      второй раз значило бы проверять свою же арифметику. Поэтому проверка
      просто тычет в доску, как тыкал бы палец, и смотрит, сколько разных
      клеток отозвалось поимённо.
    */
    for (let row = 0; row < 9; row += 1) {
      for (let col = 0; col < 13; col += 1) {
        const x = box.x + (view.minX + view.boardWidth * (0.03 + 0.94 * col / 12)) * scale;
        const y = box.y + (view.minY + view.boardHeight * (0.03 + 0.94 * row / 8)) * scale;
        await page.mouse.click(x, y);
        if (!(await page.locator('#cell-card:not([hidden])').count())) continue;
        const text = await page.locator('#cell-body').innerText();
        // Название клетки ищется среди настоящих названий поля, а не по номеру
        // строки: у особых клеток строк в карточке меньше.
        const hit = known.filter((name) => text.includes(name))
          .sort((a, b) => b.length - a.length)[0];
        if (hit) named.add(hit); else stray.push(text.split('\n')[0]);
        await page.locator('#cell-close').click();
      }
    }
    need(named.size >= 22, `по всей доске отозвалось ${named.size} клеток из 36`);
    need(stray.length === 0, `карточка открылась не на клетке поля: ${stray.join(', ')}`);
  }

  /*
    Платит игрок, а не игра. Долг обязан ждать нажатия: до него серебро не
    двигается, после — уменьшается ровно на сумму долга. Это единственное
    место, где видно разницу между «спросили» и «списали сами».
  */
  let asked = null;
  for (let step = 0; step < 900 && !asked; step += 1) {
    if (await page.locator('#jubilee:not([hidden])').count()) break;
    /*
      Главная кнопка читается и нажимается одним и тем же обращением к ней.
      Порознь было нельзя: пока идёт кувырок костей, полоса действий ещё
      старая, а нажатие ждёт новую — и «Заплатить» нажималось молча, ни разу
      не попав в проверку. Долг при этом списывался, и проверка честно
      сообщала, что платить ей никто не предлагал.
    */
    const primary = page.locator('#actions .btn--primary:not([disabled])').first();
    const label = await primary.innerText({ timeout: 2_500 }).catch(() => '');
    const owed = /^Заплатить (\d+)$/.exec(label.trim());
    if (!owed) {
      if (label) await primary.click({ timeout: 4_000 }).catch(() => {});
      else await page.waitForTimeout(140);
      continue;
    }
    const before = await silverOf(page);
    await page.waitForTimeout(900);
    const waited = await silverOf(page);
    await primary.click({ timeout: 4_000 });
    await page.waitForTimeout(150);
    asked = { owed: Number(owed[1]), before, waited, after: await silverOf(page) };
  }
  need(asked !== null, 'за всю партию игроку ни разу не предложили заплатить самому');
  if (asked) {
    need(asked.waited === asked.before,
      `серебро списали без нажатия: было ${asked.before}, стало ${asked.waited}`);
    need(asked.after === asked.before - asked.owed,
      `по нажатию списали не долг: было ${asked.before}, долг ${asked.owed}, стало ${asked.after}`);
  }

  /*
    Кнопка «Авто» отдаёт ход тому же боту, что играет за соперников. После неё
    партия обязана дойти до юбилея сама — иначе кнопка есть, а толку нет.
  */
  const auto = page.locator('#actions button', { hasText: /^Авто$/ });
  need(await auto.count() > 0, 'кнопки «Авто» нет на экране хода');
  if (await auto.count()) {
    await auto.first().click();
    need(await page.locator('#actions button', { hasText: /^Играю сам$/ }).count() > 0,
      'кнопка «Авто» не переключилась в «Играю сам»');
    /*
      Доказательство простое: дождаться хода человека и увидеть, что он прошёл
      сам. Ждать юбилея целиком здесь незачем — партия идёт минутами, а сказать
      она способна ровно это же одним ходом.
    */
    const whoseTurn = () => page.evaluate(() => document
      .querySelector('.player.is-turn .player-name')?.textContent || '');
    let last = '';
    let changes = 0;
    let humanPassed = 0;
    for (let step = 0; step < 240 && humanPassed < 2; step += 1) {
      const who = await whoseTurn();
      if (who && who !== last) {
        changes += 1;
        if (last.startsWith('Игрок')) humanPassed += 1;
        last = who;
      }
      if (await page.locator('#jubilee:not([hidden])').count()) break;
      await page.waitForTimeout(200);
    }
    need(changes >= 4, `после «Авто» ход сменился всего ${changes} раз — партия стоит`);
    need(humanPassed >= 2,
      `ход человека сыграл себя сам ${humanPassed} раз из двух ожидаемых`);
  }

  need(errors.length === 0, `ошибки в консоли — ${errors.slice(0, 2).join(' | ')}`);

  /*
    Телефон боком. Раскладка делалась ради того, чтобы вся партия помещалась на
    экран без прокрутки, а холст с доской — самая крупная её часть и первый, кто
    эту раскладку продавит: он тянется по ширине, а высоту берёт из неё же.
  */
  side = await browser.newContext({
    viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const wide = await side.newPage();
  const sideErrors = [];
  wide.on('pageerror', (error) => sideErrors.push(String(error)));
  await wide.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await wide.locator('#start-btn').click();
  await wide.waitForSelector('#game:not([hidden])', { timeout: 5_000 });
  await wide.waitForTimeout(700);
  const lying = await wide.evaluate(() => ({
    down: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    aside: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    board: !document.getElementById('board3d').hidden,
    height: Math.round(document.getElementById('board3d').getBoundingClientRect().height),
  }));
  if (ran) need(lying.board, 'боком поле в объёме не включилось');
  need(lying.down === 0, `боком экран прокручивается вниз на ${lying.down}px`);
  need(lying.aside === 0, `боком экран уехал вбок на ${lying.aside}px`);
  need(lying.height > 120, `боком доска сжалась до ${lying.height}px`);
  need(sideErrors.length === 0, `боком ошибки на странице — ${sideErrors.slice(0, 2).join(' | ')}`);
} finally {
  await context.close();
  if (side) await side.close();
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error('Поле «Земли обетованной» в объёме не прошло проверку:');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log(ran
  ? 'OK: доска в объёме влезает в холст целиком и занимает его почти весь, на ближнем '
    + 'ряду плиток есть подписи, луч различает клетки поимённо, долг ждёт нажатия игрока, '
    + 'а по «Авто» ход человека играется сам. Боком экран не прокручивается. Консоль чистая.'
  : 'OK: поле в объёме пропущено (нет WebGL), но плата по нажатию и «Авто» проверены.');
