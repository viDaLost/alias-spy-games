import {scenes} from './scenes.mjs?v=7';
export {scenes};
export const levels=[
 {id:'easy',label:'Лёгкий',tag:'Знакомые истории',description:'Яркие события, которые узнают многие. Начните с них.',sceneIds:['babel','noah','red-sea','david','daniel']},
 {id:'medium',label:'Средний',tag:'Внимание к деталям',description:'Вспомните героев и соедините подсказки вокруг себя.',sceneIds:['temple','galilee','gideon','carmel','philip']},
 {id:'hard',label:'Сложный',tag:'Для знатоков Писания',description:'Редкие истории: ответ скрыт в небольших, точных деталях.',sceneIds:['axe','oil','fleece','eutychus','prison']}
];
export const regions=[
 {id:'mesopotamia',label:'Месопотамия',detail:'Земля между Тигром и Евфратом',lat:32.54,lon:44.42},
 {id:'judea',label:'Иудея',detail:'Иерусалим и южные холмы',lat:31.78,lon:35.23},
 {id:'galilee',label:'Галилея',detail:'Галилейское море и его берега',lat:32.82,lon:35.58},
 {id:'sinai',label:'Египет, Синай и Красное море',detail:'Область пути Исхода',lat:29.6,lon:32.8},
 {id:'jezreel',label:'Изреельская долина',detail:'Долина на севере древнего Израиля',lat:32.6,lon:35.35},
 {id:'carmel',label:'Гора Кармил',detail:'Горный хребет у моря',lat:32.74,lon:35.05},
 {id:'road',label:'Дорога Иерусалим — Газа',detail:'Путь к юго-западу от Иерусалима',lat:31.6,lon:34.85},
 {id:'jordan',label:'Долина Иордана',detail:'Река и её берега',lat:32.1,lon:35.6},
 {id:'israel',label:'Древний Израиль, точное место не названо',lat:32.5,lon:35.2},
 {id:'troas',label:'Троада',detail:'Запад Малой Азии',lat:39.75,lon:26.16},
 {id:'philippi',label:'Филиппы',detail:'Македония',lat:41,lon:24.29},
 {id:'unknown',label:'Место не названо в Писании',detail:'Без определённой географической области'}
];
export const events=[...scenes.map(s=>({id:s.event,label:s.title})),{id:'jericho',label:'Падение стен Иерихона'},{id:'joseph',label:'Иосиф объясняет сны фараону'},{id:'wedding',label:'Вода становится вином на свадьбе'},{id:'naaman',label:'Очищение Неемана'},{id:'peter',label:'Пётр идёт по воде'},{id:'samuel',label:'Призвание Самуила'}];
export const epochs=[{id:'before-flood',label:'До потопа'},{id:'early',label:'После потопа, до Авраама'},{id:'patriarchs',label:'Время патриархов'},{id:'exodus',label:'Исход и время судей'},{id:'kings',label:'Время царей и плена'},{id:'jesus',label:'Земное служение Иисуса'},{id:'apostles',label:'Время апостольских миссий'}];
export const destination=scenes[0].destination,maxRoundScore=5000,maxCampaignScore=25000;
export function scenesForLevel(id='easy'){const l=levels.find(l=>l.id===id);if(!l)throw Error('Неизвестный уровень');return l.sceneIds.map(id=>scenes.find(s=>s.id===id));}
export function eventChoices(levelId,sceneId){const ids=scenesForLevel(levelId).map(s=>s.event),list=events.filter(e=>ids.includes(e.id)||['jericho','naaman'].includes(e.id));let seed=[...sceneId].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,17);for(let i=list.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[list[i],list[j]]=[list[j],list[i]];}return list;}
export function distanceKm(a,b){const rad=x=>x*Math.PI/180,h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;return 6371*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));}
export function evaluate({guess,event,epoch,hints=0},scene=scenes[0]){
 const region=regions.find(r=>r.id===guess?.region),coords=guess&&Number.isFinite(guess.lat)&&Number.isFinite(guess.lon)&&Math.abs(guess.lat)<=90&&Math.abs(guess.lon)<=180;
 if((!region&&!coords)||!events.some(e=>e.id===event)||!epochs.some(e=>e.id===epoch))throw Error('Ответьте на все три вопроса');
 const point=coords?guess:Number.isFinite(region?.lat)?region:null,distance=point&&scene.destination?distanceKm(point,scene.destination):null;
 const place=region?.id===scene.region?2000:distance===null?0:Math.round(2000*Math.exp(-Math.max(0,distance-scene.radiusKm)/700));
 const story=event===scene.event?2000:0,time=epoch===scene.epoch?1000:0,penalty=Math.min(3,Math.max(0,Math.floor(Number.isFinite(hints)?hints:0)))*150;
 return {distance,place,story,time,penalty,total:Math.max(0,place+story+time-penalty)};
}
export function createJourney(levelId='easy'){
 const selected=scenesForLevel(levelId);let round=0;const results=[];
 return {get levelId(){return levelId;},get scenes(){return [...selected];},get maxScore(){return 25000;},get index(){return round;},get scene(){return selected[round];},get results(){return [...results];},get total(){return results.reduce((sum,r)=>sum+r.total,0);},get complete(){return results.length===selected.length;},submit(answer){if(results[round])return results[round];const r=Object.freeze({...evaluate(answer,selected[round]),sceneId:selected[round].id,seconds:answer.seconds||0});results[round]=r;return r;},next(){if(!results[round]||round===selected.length-1)return false;round++;return true;},restart(){round=0;results.length=0;}};
}
