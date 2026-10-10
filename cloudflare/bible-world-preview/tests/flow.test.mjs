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
  this.disabled=false;this.className='';this.text='';this.value='';this.clientWidth=400;this.clientHeight=380;
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
 querySelector(s){return this.children.find(c=>s.startsWith('.')&&c.classList.contains(s.slice(1)));}
 getContext(type){return type==='webgl'?gl:null;}
 focus(){}scrollIntoView(){}showModal(){this.open=true;}close(){this.open=false;}
}
const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const elements=new Map([...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)].map(m=>{const e=new Element(m[1]);e.id=m[2];e.hidden=m[0].includes(' hidden');e.disabled=m[0].includes(' disabled');return [e.id,e];}));
const tabs=['place','event','epoch'].map(n=>{const e=elements.get('tab-'+n);e.dataset={tab:n};return e;});
const label=new Element();label.className='scene-label';elements.get('scene').append(label);
const radios=()=>['events','epochs'].flatMap(n=>elements.get(n).children.flatMap(c=>c.children.filter(x=>x.tag==='input')));
const storage=new Map(),images=[];let tick;
Object.assign(globalThis,{
 document:{hidden:false,body:new Element('body'),getElementById:id=>{assert.ok(elements.has(id),`HTML element ${id} exists`);return elements.get(id);},createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t),querySelectorAll:s=>s==='[data-tab]'?tabs:s==='input[type=radio]'?radios():[],addEventListener(){}},
 window:{devicePixelRatio:1,scrollTo(){}},Image:class{constructor(){this.width=1774;this.height=887;images.push(this);}},
 ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,matchMedia:()=>({matches:true}),
 localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setInterval:fn=>{tick=fn;return 1;}
});
await import('../public/app.js');
const $=id=>elements.get(id),choose=(name,value)=>radios().find(r=>r.name===name&&r.value===value).change(value);
const number=id=>Number($(id).textContent.replace(/\D/g,''));
const answer=(region,event,epoch)=>{$('regionSelect').change(region);choose('events',event);choose('epochs',epoch);$('submitGuess').click();};

test('three mobile rounds, image changes, score total, hints, final record and restart',()=>{
 assert.equal($('roundNumber').textContent,'1');assert.equal(images[0].src,'assets/babel-360-v4-hq.webp');
 assert.equal($('submitGuess').disabled,true);tick();assert.equal($('timer').textContent,'00:00');
 images[0].onload();assert.equal($('loading').hidden,true);
 $('openAnswers').click();assert.ok(document.body.classList.contains('answers-open'));assert.equal($('scene').inert,true);
 $('closeAnswers').click();assert.ok(!document.body.classList.contains('answers-open'));assert.equal($('scene').inert,false);
 $('regionSelect').change('32.54,44.42');assert.equal($('completionText').textContent,'Выбрано 1 из 3');
 $('nextPlace').click();assert.equal($('panel-event').hidden,false);
 choose('events','babel');choose('epochs','early');assert.equal($('submitGuess').disabled,false);
 $('mobileHintButton').click();assert.match($('maxScore').textContent,/4850/);
 assert.equal($('mobileHint').hidden,false);$('closeMobileHint').click();tick();assert.equal($('timer').textContent,'00:01');
 $('submitGuess').click();assert.equal(number('totalScore'),4850);assert.equal(number('campaignScore'),4850);
 assert.equal($('result').hidden,false);assert.equal($('regionSelect').disabled,true);assert.ok(radios().every(r=>r.disabled));
 assert.ok(document.body.classList.contains('has-result'));assert.equal($('mapWrap').parent,$('resultMapSlot'));
 $('submitGuess').click();assert.equal(number('campaignScore'),4850);assert.equal(storage.size,0);
 tick();assert.equal($('timer').textContent,'00:01');

 $('playAgain').click();assert.equal($('roundNumber').textContent,'2');assert.equal(images[1].src,'assets/temple-360-v2-hq.webp');
 assert.equal($('result').hidden,true);assert.equal($('submitGuess').disabled,true);assert.equal($('timer').textContent,'00:00');
 assert.equal($('hintList').children.length,0);assert.ok(radios().every(r=>!r.disabled&&!r.checked));
 assert.equal($('mapWrap').parent,$('mapHome'));assert.equal($('mobileHintButton').disabled,false);
 assert.match($('journeyScore').textContent,/4\s?850/);tick();assert.equal($('timer').textContent,'00:00');
 images[0].onload();assert.equal(gpu.uploads,1); // An old asynchronous load cannot replace the new scene.
 images[1].onload();answer('31.78,35.23','temple','kings');
 assert.equal(number('totalScore'),5000);assert.equal(number('campaignScore'),9850);assert.match($('resultLocation').textContent,/Иерусалим/);
 assert.match($('verseReference').textContent,/ЦАРСТВ/);assert.equal(storage.size,0);

 $('playAgain').click();assert.equal($('roundNumber').textContent,'3');assert.equal(images[2].src,'assets/galilee-360-v2-hq.webp');
 images[2].onload();for(let i=0;i<3;i++)$('mobileHintButton').click();
 assert.equal($('mobileHintButton').disabled,true);assert.match($('mobileHintText').textContent,/Луки/);
 answer('32.82,35.58','galilee','jesus');assert.equal(number('totalScore'),14400);assert.equal(number('campaignScore'),14400);
 assert.match($('scoreLimit').textContent,/15\s?000/);assert.equal($('roundResults').children.length,3);
 assert.match($('resultTitle').textContent,/Три истории/);assert.equal(storage.get('bible-world-journey-best-v3'),'14400');
 assert.equal(gpu.programs,1);assert.equal(gpu.textures,1);assert.equal(gpu.uploads,3);

 $('playAgain').click();assert.equal($('roundNumber').textContent,'1');assert.equal($('journeyScore').textContent.replace(/\s/g,''),'0/15000');
 assert.equal($('mapWrap').parent,$('mapHome'));assert.equal($('completionText').textContent,'Выбрано 0 из 3');
 assert.equal($('mobileHintButton').disabled,false);assert.match($('bestScore').textContent,/14\s?400/);
 images[3].onload();answer('30.05,31.24','ark','jesus');assert.ok(number('totalScore')<2000);
 assert.equal(storage.get('bible-world-journey-best-v3'),'14400');assert.match($('scoreBreakdown').textContent,/Ответ: Строительство Вавилонской башни/);
});
