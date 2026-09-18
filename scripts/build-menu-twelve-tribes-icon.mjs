// Готовит иконку меню «Двенадцать колен» из присланного исходника
// scripts/art/menu-twelve-tribes-source.png и приводит её к формату набора
// web/assets/icons: WebP 224×224 с прозрачным фоном за скруглённой плиткой.
//
//   node scripts/build-menu-twelve-tribes-icon.mjs           пересобрать
//   node scripts/build-menu-twelve-tribes-icon.mjs --check   убедиться, что файл на месте
//
// Зачем вообще пересобирать. Исходник пришёл размером 1254×1254 и весом в три
// с половиной мегабайта — это в сто раз больше соседей по набору. Папка
// web/assets/icons целиком уходит в кеш при установке приложения, то есть за
// эти мегабайты платил бы каждый, кто открыл меню, включая тех, кто в игру не
// заходит. После пересборки иконка весит десятки килобайт и выглядит так же:
// на экране она живёт размером 70 точек.
//
// Сам исходник тоже уменьшен — до 768 точек по длинной стороне. Он лежит в
// репозитории ради пересборки, а не ради печати: из 768 точек иконка в 224
// собирается с тем же запасом, и три с половиной мегабайта в истории репозитория
// за это платить не нужно.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'scripts/art/menu-twelve-tribes-source.png');
const outFile = path.join(root, 'web/assets/icons/twelve-tribes.webp');
const SIZE = 224;

if (process.argv.includes('--check')) {
  if (!fs.existsSync(outFile) || fs.statSync(outFile).size < 4000) {
    console.error('Иконка «Двенадцати колен» не собрана. Запустите node scripts/build-menu-twelve-tribes-icon.mjs');
    process.exit(1);
  }
  console.log(`Иконка «Двенадцати колен» на месте: ${path.relative(root, outFile)}.`);
  process.exit(0);
}

if (!fs.existsSync(source)) {
  console.error(`Нет исходника ${path.relative(root, source)}`);
  process.exit(1);
}

/*
  Браузер нужен только для сборки: WebP в Node записать нечем, а в холсте он
  есть. Импорт отложенный — в проверочной задаче CI зависимостей нет, и на
  верхнем уровне падал бы даже --check.
*/
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();

const result = await page.evaluate(async ({ dataUrl, size }) => {
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = dataUrl; });

  const full = document.createElement('canvas');
  full.width = image.naturalWidth;
  full.height = image.naturalHeight;
  const fullCtx = full.getContext('2d', { willReadFrequently: true });
  fullCtx.drawImage(image, 0, 0);
  const { width, height } = full;
  const data = fullCtx.getImageData(0, 0, width, height).data;

  // Обрезка по рисунку: у исходника поля прозрачные, и в наборе они лишние —
  // остальные иконки заполняют свой квадрат целиком.
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX <= minX || maxY <= minY) throw new Error('в исходнике нет непрозрачных точек');

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const scale = Math.min(size / boxW, size / boxH);
  const drawW = boxW * scale;
  const drawH = boxH * scale;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, minX, minY, boxW, boxH, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH);

  return { url: canvas.toDataURL('image/webp', 0.92), box: `${boxW}×${boxH}` };
}, { dataUrl: `data:image/png;base64,${fs.readFileSync(source).toString('base64')}`, size: SIZE });

if (!result.url.startsWith('data:image/webp')) throw new Error('WebP не поддержан');
const buffer = Buffer.from(result.url.split(',')[1], 'base64');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, buffer);
console.log(`twelve-tribes.webp  вырезано ${result.box} → ${SIZE}×${SIZE}  ${(buffer.length / 1024).toFixed(1)} КБ`);

await browser.close();
