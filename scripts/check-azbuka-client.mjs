import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const source=fs.readFileSync('web/games/bible-azbuka.js','utf8');
const markup=fs.readFileSync('web/games/bible-azbuka.html','utf8');
const css=fs.readFileSync('web/games/bible-azbuka.css','utf8');
const storageKey='bible-azbuka-room-v2';
const current={code:'ABC234',hostId:'host',selfId:'host',mode:'stop',duration:60,phase:'lobby',round:0,rounds:5,
  letter:null,deadline:null,players:[{id:'host',name:'Мария',score:0,online:true}],messages:[],ownDraft:[[],[],[],[],[]]};
const wait=()=>new Promise(resolve=>setTimeout(resolve,25));

async function scenario(kind){
  const dom=new JSDOM('<!doctype html><body data-current-game="bible-azbuka"><div id="game-container"></div></body>',{
    url:'https://app.test',runScripts:'outside-only',pretendToBeVisual:true,
  });
  const w=dom.window;
  let exits=0,hidden=false;
  const requests=[];
  Object.defineProperty(w.document,'hidden',{get:()=>hidden});
  w.HTMLMediaElement.prototype.pause=()=>{};
  w.fetch=async url=>new Response(url.includes('.css')?css:markup);
  w.canPlayBibleAzbuka=()=>true;
  w.RoomInvite={consume:()=>null,closeQr(){}};
  w.Telegram={WebApp:{initDataUnsafe:{user:{first_name:'Мария'}}}};
  w.localStorage.setItem('bible-azbuka-rules-seen-v1','1');
  w.showToast=()=>{};
  w.goToMainMenu=()=>{exits++;w.BibleAzbuka.cleanup();w.document.body.dataset.currentGame='';};
  if(kind==='resume')w.localStorage.setItem(storageKey,JSON.stringify({code:current.code,nick:'Мария'}));
  w.AppAccess={azbukaRequest:async(path,payload,options)=>{
    requests.push({path,payload,options});
    if(kind==='resume')return Response.json({error:'Комната не найдена'},{status:404});
    if(path.endsWith('/leave')||path.endsWith('/offline'))return Response.json({ok:true,closed:true});
    if(path.endsWith('/draft')) return Response.json({ok:true});
    if(kind==='multiple-answers'&&path.endsWith('/check'))return Response.json({complete:true,rows:[
      [{word:'Давид',valid:true,reference:'1 Цар 16:21'},{word:'Даниил',valid:true,reference:'Езд 8:2'}],
      [{word:'Дамаск',valid:true}],[{word:'дуб',valid:true}],[{word:'дом',valid:true,reference:'Быт 19:2'}],
      [{word:'дромадер',valid:true,reference:'Ис 60:6'}],
    ]});
    return Response.json(['leave-playing','multiple-answers'].includes(kind)?{...current,phase:'playing',letter:'Д',roundId:'test-round'}:current);
  }};
  try{
    w.eval(source);
    await w.startBibleAzbukaGame();
    await wait();
    if(kind!=='resume'){
      const root=w.document.querySelector('#game-container > div').shadowRoot;
      root.getElementById('create').click();
      await wait();
      assert.equal(JSON.parse(w.localStorage.getItem(storageKey)).code,current.code);
      if(kind==='multiple-answers'){
        for(const [i,answer] of ['Давид Даниил','Дамаск','дуб','дом','дромадер'].entries()){
          const input=root.querySelector(`#entry-${i} input`);input.value=answer;input.dispatchEvent(new w.Event('input'));
        }
        root.getElementById('check').click();
        await wait();
        assert.deepEqual([...root.querySelectorAll('#entry-0 input')].map(input=>input.value),['Давид','Даниил']);
        assert.match(root.getElementById('review-4').textContent,/Ис 60:6/);
        assert.equal(root.getElementById('stop').disabled,false);
        root.getElementById('home').click();
      } else if(kind==='leave'||kind==='leave-playing'){
        assert.equal(root.getElementById('leave-row').hidden,false);
        root.getElementById('leave-room').click();
        assert(requests.some(r=>r.path===`${current.code}/leave`&&r.options.keepalive));
      } else if(kind==='home')root.getElementById('home').click();
      else {hidden=true;w.document.dispatchEvent(new w.Event('visibilitychange'));}
      await wait();
    }
    assert.equal(exits,1);
    assert.equal(JSON.parse(w.localStorage.getItem(storageKey)).code,'');
    if(kind==='hide')assert(requests.some(r=>r.path===`${current.code}/offline`&&r.options.keepalive&&r.payload.presenceSequence===2));
  }finally{w.BibleAzbuka?.cleanup();w.close();}
}

for(const kind of ['leave','leave-playing','home','hide','resume','multiple-answers'])await scenario(kind);
console.log('Azbuka returns to the main menu after the last player leaves, the app goes offline, or a saved room has expired.');
