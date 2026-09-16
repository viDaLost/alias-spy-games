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

/*
  Где на снимке доска. Ищется она по цвету: доска и плитки — белое и светло-
  лиловое, то есть яркое и почти без оттенка, а вокруг песок, зелень и тень —
  яркие, но с большим разбросом по каналам. Одиночные светлые точки (блик на
  камне, просвет в листве) отсеиваются счётом по строкам и столбцам: краем
  доски считается та строка, где таких точек уже не единицы.
*/
function measure(file) {
  const { width, height, channels, pixels } = decodePng(file);
  const at = (x, y) => pixels.subarray((y * width + x) * channels, (y * width + x) * channels + 3);
  const boardLike = (px) => {
    const low = Math.min(px[0], px[1], px[2]);
    return low >= 210 && Math.max(px[0], px[1], px[2]) - low <= 24;
  };
  const byRow = new Array(height).fill(0);
  const byCol = new Array(width).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!boardLike(at(x, y))) continue;
      byRow[y] += 1;
      byCol[x] += 1;
    }
  }
  const enoughRow = Math.max(6, Math.round(width * 0.04));
  const enoughCol = Math.max(6, Math.round(height * 0.04));
  const rows = byRow.map((count, y) => (count >= enoughRow ? y : -1)).filter((y) => y >= 0);
  const cols = byCol.map((count, x) => (count >= enoughCol ? x : -1)).filter((x) => x >= 0);
  if (!rows.length || !cols.length) {
    return { width, height, minX: 0, maxX: 0, minY: 0, maxY: 0, boardWidth: 0, boardHeight: 0, inkShare: 0 };
  }
  const minX = cols[0];
  const maxX = cols[cols.length - 1];
  const minY = rows[0];
  const maxY = rows[rows.length - 1];
  const boardWidth = maxX - minX;
  const boardHeight = maxY - minY;
  /*
    Ближний ряд плиток — нижняя седьмая доски. Подписи на нём самые крупные, а
    картинка из середины доски сюда не попадает: если тёмного в этой полосе
    нет, значит на плитках не написано ничего.
  */
  let ink = 0;
  let seen = 0;
  const from = Math.max(0, maxY - Math.round(boardHeight * 0.15));
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

const shots = process.env.RUNNER_TEMP || '/tmp';

/*
  Снимок одного только холста. Разметка на время снимка прячется: боком она
  лежит поверх доски, и белые карточки кнопок неотличимы от белых плиток —
  мерить по такому снимку доску нельзя. Заодно возвращается, насколько полоса
  управления заходит на холст: ряд клеток обязан остаться выше неё.
*/
const OVERLAY = '#game > *:not(.ring-wrap), .view-home';

async function snap(page, file) {
  const info = await page.evaluate((selector) => {
    const canvas = document.getElementById('board3d');
    const box = canvas.getBoundingClientRect();
    let bottom = 0;
    for (const id of ['teach', 'actions', 'players', 'feed', 'core']) {
      const node = document.getElementById(id);
      if (!node || node.hidden || !node.offsetParent) continue;
      const rect = node.getBoundingClientRect();
      if (rect.height === 0 || rect.width < box.width * 0.62) continue;
      if (rect.top <= box.top) continue;
      bottom = Math.max(bottom, box.bottom - rect.top);
    }
    for (const node of document.querySelectorAll(selector)) node.style.visibility = 'hidden';
    /*
      Границы холста дробные, и округление наружу прихватывает в снимок полоску
      страницы за ним — а она светлая и ровная, то есть неотличима от доски.
      Поэтому округление только внутрь, да ещё на точку с запасом.
    */
    const x = Math.ceil(Math.max(0, box.x)) + 1;
    const y = Math.ceil(Math.max(0, box.y)) + 1;
    return {
      bottom,
      clip: {
        x, y,
        width: Math.max(10, Math.floor(Math.min(box.right, window.innerWidth)) - x - 1),
        height: Math.max(10, Math.floor(Math.min(box.bottom, window.innerHeight)) - y - 1),
      },
    };
  }, OVERLAY);
  await page.screenshot({ path: file, clip: info.clip });
  await page.evaluate((selector) => {
    for (const node of document.querySelectorAll(selector)) node.style.visibility = '';
  }, OVERLAY);
  return { file, bottom: info.bottom, clip: info.clip, ...measure(file) };
}

