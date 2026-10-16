import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {serveSabbathTestAsset} from './lib/sabbath-test-assets.mjs';
const require=createRequire(import.meta.url);
const Clock=require('../web/js/sabbath-clock.js');
const clockSource=fs.readFileSync('web/js/sabbath-clock.js','utf8');
const accessSource=fs.readFileSync('web/js/sabbath-access.js','utf8');
const appSource=fs.readFileSync('web/js/app.js','utf8');
const KEY='sabbath-selected-city-v1';
let assertions=0;
function ok(value,message){assert.ok(value,message);assertions++;}
const cities=[
  ['Europe/Moscow',55.7558,37.6173],['Asia/Jerusalem',31.7683,35.2137],
  ['America/New_York',40.7128,-74.006],['Pacific/Kiritimati',1.8721,-157.4278],
  ['Pacific/Pago_Pago',-14.2756,-170.702],['Australia/Sydney',-33.8688,151.2093],
  ['UTC',0,0],['Pacific/Auckland',-36.8485,174.7633],['Asia/Tokyo',35.6762,139.6503],
];
for(const [tz,latitude,longitude] of cities){
  process.env.TZ=tz;const place={latitude,longitude};
  for(const date of ['2026-01-02','2026-03-06','2026-03-27','2026-10-16','2026-10-30','2026-12-25','2027-01-01','2028-03-03']){
    const friday=new Date(`${date}T12:00:00`);const start=Clock.sunset(friday,latitude,longitude);
    ok(Number.isFinite(start),`${tz} ${date} sunset exists`);
    ok(new Date(start).getDay()===5,`${tz} sunset belongs to local Friday`);
    ok(Clock.state(start-1,place).allowed,`${tz} open until sunset`);
    ok(!Clock.state(start,place).allowed,`${tz} closes at sunset`);
    ok(!Clock.state(start+Clock.dayMs-1,place).allowed,`${tz} closed until 24 hours`);
    ok(Clock.state(start+Clock.dayMs,place).allowed,`${tz} opens exactly after 24 hours`);
    const saturday=new Date(friday);saturday.setDate(saturday.getDate()+1);saturday.setHours(1);
    ok(!Clock.state(+saturday,place).allowed,`${tz} Saturday morning still closed`);
    const sunday=new Date(friday);sunday.setDate(sunday.getDate()+2);
    ok(Clock.state(+sunday,place).allowed,`${tz} Sunday open`);
  }
}
process.env.TZ='UTC';
ok(Clock.validCoordinates({latitude:0,longitude:0}),'zero coordinates are valid');
for(const place of [null,{}, {latitude:NaN,longitude:10},{latitude:91,longitude:10},{latitude:10,longitude:181},{latitude:'10',longitude:10}]){
  ok(!Clock.validCoordinates(place),'invalid coordinates rejected');
  ok(!Clock.state(+new Date('2026-10-16T12:00Z'),place).allowed,'Friday requires real coordinates');
  ok(Clock.state(+new Date('2026-10-15T12:00Z'),place).allowed,'Thursday does not block without coordinates');
}
ok(Clock.sunset(new Date('2026-06-19T12:00Z'),78.2232,15.6469)===null,'polar day has no fictional sunset');
ok(Clock.state(+new Date('2026-06-19T12:00Z'),{latitude:78.2232,longitude:15.6469}).reason==='polar','polar case is explicit');
// External reference: SunCalc 1.9 published test fixture, 2013-03-05, 50.5N 30.5E,
// sunset 15:46:57 UTC. The refined Meeus series must agree within two minutes.
const fixture=Clock.sunset(new Date('2013-03-05T12:00Z'),50.5,30.5);
ok(Math.abs(fixture-Date.parse('2013-03-05T15:46:57Z'))<120000,'sunset agrees with published independent fixture');

