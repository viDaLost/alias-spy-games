import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Execute actual game handlers and image loading with a minimal DOM/WebGL substitute.
// This verifies transitions, not real-device rendering or browser layout.
const gpu={programs:0,textures:0,uploads:0};
const gl={
 createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,deleteShader(){},
 createProgram:()=>{gpu.programs++;return {};},attachShader(){},linkProgram(){},getProgramParameter:()=>true,
 useProgram(){},createBuffer:()=>({}),bindBuffer(){},bufferData(){},getAttribLocation:()=>0,
 enableVertexAttribArray(){},vertexAttribPointer(){},createTexture:()=>{gpu.textures++;return {};},
 bindTexture(){},activeTexture(){},deleteTexture(){},texParameteri(){},pixelStorei(){},uniform1i(){},getUniformLocation:()=>0,
 uniform1f(){},uniform2f(){},uniformMatrix3fv(){},texImage2D(){gpu.uploads++;}
};
class Element {
 constructor(tag='div'){
  this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.style={};this.hidden=false;
  this.open=false;this.disabled=false;this.className='';this.text='';this.value='';this.clientWidth=400;this.clientHeight=380;
  this.classList={toggle:(n,on)=>{const c=new Set(this.className.split(' ').filter(Boolean));const add=on??!c.has(n);add?c.add(n):c.delete(n);this.className=[...c].join(' ');return add;},contains:n=>this.className.split(' ').includes(n),add:n=>this.classList.toggle(n,true),remove:n=>this.classList.toggle(n,false)};
 }
 append(...xs){for(const x of xs){if(x.parent)x.parent.children=x.parent.children.filter(c=>c!==x);x.parent=this;this.children.push(x);}}
 replaceChildren(...xs){this.children=[];this.text='';this.append(...xs);}
 set textContent(x){this.text=String(x);this.children=[];}
 get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
 set innerHTML(x){this.text=String(x).replace(/<[^>]*>/g,'');this.children=[];}
 setAttribute(k,v){this.attrs[k]=String(v);}
 removeAttribute(k){delete this.attrs[k];}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
 dispatch(k){for(const f of this.listeners[k]??[])f({target:this});}
 click(){if(!this.disabled){this.onclick?.({target:this});this.dispatch('click');}}
 change(value){this.value=value;this.checked=true;this.onchange?.({target:this});this.dispatch('change');}
 querySelector(s){for(const c of this.children){if(s.startsWith('.')?c.classList.contains(s.slice(1)):c.tag===s)return c;const found=c.querySelector(s);if(found)return found;}return null;}
 getContext(type){return type==='webgl'?gl:null;}
 focus(){}scrollIntoView(){}showModal(){this.open=true;}close(){this.open=false;}
}
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const elements=new Map([...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)].map(m=>{const e=new Element(m[1]);e.id=m[2];e.hidden=m[0].includes(' hidden');e.disabled=m[0].includes(' disabled');return [e.id,e];}));
const tabs=['place','event','epoch'].map(n=>{const e=elements.get('tab-'+n);e.dataset={tab:n};return e;});
const radios=()=>['regions','events','epochs'].flatMap(n=>elements.get(n).children.flatMap(c=>c.children.filter(x=>x.tag==='input')));
const storage=new Map([['bible-world-best-v3','12345']]),images=[];let tick;
Object.assign(globalThis,{
 document:{hidden:false,body:new Element('body'),getElementById:id=>{assert.ok(elements.has(id),`HTML element ${id} exists`);return elements.get(id);},createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t),querySelectorAll:s=>s==='[data-tab]'?tabs:s==='input[type=radio]'?radios():[],addEventListener(){}},
 window:{devicePixelRatio:1,scrollTo(){}},Image:class{constructor(){this.width=4096;this.height=2048;images.push(this);}},
 ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,matchMedia:()=>({matches:true}),
 localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setInterval:fn=>{tick=fn;return 1;},setTimeout:()=>1,clearTimeout(){}
});
const {levels,scenesForLevel}=await import('../public/rules.mjs');
await import('../public/app.js');
const $=id=>elements.get(id),choose=(name,value)=>{const r=radios().find(r=>r.name===name&&r.value===value);assert.ok(r,`${name}: ${value}`);r.change(value);};
const start=id=>$('levelCards').children.find(x=>x.id==='level-'+id).click();
test('all 15 fullscreen rounds: automatic steps, editing, final submission and independent records',()=>{
 assert.equal(images.length,0);assert.equal($('levelCards').children.length,3);
 for(const level of levels){
  start(level.id);assert.equal($('levelMenu').hidden,true);assert.equal($('gameView').hidden,false);
  for(const [i,scene] of scenesForLevel(level.id).entries()){
   assert.equal(images.at(-1).src,scene.image);assert.equal($('openAnswers').disabled,true);
   tick();assert.equal($('timer').textContent,'00:00');images.at(-1).onload();assert.equal($('openAnswers').disabled,false);
   tick();assert.equal($('timer').textContent,'00:01');$('helpButton').click();tick();assert.equal($('timer').textContent,'00:01');$('closeHelp').click();
   $('openAnswers').click();assert.equal($('answerDialog').open,true);assert.equal($('scene').inert,true);
   choose('regions',scene.region);assert.equal($('panel-event').hidden,false);
   choose('events',scene.event);assert.equal($('panel-epoch').hidden,false);
   $('backAnswer').click();assert.equal($('panel-event').hidden,false);$('nextAnswer').click();
   choose('epochs',scene.epoch);assert.equal($('answerReview').hidden,false);assert.equal($('submitGuess').disabled,false);
   $('reviewAnswers').children[0].click();assert.equal($('panel-place').hidden,false);
   choose('regions',scene.region);$('tab-epoch').click();$('nextAnswer').click();
   $('closeAnswers').click();assert.equal($('scene').inert,false);$('openAnswers').click();assert.equal($('answerReview').hidden,false);
   $('submitGuess').click();assert.equal($('resultDialog').open,true);assert.equal($('submitGuess').disabled,true);
   if(i<4)assert.equal(storage.has('bible-world-best-v4-'+level.id),false);
   if(i<4)$('playAgain').click();
  }
  assert.equal(storage.get('bible-world-best-v4-'+level.id),'25000');
  $('resultLevels').click();assert.equal($('levelMenu').hidden,false);
 }
 assert.equal(storage.get('bible-world-best-v3'),'12345');assert.equal(gpu.programs,1);assert.equal(gpu.textures,1);assert.equal(gpu.uploads,15);
});
test('stale loads cannot unlock a new round and failed images can be retried',()=>{
 start('easy');const stale=images.at(-1);$('chooseLevel').click();start('hard');const active=images.at(-1);
 stale.onload();assert.equal($('openAnswers').disabled,true);
 active.onerror();assert.equal($('openAnswers').disabled,true);$('loading').children.find(x=>x.tag==='button').click();
 images.at(-1).onload();assert.equal($('openAnswers').disabled,false);
});
