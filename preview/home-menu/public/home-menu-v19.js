(()=>{
'use strict';

const ICON='/icons-v19/';
const PLANNER_STORAGE_KEY='home-menu-planner-v19';
const MOTION_STORAGE_KEY='home-menu-motion-v19';
const MAX_FRAME_RATE=60;
const MIN_FRAME_INTERVAL=1000/MAX_FRAME_RATE-1;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const ACTION_ASSETS={
  room:{src:'/actions/room-v19.webp?v=19',className:'action-room',duration:1050},
  code:{src:'/actions/code-v19.webp?v=19',className:'action-code',duration:920},
  qr:{src:'/actions/qr-v19.webp?v=19',className:'action-qr',duration:1080},
  stars:{src:'/actions/falling-stars-v19.webp?v=19',className:'action-stars',duration:1050}
};
const ACTION_FOR_KIND={create:'room',code:'code',qr:'qr',planner:'stars',games:'stars',browse:'stars'};

const GAMES=[
  {key:'artist',title:'Библейский художник',icon:'idea.webp',players:'3–8',minPlayers:3,maxPlayers:8,minutes:12,tags:['company','online'],moods:['calm','mixed'],kind:'creative',badge:'ОНЛАЙН'},
  {key:'quartet',title:'Квартет',icon:'quartet.webp',players:'2–8',minPlayers:2,maxPlayers:8,minutes:15,tags:['company','online'],moods:['calm','mixed'],kind:'cards',badge:'ПОПУЛЯРНОЕ'},
  {key:'spy',title:'Шпион',icon:'spy.webp',players:'4–12',minPlayers:4,maxPlayers:12,minutes:8,tags:['company','short'],moods:['active','mixed'],kind:'social',badge:'ДИНАМИЧНАЯ'},
  {key:'treasures',title:'Библейские сокровища',icon:'biblical-treasures-v38.webp',players:'1',minPlayers:1,maxPlayers:1,minutes:10,tags:['solo','short'],moods:['calm','mixed'],kind:'puzzle',badge:'30 УРОВНЕЙ'},
  {key:'alias',title:'Алиас',icon:'alias.webp',players:'4–12',minPlayers:4,maxPlayers:12,minutes:12,tags:['company'],moods:['active','mixed'],kind:'words',badge:'КОМПАНИЯ'},
  {key:'words',title:'Библейские слова',icon:'words.webp',players:'1',minPlayers:1,maxPlayers:1,minutes:8,tags:['solo','short'],moods:['calm','mixed'],kind:'words',badge:'СЛОВА'}
];

const telegram=window.Telegram?.WebApp;
const haptic=(style='light')=>{try{telegram?.HapticFeedback?.impactOccurred(style)}catch{}};
const games=document.getElementById('games');

games.innerHTML=GAMES.map((game,index)=>`<button class="game-card" data-game-key="${game.key}" data-tags="${game.tags.join(' ')}"><div class="game-visual"><span class="game-badge">${game.badge}</span><span class="fav-btn ${index===1?'active':''}">♥</span><img src="${ICON}${game.icon}?v=19" alt="${game.title}" width="72" height="72" loading="${index<2?'eager':'lazy'}" decoding="async"></div><strong class="game-title">${game.title}</strong><div class="game-meta"><span class="pill">${game.players} игроков</span><span class="pill">${game.minutes} мин</span></div><span class="game-arrow">→</span></button>`).join('');
games.querySelectorAll('img').forEach(image=>image.addEventListener('error',()=>{image.style.opacity='.22'},{once:true,passive:true}));

const plannerState={players:6,time:40,mood:'mixed',route:[]};
const plannerPlayers=document.getElementById('plannerPlayers');
const plannerResult=document.getElementById('plannerResult');

function readPlannerState(){
  try{
    const saved=JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY)||'{}');
    plannerState.players=clamp(Number(saved.players)||6,1,12);
    plannerState.time=[20,40,60].includes(Number(saved.time))?Number(saved.time):40;
    plannerState.mood=['calm','mixed','active'].includes(saved.mood)?saved.mood:'mixed';
  }catch{}
}

function savePlannerState(){
  try{localStorage.setItem(PLANNER_STORAGE_KEY,JSON.stringify({players:plannerState.players,time:plannerState.time,mood:plannerState.mood}))}catch{}
}

