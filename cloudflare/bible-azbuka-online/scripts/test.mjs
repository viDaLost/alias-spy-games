import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { accessIdentity } from '../../app-core-worker/src/app-access-auth.js';
import { forwardAzbuka, forwardAzbukaObserver } from '../../app-core-worker/src/bible-azbuka.js';
import worker, { AzbukaRoom } from '../worker.mjs';
import dictionary from '../synodal-dictionary.json' with { type: 'json' };
import evidence from './dictionary-evidence.json' with { type: 'json' };

const ADMIN = '1288379477';
const GUEST = '987654321';
const TOKEN = 'test-bot-token';
const origin = 'https://vidalost.github.io';
const cors = { 'Access-Control-Allow-Origin': origin };
const appHeaders = { 'Content-Type': 'application/json', Origin: origin, 'X-Azbuka-Account': ADMIN };

function makeStorage() {
  const map = new Map();
  let alarm=null;
  return {
    get: async key => structuredClone(map.get(key)),
    put: async (key,value) => {
      for(const [name,data] of typeof key==='string'?[[key,value]]:Object.entries(key))map.set(name,structuredClone(data));
    },
    delete: async keys => {for(const key of Array.isArray(keys)?keys:[keys])map.delete(key);},
    list: async ({prefix}) => new Map([...map].filter(([key])=>key.startsWith(prefix))),
    getAlarm: async () => alarm,
    setAlarm: async time => {alarm=time;},
    deleteAlarm: async () => {alarm=null;},
  };
}
function makeRoom(storage=makeStorage(),env) {
  return new AzbukaRoom({ storage, blockConcurrencyWhile: async fn => fn() },env);
}

const rooms = new Map();
const service = {
  ROOMS: {
    idFromName: code => code,
    idFromString: id => id,
    get(code) {
      if (!rooms.has(code)) rooms.set(code, makeRoom(makeStorage(),service));
      return { fetch: (url, init) => rooms.get(code).fetch(new Request(url, init)) };
    },
  },
};
const env = {
  ADMIN_TELEGRAM_ID: ADMIN,
  TELEGRAM_BOT_TOKEN: TOKEN,
  AZBUKA: { fetch: (url, init) => worker.fetch(new Request(url, init), service) },
  USERS: {
    idFromName: name => name,
    get: () => ({
      fetch: async (url, init) => {
        assert.match(String(url), /\/android-auth\/session$/);
        assert.match(JSON.parse(init.body).tokenHash, /^[a-f0-9]{64}$/);
        return Response.json({ userId: ADMIN });
      },
    }),
  },
};

function signingData(userId) {
  const params = new URLSearchParams({
    auth_date: String(Math.trunc(Date.now() / 1000)),
    user: JSON.stringify({ id: Number(userId), first_name: 'Тест' }),
  });
  const data = [...params].map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(data).digest('hex'));
  return params.toString();
}

async function appRequest(path, proof = {}, payload = {}, headers = {}) {
  const request = new Request('https://core.example/azbuka/' + path, {
    method: 'POST', headers: { ...appHeaders, ...headers }, body: JSON.stringify({ ...proof, payload }),
  });
  const body = await request.json();
  try {
    const account = await accessIdentity(request, body, env);
    return await forwardAzbuka(new URL(request.url).pathname, body.payload, account, env, cors);
  } catch (error) {
    if (!error.status) throw error;
    return Response.json({ error: error.message }, { status: error.status });
  }
}

const admin = { telegramInitData: signingData(ADMIN) };
const guest = { telegramInitData: signingData(GUEST) };
const forged = { telegramInitData: signingData(GUEST).replace(GUEST, ADMIN) };
assert.equal((await appRequest('create', {}, { name: 'Гость', accountId: ADMIN })).status, 401);
assert.equal((await appRequest('create', forged, { name: 'Подмена' })).status, 401);
assert.equal(rooms.size, 0);
assert.equal((await appRequest('create', guest, { name: 'Игрок' })).status, 200);

