// Иконки для установки приложения на главный экран.
//
//   node scripts/build-pwa-icons.mjs           пересобрать
//   node scripts/build-pwa-icons.mjs --check   убедиться, что файлы на месте
//
// Исходник один — та же иконка, что у Android-приложения, чтобы ярлык на iPhone
// и значок на Android выглядели одинаково.
//
// apple-touch-icon делается на сплошной подложке: iOS не понимает прозрачность
// в этом теге и подставляет под неё чёрный, отчего золотая рамка оказывается на
// чёрном квадрате. Цвет подложки не выдуман, а взят из самого рисунка.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'android-app/app/src/main/res/drawable-nodpi/ic_launcher_art.webp');
const outDir = path.join(root, 'web/assets/pwa');

const targets = [
  { name: 'icon-192.png', size: 192, solid: false },
  { name: 'icon-512.png', size: 512, solid: false },
  { name: 'apple-touch-icon.png', size: 180, solid: true },
];

if (process.argv.includes('--check')) {
  const missing = targets.filter(({ name }) => {
    const file = path.join(outDir, name);
    return !fs.existsSync(file) || fs.statSync(file).size < 1000;
  });
  if (missing.length || !fs.existsSync(source)) {
    console.error(`Иконки для установки не собраны: ${missing.map((icon) => icon.name).join(', ') || 'нет исходника'}. `
      + 'Запустите node scripts/build-pwa-icons.mjs');
    process.exit(1);
  }
  console.log(`Иконки для установки на месте: ${targets.map((icon) => icon.name).join(', ')}.`);
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

const results = await page.evaluate(async ({ dataUrl, targets }) => {
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = dataUrl; });

  // Цвет подложки — самый частый цвет рисунка, а не средний. Среднее по
  // картинке из синего поля и светлых кубиков даёт блёклую сирень, которой в
  // иконке нет; частый цвет — это то самое синее поле.
  const probe = document.createElement('canvas');
  probe.width = image.naturalWidth;
  probe.height = image.naturalHeight;
  const probeCtx = probe.getContext('2d', { willReadFrequently: true });
  probeCtx.drawImage(image, 0, 0);
  const pixels = probeCtx.getImageData(0, 0, probe.width, probe.height).data;
  const buckets = new Map();
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 200) continue;
    const key = ((pixels[index] >> 4) << 8) | ((pixels[index + 1] >> 4) << 4) | (pixels[index + 2] >> 4);
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += pixels[index]; bucket.g += pixels[index + 1]; bucket.b += pixels[index + 2]; bucket.count += 1;
    buckets.set(key, bucket);
  }
  let top = null;
  for (const bucket of buckets.values()) if (!top || bucket.count > top.count) top = bucket;
  const solidColor = top
    ? `rgb(${Math.round(top.r / top.count)}, ${Math.round(top.g / top.count)}, ${Math.round(top.b / top.count)})`
    : '#2b2f8f';

  const out = [];
  for (const { name, size, solid } of targets) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (solid) {
      ctx.fillStyle = solidColor;
      ctx.fillRect(0, 0, size, size);
      // Небольшой напуск: скруглённые углы рисунка уходят за край, и вместо
      // двойного скругления остаётся одно — то, которое накладывает сама iOS.
      const overscan = size * 1.08;
      const offset = (size - overscan) / 2;
      ctx.drawImage(image, offset, offset, overscan, overscan);
    } else {
      ctx.drawImage(image, 0, 0, size, size);
    }
    out.push({ name, url: canvas.toDataURL('image/png'), solidColor });
  }
  return out;
}, { dataUrl: `data:image/webp;base64,${fs.readFileSync(source).toString('base64')}`, targets });

fs.mkdirSync(outDir, { recursive: true });
for (const { name, url, solidColor } of results) {
  const buffer = Buffer.from(url.split(',')[1], 'base64');
  fs.writeFileSync(path.join(outDir, name), buffer);
  console.log(`${name}  ${(buffer.length / 1024).toFixed(1)} КБ${name.startsWith('apple') ? `, подложка ${solidColor}` : ''}`);
}

await browser.close();
