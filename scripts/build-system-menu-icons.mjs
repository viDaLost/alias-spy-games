// Готовит иконки системных пунктов меню из присланного исходника
// scripts/art/system-icons-source.jpg: профиль, установка на iPhone, правила.
//
//   node scripts/build-system-menu-icons.mjs           пересобрать
//   node scripts/build-system-menu-icons.mjs --check   убедиться, что файлы на месте
//
// Приёмы те же, что у остальных иконок набора. Фон снимается заливкой от краёв
// по бесцветным светлым пикселям, а не порогом по чистому белому: под плитками
// лежит мягкая тень, и порог оставил бы от неё серый ореол. Затем каждая
// плитка обрезается по своим непрозрачным пикселям и вписывается в 224×224 —
// размер остальных иконок меню.

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'web/assets/icons');
const SIZE = 224;

// Исходники приходили по-разному: три плитки в ряд одной картинкой и одна
// отдельно. Скрипт режет любой ряд — сколько имён, столько равных долей.
const sheets = [
  {
    source: 'scripts/art/system-icons-source.jpg',
    icons: [
      { name: 'profile', label: 'вход в профиль' },
      { name: 'install-ios', label: 'установка на iPhone' },
      { name: 'rules', label: 'правила игр' },
    ],
  },
  {
    source: 'scripts/art/more-icon-source.jpg',
    icons: [{ name: 'more', label: 'раздел «Ещё»' }],
  },
];
const allIcons = sheets.flatMap((sheet) => sheet.icons);

if (process.argv.includes('--check')) {
  const missing = allIcons.filter(({ name }) => {
    const file = path.join(outDir, `${name}.webp`);
    return !fs.existsSync(file) || fs.statSync(file).size < 3000;
  });
  if (missing.length) {
    console.error(`Иконки меню не собраны: ${missing.map((icon) => `${icon.name}.webp`).join(', ')}. `
      + 'Запустите node scripts/build-system-menu-icons.mjs');
    process.exit(1);
  }
  console.log(`Иконки системных пунктов меню на месте: ${allIcons.map((icon) => `${icon.name}.webp`).join(', ')}.`);
  process.exit(0);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();

const cut = async ({ dataUrl, size, count }) => page.evaluate(async ({ dataUrl, size, count }) => {
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

  // Одиночные крапины бумаги рядом с плиткой на 224×224 читаются как грязь.
  const SPECK = Math.round(width * height * 0.00008);
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

  // --- каждая плитка обрезается по себе ---------------------------------------
  const out = [];
  for (let index = 0; index < count; index += 1) {
    const from = Math.floor((width * index) / count);
    const to = Math.floor((width * (index + 1)) / count);
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
    if (maxX <= minX || maxY <= minY) throw new Error(`пусто в плитке ${index + 1}`);

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

    out.push({ url: canvas.toDataURL('image/webp', 0.92), box: `${boxW}×${boxH}` });
  }
  return out;
}, { dataUrl, size, count });

fs.mkdirSync(outDir, { recursive: true });
for (const sheet of sheets) {
  const file = path.join(root, sheet.source);
  if (!fs.existsSync(file)) throw new Error(`нет исходника ${sheet.source}`);
  const results = await cut({
    dataUrl: `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`,
    size: SIZE,
    count: sheet.icons.length,
  });
  results.forEach(({ url, box }, index) => {
    if (!url.startsWith('data:image/webp')) throw new Error('WebP не поддержан');
    const buffer = Buffer.from(url.split(',')[1], 'base64');
    const { name, label } = sheet.icons[index];
    fs.writeFileSync(path.join(outDir, `${name}.webp`), buffer);
    console.log(`${name}.webp  (${label})  вырезано ${box} → ${SIZE}×${SIZE}  ${(buffer.length / 1024).toFixed(1)} КБ`);
  });
}

await browser.close();