function syncPlannerControls(){
  plannerPlayers.textContent=plannerState.players;
  document.querySelectorAll('[data-plan-time]').forEach(button=>button.classList.toggle('active',Number(button.dataset.planTime)===plannerState.time));
  document.querySelectorAll('[data-plan-mood]').forEach(button=>button.classList.toggle('active',button.dataset.planMood===plannerState.mood));
}

function scoreGame(game){
  const mood=game.moods.includes(plannerState.mood)?14:game.moods.includes('mixed')?7:0;
  const shortBonus=plannerState.time===20&&game.minutes<=10?5:0;
  return mood+shortBonus-game.minutes*.05;
}

function chooseRoute(){
  const eligible=GAMES.filter(game=>plannerState.players>=game.minPlayers&&plannerState.players<=game.maxPlayers);
  if(!eligible.length)return[];
  const options=eligible.map(game=>[game]);
  for(let first=0;first<eligible.length;first+=1){
    for(let second=first+1;second<eligible.length;second+=1){
      const pair=[eligible[first],eligible[second]];
      if(pair[0].minutes+pair[1].minutes<=plannerState.time)options.push(pair);
    }
  }
  const target=plannerState.time*(plannerState.time===20?.88:.68);
  const ranked=options.map(route=>{
    const total=route.reduce((sum,game)=>sum+game.minutes,0);
    const variety=route.length===2&&route[0].kind!==route[1].kind?9:0;
    const pairBonus=route.length===2?18:0;
    const utilization=24-Math.abs(target-total);
    const mood=route.reduce((sum,game)=>sum+scoreGame(game),0);
    return{route,score:pairBonus+variety+utilization+mood};
  }).sort((a,b)=>b.score-a.score||b.route.length-a.route.length);
  return ranked[0].route.slice().sort((a,b)=>a.minutes-b.minutes);
}

function renderRoute(){
  const route=plannerState.route;
  const total=route.reduce((sum,game)=>sum+game.minutes,0);
  const reserve=Math.max(0,plannerState.time-total);
  const cards=route.map((game,index)=>`${index?'<span>→</span>':''}<span class="route-game" title="${game.title}"><img src="${ICON}${game.icon}?v=19" alt="" width="35" height="35" decoding="async"></span>`).join('');
  const names=route.map((game,index)=>`${index+1}. ${game.title}`).join(' · ');
  plannerResult.innerHTML=`<div class="route-games">${cards}</div><div class="route-copy"><strong>${names}</strong><span>${total} мин игры · ${reserve} мин на правила и паузу</span></div><button class="route-show" data-apply-route aria-label="Показать игры маршрута">→</button>`;
  plannerResult.classList.add('visible');
}

function buildRoute(announce=true){
  plannerState.route=chooseRoute();
  renderRoute();
  savePlannerState();
  if(announce){triggerSceneAction('planner');haptic('medium')}
}

function clearRouteHighlights(){
  document.querySelectorAll('.game-card').forEach(card=>{card.classList.remove('route-match');card.removeAttribute('data-route-order')});
}

function applyRoute(){
  clearRouteHighlights();
  document.querySelectorAll('.filter').forEach(button=>button.classList.toggle('active',button.dataset.filter==='all'));
  document.querySelectorAll('.game-card').forEach(card=>card.classList.remove('is-filtered'));
  plannerState.route.forEach((game,index)=>{
    const card=document.querySelector(`[data-game-key="${game.key}"]`);
    if(card){card.classList.add('route-match');card.dataset.routeOrder=String(index+1)}
  });
  scrollToGames();
  haptic('light');
}

readPlannerState();
syncPlannerControls();
buildRoute(false);

function setView(name){
  document.querySelectorAll('.view').forEach(view=>view.classList.remove('active'));
  document.getElementById('view-'+name)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(button=>button.classList.toggle('active',button.dataset.view===name));
  triggerSceneAction(name==='home'?'browse':'games');
  window.scrollTo({top:0,behavior:document.body.classList.contains('user-reduced-motion')?'auto':'smooth'});
}

function scrollToGames(){
  setView('home');
  setTimeout(()=>{
    document.getElementById('gamesSection').scrollIntoView({behavior:document.body.classList.contains('user-reduced-motion')?'auto':'smooth',block:'start'});
    triggerSceneAction('games');
  },80);
}

