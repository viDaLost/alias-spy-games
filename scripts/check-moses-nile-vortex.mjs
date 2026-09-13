// Водовороты «Моисея на Ниле» видно на воде.
//
// Отзыв владельца: «водовороты очень плохо заметны». Так и было, и причина
// измерима. Меш водоворота занимал по высоте от −1.51 до +0.02: конус, спираль
// пены и почти все кольца живут ниже поверхности, и река их закрывала. Над
// водой торчали два сантиметра — три тонких полупрозрачных кольца цвета
// #d8e2d2 на воде, у которой своей белой пены хватает. Вблизи водоворот не
// читался вовсе: на кадре между корзинкой и горизонтом была пустая река.
//
// Проверять это чтением исходника мало: «заметно» — свойство картинки, а не
// текста. Поэтому игра запускается по-настоящему и замеряется сама картинка:
// насколько пятно водоворота отличается от воды вокруг. Контроль — тот же кадр
// без водоворотов: он доказывает, что измеряется предмет, а не собственная
// пена реки.
//
// Замер идёт в запасном 2D-режиме, как и все остальные проверки этой игры:
// он не зависит от того, есть ли на машине GPU. Объёмный режим закрыт разбором
// исходника — там проверяется ровно то, из-за чего водоворот и пропадал.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const gameRoot = path.join(root, 'web/games/moses-nile-v7');
const source = fs.readFileSync(path.join(gameRoot, 'js/game-v75.js'), 'utf8');
const shaders = fs.readFileSync(path.join(gameRoot, 'js/shaders.js'), 'utf8');
const fail = (message) => { throw new Error(message); };

// --- 1. объёмный режим: пятно на поверхности, а не под ней -------------------------
{
  const vortex = source.slice(source.indexOf('function createVortex()'), source.indexOf('function hippoAxis('));

  if (!/createWhirlMaterial/.test(shaders)) fail('Шейдер водоворота пропал из shaders.js');
  if (!/createWhirlMaterial/.test(vortex)) fail('Водоворот больше не рисует пятно на поверхности');

  // Пятно обязано лежать над водой. Вся прежняя геометрия была ниже нуля —
  // именно поэтому река её и закрывала.
  const heights = [...vortex.matchAll(/\.position\.y = (-?[\d.]+)/g)].map((m) => Number(m[1]));
  if (!heights.some((y) => y > 0)) {
    fail('Ни одна часть водоворота не поднята над водой — река закроет его целиком');
  }

  // Кольца пены тоже должны быть над поверхностью и непрозрачными: раньше они
  // лежали вровень с водой и просвечивали насквозь.
  const ringY = Number(vortex.match(/ring\.position\.y = ([\d.]+)/)?.[1] ?? -1);
  if (!(ringY > 0.05)) fail(`Кольца пены снова лежат вровень с водой (y=${ringY})`);
  const ringOpacity = Number(vortex.match(/opacity: ([\d.]+) - i \* [\d.]+,/)?.[1] ?? 0);
  if (!(ringOpacity >= 0.8)) fail(`Кольца пены снова полупрозрачные (opacity=${ringOpacity})`);

  // Обод пятна показывает игроку границу опасности. Разойдётся с радиусом
  // поражения — игрок будет читать границу не там, где она есть.
  const disc = Number(source.match(/const VORTEX_DISC = ([\d.]+);/)?.[1]);
  const edge = Number(source.match(/const VORTEX_HIT = ([\d.]+);/)?.[1]);
  const hit = Number(source.match(/vortex: \{ clearance: 'ground', radius: ([\d.]+)/)?.[1]);
  if (!Number.isFinite(disc) || !Number.isFinite(edge) || !Number.isFinite(hit)) {
    fail('Не найдены размеры пятна водоворота или его радиус поражения');
  }
  if (Math.abs(disc * 0.5 * edge - hit) > 1e-6) {
    fail(`Обод пятна (${(disc * 0.5 * edge).toFixed(3)}) не совпадает с радиусом поражения (${hit})`);
  }

  // Без шейдера игра не должна остаться с невидимым препятствием.
  if (!/CircleGeometry/.test(vortex) || !/RingGeometry/.test(vortex)) {
    fail('У водоворота нет запасного силуэта на случай, если шейдер не собрался');
  }
}

// --- сервер игры ---------------------------------------------------------------------
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'], ['.glb', 'model/gltf-binary'],
]);

