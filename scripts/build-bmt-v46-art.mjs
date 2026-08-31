// Собирает две недостающие иконки «Библейских сокровищ» — тернии и ковчег
// завета — в тот же формат, что и остальной набор: WebP 128×128 с прозрачным
// фоном.
//
//   node scripts/build-bmt-v46-art.mjs           пересобрать
//   node scripts/build-bmt-v46-art.mjs --check   убедиться, что файлы на месте
//
// Рисунок растеризуется вчетверо крупнее и уменьшается уже в браузере: у
// векторной графики после прямого рендера в 128px «звенят» кромки, а после
// сглаженного уменьшения края получаются такими же мягкими, как у набора v17.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { covenantArk, vine } from './art/bmt-v46-icons.mjs';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'web/assets/biblical-match-three/icons-v17');
const SIZE = 128;
const SCALE = 4;

const icons = [
  { name: 'covenant-ark', svg: covenantArk },
  { name: 'vine', svg: vine },
];

if (process.argv.includes('--check')) {
  const missing = icons.filter(({ name }) => {
    const file = path.join(outDir, `${name}.webp`);
    return !fs.existsSync(file) || fs.statSync(file).size < 1500;
  });
  if (missing.length) {
    console.error(`Иконки v46 не собраны: ${missing.map((icon) => icon.name).join(', ')}. Запустите node scripts/build-bmt-v46-art.mjs`);
    process.exit(1);
  }
  console.log(`Иконки v46 на месте: ${icons.map((icon) => `${icon.name}.webp`).join(', ')}.`);
  process.exit(0);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: SIZE * SCALE, height: SIZE * SCALE }, deviceScaleFactor: 1 });

for (const { name, svg } of icons) {
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}
     svg{display:block;width:${SIZE * SCALE}px;height:${SIZE * SCALE}px}</style>${svg}`,
    { waitUntil: 'load' },
  );
  const big = await page.screenshot({ omitBackground: true, type: 'png' });
  const dataUrl = await page.evaluate(async ({ source, size }) => {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = source; });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, size, size);
    return canvas.toDataURL('image/webp', 0.92);
  }, { source: `data:image/png;base64,${big.toString('base64')}`, size: SIZE });

  if (!dataUrl.startsWith('data:image/webp')) throw new Error(`WebP не поддержан для ${name}`);
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${name}.webp`), buffer);
  console.log(`${name}.webp  ${SIZE}×${SIZE}  ${(buffer.length / 1024).toFixed(1)} КБ`);
}

await browser.close();
