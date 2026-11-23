// «Библейская азбука» — Cloudflare Worker + SQLite-backed Durable Object.
// Builds from template by scripts/build.mjs; never trust a browser to score itself.
const SOURCE = 'https://alias-spy-games-bible-words-preview.vitaledanilov.workers.dev';
const CATEGORIES = ['Имя', 'Город или местность', 'Растение', 'Предмет', 'Животное'];
const LETTERS = [...'АБВГДЕИКЛМНОПРСТ'];
const MAX_PLAYERS = 16;
const ROUND_COUNT = 5;
const PAGE = '__BIBLE_AZBUKA_HTML__';
let dictionaryRequest;
const normalize = value => String(value ?? '').normalize('NFC').toLocaleLowerCase('ru')
  .replace(/ё/g, 'е').replace(/\u0301/g, '').replace(/[‐‑–—]/g, '-').trim().replace(/\s+/g, ' ');
const clean = (value, limit = 80) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit);
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }
});
const error = (message, status = 400, extra = {}) => json({error:message,...extra},status);
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map(x=>x.toString(16).padStart(2,'0')).join('');
const code = () => [...crypto.getRandomValues(new Uint8Array(6))].map(n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join('');
const candidates = data => Array.from({length:5},(_,i)=>{
  const words = Array.isArray(data?.[i]) ? data[i] : [];
  return [...new Set(words.slice(0,3).map(x=>clean(x)).filter(Boolean).map(x=>x.slice(0,80)))];
});
const userView = p => ({id:p.id,name:p.name,score:p.score,ready:!!p.ready,online:Date.now()-p.lastSeen<20000});
async function bible(env) {
  if (!dictionaryRequest) dictionaryRequest = env.SYNODAL_SOURCE.fetch('https://synodal/synodal/game.json?v=3')
    .then(r=>{if(!r.ok) throw new Error('Синодальный словарь недоступен');return r.json()})
    .catch(e=>{dictionaryRequest=null;throw e});
  return dictionaryRequest;
}
function validate(dictionary, words, letter) {
  return words.map(word=>{
    const key=normalize(word);
    if (!key) return {word,valid:false,reason:'Пустой ответ'};
    if (!/^[а-яё]/i.test(key) || key[0]!==normalize(letter)) return {word,valid:false,reason:'Другая начальная буква'};
    const record=dictionary.answers[key];
    if (!record) return {word,valid:false,reason:'Не подтверждено словарём'};
    return {word,valid:true,key:normalize(record[0]),canonical:record[0],reference:record[2]};
  });
}
function suggest(category, word, letter) {
  const key=normalize(word);
  if(!key || key[0]!==normalize(letter))return [];
  const option=category.options||[];
  // Small edit-distance check for typo suggestions; never scores them without user confirmation.
  function distance(a,b) {
    if(Math.abs(a.length-b.length)>2) return 4;
    let p=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      const n=[i];
      for(let j=1;j<=b.length;j++)n[j]=Math.min(n[j-1]+1,p[j]+1,p[j-1]+Number(a[i-1]!==b[j-1]));
      p=n;
    }
    return p[b.length];
  }
  return option.filter(v=>normalize(v)[0]===normalize(letter)).map(v=>({v,d:distance(key,normalize(v))}))
    .filter(x=>x.d>0&&x.d<=2).sort((a,b)=>a.d-b.d||a.v.localeCompare(b.v,'ru'))
    .slice(0,3).map(x=>x.v);
}
function publicRoom(r, player) {
  return {code:r.code,hostId:r.hostId,selfId:player.id,mode:r.mode,duration:r.duration,
    phase:r.phase,round:r.round,rounds:ROUND_COUNT,letter:r.letter,
    remaining:r.deadline?Math.max(0,Math.ceil((r.deadline-Date.now())/1000)):null,
    players:r.players.map(userView),messages:r.messages.slice(-50),
    ownDraft:player.answers,results:r.phase==='results'||r.phase==='finished'?r.results:null,
    finished:r.phase==='finished'};
}
export class AzbukaRoom {
  constructor(state,env) {
    this.state=state;this.env=env;this.room=null;this.queue=Promise.resolve();
    this.ready=state.blockConcurrencyWhile(async()=>{this.room=await state.storage.get('room')||null;});
  }
  async fetch(request) {
    const work=()=>this.perform(request);
    const running=this.queue.then(work,work);
    this.queue=running.catch(()=>{});
    return running;
  }
  async alarm() {
    const work=async()=>{await this.ready; if(this.room?.phase==='playing' && this.room.deadline && Date.now()>=this.room.deadline)await this.finish('time');};
    const running=this.queue.then(work,work);this.queue=running.catch(()=>{});return running;
  }
  async store() {await this.state.storage.put('room',this.room);}
  async finish(reason, stopper=null) {
    const r=this.room;
    if(!r||r.phase!=='playing')return;
    const dict=await bible(this.env);
    const checks=r.players.map(p=>p.answers.map((words,i)=>validate(dict.categories[i],words,r.letter)));
    const frequencies=Array.from({length:5},()=>new Map());
    checks.forEach(rows=>rows.forEach((list,cat)=>{
      const unique=new Set(list.filter(x=>x.valid).map(x=>x.key));
      unique.forEach(key=>frequencies[cat].set(key,(frequencies[cat].get(key)||0)+1));
    }));
    const results=r.players.map((player,index)=>{
      let added=0;
      const chosen=checks[index].map((list,cat)=>{
        const valid=list.filter(x=>x.valid).filter((v,i,a)=>a.findIndex(t=>t.key===v.key)===i);
        valid.sort((a,b)=>(frequencies[cat].get(a.key)||99)-(frequencies[cat].get(b.key)||99));
        const pick=valid[0]||null;
        const points=pick?(frequencies[cat].get(pick.key)===1?10:5):0;
        added+=points;
        return {category:CATEGORIES[cat],points,word:pick?.canonical||'—',reference:pick?.reference||null,
          all:list.map(x=>({word:x.word,valid:x.valid,reason:x.reason||null}))};
      });
      player.score+=added;
      return {id:player.id,name:player.name,added,total:player.score,answers:chosen};
    }).sort((a,b)=>b.total-a.total);
    r.results={reason,stopper:stopper? r.players.find(p=>p.id===stopper)?.name:null,players:results};
    r.deadline=null;
    r.phase=r.round+1>=ROUND_COUNT?'finished':'results';
    await this.store();
  }
  async perform(request) {
    await this.ready;
    const url=new URL(request.url);
    const action=url.pathname.replace(/^\//,'');
    let input={};
    if(request.method==='POST') {
      try{input=await request.json();}catch{return error('Некорректный JSON');}
    }
    if(action==='init') {
      if(this.room)return error('Код уже занят',409);
      const nick=clean(input.name,28);
      if(nick.length<2)return error('Укажи имя от 2 символов');
      const duration=[30,60,90].includes(input.duration)?input.duration:60;
      const mode=input.mode==='stop'?'stop':'timed';
      const token=randomToken(),id=randomToken().slice(0,16);
      this.room={code:input.code,created:Date.now(),hostId:id,mode,duration,phase:'lobby',round:0,
        letter:null,deadline:null,used:[],results:null,
        players:[{id,name:nick,token,score:0,answers:candidates([]),lastSeen:Date.now(),ready:false}],
        messages:[{id:randomToken().slice(0,12),system:true,text:'Комната создана. Приглашайте друзей!',at:Date.now()}]};
      await this.store();return json({token,room:publicRoom(this.room,this.room.players[0])});
    }
    const r=this.room;
    if(!r)return error('Комната не найдена',404);
    if(action==='join'){
      if(r.phase!=='lobby')return error('Игра уже началась — присоединиться нельзя',409);
      if(r.players.length>=MAX_PLAYERS)return error('Комната заполнена',409);
      const name=clean(input.name,28);
      if(name.length<2)return error('Укажи имя от 2 символов');
      if(r.players.some(p=>normalize(p.name)===normalize(name)))return error('Это имя уже занято');
      const token=randomToken();
      const player={id:randomToken().slice(0,16),token,name,score:0,answers:candidates([]),lastSeen:Date.now(),ready:false};
      r.players.push(player);await this.store();
      return json({token,room:publicRoom(r,player)});
    }
    const bearer=request.headers.get('Authorization')||'';
    const player=r.players.find(p=>bearer==='Bearer '+p.token);
    if(!player)return error('Требуется вход в комнату',401);
    player.lastSeen=Date.now();
    if(r.phase==='playing'&&r.deadline&&Date.now()>=r.deadline)await this.finish('time');
    if(action==='state'){return json(publicRoom(r,player));}
    if(request.method!=='POST')return error('Метод не поддерживается',405);
    if(action==='settings'){
      if(player.id!==r.hostId||r.phase!=='lobby')return error('Настройки меняет только ведущий в лобби',403);
      r.mode=input.mode==='stop'?'stop':'timed';
      r.duration=[30,60,90].includes(input.duration)?input.duration:60;
      await this.store();return json(publicRoom(r,player));
    }
    if(action==='chat'){
      const text=clean(input.text,240);
      if(!text)return error('Пустое сообщение');
      if(player.lastMessage&&Date.now()-player.lastMessage<1100)return error('Сообщения отправляются не чаще раза в секунду',429);
      player.lastMessage=Date.now();
      r.messages.push({id:randomToken().slice(0,12),from:player.id,name:player.name,text,at:Date.now()});
      r.messages=r.messages.slice(-50);await this.store();return json(publicRoom(r,player));
    }
    if(action==='start'){
      if(player.id!==r.hostId)return error('Начать раунд может только ведущий',403);
      if(!['lobby','results','finished'].includes(r.phase))return error('Раунд уже начат',409);
      if(r.players.length<2)return error('Для онлайн-игры нужны минимум два игрока');
      if(r.phase==='finished'){r.round=0;r.used=[];r.players.forEach(p=>p.score=0);}
      else if(r.phase==='results')r.round+=1;
      const dict=await bible(this.env);
      const usable=LETTERS.filter(letter=>dict.categories.every(c=>(c.options||[]).some(w=>normalize(w)[0]===normalize(letter))));
      const pool=usable.filter(letter=>!r.used.includes(letter));
      if(!pool.length)return error('Нет подходящих букв в словаре');
      r.letter=pool[crypto.getRandomValues(new Uint32Array(1))[0]%pool.length];
      r.used.push(r.letter);r.results=null;r.phase='playing';
      r.deadline=r.mode==='timed'?Date.now()+r.duration*1000:null;
      r.players.forEach(p=>{p.answers=candidates([]);p.ready=false;});
      await this.store();
      if(r.deadline)await this.state.storage.setAlarm(r.deadline);
      return json(publicRoom(r,player));
    }
    if(action==='draft'||action==='check'||action==='stop'){
      if(r.phase!=='playing')return error('Сейчас ответы не принимаются',409);
      if(action==='draft'||action==='stop') {
        player.answers=candidates(input.answers);
        player.ready=player.answers.every(x=>x.some(Boolean));
        await this.store();
      }
      if(action==='draft')return json({ok:true,at:Date.now()});
      const dict=await bible(this.env);
      const all=player.answers.map((words,i)=>validate(dict.categories[i],words,r.letter));
      if(action==='check') {
        // Validate submitted form without changing saved draft.
        const rows=candidates(input.answers).map((words,i)=>validate(dict.categories[i],words,r.letter));
        return json({rows:rows.map((list,i)=>list.map(x=>x.valid?x:{...x,suggestions:suggest(dict.categories[i],x.word,r.letter)})),
          complete:rows.every(list=>list.some(x=>x.valid))});
      }
      if(r.mode!=='stop')return error('В режиме на время остановка отключена',409);
      const invalid=all.map((list,i)=>list.some(x=>x.valid)?-1:i).filter(i=>i>=0);
      if(invalid.length)return error('Для СТОП нужен подтверждённый ответ в каждой категории',422,{invalid});
      await this.finish('stop',player.id);return json(publicRoom(r,player));
    }
    return error('Неизвестная команда',404);
  }
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/favicon.ico')return Response.redirect(url.origin+'/icon.webp',302);
    if(url.pathname.startsWith('/synodal/')) {
      // The verified RUSSYN dataset stays on the existing preview; don't duplicate it.
      const remote=await env.SYNODAL_SOURCE.fetch('https://synodal'+url.pathname,{headers:{Accept:'application/json'}});
      const h=new Headers(remote.headers);h.set('cache-control','public,max-age=3600');
      return new Response(remote.body,{status:remote.status,headers:h});
    }
    if(url.pathname.startsWith('/branding/')) {
      const remote=await env.SYNODAL_SOURCE.fetch('https://synodal'+url.pathname);
      const h=new Headers(remote.headers);h.set('cache-control','public,max-age=86400');
      return new Response(remote.body,{status:remote.status,headers:h});
    }
    if(url.pathname==='/vendor/qrcode.min.js'){
      const remote=await fetch('https://raw.githubusercontent.com/viDaLost/alias-spy-games/main/cloudflare/full-preview/public/vendor/qrcode.min.js');
      if(!remote.ok)return new Response('QR unavailable',{status:503});
      return new Response(remote.body,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'public,max-age=86400'}});
    }
    if(url.pathname==='/vendor/jsqr.min.js'){
      let remote=await fetch('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js');
      if(!remote.ok)remote=await fetch('https://raw.githubusercontent.com/cozmo/jsQR/master/dist/jsQR.js');
      if(!remote.ok)return new Response('QR scanner unavailable',{status:503});
      return new Response(remote.body,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'public,max-age=86400','x-content-type-options':'nosniff'}});
    }
    if(url.pathname==='/icon.webp'){
      const remote=await fetch('https://raw.githubusercontent.com/viDaLost/alias-spy-games/b229e104584736858de4accdd2117bc95fbc29e1/web/assets/icons/bible-azbuka.webp');
      if(remote.ok)return new Response(remote.body,{headers:{'content-type':'image/webp','cache-control':'public,max-age=86400'}});
      return new Response('Not found',{status:404});
    }
    if(url.pathname==='/api/create'&&request.method==='POST'){
      let data;
      try{data=await request.json();}catch{return error('Некорректный запрос');}
      for(let attempt=0;attempt<8;attempt++){
        const roomCode=code();
        const stub=env.ROOMS.get(env.ROOMS.idFromName(roomCode));
        const r=await stub.fetch('https://room/init',{method:'POST',body:JSON.stringify({...data,code:roomCode})});
        if(r.status!==409)return r;
      }
      return error('Не удалось создать комнату',503);
    }
    const match=/^\/api\/([A-Z2-9]{6})\/(join|state|settings|chat|start|draft|check|stop)$/.exec(url.pathname);
    if(match){
      const stub=env.ROOMS.get(env.ROOMS.idFromName(match[1]));
      const headers=new Headers(request.headers);headers.set('content-type','application/json');
      return stub.fetch(new Request('https://room/'+match[2],{method:request.method,headers,
        body:request.method==='POST'?request.body:undefined}));
    }
    if(url.pathname==='/'||url.pathname==='/index.html')return new Response(PAGE,{headers:{
      'content-type':'text/html; charset=utf-8','cache-control':'no-store',
      'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin',
      'content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors *"
    }});
    return new Response('Not found',{status:404});
  }
};