function applyFilter(tag){
  clearRouteHighlights();
  document.querySelectorAll('.filter').forEach(button=>button.classList.toggle('active',button.dataset.filter===tag));
  document.querySelectorAll('.game-card').forEach(card=>card.classList.toggle('is-filtered',tag!=='all'&&!card.dataset.tags.includes(tag)));
  triggerSceneAction('games');
}

const overlay=document.getElementById('overlay');
const sheet=document.getElementById('sheetContent');
const sheets={
  create:['icon-room','Создать комнату','Новая комната с приглашением для вашей компании.','Создать','Показать QR'],
  code:['icon-code','Войти по коду','Введите код комнаты, который прислал ведущий.','Ввести код','Недавние'],
  qr:['icon-qr','Войти по QR','Наведите камеру на код комнаты.','Сканировать','Ввести код']
};

function openSheet(key){
  const data=sheets[key]||sheets.create;
  sheet.innerHTML=`<div class="sheet-head"><i class="app-icon ${data[0]}"></i><div><h3>${data[1]}</h3><p>${data[2]}</p></div></div><div class="sheet-actions"><button class="sheet-btn primary">${data[3]}</button><button class="sheet-btn">${data[4]}</button></div>`;
  overlay.classList.add('open');
}

overlay.addEventListener('click',event=>{if(event.target===overlay)overlay.classList.remove('open')});

document.addEventListener('click',event=>{
  const view=event.target.closest('[data-view]');
  if(view){setView(view.dataset.view);return}
  const scrollGames=event.target.closest('[data-scroll-games]');
  if(scrollGames){scrollToGames();return}
  const sheetButton=event.target.closest('[data-sheet]');
  if(sheetButton){triggerSceneAction(sheetButton.dataset.sheet);openSheet(sheetButton.dataset.sheet);haptic();return}
  const deltaButton=event.target.closest('[data-player-delta]');
  if(deltaButton){plannerState.players=clamp(plannerState.players+Number(deltaButton.dataset.playerDelta),1,12);syncPlannerControls();buildRoute(false);haptic();return}
  const timeButton=event.target.closest('[data-plan-time]');
  if(timeButton){plannerState.time=Number(timeButton.dataset.planTime);syncPlannerControls();buildRoute(false);haptic();return}
  const moodButton=event.target.closest('[data-plan-mood]');
  if(moodButton){plannerState.mood=moodButton.dataset.planMood;syncPlannerControls();buildRoute(false);haptic();return}
  if(event.target.closest('#plannerBuild')){buildRoute(true);return}
  if(event.target.closest('[data-apply-route]')){applyRoute();return}
  const filter=event.target.closest('.filter');
  if(filter){applyFilter(filter.dataset.filter);return}
  if(event.target.closest('#showAll')){applyFilter('all');return}
  if(event.target.closest('.game-card,.continue-go')){triggerSceneAction('games');haptic()}
  const toggle=event.target.closest('.toggle');
  if(toggle&&!['sceneToggle','motionToggle','tiltToggle'].includes(toggle.id))toggle.classList.toggle('on');
});

const sceneBg=document.getElementById('sceneBg');
const sceneBase=document.getElementById('sceneBase');
const sceneStars=document.getElementById('sceneStars');
const sceneMoon=document.getElementById('sceneMoon');
const sceneCloudFar=document.getElementById('sceneCloudFar');
const sceneCloudNear=document.getElementById('sceneCloudNear');
const sceneLights=document.getElementById('sceneLights');
const sceneForeground=document.getElementById('sceneForeground');
const sceneActionLayers=document.getElementById('sceneActionLayers');
const sceneToggle=document.getElementById('sceneToggle');
const motionToggle=document.getElementById('motionToggle');
const tiltToggle=document.getElementById('tiltToggle');
const tiltStatus=document.getElementById('tiltStatus');
const LIGHT_POSITIONS=[[18,63],[29,69],[38,60],[48,72],[57,64],[66,76],[74,68],[82,59]];

sceneLights.innerHTML=LIGHT_POSITIONS.map(([x,y])=>`<i style="left:${x}%;top:${y}%"></i>`).join('');

