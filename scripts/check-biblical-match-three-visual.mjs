import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root=process.cwd();
const out=path.join(root,'artifacts','biblical-match-three-v2');
fs.mkdirSync(out,{recursive:true});
const V='11';
const scripts=['biblical-match-three-v5-loader.js','biblical-match-three-core.js','biblical-match-three-progress.js','biblical-match-three-effects.js','biblical-match-three.js','biblical-match-three-v10-runtime.js'].map(n=>`<script src="/web/games/${n}?v=${V}"></script>`).join('');
const html=`<!doctype html><html lang=ru><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{--bg-color:#fdfaf4;--accent-color:#dbeafe;--accent-hover:#bfdbfe;--accent-active:#4f46e5;--text-color:#2d2d2d;--card-bg:#fff;--shadow-app:0 4px 12px rgba(79,70,229,.08),0 2px 4px rgba(0,0,0,.04)}html,body{margin:0;min-height:100%}</style><link rel=stylesheet href=/web/styles/biblical-match-three-v2.css?v=${V}><link rel=stylesheet href=/web/styles/biblical-match-three-v2-polish.css?v=${V}><link rel=stylesheet href=/web/styles/biblical-match-three-v4.css?v=${V}><link rel=stylesheet href=/web/styles/biblical-match-three-v5.css?v=${V}><link rel=stylesheet href=/web/styles/biblical-match-three-v9.css?v=${V}><link rel=stylesheet href=/web/styles/biblical-match-three-v10.css?v=${V}><link rel=stylesheet href=/web/styles/biblical-match-three-v11.css?v=${V}></head><body><main id=game-container></main><script>window.Telegram={WebApp:{initDataUnsafe:{user:{id:999999}},contentSafeAreaInset:{top:96},safeAreaInset:{top:47},HapticFeedback:{selectionChanged(){},notificationOccurred(){}}}};window.appGoToMainMenu=()=>{};localStorage.setItem('bible_stars_v1_999999','80');window.__swipeSeen=0;addEventListener('bmt:swipe',()=>__swipeSeen++);</script>${scripts}<script>(async()=>{try{if(window.BiblicalMatchThreeV5ArtReady)await Promise.race([window.BiblicalMatchThreeV5ArtReady,new Promise(r=>setTimeout(r,12000))])}catch{}const ux=document.createElement('script');ux.src='/web/games/biblical-match-three-v10-ux.js?v=${V}';ux.onload=()=>{const ui=document.createElement('script');ui.src='/web/games/biblical-match-three-v11-ui.js?v=${V}';ui.onload=()=>startBiblicalMatchThreeGame('/web/data/biblical_match_three_levels.json?v=${V}');document.body.appendChild(ui)};document.body.appendChild(ux)})()</script></body></html>`;
const mime={'.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.txt':'text/plain'};
const server=http.createServer((req,res)=>{const u=new URL(req.url||'/','http://x');if(u.pathname==='/__qa'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return}const f=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream','Cache-Control':'public,max-age=3600'});fs.createReadStream(f).pipe(res)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();
const failures=[];

async function waitMenu(){
 await page.waitForSelector('.bmt-v11-menu .bmt-v11-dashboard',{timeout:15000});
 await page.waitForFunction(()=>document.querySelector('.bmt-title')?.textContent.trim()==='Сокровища'&&document.querySelectorAll('.bmt-journey-node:not([disabled])').length===30&&!!document.querySelector('[data-v10-timed="1"]')&&!!window.__bmtV11UiInstalled,null,{timeout:10000});
}
async function visibleButton(text){
 return page.evaluate((label)=>{const b=[...document.querySelectorAll('button')].find(n=>(n.textContent||'').trim().includes(label));if(!b)return null;const r=b.getBoundingClientRect(),s=getComputedStyle(b);return{text:(b.textContent||'').trim(),display:s.display,visibility:s.visibility,opacity:Number(s.opacity),w:r.width,h:r.height,top:r.top,bottom:r.bottom,disabled:b.disabled}},text);
}
async function openLevelOne(viewportHeight){
 await page.locator('.bmt-journey-node').first().click();
 await page.waitForSelector('body > .bmt-sheet-overlay .bmt-prelevel',{timeout:5000});
 const start=await visibleButton('Начать уровень');
 if(!start||start.display==='none'||start.visibility==='hidden'||start.opacity<.9||start.w<80||start.h<40||start.bottom>viewportHeight+2||start.disabled)throw Error(`start button ${JSON.stringify(start)}`);
 return start;
}
async function enterLevelBoard(){
 await page.getByRole('button',{name:/Начать уровень/}).click();
 await page.waitForSelector('.bmt-board .bmt-tile',{timeout:8000});
 if(await page.locator('.bmt-tutorial').count())await page.locator('.bmt-tutorial button').click();
 await page.waitForTimeout(450);
}

async function runWidth(width,height=844){
 await page.setViewportSize({width,height});
 await page.goto(base+'/__qa?unlockAll=1',{waitUntil:'domcontentloaded',timeout:30000});
 await waitMenu();
 const menu=await page.evaluate(()=>{const shell=document.querySelector('.bmt-v11-menu');const text=shell?.textContent||'';return{title:document.querySelector('.bmt-title')?.textContent,nodes:document.querySelectorAll('.bmt-journey-node:not([disabled])').length,timed:!!document.querySelector('[data-v10-timed="1"]'),tabs:document.querySelectorAll('.bmt-v11-tabs button').length,activeChapters:document.querySelectorAll('.bmt-v11-chapter-map .bmt-journey-chapter.is-active:not([hidden])').length,hero:!!document.querySelector('.bmt-hero-v2'),forbidden:/30 уровней|адаптивное поле|библейские бустеры/i.test(text),ark:window.BiblicalMatchThreeV5Art?.symbols?.ark||'',v11:!!window.__bmtV11UiInstalled,overflow:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-innerWidth}});
 if(menu.title!=='Сокровища'||menu.nodes!==30||!menu.timed||menu.tabs!==2||menu.activeChapters!==1||menu.hero||menu.forbidden||!menu.v11||!(menu.ark.startsWith('blob:')||menu.ark.includes('/hq-v5/symbols/ark.webp'))||menu.overflow>2)throw Error(`menu ${JSON.stringify(menu)}`);
 await page.screenshot({path:path.join(out,`menu-v11-${width}.png`),fullPage:true});
 await openLevelOne(height);
 await page.screenshot({path:path.join(out,`level-sheet-v11-${width}.png`),fullPage:true});
 await enterLevelBoard();
 const board=await page.evaluate(()=>{const n=document.querySelector('.bmt-board'),r=n?.getBoundingClientRect(),wrap=n?.closest('.bmt-board-wrap')?.getBoundingClientRect();const boosters=[...document.querySelectorAll('.bmt-booster')].map(b=>{const x=b.getBoundingClientRect(),s=getComputedStyle(b);return{display:s.display,w:x.width,h:x.height,bottom:x.bottom}});const actions=[...document.querySelectorAll('.bmt-actions-v2 .bmt-action-button')].map(b=>{const x=b.getBoundingClientRect(),s=getComputedStyle(b);return{display:s.display,w:x.width,h:x.height,bottom:x.bottom}});return{rows:Number(n?.dataset.rows||0),cols:Number(n?.dataset.cols||0),tiles:document.querySelectorAll('.bmt-tile').length,arkBooster:!!document.querySelector('[data-booster="ark"] img[data-bmt-v11-ark="raster"]'),bodyActive:document.body.classList.contains('bmt-board-active'),scrollH:document.documentElement.scrollHeight,innerH:innerHeight,top:r?.top,bottom:r?.bottom,left:r?.left,right:r?.right,boardH:r?.height,wrapH:wrap?.height,boosters,actions,overflowX:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-innerWidth}});
 if(board.rows!==5||board.cols!==8||board.tiles!==40||!board.arkBooster||!board.bodyActive||board.scrollH>height+3||board.bottom>height+2||board.top<0||board.left<0||board.right>width+2||board.overflowX>2||board.wrapH-board.boardH>12||board.boosters.length!==4||board.boosters.some(x=>x.display==='none'||x.w<35||x.h<35||x.bottom>height+2)||board.actions.length!==2||board.actions.some(x=>x.display==='none'||x.w<80||x.h<34||x.bottom>height+2))throw Error(`board ${JSON.stringify(board)}`);
 await page.evaluate(()=>{window.__ghostSeen=0;window.__ghostObserver?.disconnect?.();window.__ghostObserver=new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1&&n.classList?.contains('bmt-v11-swap-layer'))window.__ghostSeen++});window.__ghostObserver.observe(document.body,{childList:true})});
 const first=page.locator('.bmt-tile').first();
 const box=await first.boundingBox();
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.92,box.y+box.height*.5,{steps:3});
 const during=await first.evaluate(n=>({piece:getComputedStyle(n.querySelector('.bmt-piece-wrap')).transform,dx:n.style.getPropertyValue('--bmt-drag-x'),ready:n.classList.contains('is-swipe-ready')}));
 await page.mouse.up();
 if(during.dx||!during.ready)throw Error(`drag should be stable ${JSON.stringify(during)}`);
 await page.waitForFunction(()=>window.__swipeSeen>0&&window.__ghostSeen>0,null,{timeout:3000});
 await page.waitForTimeout(520);
 const post=await page.evaluate(()=>({ghostSeen:window.__ghostSeen,ghostLayers:document.querySelectorAll('.bmt-v11-swap-layer').length,ghosting:document.querySelectorAll('.bmt-v11-ghosting').length,scrollH:document.documentElement.scrollHeight,innerH:innerHeight,dragVars:[...document.querySelectorAll('.bmt-tile')].some(n=>n.style.getPropertyValue('--bmt-drag-x')||n.style.getPropertyValue('--bmt-drag-y'))}));
 if(post.ghostSeen<1||post.ghostLayers||post.ghosting||post.dragVars||post.scrollH>height+3)throw Error(`post swipe ${JSON.stringify(post)}`);
 await page.screenshot({path:path.join(out,`board-v11-${width}.png`),fullPage:true});
}

