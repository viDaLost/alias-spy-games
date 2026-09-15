// PNG «Земли обетованной» → WebP рабочего размера.
//
// Модель отдаёт картинки по 1254 пикселя и по 600 КБ штука: 53 МБ на все.
// В игре ни одна из них так и не показывается — иллюстрация удела живёт в
// середине кольца шириной от силы 330 точек, значок строения занимает десяток.
// Отдавать телефону впятеро больше, чем он нарисует, незачем: это чужой
// трафик и чужая батарея.
//
// Перегон идёт через Chromium: cwebp в окружении нет, а браузер есть, и
// canvas.toDataURL('image/webp') сохраняет прозрачность. Так в этом проекте
// уже делается — см. scripts/encode-assets.mjs.
//
//     node scripts/encode-promised-land-art.mjs
//
// Исходные PNG скрипт не трогает: удалять их или нет — решение отдельное.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { TARGETS } from './promised-land-art-spec.mjs';

const root = process.cwd();

// Размеры и качество живут в promised-land-art-spec.mjs — там же, откуда их
// читает проверка. Иначе перегон и проверка однажды разойдутся.
const JOBS = [
  { dir: 'web/assets/promised-land/plots', ...TARGETS.plots },
  { dir: 'web/assets/promised-land/cards', ...TARGETS.cards },
  { dir: 'web/assets/promised-land/icons', ...TARGETS.icons },
  { dir: 'web/assets/promised-land/build', ...TARGETS.build },
  { dir: 'web/assets/promised-land/tokens', ...TARGETS.tokens },
  { file: 'web/assets/icons/promised-land.png', ...TARGETS.menu },
  { file: 'web/assets/game-scenes/scenes/promised-land.png', ...TARGETS.scene },
  { file: 'docs/img/promised-land-board.png', ...TARGETS.showcase },
];

const mime = new Map([['.png', 'image/png'], ['.html', 'text/html; charset=utf-8']]);
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(root) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.setContent('<!doctype html><meta charset="utf-8"><title>encode</title>');

/** Одна картинка: вписать в квадрат `size` по длинной стороне и отдать WebP. */
async function encode(file, size, quality) {
  const url = `${base}/${path.relative(root, file).replaceAll(path.sep, '/')}`;
  const dataUrl = await page.evaluate(async ({ src, size, quality }) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('не загрузилась'));
      image.src = src;
    });
    // Пропорции сохраняются: у рубашек и фона сцены они не квадратные, и
    // втискивать их в квадрат значило бы растянуть рисунок.
    const scale = Math.min(1, size / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', quality);
  }, { src: url, size, quality });

  if (!dataUrl.startsWith('data:image/webp')) throw new Error(`${file}: браузер не отдал WebP`);
  const out = file.replace(/\.png$/i, '.webp');
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return { out, before: fs.statSync(file).size, after: fs.statSync(out).size };
}

const results = [];
try {
  for (const job of JOBS) {
    const files = job.dir
      ? fs.readdirSync(path.join(root, job.dir)).filter((name) => /\.png$/i.test(name))
        .map((name) => path.join(root, job.dir, name))
      : [path.join(root, job.file)];
    for (const file of files) {
      if (!fs.existsSync(file)) { console.error(`нет файла: ${path.relative(root, file)}`); continue; }
      results.push(await encode(file, job.size, job.quality));
    }
  }
} finally {
  await browser.close();
  server.close();
}

const before = results.reduce((sum, item) => sum + item.before, 0);
const after = results.reduce((sum, item) => sum + item.after, 0);
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
console.log(`Переведено ${results.length} картинок: было ${mb(before)} МБ в PNG, стало ${mb(after)} МБ в WebP `
  + `(${Math.round((1 - after / before) * 100)}% долой). Самая тяжёлая — `
  + `${path.relative(root, results.slice().sort((a, b) => b.after - a.after)[0].out)}, `
  + `${Math.round(results.slice().sort((a, b) => b.after - a.after)[0].after / 1024)} КБ.`);