let targetProgress=0;
let currentProgress=0;
let targetEnergy=0;
let currentEnergy=0;
let targetLean=0;
let currentLean=0;
let targetPointerX=0;
let currentPointerX=0;
let targetPointerY=0;
let currentPointerY=0;
let targetTiltX=0;
let currentTiltX=0;
let targetTiltY=0;
let currentTiltY=0;
let sceneFrame=0;
let lastFrameAt=0;
let actionTimer=0;
let lastScrollY=window.scrollY;
let lastScrollAt=performance.now();
let tiltListening=false;
let tiltOrigin=null;
let telegramActive=telegram?.isActive!==false;
let actionPlayback=0;
const actionLayerCache=new Map();

const damp=(current,target,speed,delta)=>Math.abs(target-current)<.0006?target:current+(target-current)*(1-Math.exp(-speed*delta/1000));
const sceneDisabled=()=>document.body.classList.contains('scene-user-off')||document.body.classList.contains('user-reduced-motion')||document.hidden||!telegramActive;
const scrollProgress=()=>{const max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);return clamp(window.scrollY/max,0,1)};
const transform=(element,x,y,scale)=>{element.style.transform=`translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${scale.toFixed(4)})`};

function applyScene(){
  const progress=currentProgress;
  const energy=currentEnergy;
  const wave=Math.sin(progress*Math.PI);
  const drift=Math.sin(progress*Math.PI*1.35);
  const depthX=clamp(currentPointerX+currentTiltX,-1,1);
  const depthY=clamp(currentPointerY+currentTiltY,-1,1);
  transform(sceneBase,drift*5+depthX*4+currentLean*2,-34*progress+depthY*3,1.04);
  transform(sceneStars,46*progress-depthX*12-currentLean*3+energy*7,-76*progress-depthY*7,1.035);
  transform(sceneMoon,-28*progress-depthX*4-energy*3,44*progress-depthY*3,.94+progress*.04+energy*.018);
  transform(sceneCloudFar,-34+78*progress-depthX*7,-26*progress+wave*5-depthY*4,1.035);
  transform(sceneCloudNear,42-104*progress-depthX*11,-52*progress+wave*8-depthY*6,1.04);
  transform(sceneLights,-7*drift+depthX*3,-44*progress+depthY*3,1);
  transform(sceneForeground,-8*drift+depthX*9+currentLean*6,-98*progress+depthY*8,1.04);
  sceneStars.style.opacity=(.43+energy*.13).toFixed(3);
  sceneMoon.style.opacity=(.46+energy*.07).toFixed(3);
  sceneLights.style.opacity=(.66+energy*.25).toFixed(3);
}

const scheduleScene=()=>{
  if(!sceneFrame&&!sceneDisabled()){
    sceneBg.classList.add('scene-moving');
    sceneFrame=requestAnimationFrame(renderScene);
  }
};

function renderScene(timestamp){
  sceneFrame=0;
  if(sceneDisabled()){sceneBg.classList.remove('scene-moving');return}
  if(lastFrameAt&&timestamp-lastFrameAt<MIN_FRAME_INTERVAL){scheduleScene();return}
  const delta=Math.min(48,Math.max(8,lastFrameAt?timestamp-lastFrameAt:16.7));
  lastFrameAt=timestamp;
  targetEnergy=damp(targetEnergy,0,6.5,delta);
  targetLean=damp(targetLean,0,8.5,delta);
  currentProgress=damp(currentProgress,targetProgress,10,delta);
  currentEnergy=damp(currentEnergy,targetEnergy,13,delta);
  currentLean=damp(currentLean,targetLean,12,delta);
  currentPointerX=damp(currentPointerX,targetPointerX,8,delta);
  currentPointerY=damp(currentPointerY,targetPointerY,8,delta);
  currentTiltX=damp(currentTiltX,targetTiltX,9,delta);
  currentTiltY=damp(currentTiltY,targetTiltY,9,delta);
  applyScene();
  const moving=Math.abs(targetProgress-currentProgress)>.0008||currentEnergy>.002||Math.abs(currentLean)>.002||Math.abs(targetPointerX-currentPointerX)>.001||Math.abs(targetPointerY-currentPointerY)>.001||Math.abs(targetTiltX-currentTiltX)>.001||Math.abs(targetTiltY-currentTiltY)>.001;
  if(moving)scheduleScene();else sceneBg.classList.remove('scene-moving');
}

