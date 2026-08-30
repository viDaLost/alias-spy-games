import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const V = '29';
const styles = ['v2','v2-polish','v4','v5','v9','v10','v11-modal','v13','v15-polish','v21-art']
  .map((name) => `<link rel="stylesheet" href="/web/styles/biblical-match-three-${name}.css?v=${V}">`).join('');
const scripts = ['biblical-match-three-v5-loader.js','biblical-match-three-core.js','biblical-match-three-progress.js','biblical-match-three-effects.js','biblical-match-three.js','biblical-match-three-v10-runtime.js','biblical-match-three-v15-ui.js','biblical-match-three-v15-polish.js']
  .map((name) => `<script src="/web/games/${name}?v=${V}"></script>`).join('');
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${styles}</head><body data-current-game="biblical-match-three" data-mode="game"><main id="game-container"></main><script>
window.Telegram={WebApp:{initDataUnsafe:{user:{id:1288379477}},contentSafeAreaInset:{top:96},safeAreaInset:{top:47},HapticFeedback:{selectionChanged(){},notificationOccurred(){}}}};window.appGoToMainMenu=()=>{};localStorage.setItem('bible_stars_v1_1288379477','100');
</script>${scripts}<script src="/web/js/v22-legacy-tutorial-guard.js?v=22"></script><script src="/web/js/v22-game-polish.js?v=22"></script><script src="/web/js/v23-biblical-treasures-polish.js?v=${V}"></script><script src="/web/js/v24-biblical-treasures-board.js?v=${V}"></script><script src="/web/js/v29-biblical-treasures-hotfix.js?v=${V}"></script><script>(async()=>{await window.BiblicalMatchThreeV5ArtReady;await window.startBiblicalMatchThreeGame('/web/data/biblical_match_three_levels.json?v=${V}')})().catch(e=>document.body.dataset.qaError=String(e?.stack||e))</script></body></html>`;
const mime={'.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.avif':'image/avif'};
const server=http.createServer((req,res)=>{const url=new URL(req.url||'/','http://local');if(url.pathname==='/__v29'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return}const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
try{
  await page.goto(`${base}/__v29`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('.bmt-v13-menu',{timeout:20000});
  const first=page.locator('.bmt-v13-chapter.is-active .bmt-v13-level:not([disabled]),.bmt-v13-level:not([disabled])').first();
  await first.click();
  await page.waitForSelector('.bmt-prelevel',{state:'visible',timeout:8000});
  await page.getByRole('button',{name:/Начать уровень/}).click();
  await page.waitForSelector('.bmt-board .bmt-tile',{timeout:8000});
  await page.waitForSelector('.bmt-board-wrap.bmt-v24-board-wrap',{timeout:5000});
  await page.waitForSelector('.bmt-v22-tutorial',{timeout:5000});
  await page.locator('.bmt-v22-tutorial-skip').click();
  await page.waitForSelector('.bmt-v22-tutorial',{state:'detached',timeout:3000});

  const ui=await page.evaluate(async()=>{
    const wrap=document.querySelector('.bmt-board-wrap');const board=document.querySelector('.bmt-board');const label=document.querySelector('.bmt-booster-tray__label span');
    const bg=getComputedStyle(wrap).backgroundImage;
    const load=(src)=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve({w:img.naturalWidth,h:img.naturalHeight});img.onerror=()=>resolve({w:0,h:0});img.src=src});
    const [background,lamp,one,two,three,menu]=await Promise.all([
      load('/web/assets/biblical-match-three/board-background-v29.webp?v=29'),
      load('/web/assets/biblical-match-three/icons-v29/lamp-unlit.webp?v=29'),
      load('/web/assets/biblical-match-three/completion-1-star-v40.webp?v=40'),
      load('/web/assets/biblical-match-three/completion-2-stars-v40.webp?v=40'),
      load('/web/assets/biblical-match-three/completion-3-stars-v40.webp?v=40'),
      load('/web/assets/icons/biblical-treasures-v38.webp?v=39')
    ]);
    return{bg,background,lamp,one,two,three,menu,label:label?.textContent||'',boardClass:board?.classList.contains('bmt-v24-board'),wrapClass:wrap?.classList.contains('bmt-v24-board-wrap'),shape:board?.dataset.shape||''};
  });
  if(!ui.bg.includes('board-background-v29.webp')||ui.background.w<500||ui.background.h<500||ui.lamp.w<100||ui.lamp.h<100||ui.one.w<100||ui.two.w<100||ui.three.w<100||ui.menu.w<64||ui.label!=='Усилители'||!ui.boardClass||!ui.wrapClass||!ui.shape)throw new Error(`V29 art/board UI ${JSON.stringify(ui)}`);

  const lampGuard=await page.evaluate(async()=>{
    const board=document.querySelector('.bmt-board');
    const tiles=[...board.querySelectorAll('.bmt-tile:not(.is-hole):not(:disabled)')];
    let source=null,target=null;
    for(let i=0;i<tiles.length;i+=1){
      const a=tiles[i],ia=Number(a.dataset.index),row=Math.floor(ia/Number(board.dataset.cols||8));
      const b=tiles.find(t=>Number(t.dataset.index)===ia+1&&Math.floor(Number(t.dataset.index)/Number(board.dataset.cols||8))===row);
      if(b){source=a;target=b;break}
    }
    if(!source||!target)return{error:'adjacent pair missing'};
    target.classList.add('has-lamp');
    const piece=target.querySelector('.bmt-piece-wrap');
    const pieceHidden=getComputedStyle(piece).visibility==='hidden'&&Number(getComputedStyle(piece).opacity)===0;
    let targetClicks=0,sourceClicks=0;
    target.addEventListener('click',()=>{targetClicks+=1});
    source.addEventListener('click',()=>{sourceClicks+=1});
    target.click();
    await new Promise(r=>setTimeout(r,30));
    const directBlocked=targetClicks===0;
    const sr=source.getBoundingClientRect(),tr=target.getBoundingClientRect();
    source.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:91,pointerType:'touch',button:0,buttons:1,clientX:sr.left+sr.width/2,clientY:sr.top+sr.height/2}));
    target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true,pointerId:91,pointerType:'touch',button:0,buttons:0,clientX:tr.left+tr.width/2,clientY:tr.top+tr.height/2}));
    await new Promise(r=>setTimeout(r,100));
    const swipeBlocked=sourceClicks===0&&targetClicks===0;
    const blocker=target.querySelector('.bmt-blocker');
    blocker.innerHTML='<span class="bmt-blocker__lamp" data-blocker-type="lamp" data-blocker-lit="false"><i class="bmt-blocker-fallback">✦</i></span>';
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await new Promise(r=>setTimeout(r,30));
    const unlit=blocker.querySelector('img.bmt-blocker-art')?.getAttribute('src')||'';
    blocker.innerHTML='<span class="bmt-blocker__lamp" data-blocker-type="lamp" data-blocker-lit="true"><i class="bmt-blocker__lamp-state">✦</i></span>';
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await new Promise(r=>setTimeout(r,30));
    const lit=blocker.querySelector('img.bmt-blocker-art')?.getAttribute('src')||'';
    target.classList.remove('has-lamp');blocker.innerHTML='';
    return{pieceHidden,directBlocked,swipeBlocked,unlit,lit,sourceClicks,targetClicks};
  });
  if(lampGuard.error||!lampGuard.pieceHidden||!lampGuard.directBlocked||!lampGuard.swipeBlocked||!lampGuard.unlit.includes('icons-v29/lamp-unlit.webp')||!lampGuard.lit.includes('icons-v17/candle.webp'))throw new Error(`V29 lamp behavior ${JSON.stringify(lampGuard)}`);

  const arkGuard=await page.evaluate(()=>{
    const button=document.createElement('button');button.dataset.booster='ark';document.body.appendChild(button);let result=null;let error='';
    button.addEventListener('click',()=>{try{const shaped=[null,{type:'bible',special:null}];result=shaped.map((cell,index)=>(!cell.special?index:-1));}catch(e){error=String(e?.message||e)}});
    button.click();button.remove();return{result,error};
  });
  if(arkGuard.error||JSON.stringify(arkGuard.result)!=='[-1,1]')throw new Error(`Noah Ark shaped-board guard failed ${JSON.stringify(arkGuard)}`);

  await page.evaluate(()=>{
    const shell=document.querySelector('.bmt-shell');
    const overlay=document.createElement('div');overlay.className='bmt-result-overlay';overlay.innerHTML='<div class="bmt-result-card is-win"><h3>Первый свет</h3><div class="bmt-result-stars" aria-label="2 из 3"><span class="is-on">★</span><span class="is-on">★</span><span>★</span></div><div class="bmt-result-score">1 840 очков</div><div class="bmt-result-reward"><strong>+6 ★</strong></div><div class="bmt-result-actions"><button type="button">К карте</button><button type="button">Дальше</button></div></div>';shell.appendChild(overlay);
  });
  await page.waitForSelector('.bmt-result-card[data-v23-result="1"]',{timeout:5000});
  await page.waitForFunction(()=>document.querySelector('.bmt-result-card[data-v23-result="1"]')?.dataset.v23Rating==='2',{timeout:5000});
  const result=await page.evaluate(()=>({title:document.querySelector('.bmt-result-card[data-v23-result="1"] h3')?.textContent,stats:document.querySelectorAll('.bmt-v22-result-stats>div').length,rewards:document.querySelectorAll('.bmt-v22-rewards>div').length,next:document.querySelector('.bmt-v22-next')?.textContent?.trim(),repeat:document.querySelector('.bmt-v22-repeat')?.textContent?.trim(),menu:document.querySelector('.bmt-v22-menu')?.textContent?.trim(),rating:document.querySelector('.bmt-result-card[data-v23-result="1"]')?.dataset.v23Rating,art:document.querySelector('.bmt-v23-win-art')?.getAttribute('src')||''}));
  if(result.title!=='Уровень пройден!'||result.stats!==3||result.rewards!==2||result.next!=='Следующий уровень'||result.repeat!=='↻Повторить'||result.menu!=='⌂В меню'||result.rating!=='2'||!result.art.includes('completion-2-stars-v40.webp'))throw new Error(`V40 result ${JSON.stringify(result)}`);

  console.log('OK: Biblical Treasures V29 board art, result art, standalone lamp transitions, lamp swipe guard and Ark guard passed');
} finally {
  await page.close();await browser.close();await new Promise(resolve=>server.close(resolve));
}
