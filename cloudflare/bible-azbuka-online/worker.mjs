import dictionary from './synodal-dictionary.json' with { type: 'json' };
const CATEGORIES = ['Имя', 'Город или местность', 'Растение', 'Предмет', 'Животное'];
const LETTERS = [...'АБВГДЕИКЛМНОПРСТ'];
const MAX_PLAYERS = 16;
const ROUND_COUNT = 5;
const ONLINE_TIMEOUT = 20_000;
const ROOM_LIFETIME = 5 * 60 * 60_000;
const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const DIRECTORY_NAME = 'azbuka-room-directory';
const directoryStub = env => env.ROOMS.get(env.ROOMS.idFromName(DIRECTORY_NAME));
const onlineUntil = player => player.lastSeen > 0 ? player.lastSeen + ONLINE_TIMEOUT : 0;
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
const userView = p => ({id:p.id,name:p.name,score:p.score,ready:!!p.ready,online:Date.now()-p.lastSeen<ONLINE_TIMEOUT});
function validate(dictionary, words, letter) {
  return words.map(word=>{
    const key=normalize(word);
    if (!key) return {word,valid:false,reason:'Пустой ответ'};
    if (!/^[а-яё]/i.test(key) || key[0]!==normalize(letter)) return {word,valid:false,reason:'Другая начальная буква'};
    const record=Object.hasOwn(dictionary.answers,key)?dictionary.answers[key]:null;
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
    deadline:r.deadline,
    remaining:r.deadline?Math.max(0,Math.ceil((r.deadline-Date.now())/1000)):null,
    players:r.players.map(userView),messages:r.messages.slice(-50),
    ownDraft:player.answers,results:r.phase==='results'||r.phase==='finished'?r.results:null,
    finished:r.phase==='finished'};
}
export class AzbukaRoom {
  constructor(state,env) {
    this.state=state;this.env=env;this.room=null;this.queue=Promise.resolve();
    this.lastOnlineUntil=0;this.connections={};this.registered=false;this.registerRetryAt=0;
    this.ready=state.blockConcurrencyWhile(async()=>{
      const stored=await state.storage.get('room');
      if(stored==null)return;
      // Old room formats may remain in storage even though their clients are
      // gone. Read them without preventing the expiration check from running.
      let record=stored;
      if(typeof record==='string'){
        try{record=JSON.parse(record);}catch{record={};}
      }
      if(!record||typeof record!=='object'||Array.isArray(record))record={};
      const players=Array.isArray(record.players)?record.players:
        record.players&&typeof record.players==='object'?Object.values(record.players):[];
      this.room={...record,created:Number(record.created)||0,players:players.filter(player=>player&&typeof player==='object')};
      const presence=await state.storage.get('presence');
      for(const player of this.room.players){
        const lastSeen=Number(presence?.players?.[player.id]??player.lastSeen??0);
        player.lastSeen=Number.isFinite(lastSeen)?lastSeen:0;
        this.connections[player.id]=presence?.connections?.[player.id]||{
          legacy:{at:player.lastSeen,sequence:0,updatedAt:player.lastSeen},
        };
      }
      this.refreshOnlineDeadline();
    });
  }
  async fetch(request) {
    const work=async()=>{
      const response=await this.perform(request);
      await this.scheduleAlarm();
      await this.registerRoom();
      return response;
    };
    const running=this.queue.then(work,work);
    this.queue=running.catch(()=>{});
    return running;
  }
  async alarm() {
    const work=async()=>{
      await this.ready;
      await this.expireRoom();
      if(this.room?.phase==='playing' && this.room.deadline && Date.now()>=this.room.deadline)await this.finish('time');
      await this.scheduleAlarm();
      await this.registerRoom();
    };
    const running=this.queue.then(work,work);this.queue=running.catch(()=>{});return running;
  }
  async store() {await this.state.storage.put('room',this.room);}
  presence() {
    return {until:this.lastOnlineUntil,players:Object.fromEntries(this.room.players.map(player=>[player.id,player.lastSeen])),connections:this.connections};
  }
  refreshOnlineDeadline() {
    this.lastOnlineUntil=Math.max(0,...this.room.players.map(onlineUntil));
  }
  markPresence(player,input,online=true) {
    const now=Date.now();
    const id=/^[a-f0-9]{32}$/.test(input?.presenceId||'')&&Number.isSafeInteger(input.presenceSequence)&&input.presenceSequence>=0?input.presenceId:'legacy';
    const sequence=id==='legacy'?0:input.presenceSequence;
    const connections=this.connections[player.id]||={};
    // A delayed poll from an already closed tab must not bring it back online.
    if(id!=='legacy'&&connections[id]&&sequence<=connections[id].sequence)return;
    connections[id]={at:online?now:0,sequence,updatedAt:now};
    for(const [key,entry] of Object.entries(connections)){
      if(entry.updatedAt<now-60_000)delete connections[key];
    }
    player.lastSeen=Math.max(0,...Object.values(connections).map(entry=>entry.at));
    this.refreshOnlineDeadline();
  }
  async touch(player,input,online=true) {
    this.markPresence(player,input,online);
    await this.state.storage.put('presence',this.presence());
  }
  async storeMembership() {
    await this.state.storage.put({room:this.room,presence:this.presence()});
  }
  async removeRoom() {
    const {code,created}=this.room;
    await this.state.storage.delete(['room','presence']);
    this.room=null;
    this.connections={};
    this.lastOnlineUntil=0;
    this.registered=false;
    this.registerRetryAt=0;
    await this.state.storage.deleteAlarm();
    if(this.env?.ROOMS&&ROOM_CODE.test(code)){
      await directoryStub(this.env).fetch('https://room/directory/remove',{
        method:'POST',body:JSON.stringify({code,created}),
      }).catch(()=>{});
    }
  }
  expiresAt() {
    return Math.min((this.room.created||0)+ROOM_LIFETIME,this.lastOnlineUntil);
  }
  async expireRoom() {
    if(this.room&&Date.now()>=this.expiresAt())await this.removeRoom();
  }
  async scheduleAlarm() {
    if(!this.room)return;
    const next=Math.min(this.expiresAt(),this.room.phase==='playing'&&this.room.deadline?this.room.deadline:Infinity);
    const scheduled=await this.state.storage.getAlarm();
    if(scheduled===null||next<scheduled)await this.state.storage.setAlarm(next);
  }
  async registerRoom() {
    if(!this.room||!this.env?.ROOMS||this.registered||Date.now()<this.registerRetryAt)return;
    this.registerRetryAt=Date.now()+60_000;
    const {code,created}=this.room;
    try{
      const response=await directoryStub(this.env).fetch('https://room/directory/register',{
        method:'POST',body:JSON.stringify({code,created}),
      });
      this.registered=response.ok;
    }catch{/* Room play must continue even if the admin directory is unavailable. */}
  }
  async directory(request,action) {
    const storage=this.state.storage;
    if(action==='directory/list'&&request.method==='GET'){
      const entries=await storage.list({prefix:'room:'});
      const rooms=[],expired=[];
      for(const [key,item] of entries){
        if(item.created+ROOM_LIFETIME<=Date.now())expired.push(key);
        else rooms.push(item);
      }
      if(expired.length)await storage.delete(expired);
      return json({ok:true,rooms:rooms.sort((a,b)=>b.created-a.created)});
    }
    if(request.method!=='POST'||!['directory/register','directory/remove'].includes(action))return error('Не найдено',404);
    const {code,created}=await request.json();
    if(!ROOM_CODE.test(code)||!Number.isFinite(created))return error('Некорректная комната');
    const key='room:'+code;
    if(action==='directory/register'){
      if(created+ROOM_LIFETIME>Date.now())await storage.put(key,{code,created});
    }else if((await storage.get(key))?.created===created)await storage.delete(key);
    return json({ok:true});
  }
  observe() {
    const r=this.room;
    if(!r||!r.players.some(player=>player.accountId))return error('Комната не найдена или уже закрыта',404);
    return json({ok:true,code:r.code,status:r.phase,mode:r.mode,letter:r.letter,round:r.phase==='lobby'?0:r.round+1,
      rounds:ROUND_COUNT,duration:r.duration,deadline:r.deadline,created:r.created,expiresAt:this.expiresAt(),
      hardExpiresAt:r.created+ROOM_LIFETIME,players:r.players.map(p=>({...userView(p),host:p.id===r.hostId})),
      log:r.messages.slice(-12).map(m=>m.system?m.text:`${m.name}: ${m.text}`)});
  }
  async finish(reason, stopper=null) {
    const r=this.room;
    if(!r||r.phase!=='playing')return;
    const checks=r.players.map(p=>p.answers.map((words,i)=>validate(dictionary.categories[i],words,r.letter)));
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
    const action=url.pathname.slice(1);
    if(action.startsWith('directory/'))return this.directory(request,action);
    const existed=Boolean(this.room);
    await this.expireRoom();
    const accountId=request.headers.get('X-Azbuka-Account') || '';
    if (!/^[1-9]\d{4,19}$/.test(accountId)) return error('Требуется подтверждённый вход',401);
    if(action==='observe'&&request.method==='GET')return this.observe();
    if(action==='sweep'&&request.method==='POST')return json({ok:true,status:this.room?'active':existed?'closed':'missing'});
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
      const id=randomToken().slice(0,16);
      this.room={code:input.code,created:Date.now(),hostId:id,mode,duration,phase:'lobby',round:0,
        letter:null,deadline:null,used:[],results:null,
        players:[{id,accountId,name:nick,score:0,answers:candidates([]),lastSeen:Date.now(),ready:false}],
        messages:[{id:randomToken().slice(0,12),system:true,text:'Комната создана. Приглашайте друзей!',at:Date.now()}]};
      this.markPresence(this.room.players[0],input);
      await this.storeMembership();return json(publicRoom(this.room,this.room.players[0]));
    }
    const r=this.room;
    if(!r||!r.players.some(player=>player.accountId))return error('Комната не найдена',404);
    const member=r.players.find(p=>p.accountId===accountId);
    if(member&&r.phase==='playing'&&r.deadline&&Date.now()>=r.deadline)await this.finish('time');
    if(action==='join'){
      if(member){await this.touch(member,input);return json(publicRoom(r,member));}
      if(r.phase!=='lobby')return error('Игра уже началась — присоединиться нельзя',409);
      if(r.players.length>=MAX_PLAYERS)return error('Комната заполнена',409);
      const name=clean(input.name,28);
      if(name.length<2)return error('Укажи имя от 2 символов');
      if(r.players.some(p=>normalize(p.name)===normalize(name)))return error('Это имя уже занято');
      const player={id:randomToken().slice(0,16),accountId,name,score:0,answers:candidates([]),lastSeen:Date.now(),ready:false};
      r.players.push(player);
      this.markPresence(player,input);
      await this.storeMembership();
      return json(publicRoom(r,player));
    }
    const player=member;
    if(!player)return error('Требуется вход в комнату',401);
    if(action==='offline'&&request.method==='POST'){
      await this.touch(player,input,false);
      await this.expireRoom();
      return json({ok:true,closed:!this.room});
    }
    await this.touch(player,input);
    if(action==='state'){return json(publicRoom(r,player));}
    if(request.method!=='POST')return error('Метод не поддерживается',405);
    if(action==='leave'){
      if(r.phase!=='lobby')return error('Партия уже началась',409);
      r.players=r.players.filter(p=>p!==player);
      delete this.connections[player.id];
      if(r.hostId===player.id)r.hostId=r.players[0]?.id || null;
      this.refreshOnlineDeadline();
      if(!r.hostId||this.lastOnlineUntil<=Date.now()){
        await this.removeRoom();
      }else{
        await this.storeMembership();
      }
      return json({ok:true,closed:!this.room});
    }
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
      const usable=LETTERS.filter(letter=>dictionary.categories.every(c=>(c.options||[]).some(w=>normalize(w)[0]===normalize(letter))));
      const pool=usable.filter(letter=>!r.used.includes(letter));
      if(!pool.length)return error('Нет подходящих букв в словаре');
      r.letter=pool[crypto.getRandomValues(new Uint32Array(1))[0]%pool.length];
      r.used.push(r.letter);r.results=null;r.phase='playing';
      r.deadline=r.mode==='timed'?Date.now()+r.duration*1000:null;
      r.players.forEach(p=>{p.answers=candidates([]);p.ready=false;});
      await this.store();
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
      const all=player.answers.map((words,i)=>validate(dictionary.categories[i],words,r.letter));
      if(action==='check') {
        // Validate submitted form without changing saved draft.
        const rows=candidates(input.answers).map((words,i)=>validate(dictionary.categories[i],words,r.letter));
        return json({rows:rows.map((list,i)=>list.map(x=>x.valid?x:{...x,suggestions:suggest(dictionary.categories[i],x.word,r.letter)})),
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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== 'azbuka.internal') return error('Не найдено', 404);
    const account = request.headers.get('X-Azbuka-Account');
    if (!/^[1-9]\d{4,19}$/.test(account || '')) return error('Требуется подтверждённый вход', 401);
    const headers = { 'X-Azbuka-Account': account, 'Content-Type': 'application/json' };
    // Only the core Worker can call this private service with a verified administrator.
    if(request.method==='GET'){
      if(url.pathname==='/admin/rooms')return directoryStub(env).fetch('https://room/directory/list');
      const match=/^\/admin\/rooms\/([A-HJ-NP-Z2-9]{6})\/state$/.exec(url.pathname);
      if(!match)return error('Не найдено',404);
      return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch('https://room/observe',{headers});
    }
    if(request.method!=='POST')return error('Не найдено',404);
    if(url.pathname==='/admin/rooms/sweep'){
      if(request.headers.get('X-Azbuka-Sweep')!=='1')return error('Только главный администратор',403);
      const {objectIds}=await request.json().catch(()=>({}));
      if(!Array.isArray(objectIds)||!objectIds.length||objectIds.length>20||objectIds.some(id=>!(/^[a-f0-9]{64}$/).test(id)))return error('Некорректный список комнат');
      const directoryId=env.ROOMS.idFromName(DIRECTORY_NAME).toString();
      const ids=[...new Set(objectIds)].filter(id=>id!==directoryId);
      const counts={closed:0,active:0,missing:0,failed:0,skipped:objectIds.length-ids.length};
      const results=await Promise.allSettled(ids.map(async id=>{
        const stub=env.ROOMS.get(env.ROOMS.idFromString(id));
        const response=await stub.fetch('https://room/sweep',{method:'POST',headers});
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!['closed','active','missing'].includes(data.status))throw Error(`Room check failed: HTTP ${response.status}`);
        return data.status;
      }));
      const failedObjectIds=[],failureReasons=[];
      for(const [index,result] of results.entries()){
        if(result.status==='fulfilled')counts[result.value]++;
        else {counts.failed++;failedObjectIds.push(ids[index]);failureReasons.push(String(result.reason?.message||'Room check failed').slice(0,180));}
      }
      return json({ok:counts.failed===0,...counts,...(counts.failed?{failedObjectIds,failureReasons:[...new Set(failureReasons)]}:{})},counts.failed===0?200:503);
    }
    if (url.pathname === '/create') {
      let data;
      try { data = await request.json(); } catch { return error('Некорректный запрос'); }
      for (let attempt = 0; attempt < 8; attempt++) {
        const roomCode = code();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(roomCode));
        const response = await stub.fetch('https://room/init', {
          method: 'POST', headers, body: JSON.stringify({ ...data, code: roomCode }),
        });
        if (response.status !== 409) return response;
      }
      return error('Не удалось создать комнату', 503);
    }

    const match = /^\/([A-HJ-NP-Z2-9]{6})\/(join|state|settings|chat|start|draft|check|stop|leave|offline)$/.exec(url.pathname);
    if (!match) return error('Не найдено', 404);
    const [, roomCode, action] = match;
    const stub = env.ROOMS.get(env.ROOMS.idFromName(roomCode));
    return stub.fetch('https://room/' + action, {
      method: 'POST', headers, body: await request.text(),
    });
  }
};