async function runFreeResult(){
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/__qa?unlockAll=1',{waitUntil:'domcontentloaded',timeout:30000});
 await waitMenu();
 await page.locator('[data-bmt-v11-tab="free"]').click();
 await page.locator('.bmt-free-card').filter({hasText:'Лёгкий'}).click();
 await page.waitForSelector('.bmt-board .bmt-tile',{timeout:8000});
 if(await page.locator('.bmt-tutorial').count())await page.locator('.bmt-tutorial button').click();
 const finish=page.locator('.bmt-actions-v2 .bmt-action-button').filter({hasText:'Завершить'});
 await finish.click();
 await page.waitForSelector('body > .bmt-result-overlay .bmt-result-card',{timeout:5000});
 const labels=await page.evaluate(()=>[...document.querySelectorAll('body > .bmt-result-overlay .bmt-result-actions button')].map(b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b);return{text:(b.textContent||'').trim(),display:s.display,opacity:Number(s.opacity),w:r.width,h:r.height,bottom:r.bottom}}));
 if(labels.length<2||labels.some(x=>x.display==='none'||x.opacity<.9||x.w<70||x.h<40||x.bottom>846))throw Error(`result buttons ${JSON.stringify(labels)}`);
 await page.screenshot({path:path.join(out,'free-result-v11-390.png'),fullPage:true});
}

