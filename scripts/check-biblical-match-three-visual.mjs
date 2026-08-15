import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root=process.cwd();
const out=path.join(root,'artifacts','biblical-match-three-v2');
fs.mkdirSync(out,{recursive:true});
const V='8';
const scripts=['biblical-match-three-v5-loader.js','biblical-match-three-core.js','biblical-match-three-progress.js','biblical-match-three-effects.js','biblical-match-three.js','biblical-match-three-v6-runtime.js'].map(n=>`<script src="/web/games/${n}?v=${V}"></script>`).join('');
const html=`<!doctype html><html lang=ru><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{--bg-color:#fdfaf4;--accent-active:#4f46e5;--text-color:#2d2d2d;--card-bg:#fff}</style><link rel=stylesheet href=/web/styles/biblical-match-three-v2.css?v=${V}><link rel=stylesheet href=/web/styles/biblical-match-three-v2-polish.css?v=${V}><link rel=stylesheet href=/web/styles/biblical-match-three-v4.css?v=${V}><link rel=stylesheet href=/web/styles/biblical-match-three-v5.css?v=${V}></head><body><main id=game-container></main><script>window.Telegram={WebApp:{initDataUnsafe:{user:{id:999999}},HapticFeedback:{selectionChanged(){},notificationOccurred(){}}}};window.appGoToMainMenu=()=>{};localStorage.setItem('bible_stars_v1_999999','80');window.__swipeSeen=0;addEventListener('bmt:swipe',()=>__swipeSeen++);</script>${scripts}<script>(async()=>{try{if(window.BiblicalMatchThreeV5ArtReady)await Promise.race([window.BiblicalMatchThreeV5ArtReady,new Promise(r=>setTimeout(r,12000))])}catch{}const s=document.createElement('script');s.src='/web/games/biblical-match-three-v2-ux.js?v=${V}';s.onload=()=>startBiblicalMatchThreeGame('/web/data/biblical_match_three_levels.json?v=${V}');document.body.appendChild(s)})()</script></body></html>`;
const mime={'.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.txt':'text/plain'};
const server=http.createServer((req,res)=>{const u=new URL(req.url||'/','http://x');if(u.pathname==='/__qa'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return}const f=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream','Cache-Control':'public,max-age=3600'});fs.createReadStream(f).pipe(res)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();
const failures=[];

async function waitMenu(){
 await page.waitForSelector('.bmt-journey-node',{timeout:15000});
 await page.waitForFunction(()=>document.querySelector('.bmt-title')?.textContent.trim()==='Библейские сокровища'&&document.querySelectorAll('.bmt-journey-node:not([disabled])').length===30&&!!document.querySelector('[data-v6-timed="1"]'),null,{timeout:10000});
}

async function runWidth(width){
  await page.setViewportSize({width,height:844});
  await page.goto(base+'/__qa?unlockAll=1',{waitUntil:'domcontentloaded',timeout:30000});
  await waitMenu();
  await page.waitForTimeout(200);
  const menu=await page.evaluate(()=>({title:document.querySelector('.bmt-title')?.textContent,nodes:document.querySelectorAll('.bmt-journey-node:not([disabled])').length,timed:!!document.querySelector('[data-v6-timed="1"]'),fish:window.BiblicalMatchThreeV5Art?.symbols?.fish||'',ark:window.BiblicalMatchThreeV5Art?.symbols?.ark||'',art:window.BiblicalMatchThreeV5Art?.kind||'',overflow:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-innerWidth}));
  if(menu.title!=='Библейские сокровища'||menu.nodes!==30||!menu.timed||!menu.fish.includes('/symbols/fish.webp')||!menu.ark||menu.ark.includes('/symbols/ark.webp')||!/^raster-hq-v8|safe-fallback-v8$/.test(menu.art)||menu.overflow>2)throw Error(`menu ${JSON.stringify(menu)}`);
  await page.screenshot({path:path.join(out,`menu-v8-${width}.png`),fullPage:true});
  await page.locator('[data-v6-timed="1"]').click();
  await page.waitForSelector('.bmt-board .bmt-tile',{timeout:8000});
  if(await page.locator('.bmt-tutorial').count())await page.locator('.bmt-tutorial button').click();
  await page.waitForTimeout(300);
  const timed=await page.evaluate(()=>({kick:document.querySelector('.bmt-gamebar .bmt-kicker')?.textContent,time:document.getElementById('bmt-moves')?.textContent,title:document.querySelector('.bmt-gamebar .bmt-title')?.textContent}));
  if(!/На время/.test(timed.kick||'')||!/01:/.test(timed.time||'')||timed.title!=='Библейские сокровища')throw Error(`timed ${JSON.stringify(timed)}`);
  const first=page.locator('.bmt-tile').first();
  const box=await first.boundingBox();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.92,box.y+box.height*.5,{steps:5});
  const transform=await first.evaluate(n=>getComputedStyle(n).transform);
  await page.mouse.up();
  if(!transform||transform==='none')throw Error('whole tile is not moving during swipe');
  await page.waitForFunction(()=>window.__swipeSeen>0,null,{timeout:3000});
  await page.waitForFunction(()=>!document.querySelector('.bmt-shell')?.classList.contains('is-busy'),null,{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(700);
  const board=await page.evaluate(()=>{const node=document.querySelector('.bmt-board');const rows=Number(node?.dataset.rows||0),cols=Number(node?.dataset.cols||0);return{rows,cols,tiles:document.querySelectorAll('.bmt-tile').length,filled:[...document.querySelectorAll('.bmt-piece')].filter(i=>i.getAttribute('src')).length,boosters:document.querySelectorAll('.bmt-booster').length,labelVisible:getComputedStyle(document.querySelector('.bmt-booster-tray__label')).display!=='none',overflow:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-innerWidth}});
  if(board.rows!==7||board.cols!==8||board.tiles!==board.rows*board.cols||board.filled!==board.tiles||board.boosters!==4||board.labelVisible||board.overflow>2)throw Error(`board ${JSON.stringify(board)}`);
  await page.screenshot({path:path.join(out,`board-v8-${width}.png`),fullPage:true});
}

async function runForcedFallback(){
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/__qa?unlockAll=1&artFallback=1',{waitUntil:'domcontentloaded',timeout:30000});
 await waitMenu();
 const state=await page.evaluate(()=>({art:window.BiblicalMatchThreeV5Art?.kind||'',ark:window.BiblicalMatchThreeV5Art?.symbols?.ark||'',shell:!!document.querySelector('.bmt-shell'),title:document.querySelector('.bmt-title')?.textContent||''}));
 if(state.art!=='safe-fallback-v8'||!state.ark.includes('/ark.svg')||!state.shell||state.title.trim()!=='Библейские сокровища')throw Error(`fallback ${JSON.stringify(state)}`);
 await page.screenshot({path:path.join(out,'fallback-v8-390.png'),fullPage:true});
}

for(const width of [390,320]){try{await runWidth(width)}catch(error){try{await page.screenshot({path:path.join(out,`failure-v8-${width}.png`),fullPage:true})}catch{}failures.push(`${width}: ${error.message}`)}}
try{await runForcedFallback()}catch(error){try{await page.screenshot({path:path.join(out,'failure-v8-fallback.png'),fullPage:true})}catch{}failures.push(`fallback: ${error.message}`)}
await context.close();await browser.close();await new Promise(r=>server.close(r));
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('OK: Biblical Treasures V8 mobile + forced fallback QA passed');
