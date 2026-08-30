// Одноразовый инструмент: перекодирование растровых ассетов в WebP через Chromium.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright-core';

const root = process.cwd();
const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mime = new Map([['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.webp','image/webp'],['.html','text/html']]);
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/__blank') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>enc</title>'); return; }
  const t = path.resolve(root, '.' + p);
  if (!t.startsWith(root + path.sep) || !fs.existsSync(t)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': mime.get(path.extname(t).toLowerCase()) || 'application/octet-stream' });
  fs.createReadStream(t).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.goto(`${base}/__blank`, { waitUntil: 'load' });

let saved = 0, before = 0;
for (const job of jobs) {
  const src = job.src;
  const abs = path.resolve(root, src);
  if (!fs.existsSync(abs)) { console.log(`SKIP (нет файла) ${src}`); continue; }
  const url = `${base}/${src.split('/').map(encodeURIComponent).join('/')}`;
  const dataUrl = await page.evaluate(async ({ url, maxW, quality }) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('load')); img.src = url; });
    const scale = maxW && img.naturalWidth > maxW ? maxW / img.naturalWidth : 1;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', quality);
  }, { url, maxW: job.maxW || 0, quality: job.quality ?? 0.78 });
  if (!dataUrl.startsWith('data:image/webp')) throw new Error(`WebP не поддержан для ${src}`);
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  const outAbs = path.resolve(root, job.out);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, buf);
  const was = fs.statSync(abs).size;
  before += was; saved += buf.length;
  console.log(`${src}\n  → ${job.out}  ${(was / 1024).toFixed(0)} КБ → ${(buf.length / 1024).toFixed(0)} КБ`);
}
console.log(`\nИТОГО: ${(before / 1048576).toFixed(2)} МБ → ${(saved / 1048576).toFixed(2)} МБ`);
await browser.close();
server.close();
