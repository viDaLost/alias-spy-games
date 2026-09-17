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

/*
  Сколько ждать первый кадр партии. На телефоне доска встаёт мгновенно, а здесь
  её рисует SwiftShader — видеокарта, собранная из обычных вычислений. Первая
  сборка сцены занимает главный поток страницы на четыре-пять секунд целиком, и
  всё это время браузер не отвечает даже на вопрос «видно ли уже поле»: ответ
  приходит задним числом, когда поток освободится. Мерено: 4.1, 4.3, 4.5 и 5.5
  секунды на четырёх прогонах подряд. Прежние пять секунд стояли ровно поперёк
  этого разброса — проверка падала то на вертикальной раскладке, то на
  горизонтальной, и падала на том, что работает. Запас взят с четырёхкратным
  перекрытием: столько эта сборка не занимала ни разу, а настоящий отказ —
  партия, которая не начинается, — не начнётся и за двадцать секунд.
*/
const BOARD_WAIT = 20_000;

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

/**
 * Насколько два снимка холста разошлись: доля заметно изменившихся точек.
 * `middle` сужает сравнение до середины кадра — там лежит вылетевшая карта, а
 * по краям в это же время двигаются фишки, и они бы считались за неё.
 */
function differ(one, two, middle = false) {
  const a = decodePng(one);
  const b = decodePng(two);
  if (a.width !== b.width || a.height !== b.height) return 1;
  const fromX = middle ? Math.round(a.width * 0.3) : 0;
  const toX = middle ? Math.round(a.width * 0.7) : a.width;
  const fromY = middle ? Math.round(a.height * 0.22) : 0;
  const toY = middle ? Math.round(a.height * 0.62) : a.height;
  let apart = 0;
  let total = 0;
  for (let y = fromY; y < toY; y += 1) {
    for (let x = fromX; x < toX; x += 1) {
      const at = (y * a.width + x) * a.channels;
      const gap = Math.abs(a.pixels[at] - b.pixels[at])
        + Math.abs(a.pixels[at + 1] - b.pixels[at + 1])
        + Math.abs(a.pixels[at + 2] - b.pixels[at + 2]);
      total += 1;
      if (gap > 24) apart += 1;
    }
  }
  return total ? apart / total : 0;
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
let card = null;
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  // Первый экран — выбор способа игры; настройки партии за ним.
  await page.locator('.mode-card[data-mode="solo"]').click();
  /*
    Нажатие вызовом, а не пальцем. Полоса действий на экране настроек липнет
    к низу, и Playwright, доводя до неё «палец», ждёт, пока элемент замрёт, —
    а липкий элемент при доводке и двигается. Пальцем кнопка нажимается: под
    её серединой лежит она сама, и это проверяет check-promised-land-frame-fit.
  */
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForSelector('#game:not([hidden])', { timeout: BOARD_WAIT });
  await page.waitForTimeout(900);

  /*
    Обучение. Оно встречает новичка первым, и проверять его надо здесь же, до
    того как показ пропущен: второй раз само оно не заведётся. Доказательство
    того, что показ идёт на доске, а не в тексте, — сам холст: между шагами
    картинка обязана меняться, потому что камера перелетает к другой клетке.
  */
  /*
    Показ больше не встречает партию сам — и это проверяется первым. Отметку
    «уже видел» игра хранила у себя, а живёт она кадром на чужом сайте: такую
    память браузер делит по сайтам и чистит между запусками, и показ начинался
    заново каждую партию. Теперь его зовут кнопкой, и кнопка эта — в шапке
    партии, чтобы позвать можно было и посреди неё.
  */
  need(await page.locator('#teach:not([hidden])').count() === 0,
    'обучение завелось само, без просьбы');
  const teachOpen = page.locator('#teach-open');
  need(await teachOpen.count() === 1 && await teachOpen.isVisible(),
    'в шапке партии нет кнопки обучения');

  /*
    Совет про горизонт и кнопка «Вернуть вид» стоят в одном углу, и накрыть
    вторую первым ничего не стоит: совет — полоса во всю ширину поверх доски,
    кнопка — кружок в её правом верхнем углу. Накрытая кнопка не нажимается
    вовсе: сбитый вид вернуть нечем, пока совет не закроют, — а закрывают его
    не сразу, и человек к этому времени уже покрутил доску.

    Кнопка на этот вопрос сама не отвечает: пока вид исходный, её нет на
    экране. Поэтому она показывается на один замер и прячется обратно.
  */
  const tipClash = await page.evaluate(() => {
    const tip = document.getElementById('orientation-tip');
    const home = document.getElementById('view-home');
    if (!tip || !home) return null;
    const was = home.hidden;
    home.hidden = false;
    const a = tip.getBoundingClientRect();
    const b = home.getBoundingClientRect();
    home.hidden = was;
    return {
      over: !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom),
      tip: [Math.round(a.top), Math.round(a.bottom)],
      home: [Math.round(b.top), Math.round(b.bottom)],
    };
  });
  need(tipClash !== null, 'на первом ходу нет совета про горизонт или кнопки возврата вида');
  need(tipClash === null || !tipClash.over,
    `совет про горизонт накрывает «Вернуть вид»: совет ${tipClash?.tip}, кнопка ${tipClash?.home}`);
  await teachOpen.click();
  await page.waitForSelector('#teach:not([hidden])', { timeout: BOARD_WAIT });
  const teachStart = await page.locator('#teach:not([hidden])').count();
  need(teachStart > 0, 'обучение не открылось по кнопке в шапке');
  if (teachStart) {
    // innerText отдаёт текст так, как его видно, а видно его прописными:
    // у счётчика «text-transform: uppercase». Поэтому разбор без учёта регистра.
    const counter = () => page.locator('#teach-count').innerText();
    const numbers = (text) => (text.match(/(\d+)\D+(\d+)/) || []).slice(1).map(Number);
    const [at, steps] = numbers(await counter());
    need(at === 1, `счётчик шагов начинается с «${await counter()}»`);
    need(steps >= 15, `в обучении ${steps} шагов — этого мало, чтобы объяснить игру`);
    await page.waitForTimeout(3200);        // первый шаг обходит доску кругом
    const first = path.join(shots, 'teach-1.png');
    const second = path.join(shots, 'teach-2.png');
    await snap(page, first);
    /*
      Первые шаги показывают доску целиком, шаг про удел — одну клетку вплотную.
      Сравниваются именно они: между двумя общими видами разница мала и о
      работе камеры ничего не говорит.
    */
    for (let i = 0; i < 3; i += 1) {
      await page.locator('#teach-next').click();
      await page.waitForTimeout(1300);
    }
    need(numbers(await counter())[0] === 4,
      `после трёх «Дальше» счётчик показывает «${await counter()}»`);
    await snap(page, second);
    const moved = differ(first, second);
    need(moved > 0.06,
      `между шагами обучения доска изменилась на ${(moved * 100).toFixed(1)}% — камера стоит`);
    await page.locator('#teach-skip').click();
    await page.waitForSelector('#teach[hidden]', { state: 'attached', timeout: BOARD_WAIT });
    need(await page.locator('#actions .btn').count() > 0,
      'после «Пропустить» кнопки хода не вернулись');
    /*
      Камера возвращается к общему виду не мгновенно, а перелётом. Мерить доску,
      пока он идёт, — мерить случайный кадр: скрытая кнопка возврата и есть знак,
      что вид снова исходный.
    */
    await page.waitForSelector('#view-home[hidden]', { state: 'attached', timeout: BOARD_WAIT });
    await page.waitForTimeout(200);
  }

  /*
    Темп соперников. Кнопка спрашивается на ходу человека — там, где он её и
    ищет: по умолчанию соперники ходят неспешно, а она разгоняет их вдвое.
  */
  const faster = page.locator('#actions button', { hasText: /^Быстрее$/ });
  const pace = await faster.count();
  need(pace === 1, `кнопок «Быстрее» на ходу человека ${pace}, а нужна одна`);
  if (pace) {
    await faster.first().click();
    need(await page.locator('#actions button', { hasText: /^Помедленнее$/ }).count() > 0,
      'кнопка «Быстрее» не переключилась в «Помедленнее»');
    await page.locator('#actions button', { hasText: /^Помедленнее$/ }).first().click();
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

  /*
    Настоящие модели построек. Пять ступеней приходят готовыми .glb из
    исходников 0 A.D.; пока они едут, на клетках стоят фигурки из примитивов,
    и отличить одно от другого глазом на снимке нельзя — а разница в том,
    доехали модели или молча не доехали и игра осталась на запасном виде.
    Поэтому спрашивается сама сцена: какие ступени она уже держит моделью.
  */
  const carved = await page.waitForFunction(() => {
    const got = window.PromisedLandScene.stats().carved;
    return got && got.length === 5 ? got : false;
  }, { timeout: 15_000 }).then((handle) => handle.jsonValue()).catch(() => []);
  need(carved.length === 5,
    `из пяти построек моделями пришли ${carved.length}: ${carved.join(', ') || 'ни одной'}`);

  // Фишки — те же модели: шесть человек, по одному на место за столом.
  const people = await page.waitForFunction(() => {
    const got = window.PromisedLandScene.stats().people;
    return got === 6 ? got : false;
  }, { timeout: 15_000 }).then((handle) => handle.jsonValue()).catch(() => 0);
  need(people === 6, `из шести фишек людьми пришли ${people}`);

  /*
    Зрители. Вокруг доски стоят люди и следят за игрой: поворачиваются к той
    фишке, чей сейчас ход. Спрашивается и то, что они там есть, и то, что они
    смотрят туда, куда надо, — иначе это не зрители, а восемь столбов.
  */
  const crowdWatch = await page.waitForFunction(() => {
    const got = window.PromisedLandScene.stats();
    return got.watchers === 8 ? got.watchers : false;
  }, { timeout: 15_000 }).then((handle) => handle.jsonValue()).catch(() => 0);
  need(crowdWatch === 8, `вокруг доски стоит ${crowdWatch} зрителей из восьми`);
  // Спрашивать, куда они смотрят, есть смысл только когда они есть.
  const looked = crowdWatch !== 8 ? null : await page.evaluate(async () => {
    const scene = window.PromisedLandScene;
    const before = scene.stats().watchAt;
    const game = window.PromisedLandGame;
    const state = game.state();
    // Увести фишку подальше от того места, куда зрители смотрят сейчас.
    const away = ((before == null ? 0 : before) + 12) % 36;
    state.players[0].pos = away;
    game.refresh();
    await new Promise((done) => setTimeout(done, 1200));
    return { before, after: scene.stats().watchAt, away };
  });
  if (looked) {
    need(looked.after === looked.away,
      `фишка ушла на клетку ${looked.away}, а зрители смотрят на ${looked.after}`);
  }

  /*
    Приближение. Щипок обязан подпускать к клетке вплотную: постройку на ней
    надо разглядывать, а не угадывать. Меряется это тем самым множителем, на
    который умножается подобранное fit() расстояние: меньше значит ближе.

    Щипок делается пальцами, а не заданием числа: числу можно присвоить что
    угодно, а проверить надо, что до этого числа доводит палец.
  */
  const grip = await page.locator('#board3d').boundingBox();
  const mid = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  const pinchIn = async (from, to) => {
    const one = await page.context().newPage().catch(() => null);
    if (one) await one.close();
    await page.touchscreen.tap(mid.x, mid.y).catch(() => {});
    await page.evaluate(({ centre, start, end }) => {
      const canvas = document.getElementById('board3d');
      const send = (type, points) => {
        for (const point of points) {
          canvas.dispatchEvent(new PointerEvent(type, {
            pointerId: point.id, clientX: point.x, clientY: point.y,
            bubbles: true, cancelable: true, pointerType: 'touch',
          }));
        }
      };
      const pair = (gap) => ([
        { id: 1, x: centre.x - gap / 2, y: centre.y },
        { id: 2, x: centre.x + gap / 2, y: centre.y },
      ]);
      send('pointerdown', pair(start));
      for (let i = 1; i <= 10; i += 1) {
        send('pointermove', pair(start + (end - start) * (i / 10)));
      }
      send('pointerup', pair(end));
    }, { centre: mid, start: from, end: to });
    await page.waitForTimeout(250);
    return page.evaluate(() => window.PromisedLandScene.stats().zoom);
  };
  // Пальцы разводятся — доска приближается: множитель расстояния падает.
  const near = await pinchIn(80, 620);
  need(near <= 0.45,
    `щипок подпустил только до ${near.toFixed(2)} — клетку вблизи не рассмотреть`);
  /*
    Возврат домой ждётся по кнопке, а не по часам. Щипок только что подвёл
    камеру к клетке вплотную, и всё, что меряется дальше, — доска в холсте,
    подписи на ближнем ряду, попадание луча по клеткам — меряется от того, что
    камера действительно вернулась. Девятисот миллисекунд на это хватало, пока
    кадры рисовала видеокарта; здесь их рисует SwiftShader, и проверка начинала
    мерить доску вплотную: «доска упирается в край холста», «подписей нет», «из
    36 клеток отозвалось 0» — все четыре разом и ни одна по делу.
  */
  const homeMiss = await page.locator('#view-home').click({ timeout: 10_000 })
    .then(() => '', (error) => ` (нажатие: ${String(error.message).split('\n')[0]})`);
  await page.waitForSelector('#view-home[hidden]', { state: 'attached', timeout: BOARD_WAIT })
    .catch(() => {});
  await page.waitForTimeout(300);
  need(await page.locator('#view-home[hidden]').count() > 0,
    `после щипка «Вернуть вид» не вернул камеру домой${homeMiss}`);

  /*
    Значки особых клеток. Считаются не по пикселям, а по числу дорисованных в
    полотно подписей картинок: на доске они размером с ноготь, и глазом такую
    проверку не сделать, а счёт — точный.
  */
  const drawn = await page.evaluate(() => (window.PromisedLandScene
    ? window.PromisedLandScene.stats() : { icons: -1, coins: -1 }));
  need(drawn.icons >= 8, `на клетки лёг ${drawn.icons} значок из восьми`);
  // Монета рисуется у каждой цены — то есть у всех уделов, путей и источников.
  const priced = await page.evaluate(() => window.PromisedLandBoard.BOARD
    .filter((cell) => cell.price).length);
  need(drawn.coins >= priced,
    `монета легла к ${drawn.coins} ценам из ${priced}`);
  /*
    Подписи над фишками. Своя фишка подписана «Вы», чужие — именами: искать
    себя на поле по цвету подставки игрок не должен.
  */
  const labels = drawn.labels || [];
  need(labels[0] === 'Вы', `над своей фишкой написано «${labels[0]}»`);
  need(labels.length >= 3 && labels.slice(1).every((name) => name && name !== 'Вы'),
    `над чужими фишками подписи ${JSON.stringify(labels.slice(1))}`);
  // Подпись у человека одна на двоих: и над фишкой, и на его уделах.
  need(JSON.stringify(drawn.bannerNames) === JSON.stringify(labels),
    `над фишками ${JSON.stringify(labels)}, а на уделах ${JSON.stringify(drawn.bannerNames)}`);

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

    /*
      Кругом — значит кругом. Проверяется это не одним рывком, а цепочкой: пять
      поворотов подряд в одну сторону, и каждый обязан менять картинку. Упрись
      поворот в границу — второй же ничего не изменит, а доска при этом всё так
      же будет в кадре, и проверка «влезает ли» ничего не заметит.
    */
    let step = await look('turn-0');
    let stuck = 0;
    for (let i = 1; i <= 5; i += 1) {
      await drag(box.width * 0.55, 0);
      const now = await look(`turn-${i}`);
      if (differ(step.file, now.file) < 0.04) stuck += 1;
      need(now.boardWidth > 0 && now.minX >= 1 && now.minY >= 1
        && now.maxX <= now.width - 2,
        `на повороте ${i} доска ушла за край холста`);
      step = now;
    }
    need(stuck === 0, `из пяти поворотов подряд ${stuck} не сдвинули доску — обзор упёрся в край`);

    /*
      Подписи хозяев разворачиваются вместе с доской. Спрашивается это здесь, а
      не на домашнем виде: дома камера стоит на нулевой четверти, и подпись,
      которая не поворачивается вовсе, ответила бы тем же нулём и прошла бы
      проверку насквозь. После пяти поворотов подряд камера заведомо не дома.
    */
    const spinState = async () => {
      const drawnNow = await page.evaluate(() => {
        const one = window.PromisedLandScene.stats();
        return { turn: one.bannerTurn, yaw: one.yaw };
      });
      return { turn: drawnNow.turn, quarter: ((Math.round(drawnNow.yaw / (Math.PI / 2)) % 4) + 4) % 4 };
    };
    // Пять поворотов подряд могут сложиться и в полный круг: тогда камера
    // снова дома, и спрашивать не о чем. Доворачиваем, пока не сойдёт с нуля.
    let spun4 = await spinState();
    for (let i = 0; i < 4 && spun4.quarter === 0; i += 1) {
      await drag(box.width * 0.3, 0);
      spun4 = await spinState();
    }
    need(spun4.quarter !== 0, 'доска не сошла с нулевой четверти — поворот не спросить');
    need(spun4.turn === spun4.quarter,
      `подписи развёрнуты на четверть ${spun4.turn}, а камера стоит на ${spun4.quarter}`);
    need(Math.abs(step.boardWidth - before.boardWidth) < before.boardWidth * 0.35,
      `после оборота доска стала ${step.boardWidth} точек против ${before.boardWidth}`);
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
    /*
      Вид возвращается перелётом, а не рывком, и мерить его на полпути — мерить
      случайный кадр. Ждать фиксированную долю секунды тут нельзя: перелёт
      идёт кадрами, а кадры здесь рисует SwiftShader — на сборочной машине их
      впятеро меньше, чем на телефоне, и восьмисот миллисекунд не хватало.
      Знак прилёта у игры уже есть: кнопка возврата прячется сама, когда вид
      снова домашний. Его и ждём — а если не дождались, об этом скажет
      следующая проверка, а не обрыв с трассировкой.
    */
    await page.waitForSelector('#view-home[hidden]', { state: 'attached', timeout: BOARD_WAIT })
      .catch(() => {});
    await page.waitForTimeout(200);
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
    /*
      Треугольников теперь втрое больше прежнего: вокруг доски стоит поселение,
      восемь зрителей и шесть фишек-людей, и все они настоящие модели. Предел
      поднят с шестидесяти тысяч до девяноста намеренно.

      Треугольники — не та величина, которой меряется цена картинки на
      телефоне. Их считает видеокарта, и шестьдесят тысяч ей столько же, сколько
      двадцать; дорог процессор, а его считают вызовы отрисовки, и у них предел
      остался прежним. Поднимать его вслед за треугольниками нельзя — на нём всё
      и держится.
    */
    need(cost.full.triangles <= 90_000,
      `застроенное поле — ${cost.full.triangles} треугольников`);

    /*
      Подписи хозяев. На занятом уделе лежит плашка с именем, на свободной
      клетке не лежит ничего: на шестерых за столом цвет подставки под фишкой
      приходится вспоминать, а имя читается.

      Спрашивается это у самой сцены, а не у пикселей: плашка на телефоне
      размером с ноготь, и глазом такую проверку не сделать. Считается по
      ячейке полотна, назначенной клетке: −1 — подписи нет.
    */
    const signs = await page.evaluate(() => {
      const scene = window.PromisedLandScene;
      const B = window.PromisedLandBoard;
      const drawnNow = scene.stats();
      const ownable = B.BOARD.filter((spec) => B.OWNABLE.has(spec.kind)).length;
      const hung = drawnNow.banners.filter((slot) => slot >= 0).length;
      const stray = B.BOARD.filter((spec, n) => !B.OWNABLE.has(spec.kind)
        && drawnNow.banners[n] >= 0).length;
      return { ownable, hung, stray, names: drawnNow.bannerNames };
    });
    need(signs.hung === signs.ownable,
      `подпись лежит на ${signs.hung} уделах из ${signs.ownable} занятых`);
    need(signs.stray === 0,
      `подпись лежит на ${signs.stray} клетках, которых никто не покупал`);
    need(signs.names.length === 6 && signs.names.every((name) => name),
      `на полотне подписей имена ${JSON.stringify(signs.names)}`);

    // Свободный удел не подписывается вовсе: проверяется тем же счётом, но
    // на чистом поле, куда сцена возвращается следующей же передачей состояния.
    const bare = await page.evaluate(() => {
      const scene = window.PromisedLandScene;
      const B = window.PromisedLandBoard;
      const players = Array.from({ length: 6 }, (unused, i) => (
        { id: 'p' + i, name: 'И' + i, pos: i * 3, silver: 100, heritage: 0 }));
      const cells = B.BOARD.map(() => ({ owner: null, level: 0, altar: false, heldFrom: null }));
      scene.sync({ players, cells }, () => '#4f46e5');
      return scene.stats().banners.filter((slot) => slot >= 0).length;
    });
    need(bare === 0, `на пустом поле осталось ${bare} подписей`);

    /*
      Покой надо сперва дождаться, а потом мерить. Постройки вырастают почти
      полсекунды, а рядом идёт сама партия: соперник шагает фишкой, ставит
      колодец, тянет карту. Мерить «сцену в покое» посреди чужого хода —
      мерить не покой, и проверка падала бы через раз не по делу.

      Поэтому сначала ждём тишины: два замера подряд с одинаковым числом
      кадров — значит, никто не двигается. И только тогда спрашиваем главное:
      что за полторы секунды ничегонеделания сцена не рисует вовсе.
    */
    /*
      Счётчик кадров спрашивается отдельным ходом, а не через stats(): тот
      рисует кадр сам, иначе ему нечего сказать о вызовах отрисовки. Спрашивать
      им покой — мерить собственный вопрос, и проверка так и делала: два её
      обращения и составляли те самые «не больше двух кадров», которые она
      считала допустимым запасом. Теперь запаса не нужно вовсе.
    */
    const framesNow = () => page.evaluate(() => window.PromisedLandScene.frames());
    /*
      Сперва дожидаемся хода человека. Пока ходит соперник, сцена и обязана
      рисоваться — это не течь, а игра: фишка идёт, постройка встаёт, кости
      падают. Покой наступает там, где игра ждёт нажатия, и мерить его надо
      именно там.
    */
    for (let tick = 0; tick < 80; tick += 1) {
      const mine = await page.locator('#actions .btn--primary:not([disabled])').count();
      const bot = await page.locator('#actions .waiting').count();
      if (mine > 0 && bot === 0) break;
      await page.waitForTimeout(250);
    }
    need(await page.locator('#actions .waiting').count() === 0,
      'за двадцать секунд ход так и не дошёл до человека');
    let settled = 0;
    let seen = await framesNow();
    for (let tick = 0; tick < 40 && settled < 2; tick += 1) {
      await page.waitForTimeout(250);
      const now = await framesNow();
      settled = now === seen ? settled + 1 : 0;
      seen = now;
    }
    need(settled >= 2, 'сцена не унялась за десять секунд — что-то рисуется без остановки');
    const quiet = await framesNow();
    await page.waitForTimeout(1500);
    const stillQuiet = await framesNow();
    need(stillQuiet === quiet,
      `за полторы секунды покоя сцена нарисовала ${stillQuiet - quiet} кадров`);
    spend = cost;
  }

  /*
    Платит игрок, а не игра. Долг обязан ждать нажатия: до него серебро не
    двигается, после — уменьшается ровно на сумму долга. Это единственное
    место, где видно разницу между «спросили» и «списали сами».
  */
  let asked = null;
  // Партия идёт, пока не покажет и счёт, и карту: что раньше выпадет, не нам решать.
  for (let step = 0; step < 1400 && (!asked || (ran && !card)); step += 1) {
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
    /*
      Карта на доске. Пока её не приняли, она лежит на середине лицом вверх —
      и это видно в пикселях: между «карта на столе» и «карта вернулась в
      колоду» кадр обязан измениться. Иначе полёт есть только на словах.
    */
    if (label.trim() === 'Принять' && !card) {
      const out = await snap(page, path.join(shots, 'card-out.png'));
      await primary.click({ timeout: 4_000 });
      await page.waitForTimeout(1100);
      const back = await snap(page, path.join(shots, 'card-back.png'));
      card = { gone: differ(out.file, back.file, true) };
      continue;
    }
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
  if (ran) {
    need(card !== null, 'за всю партию ни разу не выпала карта из колоды');
    if (card) {
      /*
        Порог взят с запасом от замера: карта, уходя со стола, меняет от 1.8 до
        4.1 процента середины поля — в зависимости от того, какая выпала и что
        она сделала. Без карты на столе разница ровно нулевая.
      */
      need(card.gone > 0.008,
        `карта ушла со стола, изменив ${(card.gone * 100).toFixed(2)}% середины поля — `
        + 'её там и не было');
    }
  }
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
  /*
    Кнопка ждётся видимой, а не просто найденной в разметке. «Авто» стоит на
    полосе хода человека, и пока ходит соперник, полоса показывает ожидание, а
    кнопки на ней спрятаны: найти такую кнопку можно и тогда, нажать — нет.
    Проверка на этом и падала: сосчитала кнопку на ходу человека, а нажать
    успела уже на ходу соперника — «element is not visible» шестьдесят раз
    подряд и обрыв с трассировкой вместо внятного ответа.
  */
  const autoReady = await auto.first().waitFor({ state: 'visible', timeout: BOARD_WAIT })
    .then(() => true, () => false);
  need(autoReady, 'кнопки «Авто» нет на экране хода человека');
  if (autoReady) {
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
    /*
      Запас по времени тут щедрый нарочно. Ходы соперников идут с задержкой, и
      два хода человека подряд набираются за полминуты, когда проверка идёт
      одна. В общем прогоне, где браузер поднимают двадцать восемь проверок по
      очереди, те же два хода не укладывались в сорок восемь секунд — и падало
      не «Авто», а часы. Здоровому прогону запас ничего не стоит: цикл
      обрывается сразу, как только оба хода сыграны.
    */
    for (let step = 0; step < 600 && humanPassed < 2; step += 1) {
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
    Шестеро за столом и партия «до последнего». Стол на шестерых — предел, на
    который рассчитано поле, и раскладка обязана его выдержать на узком экране:
    шесть карточек, ни одна не за краем. А режим без срока должен и называться
    иначе: в шапке вместо «год из трёх» стоит, сколько игроков ещё держится.
  */
  const many = await browser.newContext({
    viewport: { width: 320, height: 720 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const table = await many.newPage();
  const tableErrors = [];
  table.on('pageerror', (error) => tableErrors.push(String(error)));
  await table.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  // Первый экран — выбор способа игры; настройки партии за ним.
  await table.locator('.mode-card[data-mode="solo"]').click();
  await table.locator('.choice[data-key="bots"] button[data-value="5"]').click();
  await table.locator('.choice[data-key="years"] button[data-value="last"]').click();
  /*
    Нажатие вызовом, а не пальцем. Полоса действий на экране настроек липнет
    к низу, и Playwright, доводя до неё «палец», ждёт, пока элемент замрёт, —
    а липкий элемент при доводке и двигается. Пальцем кнопка нажимается: под
    её серединой лежит она сама, и это проверяет check-promised-land-frame-fit.
  */
  await table.evaluate(() => document.getElementById('start-btn').click());
  await table.waitForSelector('#game:not([hidden])', { timeout: BOARD_WAIT });
  const skipMany = table.locator('#teach-skip');
  if (await skipMany.count() && await skipMany.isVisible()) {
    await skipMany.click();
    await table.waitForSelector('#teach[hidden]', { state: 'attached', timeout: BOARD_WAIT });
  }
  await table.waitForTimeout(700);
  const crowd = await table.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const over = [...document.querySelectorAll('#game *')]
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && (box.right > width + 0.5 || box.left < -0.5);
      })
      .map((node) => `${node.tagName}.${node.className}`.slice(0, 40));
    return {
      players: document.querySelectorAll('.player').length,
      year: document.getElementById('year').textContent,
      aside: document.documentElement.scrollWidth - width,
      over: [...new Set(over)].slice(0, 4),
    };
  });
  need(crowd.players === 6, `за столом ${crowd.players} карточек игроков вместо шести`);
  need(crowd.aside === 0 && crowd.over.length === 0,
    `на узком экране за край вышли: ${crowd.over.join(', ') || crowd.aside + 'px'}`);
  need(/держатся\s+6/.test(crowd.year),
    `в партии «до последнего» шапка показывает «${crowd.year}»`);
  /*
    Выкуп из темницы. Человека туда не доводит ни один осмысленный путь
    нажатиями, поэтому он сажается прямо: партия спрашивается у страницы,
    игрок сажается в темницу и экран перерисовывается. Делается это здесь, на
    столе шестерых, а не в главной партии: спрошенное состояние сбивает чужой
    ход, а этой странице дальше играть уже нечего.
  */
  const jail = await table.evaluate(() => {
    const game = window.PromisedLandGame;
    const B = window.PromisedLandBoard;
    const state = game.state();
    const player = state.players[0];
    state.turn = 0;
    state.phase = 'roll';
    state.pending = null;
    player.prison = B.PRISON_TURNS;
    player.pos = 9;
    player.silver = 900;
    game.refresh();
    return B.BAIL;
  });
  const bailBtn = table.locator('#actions button', { hasText: /^Выкуп \d+/ });
  const bailCount = await bailBtn.count();
  need(bailCount === 1, `в темнице кнопок выкупа ${bailCount}, а нужна одна`);
  // Дальше спрашивать нечего, если кнопки нет: без неё всё остальное — падение
  // с трассировкой вместо внятного «кнопки выкупа нет».
  if (bailCount === 1) {
    need((await bailBtn.first().textContent()).includes(String(jail)),
      `на кнопке выкупа не цена в ${jail} сиклей`);
    need(await table.locator('#actions button', { hasText: /^Бросить жребий$/ }).count() === 1,
      'в темнице пропал жребий: выкуп не должен съедать ход');
    await bailBtn.first().click();
    need(await table.locator('#actions button', { hasText: /^Выкуп \d+/ }).count() === 0,
      'после выкупа кнопка выкупа осталась на экране');
    const freed = await table.evaluate(() => {
      const state = window.PromisedLandGame.state();
      return { prison: state.players[0].prison, silver: state.players[0].silver };
    });
    need(freed.prison === 0, 'после выкупа игрок остался в темнице');
    need(freed.silver === 900 - jail, `за выкуп сняли ${900 - freed.silver} вместо ${jail}`);
  }

  need(tableErrors.length === 0, `на столе шестерых ошибки — ${tableErrors.slice(0, 2).join(' | ')}`);
  await many.close();

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
  // Первый экран — выбор способа игры; настройки партии за ним.
  await wide.locator('.mode-card[data-mode="solo"]').click();
  /*
    Нажатие вызовом, а не пальцем. Полоса действий на экране настроек липнет
    к низу, и Playwright, доводя до неё «палец», ждёт, пока элемент замрёт, —
    а липкий элемент при доводке и двигается. Пальцем кнопка нажимается: под
    её серединой лежит она сама, и это проверяет check-promised-land-frame-fit.
  */
  await wide.evaluate(() => document.getElementById('start-btn').click());
  await wide.waitForSelector('#game:not([hidden])', { timeout: BOARD_WAIT });
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
  await side.close();
  side = null;

  /*
    Боком на высоком экране. Раскладка боком когда-то включалась только на
    низком экране — до 620 точек, — и всё, что выше, получало вертикальную
    раскладку, растянутую вширь: доска мелкая посередине, кнопки во всю ширину,
    низ уезжал за край. Спрашивается здесь именно высокий экран, потому что
    низкий работал и тогда.

    И спрашивается место кнопок. Боком телефон держат двумя руками, и большой
    палец достаёт до нижнего угла, а не до середины экрана: кнопки обязаны
    стоять там, а не полосой во всю ширину.
  */
  side = await browser.newContext({
    viewport: { width: 1180, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const tall = await side.newPage();
  const tallErrors = [];
  tall.on('pageerror', (error) => tallErrors.push(String(error)));
  await tall.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  // Первый экран — выбор способа игры; настройки партии за ним.
  await tall.locator('.mode-card[data-mode="solo"]').click();
  /*
    Нажатие вызовом, а не пальцем. Полоса действий на экране настроек липнет
    к низу, и Playwright, доводя до неё «палец», ждёт, пока элемент замрёт, —
    а липкий элемент при доводке и двигается. Пальцем кнопка нажимается: под
    её серединой лежит она сама, и это проверяет check-promised-land-frame-fit.
  */
  await tall.evaluate(() => document.getElementById('start-btn').click());
  await tall.waitForSelector('#game:not([hidden])', { timeout: BOARD_WAIT });
  const skipTall = tall.locator('#teach-skip');
  if (await skipTall.count() && await skipTall.isVisible()) {
    await skipTall.click();
    await tall.waitForSelector('#teach[hidden]', { state: 'attached', timeout: BOARD_WAIT });
  }
  await tall.waitForTimeout(900);
  const roomy = await tall.evaluate(() => {
    const doc = document.documentElement;
    const canvas = document.getElementById('board3d').getBoundingClientRect();
    const actions = document.getElementById('actions').getBoundingClientRect();
    return {
      down: doc.scrollHeight - doc.clientHeight,
      aside: doc.scrollWidth - doc.clientWidth,
      canvasShare: (canvas.width * canvas.height) / (doc.clientWidth * doc.clientHeight),
      fromRight: doc.clientWidth - actions.right,
      fromBottom: doc.clientHeight - actions.bottom,
      actionWidth: actions.width / doc.clientWidth,
      buttons: document.querySelectorAll('#actions button').length,
    };
  });
  need(roomy.down === 0 && roomy.aside === 0,
    `боком на высоком экране прокрутка ${roomy.down}/${roomy.aside}`);
  need(roomy.canvasShare > 0.9,
    `боком на высоком экране доске отдано ${(roomy.canvasShare * 100).toFixed(0)}% экрана`);
  need(roomy.fromRight < 24 && roomy.fromBottom < 24,
    `кнопки боком стоят в ${Math.round(roomy.fromRight)}×${Math.round(roomy.fromBottom)} от угла — `
    + 'большому пальцу не достать');
  need(roomy.actionWidth < 0.5,
    `кнопки боком заняли ${(roomy.actionWidth * 100).toFixed(0)}% ширины — это полоса, а не кучка`);
  need(roomy.buttons >= 4, `боком на экране ${roomy.buttons} кнопок — часть потерялась`);
  need(tallErrors.length === 0,
    `боком на высоком экране ошибки — ${tallErrors.slice(0, 2).join(' | ')}`);
  await side.close();
  side = null;

  /*
    Стоймя партия обязана помещаться в экран целиком и не прыгать. Прокрутка на
    каждом ходу — лишнее движение: то доска уехала, то кнопка. А доска, которая
    меняет размер вслед за карточкой, — то же самое, только хуже: карточка
    удела вдвое выше простой подписи, и поле скакало с 350 точек до 216 и
    обратно на каждой остановке.
  */
  side = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const upright = await side.newPage();
  await upright.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  // Первый экран — выбор способа игры; настройки партии за ним.
  await upright.locator('.mode-card[data-mode="solo"]').click();
  /*
    Нажатие вызовом, а не пальцем. Полоса действий на экране настроек липнет
    к низу, и Playwright, доводя до неё «палец», ждёт, пока элемент замрёт, —
    а липкий элемент при доводке и двигается. Пальцем кнопка нажимается: под
    её серединой лежит она сама, и это проверяет check-promised-land-frame-fit.
  */
  await upright.evaluate(() => document.getElementById('start-btn').click());
  await upright.waitForSelector('#game:not([hidden])', { timeout: BOARD_WAIT });
  const skipUp = upright.locator('#teach-skip');
  if (await skipUp.count() && await skipUp.isVisible()) {
    await skipUp.click();
    await upright.waitForSelector('#teach[hidden]', { state: 'attached', timeout: BOARD_WAIT });
  }
  await upright.waitForTimeout(900);
  const board = () => upright.evaluate(() => {
    const doc = document.documentElement;
    return {
      height: Math.round(document.getElementById('board3d').getBoundingClientRect().height),
      down: doc.scrollHeight - doc.clientHeight,
    };
  });
  const plain = await board();
  await upright.evaluate(() => {
    const game = window.PromisedLandGame;
    const B = window.PromisedLandBoard;
    const state = game.state();
    const plot = B.BOARD.find((cell) => cell.kind === 'plot');
    state.players[0].pos = plot.n;
    state.phase = 'act';
    state.pending = { type: 'note', title: plot.name, text: 'Свободен. Ничья земля.' };
    game.refresh();
  });
  await upright.waitForTimeout(400);
  const landed = await board();
  need(plain.down === 0 && landed.down === 0,
    `стоймя экран прокручивается: ${plain.down} до карточки, ${landed.down} с карточкой`);
  need(plain.height === landed.height,
    `стоймя доска прыгает с ${plain.height} на ${landed.height} точек, когда открывается карточка`);
  need(plain.height > 300, `стоймя доске досталось ${plain.height} точек`);
  await side.close();
  side = null;
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
  ? 'OK: обучение не заводится само, но открывается кнопкой в шапке партии и показывает '
  + 'шаги на самой доске; фигурки и '
    + 'постройки — тела, а не картинки; доска влезает в холст целиком и занимает его почти '
    + 'весь, на ближнем ряду плиток есть подписи, луч различает клетки поимённо. Доска '
    + 'поворачивается пальцем и не вылезает за край, щипок отдаляет её, «Вернуть вид» '
    + 'возвращает прежний. Долг ждёт нажатия игрока, «Авто» играет ход человека сам, '
    + 'за столом помещаются шестеро, над фишками стоят имена, '
    + 'на занятых уделах подписаны хозяева, все пять ступеней и все шесть фишек стоят '
    + 'настоящими моделями, '
    + 'темп соперников переключается, выкуп из '
    + 'темницы предлагается кнопкой, вокруг доски стоит поселение и восемь зрителей, '
    + 'которые поворачиваются к ходящей фишке, щипок подпускает к клетке вплотную, '
    + 'а боком на высоком экране доске отдан весь холст и кнопки собраны в угол под '
    + 'большой палец; стоймя партия влезает в экран и доска не прыгает под карточкой. '
    + 'Консоль чистая. Кадр стоит '
    + `${spend ? spend.idle.calls : '?'} вызовов отрисовки на пустом поле и `
    + `${spend ? spend.full.calls : '?'} на застроенном (${spend ? spend.full.triangles : '?'} `
    + 'треугольников), а в покое не рисуется вовсе. Карта, уходя со стола, меняет '
    + `${card ? (card.gone * 100).toFixed(1) : '?'}% середины поля.`
  : 'OK: поле в объёме пропущено (нет WebGL), но плата по нажатию и «Авто» проверены.');