const created = await appRequest('create', admin, { name: 'Мария', mode: 'stop', accountId: GUEST });
assert.equal(created.status, 200);
assert.equal(created.headers.get('Access-Control-Allow-Origin'), origin);
const initial = await created.json();
assert.match(initial.code, /^[A-HJ-NP-Z2-9]{6}$/);
assert.equal(initial.players.length, 1);
assert(!JSON.stringify(initial).includes(ADMIN));
assert.equal((await appRequest(initial.code + '/state', guest)).status, 401);
assert.equal((await appRequest(initial.code + '/start', admin)).status, 400);

const rejoin = await appRequest(initial.code + '/join', admin, { name: 'Другое устройство' });
const joined = await rejoin.json();
assert.equal(joined.selfId, initial.selfId);
assert.equal(joined.players.length, 1);
const android = await appRequest(initial.code + '/state', {}, {}, { Authorization: 'Bearer bgs_' + 'a'.repeat(64) });
assert.equal((await android.json()).selfId, initial.selfId);
const direct = await worker.fetch(new Request('https://alias-spy-games-bible-azbuka.example/create', {
  method: 'POST', headers: appHeaders, body: '{}',
}), service);
assert.equal(direct.status, 404);

async function invoke(room, action, account, payload = {}) {
  const response = await room.fetch(new Request('https://room/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Azbuka-Account': account },
    body: JSON.stringify(payload),
  }));
  return { status: response.status, ...await response.json() };
}

const joinedByGuest = await appRequest(initial.code + '/join', guest, { name: 'Анна' });
assert.equal(joinedByGuest.status, 200);
const second = await joinedByGuest.json();
assert.equal(second.players.length, 2);
assert.equal((await appRequest(initial.code + '/state', guest)).status, 200);
const room = rooms.get(initial.code);
assert.equal((await invoke(room, 'state', '123456789')).status, 401);
assert.equal((await invoke(room, 'settings', GUEST, { mode: 'timed', duration: 90 })).status, 403);
assert.equal((await invoke(room, 'chat', GUEST, { text: 'Всем привет!' })).messages.at(-1).text, 'Всем привет!');
const start = await invoke(room, 'start', ADMIN);
assert.equal(start.phase, 'playing');
assert.equal(start.mode, 'stop');
assert.equal(start.players.length, 2);
assert.equal((await invoke(room, 'join', '123456789', { name: 'Третий' })).status, 409);
const letter = start.letter.toLocaleLowerCase('ru');
const normalize = value => value.normalize('NFC').toLocaleLowerCase('ru')
  .replaceAll('ё', 'е').replace(/\u0301/g, '').replace(/[‐‑–—]/g, '-').trim().replace(/\s+/g, ' ');
// All additional entries carry their exact source verse and attested word form.
assert.equal(dictionary.additionalSources[0].sha256,evidence.sha256);
assert.deepEqual(dictionary.categoryCounts,dictionary.categories.map(c=>c.options.length));
let verifiedEntries=0;
for(const category of dictionary.categories){
  for(const word of category.options)assert(Object.hasOwn(category.answers,normalize(word)),word);
  for(const [key,record] of Object.entries(category.answers)){
    if(record[5]!==evidence.source)continue;
    const text=normalize(evidence.verses[record[2]]||'');
    const witness=normalize(record[3]).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert(new RegExp(`(?<![а-я])${witness}(?![а-я])`,'u').test(text),`${key}: ${record[2]} ${record[3]}`);
    verifiedEntries++;
  }
}
assert(verifiedEntries>=1000);
assert.equal(dictionary.categories[4].answers['дромадер'][2],'ISA 60:6');
assert.equal(dictionary.categories[4].answers['дромадерах'][2],'EST 8:10');
assert.equal(dictionary.categories[2].answers['фисташков'][0],'фисташка');
assert.equal(dictionary.categories[2].answers['фисташки'][0],'фисташка');
assert(dictionary.categories[3].answers['дом']);
assert(!dictionary.categories[3].answers['бочка']);
assert(!dictionary.categories[4].answers['утка']);
assert(!dictionary.categories[4].answers['уж']);
assert(!dictionary.categories[2].answers['ель']);
console.log(`PASS: ${verifiedEntries} additional dictionary forms have exact Synodal verse witnesses`);

