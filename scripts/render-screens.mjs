// Renders the app's screens to PNG so a CSS change can be diffed pixel by pixel.
//
//   node scripts/render-screens.mjs <out-dir>            capture
//   node scripts/render-screens.mjs <dir-a> <dir-b>      compare two captures
//
// This is a local review tool, not a CI gate: it stubs Telegram and the Workers so
// the screens render without network, which is also why it reaches games that
// smoke:games cannot when outbound traffic is blocked.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright-core';

const root = process.cwd();
const [outDir, compareDir] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node scripts/render-screens.mjs <out-dir> [compare-dir]');
  process.exit(2);
}

const SCREENS = [
  { id: 'menu', open: null },
  { id: 'alias', open: 'alias' },
  { id: 'spy', open: 'spy' },
  { id: 'coimaginarium', open: 'coimaginarium' },
  { id: 'guess', open: 'guess' },
  { id: 'describe', open: 'describe' },
  { id: 'bible-wow', open: 'bible-wow' },
  { id: 'bible-wordsearch', open: 'bible-wordsearch' },
  { id: 'sacred-word', open: 'sacred-word' },
  { id: 'kids-ark-pairs', open: 'kids-ark-pairs' },
  // Biblical Treasures has its own launcher card rather than a showGame key.
  { id: 'biblical-treasures', click: '#biblical-match-three-card', settleMs: 6000 },
];

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'], ['.obj', 'text/plain'],
  ['.woff2', 'font/woff2'], ['.woff', 'font/woff'],
]);

// --- comparison mode -------------------------------------------------------

/** Decodes a PNG's raw RGBA pixels without pulling in an image library. */
function decodePng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported PNG format in ${file} (depth ${bitDepth}, color ${colorType})`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = value & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { width, height, channels, data: out };
}

if (compareDir) {
  const names = fs.readdirSync(outDir).filter((f) => f.endsWith('.png')).sort();
  let differing = 0;
  for (const name of names) {
    const a = path.join(outDir, name);
    const b = path.join(compareDir, name);
    if (!fs.existsSync(b)) { console.log(`${name.padEnd(26)} ОТСУТСТВУЕТ во втором наборе`); differing += 1; continue; }
    const pa = decodePng(a), pb = decodePng(b);
    if (pa.width !== pb.width || pa.height !== pb.height) {
      console.log(`${name.padEnd(26)} РАЗМЕР ${pa.width}x${pa.height} -> ${pb.width}x${pb.height}`);
      differing += 1;
      continue;
    }
    let diff = 0, maxDelta = 0;
    const px = pa.width * pa.height;
    for (let i = 0; i < px; i += 1) {
      const o = i * pa.channels;
      const d = Math.max(
        Math.abs(pa.data[o] - pb.data[o]),
        Math.abs(pa.data[o + 1] - pb.data[o + 1]),
        Math.abs(pa.data[o + 2] - pb.data[o + 2]),
      );
      if (d > 2) { diff += 1; if (d > maxDelta) maxDelta = d; }
    }
    const pct = (diff / px) * 100;
    if (diff === 0) console.log(`${name.padEnd(26)} идентично`);
    else { console.log(`${name.padEnd(26)} ОТЛИЧИЕ ${pct.toFixed(3)}% пикселей, макс. дельта ${maxDelta}`); differing += 1; }
  }
  console.log(`\n${names.length - differing}/${names.length} экранов без изменений`);
  process.exit(differing ? 1 : 0);
}

// --- capture mode ----------------------------------------------------------

fs.mkdirSync(outDir, { recursive: true });
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(target).pipe(res);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--force-prefers-reduced-motion'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => {
  window.__APP_TELEMETRY_DISABLED__ = true;
  // Freeze anything time-based so two captures of the same code match exactly.
  Math.random = () => 0.42;
  const RealDate = Date;
  const fixed = new RealDate('2026-01-01T00:00:00Z').getTime();
  window.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  };
});
const page = await context.newPage();
await page.route('https://telegram.org/**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: 'window.Telegram={WebApp:{initData:"",initDataUnsafe:{user:{id:999999,username:"qa",first_name:"QA"}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},requestFullscreen(){},lockOrientation(){},unlockOrientation(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};',
}));
const gas = JSON.stringify({ success: true, isBanned: false, wowStars: 20, wsStars: 0, swLevel: 0, lastGames: [] });
for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: gas }));
}
await page.route('https://*.workers.dev/**', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: '{"ok":true}' }));
await page.route('https://cdnjs.cloudflare.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));

await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(4000);

// The home parallax eases its layers toward the scroll position on rAF, so a
// screenshot taken mid-ease is timing-dependent. Wait until the transforms stop
// moving before capturing, otherwise the menu differs between identical runs.
// Kill every animation and transition before capturing. Both sides of a
// comparison get the same treatment, so this removes timing noise without
// hiding a real style change.
async function freezeMotion() {
  await page.addStyleTag({ content: `*, *::before, *::after {
    animation: none !important;
    transition: none !important;
    animation-play-state: paused !important;
    caret-color: transparent !important;
  }` });
}

async function settle() {
  await freezeMotion();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => {
    const layers = [...document.querySelectorAll('[class*="parallax__layer"], [class*="boot__layer"]')];
    const now = layers.map((el) => el.style.transform).join('|');
    const settled = window.__lastTransforms === now;
    window.__lastTransforms = now;
    return settled;
  }, null, { timeout: 15_000, polling: 350 }).catch(() => {});
  await page.evaluate(() => { delete window.__lastTransforms; });
}

const captured = [];
for (const screen of SCREENS) {
  try {
    if (screen.open) {
      await page.evaluate((key) => window.showGame(key), screen.open);
      await page.waitForTimeout(2600);
    } else if (screen.click) {
      await page.click(screen.click, { timeout: 8000 });
      await page.waitForTimeout(screen.settleMs || 2600);
    }
    await settle();
    await page.screenshot({ path: path.join(outDir, `${screen.id}.png`) });
    captured.push(screen.id);
    if (screen.open || screen.click) {
      await page.evaluate(() => window.goToMainMenu?.());
      await page.waitForTimeout(1600);
    }
  } catch (error) {
    console.warn(`не удалось снять ${screen.id}: ${String(error).slice(0, 120)}`);
  }
}
console.log(`снято ${captured.length}/${SCREENS.length}: ${captured.join(', ')}`);
await browser.close();
server.close();
