// Рендер минутного ролика «Библейские игры».
//
//   node promo/ad-60/render.mjs beats   — по кадру на каждую долю (104 шт.) + лист просмотра
//   node promo/ad-60/render.mjs full    — 60 кадров/с, по 4 подкадра на кадр, смешение
//                                             ffmpeg tmix (размытие движения), звук, mp4
//
// Сетка долей — из build/beats.json (analyze.py): кадр 0 — первая сильная доля трека.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(HERE, 'build');
const FFMPEG = process.env.FFMPEG || '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FPS = 60;
const SUB = 4;          // подкадров на кадр
const SHUTTER = 0.5;    // доля кадра, за которую «открыт затвор»
const LOOP = 62.4;
const mode = process.argv[2] || 'beats';

const grid = JSON.parse(fs.readFileSync(path.join(BUILD, 'beats.json'), 'utf8'));
if (grid.beats.length !== 104) throw new Error(`в треке ${grid.beats.length} долей, а нужно 104`);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1440 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
await page.goto(`${pathToFileURL(path.join(HERE, 'index.html')).href}?render=1`);
// Страница, упавшая при сборке сценария (незамкнутая дорожка, неверная раскладка
// поля), должна остановить рендер своей же ошибкой, а не пустым кадром.
await page.waitForLoadState('load');
if (errors.length) { console.error('ошибки на странице:', errors.slice(0, 3).join(' | ')); process.exit(1); }
await page.evaluate(() => window.ready);
await page.evaluate(({ beats, loop }) => window.setGrid(beats, loop), { beats: grid.beats, loop: LOOP });
fs.writeFileSync(path.join(BUILD, 'sounds.json'), JSON.stringify(await page.evaluate(() => window.SOUNDS), null, 1));
const frame = page.locator('#frame');
const shot = async (t, type = 'png') => {
  await page.evaluate((x) => window.seek(x), t);  // ждёт и кадры записей игр
  return frame.screenshot({ type, ...(type === 'jpeg' ? { quality: 95 } : {}) });
};

// ——— петля: первый кадр равен последнему, и курсор движется так же ———
{
  const a = await shot(0);
  const b = await shot(LOOP - 1e-9);
  const same = a.equals(b);
  const cursorAt = (t) => page.evaluate(async (x) => { await window.seek(x); return document.getElementById('finger').style.transform; }, t);
  const speed = [await cursorAt(LOOP - 1 / 240), await cursorAt(1 / 240 - 1e-9 + LOOP), await cursorAt(1 / 240)];
  console.log(`петля: кадр 62,4 ${same ? '=' : '≠'} кадр 0,0; палец ${speed[1] === speed[2] ? 'совпадает' : 'не совпадает'} через 1/240 с`);
  if (!same || speed[1] !== speed[2]) process.exitCode = 2;
  if (!same) fs.writeFileSync(path.join(BUILD, 'loop-end.png'), b);
}

if (mode === 'beats') {
  const dir = path.join(BUILD, 'beats');
  fs.mkdirSync(dir, { recursive: true });
  // Кадр каждой доли — в середине доли: состояние уже видно, следующее ещё не началось.
  for (let b = 0; b < 104; b += 1) {
    const t = grid.beats[b] - grid.beats[0] + grid.period * 0.45;
    fs.writeFileSync(path.join(dir, `beat-${String(b + 1).padStart(2, '0')}.png`), await shot(t));
    // Скрытый слой сцены обязан быть и прозрачным: картинка с visibility: visible
    // внутри скрытого родителя всё равно рисуется — так в меню проступал «Моисей».
    const leaks = await page.evaluate(() => [...document.querySelectorAll('#screen .scene, #fly > *')]
      .filter((n) => n.style.visibility === 'hidden' && n.style.opacity !== '0').length);
    if (leaks) { console.error(`доля ${b + 1}: ${leaks} скрытых слоёв не погашены прозрачностью`); process.exitCode = 3; }
  }
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, 'beat-%02d.png'),
    '-vf', 'scale=360:360,tile=13x8:padding=6:color=white', '-frames:v', '1', path.join(BUILD, 'beats-sheet.png')]);
  console.log('кадры долей: build/beats/*.png, лист: build/beats-sheet.png');
}

// Полоса кадров вокруг момента: node render.mjs strip 5.8 6.4 0.05 → build/strip-5.8.png
if (mode === 'strip') {
  const [a, b, step] = process.argv.slice(3).map(Number);
  const dir = path.join(BUILD, 'strip');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let i = 0;
  for (let t = a; t <= b + 1e-9; t += step) fs.writeFileSync(path.join(dir, `s-${String(i++).padStart(3, '0')}.png`), await shot(t));
  const cols = Math.min(6, i);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, 's-%03d.png'),
    '-vf', `scale=400:400,tile=${cols}x${Math.ceil(i / cols)}:padding=4:color=white`, '-frames:v', '1', path.join(BUILD, `strip-${a}.png`)]);
  console.log(`полоса: build/strip-${a}.png (${i} кадров)`);
}

if (mode === 'full') {
  const frames = Math.round(LOOP * FPS);
  const out = path.join(BUILD, 'video-silent.mp4');
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS * SUB), '-i', '-',
    '-vf', `tmix=frames=${SUB}:weights='${Array(SUB).fill(1).join(' ')}',select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB,format=yuv420p`,
    '-r', String(FPS), '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'animation', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  for (let f = 0; f < frames; f += 1) {
    for (let j = 0; j < SUB; j += 1) {
      // подкадры — симметрично вокруг времени кадра, внутри «открытого затвора»
      const t = (f + ((j + 0.5) / SUB - 0.5) * SHUTTER) / FPS;
      const img = await shot(((t % LOOP) + LOOP) % LOOP, 'jpeg');
      if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    if (f % 60 === 0) console.log(`кадр ${f}/${frames} · ${((Date.now() - started) / 1000).toFixed(0)} с`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`видео без звука: ${out}`);
}

await browser.close();
if (errors.length) { console.error('ошибки на странице:', errors.slice(0, 5)); process.exit(1); }
