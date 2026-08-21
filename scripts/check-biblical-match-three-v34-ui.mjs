import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body data-current-game="biblical-match-three" data-mode="game"><main id="game-container"><section class="bmt-shell bmt-board-screen"><div class="bmt-board-wrap bmt-v24-board-wrap"><div class="bmt-v24-field-underlay"><svg class="bmt-v24-field-svg"><g class="bmt-v24-field-cells"><rect width="1" height="1"></rect></g></svg></div><div class="bmt-board" data-rows="8" data-cols="8"><button class="bmt-tile" data-index="0"><span class="bmt-piece-wrap"></span><span class="bmt-blocker"></span></button></div></div><section class="bmt-result-card is-win"><div class="bmt-result-stars" aria-label="1 из 3"><span class="is-on">★</span><span>★</span><span>★</span></div><img class="bmt-v23-win-art" src="/web/assets/biblical-match-three/completion-1-star-v40.webp" alt="1 из 3 звёзд"></section></section></main><script>window.__bmtV34LastLevelResult={levelId:1,runRating:3,originalRating:1,score:2276,startMoves:24,remainingMoves:16,continued:false};window.__bmtV31LastLevelResult=window.__bmtV34LastLevelResult;window.__qaMutations=0;new MutationObserver(r=>window.__qaMutations+=r.length).observe(document.body,{subtree:true,childList:true,attributes:true});setTimeout(()=>window.__qaTimerFired=true,500);</script><script src="/web/js/v29-biblical-treasures-hotfix.js?v=40"></script></body></html>`;
const mime={'.js':'text/javascript; charset=utf-8','.webp':'image/webp','.avif':'image/avif'};
const server=http.createServer((req,res)=>{const url=new URL(req.url||'/','http://local');if(url.pathname==='/__v35'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return;}const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(target).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();
try {
  await page.goto(`${base}/__v35`,{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>document.querySelector('.bmt-result-card')?.dataset.v34ResultSynced==='3',null,{timeout:5000});
  await page.waitForFunction(()=>window.__qaTimerFired===true,null,{timeout:2500});
  await page.waitForTimeout(150);
  const state=await page.evaluate(async()=>{
    const load=src=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve({w:img.naturalWidth,h:img.naturalHeight});img.onerror=()=>resolve({w:0,h:0});img.src=src;});
    const board=document.querySelector('.bmt-board-wrap');const shell=document.querySelector('.bmt-shell');const game=document.getElementById('game-container');const underlay=document.querySelector('.bmt-v24-field-cells rect');const card=document.querySelector('.bmt-result-card');const stars=card.querySelector('.bmt-result-stars');const art=card.querySelector('.bmt-v23-win-art');
    const image=await load('/web/assets/biblical-match-three/board-background-v35.webp?v=35');
    return {image,boardBg:getComputedStyle(board).backgroundImage,shellBg:getComputedStyle(shell).backgroundImage,gameBg:getComputedStyle(game).backgroundImage,cellFill:getComputedStyle(underlay).fill,rating:card.dataset.resultStars,synced:card.dataset.v34ResultSynced,aria:stars.getAttribute('aria-label'),on:stars.querySelectorAll('.is-on').length,art:art.getAttribute('src')||'',mutations:window.__qaMutations,timerFired:Boolean(window.__qaTimerFired)};
  });
  if(state.image.w!==1086||state.image.h!==1448)throw new Error(`V35 supplied background must keep native 1086x1448 resolution ${JSON.stringify(state.image)}`);
  if(!state.boardBg.includes('board-background-v35.webp')||state.shellBg.includes('board-background-v35.webp')||state.gameBg.includes('board-background-v35.webp'))throw new Error(`V35 background scope ${JSON.stringify({boardBg:state.boardBg,shellBg:state.shellBg,gameBg:state.gameBg})}`);
  if(state.cellFill==='rgb(255, 255, 255)')throw new Error(`V35 board underlay still hides artwork ${state.cellFill}`);
  if(state.rating!=='3'||state.synced!=='3'||state.aria!=='3 из 3'||state.on!==3||!state.art.includes('completion-3-stars-v40.webp')||!state.timerFired||state.mutations>50)throw new Error(`V40 completion freeze regression ${JSON.stringify(state)}`);
  console.log('OK: Biblical Treasures V40 keeps the supplied art only on the board and synchronizes the HQ win result without a MutationObserver freeze');
} finally {
  await page.close();await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
}
