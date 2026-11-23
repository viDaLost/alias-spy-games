import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { accessIdentity } from '../../app-core-worker/src/app-access-auth.js';
import { forwardAzbuka } from '../../app-core-worker/src/bible-azbuka.js';
import worker, { AzbukaRoom } from '../worker.mjs';
import dictionary from '../synodal-dictionary.json' with { type: 'json' };

const ADMIN = '1288379477';
const GUEST = '987654321';
const TOKEN = 'test-bot-token';
const origin = 'https://vidalost.github.io';
const cors = { 'Access-Control-Allow-Origin': origin };
const appHeaders = { 'Content-Type': 'application/json', Origin: origin, 'X-Azbuka-Account': ADMIN };

function makeRoom() {
  const map = new Map();
  const storage = {
    get: async key => map.get(key),
    put: async (key, value) => map.set(key, structuredClone(value)),
    delete: async key => map.delete(key),
    setAlarm: async () => {},
  };
  return new AzbukaRoom({ storage, blockConcurrencyWhile: async fn => fn() });
}

const rooms = new Map();
const service = {
  ROOMS: {
    idFromName: code => code,
    get(code) {
      if (!rooms.has(code)) rooms.set(code, makeRoom());
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
assert.equal((await appRequest('create', guest, { name: 'Игрок', isRoot: true })).status, 403);
assert.equal(rooms.size, 0);

const created = await appRequest('create', admin, { name: 'Мария', mode: 'stop', accountId: GUEST });
assert.equal(created.status, 200);
assert.equal(created.headers.get('Access-Control-Allow-Origin'), origin);
const initial = await created.json();
assert.match(initial.code, /^[A-HJ-NP-Z2-9]{6}$/);
assert.equal(initial.players.length, 1);
assert(!JSON.stringify(initial).includes(ADMIN));
assert.equal((await appRequest(initial.code + '/join', guest, { name: 'Анна' })).status, 403);
assert.equal((await appRequest(initial.code + '/state', guest)).status, 403);
assert.equal((await appRequest(initial.code + '/chat', guest, { text: 'Гость' })).status, 403);
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

const room = rooms.get(initial.code);
// The room engine supports multiple accounts. The production API above enforces the owner-only rollout.
const second = await invoke(room, 'join', GUEST, { name: 'Анна' });
assert.equal(second.players.length, 2);
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
console.log('PASS: signed owner gate, room rejoin, lobby and chat, private drafts, Synodal scoring, rounds and timers');