const choices = dictionary.categories.map(category => {
  const distinct = new Map();
  for (const word of category.options) {
    const key = normalize(word);
    const entry = category.answers[key];
    if (key.startsWith(letter) && entry) distinct.set(normalize(entry[0]), word);
  }
  return [...distinct.values()].slice(0, 2);
});
assert(choices.every(words => words.length));
const theirAnswers = choices.map(words => words.slice(0, 1));
const invalid = await invoke(room, 'check', ADMIN, { answers: Array.from({ length: 5 }, () => ['123']) });
assert.equal(invalid.complete, false);
assert.equal((await invoke(room, 'stop', ADMIN, { answers: [] })).status, 422);
const reviewed = await invoke(room, 'check', ADMIN, { answers: choices });
assert.equal(reviewed.complete, true);
assert(reviewed.rows.every(row => row.every(word => word.valid)));
await invoke(room, 'draft', GUEST, { answers: theirAnswers });
const state = await invoke(room, 'state', ADMIN);
assert.deepEqual(Object.keys(state.players[1]).sort(), ['id', 'name', 'online', 'ready', 'score']);
assert(state.ownDraft.every(words => !words.length));
const result = await invoke(room, 'stop', ADMIN, { answers: choices });
assert.equal(result.phase, 'results');
assert.equal(result.results.reason, 'stop');
const maria = result.results.players.find(player => player.name === 'Мария');
const anna = result.results.players.find(player => player.name === 'Анна');
assert.deepEqual(maria.answers.map(answer => answer.points), choices.map(words => words.length === 2 ? 10 : 5));
assert.equal(anna.added, 25);

const next = await invoke(room, 'start', ADMIN);
assert.equal(next.round, 1);
assert.notEqual(next.letter, start.letter);

// A delayed draft from the preceding round cannot populate the current answer form.
assert.notEqual(next.roundId,start.roundId);
assert.equal((await invoke(room,'draft',ADMIN,{roundId:start.roundId,answers:choices})).status,409);
assert((await invoke(room,'state',ADMIN)).ownDraft.every(words=>!words.length));
const presenceId='a'.repeat(32);
assert.equal((await invoke(room,'draft',ADMIN,{roundId:next.roundId,answers:[['новый']],presenceId,presenceSequence:2})).status,200);
await invoke(room,'draft',ADMIN,{roundId:next.roundId,answers:[['старый']],presenceId,presenceSequence:1});
assert.deepEqual((await invoke(room,'state',ADMIN)).ownDraft[0],['новый']);
const leaving=makeRoom();
await invoke(leaving,'init',ADMIN,{code:'LEAV23',name:'Мария',mode:'stop'});
await invoke(leaving,'join',GUEST,{name:'Анна'});
await invoke(leaving,'start',ADMIN);
assert.equal((await invoke(leaving,'leave',ADMIN)).status,200);
const remaining=await invoke(leaving,'state',GUEST);
assert.equal(remaining.hostId,remaining.selfId);
assert.equal(remaining.phase,'lobby');
assert.equal((await invoke(leaving,'state',ADMIN)).status,401);
assert.equal((await invoke(leaving,'leave',GUEST)).closed,true);
assert.equal((await invoke(leaving,'state',GUEST)).status,404);

const longer=makeRoom();
const longerLobby=await invoke(longer,'init',ADMIN,{code:'RUND23',name:'Ведущий',rounds:10});
assert.equal(longerLobby.rounds,10);
assert.equal((await invoke(longer,'settings',ADMIN,{mode:'stop',rounds:15})).rounds,15);
await invoke(longer,'join',GUEST,{name:'Анна'});
assert.equal((await invoke(longer,'start',ADMIN)).rounds,15);

