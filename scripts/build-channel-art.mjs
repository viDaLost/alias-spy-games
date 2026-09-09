// Готовит две картинки канала обновлений из присланного логотипа
// scripts/art/menu-channel-source.jpg:
//
//   web/assets/channel-promo.webp   логотип целиком, для баннера в меню
//   web/assets/icons/channel.webp   только плитка, 224×224, для кнопки меню
//
//   node scripts/build-channel-art.mjs           пересобрать
//   node scripts/build-channel-art.mjs --check   убедиться, что файлы на месте
//
// Почему две, а не одна. В логотипе под плиткой лежит табличка «Инфо-канал».
// На баннере она к месту — это имя канала, и читается оно там свободно. В
// кнопке меню картинка выходит 40 пикселей высотой: подпись превращается в
// грязную полосу, да и приложение говорит на четырёх языках, а табличка —
// только на одном. Поэтому кнопке достаётся плитка без подписи.
//
// Табличка отделяется по ширине строки: плитка занимает 683 пикселя, а
// табличка расходится до 1030. Порог посередине и ловит границу, где бы она
// ни оказалась после следующей перерисовки логотипа.
//
// Фон снимается заливкой от краёв по бесцветным светлым пикселям — тем же
// приёмом, что и у остальных иконок набора: под логотипом лежит мягкая тень,
// и порог по чистому белому оставил бы от неё ореол.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'scripts/art/menu-channel-source.jpg');
const outputs = [
  { file: path.join(root, 'web/assets/channel-promo.webp'), size: 480, tileOnly: false, min: 8000 },
  { file: path.join(root, 'web/assets/icons/channel.webp'), size: 224, tileOnly: true, min: 4000 },
];

if (process.argv.includes('--check')) {
  const missing = outputs.filter(({ file, min }) => !fs.existsSync(file) || fs.statSync(file).size < min);
  if (missing.length) {
    console.error(`Картинки канала не собраны: ${missing.map(({ file }) => path.relative(root, file)).join(', ')}. `
      + 'Запустите node scripts/build-channel-art.mjs');
    process.exit(1);
  }
  console.log(`Картинки канала на месте: ${outputs.map(({ file }) => path.relative(root, file)).join(', ')}.`);
  process.exit(0);
}

// Браузер нужен только для сборки. Режим --check выше сюда не доходит, и
// импортировать playwright-core на верхнем уровне нельзя: в проверочной
// задаче CI зависимости не установлены, и падал бы даже --check.
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();

const results = await page.evaluate(async ({ dataUrl, jobs }) => {
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = dataUrl; });

  const full = document.createElement('canvas');
  full.width = image.naturalWidth;
  full.height = image.naturalHeight;
  const fullCtx = full.getContext('2d', { willReadFrequently: true });
  fullCtx.drawImage(image, 0, 0);
  const { width, height } = full;
  const pixels = fullCtx.getImageData(0, 0, width, height);
  const data = pixels.data;

  // --- фон: заливка от краёв -------------------------------------------------
  const isPaper = (index) => {
    if (data[index + 3] < 24) return true;
    const r = data[index], g = data[index + 1], b = data[index + 2];
    const min = Math.min(r, g, b);
    return min > 206 && Math.max(r, g, b) - min < 26;
  };
  const background = new Uint8Array(width * height);
  const queue = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const flat = y * width + x;
    if (background[flat] || !isPaper(flat * 4)) return;
    background[flat] = 1;
    queue.push(flat);
  };
  for (let x = 0; x < width; x += 1) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y += 1) { push(0, y); push(width - 1, y); }
  while (queue.length) {
    const flat = queue.pop();
    const x = flat % width;
    const y = (flat - x) / width;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  for (let flat = 0; flat < background.length; flat += 1) if (background[flat]) data[flat * 4 + 3] = 0;

  // Кромка после заливки ступенчатая: полупрозрачность по числу фоновых соседей
  // сглаживает её, не размывая рисунок.
  const alpha = new Uint8ClampedArray(width * height);
  for (let flat = 0; flat < background.length; flat += 1) alpha[flat] = data[flat * 4 + 3];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const flat = y * width + x;
      if (!alpha[flat]) continue;
      let empty = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (!alpha[(y + dy) * width + (x + dx)]) empty += 1;
      }
      if (empty) data[flat * 4 + 3] = Math.round(255 * (1 - empty / 10));
    }
  }
  fullCtx.putImageData(pixels, 0, 0);

  /** Ширина занятой части строки — по ней и отделяется табличка от плитки. */
  const rowSpan = (y) => {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 24) continue;
      if (left < 0) left = x;
      right = x;
    }
    return left < 0 ? 0 : right - left + 1;
  };

  const spans = [];
  for (let y = 0; y < height; y += 1) spans.push(rowSpan(y));
  const widest = Math.max(...spans);
  const tileWidth = Math.max(...spans.slice(0, Math.round(height * 0.5)));
  // Первая строка ниже плитки, которая шире неё заметно: там начинается табличка.
  const plateEdge = Math.round((tileWidth + widest) / 2);
  let tileBottom = height;
  for (let y = Math.round(height * 0.5); y < height; y += 1) {
    if (spans[y] > plateEdge) { tileBottom = y; break; }
  }

  /*
    Обрезка по рисунку. Для плитки считаются только её собственные строки:
    табличка снизу заходит на плитку углами, и по всем строкам подряд рамка
    выходила шире плитки — та повисала в кадре не по центру, с обрезанным низом
    и полосками таблички по бокам.
  */
  const crop = (limit, narrow) => {
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < limit; y += 1) {
      if (narrow && spans[y] > narrow) continue;
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] < 24) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX <= minX || maxY <= minY) throw new Error('исходник пуст после снятия фона');
    return { minX, minY, boxW: maxX - minX + 1, boxH: maxY - minY + 1 };
  };

  return jobs.map(({ size, tileOnly }) => {
    const { minX, minY, boxW, boxH } = tileOnly
      ? crop(tileBottom, Math.round(tileWidth * 1.02))
      : crop(height, 0);
    const scale = Math.min(size / boxW, size / boxH);
    const drawW = boxW * scale;
    const drawH = boxH * scale;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = Math.round(tileOnly ? size : size * (boxH / boxW));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const fit = Math.min(canvas.width / boxW, canvas.height / boxH);
    ctx.drawImage(full, minX, minY, boxW, boxH,
      (canvas.width - boxW * fit) / 2, (canvas.height - boxH * fit) / 2, boxW * fit, boxH * fit);
    return { url: canvas.toDataURL('image/webp', 0.92), box: `${boxW}×${boxH}`, out: `${canvas.width}×${canvas.height}` };
  });
}, {
  dataUrl: `data:image/jpeg;base64,${fs.readFileSync(source).toString('base64')}`,
  jobs: outputs.map(({ size, tileOnly }) => ({ size, tileOnly })),
});

for (const [index, result] of results.entries()) {
  if (!result.url.startsWith('data:image/webp')) throw new Error('WebP не поддержан');
  const { file } = outputs[index];
  const buffer = Buffer.from(result.url.split(',')[1], 'base64');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  console.log(`${path.basename(file)}  вырезано ${result.box} → ${result.out}  ${(buffer.length / 1024).toFixed(1)} КБ`);
}

await browser.close();
