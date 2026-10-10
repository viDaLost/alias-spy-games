import {events,epochs,scenes,createJourney,maxCampaignScore} from './rules.mjs?v=5';
import {createPanorama} from './viewer.mjs?v=5';
const $=id=>document.getElementById(id);
const journey=createJourney();
const state={guess:null,event:null,epoch:null,hints:0,submitted:false,seconds:0,loaded:false};
const phoneQuery=matchMedia('(max-width:740px), (max-height:550px) and (pointer:coarse)');
function setAnswerSheet(open){
 const active=!!open&&phoneQuery.matches;
 document.body.classList.toggle('answers-open',active);
 $('sheetBackdrop').hidden=!active;
 $('openAnswers').setAttribute('aria-expanded',String(active));
 $('answerPanel').setAttribute('role',active?'dialog':'region');
 if(active){$('answerPanel').setAttribute('aria-modal','true');$('answerPanel').scrollTop=0;$('answerPanel').focus({preventScroll:true});}
 else{$('answerPanel').removeAttribute('aria-modal');}
 $('scene').inert=active;
 if(!active&&phoneQuery.matches&&!state.submitted)$('openAnswers').focus({preventScroll:true});
}
$('openAnswers').onclick=()=>setAnswerSheet(true);
$('closeAnswers').onclick=()=>$('sheetBackdrop').click();
$('sheetBackdrop').onclick=()=>setAnswerSheet(false);
phoneQuery.addEventListener?.('change',()=>{setAnswerSheet(false);viewer.redraw();});
document.addEventListener('keydown',e=>{
 if(!document.body.classList.contains('answers-open'))return;
 if(e.key==='Escape'){setAnswerSheet(false);return;}
 if(e.key==='Tab'){
  const focusable=[...$('answerPanel').querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')].filter(x=>x.getClientRects().length);
  const first=focusable[0],last=focusable.at(-1);if(!first)return;
  if(e.shiftKey&&(document.activeElement===first||document.activeElement===$('answerPanel'))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===$('answerPanel'))){e.preventDefault();first.focus();}
 }
});
let best=0;try{best=Number(localStorage.getItem('bible-world-journey-best-v3'))||0;}catch{}
function showBest(){$('bestScore').textContent=best?best.toLocaleString('ru-RU'):'—';}showBest();
const viewer=createPanorama($('scene'),$('panoramaCanvas'),{onReady:()=>{state.loaded=true;$('loading').hidden=true;},onError:()=>{$('loading').replaceChildren();const t=document.createElement('span');t.textContent='Не удалось загрузить панораму';const b=document.createElement('button');b.className='outline-button';b.textContent='Попробовать ещё раз';b.onclick=loadScene;$('loading').append(t,b);}});
$('zoomIn').onclick=()=>viewer.zoom(.82);$('zoomOut').onclick=()=>viewer.zoom(1.22);$('resetView').onclick=viewer.reset;
$('expandButton').onclick=()=>{const expanded=$('scene').classList.toggle('expanded');$('expandButton').textContent=expanded?'×':'⤢';$('expandButton').setAttribute('aria-label',expanded?'Свернуть сцену':'Развернуть сцену');document.body.style.overflow=expanded?'hidden':'';viewer.redraw();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('scene').classList.contains('expanded'))$('expandButton').click();});
for(const [list,name]of [[events,'events'],[epochs,'epochs']])for(const entry of list){const label=document.createElement('label');label.className='choice';const input=document.createElement('input');input.type='radio';input.name=name;input.value=entry.id;const text=document.createElement('span'),title=document.createElement('b');title.textContent=entry.label;text.append(title);if(entry.detail){const detail=document.createElement('small');detail.textContent=entry.detail;text.append(detail);}label.append(input,text);$(name).append(label);input.addEventListener('change',()=>{if(state.submitted)return;state[name==='events'?'event':'epoch']=input.value;updateCompletion();});}
function activateTab(name,scroll=false){for(const tab of document.querySelectorAll('[data-tab]')){const active=tab.dataset.tab===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$('panel-'+tab.dataset.tab).hidden=!active;}if(scroll){$('tab-'+name).focus({preventScroll:true});if(phoneQuery.matches)$('answerPanel').scrollTop=0;}}
for(const tab of document.querySelectorAll('[data-tab]')){tab.addEventListener('click',()=>activateTab(tab.dataset.tab));tab.addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const names=['place','event','epoch'],i=names.indexOf(tab.dataset.tab),n=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;activateTab(names[n],true);});}activateTab('place');
$('nextPlace').onclick=()=>activateTab('event',true);$('nextEvent').onclick=()=>activateTab('epoch',true);
function updateCompletion(){const parts=[state.guess,state.event,state.epoch],count=parts.filter(Boolean).length;for(const [i,name]of ['place','event','epoch'].entries())$('tab-'+name).classList.toggle('done',!!parts[i]);$('completionText').textContent=state.submitted?'Ответ проверен':`Выбрано ${count} из 3`;$('completionDots').textContent=parts.map(p=>p?'●':'○').join(' ');$('submitGuess').disabled=count<3||state.submitted;$('dockLabel').textContent=count===3?'Проверить ответ':'Ответить';$('dockCount').textContent=`${count} / 3 →`;}
const ns='http://www.w3.org/2000/svg';function el(tag,attrs={}){const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;}
const xy=({lon,lat})=>({x:(lon-22)*20,y:(43-lat)*20});
function path(points){return points.map(([lon,lat],i)=>{const p=xy({lon,lat});return `${i?'L':'M'}${p.x},${p.y}`;}).join(' ');}
const map=$('guessMap');map.append(el('rect',{width:680,height:540,fill:'#c6dcd6'}));
for(let lon=24;lon<56;lon+=4){const{x}=xy({lon,lat:43});map.append(el('line',{x1:x,y1:0,x2:x,y2:540,stroke:'#6b7d7214'}));}for(let lat=18;lat<43;lat+=4){const{y}=xy({lon:22,lat});map.append(el('line',{x1:0,y1:y,x2:680,y2:y,stroke:'#6b7d7214'}));}
const asia=[[22,43],[56,43],[56,16],[51,16],[48,19],[44,21],[41,25],[38,28],[35,29.5],[34.9,31.3],[35.1,33],[35.8,35],[36,36],[35.4,36.6],[32,36.3],[30.5,36.3],[29,36.9],[27.7,36.6],[27.2,37.7],[26.2,38.7],[26.5,40],[25.5,40.6],[24,40.7],[23,40.2],[22,41]];
const africa=[[22,31.5],[26,31.7],[28.8,30.9],[30.5,31.5],[32.2,31.25],[33.3,31.2],[34.3,31.2],[34.8,29.5],[33.1,28.3],[33.7,27.5],[32.4,27.8],[33.2,25.7],[35.8,22.8],[37.3,20.5],[39.1,18],[40.2,16],[22,16]];
for(const land of [asia,africa])map.append(el('path',{d:path(land)+'Z',fill:'#f1e4c4',stroke:'#a68b60','stroke-width':1.6}));
map.append(el('path',{d:path([[48.2,30],[49.7,30.3],[50.2,29],[51.7,28],[52.8,27],[55,26.5],[56,25.5],[55.3,24.4],[54,24],[52,24.6],[50.7,25.6],[50,27],[48.8,28.7]])+'Z',fill:'#c6dcd6',stroke:'#a68b60','stroke-width':1.2}));
map.append(el('path',{d:path([[32.3,29.8],[32.6,28.5],[33.2,27.7],[34.1,26.6],[34.7,24.7],[36.2,22.5],[37.3,20.5],[39.2,18],[40,16],[41,16],[40.8,18.2],[38.8,21.4],[37.3,24],[36,27],[34.8,29.5],[34.3,28.3],[33.7,27.4],[33.1,28.3]])+'Z',fill:'#c6dcd6'}));
for(const river of [[[39,38.8],[38,37.8],[39,36],[41,35],[42.7,33.6],[44.1,32.6],[45.5,31],[47.5,30.5]],[[40.5,39],[42,37],[43,36],[43.7,34.6],[44.4,33.3],[45.9,32],[47.5,30.5]],[[32.5,16],[31.4,20],[32.8,24],[32.4,26],[31.3,28],[31.2,30],[30.5,31.2]]])map.append(el('path',{d:path(river),fill:'none',stroke:'#4d86a3','stroke-width':2.2}));
const cyprus=[[32.3,34.7],[33.7,34.6],[34.6,35.5],[33,35.3]];map.append(el('path',{d:path(cyprus)+'Z',fill:'#f1e4c4'}));
for(const [text,lon,lat,size,color]of [['СРЕДИЗЕМНОЕ МОРЕ',28.5,34.2,11,'#4b6f78'],['МАЛАЯ АЗИЯ',32,39.5,12,'#7a5426'],['МЕСОПОТАМИЯ',44.2,36.1,12,'#7a5426'],['ЕГИПЕТ',28.2,26.5,12,'#7a5426'],['АРАВИЯ',45,24.5,13,'#7a5426'],['КРАСНОЕ МОРЕ',38,21,8,'#4b6f78'],['Евфрат',41.7,34.2,10,'#426977'],['Тигр',44.7,34.1,10,'#426977'],['Нил',30.5,24,10,'#426977'],['ЛЕВАНТ',35.6,32.4,9,'#7a5426']]){const p=xy({lon,lat}),t=el('text',{x:p.x,y:p.y,fill:color,'font-size':Math.round(size*1.4),'text-anchor':'middle','font-family':'system-ui','letter-spacing':text===text.toUpperCase()?1:0});t.textContent=text;map.append(t);}
const markers=el('g');map.append(markers);
function drawMarkers(){markers.replaceChildren();if(!state.guess)return;const g=xy(state.guess);if(state.submitted){const d=xy(journey.scene.destination),radius=journey.scene.radiusKm,lat=journey.scene.destination.lat;markers.append(el('line',{x1:g.x,y1:g.y,x2:d.x,y2:d.y,stroke:'#4f46e5','stroke-width':2,'stroke-dasharray':'6 5'}));markers.append(el('ellipse',{cx:d.x,cy:d.y,rx:radius/111/Math.cos(lat*Math.PI/180)*20,ry:radius/111*20,fill:'#22c55e1c',stroke:'#15803d','stroke-width':1.4,'stroke-dasharray':'4 4'}));markers.append(el('circle',{cx:d.x,cy:d.y,r:7,fill:'#15803d',stroke:'#fff','stroke-width':2}));const t=el('text',{x:d.x,y:d.y-47,fill:'#166534','font-size':11,'text-anchor':'middle'});t.textContent='Область ответа';markers.append(t);}markers.append(el('circle',{cx:g.x,cy:g.y,r:11,fill:'#6366f133',stroke:'#4f46e5','stroke-width':1.5}),el('circle',{cx:g.x,cy:g.y,r:5,fill:'#4f46e5',stroke:'#fff','stroke-width':1.5}));}
function setGuess(lat,lon){if(state.submitted)return;state.guess={lat,lon};$('mapStatus').textContent=`Твоя отметка: ${lat.toFixed(1)}° с. ш. · ${lon.toFixed(1)}° в. д.`;$('clearGuess').hidden=false;drawMarkers();updateCompletion();}
map.addEventListener('click',e=>{if(state.submitted)return;const ctm=map.getScreenCTM();if(!ctm)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(ctm.inverse());if(p.x<0||p.x>680||p.y<0||p.y>540)return;$('regionSelect').value='';setGuess(43-p.y/20,22+p.x/20);});
$('regionSelect').onchange=e=>{if(e.target.value){const [lat,lon]=e.target.value.split(',').map(Number);setGuess(lat,lon);}};
$('clearGuess').onclick=()=>{if(state.submitted)return;state.guess=null;$('regionSelect').value='';$('mapStatus').textContent='Нажми на карту, чтобы поставить отметку';$('clearGuess').hidden=true;drawMarkers();updateCompletion();};
function useHint(){if(state.hints>=3||state.submitted)return;const text=journey.scene.hints[state.hints],p=document.createElement('p');p.textContent=`${state.hints+1}. ${text}`;$('hintList').append(p);$('mobileHintText').textContent=text;if(phoneQuery.matches)$('mobileHint').hidden=false;state.hints++;$('maxScore').textContent=`${5000-state.hints*150} очков`;if(state.hints===3){$('hintButton').textContent='Все подсказки открыты';$('hintButton').disabled=true;$('mobileHintButton').disabled=true;}}
$('hintButton').onclick=useHint;$('mobileHintButton').onclick=useHint;$('closeMobileHint').onclick=()=>$('mobileHint').hidden=true;
setInterval(()=>{if(document.hidden||state.submitted||!state.loaded)return;state.seconds++;$('timer').textContent=`${String(Math.floor(state.seconds/60)).padStart(2,'0')}:${String(state.seconds%60).padStart(2,'0')}`;},1000);
function scoreCard(title,score,detail){const card=document.createElement('div');card.className='score-card';const t=document.createElement('span'),s=document.createElement('b'),d=document.createElement('p');t.textContent=title;s.textContent=score;d.textContent=detail;card.append(t,s,d);return card;}
function loadScene(){
 state.loaded=false;
 $('loading').hidden=false;
 const icon=document.createElement('span'),message=document.createElement('span');
 icon.className='loading-orb';icon.textContent='✦';message.textContent='Открываем древний мир…';
 $('loading').replaceChildren(icon,message);
 viewer.load(journey.scene.image,journey.scene.camera);
}
function renderJourney(){
 $('campaignScore').textContent=journey.total.toLocaleString('ru-RU');
 $('campaignMax').textContent=`/ ${maxCampaignScore.toLocaleString('ru-RU')}`;
 $('campaignBest').textContent=best?`Рекорд: ${best.toLocaleString('ru-RU')}`:'Рекорд появится после первой партии';
 $('roundResults').replaceChildren();
 for(const [i,scene] of scenes.entries()){
  const r=journey.results[i],row=document.createElement('div'),name=document.createElement('span'),score=document.createElement('b');
  row.className='round-result';name.textContent=`${i+1}. ${r?scene.title:'Локация ещё не открыта'}`;
  score.textContent=r?r.total.toLocaleString('ru-RU'):'—';row.append(name,score);$('roundResults').append(row);
 }
}
$('submitGuess').onclick=()=>{
 if(state.submitted||!state.guess||!state.event||!state.epoch)return;
 const scene=journey.scene,r=journey.submit(state);state.submitted=true;
 setAnswerSheet(false);
 if($('scene').classList.contains('expanded'))$('expandButton').click();
 document.body.classList.add('has-result');$('mobileHint').hidden=true;$('mobileHintButton').disabled=true;
 $('resultMapSlot').append($('mapWrap'));
 if(journey.complete){
  best=Math.max(best,journey.total);
  try{localStorage.setItem('bible-world-journey-best-v3',String(best));}catch{}
 }
 showBest();updateCompletion();drawMarkers();renderJourney();
 $('hintButton').disabled=true;$('regionSelect').disabled=true;$('clearGuess').hidden=true;
 for(const radio of document.querySelectorAll('input[type=radio]'))radio.disabled=true;
 $('submitGuess').textContent='Предположение проверено ✓';
 $('scene').querySelector('.scene-label').textContent=scene.title;
 $('resultEyebrow').textContent=journey.complete?'Путешествие завершено':`Раунд ${journey.index+1} из ${scenes.length} завершён`;
 $('resultLocation').textContent=scene.subtitle;
 $('totalScore').textContent=(journey.complete?journey.total:r.total).toLocaleString('ru-RU');
 $('scoreLimit').textContent=`/ ${(journey.complete?maxCampaignScore:5000).toLocaleString('ru-RU')} очков`;
 $('resultTitle').textContent=journey.complete?'Три истории открыты!':r.total>=4500?'Прекрасное исследование!':r.total>=2500?'История становится яснее':'Новая история открыта';
 $('resultMessage').textContent=journey.complete?'Все три локации пройдены. Сравни результаты и попробуй побить свой рекорд.':r.total>=4500?'Ты узнал место, событие и эпоху.':r.story&&r.time?'Ты узнал историю и эпоху. Посмотри, где находится область ответа.':'Сравни свою версию с ответом и обрати внимание на детали сцены.';
 $('breakdownHeading').textContent=journey.complete?`Последняя локация: ${r.total.toLocaleString('ru-RU')} / 5000`:'Очки за эту локацию';
 const eventLabel=events.find(e=>e.id===scene.event).label,epochLabel=epochs.find(e=>e.id===scene.epoch).label;
 $('scoreBreakdown').replaceChildren(
  scoreCard('МЕСТО',`${r.place} / 2000`,r.distance<=scene.radiusKm?'Попадание в область ответа':`${Math.round(r.distance).toLocaleString('ru-RU')} км до игрового ориентира`),
  scoreCard('СОБЫТИЕ',`${r.story} / 2000`,r.story?`Верно: ${eventLabel}`:`Твой ответ: ${events.find(e=>e.id===state.event).label}. Ответ: ${eventLabel}.`),
  scoreCard('ЭПОХА',`${r.time} / 1000`,r.time?`Верно: ${epochLabel}`:`Твой ответ: ${epochs.find(e=>e.id===state.epoch).label}. Ответ: ${epochLabel}.`),
  scoreCard('ПОДСКАЗКИ',`−${r.penalty}`,`${state.hints} из 3 использовано`)
 );
 $('resultDescription').textContent=scene.description;$('resultEpoch').textContent=`Эпоха: ${scene.epochText}`;
 $('locationNote').textContent=scene.locationNote;$('verseReference').textContent=scene.reference;
 $('verseQuote').textContent=scene.quote;$('verseSource').textContent=scene.quoteSource;
 $('playAgain').textContent=journey.complete?'Новая партия ↺':'Следующая локация →';
 $('replayNote').textContent=journey.complete?'3 локации · до 15 000 очков за партию':`Осталось локаций: ${scenes.length-journey.results.length}. Твой счёт сохранён.`;
 $('result').hidden=false;activateTab('place');
 $('result').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
};
function startRound(){
 Object.assign(state,{guess:null,event:null,epoch:null,hints:0,submitted:false,seconds:0,loaded:false});
 document.body.classList.remove('has-result');
 $('mapHome').append($('mapWrap'));$('mobileHint').hidden=true;$('mobileHintButton').disabled=false;
 $('result').hidden=true;$('hintList').replaceChildren();
 $('hintButton').innerHTML='Подсказка <span>−150 очков</span>';$('hintButton').disabled=false;
 $('maxScore').innerHTML='5000 <small>очков</small>';$('timer').textContent='00:00';
 $('regionSelect').disabled=false;$('regionSelect').value='';$('clearGuess').hidden=true;
 $('mapStatus').textContent='Нажми на карту, чтобы поставить отметку';
 for(const r of document.querySelectorAll('input[type=radio]')){r.checked=false;r.disabled=false;}
 $('submitGuess').innerHTML='Проверить предположение <span>→</span>';
 $('scene').querySelector('.scene-label').textContent='Неизвестная локация';
 $('roundNumber').textContent=journey.index+1;$('roundTotal').textContent=`/ ${scenes.length}`;
 $('journeyScore').textContent=`${journey.total.toLocaleString('ru-RU')} / ${maxCampaignScore.toLocaleString('ru-RU')}`;
 drawMarkers();updateCompletion();activateTab('place');loadScene();
 window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
$('playAgain').onclick=()=>{
 if(journey.complete)journey.restart();else if(!journey.next())return;
 startRound();
};
$('helpButton').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();$('startPlaying').onclick=()=>$('helpDialog').close();$('helpDialog').addEventListener('click',e=>{if(e.target===$('helpDialog')){const r=$('helpDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('helpDialog').close();}});startRound();