function updateSceneTarget(){
  const now=performance.now();
  const y=window.scrollY;
  const dy=y-lastScrollY;
  const delta=Math.max(16,now-lastScrollAt);
  const raw=scrollProgress();
  if(Math.abs(dy)>.5){
    targetEnergy=Math.max(targetEnergy,clamp(Math.abs(dy)/Math.max(24,delta*1.3),0,.72));
    targetLean=clamp(dy/64,-.72,.72);
  }
  lastScrollY=y;
  lastScrollAt=now;
  targetProgress=raw*raw*(3-2*raw);
  scheduleScene();
}

function updatePointer(event){
  targetPointerX=clamp(event.clientX/Math.max(1,window.innerWidth)*2-1,-1,1);
  targetPointerY=clamp(event.clientY/Math.max(1,window.innerHeight)*2-1,-1,1);
  scheduleScene();
}

function resetPointer(){targetPointerX=targetPointerY=0;scheduleScene()}

function loadActionLayer(assetKey){
  const cached=actionLayerCache.get(assetKey);
  if(cached)return cached;
  const meta=ACTION_ASSETS[assetKey];
  const image=new Image();
  image.className=`scene-action-image ${meta.className}`;
  image.alt='';
  image.decoding='async';
  image.fetchPriority='low';
  image.draggable=false;
  const entry={image,ready:null};
  entry.ready=new Promise((resolve,reject)=>{
    image.addEventListener('load',resolve,{once:true,passive:true});
    image.addEventListener('error',()=>{actionLayerCache.delete(assetKey);image.remove();reject(new Error(`Action layer failed: ${assetKey}`))},{once:true,passive:true});
  });
  actionLayerCache.set(assetKey,entry);
  sceneActionLayers.append(image);
  image.src=meta.src;
  return entry;
}

function pruneActionLayers(keepAssetKey){
  actionLayerCache.forEach(({image},assetKey)=>{
    if(assetKey===keepAssetKey)return;
    image.remove();
    actionLayerCache.delete(assetKey);
  });
}

function stopActionLayers(release=false){
  actionPlayback+=1;
  clearTimeout(actionTimer);
  actionLayerCache.forEach(({image})=>{image.classList.remove('is-playing');if(release)image.remove()});
  if(release)actionLayerCache.clear();
}

async function playActionLayer(kind){
  const assetKey=ACTION_FOR_KIND[kind]||'stars';
  const playback=++actionPlayback;
  pruneActionLayers(assetKey);
  const entry=loadActionLayer(assetKey);
  try{await entry.ready}catch{return}
  if(playback!==actionPlayback||sceneDisabled())return;
  actionLayerCache.forEach(({image})=>image.classList.remove('is-playing'));
  void entry.image.offsetWidth;
  entry.image.classList.add('is-playing');
  clearTimeout(actionTimer);
  actionTimer=setTimeout(()=>entry.image.classList.remove('is-playing'),ACTION_ASSETS[assetKey].duration+80);
}

function triggerSceneAction(kind){
  if(sceneDisabled())return;
  const allowed=['browse','create','code','qr','planner','games'];
  const action=allowed.includes(kind)?kind:'browse';
  targetEnergy=1;
  targetLean=action==='code'?-.55:action==='qr'?.55:action==='planner'?.32:0;
  void playActionLayer(action);
  scheduleScene();
}

function onDeviceOrientation(event){
  if(!tiltListening||sceneDisabled()||event.gamma==null||event.beta==null)return;
  if(!tiltOrigin){tiltOrigin={gamma:event.gamma,beta:event.beta};tiltStatus.textContent='Активно · наклоните телефон';return}
  targetTiltX=clamp((event.gamma-tiltOrigin.gamma)/18,-.75,.75);
  targetTiltY=clamp((event.beta-tiltOrigin.beta)/24,-.75,.75);
  scheduleScene();
}

function stopTilt(message='Выключено · включается вручную'){
  if(tiltListening)window.removeEventListener('deviceorientation',onDeviceOrientation);
  tiltListening=false;
  tiltOrigin=null;
  targetTiltX=targetTiltY=0;
  tiltToggle.classList.remove('on');
  tiltStatus.textContent=message;
  scheduleScene();
}

