// «Земля обетованная» в кадре приложения: экран занят игрой, и ничего не срезано.
//
// Игра открывается кадром внутри оболочки, и у этого есть две беды, которые
// видно только отсюда — ни проверка самой игры, ни проверка меню их не ловят,
// потому что каждая смотрит на свою сторону кадра.
//
//   * Пустая полоса. Место под кнопки Telegram и под «Главное меню» можно
//     занять, отодвинув кадр вниз. Боком это съедало больше трети высоты:
//     наверху белая полоса, внизу доска в оставшейся щели. Вместо этого игра
//     отступает сама (--chrome-top/--chrome-bottom), а кадр занимает всё.
//
//   * Срезанный низ. Внутри кадра 100vh — это высота кадра, а не то, что
//     осталось после отступов. Полоса управления и карточки игроков уезжали
//     под нижний край целиком, и «Мои уделы», «Авто» и «Быстрее» было не нажать.
//
// Поэтому здесь меряются настоящие прямоугольники по обе стороны кадра: где
// он начинается, где кончаются кнопки игры и не лежит ли на них кнопка выхода.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const root = process.cwd();
const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

// Картинки живут в web/assets/promised-land, а игра ищет их рядом с собой.
execFileSync(process.execPath, [path.join(root, 'scripts/sync-promised-land-art.mjs')],
  { cwd: root, stdio: 'pipe' });

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.webp', 'image/webp'], ['.png', 'image/png'],
  ['.json', 'application/json'], ['.webmanifest', 'application/manifest+json'],
  ['.svg', 'image/svg+xml'], ['.glb', 'model/gltf-binary'],
]);

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
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
  С WebGL — и это здесь обязательно. Соседние проверки раскладки нарочно его
  отключают, чтобы смотреть на запасное поле из разметки. Но вся раскладка
  партии написана под «#game.has-3d», а этот класс появляется только тогда,
  когда объёмная сцена поднялась. Без WebGL проверка мерила бы совсем другой
  экран — тот, который игрок в приложении не видит никогда.
*/
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