// The reported examples are checked with the actual room API. Separate words
// and multiword biblical names are both supported, with a three-answer cap.
const feedback=makeRoom();
await invoke(feedback,'init',ADMIN,{code:'FEED23',name:'Мария',mode:'stop'});
await invoke(feedback,'join',GUEST,{name:'Анна'});
await invoke(feedback,'start',ADMIN);
feedback.room.letter='Д';
const feedbackReview=await invoke(feedback,'check',ADMIN,{answers:[['Давид Даниил'],['Дамаск'],['дуб'],['дом'],['дромадер']]});
assert.equal(feedbackReview.complete,true);
assert.deepEqual(feedbackReview.rows[0].map(x=>x.word),['Давид','Даниил']);
assert.equal(feedbackReview.rows[3][0].reference,'Быт 19:2');
assert.equal(feedbackReview.rows[4][0].reference,'Ис 60:6');
const comma=await invoke(feedback,'check',ADMIN,{answers:[['Давид, Даниил; Дан, Далида'],['Дамаск'],['дуб'],['дом'],['дромадерах']]});
assert.deepEqual(comma.rows[0].map(x=>x.word),['Давид','Даниил','Дан']);
assert.equal(comma.rows[4][0].canonical,'дромадер');
const typo=await invoke(feedback,'check',ADMIN,{answers:[[],[],[],[],['дромодер']]});
assert.equal(typo.rows[4][0].valid,true);
assert.equal(typo.rows[4][0].word,'дромадер');
assert.equal(typo.rows[4][0].original,'дромодер');
const transposed=await invoke(feedback,'check',ADMIN,{answers:[[],[],[],[],['дромдаер']]});
assert.equal(transposed.rows[4][0].canonical,'дромадер');
const saveTypo=await invoke(feedback,'draft',ADMIN,{answers:[[],[],[],[],['дромодер']]});
assert.deepEqual(saveTypo.corrections[4],[{original:'дромодер',word:'дромадер'}]);
assert.deepEqual((await invoke(feedback,'state',ADMIN)).ownDraft[4],['дромадер']);
feedback.room.letter='А';
const aliasTypo=await invoke(feedback,'check',ADMIN,{answers:[[],['Аккаронн'],[],[],[]]});
assert.equal(aliasTypo.rows[1][0].valid,true);
assert.equal(aliasTypo.rows[1][0].key,'екрон');
assert.match(aliasTypo.rows[1][0].word,/^а/i);
feedback.room.letter='С';
const sip=await invoke(feedback,'check',ADMIN,{answers:[[],[],[],[],['сипа','сиппа','сип']]});
assert(sip.rows[4].every(x=>x.valid&&x.key==='сип'&&x.reference==='Лев 11:18'));
feedback.room.letter='А';
const wrongCategory=await invoke(feedback,'check',ADMIN,{answers:[[],[],[],['анис'],[]]});
assert.equal(wrongCategory.rows[3][0].valid,false);
feedback.room.letter='Л';
const skipped=[true,true,true,true,false];
const skipPayload={answers:[[],[],[],[],['лебедь']],skipped};
const skippedCheck=await invoke(feedback,'check',ADMIN,skipPayload);
assert.equal(skippedCheck.complete,true);
assert.deepEqual(skippedCheck.rows.slice(0,4),[[],[],[],[]]);
await invoke(feedback,'draft',ADMIN,skipPayload);
assert.deepEqual((await invoke(feedback,'state',ADMIN)).ownSkipped,skipped);
const emptyCheck=await invoke(feedback,'check',ADMIN,{answers:[],skipped:[true,true,true,true,true]});
assert.equal(emptyCheck.complete,false);
assert.equal((await invoke(feedback,'stop',ADMIN,{answers:[],skipped:[true,true,true,true,true]})).status,422);
feedback.room.letter='Б';
const notBible=await invoke(feedback,'check',ADMIN,{answers:[[],[],[],['бочка'],[]]});
assert.equal(notBible.rows[3][0].valid,false);
feedback.room.letter='И';
const phrase=await invoke(feedback,'check',ADMIN,{answers:[['Иисус Христос'],[],[],[],[]]});
assert.equal(phrase.rows[0].length,1);
assert(phrase.rows[0][0].valid);
feedback.room.letter='С';
const sameSkips=[true,true,true,true,false];
await invoke(feedback,'draft',GUEST,{answers:[[],[],[],[],['сипа']],skipped:sameSkips});
const skipResults=await invoke(feedback,'stop',ADMIN,{answers:[[],[],[],[],['сиппа']],skipped:sameSkips});
assert.equal(skipResults.phase,'results');
for(const player of skipResults.results.players){
  assert.equal(player.added,5);
  assert(player.answers.slice(0,4).every(answer=>answer.points===0&&answer.word==='Пропущено'));
}

