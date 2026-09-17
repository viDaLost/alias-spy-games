import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
const root = process.cwd();
const server = http.createServer((req, res) => {
  const file = path.join(root, new URL(req.url, 'http://localhost').pathname);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(`${origin}/cloudflare/promised-land-preview/public/index.html`);
  await page.evaluate(() => localStorage.clear());
  // Use the real frame shell and invitation bridge, with native Telegram scanning stubbed.
  await page.setContent(`<link rel="stylesheet" href="${origin}/web/styles/game-shell.css"><body data-current-game="promised-land"><div class="game-frame-wrap"><iframe class="game-frame" src="${origin}/cloudflare/promised-land-preview/public/index.html?parentOrigin=${encodeURIComponent(origin)}"></iframe><button class="game-frame-exit">Главное меню</button></div>`);
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--game-chrome-top', '94px');
    window.scans = 0;
    window.RoomQrScanner = { open() { window.scans++; } };
  });
  await page.addScriptTag({ url: `${origin}/web/js/room-invite.js` });
  const bridge = fs.readFileSync('web/js/app.js', 'utf8').split('// Only the active, trusted game frame')[1];
  await page.addScriptTag({ content: '// Only the active, trusted game frame' + bridge });
  const frame = page.frames().find(f => f !== page.mainFrame());
  await frame.waitForSelector('[data-mode="online"]');
  /*
    Кадру отдан весь экран, а кнопка «Главное меню» снова лежит поверх него.
    Раньше здесь спрашивалось обратное — чтобы кнопка кончалась выше кадра, — и
    оболочка честно отодвигала кадр вниз. Боком это стоило больше трети высоты:
    под белой полосой наверху не было ничего, а доска играла в оставшейся щели.
    Теперь полосу отмеряет сама игра и отступает от неё только тем, что под
    кнопкой оказаться не должно; проверяет это check-promised-land-frame-fit.
    Здесь остаётся то, что этой проверке и положено: кадру отдана вся высота, и
    поперёк ничего не вылезает.
  */
  for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const boxes = await page.evaluate(() => {
      const frame = document.querySelector('.game-frame').getBoundingClientRect();
      return { top: frame.top, height: frame.height };
    });
    assert(boxes.top <= 1 && boxes.height >= height - 1, 'Frame does not fill the screen');
    assert(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
  }
  await frame.click('[data-mode="online"]');
  await frame.click('#online-scan');
  /*
    Нажатие и сканер разделены сообщением: кадр просит, оболочка открывает.
    Спрашивать сразу после нажатия — значит спрашивать раньше, чем просьба
    пересекла границу кадра; проверка так падала примерно в половине прогонов.
  */
  await page.waitForFunction(() => window.scans === 1, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.scans), 1);
  await page.evaluate(() => window.RoomInvite.acceptScanned('biblegames:promised-land:ABCDE'));
  await frame.waitForFunction(() => document.getElementById('online-code').value === 'ABCDE');
  assert.equal(await page.evaluate(() => window.RoomInvite.buildQrPayload('promised-land', 'ABCDE')), 'biblegames:promised-land:ABCDE');
  // Untrusted messages must not trigger scanner or replace a room code.
  await page.evaluate(() => window.postMessage({ type: 'promised-land:scan' }, location.origin));
  assert.equal(await page.evaluate(() => window.scans), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await frame.click('#online-back');
  await frame.click('[data-mode="solo"]');
  await frame.click('#start-btn');
  await frame.waitForSelector('#orientation-tip');
  await frame.click('#orientation-tip button');
  assert.equal(await frame.locator('#orientation-tip').count(), 0);
  console.log('OK: QR scanner bridge, scanned room, untrusted-message rejection, menu separation at 320/390/844px, dismissible orientation tip.');
} finally {
  await browser.close();
  server.close();
}
