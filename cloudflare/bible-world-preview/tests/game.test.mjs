import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,distanceKm,destination,scenes,createJourney,maxCampaignScore} from '../public/rules.mjs';
import {rayToUV,wrapAngle,panoramaSamples,framebufferSize,maxFov} from '../public/camera.mjs';
const correct={guess:destination,event:'babel',epoch:'early'};
test('полный правильный ответ даёт 5000 очков',()=>{assert.equal(evaluate(correct).total,5000);});
test('область неопределённого места засчитывается полностью',()=>{assert.equal(evaluate({...correct,guess:{lat:33,lon:44.5}}).place,2000);});
test('более далёкий ответ даёт меньше очков за место',()=>{const a=evaluate({...correct,guess:{lat:35,lon:40}}),b=evaluate({...correct,guess:{lat:30,lon:31}});assert.ok(a.place<2000);assert.ok(a.place>b.place);assert.equal(a.story,2000);assert.equal(a.time,1000);});
test('ошибка в истории не отнимает очки за верную эпоху и место',()=>{const r=evaluate({...correct,event:'ark'});assert.equal(r.total,3000);assert.equal(r.story,0);});
test('три подсказки стоят ровно 450 очков',()=>{assert.equal(evaluate({...correct,hints:3}).total,4550);assert.equal(evaluate({...correct,hints:10}).penalty,450);});
test('результат не уходит ниже нуля',()=>{assert.equal(evaluate({guess:{lat:-80,lon:-120},event:'ark',epoch:'jesus',hints:3}).total,0);});
test('нельзя проверить незавершённый ответ',()=>{assert.throws(()=>evaluate({...correct,guess:null}));assert.throws(()=>evaluate({...correct,event:null}));assert.throws(()=>evaluate({...correct,epoch:'unknown'}));});
test('расстояние устойчиво в крайних случаях',()=>{assert.equal(distanceKm(destination,destination),0);assert.ok(Math.abs(distanceKm({lat:0,lon:0},{lat:0,lon:180})-Math.PI*6371)<.001);});
test('поворот на 360 градусов возвращает тот же вид',()=>{for(const yaw of [-5,-1,0,1,5]){const a=rayToUV(.3,-.2,1.5,1.1,yaw,.2),b=rayToUV(.3,-.2,1.5,1.1,yaw+2*Math.PI,.2);assert.ok(Math.abs(a.u-b.u)<1e-12);assert.ok(Math.abs(a.v-b.v)<1e-12);}});
test('камера доступна во всех четырёх направлениях и на обоих полюсах',()=>{for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]){const a=rayToUV(0,0,1,1,yaw,0);assert.ok(a.u>=0&&a.u<1);assert.ok(Math.abs(a.v-.5)<1e-12);}assert.ok(rayToUV(0,0,1,1,0,Math.PI/2).v<1e-7);assert.ok(rayToUV(0,0,1,1,0,-Math.PI/2).v>1-1e-7);});
test('полный оборот не создаёт скачок камеры',()=>{assert.ok(Math.abs(wrapAngle(2*Math.PI))<1e-12);assert.ok(Math.abs(wrapAngle(100*Math.PI))<1e-10);});
test('portrait and fullscreen camera never turn into an extreme wide-angle lens',()=>{
 for(const aspect of [393/852,393/550,1,852/393,1920/1080]){
  const left=rayToUV(-1,0,aspect,maxFov,0,0),right=rayToUV(1,0,aspect,maxFov,0,0);
  const top=rayToUV(0,1,aspect,maxFov,0,0),bottom=rayToUV(0,-1,aspect,maxFov,0,0);
  const horizontal=(right.u-left.u)*2*Math.PI,vertical=(bottom.v-top.v)*Math.PI;
  assert.ok(horizontal<=maxFov+1e-12&&vertical<=maxFov+1e-12);
  assert.ok(Math.abs(Math.max(horizontal,vertical)-maxFov)<1e-12);
  assert.ok(Math.abs(Math.tan(horizontal/2)/Math.tan(vertical/2)-aspect)<1e-12);
 }
});
test('Retina phone gets native pixels and large screens stay within a finite GPU budget',()=>{
 const phone=framebufferSize(393,852,3);assert.equal(phone.width,1179);assert.equal(phone.height,2556);
 for(const [w,h,dpr] of [[393,550,3],[1920,1080,3],[3840,2160,2],[360,640,1]]){
  const buffer=framebufferSize(w,h,dpr);assert.ok(buffer.width*buffer.height<=3200000);
  assert.ok(Math.abs(buffer.width/buffer.height-w/h)<.005);
 }
});
test('стык панорамы непрерывен без зеркального отражения',()=>{const a=panoramaSamples(0),b=panoramaSamples(1-1e-10);for(const key of ['a','b','weight'])assert.ok(Math.abs(a[key]-b[key])<1e-7);for(let u=0;u<1;u+=.01){const s=panoramaSamples(u);assert.ok(s.a>=0&&s.a<=1&&s.b>=0&&s.b<=1&&s.weight>=0&&s.weight<=1);}});
test('assembled panoramas preserve longitude without another seam crop',()=>{
 for(const u of [-.25,0,.25,.5,.75,1,1.25]){
  const s=panoramaSamples(u,0),expected=(u%1+1)%1;
  assert.equal(s.a,expected);assert.equal(s.b,expected);assert.equal(s.weight,1);
 }
});
test('each scene has its own answer, period and geographic tolerance',()=>{
 assert.equal(scenes.length,3);assert.equal(new Set(scenes.map(s=>s.id)).size,3);
 for(const scene of scenes){
  const correct={guess:scene.destination,event:scene.event,epoch:scene.epoch};
  assert.equal(evaluate(correct,scene).total,5000);
  assert.equal(evaluate({...correct,hints:3},scene).total,4550);
  assert.equal(scene.hints.length,3);
  assert.ok(evaluate({...correct,guess:{...scene.destination,lat:scene.destination.lat+scene.radiusKm/111.2*.5}},scene).place===2000);
  const wrongEvent=scenes.find(s=>s.event!==scene.event).event;
  assert.equal(evaluate({...correct,event:wrongEvent},scene).story,0);
 }
});
test('journey advances only after scoring, never scores twice, and restarts cleanly',()=>{
 const j=createJourney();assert.equal(j.next(),false);assert.equal(j.total,0);
 for(const [i,scene] of scenes.entries()){
  assert.equal(j.scene.id,scene.id);
  const correct={guess:scene.destination,event:scene.event,epoch:scene.epoch,hints:i};
  const first=j.submit(correct),second=j.submit({...correct,hints:3});
  assert.equal(first,second);assert.equal(j.results.length,i+1);
  assert.equal(j.next(),i<scenes.length-1);
 }
 assert.equal(j.total,14550);assert.equal(maxCampaignScore,15000);assert.equal(j.complete,true);
 j.restart();assert.equal(j.index,0);assert.equal(j.total,0);assert.equal(j.complete,false);
});
test('invalid coordinates are rejected and nonfinite hint penalties stay bounded',()=>{
 assert.throws(()=>evaluate({...correct,guess:{lat:100,lon:40}}));
 assert.throws(()=>evaluate({...correct,guess:{lat:30,lon:200}}));
 assert.equal(evaluate({...correct,hints:NaN}).total,5000);
});