const usedLetters=new Set();
for(let index=0;index<15;index++){
  const current=await invoke(longer,'state',ADMIN);
  assert.equal(current.round,index);
  assert(!usedLetters.has(current.letter));
  usedLetters.add(current.letter);
  const answers=dictionary.categories.map(category=>{
    const words=category.options.filter(w=>normalize(w)[0]===normalize(current.letter));
    assert(new Set(words.map(w=>normalize(category.answers[normalize(w)][0]))).size>=2);
    return words.slice(0,1);
  });
  const finished=await invoke(longer,'stop',ADMIN,{answers});
  assert.equal(finished.phase,index===14?'finished':'results');
  if(index<14)assert.equal((await invoke(longer,'start',ADMIN)).status,200);
}
assert.equal(usedLetters.size,15);

const timed = makeRoom();
await invoke(timed, 'init', ADMIN, { code: 'TMED32', name: 'Руфь', mode: 'timed', duration: 30 });
await invoke(timed, 'join', GUEST, { name: 'Лия' });
const timedStart = await invoke(timed, 'start', ADMIN);
assert.equal(timedStart.phase, 'playing');
assert(timedStart.remaining <= 30 && timedStart.remaining >= 28);
assert.equal((await invoke(timed, 'stop', ADMIN)).status, 409);
timed.room.deadline = Date.now() - 1;
const timedEnd = await invoke(timed, 'state', ADMIN);
assert.equal(timedEnd.phase, 'results');
assert.equal(timedEnd.results.reason, 'time');

const leave = makeRoom();
await invoke(leave, 'init', ADMIN, { code: 'LEAV42', name: 'Мария' });
assert.equal((await invoke(leave, 'leave', ADMIN)).ok, true);
assert.equal((await invoke(leave, 'state', ADMIN)).status, 404);
const legacy = makeRoom();
await legacy.ready;
legacy.room = { code: 'OLD234', phase: 'lobby', players: [{ token: 'preview-token' }] };
assert.equal((await invoke(legacy, 'join', ADMIN, { name: 'Мария' })).status, 404);
console.log('PASS: verified player access, room rejoin, lobby and chat, private drafts, Synodal scoring, rounds and timers');

const observerRequest=new Request('https://core.example/azbuka/admin/rooms',{headers:{Authorization:'Bearer test'}});
const verifier=scope=>async()=>Response.json({ok:true,userId:ADMIN,scope});
const observer=(path,scope='admin')=>forwardAzbukaObserver('/azbuka/admin/rooms'+path,observerRequest,env,cors,verifier(scope));
assert.equal((await observer('', 'presence')).status,403);
assert.equal((await worker.fetch(new Request('https://azbuka.internal/admin/rooms',{method:'POST',headers:appHeaders,body:'{}'}),service)).status,404);
const directory=await (await observer('')).json();
assert(directory.rooms.some(entry=>entry.code===initial.code));
const oldPresence=await room.state.storage.get('presence');
const view=await (await observer('/'+initial.code+'/state')).json();
assert.equal(view.code,initial.code);
assert.equal(view.players.length,2);
assert.equal(view.players.some(p=>p.host),true);
assert(!JSON.stringify(view).includes('accountId'));
assert(!JSON.stringify(view).includes('answers'));
assert.deepEqual(await room.state.storage.get('presence'),oldPresence);