/** Партия, открытая кадром в оболочке, на экране заданного размера. */
async function openGame(width, height) {
  const context = await browser.newContext({
    viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(2200);
  /*
    В бою игру раздаёт её воркер, и адрес его записан метой. Проверке нужен тот
    же код, но из этого дерева: до сети отсюда не достучаться, да и проверять
    надо то, что сейчас в исходниках, а не то, что выложено вчера. Меняется
    только адрес — всё остальное, включая саму оболочку, настоящее.
  */
  await page.evaluate(() => {
    const meta = document.querySelector('meta[name="promised-land-app"]')
      || document.head.appendChild(Object.assign(document.createElement('meta'),
        { name: 'promised-land-app' }));
    meta.content = 'cloudflare/promised-land-preview/public/index.html';
  });
  await page.evaluate(() => window.showGame?.('promised-land'));
  await page.waitForSelector('iframe.game-frame', { timeout: 10_000 });
  const frame = await (await page.locator('iframe.game-frame').elementHandle()).contentFrame();
  await frame.waitForSelector('.mode-card[data-mode="solo"]', { timeout: 15_000 });
  /*
    Карточки режимов стоят в самой разметке, а кнопки оживляет ui.js в конце
    страницы — после three.js и прочих скриптов. Нажатие, пришедшее раньше,
    уходит в пустоту, и партия так и не начинается (так падал CI на 808739b).
    Ждём, пока ui.js отработает: он и выставляет PromisedLandGame.
  */
  await frame.waitForFunction(() => Boolean(window.PromisedLandGame), null, { timeout: 30_000 });
  /*
    Нажатия здесь — вызовом, а не пальцем. Кнопка начала лежит на экране
    настроек, и он длиннее кадра: палец до неё доводит прокрутка, а проверяется
    не он, а раскладка партии, которая за ним. Полоса же управления в самой
    партии нажимается по-настоящему — это и есть предмет проверки.
  */
  await frame.evaluate(() => document.querySelector('.mode-card[data-mode="solo"]').click());
  await frame.evaluate(() => document.getElementById('start-btn').click());
  /*
    Первый кадр партии ждётся долго нарочно. На сборочной машине сцену рисует
    SwiftShader, её первая сборка занимает главный поток страницы на несколько
    секунд, и ответ «поле уже видно» приходит задним числом. Десяти секунд
    хватало, пока проверка шла одна; рядом с соседней она их перебирала и
    падала на том, что работает.
  */
  await frame.waitForSelector('#game:not([hidden])', { timeout: 30_000 });
  // Первую партию встречает обучение: оно закрывает полосу кнопок собой.
  await frame.evaluate(() => document.getElementById('teach-skip')?.click());
  // Сцена поднимается не мгновенно, а вся раскладка партии висит на её классе.
  await frame.waitForSelector('#game.has-3d', { timeout: 90_000 });
  /*
    Всё, что открывается, открывается до замеров. Закрытыми карточки игроков и
    журнал прячут ровно то, ради чего эта проверка и написана, и мерить
    посадку кадра по пустому экрану значило бы всякий раз получать «всё
    поместилось».
  */
  for (const id of ['players-open', 'feed-open']) {
    const tab = frame.locator(`#${id}`);
    if (await tab.count() && await tab.getAttribute('aria-pressed') === 'false') {
      await tab.first().click().catch(() => {});
    }
  }
  await page.waitForTimeout(1600);
  return { context, page, frame, errors };
}

try {
  for (const [width, height, name] of [[844, 390, 'боком'], [390, 844, 'стоймя']]) {
    const { context, page, frame, errors } = await openGame(width, height);

    /*
      1. Пустая полоса сверху. Кадр обязан начинаться сразу под шапкой клиента,
      а не под ней плюс ещё одна полоса под кнопку выхода. Мерой служит сама
      шапка: столько же отводит себе оболочка, и больше этого — уже потеря.
    */
    const band = await page.evaluate(() => {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue('--game-chrome-top');
      return Math.round(parseFloat(value) || 0);
    });
    const box = await page.locator('iframe.game-frame').boundingBox();
    need(box && box.y <= band + 4,
      `${name}: кадр начинается на ${Math.round(box?.y ?? -1)} при полосе клиента ${band} — сверху пусто`);
    need(box && box.height >= height - band - 8,
      `${name}: кадру отдано ${Math.round(box?.height ?? 0)} из ${height - band} доступных`);

    /*
      2. Ничего не срезано.

      Спрос разный, и это не поблажка. Боком экран не прокручивается вовсе:
      доска лежит на всём кадре, а управление — полосой поверх её нижнего края,
      и всё, что не влезло, потеряно навсегда. Стоймя страница прокручивается —
      карточки игроков и летопись честно лежат ниже сгиба. Но кнопки хода не
      лежат: их нажимают каждый ход, и искать их прокруткой нельзя.
    */
    const wide = width > height;
    const cut = await frame.evaluate((all) => {
      const out = [];
      const selector = all
        ? '.actions-main button, #tools .tab, .players .player, .hud-bar > *'
        : '.actions-main button, #tools .tab, .hud-bar > *';
      for (const node of document.querySelectorAll(selector)) {
        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        if (rect.bottom > innerHeight + 1 || rect.top < -1
          || rect.right > innerWidth + 1 || rect.left < -1) {
          out.push(`${node.textContent.trim().slice(0, 18)} (${Math.round(rect.top)}…${Math.round(rect.bottom)})`);
        }
      }
      return { out, height: innerHeight, scroll: document.documentElement.scrollHeight };
    }, wide);
    need(cut.out.length === 0,
      `${name}: за краем кадра осталось — ${cut.out.slice(0, 3).join('; ')}`);

    /*
      3. Кнопка выхода не лежит на кнопках игры. Она снова висит поверх кадра,
      и это законно ровно до тех пор, пока под ней песок, а не управление.
    */
    const exit = await page.locator('.game-frame-exit').boundingBox();
    const overlap = await frame.evaluate(({ left, top, right, bottom }) => {
      const hits = [];
      for (const node of document.querySelectorAll(
        '.actions-main button, #tools .tab, .players .player, .hud-bar > *')) {
        const rect = node.getBoundingClientRect();
        if (rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom) continue;
        hits.push(node.textContent.trim().slice(0, 18));
      }
      return hits;
    }, {
      left: exit.x - box.x, top: exit.y - box.y,
      right: exit.x - box.x + exit.width, bottom: exit.y - box.y + exit.height,
    });
    need(overlap.length === 0,
      `${name}: «Главное меню» лежит на — ${overlap.slice(0, 3).join('; ')}`);

    // 4. Боком страница не прокручивается: всё управление на одном экране.
    if (wide) {
      need(cut.scroll <= cut.height + 2,
        `${name}: страница прокручивается — ${cut.scroll} при высоте ${cut.height}`);
    }

    need(errors.length === 0, `${name}: ошибки на странице — ${errors.slice(0, 2).join(' | ')}`);
    await context.close();
  }

  /*
    5. Экраны до партии. Сюда игрок попадает первым, и здесь же нашлась вторая
    срезанная кнопка: боком на низком экране «В путь» оказывалась ниже края, а
    прокрутку на экране настроек не ищут — её там не ждут. Теперь полоса
    действий липнет к низу, и проверяется именно это: кнопка на экране, какой
    бы длинной ни выросла страница над ней.
  */
  for (const [width, height, name] of [[844, 390, 'боком'], [740, 360, 'боком на низком'],
    [390, 844, 'стоймя'], [320, 568, 'стоймя на узком']]) {
    const context = await browser.newContext({
      viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(2200);
    await page.evaluate(() => {
      document.querySelector('meta[name="promised-land-app"]').content =
        'cloudflare/promised-land-preview/public/index.html';
    });
    await page.evaluate(() => window.showGame?.('promised-land'));
    await page.waitForSelector('iframe.game-frame', { timeout: 10_000 });
    const frame = await (await page.locator('iframe.game-frame').elementHandle()).contentFrame();
    await frame.waitForSelector('.mode-card[data-mode="solo"]', { timeout: 20_000 });
    await frame.waitForFunction(() => Boolean(window.PromisedLandGame), null, { timeout: 30_000 });
    // Кадр получает свой размер не в тот же миг, что и документ внутри него:
    // мерить раньше — значит мерить окно высотой в шесть десятков точек.
    await frame.waitForFunction(() => window.innerHeight > 200, null, { timeout: 10_000 });

    for (const [screen, press, button] of [
      ['выбор способа игры', null, '#mode-rules-btn'],
      ['настройки партии', '.mode-card[data-mode="solo"]', '#start-btn'],
    ]) {
      if (press) await frame.evaluate((one) => document.querySelector(one).click(), press);
      await page.waitForTimeout(400);
      const seen = await frame.evaluate((one) => {
        const node = document.querySelector(one);
        if (!node || node.offsetParent === null) return null;
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: innerHeight };
      }, button);
      need(seen && seen.bottom <= seen.height + 1 && seen.top >= -1,
        `${name}, ${screen}: главная кнопка вне экрана — ${seen
          ? `${Math.round(seen.top)}…${Math.round(seen.bottom)} из ${seen.height}` : 'её нет'}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error('«Земля обетованная» в кадре не прошла проверку раскладки:');
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log('OK: кадр начинается сразу под шапкой клиента и занимает всё, что ниже; ни одна '
  + 'кнопка партии и ни одна карточка игрока не уходит за край кадра; «Главное меню» не лежит '
  + 'на управлении, а боком экран не прокручивается. На экранах до партии главная кнопка '
  + 'видна на любом из четырёх размеров — и всё это в обоих положениях.');
