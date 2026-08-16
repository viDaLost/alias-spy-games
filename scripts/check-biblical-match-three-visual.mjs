import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root=process.cwd();
const scripts=[
  'biblical-match-three-v5-loader.js',
  'biblical-match-three-core.js',
  'biblical-match-three-progress.js',
  'biblical-match-three-effects.js',
  'biblical-match-three.js',
  'biblical-match-three-v10-runtime.js',
  'biblical-match-three-v15-ui.js',
  'biblical-match-three-v15-polish.js',
].map(name=>`<script src="/web/games/${name}?v=15"></script>`).join('');
const styles=['v2','v2-polish','v4','v5','v9','v10','v11-modal','v13','v15-polish']
  .map(name=>`<link rel="stylesheet" href="/web/styles/biblical-match-three-${name}.css?v=15">`).join('');
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${styles}</head><body><main id="game-container"></main><script>
window.Telegram={WebApp:{contentSafeAreaInset:{top:96},safeAreaInset:{top:47},HapticFeedback:{selectionChanged(){},notificationOccurred(){}}}};
window.appGoToMainMenu=()=>{};
localStorage.setItem('bible_stars_v1','100');
</script>${scripts}<script>(async()=>{await window.BiblicalMatchThreeV5ArtReady;await window.startBiblicalMatchThreeGame('/web/data/biblical_match_three_levels.json?v=15')})().catch(e=>{document.body.dataset.qaError=String(e&&e.stack||e)})</script></body></html>`;
const mime={'.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.txt':'text/plain'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url||'/','http://local');
  if(url.pathname==='/__qa'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();
const requested=[];page.on('request',request=>requested.push(request.url()));
try{
  await page.goto(base+'/__qa',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('.bmt-v13-menu',{timeout:20000});
  await page.waitForFunction(()=>window.BiblicalMatchThreeV5Art?.kind==='raster-hq-v15'&&window.__bmtV15UiInstalled&&window.__bmtV15PolishInstalled,{timeout:15000});
  const menu=await page.evaluate(()=>({
    kind:window.BiblicalMatchThreeV5Art?.kind,
    ark:window.BiblicalMatchThreeV5Art?.symbols?.ark||'',
    boosterArk:window.BiblicalMatchThreeV5Art?.boosters?.ark||'',
    lowQuality:[...document.images].some(img=>/biblical-match-three-art-|v14-raster-pack|v14-icons/i.test(img.src)),
    overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
  }));
  if(menu.kind!=='raster-hq-v15'||!menu.ark.startsWith('data:image/')||!menu.boosterArk.startsWith('data:image/')||menu.lowQuality||menu.overflow>2)throw new Error(`menu ${JSON.stringify(menu)}`);

  await page.locator('[data-v13-mode="free"]').click();
  await page.locator('.bmt-free-card').first().click();
  await page.waitForSelector('.bmt-board .bmt-tile',{timeout:8000});
  await page.waitForFunction(()=>[...document.querySelectorAll('.bmt-piece')].filter(img=>img.src).every(img=>img.complete&&img.naturalWidth>0&&img.dataset.bmtRaster==='hq-v15'),{timeout:8000});
  const artState=await page.evaluate(()=>({
    pieces:[...document.querySelectorAll('.bmt-piece')].filter(img=>img.src).map(img=>({src:img.getAttribute('src'),w:img.naturalWidth,tag:img.dataset.bmtRaster})),
    boosters:[...document.querySelectorAll('.bmt-booster__icon img')].map(img=>({src:img.getAttribute('src'),w:img.naturalWidth,tag:img.dataset.bmtRaster,visibility:getComputedStyle(img).visibility})),
    ark:[...document.querySelectorAll('[data-booster="ark"] img')].map(img=>({src:img.getAttribute('src'),w:img.naturalWidth,tag:img.dataset.bmtRaster})),
  }));
  const goodSrc=src=>String(src||'').startsWith('data:image/')||String(src||'').includes('/hq-v5/symbols/fish.webp');
  if(!artState.pieces.length||artState.pieces.some(x=>!goodSrc(x.src)||x.w<64||x.tag!=='hq-v15'))throw new Error(`pieces ${JSON.stringify(artState.pieces.slice(0,4))}`);
  if(artState.boosters.length!==4||artState.boosters.some(x=>!goodSrc(x.src)||x.w<64||x.tag!=='hq-v15'||x.visibility==='hidden'))throw new Error(`boosters ${JSON.stringify(artState.boosters)}`);
  if(artState.ark.length!==1||!goodSrc(artState.ark[0].src)||artState.ark[0].w<64||artState.ark[0].tag!=='hq-v15')throw new Error(`ark ${JSON.stringify(artState.ark)}`);

  const first=page.locator('.bmt-tile').first();const box=await first.boundingBox();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*1.15,box.y+box.height*.5,{steps:3});await page.mouse.up();
  await page.waitForSelector('.bmt-tile.is-swapping',{timeout:2500});
  const during=await page.evaluate(()=>[...document.querySelectorAll('.bmt-tile.is-swapping')].map(tile=>{const img=tile.querySelector('.bmt-piece'),wrap=tile.querySelector('.bmt-piece-wrap'),ts=getComputedStyle(tile),is=getComputedStyle(img),ws=getComputedStyle(wrap);return{overflow:ts.overflow,contain:ts.contain,visibility:is.visibility,opacity:+is.opacity,w:img.naturalWidth,src:img.getAttribute('src'),wrapOverflow:ws.overflow}}));
  if(during.length!==2||during.some(x=>x.overflow!=='visible'||x.contain!=='none'||x.visibility==='hidden'||x.opacity<.99||x.w<64||!goodSrc(x.src)||x.wrapOverflow!=='visible'))throw new Error(`swipe ${JSON.stringify(during)}`);
  await page.waitForFunction(()=>!document.querySelector('.bmt-tile.is-swapping')&&!document.querySelector('.bmt-tile.is-swap-back'),{timeout:3000});
  const after=await page.evaluate(()=>({missing:[...document.querySelectorAll('.bmt-piece')].filter(img=>img.src&&(img.naturalWidth===0||getComputedStyle(img).visibility==='hidden')).length,scrollH:document.documentElement.scrollHeight,innerH:innerHeight}));
  if(after.missing||after.scrollH>after.innerH+3)throw new Error(`after ${JSON.stringify(after)}`);
  if(requested.some(url=>/biblical-match-three-(?:v14-raster-pack|v14-icons|art-symbols|art-boosters|art-goals|art-obstacles)/i.test(url)))throw new Error('obsolete art requested');
  console.log('OK: Biblical Treasures V15 HQ icons + visible swipe animation passed');
} finally {
  await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
}