const onlineTimeout=20_000,lifetime=5*60*60_000;
const realNow=Date.now;let now=realNow();Date.now=()=>now;
async function fireAlarm(target){
  const alarm=await target.state.storage.getAlarm();
  assert(alarm!==null&&alarm<=now);
  await target.state.storage.deleteAlarm();await target.alarm();
}
try {
  const empty=makeRoom(makeStorage(),service);
  await invoke(empty,'init',ADMIN,{code:'IDLE23',name:'Мария'});
  const idleDeadline=now+onlineTimeout;
  assert.equal(await empty.state.storage.getAlarm(),idleDeadline);
  now=idleDeadline-1;
  assert.equal((await invoke(empty,'state',GUEST)).status,401);
  assert(empty.room);
  now++;await fireAlarm(empty);
  assert.equal(await empty.state.storage.get('room'),undefined);
  assert.equal(await empty.state.storage.get('presence'),undefined);
  assert.equal(await empty.state.storage.getAlarm(),null);
  assert(!(await (await observer('')).json()).rooms.some(entry=>entry.code==='IDLE23'));
  assert.equal((await invoke(empty,'join',ADMIN,{name:'Мария'})).status,404);

  let active=makeRoom();
  await invoke(active,'init',ADMIN,{code:'LIVE23',name:'Мария'});
  await invoke(active,'join',GUEST,{name:'Лия'});
  const firstAlarm=await active.state.storage.getAlarm();
  now+=15_000;
  const ping=await invoke(active,'state',GUEST);
  assert.equal(ping.players[1].online,true);
  const lastPing=now;
  active=makeRoom(active.state.storage);await active.ready;
  assert.equal(active.room.players[1].lastSeen,lastPing);
  now=firstAlarm;await fireAlarm(active);
  assert(active.room);
  assert.equal(await active.state.storage.getAlarm(),lastPing+onlineTimeout);
  now=lastPing+onlineTimeout;
  assert.equal((await invoke(active,'join',GUEST,{name:'Лия'})).status,404);

  const hardLimit=makeRoom();const createdAt=now;
  await invoke(hardLimit,'init',ADMIN,{code:'LIFE23',name:'Мария',mode:'timed',duration:90});
  await invoke(hardLimit,'join',GUEST,{name:'Лия'});
  for(let elapsed=10_000;elapsed<lifetime;elapsed+=10_000){
    now=createdAt+elapsed;
    if((await hardLimit.state.storage.getAlarm())<=now)await fireAlarm(hardLimit);
    assert.equal((await invoke(hardLimit,'state',ADMIN)).status,200);
  }
  now=createdAt+lifetime-10_000;
  assert.equal((await invoke(hardLimit,'start',ADMIN)).phase,'playing');
  assert.equal(await hardLimit.state.storage.getAlarm(),createdAt+lifetime);
  now=createdAt+lifetime;await fireAlarm(hardLimit);
  assert.equal((await invoke(hardLimit,'state',ADMIN)).status,404);

  const timedAlarm=makeRoom();
  await invoke(timedAlarm,'init',ADMIN,{code:'TIME23',name:'Мария',mode:'timed',duration:30});
  await invoke(timedAlarm,'join',GUEST,{name:'Лия'});
  await invoke(timedAlarm,'start',ADMIN);
  assert.equal(await timedAlarm.state.storage.getAlarm(),now+20_000);
  const timedStartAt=now;
  now+=15_000;await invoke(timedAlarm,'state',ADMIN);
  const timedIdleDeadline=now+onlineTimeout;
  now=timedStartAt+20_000;await fireAlarm(timedAlarm);
  assert.equal(await timedAlarm.state.storage.getAlarm(),timedStartAt+30_000);
  now=timedStartAt+30_000;await fireAlarm(timedAlarm);
  assert.equal(timedAlarm.room.phase,'results');
  assert.equal(await timedAlarm.state.storage.getAlarm(),timedIdleDeadline);
  now=timedIdleDeadline;await fireAlarm(timedAlarm);
  assert.equal(await timedAlarm.state.storage.get('room'),undefined);

  const oldStorage=makeStorage();
  await oldStorage.put('room',{code:'PAST23',created:now-lifetime,phase:'lobby',players:[{id:'host',accountId:ADMIN,lastSeen:now-1000}]});
  assert.equal((await invoke(makeRoom(oldStorage),'join',ADMIN,{name:'Мария'})).status,404);

  const hostPresence={presenceId:'a'.repeat(32),presenceSequence:1};
  const guestPresence={presenceId:'b'.repeat(32),presenceSequence:1};
  let immediate=makeRoom();
  await invoke(immediate,'init',ADMIN,{code:'EXIT23',name:'Мария',...hostPresence});
  await invoke(immediate,'join',GUEST,{name:'Лия',...guestPresence});
  await invoke(immediate,'start',ADMIN,{...hostPresence,presenceSequence:2});
  assert.equal((await invoke(immediate,'offline',ADMIN,{...hostPresence,presenceSequence:4})).closed,false);
  immediate=makeRoom(immediate.state.storage);await immediate.ready;
  assert.equal(immediate.room.players[0].lastSeen,0);
  const delayed=await invoke(immediate,'state',ADMIN,{...hostPresence,presenceSequence:3});
  assert.equal(delayed.players[0].online,false);
  assert.equal((await invoke(immediate,'offline',GUEST,{...guestPresence,presenceSequence:2})).closed,true);
  assert.equal(await immediate.state.storage.get('room'),undefined);
  assert.equal((await invoke(immediate,'state',ADMIN)).status,404);

  const tabs=makeRoom();
  await invoke(tabs,'init',ADMIN,{code:'TABS23',name:'Мария',...hostPresence});
  await invoke(tabs,'join',ADMIN,{...guestPresence,name:'Мария'});
  assert.equal((await invoke(tabs,'offline',ADMIN,{...hostPresence,presenceSequence:2})).closed,false);
  assert.equal((await invoke(tabs,'offline',ADMIN,{...guestPresence,presenceSequence:2})).closed,true);

  const leaveOffline=makeRoom();
  await invoke(leaveOffline,'init',ADMIN,{code:'LEAV23',name:'Мария'});
  await invoke(leaveOffline,'join',GUEST,{name:'Лия'});
  await invoke(leaveOffline,'offline',GUEST);
  assert.equal((await invoke(leaveOffline,'leave',ADMIN)).closed,true);

  const sweepId='f'.repeat(64),activeId='e'.repeat(64);
  const inactiveStorage=makeStorage();
  await inactiveStorage.put('room',{code:'PAST24',created:now-60_000,phase:'lobby',players:[{id:'host',accountId:ADMIN,lastSeen:now-onlineTimeout}]});
  rooms.set(sweepId,makeRoom(inactiveStorage,service));
  const stillActive=makeRoom();
  await invoke(stillActive,'init',ADMIN,{code:'ACTV23',name:'Мария'});
  rooms.set(activeId,stillActive);
  const sweepPath='/azbuka/admin/rooms/sweep';
  const sweepRequest=()=>new Request('https://core.example'+sweepPath,{method:'POST',body:JSON.stringify({objectIds:[sweepId,activeId]})});
  const forbidden=await forwardAzbukaObserver(sweepPath,sweepRequest(),env,cors,async()=>Response.json({ok:true,userId:GUEST,scope:'admin'}));
  assert.equal(forbidden.status,403);
  const swept=await forwardAzbukaObserver(sweepPath,sweepRequest(),env,cors,verifier('admin'));
  assert.equal(swept.status,200);
  assert.deepEqual(JSON.parse(await swept.text()),{ok:true,closed:1,active:1,missing:0,failed:0,skipped:0});
  assert.equal(await inactiveStorage.get('room'),undefined);
  assert(stillActive.room);
  const malformedStorage=makeStorage();
  await malformedStorage.put('room',{code:'OLDABC',created:now-60_000});
  const malformed=makeRoom(malformedStorage);
  const legacySweep=await malformed.fetch(new Request('https://room/sweep',{method:'POST',headers:{'X-Azbuka-Account':ADMIN}}));
  assert.equal((await legacySweep.json()).status,'closed');
  assert.equal(await malformedStorage.get('room'),undefined);
  console.log('PASS: immediate offline closure, multiple sessions, delayed polls, sweep, directory, hard lifetime and timed rounds');
}finally{Date.now=realNow;}