/*
  Ряд препятствий выбирается случайно, и ждать водоворота у моря погоды —
  значит получить проверку, которая иногда падает сама по себе. Поэтому в
  подаваемой копии подменяется ровно одна строка: выбор типа. Всё остальное —
  настоящий код игры, включая саму отрисовку водоворота.
*/
const FORCE_VORTEX = "let type = weightedType(z + lane * 3.7 + rowIndex, weights);";
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = path.resolve(gameRoot, `.${pathname}`);
  if (!target.startsWith(gameRoot + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  if (target.endsWith('game-v75.js')) {
    const code = fs.readFileSync(target, 'utf8');
    if (!code.includes(FORCE_VORTEX)) {
      res.end(code);
      return;
    }
    res.end(code.replace(FORCE_VORTEX, "let type = 'vortex';"));
    return;
  }
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

if (!source.includes(FORCE_VORTEX)) {
  server.close();
  fail('Проверка не смогла заставить игру порождать водовороты: строка выбора типа изменилась');
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-webgl'],
});

/**
 * Прогон игры. `keepVortex = false` убирает водовороты на каждом кадре — это
 * контрольный кадр, на котором в той же полосе остаётся одна вода.
 */
async function run(keepVortex) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.route('**/vendor/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.route('**/js/assets.js*', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.assetManager={};' }));
  await page.route('**/js/sound.js*', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'window.gameAudio={init(){},playSplash(){},playCollect(){},playPowerup(){},playHit(){},playGrowl(){}};',
  }));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 25_000 });
  await page.evaluate(() => localStorage.setItem('moses-nile-tutorial-seen-v1', '1'));
  await page.reload({ waitUntil: 'networkidle', timeout: 25_000 });
  await page.waitForFunction(() => window.__mosesV75Mode === 'fallback', null, { timeout: 15_000 });
  await page.locator('#start-btn').click();
  await page.waitForFunction(() => document.body.classList.contains('is-playing'), null, { timeout: 8_000 });

  // Река везёт водоворот к корзинке; щит держим, чтобы партия не кончилась.
  let ready = false;
  for (let attempt = 0; attempt < 150 && !ready; attempt += 1) {
    ready = await page.evaluate((keep) => {
      const state = window.__mosesV75State;
      if (!state) return false;
      state.shield = 99;
      state.lives = 3;
      if (!keep) {
        for (const item of state.items) if (item.type === 'vortex') item.z = -900;
        return state.distance > 60;
      }
      const near = state.items.filter((item) => item.type === 'vortex' && item.z > -16 && item.x === 0);
      if (near.length) { state.speed = 0; return true; }
      return false;
    }, keepVortex);
    if (!ready) await page.waitForTimeout(90);
  }
  if (!ready) { await context.close(); return null; }
  await page.waitForTimeout(320);

  /*
    Замер по самому холсту: у запасного режима вся картинка рисуется в 2D, и
    пиксели читаются напрямую, без выгрузки снимка и разбора PNG.
  */
  const measured = await page.evaluate(() => {
    const canvas = document.getElementById('fallback-canvas');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    /*
      Полоса реки между горизонтом и корзинкой. Границы взяты долями, а не
      пикселями: точное место водоворота на экране зависит от проекции, и
      прибивать его числом значило бы ломать проверку от любой правки камеры.
    */
    const top = Math.round(h * .35);
    const bottom = Math.round(h * .75);
    const left = Math.round(w * .2);
    const right = Math.round(w * .8);
    const grey = [];
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const i = (y * w + x) * 4;
        // Прозрачные пиксели холста читаются как чёрные и портят замер.
        if (data[i + 3] < 250) continue;
        grey.push(.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]);
      }
    }
    grey.sort((a, b) => a - b);
    return { median: grey[Math.floor(grey.length / 2)], darkest: grey[0], brightest: grey[grey.length - 1] };
  });
  await context.close();
  return measured;
}

try {
  const withVortex = await run(true);
  const water = await run(false);
  if (!withVortex) fail('Водоворот так и не доехал до замера');
  if (!water) fail('Не удалось снять контрольный кадр без водоворотов');

  // Насколько предмет отличается от воды: провал в тёмное и всплеск в пену.
  const dip = (value) => (value.median - value.darkest) / value.median * 100;
  const spike = (value) => (value.brightest - value.median) / value.median * 100;

  const vortexDip = dip(withVortex);
  const vortexSpike = spike(withVortex);
  const waterDip = dip(water);

  /*
    Пороги взяты с запасом от замеренного на этой полосе: после правки провал
    около 69%, всплеск около 136%, а тот же кадр без водоворотов отклоняется на
    42% — это берега и корзинка, попадающие в полосу. Прежняя отрисовка от этого
    фона не отличалась вовсе.
  */
  if (vortexDip < 45) {
    fail(`Водоворот почти не темнее воды: провал ${vortexDip.toFixed(1)}% при пороге 45%`);
  }
  if (vortexSpike < 30) {
    fail(`У водоворота нет пенного обода: всплеск ${vortexSpike.toFixed(1)}% при пороге 30%`);
  }
  // Контроль: если та же полоса без водоворота показывает тот же провал, значит
  // замеряется рябь реки, а не предмет, и порог ничего не значит.
  if (waterDip >= vortexDip - 15) {
    fail(`Замер не отличает водоворот от воды: с ним ${vortexDip.toFixed(1)}%, без него ${waterDip.toFixed(1)}%`);
  }

  console.log(`OK: водоворот виден на воде — темнее её на ${vortexDip.toFixed(0)}% `
    + `и светлее на ${vortexSpike.toFixed(0)}% по ободу, тогда как сама вода в той же полосе `
    + `отклоняется лишь на ${waterDip.toFixed(0)}%; пятно лежит над поверхностью, `
    + 'а его обод совпадает с радиусом поражения.');
} finally {
  await browser.close();
  server.close();
}
