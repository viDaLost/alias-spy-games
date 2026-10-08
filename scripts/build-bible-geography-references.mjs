// Рисует опорные картинки для художника «Библейской географии».
//
//   node scripts/build-bible-geography-references.mjs
//
// Карты древнего и сегодняшнего мира рисует отдельная модель
// (docs/bible-geography-art-brief.md), а игра кладёт картинку под точки городов
// без всякой подгонки: берег на картинке обязан пройти там же, где он проходит
// в web/assets/bible-geography/map.json, иначе Иоппия окажется в море. Модель
// держит форму берега только по образцу, поэтому образец собирается из тех же
// данных, что и карта игры, — в тех же рамках и тех же пропорциях.
//
// Получаются четыре плоских рисунка в docs/bible-geography/: суша, море, озёра
// и реки, без подписей и границ. «Древняя» и «сегодня» отличаются Мёртвым морем
// (в древности — одно целое с южной чашей) и озером Хуле (осушено в 1950-х).

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const map = JSON.parse(fs.readFileSync(path.join(root, 'web/assets/bible-geography/map.json'), 'utf8'));
const outDir = path.join(root, 'docs/bible-geography');

// Рамка вставки «Святая земля» — та же, что HOLY в web/games/bible-geography.js.
const HOLY = { lon0: 33.9, lon1: 36.9, lat0: 29.4, lat1: 33.9 };
const f = map.frame;
const project = (lon, lat) => [(lon - f.lon0) * f.kx * f.unit, (f.lat1 - lat) * f.unit];
const [hx0, hy0] = project(HOLY.lon0, HOLY.lat1);
const [hx1, hy1] = project(HOLY.lon1, HOLY.lat0);

const FRAMES = {
  world: { box: [0, 0, f.w, f.h], size: [f.w, f.h], river: 1.6, coast: 1.2 },
  // 192 × 360 единиц карты — ровно 8:15; картинка в 8 раз крупнее.
  holy: { box: [hx0, hy0, hx1 - hx0, hy1 - hy0], size: [Math.round((hx1 - hx0) * 8), Math.round((hy1 - hy0) * 8)], river: 0.45, coast: 0.3 },
};

function svg(frame, era) {
  const { box, size, river, coast } = FRAMES[frame];
  const rivers = Object.values(map.rivers).map((one) => one.d).join('');
  const dead = era === 'ancient' ? map.deadSea.ancient : map.deadSea.modern;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size[0]}" height="${size[1]}" viewBox="${box.join(' ')}">
    <rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="#9fc6d8"/>
    <!-- Реки под озёрами: Иордан входит в Мёртвое море, а не пересекает его. -->
    <path d="${map.land}" fill="#efe2c2" stroke="#6b5a3a" stroke-width="${coast}" stroke-linejoin="round"/>
    <path d="${rivers}" fill="none" stroke="#2f78a8" stroke-width="${river}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${map.lakes}" fill="#9fc6d8" stroke="#6b5a3a" stroke-width="${coast}"/>
    <path d="${dead}" fill="#9fc6d8" stroke="#6b5a3a" stroke-width="${coast}"/>
    ${era === 'ancient' ? `<path d="${map.hula}" fill="#9fc6d8" stroke="#6b5a3a" stroke-width="${coast}"/>` : ''}
  </svg>`;
}

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
for (const frame of Object.keys(FRAMES)) {
  for (const era of ['ancient', 'modern']) {
    const [width, height] = FRAMES[frame].size;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>html,body{margin:0}svg{display:block}</style>${svg(frame, era)}`);
    const file = path.join(outDir, `${frame}-${era}-reference.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width, height } });
    await page.close();
    console.log(`${path.relative(root, file)}  ${width}×${height}  ${(fs.statSync(file).size / 1024).toFixed(0)} КБ`);
  }
}
await browser.close();
