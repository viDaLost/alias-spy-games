import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root=process.cwd();
const V='16';
const ALLOWED='1288379477';
const scripts=[
  'biblical-match-three-v5-loader.js',
  'biblical-match-three-core.js',
  'biblical-match-three-progress.js',
  'biblical-match-three-effects.js',
  'biblical-match-three.js',
  'biblical-match-three-v10-runtime.js',
  'biblical-match-three-v15-ui.js',
  'biblical-match-three-v15-polish.js',
].map(name=>`<script src="/web/games/${name}?v=${V}"></script>`).join('');
const styles=['v2','v2-polish','v4','v5','v9','v10','v11-modal','v13','v15-polish']
  .map(name=>`<link rel="stylesheet" href="/web/styles/biblical-match-three-${name}.css?v=${V}">`).join('');
const strictCsp=`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self';`;
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="${strictCsp}">${styles}</head><body data-current-game="biblical-match-three" data-mode="game"><main id="game-container"></main><script>
window.Telegram={WebApp:{initDataUnsafe:{user:{id:Number('${ALLOWED}')}},contentSafeAreaInset:{top:96},safeAreaInset:{top:47},HapticFeedback:{selectionChanged(){},notificationOccurred(){}}}};
window.appGoToMainMenu=()=>{};
localStorage.setItem('bible_stars_v1_${ALLOWED}','100');
</script>${scripts}<script>(async()=>{await window.BiblicalMatchThreeV5ArtReady;await window.startBiblicalMatchThreeGame('/web/data/biblical_match_three_levels.json?v=${V}')})().catch(e=>{document.body.dataset.qaError=String(e&&e.stack||e)})</script></body></html>`;
function accessHtml(uid){return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="${strictCsp}"></head><body data-mode="menu"><main id="menu-container"><section><div id="kids-games"></div></section></main><main id="game-container"></main><script>window.Telegram={WebApp:{initDataUnsafe:{user:{id:Number('${uid}')}},contentSafeAreaInset:{top:0},safeAreaInset:{top:0},HapticFeedback:{selectionChanged(){},notificationOccurred(){}}}};window.appGoToMainMenu=()=>{};</script><script src="/web/js/biblical-match-three-launcher.js?v=${V}"></script></body></html>`}
const mime={'.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.txt':'text/plain'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url||'/','http://local');
  if(url.pathname==='/__qa'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;}
  if(url.pathname==='/__access'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(accessHtml(url.searchParams.get('uid')||'0'));return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});

async function checkAccess(){
  const denied=await context.newPage();const deniedRequests=[];denied.on('request',r=>deniedRequests.push(r.url()));
  await denied.goto(`${base}/__access?uid=999999999`,{waitUntil:'domcontentloaded',timeout:30000});
  await denied.waitForTimeout(900);
  const deniedState=await denied.evaluate(async()=>({card:!!document.getElementById('biblical-match-three-card'),allowed:window.BiblicalMatchThreeAccess?.isAllowedUser?.(),result:await window.openBiblicalMatchThree?.(),game:document.body.dataset.currentGame||'',gameHtml:document.getElementById('game-container')?.innerHTML||''}));
  if(deniedState.card||deniedState.allowed||deniedState.result!==false||deniedState.game||deniedState.gameHtml)throw new Error(`unauthorized access ${JSON.stringify(deniedState)}`);
  if(deniedRequests.some(url=>/biblical-match-three-v5-loader|hq-v5\/atlas-/i.test(url)))throw new Error('unauthorized user loaded private game art');
  await denied.close();

  const allowed=await context.newPage();const allowedRequests=[];allowed.on('request',r=>allowedRequests.push(r.url()));
  await allowed.goto(`${base}/__access?uid=${ALLOWED}`,{waitUntil:'domcontentloaded',timeout:30000});
  await allowed.waitForSelector('#biblical-match-three-card',{timeout:20000});
  const allowedState=await allowed.evaluate(()=>({allowed:window.BiblicalMatchThreeAccess?.isAllowedUser?.(),id:window.BiblicalMatchThreeAccess?.currentUserId?.(),src:document.querySelector('#biblical-match-three-card img')?.getAttribute('src')||''}));
  if(!allowedState.allowed||allowedState.id!==ALLOWED||!allowedState.src.startsWith('blob:'))throw new Error(`authorized access ${JSON.stringify(allowedState)}`);
  await allowed.locator('#biblical-match-three-card').click();
  await allowed.waitForSelector('.bmt-v13-menu',{timeout:20000});
  if(!allowedRequests.some(url=>/biblical-match-three-v5-loader/i.test(url)))throw new Error('authorized user did not load game art');
  await allowed.close();
}