async function startTilt(){
  const Orientation=window.DeviceOrientationEvent;
  if(!Orientation){stopTilt('Гироскоп недоступен на устройстве');return}
  try{
    const permission=typeof Orientation.requestPermission==='function'?await Orientation.requestPermission():'granted';
    if(permission!=='granted'){stopTilt('Доступ к движению не предоставлен');return}
    tiltListening=true;
    tiltOrigin=null;
    tiltToggle.classList.add('on');
    tiltStatus.textContent='Активно · калибровка…';
    window.addEventListener('deviceorientation',onDeviceOrientation,{passive:true});
  }catch{stopTilt('Не удалось включить гироскоп')}
}

function saveMotionState(){
  try{localStorage.setItem(MOTION_STORAGE_KEY,JSON.stringify({scene:sceneToggle.classList.contains('on'),reduced:motionToggle.classList.contains('on')}))}catch{}
}

function readMotionState(){
  try{
    const saved=JSON.parse(localStorage.getItem(MOTION_STORAGE_KEY)||'{}');
    if(typeof saved.scene==='boolean')sceneToggle.classList.toggle('on',saved.scene);
    if(typeof saved.reduced==='boolean')motionToggle.classList.toggle('on',saved.reduced);
  }catch{}
}

function syncSceneState(){
  const reduced=motionToggle.classList.contains('on');
  const disabled=!sceneToggle.classList.contains('on');
  document.body.classList.toggle('user-reduced-motion',reduced);
  document.body.classList.toggle('scene-user-off',disabled);
  if(sceneFrame){cancelAnimationFrame(sceneFrame);sceneFrame=0}
  sceneBg.classList.remove('scene-moving');
  if(reduced||disabled){
    stopActionLayers(true);
    if(tiltListening)stopTilt('Отключено вместе с движением');
    targetEnergy=currentEnergy=targetLean=currentLean=targetPointerX=currentPointerX=targetPointerY=currentPointerY=targetTiltX=currentTiltX=targetTiltY=currentTiltY=0;
    lastFrameAt=0;
  }else updateSceneTarget();
  saveMotionState();
}

readMotionState();
if(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)motionToggle.classList.add('on');
[sceneStars,sceneMoon,sceneCloudFar,sceneCloudNear,sceneForeground].forEach(image=>image.addEventListener('error',()=>{image.hidden=true},{once:true,passive:true}));
sceneBase.addEventListener('load',()=>document.body.classList.remove('scene-failed'),{passive:true});
sceneBase.addEventListener('error',()=>document.body.classList.add('scene-failed'),{passive:true});
if(sceneBase.complete)document.body.classList.toggle('scene-failed',!sceneBase.naturalWidth);

window.addEventListener('scroll',updateSceneTarget,{passive:true});
window.addEventListener('resize',updateSceneTarget,{passive:true});
if(window.matchMedia?.('(hover:hover) and (pointer:fine)')?.matches){
  window.addEventListener('pointermove',updatePointer,{passive:true});
  window.addEventListener('mouseout',event=>{if(!event.relatedTarget)resetPointer()},{passive:true});
}
window.addEventListener('orientationchange',()=>{tiltOrigin=null;setTimeout(updateSceneTarget,80)},{passive:true});
window.addEventListener('pageshow',()=>setTimeout(updateSceneTarget,50),{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(updateSceneTarget,50);else{sceneBg.classList.remove('scene-moving');stopActionLayers(true)}},{passive:true});
telegram?.onEvent?.('deactivated',()=>{telegramActive=false;if(sceneFrame)cancelAnimationFrame(sceneFrame);sceneFrame=0;sceneBg.classList.remove('scene-moving');stopActionLayers(true)});
telegram?.onEvent?.('activated',()=>{telegramActive=true;setTimeout(updateSceneTarget,50)});

sceneToggle.addEventListener('click',event=>{event.stopPropagation();sceneToggle.classList.toggle('on');syncSceneState()});
motionToggle.addEventListener('click',event=>{event.stopPropagation();motionToggle.classList.toggle('on');syncSceneState()});
tiltToggle.addEventListener('click',async event=>{event.stopPropagation();if(tiltListening){stopTilt();return}motionToggle.classList.remove('on');sceneToggle.classList.add('on');syncSceneState();await startTilt()});

syncSceneState();
currentProgress=targetProgress=scrollProgress();
applyScene();
requestAnimationFrame(updateSceneTarget);
})();