async function runForcedFallback(){
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/__qa?unlockAll=1&artFallback=1',{waitUntil:'domcontentloaded',timeout:30000});
 await waitMenu();
 const state=await page.evaluate(()=>({art:window.BiblicalMatchThreeV5Art?.kind||'',ark:window.BiblicalMatchThreeV5Art?.symbols?.ark||'',shell:!!document.querySelector('.bmt-v11-menu'),title:document.querySelector('.bmt-title')?.textContent||'',raster:!!document.querySelector('img[data-bmt-v11-ark="raster"]')}));
 if(state.art!=='safe-fallback-v10'||!(state.ark.startsWith('blob:')||state.ark.includes('/hq-v5/symbols/ark.webp'))||!state.shell||state.title.trim()!=='Сокровища'||!state.raster)throw Error(`fallback ${JSON.stringify(state)}`);
}

for(const [width,height] of [[390,844],[320,700],[430,932]]){try{await runWidth(width,height)}catch(error){try{await page.screenshot({path:path.join(out,`failure-v11-${width}.png`),fullPage:true})}catch{}failures.push(`${width}x${height}: ${error.message}`)}}
try{await runFreeResult()}catch(error){try{await page.screenshot({path:path.join(out,'failure-v11-result.png'),fullPage:true})}catch{}failures.push(`result: ${error.message}`)}
try{await runForcedFallback()}catch(error){failures.push(`fallback: ${error.message}`)}
await context.close();await browser.close();await new Promise(r=>server.close(r));
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('OK: Biblical Treasures V11 compact menu + single viewport + raster Ark + continuous swap QA passed');