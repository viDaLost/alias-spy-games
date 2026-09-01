// Нарезает две иконки «Библейских сокровищ» — тернии и ковчег завета — из
// присланного исходника scripts/art/bmt-v46-source.jpg и приводит их к формату
// набора v17: WebP 128×128 с прозрачным фоном.
//
//   node scripts/build-bmt-v46-art.mjs           пересобрать
//   node scripts/build-bmt-v46-art.mjs --check   убедиться, что файлы на месте
//
// Фон снимается заливкой от краёв, а не порогом по белому: внутри ковчега есть
// собственное белое сияние, и порог пробил бы в нём дыры. Каждый предмет затем
// обрезается по своим непрозрачным пикселям, вписывается в квадрат с полями и
// получает мягкую тень — такую же, как у остальных иконок набора.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'scripts/art/bmt-v46-source.jpg');
const outDir = path.join(root, 'web/assets/biblical-match-three/icons-v17');
const SIZE = 128;

// Исходник — две картинки рядом: слева тернии, справа ковчег.
const icons = [
  { name: 'vine', half: 'left' },
  { name: 'covenant-ark', half: 'right' },
];

if (process.argv.includes('--check')) {
  const missing = icons.filter(({ name }) => {
    const file = path.join(outDir, `${name}.webp`);
    return !fs.existsSync(file) || fs.statSync(file).size < 1500;
  });
  if (missing.length || !fs.existsSync(source)) {
    console.error(`Иконки v46 не собраны: ${missing.map((icon) => icon.name).join(', ') || 'нет исходника'}. `
      + 'Запустите node scripts/build-bmt-v46-art.mjs');
    process.exit(1);
  }
  console.log(`Иконки v46 на месте: ${icons.map((icon) => `${icon.name}.webp`).join(', ')}.`);
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

const results = await page.evaluate(async ({ dataUrl, size, icons }) => {
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
    const r = data[index], g = data[index + 1], b = data[index + 2];
    const min = Math.min(r, g, b);
    const spread = Math.max(r, g, b) - min;
    return min > 228 && spread < 22;
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
  // Внутрь венка терний заливка от краёв не попадает — его середина осталась бы
  // непрозрачным белым пятном поверх фишки. Поэтому замкнутые области бумаги
  // тоже вычищаются, но только крупные: мелкие белёсые пятна — это блики, а у
  // ковчега внутри собственное белое сияние, и его трогать нельзя.
  const HOLE = Math.round(width * height * 0.004);
  const seen = new Uint8Array(width * height);
  for (let start = 0; start < background.length; start += 1) {
    if (background[start] || seen[start] || !isPaper(start * 4)) continue;
    const region = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const flat = stack.pop();
      region.push(flat);
      const x = flat % width;
      const y = (flat - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (seen[next] || background[next] || !isPaper(next * 4)) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    if (region.length >= HOLE) for (const flat of region) background[flat] = 1;
  }

  for (let flat = 0; flat < background.length; flat += 1) if (background[flat]) data[flat * 4 + 3] = 0;

  // В исходнике попадаются одиночные крапины рядом с предметом: на иконке
  // 128×128 они превращаются в грязь у самого края.
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

  // Кромка после заливки получается ступенчатой: полупрозрачность по числу
  // фоновых соседей сглаживает её, не размывая рисунок целиком.
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

  // --- каждая половина обрезается по своему предмету --------------------------
  const out = [];
  for (const { name, half } of icons) {
    const from = half === 'left' ? 0 : Math.floor(width / 2);
    const to = half === 'left' ? Math.floor(width / 2) : width;
    let minX = to, minY = height, maxX = from, maxY = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = from; x < to; x += 1) {
        if (data[(y * width + x) * 4 + 3] < 24) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX <= minX || maxY <= minY) throw new Error(`пусто в половине ${half}`);

    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    const pad = size * 0.06;
    const scale = Math.min((size - pad * 2) / boxW, (size - pad * 2) / boxH);
    const drawW = boxW * scale;
    const drawH = boxH * scale;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Мягкая тень набора: предмет на светлой доске без неё выглядит наклейкой.
    ctx.shadowColor = 'rgba(44, 30, 5, .3)';
    ctx.shadowBlur = size * 0.04;
    ctx.shadowOffsetY = size * 0.022;
    ctx.drawImage(full, minX, minY, boxW, boxH, (size - drawW) / 2, (size - drawH) / 2 - size * 0.012, drawW, drawH);

    out.push({ name, url: canvas.toDataURL('image/webp', 0.92), box: `${boxW}×${boxH}` });
  }
  return out;
}, {
  dataUrl: `data:image/jpeg;base64,${fs.readFileSync(source).toString('base64')}`,
  size: SIZE,
  icons,
});

fs.mkdirSync(outDir, { recursive: true });
for (const { name, url, box } of results) {
  if (!url.startsWith('data:image/webp')) throw new Error(`WebP не поддержан для ${name}`);
  const buffer = Buffer.from(url.split(',')[1], 'base64');
  fs.writeFileSync(path.join(outDir, `${name}.webp`), buffer);
  console.log(`${name}.webp  вырезано ${box} → ${SIZE}×${SIZE}  ${(buffer.length / 1024).toFixed(1)} КБ`);
}

await browser.close();
