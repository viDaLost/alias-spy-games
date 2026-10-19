import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium} from './lib/playwright-app-fixture.mjs';

const root=process.cwd();
const fixture='<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/web/styles/sabbath-access.css"><script src="/web/js/sabbath-clock.js" defer></script><script src="/web/js/sabbath-access.js" defer></script></head><body><main id="menu-container"><div id="system-actions"></div><button data-card-game="moses-nile">Нил</button></main><div id="game-container"></div></body></html>';
const server=http.createServer((request,response)=>{
  const url=new URL(request.url,'http://test.local');
  if(url.pathname==='/city-test.html'){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(fixture);return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404).end();return;}
  response.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'application/json; charset=utf-8'});response.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/Los_Angeles'});
  await context.addInitScript(()=>{
    const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-16T08:00:00Z']));}static now(){return +new OriginalDate('2026-10-16T08:00:00Z');}};
    window.locationAccesses=0;
    const forbidden=()=>{window.locationAccesses++;throw new Error('Location API accessed');};
    Object.defineProperty(navigator,'geolocation',{get:forbidden});Object.defineProperty(navigator,'permissions',{get:forbidden});
    window.Telegram={WebApp:{}};Object.defineProperty(Telegram.WebApp,'LocationManager',{get:forbidden});
  });
  const page=await context.newPage(),requests=[],crashes=[];
  page.on('request',request=>requests.push(request.url()));page.on('pageerror',error=>crashes.push(String(error)));
  await page.goto(base+'/city-test.html');await page.locator('#sabbath-city-card').click();
  await page.locator('.sabbath-privacy').waitFor({state:'visible'});
  assert.match(await page.locator('.sabbath-privacy').innerText(),/никуда не передаётся/);
  await page.locator('#sabbath-city').fill('Токио');await page.locator('.sabbath-city-form button').click();
  const tokyo=page.locator('.sabbath-city-result').filter({hasText:'Tokyo'}).first();await tokyo.waitFor({state:'visible',timeout:30000});await tokyo.click();
  assert.equal(await page.evaluate(()=>SabbathAccess.status().city.timeZone),'Asia/Tokyo');
  await page.reload();assert.equal(await page.evaluate(()=>SabbathAccess.status().city.timeZone),'Asia/Tokyo');
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});await page.locator('#sabbath-city-card').click();
    const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,form:document.querySelector('.sabbath-city-form').getBoundingClientRect().right,privacy:document.querySelector('.sabbath-privacy').textContent}));
    assert.ok(geometry.scroll<=geometry.width+1&&geometry.form<=geometry.width,'picker fits phone width '+width);
    assert.match(geometry.privacy,/только для вычисления захода солнца/);await page.locator('.sabbath-close').click();
  }
  assert.equal(await page.evaluate(()=>window.locationAccesses),0);assert.deepEqual(crashes,[]);
  const catalogs=requests.filter(url=>url.includes('sabbath-cities.json'));
  assert.equal(catalogs.length,1);assert.ok(catalogs.every(url=>url===base+'/web/data/sabbath-cities.json'));
  assert.ok(requests.every(url=>url.startsWith(base+'/')),'no external city, permission or location requests');
  await context.close();
  console.log('City picker browser: worldwide local search, privacy, no location API, persistence, selected time zone and 390/320px layouts passed.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
