(()=>{
'use strict';
const ICON='/icons-v19/';
const ACTION_ASSETS={
  create:{src:'/actions/room-v19.webp?v=21',className:'play-room',duration:1100},
  code:{src:'/actions/code-v19.webp?v=21',className:'play-code',duration:1000},
  qr:{src:'/actions/qr-v19.webp?v=21',className:'play-qr',duration:1120}
};
const GAMES=[
  {key:'artist',title:'Библейский художник',icon:'idea.webp',players:'3–8',minutes:12,tags:['company','online'],badge:'ОНЛАЙН'},
  {key:'quartet',title:'Квартет',icon:'quartet.webp',players:'2–8',minutes:15,tags:['company','online'],badge:'ПОПУЛЯРНОЕ'},
  {key:'spy',title:'Шпион',icon:'spy.webp',players:'4–12',minutes:8,tags:['company','short'],badge:'ДИНАМИЧНАЯ'},
  {key:'treasures',title:'Библейские сокровища',icon:'biblical-treasures-v38.webp',players:'1',minutes:10,tags:['solo','short'],badge:'30 УРОВНЕЙ'},
  {key:'alias',title:'Алиас',icon:'alias.webp',players:'4–12',minutes:12,tags:['company'],badge:'КОМПАНИЯ'},
  {key:'words',title:'Библейские слова',icon:'words.webp',players:'1',minutes:8,tags:['solo','short'],badge:'СЛОВА'}
];
const telegram=window.Telegram?.WebApp;
const haptic=(style='light')=>{try{telegram?.HapticFeedback?.impactOccurred(style)}catch{}};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const games=document.getElementById('games');
games.innerHTML=GAMES.map((g,i)=>`<button class="game-card" data-game-key="${g.key}" data-tags="${g.tags.join(' ')}"><div class="game-visual"><span class="game-badge">${g.badge}</span><span class="fav-btn ${i===1?'active':''}">♥</span><img src="${ICON}${g.icon}?v=21" alt="${g.title}" width="77" height="77" loading="${i<2?'eager':'lazy'}" decoding="async"></div><strong class="game-title">${g.title}</strong><div class="game-meta"><span class="pill">${g.players} игроков</span><span class="pill">${g.minutes} мин</span></div><span class="game-arrow">→</span></button>`).join('');
const modalOverlay=document.getElementById('modalOverlay');
const modalContent=document.getElementById('modalContent');
const actionStage=document.getElementById('actionStage');
let actionBusy=false;
function modalMarkup(kind){
  if(kind==='create')return `<div class="modal-head"><i class="app-icon icon-room"></i><div><h3>Создать комнату</h3><p>Подготовьте комнату и пригласите компанию.</p></div><button class="modal-close" data-close-modal aria-label="Закрыть">×</button></div><div class="modal-body"><div class="qr-placeholder">Новая комната будет создана здесь.<br>Preview пока не подключён к production room API.</div><div class="modal-actions"><button class="modal-btn primary">Создать комнату</button><button class="modal-btn">Показать приглашение</button></div></div>`;
  if(kind==='code')return `<div class="modal-head"><i class="app-icon icon-code"></i><div><h3>Войти по коду</h3><p>Введите 6-значный код комнаты.</p></div><button class="modal-close" data-close-modal aria-label="Закрыть">×</button></div><div class="modal-body"><input class="code-input" inputmode="numeric" maxlength="6" placeholder="000000" aria-label="Код комнаты"><div class="modal-actions"><button class="modal-btn primary">Войти</button></div><div class="modal-status">В Preview код пока не отправляется на backend.</div></div>`;
  return `<div class="modal-head"><i class="app-icon icon-qr"></i><div><h3>Войти по QR</h3><p>Сканирование откроется после разрешения камеры.</p></div><button class="modal-close" data-close-modal aria-label="Закрыть">×</button></div><div class="modal-body"><div class="qr-placeholder">Камера / QR scanner<br>Preview UI</div><div class="modal-actions"><button class="modal-btn primary">Открыть камеру</button><button class="modal-btn" data-switch-code>Ввести код</button></div></div>`;
}
function openModal(kind){modalContent.innerHTML=modalMarkup(kind);modalOverlay.classList.add('open');modalOverlay.setAttribute('aria-hidden','false');if(kind==='code')setTimeout(()=>modalOverlay.querySelector('.code-input')?.focus(),120)}
function closeModal(){modalOverlay.classList.remove('open');modalOverlay.setAttribute('aria-hidden','true')}
modalOverlay.addEventListener('click',e=>{if(e.target===modalOverlay||e.target.closest('[data-close-modal]'))closeModal();if(e.target.closest('[data-switch-code]')){closeModal();handleEntryAction('code')}});
async function loadActionImage(meta){
  const image=new Image();image.className='action-stage-image';image.alt='';image.decoding='async';image.src=meta.src;
  try{if(image.decode)await image.decode();else await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject})}catch{}
  return image;
}
async function playRasterAction(kind){
  const meta=ACTION_ASSETS[kind];if(!meta)return;
  actionStage.replaceChildren();actionStage.classList.add('active');actionStage.setAttribute('aria-hidden','false');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced){await sleep(220);actionStage.classList.remove('active');actionStage.setAttribute('aria-hidden','true');return}
  const image=await loadActionImage(meta);
  actionStage.appendChild(image);
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  image.classList.add(meta.className);
  await sleep(meta.duration+90);
  image.remove();
  actionStage.classList.remove('active');actionStage.setAttribute('aria-hidden','true');
  await sleep(90);
}
async function handleEntryAction(kind,button){
  if(actionBusy)return;actionBusy=true;document.body.classList.add('action-lock');button?.setAttribute('aria-busy','true');haptic('medium');
  try{await playRasterAction(kind);openModal(kind)}finally{actionBusy=false;document.body.classList.remove('action-lock');button?.removeAttribute('aria-busy')}
}
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>handleEntryAction(button.dataset.action,button)));
function applyFilter(tag){document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===tag));document.querySelectorAll('.game-card').forEach(card=>card.classList.toggle('is-filtered',tag!=='all'&&!card.dataset.tags.includes(tag)))}
document.addEventListener('click',e=>{const f=e.target.closest('.filter');if(f){applyFilter(f.dataset.filter);return}if(e.target.closest('#showAll')){applyFilter('all');return}if(e.target.closest('[data-scroll-games]')){document.getElementById('gamesSection').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});return}if(e.target.closest('[data-home]'))window.scrollTo({top:0,behavior:'smooth'});if(e.target.closest('.game-card,.continue-go'))haptic()});
const roulette=document.getElementById('rouletteButton');roulette.addEventListener('click',()=>{const visible=[...document.querySelectorAll('.game-card:not(.is-filtered)')];if(!visible.length)return;visible.forEach(c=>c.style.outline='');const chosen=visible[Math.floor(Math.random()*visible.length)];chosen.style.outline='2px solid rgba(157,148,255,.75)';chosen.scrollIntoView({behavior:'smooth',block:'center'});haptic('medium');setTimeout(()=>chosen.style.outline='',1800)});
const LIGHT_POSITIONS=[[18,63],[29,69],[38,60],[48,72],[57,64],[66,76],[74,68],[82,59]];const lights=document.getElementById('sceneLights');lights.innerHTML=LIGHT_POSITIONS.map(([x,y])=>`<i style="left:${x}%;top:${y}%"></i>`).join('');
const base=document.getElementById('sceneBase'),stars=document.getElementById('sceneStars'),moon=document.getElementById('sceneMoon'),far=document.getElementById('sceneCloudFar'),near=document.getElementById('sceneCloudNear'),foreground=document.getElementById('sceneForeground'),title=document.getElementById('titleLayer');
let raf=0,lastY=window.scrollY;const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));function renderScene(){raf=0;const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);const p=clamp(scrollY/max,0,1);const dx=clamp((scrollY-lastY)*.16,-8,8);lastY=scrollY;base.style.transform=`translate3d(${dx*.10}px,${-24*p}px,0) scale(1.04)`;stars.style.transform=`translate3d(${14*p}px,${-42*p}px,0) scale(1.035)`;moon.style.transform=`translate3d(${-14*p}px,${28*p}px,0) scale(${.94+p*.03})`;far.style.transform=`translate3d(${-18+42*p}px,${-16*p}px,0) scale(1.035)`;near.style.transform=`translate3d(${20-58*p}px,${-30*p}px,0) scale(1.04)`;foreground.style.transform=`translate3d(${dx*.28}px,${-64*p}px,0) scale(1.04)`;if(title)title.style.translate=`0 ${(-7*p).toFixed(1)}px`}
function schedule(){if(!raf)raf=requestAnimationFrame(renderScene)}window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule,{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});telegram?.onEvent?.('activated',schedule);renderScene();
})();
