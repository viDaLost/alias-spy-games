// Готовит иконку меню «Рейтинг» из присланного исходника
// scripts/art/menu-moses-nile-source.jpg и приводит её к формату набора
// web/assets/icons: WebP 224×224 с прозрачным фоном за скруглённой плиткой.
//
//   node scripts/build-menu-moses-nile-icon.mjs           пересобрать
//   node scripts/build-menu-moses-nile-icon.mjs --check   убедиться, что файл на месте
//
// Фон снимается заливкой от краёв по бесцветным светлым пикселям, а не порогом
// по чистому белому: под плиткой лежит серая тень, и порог оставил бы от неё
// ореол. Золото и синее поле заливка не трогает — у них большой разброс каналов.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'scripts/art/menu-moses-nile-source.jpg');
const outFile = path.join(root, 'web/assets/icons/moses-nile.webp');
const SIZE = 224;

if (process.argv.includes('--check')) {
  if (!fs.existsSync(outFile) || fs.statSync(outFile).size < 4000) {
    console.error('Иконка «Моисея на Ниле» не собрана. Запустите node scripts/build-menu-moses-nile-icon.mjs');
    process.exit(1);
  }
  console.log(`Иконка «Моисея на Ниле» на месте: ${path.relative(root, outFile)}.`);
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

const result = await page.evaluate(async ({ dataUrl, size }) => {
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
  // Бесцветный и светлый — это бумага исходника вместе с тенью под плиткой.
  const isPaper = (index) => {
    // Исходник хранится в JPEG, как и остальные в scripts/art: PNG с этой
    // картинкой весит 2 МБ и не проходит лимит репозитория. Альфы в JPEG нет,
    // но проверка на прозрачность оставлена — она ничего не стоит и не даст
    // заливке споткнуться, если исходник однажды снова станет PNG.
    if (data[index + 3] < 24) return true;
    const r = data[index], g = data[index + 1], b = data[index + 2];
    const min = Math.min(r, g, b);
    const spread = Math.max(r, g, b) - min;
    return min > 206 && spread < 26;
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

  // Одиночные крапины бумаги рядом с плиткой на 224×224 читаются как грязь.
  const SPECK = Math.round(width * height * 0.00012);
  const visited = new Uint8Array(width * height);
  for (let start = 0; start < background.length; start += 1) {
    if (visited[start] || data[start * 4 + 3] === 0) continue;
    const island = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length && island.length <= SPECK) {
      const flat = stack.pop();
      island.push(flat);
      const x = flat % width;
      const y = (flat - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (visited[next] || data[next * 4 + 3] === 0) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
    if (island.length <= SPECK) for (const flat of island) data[flat * 4 + 3] = 0;
  }

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

  // --- обрезка по рисунку ----------------------------------------------------
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX <= minX || maxY <= minY) throw new Error('исходник пуст после снятия фона');

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  // Искры по краям исходника выходят за плитку; они и задают поля, поэтому
  // рисунок вписывается в квадрат целиком, без дополнительного отступа.
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
}, { dataUrl: `data:image/jpeg;base64,${fs.readFileSync(source).toString('base64')}`, size: SIZE });

if (!result.url.startsWith('data:image/webp')) throw new Error('WebP не поддержан');
const buffer = Buffer.from(result.url.split(',')[1], 'base64');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, buffer);
console.log(`moses-nile.webp  вырезано ${result.box} → ${SIZE}×${SIZE}  ${(buffer.length / 1024).toFixed(1)} КБ`);

await browser.close();
