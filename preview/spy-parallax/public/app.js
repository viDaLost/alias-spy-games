(()=>{'use strict';
const q=id=>document.getElementById(id),scene=q('scene');
const layers={sky:q('sky'),city:q('city'),roofs:q('roofs'),lights:q('lights'),fog:q('fog'),foreground:q('foreground'),spy:q('spyLayer')};
const depths={sky:[5,10],city:[9,18],roofs:[14,34],lights:[12,28],fog:[22,44],foreground:[29,68],spy:[38,78]};
let target={x:0,p:0},current={x:0,p:0},raf=0,lastPointerX=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function readScroll(){const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);target.p=clamp(scrollY/max,0,1);schedule()}
function render(){raf=0;if(reduced)return;current.x+=(target.x-current.x)*.14;current.p+=(target.p-current.p)*.12;for(const [name,el] of Object.entries(layers)){const [dx,dy]=depths[name];const x=current.x*dx,y=-current.p*dy;el.style.transform=`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(1.06)`}if(Math.abs(target.x-current.x)>.05||Math.abs(target.p-current.p)>.0005)schedule()}
function schedule(){if(!raf)raf=requestAnimationFrame(render)}
addEventListener('scroll',readScroll,{passive:true});addEventListener('resize',readScroll,{passive:true});
addEventListener('pointerdown',e=>{lastPointerX=e.clientX},{passive:true});addEventListener('pointermove',e=>{if(lastPointerX==null)return;const delta=e.clientX-lastPointerX;lastPointerX=e.clientX;target.x=clamp(target.x+delta/55,-1,1);schedule()},{passive:true});addEventListener('pointerup',()=>{lastPointerX=null},{passive:true});addEventListener('pointercancel',()=>{lastPointerX=null},{passive:true});
function setRole(spy){scene.classList.toggle('spy-state',spy);q('role').innerHTML=spy?'<strong>Вы — шпион</strong><span>Город темнее, туман плотнее. Найдите локацию, не выдав себя.</span>':'<strong>Вы — игрок</strong><span>Запомните локацию и вычислите шпиона.</span>';navigator.vibrate?.(18)}
q('revealSpy').onclick=()=>setRole(true);q('revealPlayer').onclick=()=>setRole(false);
q('resetView').onclick=()=>{target.x=0;scrollTo({top:0,behavior:reduced?'auto':'smooth'});schedule()};
q('patrol').onclick=()=>{const w=q('walker');w.classList.remove('walk');void w.offsetWidth;w.classList.add('walk');w.addEventListener('animationend',()=>w.classList.remove('walk'),{once:true})};
setTimeout(()=>{if(!document.hidden)q('patrol').click()},4200);readScroll();render();
})();
