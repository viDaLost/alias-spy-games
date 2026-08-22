import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
.bmt-board{display:grid;grid-template-columns:repeat(4,50px);gap:0}.bmt-tile{width:50px;height:50px}.bmt-piece-wrap{display:block}.bmt-blocker{display:block}
</style></head><body data-current-game="biblical-match-three" data-mode="game"><main id="game-container"><section class="bmt-shell"><div class="bmt-board bmt-v24-board" data-rows="1" data-cols="4">
<button class="bmt-tile" data-index="0"><span class="bmt-piece-wrap"><img class="bmt-piece" alt="Библия"></span><span class="bmt-blocker"></span></button>
<button class="bmt-tile" data-index="1"><span class="bmt-piece-wrap"><img class="bmt-piece" alt="Рыба"></span><span class="bmt-blocker"></span></button>
<button class="bmt-tile has-lamp is-lamp-lit" data-index="2"><span class="bmt-piece-wrap"><img class="bmt-piece" alt="Голубь"></span><span class="bmt-blocker"><span data-blocker-type="lamp" data-blocker-lit="true">lit</span></span></button>
<button class="bmt-tile has-lamp" data-index="3"><span class="bmt-piece-wrap"><img class="bmt-piece" alt="Светильник"></span><span class="bmt-blocker"><span data-blocker-type="lamp" data-blocker-lit="false">unlit</span></span></button>
</div></section></main><script src="/web/js/v29-biblical-treasures-hotfix.js?v=40"></script><script src="/web/js/v43-biblical-treasures-lamp-stability.js?v=43"></script><script src="/web/js/v37-biblical-treasures-lamp-swipe.js?v=37"></script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://local');
  if (url.pathname === '/__v43') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
    return;
  }
  const target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': path.extname(target) === '.js' ? 'text/javascript; charset=utf-8' : 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();

try {
  await page.goto(`${base}/__v43`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForFunction(() => window.__bmtV43LampStabilityInstalled === true && window.__bmtV37LampSwipeInstalled === true);
  await page.waitForFunction(() => {
    const lit = document.querySelector('[data-index="2"]');
    return lit?.dataset.bmtLampPlayable === '1' && !lit.classList.contains('has-lamp') && lit.classList.contains('is-lamp-lit');
  });

  const state = await page.evaluate(async () => {
    const edge = document.querySelector('[data-index="0"]');
    const inward = document.querySelector('[data-index="1"]');
    const lit = document.querySelector('[data-index="2"]');
    const unlit = document.querySelector('[data-index="3"]');
    let edgeClicks = 0;
    let inwardClicks = 0;
    let litClicks = 0;
    let unlitClicks = 0;
    edge.addEventListener('click', () => edgeClicks += 1);
    inward.addEventListener('click', () => inwardClicks += 1);
    lit.addEventListener('click', () => litClicks += 1);
    unlit.addEventListener('click', () => unlitClicks += 1);

    const r = edge.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    edge.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 143, pointerType: 'touch', button: 0, buttons: 1, clientX: x, clientY: y }));
    edge.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 143, pointerType: 'touch', button: 0, buttons: 1, clientX: x - 28, clientY: y }));
    edge.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 143, pointerType: 'touch', button: 0, buttons: 0, clientX: x - 28, clientY: y }));

    lit.click();
    unlit.click();

    // Simulate repeated core updateAllTiles() redraws after the lamp was lit.
    // The hotfix must normalize interaction state once per redraw without
    // deleting blocker DOM or entering a MutationObserver feedback loop.
    let redrawsStable = true;
    for (let i = 0; i < 30; i += 1) {
      lit.classList.add('has-lamp', 'is-lamp-lit');
      lit.querySelector('.bmt-blocker').innerHTML = `<span data-blocker-type="lamp" data-blocker-lit="true">lit-${i}</span>`;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (lit.classList.contains('has-lamp') || !lit.classList.contains('is-lamp-lit')) redrawsStable = false;
    }

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const blockerStyle = getComputedStyle(lit.querySelector('.bmt-blocker'));
    const pieceStyle = getComputedStyle(lit.querySelector('.bmt-piece-wrap'));
    return {
      version: window.BiblicalMatchThreeLampStability?.version || '',
      edgeClicks,
      inwardClicks,
      litClicks,
      unlitClicks,
      redrawsStable,
      litPlayable: lit.dataset.bmtLampPlayable,
      legacyCleared: lit.dataset.bmtLampCleared || '',
      litHasLamp: lit.classList.contains('has-lamp'),
      litIsLit: lit.classList.contains('is-lamp-lit'),
      litBlockerChildren: lit.querySelector('.bmt-blocker')?.childNodes.length ?? -1,
      litBlockerVisibility: blockerStyle.visibility,
      litBlockerOpacity: Number(blockerStyle.opacity),
      litPieceVisibility: pieceStyle.visibility,
      litPieceOpacity: Number(pieceStyle.opacity),
      unlitHasLamp: unlit.classList.contains('has-lamp'),
    };
  });

  if (state.version !== '43') throw new Error(`V43 diagnostics missing: ${JSON.stringify(state)}`);
  if (state.edgeClicks !== 1 || state.inwardClicks !== 1) throw new Error(`Edge fallback regressed: ${JSON.stringify(state)}`);
  if (state.litClicks !== 1 || state.unlitClicks !== 0) throw new Error(`Lit/unlit lamp interaction guard is wrong: ${JSON.stringify(state)}`);
  if (!state.redrawsStable || state.litPlayable !== '1' || state.legacyCleared || state.litHasLamp || !state.litIsLit) throw new Error(`Lit lamp redraw did not stabilize: ${JSON.stringify(state)}`);
  if (state.litBlockerChildren < 1) throw new Error(`Core-owned lamp DOM was destructively cleared: ${JSON.stringify(state)}`);
  if (state.litBlockerVisibility !== 'hidden' || state.litBlockerOpacity !== 0 || state.litPieceVisibility === 'hidden' || state.litPieceOpacity === 0) throw new Error(`Lit lamp visual state is wrong: ${JSON.stringify(state)}`);
  if (!state.unlitHasLamp) throw new Error(`Unlit lamp was incorrectly unlocked: ${JSON.stringify(state)}`);

  console.log('OK: V43 keeps lit lamps playable across repeated core redraws without a MutationObserver feedback loop; unlit lamps and edge swipes still behave correctly.');
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
