import {scenes} from './scenes.mjs?v=11';
export {scenes};
export const levels=[
 {id:'easy',label:'Лёгкий',tag:'Знакомые истории',description:'Яркие события, которые узнают многие. Начните с них.'},
 {id:'medium',label:'Средний',tag:'Внимание к деталям',description:'Вспомните героев и соедините подсказки вокруг себя.'},
 {id:'hard',label:'Сложный',tag:'Для знатоков Писания',description:'Редкие истории: ответ скрыт в небольших, точных деталях.'}
].map(level=>({...level,sceneIds:scenes.filter(scene=>scene.difficulty===level.id).map(scene=>scene.id)}));
export const regions=[
 {id:'mesopotamia',label:'Месопотамия',detail:'Земля между Тигром и Евфратом',lat:32.54,lon:44.42},
 {id:'judea',label:'Иудея',detail:'Иерусалим, Вифлеем и южные холмы',lat:31.78,lon:35.23},
 {id:'galilee',label:'Галилея',detail:'Галилейское море, Кана и соседние селения',lat:32.82,lon:35.58},
 {id:'sinai',label:'Синай и Красное море',detail:'Область перехода через море',lat:29.6,lon:32.8},
 {id:'egypt',label:'Древний Египет',detail:'Долина и дельта Нила',lat:29.85,lon:31.25},
 {id:'jezreel',label:'Изреельская долина',detail:'Долина на севере древнего Израиля',lat:32.6,lon:35.35},
 {id:'carmel',label:'Гора Кармил',detail:'Горный хребет у моря',lat:32.74,lon:35.05},
 {id:'road',label:'Дорога Иерусалим — Газа',detail:'Путь к юго-западу от Иерусалима',lat:31.6,lon:34.85},
 {id:'jordan',label:'Долина Иордана',detail:'Река, её берега и Иерихон',lat:32.1,lon:35.6},
 {id:'israel',label:'Древний Израиль, точное место не названо',lat:32.5,lon:35.2},
 {id:'troas',label:'Троада',detail:'Запад Малой Азии',lat:39.75,lon:26.16},
 {id:'philippi',label:'Филиппы',detail:'Македония',lat:41,lon:24.29},
 {id:'bethel',label:'Вефиль',detail:'Холмы к северу от Иерусалима',lat:31.93,lon:35.22},
 {id:'beersheba',label:'Вирсавия',detail:'Южная пустыня',lat:31.24,lon:34.79},
 {id:'joppa',label:'Иоппия',detail:'Город на побережье Средиземного моря',lat:32.05,lon:34.75},
 {id:'berea',label:'Верия',detail:'Город в Македонии',lat:40.52,lon:22.20},
 {id:'unknown',label:'Место не названо в Писании',detail:'Без определённой географической области'}
];
export const events=scenes.map(scene=>({id:scene.event,label:scene.title}));
export const epochs=[{id:'before-flood',label:'До потопа'},{id:'early',label:'После потопа, до Авраама'},{id:'patriarchs',label:'Время патриархов'},{id:'exodus',label:'Исход, завоевание Ханаана и время судей'},{id:'kings',label:'Время царей, плена и возвращения'},{id:'jesus',label:'Время Иисуса Христа'},{id:'apostles',label:'Время апостолов'}];
export const destination=scenes[0].destination,maxRoundScore=5000;
export function scenesForLevel(id='easy'){
 const level=levels.find(level=>level.id===id);
 if(!level)throw Error('Неизвестный уровень');
 return level.sceneIds.map(sceneId=>scenes.find(scene=>scene.id===sceneId));
}
export function eventChoices(levelId,sceneId){
 const selected=scenesForLevel(levelId);
 const correct=selected.find(scene=>scene.id===sceneId);
 if(!correct)throw Error('Неизвестная локация для уровня');
 let seed=[...sceneId].reduce((value,letter)=>(value*31+letter.charCodeAt(0))>>>0,17);
 function shuffle(list){
  for(let i=list.length-1;i>0;i--){
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   const j=seed%(i+1);
   [list[i],list[j]]=[list[j],list[i]];
  }
  return list;
 }
 const ids=new Set(shuffle(selected.filter(scene=>scene!==correct)).slice(0,6).map(scene=>scene.event));
 ids.add(correct.event);
 return shuffle(events.filter(event=>ids.has(event.id)));
}
export function distanceKm(a,b){const rad=x=>x*Math.PI/180,h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;return 6371*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));}
export function evaluate({guess,event,epoch,hints=0},scene=scenes[0]){
 const region=regions.find(r=>r.id===guess?.region),coords=guess&&Number.isFinite(guess.lat)&&Number.isFinite(guess.lon)&&Math.abs(guess.lat)<=90&&Math.abs(guess.lon)<=180;
 if((!region&&!coords)||!events.some(e=>e.id===event)||!epochs.some(e=>e.id===epoch))throw Error('Ответьте на все три вопроса');
 const point=coords?guess:Number.isFinite(region?.lat)?region:null,distance=point&&scene.destination?distanceKm(point,scene.destination):null;
 const place=region?(region.id===scene.region?2000:0):distance===null?0:Math.round(2000*Math.exp(-Math.max(0,distance-scene.radiusKm)/700));
 const story=event===scene.event?2000:0,time=epoch===scene.epoch?1000:0,penalty=Math.min(3,Math.max(0,Math.floor(Number.isFinite(hints)?hints:0)))*150;
 return {distance,place,story,time,penalty,total:Math.max(0,place+story+time-penalty)};
}
export function createJourney(levelId='easy'){
 const selected=scenesForLevel(levelId);let round=0;const results=[];
 return {get levelId(){return levelId;},get scenes(){return [...selected];},get roundCount(){return selected.length;},get maxScore(){return selected.length*maxRoundScore;},get index(){return round;},get scene(){return selected[round];},get results(){return [...results];},get total(){return results.reduce((sum,r)=>sum+r.total,0);},get complete(){return results.length===selected.length;},submit(answer){if(results[round])return results[round];const r=Object.freeze({...evaluate(answer,selected[round]),sceneId:selected[round].id,seconds:answer.seconds||0});results[round]=r;return r;},next(){if(!results[round]||round===selected.length-1)return false;round++;return true;},restart(){round=0;results.length=0;}};
}
