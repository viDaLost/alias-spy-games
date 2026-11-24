import {scenes,levels,regions,events,epochs,createJourney,eventChoices,maxRoundScore} from './rules.mjs';
import {createPanorama} from './viewer.mjs?v=10';
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';

function setInsets(top, bottom) {
  const style = document.documentElement.style;
  style.setProperty('--chrome-top', `${Math.max(0, Number(top) || 0)}px`);
  style.setProperty('--chrome-bottom', `${Math.max(0, Number(bottom) || 0)}px`);
}
setInsets(params.get('chromeTop'), params.get('chromeBottom'));

let host;
try {
  if (parent !== window) host = parent.getBibleWorldHost?.(window);
} catch { /* A page on another origin cannot host this game. */ }

if (host) {
  document.getElementById('returnToApp').onclick = (event) => {
    event.preventDefault();
    host.exit();
  };
  window.addEventListener('message', (event) => {
    if (event.source !== parent || event.origin !== location.origin || event.data?.type !== 'game-frame:insets') return;
    setInsets(event.data.top, event.data.bottom);
  });
  parent.postMessage({ type: 'game-frame:need-insets' }, location.origin);
}

let access;
try { access = await host?.request(); } catch { /* Show the access screen below. */ }
if (access?.ok) {
  document.getElementById('accessScreen').hidden = true;
  document.getElementById('levelMenu').hidden = false;
  startGame();
} else {
  document.getElementById('accessMessage').textContent = !host
    ? 'Открой игру из каталога «Библейских игр».'
    : 'Не удалось проверить доступ. Вернись к играм и попробуй ещё раз.';
}

