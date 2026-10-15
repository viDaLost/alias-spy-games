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
const KEY='sabbath-device-location-v1';
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

const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
async function page({now='2026-10-16T18:00:00Z',place={latitude:31.7683,longitude:35.2137},source='gps',age=0,telegram,geo,permission=geo?'granted':'denied',referrer,url='https://vidalost.github.io/alias-spy-games/',loadApp=false}={}){
  const dom=new JSDOM('<!doctype html><html lang="ru"><body><main id="menu-container"><section><div id="system-actions"></div></section></main><div id="game-container"></div></body></html>',{url,referrer,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;let time=Date.parse(now);const RealDate=w.Date;
  w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}};
  const scheduled=new Map();let id=0;w.setTimeout=(fn,delay)=>{scheduled.set(++id,{fn,delay});return id;};w.clearTimeout=key=>scheduled.delete(key);
  w.scrollTo=()=>{};w.alert=()=>{};w.fetch=async()=>({ok:true,json:async()=>({success:true})});
  Object.defineProperty(w.navigator,'permissions',{value:{query:async()=>({state:permission})}});
  if(geo)Object.defineProperty(w.navigator,'geolocation',{value:{getCurrentPosition:geo}});
  if(telegram)w.Telegram={WebApp:{LocationManager:telegram}};
  if(place)w.localStorage.setItem(KEY,JSON.stringify({...place,savedAt:time-age,zone:'UTC',source,label:'Мой город'}));
  if(loadApp){w.eval(appSource.replace('document.addEventListener("DOMContentLoaded", initializeApp);','').replace('  initializeApp();',''));}
  w.eval(clockSource);w.eval(accessSource);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await flush();
  return {w,dom,scheduled,setTime:value=>{time=typeof value==='number'?value:Date.parse(value);},close:()=>dom.window.close()};
}
{
  const p=await page({loadApp:true,geo:success=>success({coords:{latitude:31.7683,longitude:35.2137}})});
  for(const game of Clock.GAME_IDS){ok(!p.w.SabbathAccess.authorize(game),`${game} blocked`);if(game!=='biblical-match-three')p.w.showGame(game);
    ok(!p.w.document.querySelector('#game-container iframe'),`${game} does not launch behind dialog`);}
  ok(p.w.document.getElementById('sabbath-dialog').textContent.includes('24 часа'),'lock explains exact duration');
  for(const game of ['alias','spy','quartet','kingdoms','bible-geography'])ok(p.w.SabbathAccess.authorize(game),`${game} unaffected`);
  const end=p.w.SabbathAccess.status().end;p.setTime(end);p.w.SabbathAccess.refresh();await flush();
  ok(p.w.SabbathAccess.authorize('kids-ark-pairs'),'automatic GPS refresh and unlock after 24h');
  ok(!p.w.document.getElementById('sabbath-dialog'),'expired pause dialog closes automatically');p.close();
}
{
  const p=await page({place:null});ok(p.w.SabbathAccess.status().reason==='location','no IP fallback on denied location');
  ok(!p.w.SabbathAccess.authorize('twelve-tribes'),'unknown Friday location gates affected game');
  await flush();
  ok(!p.w.document.querySelector('#sabbath-settings-card,#sabbath-dialog input,#sabbath-dialog select,#sabbath-dialog form'),'no sunset settings, city selection or editable controls');
  ok(!('openSettings' in p.w.SabbathAccess)&&!('locate' in p.w.SabbathAccess),'no public settings or location setter');p.close();
}
{
  let requests=0;
  const p=await page({now:'2026-10-16T08:00Z',place:null,permission:'prompt',geo:success=>{requests++;success({coords:{latitude:0,longitude:0}});}});
  ok(requests===0,'startup does not prompt without a protected game entry');
  p.w.SabbathAccess.authorize('kids-ark-pairs');await flush();
  const saved=JSON.parse(p.w.localStorage.getItem(KEY));ok(saved.latitude===0&&saved.longitude===0,'browser GPS used, including origin coordinates');
  ok(requests===1,'protected entry automatically requests device geolocation');p.close();
}
{
  const p=await page({source:'city'});
  ok(p.w.SabbathAccess.status().reason==='location','previously selected city cannot control automatic schedule');
  ok(p.w.localStorage.getItem(KEY)===null,'legacy manual location removed');p.close();
}
{
  let reply,starts=0,requests=0;
  const p=await page({now:'2026-10-16T08:00Z',place:null,permission:'prompt',geo:success=>{requests++;reply=success;}});
  p.w.showGame=game=>{ok(game==='kids-ark-pairs','resumes selected game');starts++;};
  ok(!p.w.SabbathAccess.authorize('kids-ark-pairs'),'Friday entry waits automatically for GPS');await flush();
  ok(starts===0&&requests===1,'game does not start before location check');
  reply({coords:{latitude:31.7683,longitude:35.2137}});await flush();
  ok(starts===1&&!p.w.document.getElementById('sabbath-dialog'),'GPS success opens game once without a continue button');
  p.w.SabbathAccess.refresh();await flush();ok(starts===1,'refresh does not relaunch game');p.close();
}
for(const cancel of ['close','other-game']){
  let reply,starts=0;
  const p=await page({now:'2026-10-16T08:00Z',place:null,permission:'prompt',geo:success=>{reply=success;}});
  p.w.showGame=()=>{starts++;};
  p.w.SabbathAccess.authorize('kids-ark-pairs');await flush();
  if(cancel==='close')p.w.document.querySelector('.sabbath-close').click();else p.w.SabbathAccess.authorize('alias');
  reply({coords:{latitude:31.7683,longitude:35.2137}});await flush();
  ok(starts===0,'late GPS cannot reopen a cancelled entry: '+cancel);p.close();
}
{
  let requested=0,fetches=0;
  const p=await page({place:null,permission:'prompt',geo:(_success,error)=>{requested++;error({code:1});}});
  p.w.fetch=()=>{fetches++;throw new Error('unexpected location service');};
  ok(p.w.SabbathAccess.authorize('alias'),'unrelated game stays available');await flush();
  ok(requested===0,'unrelated game never requests geolocation permission');
  p.w.SabbathAccess.authorize('moses-nile');await flush();
  ok(requested===1&&fetches===0&&p.w.SabbathAccess.status().reason==='location','denied GPS never falls back to VPN IP or city search');
  ok(!p.w.document.querySelector('#sabbath-dialog form,#sabbath-dialog input'),'denial cannot expose manual location controls');p.close();
}
{
  let requested=0;const telegram={isInited:true,isLocationAvailable:true,isAccessGranted:false,getLocation(cb){requested++;this.isAccessGranted=true;cb({latitude:55.7558,longitude:37.6173});}};
  const p=await page({place:null,telegram});ok(requested===0,'Telegram prompt waits for protected entry');
  p.w.SabbathAccess.authorize('twelve-tribes');await flush();
  ok(requested===1&&JSON.parse(p.w.localStorage.getItem(KEY)).source==='gps','Telegram obtains real device coordinates automatically on entry');p.close();
}
{
  let requested=0;const telegram={isInited:false,isLocationAvailable:true,isAccessGranted:true,init(cb){this.isInited=true;cb();},getLocation(cb){requested++;cb({latitude:55.7558,longitude:37.6173});}};
  const p=await page({place:null,telegram});await flush();
  const saved=JSON.parse(p.w.localStorage.getItem(KEY));ok(requested===1&&saved.longitude===37.6173,'Telegram real device location wins independently of VPN');p.close();
}
{
  let cleans=0;const start=Clock.sunset(new Date('2026-10-16T12:00Z'),31.7683,35.2137);
  const p=await page({now:new Date(start-1000).toISOString(),loadApp:true});
  p.w.startKidsArkPairsGame=()=>{p.w.document.getElementById('game-container').textContent='playing';};
  p.w.__kidsArkPairsCleanup=()=>cleans++;
  p.w.showGame('kids-ark-pairs');ok(p.w.document.body.dataset.currentGame==='kids-ark-pairs','before sunset game opens');
  p.setTime(start);p.w.SabbathAccess.refresh();
  ok(cleans===1&&!p.w.document.body.dataset.currentGame,'running game cleaned at sunset');
  ok(p.w.document.getElementById('game-container').textContent==='','game removed, progress storage retained');p.close();
}
{
  let reply,cleans=0;
  const p=await page({now:'2026-10-16T08:00Z',loadApp:true,geo:success=>{reply=success;}});
  p.w.startKidsArkPairsGame=()=>{};p.w.__kidsArkPairsCleanup=()=>{cleans++;};
  p.w.showGame('kids-ark-pairs');p.setTime('2026-10-16T08:16Z');p.w.SabbathAccess.refresh();await flush();
  ok(typeof reply==='function'&&cleans===0&&p.w.SabbathAccess.status().allowed,'background GPS refresh preserves a valid running game');
  reply({coords:{latitude:31.7683,longitude:35.2137}});await flush();
  ok(cleans===0&&p.w.document.body.dataset.currentGame==='kids-ark-pairs','GPS refresh does not restart the round');p.close();
}
{
  const start=Clock.sunset(new Date('2026-10-16T12:00Z'),31.7683,35.2137);
  const p=await page({now:new Date(start-1000).toISOString(),loadApp:true});let started=0;
  p.w.startTwelveTribesGame=()=>started++;p.w.requestAnimationFrame=fn=>fn();
  p.w.showGame('twelve-tribes');const script=p.w.document.querySelector('script[data-game-script]');
  p.setTime(start);p.w.SabbathAccess.refresh();script.onload();
  ok(started===0,'late script callback cannot resurrect blocked game');p.close();
}
{
  const p=await page({age:Clock.dayMs+1});ok(p.w.SabbathAccess.status().reason==='location','expired coordinates are not treated as current');p.close();
}
{
  const p=await page({now:'2026-10-15T12:00Z',place:null});ok(p.w.SabbathAccess.authorize('moses-nile'),'weekday use does not require setup');p.close();
}
{
  const start=Clock.sunset(new Date('2026-10-16T12:00Z'),31.7683,35.2137);
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
  const p=await page({geo:success=>success({coords:{latitude:31.7683,longitude:35.2137}})});let started=false;
  const waiting=p.w.SabbathAccess.waitForAccess('moses-nile').then(()=>{started=true;});await flush();
  ok(!started,'standalone game waits for access');
  p.setTime(p.w.SabbathAccess.status().end);p.w.SabbathAccess.refresh();await waiting;
  ok(started,'standalone game becomes available automatically after lock');p.close();
}
{
  let reply,started=false;
  const p=await page({now:'2026-10-16T08:00Z',place:null,permission:'prompt',geo:success=>{reply=success;}});
  const waiting=p.w.SabbathAccess.waitForAccess('promised-land').then(()=>{started=true;});await flush();
  ok(!started&&typeof reply==='function','standalone entry automatically requests location before access');
  reply({coords:{latitude:31.7683,longitude:35.2137}});await waiting;
  ok(started&&!p.w.document.getElementById('sabbath-dialog'),'standalone opens automatically when real location permits');p.close();
}
{
  const p=await page({now:'2026-10-14T23:00:00Z',place:null,loadApp:true});
  p.w.showGame('moses-nile');const frame=p.w.document.querySelector('iframe');let reply;
  frame.contentWindow.postMessage=data=>{reply=data;};
  p.w.dispatchEvent(new p.w.MessageEvent('message',{source:frame.contentWindow,origin:p.w.location.origin,data:{type:'sabbath:request',game:'moses-nile'}}));
  ok(reply?.allowed&&reply.nextChange===Date.parse('2026-10-16T00:00:00Z'),'unknown-location iframe stays open across ordinary weekday midnight');p.close();
}
for(const url of ['/js/sabbath-clock.js','/js/sabbath-access.js','/styles/sabbath-access.css']){
  let body,status;
  ok(serveSabbathTestAsset({url},{writeHead:value=>{status=value;},end:value=>{body=value;}}),'isolated Nile fixture serves shared policy');
  ok(status===200&&body.length>0,'fixture gets actual policy source');
}
console.log(`Sabbath access: ${assertions} assertions passed (calendar/timezones, exact 24h, GPS, no IP fallback, five-game isolation, active cleanup, delayed launch).`);
