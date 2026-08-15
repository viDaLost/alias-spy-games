import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const artifacts = path.join(root, 'artifacts', 'biblical-match-three-v2');
fs.mkdirSync(artifacts, { recursive: true });
const mime = new Map([['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.mjs','text/javascript; charset=utf-8'],['.css','text/css; charset=utf-8'],['.json','application/json; charset=utf-8'],['.svg','image/svg+xml'],['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg']]);
const visualHtml = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>BMT V2 Visual QA</title><link rel="stylesheet" href="/web/styles/biblical-match-three-v2.css?v=2"></head><body><main id="game-container"></main><script>window.Telegram={WebApp:{initDataUnsafe:{user:{id:999999,first_name:'Visual QA'}},HapticFeedback:{selectionChanged(){},notificationOccurred(){}}}};window.appGoToMainMenu=()=>{};localStorage.setItem('bible_stars_v1_999999','80');</script><script src="/web/games/biblical-match-three-core.js?v=2"></script><script src="/web/games/biblical-match-three-progress.js?v=2"></script><script src="/web/games/biblical-match-three-effects.js?v=2"></script><script src="/web/games/biblical-match-three.js?v=2"></script><script>window.startBiblicalMatchThreeGame('/web/data/biblical_match_three_levels.json?v=2');</script></body></html>`;

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (url.pathname === '/__bmt_v2_visual') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); res.end(visualHtml); return; }
    const pathname = decodeURIComponent(url.pathname); const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {'Content-Type':mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream','Cache-Control':'no-store'}); fs.createReadStream(target).pipe(res);
  } catch (error) { res.writeHead(500).end(String(error)); }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const browser = await chromium.launch({ headless:true, executablePath, args:['--no-sandbox','--disable-dev-shm-usage','--force-device-scale-factor=1'] });
const failures = []; const consoleErrors = [];

async function inspect(width) {
  const context = await browser.newContext({ viewport:{width,height:844}, deviceScaleFactor:1, isMobile:true, hasTouch:true });
  const page = await context.newPage();
  page.on('pageerror', (error) => consoleErrors.push(`${width}px pageerror: ${error.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('favicon')) consoleErrors.push(`${width}px console: ${msg.text()}`); });
  try {
    await page.goto(`${baseURL}/__bmt_v2_visual`, {waitUntil:'networkidle',timeout:20_000});
    await page.waitForSelector('.bmt-map-node.is-current', {timeout:8_000});
    await page.screenshot({path:path.join(artifacts,`menu-${width}.png`),fullPage:true});
    const menuGeometry = await page.evaluate(() => ({viewport:innerWidth,docWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)}));
    if (menuGeometry.docWidth > menuGeometry.viewport + 2) throw new Error(`menu horizontal overflow ${menuGeometry.docWidth} > ${menuGeometry.viewport}`);

    await page.locator('.bmt-map-node.is-current').click();
    await page.waitForSelector('.bmt-prelevel', {timeout:5_000});
    const sheet = await page.locator('.bmt-prelevel').boundingBox();
    if (!sheet || sheet.width > width + 1) throw new Error(`pre-level sheet does not fit ${width}px`);
    await page.locator('.bmt-prelevel .bmt-primary--large').click();
    await page.waitForSelector('.bmt-board .bmt-tile', {timeout:5_000}); await page.waitForTimeout(700);

    const tutorial = page.locator('.bmt-tutorial');
    if (await tutorial.count()) {
      const tutorialCard = await page.locator('.bmt-tutorial__card').boundingBox();
      if (!tutorialCard || tutorialCard.width > width - 10) throw new Error(`tutorial card does not fit ${width}px`);
      await page.screenshot({path:path.join(artifacts,`tutorial-${width}.png`),fullPage:true});
      await page.locator('.bmt-tutorial .bmt-primary').click();
      await page.waitForSelector('.bmt-tutorial', {state:'detached',timeout:3_000});
    }

    await page.screenshot({path:path.join(artifacts,`board-${width}.png`),fullPage:true});
    const geometry = await page.evaluate(() => {
      const board = document.querySelector('.bmt-board')?.getBoundingClientRect();
      const tiles = [...document.querySelectorAll('.bmt-board .bmt-tile')].map((node) => node.getBoundingClientRect());
      const nonTileControls = [...document.querySelectorAll('.bmt-shell button:not(.bmt-tile)')].filter((node) => !node.disabled).map((node) => ({text:(node.textContent || '').trim().slice(0,40),rect:node.getBoundingClientRect()})).filter(({rect}) => rect.width > 0 && rect.height > 0);
      return {viewport:innerWidth,docWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),board:board?{width:board.width,left:board.left,right:board.right}:null,minTile:tiles.length?Math.min(...tiles.map((r)=>Math.min(r.width,r.height))):0,tinyControls:nonTileControls.filter(({rect})=>rect.width<34||rect.height<34).slice(0,5).map(({text,rect})=>({text,width:Math.round(rect.width),height:Math.round(rect.height)})),goals:document.querySelectorAll('.bmt-goal').length,boosters:document.querySelectorAll('.bmt-booster').length};
    });
    if (geometry.docWidth > geometry.viewport + 2) throw new Error(`board horizontal overflow ${geometry.docWidth} > ${geometry.viewport}`);
    if (!geometry.board || geometry.board.left < -1 || geometry.board.right > width + 1) throw new Error(`board does not fit viewport: ${JSON.stringify(geometry.board)}`);
    if (geometry.minTile < 31) throw new Error(`board cells too small: ${geometry.minTile.toFixed(1)}px`);
    if (geometry.tinyControls.length) throw new Error(`tiny controls: ${JSON.stringify(geometry.tinyControls)}`);
    if (geometry.goals < 2) throw new Error('level HUD does not show goals');
    if (geometry.boosters !== 4) throw new Error(`expected 4 in-level boosters, got ${geometry.boosters}`);
    await page.locator('[data-booster="sling"]').click({timeout:5_000});
    const targeting = await page.locator('.bmt-board').evaluate((node) => node.classList.contains('is-targeting'));
    if (!targeting) throw new Error('booster targeting state is not visible');
    console.log(`✓ Biblical match-three v2 visual QA @ ${width}px (tile ${geometry.minTile.toFixed(1)}px)`);
  } catch (error) { failures.push(`${width}px: ${error.message}`); } finally { await context.close(); }
}

await inspect(390); await inspect(320);
await browser.close(); await new Promise((resolve) => server.close(resolve));
if (consoleErrors.length) failures.push(...consoleErrors.slice(0,10));
if (failures.length) { console.error(`Biblical match-three v2 visual QA failed:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log(`OK: mobile visual QA passed; screenshots written to ${path.relative(root, artifacts)}.`);