function startGame() {
const $=id=>document.getElementById(id),fmt=n=>n.toLocaleString('ru-RU'),steps=['place','event','epoch'],titles=['Где вы находитесь?','Что здесь происходит?','В какое время это было?'];
const state={active:false,guess:null,event:null,epoch:null,hints:0,submitted:false,loaded:false,seconds:0,step:0};let journey,cueTimer;
const key = (id, rounds) => rounds === 10 ? `bible-world-best-v5-${id}` : `bible-world-best-${rounds}-rounds-${id}`;
function best(id,limit){
 try{return Math.max(0,Math.min(limit,Number(localStorage.getItem(key(id, limit / maxRoundScore)))||0));}
 catch{return 0;}
}
let sceneRequest;
const levelIcons = ['◔', '◑', '◕'];

function renderLevels() {
 $('totalLocations').textContent = `${scenes.length} локаций`;
 const cards = $('levelCards');
 cards.replaceChildren();
 for (const [index, level] of levels.entries()) {
  const count = level.sceneIds.length;
  const record = best(level.id, count * maxRoundScore);
  const button = document.createElement('button');
  button.id = 'level-' + level.id;
  button.type = 'button';
  button.className = 'level-card';
  button.dataset.level = level.id;
  button.setAttribute('aria-haspopup', 'dialog');

  const mark = document.createElement('span');
  mark.className = 'level-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = levelIcons[index];

  const copy = document.createElement('span');
  copy.className = 'level-copy';
  const title = document.createElement('strong');
  title.textContent = level.label;
  const text = document.createElement('small');
  text.textContent = record ? `${count} локаций · Рекорд ${fmt(record)}` : `${count} локаций`;
  copy.append(title, text);
  const oldRecord = count > 10 && best(level.id, 10 * maxRoundScore);
  if (oldRecord) {
   const previous = document.createElement('small');
   previous.textContent = `Рекорд за 10 локаций: ${fmt(oldRecord)}`;
   copy.append(previous);
  }

  const chevron = document.createElement('span');
  chevron.className = 'level-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';
  button.append(mark, copy, chevron);
  button.onclick = () => openLocations(level);
  cards.append(button);
 }
}

function openLocations(level) {
 const dialog = $('locationDialog'), grid = $('locationNumbers');
 dialog.dataset.level = level.id;
 $('locationDifficulty').textContent = level.label + ' уровень';
 grid.replaceChildren();
 for (const [index] of level.sceneIds.entries()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'location-number';
  button.textContent = index + 1;
  button.setAttribute('aria-label', `Локация ${index + 1}`);
  button.onclick = () => startLevel(level.id, index);
  grid.append(button);
 }
 const start = $('startJourney');
 start.textContent = `Пройти все ${level.sceneIds.length} локаций`;
 start.onclick = () => startLevel(level.id);
 dialog.showModal();
}
$('exitGame').onclick = host.exit;
$('menuHelp').onclick = () => $('helpDialog').showModal();
$('closeLocations').onclick=()=>$('locationDialog').close();
function inert(){$('scene').inert=['answerDialog','resultDialog','helpDialog'].some(id=>$(id).open);}
function panoramaError(messageText = 'Не удалось загрузить панораму') {
 if (!state.active) return;
 const message = document.createElement('span');
 message.textContent = messageText;
 const retry = document.createElement('button');
 retry.textContent = 'Попробовать ещё раз';
 retry.className = 'outline-button';
 retry.onclick = loadScene;
 $('loading').replaceChildren(message, retry);
}

const viewer = createPanorama($('scene'), $('panoramaCanvas'), {
 onReady() {
  if (!state.active) return;
  state.loaded = true;
  $('loading').hidden = true;
  completion();
  clearTimeout(cueTimer);
  cueTimer = setTimeout(() => $('lookCue').hidden = true, 12000);
 },
 onError: () => panoramaError(),
});
$('zoomIn').onclick=()=>viewer.zoom(.82);$('zoomOut').onclick=()=>viewer.zoom(1.22);$('resetView').onclick=viewer.reset;
$('scene').addEventListener('pointermove',e=>{if(e.buttons||e.pressure)$('lookCue').hidden=true;});$('scene').addEventListener('keydown',e=>{if(e.key.startsWith('Arrow'))$('lookCue').hidden=true;});
function closeAnswers(){$('answerDialog').close();inert();if(state.active)$('openAnswers').focus({preventScroll:true});}
$('closeAnswers').onclick=closeAnswers;
$('closeResult').onclick=()=>{$('resultDialog').close();inert();$('openAnswers').focus({preventScroll:true});};
for(const [id,close] of [['locationDialog',()=>$('closeLocations').click()],['answerDialog',closeAnswers],['resultDialog',()=>$('closeResult').click()],['helpDialog',()=>$('closeHelp').click()]]){
 $(id).addEventListener('cancel',e=>{e.preventDefault();close();});$(id).addEventListener('close',inert);
 $(id).addEventListener('click',e=>{if(e.target!==$(id))return;const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();});
}
function values(){return [state.guess,state.event,state.epoch];}
function completion(){const v=values(),count=v.filter(Boolean).length;for(const [i,name] of steps.entries())$('tab-'+name).classList.toggle('done',!!v[i]);$('completionText').textContent=`Выбрано ${count} из 3`;$('nextAnswer').disabled=!v[state.step]||state.submitted;$('submitGuess').disabled=count!==3||state.submitted||!state.loaded;$('openAnswers').disabled=!state.loaded;$('dockLabel').textContent=state.submitted?'Результат':count===3?'Проверить ответ':'Дать ответ';$('dockCount').textContent=state.submitted?'✓':`${count} / 3`;}
function labelFor(i){return (i===0?regions:i===1?events:epochs).find(x=>x.id===(i===0?state.guess?.region:i===1?state.event:state.epoch))?.label||'Не выбрано';}
function review(){
 $('reviewAnswers').replaceChildren();
 for(const [i,label] of ['Место','Событие','Эпоха'].entries()){const button=document.createElement('button'),span=document.createElement('span'),small=document.createElement('small'),answer=document.createElement('b'),edit=document.createElement('i');small.textContent=label;answer.textContent=labelFor(i);edit.textContent='Изменить';span.append(small,answer);button.append(span,edit);button.onclick=()=>showStep(i);$('reviewAnswers').append(button);}
}
function showStep(i){state.step=i;$('answerPages').hidden=i===3;$('answerReview').hidden=i!==3;$('stepCounter').textContent=i===3?'Готово: 3 ответа':`Шаг ${i+1} из 3`;$('answerTitle').textContent=i===3?'Проверим ваш выбор':titles[i];for(const [n,name] of steps.entries()){const selected=n===i;$('tab-'+name).setAttribute('aria-selected',String(selected));$('tab-'+name).tabIndex=selected?0:-1;$('panel-'+name).hidden=!selected;}$('answerScroll').scrollTop=0;$('backAnswer').hidden=i===0;$('nextAnswer').hidden=i===3;$('submitGuess').hidden=i!==3;if(i===3)review();completion();if($('answerDialog').open)$(i===3?'submitGuess':'tab-'+steps[i]).focus({preventScroll:true});}
for(const [i,name] of steps.entries()){$('tab-'+name).onclick=()=>showStep(i);$('tab-'+name).addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();showStep(e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3);});}
$('backAnswer').onclick=()=>showStep(Math.max(0,state.step-1));$('nextAnswer').onclick=()=>{if(values()[state.step])showStep(state.step+1);};
function choices(name,list){$(name).replaceChildren();for(const item of list){const l=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),title=document.createElement('b');l.className='choice';input.type='radio';input.name=name;input.value=item.id;title.textContent=item.label;text.append(title);if(item.detail){const d=document.createElement('small');d.textContent=item.detail;text.append(d);}l.append(input,text);$(name).append(l);input.addEventListener('change',()=>{if(!input.checked||!state.active||state.submitted)return;if(name==='regions')state.guess={region:item.id};else state[name==='events'?'event':'epoch']=item.id;showStep(name==='regions'?1:name==='events'?2:3);});}}
$('openAnswers').onclick=()=>{if(!state.active||!state.loaded)return;if(state.submitted){$('resultDialog').showModal();inert();return;}showStep(values().every(Boolean)?3:Math.max(0,values().findIndex(v=>!v)));$('hintToast').hidden=true;$('answerDialog').showModal();inert();};
$('hintButton').onclick=()=>{if(!state.active||!state.loaded||state.submitted||state.hints===3)return;$('hintText').textContent=journey.scene.hints[state.hints++];$('hintCounter').textContent=`Подсказка ${state.hints} / 3 · −150 очков`;$('hintToast').hidden=false;$('lookCue').hidden=true;$('hintButton').disabled=state.hints===3;};$('closeHint').onclick=()=>$('hintToast').hidden=true;
setInterval(()=>{if(document.hidden||!state.active||state.submitted||!state.loaded||$('helpDialog').open)return;state.seconds++;$('timer').textContent=`${String(Math.floor(state.seconds/60)).padStart(2,'0')}:${String(state.seconds%60).padStart(2,'0')}`;},1000);
function card(label,score,detail){const div=document.createElement('div'),t=document.createElement('span'),b=document.createElement('b'),p=document.createElement('p');div.className='score-card';t.textContent=label;b.textContent=score;p.textContent=detail;div.append(t,b,p);return div;}
function result(r){const s=journey.scene,finishedJourney=journey.complete&&!journey.single;$('resultEyebrow').textContent=finishedJourney?'Уровень пройден':`Локация ${journey.index+1} из ${journey.roundCount} открыта`;$('resultTitle').textContent=finishedJourney?'Все истории открыты!':r.story===2000?'Вы узнали историю!':'История раскрыта';$('resultLocation').textContent=s.subtitle;$('resultMessage').textContent=finishedJourney?'Ваш итог за весь уровень. Ниже — детали последней истории.':'Сравните ответ с деталями, которые были вокруг вас.';$('totalScore').textContent=fmt(finishedJourney?journey.total:r.total);$('scoreLimit').textContent=`/ ${fmt(finishedJourney?journey.maxScore:maxRoundScore)} очков`;
 const answerRegion=regions.find(x=>x.id===s.region).label,answerEvent=events.find(x=>x.id===s.event).label,answerEpoch=epochs.find(x=>x.id===s.epoch).label;
 $('scoreBreakdown').replaceChildren(card('МЕСТО',`${r.place} / 2000`,state.guess?.region===s.region?'Верно: '+answerRegion:`Ваш выбор: ${labelFor(0)}. Ответ: ${answerRegion}.`),card('СОБЫТИЕ',`${r.story} / 2000`,r.story?'Верно':`Ваш выбор: ${labelFor(1)}. Ответ: ${answerEvent}.`),card('ЭПОХА',`${r.time} / 1000`,r.time?'Верно':`Ваш выбор: ${labelFor(2)}. Ответ: ${answerEpoch}.`),card('ПОДСКАЗКИ',`−${r.penalty}`,`${state.hints} из 3 использовано`));
 $('visualClues').replaceChildren();for(const clue of s.visualClues){const li=document.createElement('li');li.textContent=clue;$('visualClues').append(li);}
 for(const [id,text] of [['resultDescription',s.description],['resultEpoch','Эпоха: '+s.epochText],['locationNote',s.locationNote],['verseQuote',s.quote],['verseSource',s.quoteSource]])$(id).textContent=text;
 $('verseReference').textContent=`Открыть ${s.reference} ↗`;$('verseReference').href=s.sourceUrl;$('campaignSummary').hidden=!finishedJourney;$('campaignScore').textContent=fmt(journey.total);$('campaignBest').textContent=`Рекорд уровня: ${fmt(best(journey.levelId,journey.maxScore))}`;
 $('roundResults').replaceChildren();for(const [i,scene] of journey.scenes.entries()){const row=document.createElement('div'),name=document.createElement('span'),score=document.createElement('b');row.className='round-result';name.textContent=`${i+1}. ${scene.title}`;score.textContent=journey.results[i]?fmt(journey.results[i].total):'—';row.append(name,score);$('roundResults').append(row);}
 $('playAgain').textContent=journey.complete?'Сыграть ещё раз ↺':'Следующая локация →';$('resultScroll').scrollTop=0;$('resultDialog').showModal();inert();
}
$('submitGuess').onclick=()=>{if(state.submitted||!state.loaded||!values().every(Boolean))return;const r=journey.submit(state);state.submitted=true;closeAnswers();$('hintToast').hidden=true;$('lookCue').hidden=true;$('hintButton').disabled=true;if(journey.complete&&!journey.single){try{localStorage.setItem(key(journey.levelId, journey.roundCount),String(Math.max(best(journey.levelId,journey.maxScore),journey.total)));}catch{}}$('journeyScore').textContent=`${fmt(journey.total)} / ${fmt(journey.maxScore)}`;completion();result(r);};
async function loadScene() {
 sceneRequest?.abort();
 const request = new AbortController();
 sceneRequest = request;
 viewer.cancelLoad();
 state.loaded = false;
 $('loading').hidden = false;
 $('lookCue').hidden = false;
 completion();

 const orb = document.createElement('span');
 const message = document.createElement('span');
 orb.className = 'loading-orb';
 orb.textContent = '✦';
 message.textContent = 'Загружаем панораму…';
 $('loading').replaceChildren(orb, message);

 const scene = journey.scene;
 try {
  const response = await host.request(scene.image.split('/').pop(), request.signal);
  if (request.signal.aborted) return;
  if ([401, 403].includes(response.status)) {
   panoramaError('Сеанс завершился. Открой игру заново.');
   return;
  }
  if (!response.ok) throw new Error(`Panorama HTTP ${response.status}`);
  const image = await response.blob();
  if (request.signal.aborted) return;
  viewer.load(URL.createObjectURL(image), scene.camera);
 } catch {
  if (!request.signal.aborted) panoramaError();
 }
}
function startRound(){clearTimeout(cueTimer);for(const id of ['answerDialog','resultDialog'])if($(id).open)$(id).close();Object.assign(state,{active:true,guess:null,event:null,epoch:null,hints:0,submitted:false,loaded:false,seconds:0,step:0});$('hintToast').hidden=true;$('hintButton').disabled=false;$('timer').textContent='00:00';$('roundNumber').textContent=journey.index+1;$('roundTotal').textContent=` / ${journey.roundCount}`;$('journeyScore').textContent=`${fmt(journey.total)} / ${fmt(journey.maxScore)}`;choices('regions',regions);choices('events',eventChoices(journey.levelId,journey.scene.id));choices('epochs',epochs);showStep(0);inert();loadScene();}
function startLevel(id,index){
 journey=createJourney(id,index);
 $('locationDialog').close();
 $('levelLabel').textContent=levels.find(level=>level.id===id).label;
 $('chooseLevel').setAttribute('aria-label',journey.single?'Выбрать другую локацию':'Вернуться к уровням');
 $('backDestination').textContent=journey.single?'Локации':'Уровни';
 $('resultLevels').textContent=journey.single?'К локациям':'Уровни';
 $('levelMenu').hidden=true;
 $('gameView').hidden=false;
 document.body.classList.add('playing');
 startRound();
 viewer.redraw();
 $('scene').focus({preventScroll:true});
}
function menu(){
 state.active=false;
 sceneRequest?.abort();
 viewer.cancelLoad();
 clearTimeout(cueTimer);
 for(const id of ['answerDialog','resultDialog','helpDialog'])if($(id).open)$(id).close();
 $('gameView').hidden=true;
 $('levelMenu').hidden=false;
 document.body.classList.remove('playing');
 renderLevels();
 inert();
 const levelIndex=levels.findIndex(level=>level.id===journey.levelId);
 $('levelCards').children[levelIndex].focus({preventScroll:true});
 if(journey.single)openLocations(levels[levelIndex]);
}
$('chooseLevel').onclick=menu;$('resultLevels').onclick=menu;$('playAgain').onclick=()=>{if(journey.complete)journey.restart();else if(!journey.next())return;startRound();};
$('helpButton').onclick=()=>{$('helpDialog').showModal();inert();};$('closeHelp').onclick=()=>{$('helpDialog').close();inert();};$('startPlaying').onclick=()=>$('closeHelp').click();renderLevels();
}
