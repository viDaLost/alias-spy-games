// Рендер обучающего ролика «Царства».
//
//   node promo/kingdoms-tutorial/render.mjs stills        — кадр в середине каждой фразы + лист просмотра
//   node promo/kingdoms-tutorial/render.mjs at 198 214.5  — отдельные кадры в build/at-*.png
//   node promo/kingdoms-tutorial/render.mjs full          — 30 кадров/с, затем звук (mix_audio.py) и mp4
//
// Звук сводит mix_audio.py (голос + музыка); full зовёт его сам и собирает mp4.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(HERE, 'build');
const FFMPEG = process.env.FFMPEG || '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FPS = 30;
const SUB = 1;          // движение медленное (наезды, наплывы) — смешение подкадров не нужно
const SHUTTER = 0.5;
const mode = process.argv[2] || 'stills';
fs.mkdirSync(BUILD, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
await page.goto(`${pathToFileURL(path.join(HERE, 'index.html')).href}?render=1`);
await page.waitForLoadState('load');
await page.evaluate(() => window.ready).catch((e) => errors.push(String(e.message || e)));
if (errors.length) { console.error('ошибки на странице:', errors.slice(0, 3).join(' | ')); process.exit(1); }
const DUR = await page.evaluate(() => window.DURATION);
const frame = page.locator('#frame');
const shot = async (t, type = 'png') => {
  await page.evaluate((x) => window.seek(x), t);
  return frame.screenshot({ type, ...(type === 'jpeg' ? { quality: 94 } : {}) });
};

if (mode === 'stills') {
  const dir = path.join(BUILD, 'stills');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const times = await page.evaluate(() => window.NARRATION.segments.flatMap((s) => s.lines.map((l) => (l.start + l.end) / 2)));
  times.unshift(0.8);
  times.push(DUR - 1);
  for (const [i, t] of times.entries()) fs.writeFileSync(path.join(dir, `s-${String(i).padStart(2, '0')}.png`), await shot(t));
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, 's-%02d.png'),
    '-vf', 'scale=480:270,tile=6x10:padding=4:color=white', '-frames:v', '1', path.join(BUILD, 'stills-sheet.png')]);
  console.log(`кадры фраз: build/stills/*.png (${times.length}), лист: build/stills-sheet.png`);
}

if (mode === 'at') {
  for (const t of process.argv.slice(3).map(Number)) fs.writeFileSync(path.join(BUILD, `at-${t}.png`), await shot(t));
  console.log('кадры: build/at-*.png');
}

if (mode === 'full') {
  const frames = Math.ceil(DUR * FPS);
  const out = path.join(BUILD, 'video-silent.mp4');
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS * SUB), '-i', '-',
    '-vf', `tmix=frames=${SUB}:weights='${Array(SUB).fill(1).join(' ')}',select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB,format=yuv420p`,
    '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-tune', 'animation', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  for (let f = 0; f < frames; f += 1) {
    for (let j = 0; j < SUB; j += 1) {
      const t = (f + ((j + 0.5) / SUB - 0.5) * SHUTTER) / FPS;
      const img = await shot(Math.max(0, Math.min(DUR, t)), 'jpeg');
      if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    if (f % 300 === 0) console.log(`кадр ${f}/${frames} · ${((Date.now() - started) / 1000).toFixed(0)} с`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`видео без звука: ${out}`);
  execFileSync('python3', [path.join(HERE, 'mix_audio.py')], { stdio: 'inherit' });
  // ролик в репозиторий не кладётся — только в build/
  const mp4 = path.join(BUILD, 'kingdoms-tutorial.mp4');
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', out, '-i', path.join(BUILD, 'final.wav'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', mp4]);
  console.log(`ролик: ${mp4}`);
}

await browser.close();
if (errors.length) { console.error('ошибки на странице:', errors.slice(0, 5)); process.exit(1); }
