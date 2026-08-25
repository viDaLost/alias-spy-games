(()=>{
'use strict';
const ICON='/icons-v19/';
const GAMES=[
  {key:'artist',title:'Библейский художник',icon:'idea.webp',players:'3–8',minutes:12,tags:['company','online'],badge:'ОНЛАЙН'},
  {key:'quartet',title:'Квартет',icon:'quartet.webp',players:'2–8',minutes:15,tags:['company','online'],badge:'ПОПУЛЯРНОЕ'},
  {key:'spy',title:'Шпион',icon:'spy.webp',players:'4–12',minutes:8,tags:['company','short'],badge:'ДИНАМИЧНАЯ'},
  {key:'treasures',title:'Библейские сокровища',icon:'biblical-treasures-v38.webp',players:'1',minutes:10,tags:['solo','short'],badge:'30 УРОВНЕЙ'},
  {key:'alias',title:'Алиас',icon:'alias.webp',players:'4–12',minutes:12,tags:['company'],badge:'КОМПАНИЯ'},
  {key:'words',title:'Библейские слова',icon:'words.webp',players:'1',minutes:8,tags:['solo','short'],badge:'СЛОВА'}
];
const tg=window.Telegram?.WebApp;
const haptic=(style='light')=>{try{tg?.HapticFeedback?.impactOccurred(style)}catch{}};
const games=document.getElementById('games');
games.innerHTML=GAMES.map((g,i)=>`<button class="game-card" data-game-key="${g.key}" data-tags="${g.tags.join(' ')}"><div class="game-visual"><span class="game-badge">${g.badge}</span><span class="fav-btn ${i===1?'active':''}">♥</span><img src="${ICON}${g.icon}?v=22" alt="${g.title}" width="77" height="77" loading="${i<2?'eager':'lazy'}" decoding="async"></div><strong class="game-title">${g.title}</strong><div class="game-meta"><span class="pill">${g.players} игроков</span><span class="pill">${g.minutes} мин</span></div><span class="game-arrow">→</span></button>`).join('');

const modal=document.getElementById('modalOverlay');
const modalContent=document.getElementById('modalContent');
function modalMarkup(kind){
  if(kind==='code')return `<div class="modal-head"><i class="app-icon icon-code"></i><div><h3>Войти по коду</h3><p>Введите 6-значный код комнаты.</p></div><button class="modal-close" data-close-modal aria-label="Закрыть">×</button></div><div class="modal-body"><input class="code-input" inputmode="numeric" maxlength="6" placeholder="000000" aria-label="Код комнаты"><div class="modal-actions"><button class="modal-btn primary">Войти</button></div><div class="modal-status">Preview интерфейс. Подключение к backend не изменено.</div></div>`;
  return `<div class="modal-head"><i class="app-icon icon-qr"></i><div><h3>Войти по QR</h3><p>Сканирование откроется после разрешения камеры.</p></div><button class="modal-close" data-close-modal aria-label="Закрыть">×</button></div><div class="modal-body"><div class="qr-placeholder">Камера / QR scanner</div><div class="modal-actions"><button class="modal-btn primary">Открыть камеру</button><button class="modal-btn" data-switch-code>Ввести код</button></div></div>`;
}
function openModal(kind){modalContent.innerHTML=modalMarkup(kind);modal.classList.add('open');modal.setAttribute('aria-hidden','false');haptic('medium');if(kind==='code')setTimeout(()=>modal.querySelector('.code-input')?.focus(),100)}
function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>openModal(button.dataset.action)));
modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-close-modal]'))closeModal();if(e.target.closest('[data-switch-code]'))openModal('code')});

function applyFilter(tag){document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===tag));document.querySelectorAll('.game-card').forEach(card=>card.classList.toggle('is-filtered',tag!=='all'&&!card.dataset.tags.includes(tag)))}
document.addEventListener('click',e=>{const f=e.target.closest('.filter');if(f){applyFilter(f.dataset.filter);return}if(e.target.closest('#showAll')){applyFilter('all');return}if(e.target.closest('.game-card,.continue-go'))haptic()});
const roulette=document.getElementById('rouletteButton');roulette?.addEventListener('click',()=>{const visible=[...document.querySelectorAll('.game-card:not(.is-filtered)')];if(!visible.length)return;visible.forEach(c=>c.style.outline='');const chosen=visible[Math.floor(Math.random()*visible.length)];chosen.style.outline='2px solid rgba(157,148,255,.75)';chosen.scrollIntoView({behavior:'smooth',block:'center'});haptic('medium');setTimeout(()=>chosen.style.outline='',1800)});

const gamesView=document.getElementById('gamesView');
const profileView=document.getElementById('profileView');
const navButtons=[...document.querySelectorAll('[data-nav]')];
function showView(view){const profile=view==='profile';gamesView.hidden=profile;profileView.hidden=!profile;navButtons.forEach(b=>b.classList.toggle('active',b.dataset.nav===view));window.scrollTo({top:0,behavior:'auto'});haptic()}
navButtons.forEach(b=>b.addEventListener('click',()=>showView(b.dataset.nav)));
const user=tg?.initDataUnsafe?.user;
document.getElementById('profileName').textContent=user?.first_name||user?.username||'Игрок';
document.getElementById('profileMeta').textContent=user?.username?`@${user.username}`:'Профиль игрока';

const LIGHT_POSITIONS=[[18,63],[29,69],[38,60],[48,72],[57,64],[66,76],[74,68],[82,59]];
const lights=document.getElementById('sceneLights');lights.innerHTML=LIGHT_POSITIONS.map(([x,y])=>`<i style="left:${x}%;top:${y}%"></i>`).join('');
const layers={base:document.getElementById('sceneBase'),stars:document.getElementById('sceneStars'),moon:document.getElementById('sceneMoon'),far:document.getElementById('sceneCloudFar'),near:document.getElementById('sceneCloudNear'),foreground:document.getElementById('sceneForeground')};
let target=0,current=0,raf=0;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function updateTarget(){const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);target=clamp(scrollY/max,0,1);if(!raf)raf=requestAnimationFrame(render)}
function render(){const delta=target-current;current+=delta*.115;if(Math.abs(delta)<.00035)current=target;const p=current;layers.base.style.transform=`translate3d(0,${(-22*p).toFixed(2)}px,0) scale(1.04)`;layers.stars.style.transform=`translate3d(${(12*p).toFixed(2)}px,${(-38*p).toFixed(2)}px,0) scale(1.035)`;layers.moon.style.transform=`translate3d(${(-12*p).toFixed(2)}px,${(24*p).toFixed(2)}px,0) scale(${(.94+p*.028).toFixed(4)})`;layers.far.style.transform=`translate3d(${(-18+38*p).toFixed(2)}px,${(-14*p).toFixed(2)}px,0) scale(1.035)`;layers.near.style.transform=`translate3d(${(18-52*p).toFixed(2)}px,${(-26*p).toFixed(2)}px,0) scale(1.04)`;layers.foreground.style.transform=`translate3d(0,${(-58*p).toFixed(2)}px,0) scale(1.04)`;if(current!==target){raf=requestAnimationFrame(render)}else{raf=0}}
window.addEventListener('scroll',updateTarget,{passive:true});window.addEventListener('resize',updateTarget,{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateTarget()});tg?.onEvent?.('activated',updateTarget);updateTarget();
})();
