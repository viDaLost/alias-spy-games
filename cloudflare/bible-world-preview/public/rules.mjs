export const events = [
 {id:'temple',label:'Строительство храма',detail:'Святилище и царский город'},
 {id:'babel',label:'Строительство Вавилонской башни',detail:'Город, башня и смешение языков'},
 {id:'exodus',label:'Исход из Египта',detail:'Путь народа через пустыню'},
 {id:'jericho',label:'Падение Иерихона',detail:'Стены и завоевание города'},
 {id:'ark',label:'Строительство ковчега',detail:'Подготовка к потопу'},
 {id:'galilee',label:'Проповедь у Галилейского моря',detail:'Учение Иисуса и Его ученики'}
];
export const epochs = [
 {id:'before-flood',label:'До потопа'},
 {id:'early',label:'После потопа, до Авраама'},
 {id:'patriarchs',label:'Время патриархов'},
 {id:'exodus',label:'Исход и время судей'},
 {id:'kings',label:'Время царей и плена'},
 {id:'jesus',label:'Время Иисуса и апостолов'}
];
export const scenes = [
 {
  id:'babel',title:'Вавилонская башня',subtitle:'Строительство башни · земля Сеннаар',
  image:'assets/babel-360-v3.webp',event:'babel',epoch:'early',
  destination:{lat:32.54,lon:44.42},radiusKm:200,camera:{yaw:0,pitch:.08,fov:78},
  hints:[
   'Обожжённые кирпичи, смола и большая стройка — ключевые детали этой истории.',
   'Равнина между великими реками напоминает древнюю Месопотамию.',
   'Люди строят город и башню до небес, чтобы сделать себе имя.'
  ],
  description:'Художественная реконструкция строительства Вавилонской башни. В книге Бытие люди приходят в землю Сеннаар, делают кирпичи и используют земляную смолу, чтобы построить город и башню.',
  epochText:'После потопа, до Авраама — по последовательности рассказа в книге Бытие.',
  locationNote:'Игровой ориентир — Южная Месопотамия, рядом с древним Вавилоном. Точное место и год события не установлены. Полные очки за место: в пределах 200 км.',
  reference:'БЫТИЕ 11:1–9',quote:'«Построим себе город и башню, высотою до небес…»',quoteSource:'Бытие 11:4 · Синодальный перевод'
 },
 {
  id:'temple',title:'Храм Соломона',subtitle:'Строительство первого храма · Иерусалим',
  image:'assets/temple-360-v1.webp',event:'temple',epoch:'kings',
  destination:{lat:31.78,lon:35.23},radiusKm:70,camera:{yaw:0,pitch:.09,fov:78},
  hints:[
   'Светлый камень, кедровые балки и святилище указывают на особую царскую стройку.',
   'Вокруг — холмы Иудеи и древний Иерусалим.',
   'Это храм, построенный царём Соломоном после царствования Давида.'
  ],
  description:'Художественная реконструкция строительства храма Соломона в Иерусалиме. В 3-й книге Царств описаны подготовленные камни, кедровое дерево и устройство святилища. Облик здания в панораме — интерпретация художника.',
  epochText:'Время царей: царствование Соломона, обычно относимое к X веку до н. э.',
  locationNote:'Игровой ориентир — Иерусалим в Иудее. Полные очки за место: в пределах 70 км. Панорама передаёт сюжет и материалы, а не точный архитектурный облик.',
  reference:'3 ЦАРСТВ 6:1–38',quote:'«И построил он храм, и кончил его, и обшил храм кедровыми досками».',quoteSource:'3 Царств 6:9 · Синодальный перевод'
 },
 {
  id:'galilee',title:'Галилейское море',subtitle:'Иисус учит из лодки · Галилея',
  image:'assets/galilee-360-v1.webp',event:'galilee',epoch:'jesus',
  destination:{lat:32.82,lon:35.58},radiusKm:50,camera:{yaw:0,pitch:0,fov:78},
  hints:[
   'Рыбацкие лодки, сети и пресное озеро помогают определить регион.',
   'Этот водоём известен как Галилейское море и Геннисаретское озеро.',
   'В Евангелии от Луки Иисус садится в лодку Симона и учит народ на берегу.'
  ],
  description:'Художественная реконструкция сцены из Евангелия от Луки: у Геннисаретского озера Иисус входит в лодку Симона, просит немного отплыть от берега и учит народ из лодки.',
  epochText:'Время Иисуса и апостолов — I век н. э.',
  locationNote:'Игровой ориентир — Галилейское море. Точный участок берега для этой сцены не указан. Полные очки за место: в пределах 50 км.',
  reference:'ЛУКА 5:1–3',quote:'«И, сев, учил народ из лодки».',quoteSource:'Лука 5:3 · Синодальный перевод'
 }
];
export const destination=scenes[0].destination;
export const maxRoundScore=5000;
export const maxCampaignScore=scenes.length*maxRoundScore;

export function distanceKm(a,b){
 const rad=x=>x*Math.PI/180;
 const h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
export function evaluate({guess,event,epoch,hints=0},scene=scenes[0]){
 if(!guess||!Number.isFinite(guess.lat)||!Number.isFinite(guess.lon)||Math.abs(guess.lat)>90||Math.abs(guess.lon)>180||!events.some(x=>x.id===event)||!epochs.some(x=>x.id===epoch))throw new Error('Ответьте на все три вопроса');
 const distance=distanceKm(guess,scene.destination);
 const place=Math.round(2000*Math.exp(-Math.max(0,distance-scene.radiusKm)/700));
 const story=event===scene.event?2000:0;
 const time=epoch===scene.epoch?1000:0;
 const penalty=Math.min(3,Math.max(0,Math.floor(Number.isFinite(hints)?hints:0)))*150;
 return {distance,place,story,time,penalty,total:Math.max(0,place+story+time-penalty)};
}

// Each location earns points once. Only a new game clears completed rounds.
export function createJourney(){
 let round=0;const results=[];
 return {
  get index(){return round;},get scene(){return scenes[round];},
  get results(){return [...results];},get total(){return results.reduce((sum,r)=>sum+r.total,0);},
  get complete(){return results.length===scenes.length;},
  submit(answer){
   if(results[round])return results[round];
   const result={...evaluate(answer,scenes[round]),sceneId:scenes[round].id,seconds:answer.seconds||0};
   results[round]=Object.freeze(result);return result;
  },
  next(){if(!results[round]||round===scenes.length-1)return false;round++;return true;},
  restart(){round=0;results.length=0;}
 };
}
