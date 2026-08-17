import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const V = '22';
const styles = ['v2','v2-polish','v4','v5','v9','v10','v11-modal','v13','v15-polish','v21-art']
  .map((name) => `<link rel="stylesheet" href="/web/styles/biblical-match-three-${name}.css?v=${V}">`).join('');
const scripts = ['biblical-match-three-v5-loader.js','biblical-match-three-core.js','biblical-match-three-progress.js','biblical-match-three-effects.js','biblical-match-three.js','biblical-match-three-v10-runtime.js','biblical-match-three-v15-ui.js','biblical-match-three-v15-polish.js']
  .map((name) => `<script src="/web/games/${name}?v=${V}"></script>`).join('');
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${styles}</head><body data-current-game="biblical-match-three" data-mode="game"><main id="game-container"></main><script>
window.Telegram={WebApp:{initDataUnsafe:{user:{id:1288379477}},contentSafeAreaInset:{top:96},safeAreaInset:{top:47},HapticFeedback:{selectionChanged(){},notificationOccurred(){}}}};window.appGoToMainMenu=()=>{};localStorage.setItem('bible_stars_v1_1288379477','100');
</script>${scripts}<script src="/web/js/v22-legacy-tutorial-guard.js?v=${V}"></script><script src="/web/js/v22-game-polish.js?v=${V}"></script><script>(async()=>{await window.BiblicalMatchThreeV5ArtReady;await window.startBiblicalMatchThreeGame('/web/data/biblical_match_three_levels.json?v=${V}')})().catch(e=>document.body.dataset.qaError=String(e?.stack||e))</script></body></html>`;
const mime={'.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const url=new URL(req.url||'/','http://local');if(url.pathname==='/__v22'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);return}const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
try{
  await page.goto(`${base}/__v22`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('.bmt-v13-menu',{timeout:20000});
  const first=page.locator('.bmt-v13-chapter.is-active .bmt-v13-level:not([disabled]),.bmt-v13-level:not([disabled])').first();
  await first.click();
  await page.waitForSelector('.bmt-prelevel',{state:'visible',timeout:8000});
  await page.getByRole('button',{name:/Начать уровень/}).click();
  await page.waitForSelector('.bmt-board .bmt-tile',{timeout:8000});
  await page.waitForSelector('.bmt-v22-tutorial',{timeout:5000});

  const firstStep=await page.evaluate(()=>({title:document.querySelector('.bmt-v22-tutorial-card h3')?.textContent,progress:document.querySelectorAll('.bmt-v22-tutorial-progress span').length,focus:document.querySelector('.bmt-board')?.classList.contains('is-v22-tutorial-focus'),label:document.querySelector('.bmt-v22-focus-label')?.textContent}));
  if(firstStep.title!=='Сделайте свайп'||firstStep.progress!==5||!firstStep.focus||!/Свайпните/.test(firstStep.label||''))throw new Error(`tutorial first step ${JSON.stringify(firstStep)}`);

  await page.locator('.bmt-v22-tutorial-next').click();
  await page.waitForTimeout(100);
  if(!await page.locator('.bmt-goals-v2.is-v22-tutorial-focus').count())throw new Error('tutorial goals are not visibly highlighted');
  await page.locator('.bmt-v22-tutorial-next').click();
  await page.waitForTimeout(100);
  if(!await page.locator('.bmt-board.is-v22-boundary-demo').count())throw new Error('tutorial board boundary is not visibly highlighted');
  await page.locator('.bmt-v22-tutorial-next').click();
  await page.waitForTimeout(100);
  const obstacleDemo=await page.locator('.bmt-v22-tutorial-obstacles img').count();
  if(obstacleDemo!==3)throw new Error(`tutorial obstacle demo count ${obstacleDemo}`);
  await page.locator('.bmt-v22-tutorial-next').click();
  await page.waitForTimeout(100);
  if(!await page.locator('.bmt-booster-tray.is-v22-tutorial-focus').count())throw new Error('tutorial boosters are not visibly highlighted');
  await page.locator('.bmt-v22-tutorial-next').click();
  await page.waitForSelector('.bmt-v22-tutorial',{state:'detached',timeout:3000});

  const ui=await page.evaluate(async()=>{
    const wrap=document.querySelector('.bmt-board-wrap');const board=document.querySelector('.bmt-board');const label=document.querySelector('.bmt-booster-tray__label span');
    const bg=getComputedStyle(wrap).backgroundImage;
    const image=await new Promise(resolve=>{const img=new Image();img.onload=()=>resolve({w:img.naturalWidth,h:img.naturalHeight});img.onerror=()=>resolve({w:0,h:0});img.src='/web/assets/biblical-match-three/board-background-v22.webp?v=22'});
    return{bg,image,label:label?.textContent||'',boardClass:board?.classList.contains('bmt-v22-board'),wrapClass:wrap?.classList.contains('bmt-v22-board-wrap'),shape:board?.dataset.shape||''};
  });
  if(!ui.bg.includes('board-background-v22.webp')||ui.image.w<200||ui.image.h<250||ui.label!=='Усилители'||!ui.boardClass||!ui.wrapClass||!ui.shape)throw new Error(`V22 board UI ${JSON.stringify(ui)}`);

  await page.evaluate(()=>{
    const shell=document.querySelector('.bmt-shell');
    const overlay=document.createElement('div');overlay.className='bmt-result-overlay';overlay.innerHTML='<div class="bmt-result-card is-win"><h3>Первый свет</h3><div class="bmt-result-stars"><span class="is-on">★</span><span class="is-on">★</span><span>★</span></div><div class="bmt-result-score">1 840 очков</div><div class="bmt-result-reward"><strong>+6 ★</strong></div><div class="bmt-result-actions"><button type="button">К карте</button><button type="button">Дальше</button></div></div>';shell.appendChild(overlay);
  });
  await page.waitForSelector('.bmt-result-card[data-v22-result="1"]',{timeout:3000});
  const result=await page.evaluate(()=>({title:document.querySelector('.bmt-result-card[data-v22-result="1"] h3')?.textContent,stats:document.querySelectorAll('.bmt-v22-result-stats>div').length,rewards:document.querySelectorAll('.bmt-v22-rewards>div').length,next:document.querySelector('.bmt-v22-next')?.textContent?.trim(),repeat:document.querySelector('.bmt-v22-repeat')?.textContent?.trim(),menu:document.querySelector('.bmt-v22-menu')?.textContent?.trim()}));
  if(result.title!=='Уровень пройден!'||result.stats!==3||result.rewards!==2||result.next!=='Следующий уровень'||result.repeat!=='↻Повторить'||result.menu!=='⌂В меню')throw new Error(`V22 result ${JSON.stringify(result)}`);

  console.log('OK: Biblical Treasures V22 background, shaped border, Усилители, guided tutorial and completion result passed');
} finally {
  await page.close();await browser.close();await new Promise(resolve=>server.close(resolve));
}
