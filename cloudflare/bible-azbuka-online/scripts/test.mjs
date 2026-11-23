import assert from 'node:assert/strict';
import {AzbukaRoom} from '../dist/worker.mjs';

const letters=[...'АБВГДЕИКЛМНОПРСТ'];
const cats=Array.from({length:5},()=>({options:[],answers:{}}));
for(const c of cats)for(const l of letters){
  const base=l.toLocaleLowerCase('ru');
  for(const suffix of ['мир','зар','дом']){
    const name=base+suffix;
    c.options.push(name);
    c.answers[name]=[name,1,'GEN 1:1',name];
  }
}
const data={categories:cats};
const environment={SYNODAL_SOURCE:{fetch:async()=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}})}};
function makeRoom(){
  const map=new Map(),storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,structuredClone(v)),setAlarm:async()=>{}};
  const state={storage,blockConcurrencyWhile:async fn=>fn()};
  return new AzbukaRoom(state,environment);
}
const invoke=async(room,path,body,token)=>{
  const r=await room.fetch(new Request('https://room/'+path,{method:body?'POST':'GET',
    headers:{'content-type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    body:body?JSON.stringify(body):undefined}));
  return {status:r.status,...await r.json()};
};
const initial=await makeRoom();
const host=await invoke(initial,'init',{code:'TEST42',name:'Мария',mode:'stop'});
assert.equal(host.status,200);
const guest=await invoke(initial,'join',{name:'Анна'});
assert.equal(guest.status,200);
assert.equal(guest.room.players.length,2);
const hostToken=host.token,guestToken=guest.token;
assert.equal((await invoke(initial,'state',null,'invalid')).status,401);
assert.equal((await invoke(initial,'settings',{mode:'timed',duration:999},guestToken)).status,403);
const start=await invoke(initial,'start',{},hostToken);
assert.equal(start.phase,'playing');
assert.equal(start.mode,'stop');
assert.equal(start.players.length,2);
assert.equal((await invoke(initial,'join',{name:'Третий'})).status,409);
const first=start.letter.toLocaleLowerCase('ru');
const ourAnswers=Array.from({length:5},()=>[[first+'мир',first+'зар'][0],first+'зар']);
const theirAnswers=Array.from({length:5},()=>[first+'мир']);
const invalid=await invoke(initial,'check',{answers:Array.from({length:5},()=>['совсем другая буква'])},hostToken);
assert.equal(invalid.complete,false);
assert.equal((await invoke(initial,'stop',{answers:[[''],[],[],[],[]]},hostToken)).status,422);
const reviewed=await invoke(initial,'check',{answers:ourAnswers},hostToken);
assert.equal(reviewed.complete,true);
assert(reviewed.rows.every(row=>row.every(x=>x.valid)));
await invoke(initial,'draft',{answers:theirAnswers},guestToken);
const state=await invoke(initial,'state',null,hostToken);
assert.deepEqual(Object.keys(state.players[1]).sort(),['id','name','online','ready','score'].sort());
const result=await invoke(initial,'stop',{answers:ourAnswers},hostToken);
assert.equal(result.phase,'results');
assert.equal(result.results.reason,'stop');
const maria=result.results.players.find(x=>x.name==='Мария');
const anna=result.results.players.find(x=>x.name==='Анна');
assert.equal(maria.added,50);
assert.equal(anna.added,25);
assert(maria.answers.every(x=>x.points===10&&x.word===first+'зар'));
assert(anna.answers.every(x=>x.points===5));
const next=await invoke(initial,'start',{},hostToken);
assert.equal(next.phase,'playing');
assert.equal(next.round,1);
assert.notEqual(next.letter,start.letter);
const timed=makeRoom();
const tHost=await invoke(timed,'init',{code:'TIMED2',name:'Руфь',mode:'timed',duration:30});
await invoke(timed,'join',{name:'Лия'});
const tStart=await invoke(timed,'start',{},tHost.token);
assert.equal(tStart.phase,'playing');
assert(tStart.remaining<=30&&tStart.remaining>=28);
assert.equal((await invoke(timed,'stop',{answers:ourAnswers},tHost.token)).status,409);
timed.room.deadline=Date.now()-1;
const tEnd=await invoke(timed,'state',null,tHost.token);
assert.equal(tEnd.phase,'results');
assert.equal(tEnd.results.reason,'time');
console.log('PASS: lobby, authorization, QR-ready codes, private drafts, validation, unique scoring, rounds, timers');