const shot = path.join(shots, 'promised-land-3d.png');

/** Насколько два снимка холста разошлись: доля заметно изменившихся точек. */
function differ(one, two) {
  const a = decodePng(one);
  const b = decodePng(two);
  if (a.width !== b.width || a.height !== b.height) return 1;
  let apart = 0;
  const total = a.width * a.height;
  for (let i = 0; i < total; i += 1) {
    const at = i * a.channels;
    const gap = Math.abs(a.pixels[at] - b.pixels[at])
      + Math.abs(a.pixels[at + 1] - b.pixels[at + 1])
      + Math.abs(a.pixels[at + 2] - b.pixels[at + 2]);
    if (gap > 24) apart += 1;
  }
  return apart / total;
}
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});
const page = await context.newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));

let ran = false;
let side = null;
let spend = null;
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.locator('#start-btn').click();
  await page.waitForSelector('#game:not([hidden])', { timeout: 5_000 });
  await page.waitForTimeout(900);

  /*
    Обучение. Оно встречает новичка первым, и проверять его надо здесь же, до
    того как показ пропущен: второй раз само оно не заведётся. Доказательство
    того, что показ идёт на доске, а не в тексте, — сам холст: между шагами
    картинка обязана меняться, потому что камера перелетает к другой клетке.
  */
  const teachStart = await page.locator('#teach:not([hidden])').count();
  need(teachStart > 0, 'первую партию обучение не встретило');
  if (teachStart) {
    // innerText отдаёт текст так, как его видно, а видно его прописными:
    // у счётчика «text-transform: uppercase». Поэтому разбор без учёта регистра.
    const counter = () => page.locator('#teach-count').innerText();
    const numbers = (text) => (text.match(/(\d+)\D+(\d+)/) || []).slice(1).map(Number);
    const [at, steps] = numbers(await counter());
    need(at === 1, `счётчик шагов начинается с «${await counter()}»`);
    need(steps >= 5, `в обучении ${steps} шагов — слишком коротко для первого знакомства`);
    await page.waitForTimeout(1200);
    const first = path.join(shots, 'teach-1.png');
    const second = path.join(shots, 'teach-2.png');
    await snap(page, first);
    await page.locator('#teach-next').click();
    await page.waitForTimeout(1500);
    need(numbers(await counter())[0] === 2,
      `после «Дальше» счётчик показывает «${await counter()}»`);
    await snap(page, second);
    const moved = differ(first, second);
    need(moved > 0.06,
      `между шагами обучения доска изменилась на ${(moved * 100).toFixed(1)}% — камера стоит`);
    await page.locator('#teach-skip').click();
    await page.waitForSelector('#teach[hidden]', { state: 'attached', timeout: 3_000 });
    need(await page.locator('#actions .btn').count() > 0,
      'после «Пропустить» кнопки хода не вернулись');
    /*
      Камера возвращается к общему виду не мгновенно, а перелётом. Мерить доску,
      пока он идёт, — мерить случайный кадр: скрытая кнопка возврата и есть знак,
      что вид снова исходный.
    */
    await page.waitForSelector('#view-home[hidden]', { state: 'attached', timeout: 5_000 });
    await page.waitForTimeout(200);
  }

  /*
    Фигурки обязаны быть телами, а не картинками: у картинки нет толщины, и
    повернуть доску — значит увидеть бумажку. Спрашивается это у самой сборки
    фигурок, поимённо по каждой: габаритная коробка должна быть ненулевой по
    всем трём измерениям.
  */
  const flat = await page.evaluate(() => {
    const F = window.PromisedLandFigures;
    if (!F || !window.THREE) return ['сборки фигурок нет'];
    const bad = [];
    const check = (name, node, least) => {
      const box = new window.THREE.Box3().setFromObject(node);
      const size = box.getSize(new window.THREE.Vector3());
      if (!(size.x > least && size.y > least && size.z > least)) {
        bad.push(`${name} ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}`);
      }
    };
    for (const kind of F.TOKEN_KINDS) {
      // Меряется сам предмет, а не фишка целиком: круглая подставка есть у
      // всех, и с ней даже плоский щиток выходит «объёмным».
      const token = F.token(kind, '#4f46e5');
      check(kind, token.userData.piece || token, 0.1);
    }
    for (const kind of F.BUILD_KINDS) check(kind, F.building(kind), 0.1);
    return bad;
  });
  need(flat.length === 0, `плоские фигурки: ${flat.join(', ')}`);

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
    const view = await snap(page, shot);
    need(view.boardWidth > 0, 'доски на холсте не нашлось вовсе');
    need(view.minX >= 1 && view.minY >= 1 && view.maxX <= view.width - 2,
      `доска упирается в край холста: ${view.minX}/${view.minY}/`
      + `${view.width - view.maxX} точек по краям`);
    need(view.boardWidth >= view.width * 0.8,
      `доска занимает ${Math.round(view.boardWidth / view.width * 100)}% ширины холста`);
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

    /*
      Доска слушается пальца. Проверяется то, ради чего это делалось: повернуть
      её можно, отойти можно, и ни то ни другое не роняет половину поля за край
      холста. Кнопка «Вернуть вид» обязана возвращать ровно тот вид, что был.
    */
    const look = (name) => snap(page, path.join(shots, `view-${name}.png`));
    const before = await look('home');

    const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const drag = async (dx, dy) => {
      await page.mouse.move(mid.x, mid.y);
      await page.mouse.down();
      await page.mouse.move(mid.x + dx, mid.y + dy, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(350);
    };
    /*
      Поперёк и вдоль — по отдельности: одно движение наискось меняет картинку
      и тогда, когда работает только половина управления, и проверка этого не
      заметит. Поворот и наклон — разные вещи, и спрашиваются они порознь.
    */
    await drag(box.width * 0.24, 0);
    const spun = await look('spun');
    need(differ(before.file, spun.file) > 0.05, 'доска не поворачивается пальцем поперёк');
    await drag(0, box.height * 0.2);
    const turned = await look('turned');
    need(differ(spun.file, turned.file) > 0.04, 'доска не наклоняется пальцем вдоль');
    need(turned.minX >= 1 && turned.minY >= 1
      && turned.maxX <= turned.width - 2 && turned.maxY <= turned.height - 2,
      'повёрнутая доска вылезла за край холста');
    need(await page.locator('#view-home:not([hidden])').count() > 0,
      'доску повернули, а кнопки «Вернуть вид» нет');

    // Щипок двумя пальцами: отойти и посмотреть всю карту.
    await page.evaluate(({ x, y, w }) => {
      const canvas = document.getElementById('board3d');
      const fire = (type, id, cx, cy) => canvas.dispatchEvent(new PointerEvent(type, {
        pointerId: id, clientX: cx, clientY: cy, bubbles: true, pointerType: 'touch',
      }));
      fire('pointerdown', 101, x - w * 0.3, y);
      fire('pointerdown', 102, x + w * 0.3, y);
      for (let i = 1; i <= 8; i += 1) {
        const gap = w * 0.3 * (1 - i * 0.085);
        fire('pointermove', 101, x - gap, y);
        fire('pointermove', 102, x + gap, y);
      }
      fire('pointerup', 101, x - w * 0.09, y);
      fire('pointerup', 102, x + w * 0.09, y);
    }, { x: mid.x, y: mid.y, w: box.width });
    await page.waitForTimeout(350);
    const away = await look('away');
    const areaOf = (v) => v.boardWidth * v.boardHeight;
    need(areaOf(away) < areaOf(turned) * 0.9,
      `щипок не отдалил доску: было ${Math.round(areaOf(turned))}, стало ${Math.round(areaOf(away))} точек`);

    await page.locator('#view-home').click();
    await page.waitForTimeout(800);
    const back = await look('back');
    need(Math.abs(back.boardWidth - before.boardWidth) <= 4
      && Math.abs(back.boardHeight - before.boardHeight) <= 4,
      `«Вернуть вид» вернул доску другого размера: ${before.boardWidth}×${before.boardHeight} `
      + `против ${back.boardWidth}×${back.boardHeight}`);
    need(await page.locator('#view-home[hidden]').count() > 0,
      'вид вернулся, а кнопка возврата осталась на экране');

    /*
      Чего сцена стоит кадру. Вызовы отрисовки — та величина, которой телефон
      меряет цену картинки; треугольники здесь не главное, их мало. Меряется и
      худший случай: всё поле застроено башнями, на каждой клетке владелец, за
      столом шестеро. И отдельно — что в покое сцена не рисуется вовсе: кадр
      по событию только тогда и имеет смысл.
    */
    const cost = await page.evaluate(() => {
      const scene = window.PromisedLandScene;
      const B = window.PromisedLandBoard;
      const idle = scene.stats();
      const players = Array.from({ length: 6 }, (unused, i) => (
        { id: 'p' + i, name: 'И' + i, pos: i * 3, silver: 100, heritage: 0 }));
      const cells = B.BOARD.map((spec, n) => ({
        owner: B.OWNABLE.has(spec.kind) ? 'p' + (n % 6) : null,
        level: spec.kind === 'plot' ? 5 : 0,
        altar: spec.kind === 'plot' && n % 7 === 0,
        heldFrom: null,
      }));
      scene.sync({ players, cells }, () => '#4f46e5');
      return { idle, full: scene.stats() };
    });
    need(cost.idle.calls <= 140,
      `пустая доска стоит ${cost.idle.calls} вызовов отрисовки`);
    need(cost.full.calls <= 320,
      `застроенное поле стоит ${cost.full.calls} вызовов отрисовки`);
    need(cost.full.triangles <= 60_000,
      `застроенное поле — ${cost.full.triangles} треугольников`);

    /*
      Перед замером покоя надо дождаться, пока улягутся сами постройки: они
      вырастают почти полсекунды, и мерить «сцена в покое» посреди этого —
      мерить не покой.
    */
    await page.waitForTimeout(900);
    const quiet = await page.evaluate(() => window.PromisedLandScene.stats().frames);
    await page.waitForTimeout(1500);
    const stillQuiet = await page.evaluate(() => window.PromisedLandScene.stats().frames);
    need(stillQuiet - quiet <= 2,
      `за полторы секунды покоя сцена нарисовала ${stillQuiet - quiet} кадров`);
    spend = cost;
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
  ? 'OK: обучение встречает первую партию и показывает шаги на самой доске, фигурки и '
    + 'постройки — тела, а не картинки; доска влезает в холст целиком и занимает его почти '
    + 'весь, на ближнем ряду плиток есть подписи, луч различает клетки поимённо. Доска '
    + 'поворачивается пальцем и не вылезает за край, щипок отдаляет её, «Вернуть вид» '
    + 'возвращает прежний. Долг ждёт нажатия игрока, «Авто» играет ход человека сам, боком '
    + 'экран не прокручивается, консоль чистая. Кадр стоит '
    + `${spend ? spend.idle.calls : '?'} вызовов отрисовки на пустом поле и `
    + `${spend ? spend.full.calls : '?'} на застроенном (${spend ? spend.full.triangles : '?'} `
    + 'треугольников), а в покое не рисуется вовсе.'
  : 'OK: поле в объёме пропущено (нет WebGL), но плата по нажатию и «Авто» проверены.');