async function dismissTutorial(page){
  await page.waitForTimeout(700);
  const button=page.locator('.bmt-tutorial button').first();
  if(await button.count()){try{if(await button.isVisible())await button.click()}catch{}}
  await page.waitForTimeout(180);
}

async function checkGame(){
  const page=await context.newPage();
  const requested=[];page.on('request',request=>requested.push(request.url()));
  try{
    await page.goto(base+'/__qa',{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForSelector('.bmt-v13-menu',{timeout:20000});
    await page.waitForFunction(()=>window.BiblicalMatchThreeV5Art?.kind==='raster-hq-v16'&&window.BiblicalMatchThreeV5Art?.transport==='blob'&&window.__bmtV15UiInstalled&&window.__bmtV15PolishInstalled,{timeout:15000});
    const menu=await page.evaluate(async()=>{
      const art=window.BiblicalMatchThreeV5Art;
      const groups={symbols:art.symbols,boosters:art.boosters,goals:art.goals,obstacles:art.obstacles};
      const sources=Object.entries(groups).flatMap(([group,map])=>Object.entries(map).map(([key,src])=>({group,key,src})));
      const decoded=await Promise.all(sources.map(item=>new Promise(resolve=>{const img=new Image();const done=()=>resolve({...item,w:img.naturalWidth,h:img.naturalHeight});img.onload=done;img.onerror=done;img.src=item.src;if(img.complete)setTimeout(done,0)})));
      return{kind:art.kind,transport:art.transport,ark:art.symbols?.ark||'',boosterArk:art.boosters?.ark||'',decoded,lowQuality:[...document.images].some(img=>/biblical-match-three-art-|v14-raster-pack|v14-icons/i.test(img.src)),overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth};
    });
    if(menu.kind!=='raster-hq-v16'||menu.transport!=='blob'||!menu.ark.startsWith('blob:')||!menu.boosterArk.startsWith('blob:')||menu.lowQuality||menu.overflow>2)throw new Error(`menu ${JSON.stringify({...menu,decoded:undefined})}`);
    if(menu.decoded.length<20||menu.decoded.some(x=>String(x.src).startsWith('data:')||x.w<64||x.h<64))throw new Error(`all-art ${JSON.stringify(menu.decoded.filter(x=>String(x.src).startsWith('data:')||x.w<64||x.h<64))}`);

    const firstLevel=page.locator('.bmt-v13-chapter.is-active .bmt-v13-level:not([disabled]),.bmt-v13-chapter.is-active .bmt-journey-node:not([disabled]),.bmt-v13-level:not([disabled])').first();
    await firstLevel.click();
    await page.waitForSelector('.bmt-prelevel',{state:'visible',timeout:6000});
    await page.waitForTimeout(260);
    const prelevel=await page.evaluate(()=>{
      const root=document.querySelector('.bmt-prelevel');
      const goals=[...(root?.querySelectorAll('.bmt-prelevel__goals img,.bmt-goal__icon img')||[])].map(img=>({src:img.getAttribute('src')||'',w:img.naturalWidth,tag:img.dataset.bmtRaster,visibility:getComputedStyle(img).visibility,opacity:+getComputedStyle(img).opacity}));
      const start=[...document.querySelectorAll('button')].find(btn=>(btn.textContent||'').includes('Начать уровень'));
      const r=start?.getBoundingClientRect();return{goals,start:start?{disabled:start.disabled,display:getComputedStyle(start).display,visibility:getComputedStyle(start).visibility,opacity:+getComputedStyle(start).opacity,w:r.width,h:r.height,bottom:r.bottom}:null};
    });
    const goodSrc=src=>String(src||'').startsWith('blob:')||String(src||'').includes('/hq-v5/symbols/fish.webp');
    if(!prelevel.goals.length||prelevel.goals.some(x=>!goodSrc(x.src)||x.w<64||x.tag!=='hq-v16'||x.visibility==='hidden'||x.opacity<.99))throw new Error(`level-one goals ${JSON.stringify(prelevel.goals)}`);
    if(!prelevel.start||prelevel.start.disabled||prelevel.start.display==='none'||prelevel.start.visibility==='hidden'||prelevel.start.opacity<.99||prelevel.start.w<80||prelevel.start.h<34||prelevel.start.bottom>846)throw new Error(`level-one start ${JSON.stringify(prelevel.start)}`);
    await page.getByRole('button',{name:/Начать уровень/}).click();
    await page.waitForSelector('.bmt-board .bmt-tile',{timeout:8000});
    await dismissTutorial(page);
    await page.waitForFunction(()=>[...document.querySelectorAll('.bmt-piece')].filter(img=>img.src).every(img=>img.complete&&img.naturalWidth>0&&img.dataset.bmtRaster==='hq-v16'),{timeout:8000});
    const artState=await page.evaluate(()=>({
      rows:Number(document.querySelector('.bmt-board')?.dataset.rows||0),cols:Number(document.querySelector('.bmt-board')?.dataset.cols||0),tiles:document.querySelectorAll('.bmt-board .bmt-tile').length,
      pieces:[...document.querySelectorAll('.bmt-piece')].filter(img=>img.src).map(img=>({src:img.getAttribute('src'),w:img.naturalWidth,tag:img.dataset.bmtRaster,visibility:getComputedStyle(img).visibility})),
      boosters:[...document.querySelectorAll('.bmt-booster__icon img')].map(img=>({src:img.getAttribute('src'),w:img.naturalWidth,tag:img.dataset.bmtRaster,visibility:getComputedStyle(img).visibility})),
      ark:[...document.querySelectorAll('[data-booster="ark"] img')].map(img=>({src:img.getAttribute('src'),w:img.naturalWidth,tag:img.dataset.bmtRaster})),
    }));
    if(artState.rows!==5||artState.cols!==8||artState.tiles!==40)throw new Error(`level-one board ${JSON.stringify({rows:artState.rows,cols:artState.cols,tiles:artState.tiles})}`);
    if(!artState.pieces.length||artState.pieces.some(x=>!goodSrc(x.src)||x.w<64||x.tag!=='hq-v16'||x.visibility==='hidden'))throw new Error(`pieces ${JSON.stringify(artState.pieces.slice(0,8))}`);
    if(artState.boosters.length!==4||artState.boosters.some(x=>!goodSrc(x.src)||x.w<64||x.tag!=='hq-v16'||x.visibility==='hidden'))throw new Error(`boosters ${JSON.stringify(artState.boosters)}`);
    if(artState.ark.length!==1||!goodSrc(artState.ark[0].src)||artState.ark[0].w<64||artState.ark[0].tag!=='hq-v16')throw new Error(`ark ${JSON.stringify(artState.ark)}`);

    const first=page.locator('.bmt-tile').first();const box=await first.boundingBox();
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*1.15,box.y+box.height*.5,{steps:3});await page.mouse.up();
    await page.waitForSelector('.bmt-tile.is-swapping',{timeout:2500});
    const during=await page.evaluate(()=>[...document.querySelectorAll('.bmt-tile.is-swapping')].map(tile=>{const img=tile.querySelector('.bmt-piece'),wrap=tile.querySelector('.bmt-piece-wrap'),ts=getComputedStyle(tile),is=getComputedStyle(img),ws=getComputedStyle(wrap);return{overflow:ts.overflow,contain:ts.contain,visibility:is.visibility,opacity:+is.opacity,w:img.naturalWidth,src:img.getAttribute('src'),wrapOverflow:ws.overflow}}));
    if(during.length!==2||during.some(x=>x.overflow!=='visible'||x.contain!=='none'||x.visibility==='hidden'||x.opacity<.99||x.w<64||!goodSrc(x.src)||x.wrapOverflow!=='visible'))throw new Error(`swipe ${JSON.stringify(during)}`);
    await page.waitForFunction(()=>!document.querySelector('.bmt-tile.is-swapping')&&!document.querySelector('.bmt-tile.is-swap-back'),{timeout:3000});
    const after=await page.evaluate(()=>({missing:[...document.querySelectorAll('.bmt-piece')].filter(img=>img.src&&(img.naturalWidth===0||getComputedStyle(img).visibility==='hidden')).length,scrollH:document.documentElement.scrollHeight,innerH:innerHeight,dataImages:[...document.images].filter(img=>/^data:/i.test(img.getAttribute('src')||'')).length}));
    if(after.missing||after.dataImages||after.scrollH>after.innerH+3)throw new Error(`after ${JSON.stringify(after)}`);
    if(requested.some(url=>/biblical-match-three-(?:v14-raster-pack|v14-icons|art-symbols|art-boosters|art-goals|art-obstacles)/i.test(url)))throw new Error('obsolete art requested');
  } finally { await page.close(); }
}

try{
  await checkAccess();
  await checkGame();
  console.log('OK: Biblical Treasures V16 private access + exact level-one goals/board + CSP-safe HQ blob icons + visible swipe passed');
} finally {
  await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
}
