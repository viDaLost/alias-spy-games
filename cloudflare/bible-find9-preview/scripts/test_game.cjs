const {chromium,webkit}=require('playwright');
const fs=require('fs');const path=require('path');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets-manifest.json')));
const assert=(v,m)=>{if(!v)throw Error(m)};
(async()=>{const engine=process.env.ENGINE==='webkit'?webkit:chromium;const browser=await engine.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:process.env.ENGINE==='webkit'?[]:['--no-sandbox']});
for(const width of [390,1180]){
 const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:width===390?3:1,hasTouch:width===390,isMobile:width===390});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8765');await page.waitForSelector('.loading',{state:'detached'});
 assert(await page.locator('#count').innerText()==='0/9','initial count');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
 const click=async([x,y])=>{await page.evaluate(({y})=>{const r=document.querySelector('#board').getBoundingClientRect();const py=r.y+y/1024*r.height;if(py<10||py>innerHeight-10)window.scrollBy(0,py-innerHeight/2)},{y});const box=await page.locator('#board').boundingBox();await (width===390?page.touchscreen.tap(box.x+x/1536*box.width,box.y+y/1024*box.height):page.mouse.click(box.x+x/1536*box.width,box.y+y/1024*box.height))};
 for(const p of manifest.misses)await click(p);
 assert(await page.locator('#count').innerText()==='0/9','miss counted');
 for(let i=0;i<9;i++){
  await click(manifest.targets[i].point);assert(await page.locator('#count').innerText()===`${i+1}/9`,'target '+manifest.targets[i].id);
  if(i===0){await click(manifest.targets[i].point);assert(await page.locator('#count').innerText()==='1/9','duplicate counted')}
 }
 await page.waitForSelector('#win.show');assert(await page.locator('.marker').count()===9,'markers');assert(await page.locator('.target.found').count()===9,'list');
 await page.locator('#again').click();assert(await page.locator('#count').innerText()==='0/9','replay');assert(await page.locator('.marker').count()===0,'reset markers');
 // Reset during delayed victory must cancel the modal.
 for(const p of manifest.targets)await click(p.point);
 await page.locator('#reset').click();await page.waitForTimeout(450);assert(await page.locator('#win.show').count()===0,'stale victory timeout');
 await page.locator('[data-zoom="3"]').click();
 await page.evaluate(()=>{const v=document.querySelector('#viewport');v.scrollLeft=0;v.scrollTop=0});
 await click(manifest.targets[0].point);assert(await page.locator('#count').innerText()==='1/9','zoom hit mapping');
 const box=await page.locator('#viewport').boundingBox();await page.mouse.move(box.x+50,box.y+60);await page.mouse.down();await page.mouse.move(box.x+150,box.y+100);await page.mouse.up();assert(await page.locator('#count').innerText()==='1/9','drag counted');
 await page.locator('[data-zoom="1"]').click();await page.locator('#reset').click();
 if(process.env.SCREENSHOT_DIR)await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/find9-${process.env.ENGINE||'chromium'}-${width}.png`,fullPage:true});
 assert(errors.length===0,errors.join('\n'));console.log(`PASS ${process.env.ENGINE||'chromium'} ${width}px: 9 hits, misses/holes, duplicate, victory/replay, reset race, zoom, drag, layout`);await page.close();
}await browser.close()})().catch(e=>{console.error(e);process.exit(1)});