// The selected city's calendar must be independent of device/VPN time zones.
for(const [timeZone,latitude,longitude] of [...cities,['Europe/Berlin',52.5244,13.4105],['Europe/Kiev',50.4547,30.5238]]) {
  const place={name:'Test city',latitude,longitude,timeZone};
  for(const iso of ['2026-03-27T12:00Z','2026-10-16T12:00Z','2026-10-23T12:00Z','2026-10-30T12:00Z']) {
    process.env.TZ=timeZone;
    const base=Clock.state(Date.parse(iso),place);
    const fridayNoon=new Date(iso.slice(0,10)+'T12:00:00');
    for(const deviceZone of ['UTC','Asia/Tokyo','America/Los_Angeles']) {
      process.env.TZ=deviceZone;
      const actual=Clock.state(Date.parse(iso),place);
      ok(actual.start===base.start&&actual.end===base.end&&actual.allowed===base.allowed,'selected city ignores device zone: '+timeZone+' / '+deviceZone);
      const start=Clock.sunset(fridayNoon,latitude,longitude,timeZone);
      ok(Clock.state(start-1,place).allowed&&!Clock.state(start,place).allowed,'selected-city sunset boundary');
      ok(!Clock.state(start+Clock.dayMs-1,place).allowed&&Clock.state(start+Clock.dayMs,place).allowed,'selected-city exact 24h boundary');
    }
  }
}
process.env.TZ='UTC';
const catalog=JSON.parse(fs.readFileSync('web/data/sabbath-cities.json','utf8'));
ok(catalog.cities.length>170000&&catalog.zones.length>350,'worldwide city catalog includes small towns and global time zones');
const rowCity=row=>({name:row[0],country:row[2],latitude:row[3],longitude:row[4],timeZone:catalog.zones[row[5]]});
for(const name of ['париж','токио','ессентуки','берлин','москва','киев'])ok(catalog.cities.some(row=>row[1].includes(name)),'world catalog supports local name: '+name);
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
async function page({now='2026-10-16T18:00:00Z',city,legacy=false,fetchImpl,url='https://vidalost.github.io/alias-spy-games/',loadApp=false}={}) {
  const dom=new JSDOM('<!doctype html><html lang="ru"><body><main id="menu-container"><section><div id="system-actions"></div></section></main><div id="game-container"></div></body></html>',{url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;let time=Date.parse(now),locationCalls=0;const RealDate=w.Date;
  w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}};
  const scheduled=new Map();let id=0;w.setTimeout=(fn,delay)=>{scheduled.set(++id,{fn,delay});return id;};w.clearTimeout=key=>scheduled.delete(key);
  w.scrollTo=()=>{};w.alert=()=>{};
  const requests=[];
  w.fetch=async(url,options)=>{requests.push({url:String(url),options});return fetchImpl?fetchImpl(url,options):{ok:true,json:async()=>catalog};};
  const forbidden=()=>{locationCalls++;throw new Error('Device location must never be accessed');};
  Object.defineProperty(w.navigator,'geolocation',{get:forbidden});Object.defineProperty(w.navigator,'permissions',{get:forbidden});
  w.Telegram={WebApp:{}};Object.defineProperty(w.Telegram.WebApp,'LocationManager',{get:forbidden});
  if(city!==undefined)w.localStorage.setItem(KEY,JSON.stringify(city));
  if(legacy)w.localStorage.setItem('sabbath-device-location-v1',JSON.stringify({latitude:0,longitude:0,source:'gps'}));
  if(loadApp)w.eval(appSource.replace('document.addEventListener("DOMContentLoaded", initializeApp);','').replace('  initializeApp();',''));
  w.eval(clockSource);w.eval(accessSource);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await flush();
  return {w,dom,scheduled,requests,setTime:value=>{time=typeof value==='number'?value:Date.parse(value);},close:()=>{ok(locationCalls===0,'zero browser/Telegram geolocation or permission API accesses');dom.window.close();}};
}
async function search(p,query) {
  p.w.SabbathAccess.openCityPicker();const form=p.w.document.querySelector('.sabbath-city-form');
  form.querySelector('input').value=query;form.dispatchEvent(new p.w.Event('submit',{cancelable:true}));await flush();
  return [...p.w.document.querySelectorAll('.sabbath-city-result')];
}
{
  const p=await page({loadApp:true,legacy:true});
  ok(p.w.SabbathAccess.status().city.timeZone==='Europe/Moscow','Moscow is the default without any setup');
  ok(!p.w.localStorage.getItem('sabbath-device-location-v1'),'legacy device coordinates deleted');
  for(const game of Clock.GAME_IDS){ok(!p.w.SabbathAccess.authorize(game),`${game} blocked`);if(game!=='biblical-match-three')p.w.showGame(game);ok(!p.w.document.querySelector('iframe'),`${game} does not launch behind dialog`);}
  ok(p.w.document.getElementById('sabbath-dialog').textContent.includes('24 часа'),'pause explains exact duration');
  for(const game of ['alias','spy','quartet','kingdoms','bible-geography'])ok(p.w.SabbathAccess.authorize(game),`${game} unaffected`);
  p.setTime(p.w.SabbathAccess.status().end);p.w.SabbathAccess.refresh();
  ok(p.w.SabbathAccess.authorize('kids-ark-pairs'),'unlocks after 24h without coordinates or permission');
  ok(p.requests.length===0,'startup, boundaries and game entry do not send city or location data');p.close();
}
{
  const p=await page({now:'2026-10-16T08:00Z'});
  p.w.document.getElementById('sabbath-city-card').click();
  ok(p.w.document.querySelector('.sabbath-privacy').textContent.includes('никуда не передаётся'),'privacy notice states local storage and sunset-only purpose');
  const choices=[...p.w.document.querySelectorAll('[data-city]')];
  ok(choices.map(x=>x.textContent).join(',')==='Москва,Берлин,Киев','three fast city choices');
  choices[1].click();const saved=JSON.parse(p.w.localStorage.getItem(KEY));
  ok(saved.timeZone==='Europe/Berlin'&&p.requests.length===0,'preset selection is offline and saved locally');
  const next=await page({city:saved});ok(next.w.SabbathAccess.status().city.timeZone==='Europe/Berlin','city preference survives reopening');next.close();p.close();
}
{
  const p=await page({now:'2026-10-16T08:00Z'});
  const results=await search(p,'Париж');ok(results.some(x=>x.textContent.includes('Paris')),'global search accepts Cyrillic city names');
  ok(p.requests.length===1&&p.requests[0].url==='https://vidalost.github.io/alias-spy-games/web/data/sabbath-cities.json','search fetches only the same static catalog, with no query parameters');
  ok(p.requests[0].options.credentials==='omit'&&p.requests[0].options.referrerPolicy==='no-referrer','catalog request omits credentials and referrer');
  results.find(x=>x.textContent.includes('Paris')).click();
  ok(p.w.SabbathAccess.status().city.timeZone==='Europe/Paris','selected global city uses its own IANA zone');
  const tokyo=await search(p,'Токио');ok(tokyo.some(x=>x.textContent.includes('Tokyo')),'global search covers Asia');
  ok(p.requests.length===1,'subsequent queries stay entirely on device');
  const small=await search(p,'Ессентук');ok(small.length>0,'global search covers regional towns');p.close();
}
{
  let reply;const p=await page({fetchImpl:()=>new Promise(resolve=>{reply=resolve;})});
  const pending=search(p,'Paris');await flush();p.w.document.querySelector('.sabbath-close').click();
  reply({ok:true,json:async()=>catalog});await pending;
  ok(!p.w.document.getElementById('sabbath-dialog'),'late catalog load cannot reopen a closed picker');p.close();
}
{
  const p=await page({fetchImpl:async()=>{throw new Error('offline');}});
  await search(p,'Paris');ok(p.w.document.querySelector('.sabbath-city-results').textContent.includes('Повторите поиск'),'catalog failure is recoverable');
  p.w.document.querySelector('[data-city="Берлин"]').click();ok(p.w.SabbathAccess.status().city.name==='Берлин','presets remain available offline');p.close();
}
{
  const p=await page({city:{name:'Bad',latitude:99,longitude:0,timeZone:'bad'}});ok(p.w.SabbathAccess.status().city.name==='Москва','invalid saved city safely defaults to Moscow');p.close();
}
{
  const start=Clock.sunset(new Date('2026-10-16T12:00Z'),55.7558,37.6173,'Europe/Moscow');let cleans=0;
  const p=await page({now:new Date(start-1000).toISOString(),loadApp:true});
  p.w.startKidsArkPairsGame=()=>{p.w.document.getElementById('game-container').textContent='playing';};p.w.__kidsArkPairsCleanup=()=>cleans++;
  p.w.showGame('kids-ark-pairs');ok(p.w.document.body.dataset.currentGame==='kids-ark-pairs','before sunset game opens');
  p.setTime(start);p.w.SabbathAccess.refresh();ok(cleans===1&&!p.w.document.body.dataset.currentGame,'running game cleaned at sunset');
  ok(p.w.document.getElementById('game-container').textContent==='','game removed, progress storage retained');p.close();
}
{
  const start=Clock.sunset(new Date('2026-10-16T12:00Z'),55.7558,37.6173,'Europe/Moscow');
  const p=await page({now:new Date(start-1000).toISOString(),loadApp:true});let started=0;
  p.w.startTwelveTribesGame=()=>started++;p.w.requestAnimationFrame=fn=>fn();
  p.w.showGame('twelve-tribes');const script=p.w.document.querySelector('script[data-game-script]');
  p.setTime(start);p.w.SabbathAccess.refresh();script.onload();
  ok(started===0,'late script callback cannot resurrect blocked game');p.close();
}
{
  const start=Clock.sunset(new Date('2026-10-16T12:00Z'),55.7558,37.6173,'Europe/Moscow');
  const p=await page({now:new Date(start-1000).toISOString(),loadApp:true});let resolveArt,starts=0;
  p.w.BiblicalMatchThreeV5ArtReady=new Promise(resolve=>{resolveArt=resolve;});
  for(const marker of ['BiblicalMatchThreeCore','__bmtV45SpecialSwipeInstalled','BiblicalMatchThreeProgress','BiblicalMatchThreeEffects','__bmtV10RuntimeInstalled','__bmtV15UiInstalled','__bmtV15PolishInstalled'])p.w[marker]={};
  p.w.startBiblicalMatchThreeGame=()=>{starts++;};
  p.w.eval(fs.readFileSync('web/js/biblical-match-three-launcher.js','utf8'));
  const launch=p.w.openBiblicalMatchThree();p.setTime(start);p.w.SabbathAccess.refresh();
  resolveArt({symbols:{bible:1,ark:1},boosters:{covenant:1},obstacles:{vine:1},relics:{covenantArk:1},kind:'file-webp-v17',transport:'file'});
  await launch;ok(starts===0,'BMT delayed art cannot start after boundary cancellation');p.close();
}
{
  const p=await page();p.w.requestAnimationFrame=fn=>fn();
  const root=p.w.document.createElement('div');root.id='kids-games';p.w.document.body.append(root);
  p.w.eval(fs.readFileSync('web/js/biblical-match-three-launcher.js','utf8'));await flush();
  const card=p.w.document.getElementById('biblical-match-three-card');card.click();await flush();
  ok(!card.dataset.opening&&!card.hasAttribute('aria-busy'),'denied BMT card remains usable after unlock');p.close();
}
{
  const p=await page({now:'2026-10-15T12:00Z'});let resolveFetch;
  p.w.BiblicalMatchThreeCore={};p.w.BiblicalMatchThreeProgress={load:()=>({})};
  p.w.fetch=()=>new Promise(resolve=>{resolveFetch=resolve;});
  p.w.eval(fs.readFileSync('web/games/biblical-match-three.js','utf8'));
  const launch=p.w.startBiblicalMatchThreeGame('levels.json');p.w.__biblicalMatchThreeCleanup();
  p.w.document.getElementById('game-container').textContent='locked';
  resolveFetch({ok:true,json:async()=>({levels:[{id:1}]})});await launch;
  ok(p.w.document.getElementById('game-container').textContent==='locked','late BMT level fetch leaves lock screen intact');p.close();
}
{
  const p=await page({now:'2026-10-15T12:00Z'});
  p.w.eval(fs.readFileSync('web/games/twelve-tribes.js','utf8'));p.w.startTwelveTribesGame();await flush();
  const part=p.w.document.querySelector('script[data-tt]');p.w.__twelveTribesCleanup();
  p.w.document.getElementById('game-container').textContent='locked';part.onerror();await flush();
  ok(p.w.document.getElementById('game-container').textContent==='locked','late Twelve Tribes dependency error leaves lock screen intact');p.close();
}
{
  const p=await page();let started=false;
  const waiting=p.w.SabbathAccess.waitForAccess('moses-nile').then(()=>{started=true;});await flush();ok(!started,'standalone game waits for access');
  p.setTime(p.w.SabbathAccess.status().end);p.w.SabbathAccess.refresh();await waiting;ok(started,'standalone automatically unlocks without permissions');p.close();
}
{
  const p=await page({now:'2026-10-16T08:00Z'});await p.w.SabbathAccess.waitForAccess('promised-land');
  ok(p.requests.length===0&&!p.w.document.querySelector('#sabbath-dialog'),'standalone entry needs no network or location prompt');p.close();
}
{
  const p=await page({now:'2026-10-14T23:00Z',loadApp:true,city:Clock.CITIES[1]});
  p.w.showGame('moses-nile');const frame=p.w.document.querySelector('iframe');let reply;frame.contentWindow.postMessage=data=>{reply=data;};
  p.w.dispatchEvent(new p.w.MessageEvent('message',{source:frame.contentWindow,origin:p.w.location.origin,data:{type:'sabbath:request',game:'moses-nile'}}));
  ok(reply?.allowed&&reply.city.timeZone==='Europe/Berlin'&&reply.nextChange===p.w.SabbathAccess.status().start,'embedded game receives selected city and actual Friday boundary');
  reply=undefined;p.w.dispatchEvent(new p.w.MessageEvent('message',{source:p.w,origin:'https://untrusted.invalid',data:{type:'sabbath:request',game:'moses-nile'}}));ok(!reply,'untrusted frames cannot use the city bridge');p.close();
}
for(const url of ['/js/sabbath-clock.js','/js/sabbath-access.js','/styles/sabbath-access.css']) {
  let body,status;ok(serveSabbathTestAsset({url},{writeHead:value=>{status=value;},end:value=>{body=value;}}),'isolated Nile fixture serves shared policy');ok(status===200&&body.length>0,'fixture gets actual policy source');
}
const android=fs.readFileSync('android-app/app/src/main/java/com/vidalost/biblegames/AndroidParityApp.kt','utf8');
const manifest=fs.readFileSync('android-app/app/src/main/AndroidManifest.xml','utf8');
ok(!/ACCESS_(?:FINE|COARSE)_LOCATION|onGeolocationPermissions|setGeolocationEnabled|requestLocation|locationLauncher/.test(android+manifest),'Android location permissions and request plumbing removed');
ok(!/navigator\.(?:geolocation|permissions)|LocationManager|open-meteo|requestPermission/.test(accessSource),'controller has no location API or external geocoder');
console.log(`Sabbath city access: ${assertions} assertions passed (worldwide offline search, zero location permissions, privacy, selected time zones, exact 24h and game cleanup).`);
