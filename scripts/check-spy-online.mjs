// Проверка онлайн-Шпиона: секреты не утекают, режимы на месте, списки локаций
// на клиенте и на сервере совпадают.
//
// Главное, что здесь стережётся, — то, ради чего движок вынесен отдельным
// файлом: локация и чужие роли не должны попадать в состояние, которое
// уходит на клиент. Проверка играет несколько партий и осматривает
// сериализованный вид каждого игрока.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const engineUrl = new URL('../cloudflare/spy-worker/src/engine.js', import.meta.url);
const {
  buildView,
  castVote,
  createRoomState,
  joinRoom,
  markRoleSeen,
  startGame,
  beginVoting,
  addChatMessage,
} = await import(engineUrl);
const { LOCATIONS } = await import(new URL('../cloudflare/spy-worker/src/locations.js', import.meta.url));

const index = read('index.html');
const spy = read('web/games/spy.js');
const online = read('web/games/spy-online.js');
const worker = read('cloudflare/spy-worker/src/index.js');
const engineSource = read('cloudflare/spy-worker/src/engine.js');
const appJs = read('web/js/app.js');

// 1. Списки локаций обязаны совпадать: на одном телефоне играет клиентский,
//    в онлайне — серверный, и разъехавшись они дадут разные наборы мест.
const clientLocations = JSON.parse(read('web/data/spy_locations.json'));
if (!Array.isArray(clientLocations) || !clientLocations.length) throw new Error('web/data/spy_locations.json пуст');
if (clientLocations.length !== LOCATIONS.length || clientLocations.some((item, i) => item !== LOCATIONS[i])) {
  throw new Error('Списки локаций клиента и воркера разошлись — пересоберите cloudflare/spy-worker/src/locations.js');
}

// 2. Выбор режима и точки входа.
for (const token of ['showSpyModePicker', 'startSpySingleDevice', 'openSpyOnline', 'data-spy-mode', "startSpyGame(locationsUrl, mode)"]) {
  if (!spy.includes(token)) throw new Error(`web/games/spy.js потерял ${token}`);
}
for (const token of ['startSpyOnlineGame', 'renderChatPanel', 'data-spy-chat-form', "send('chat'", '__spyOnlineCleanup', 'spy-backend']) {
  if (!online.includes(token)) throw new Error(`web/games/spy-online.js потерял ${token}`);
}
// Голосовой чат снят по просьбе владельца: проверка держит это состояние,
// чтобы WebRTC не вернулся вместе с чужой правкой.
for (const [name, source] of [['spy-online.js', online], ['воркер Шпиона', worker], ['движок Шпиона', engineSource]]) {
  for (const token of ['RTCPeerConnection', 'getUserMedia', 'createVoiceChat', 'relaySignal', 'setVoiceState']) {
    if (source.includes(token)) throw new Error(`Голосовой чат удалён, но ${name} снова содержит ${token}`);
  }
}
if (!index.includes('name="spy-backend"')) throw new Error('index.html: нет meta spy-backend');
if (!appJs.includes('__spyOnlineCleanup')) throw new Error('web/js/app.js не убирает онлайн-сессию Шпиона при выходе');

// 3. Воркер: сигналинг, лимиты и запасной транспорт.
for (const token of ['addChatMessage', 'ensureChat', 'buildView', 'DurableObject', 'verifySessionToken', 'ROOM_IDLE_TTL_MS']) {
  if (!worker.includes(token)) throw new Error(`Воркер Шпиона потерял ${token}`);
}
// Локация выбирается на сервере. Если бы её выбирал клиент, шпиону хватило
// бы вкладки сети, чтобы прочитать ответ.
if (!worker.includes("startGame(this.room, playerId, LOCATIONS, now)")) {
  throw new Error('Воркер должен сам выбирать локацию из серверного списка');
}
if (engineSource.includes('Math.random(')) throw new Error('Раздача ролей обязана идти через crypto.getRandomValues');

// 4. Секреты не утекают. Партии играются по-настоящему, а вид каждого игрока
//    осматривается как строка — так поймается утечка в любом поле, включая
//    те, которых сегодня ещё нет.
for (let attempt = 0; attempt < 40; attempt += 1) {
  const room = createRoomState('TEST1', { playerId: 'p1', name: 'Хост' });
  for (let i = 2; i <= 6; i += 1) joinRoom(room, { playerId: `p${i}`, name: `Игрок ${i}` });
  room.spyCount = 2;
  startGame(room, 'p1', LOCATIONS);

  const spies = room.players.filter((item) => item.role === 'spy');
  const citizens = room.players.filter((item) => item.role === 'citizen');
  if (spies.length !== 2) throw new Error(`Ожидалось два шпиона, получено ${spies.length}`);
  if (!citizens.length) throw new Error('Не осталось ни одного горожанина');

  for (const spyPlayer of spies) {
    const view = JSON.stringify(buildView(room, spyPlayer.playerId));
    if (view.includes(room.location)) throw new Error('Локация утекла шпиону до итогов');
    if (view.includes('"citizen"')) throw new Error('Чужая роль утекла шпиону до итогов');
  }
  for (const citizen of citizens) {
    const view = buildView(room, citizen.playerId);
    if (view.location !== room.location) throw new Error('Горожанин не видит локацию');
    if (view.players.some((item) => item.role)) throw new Error('Чужая роль утекла горожанину до итогов');
  }

  // Партия доигрывается до итогов — там роли и локация открываются всем.
  for (const player of room.players) markRoleSeen(room, player.playerId);
  if (room.status !== 'discussion') throw new Error('Обсуждение не стартовало после того, как все увидели роли');
  beginVoting(room, 'p1');
  const target = spies[0].playerId;
  for (const player of room.players) {
    castVote(room, player.playerId, player.playerId === target ? citizens[0].playerId : target);
  }
  if (room.status !== 'results') throw new Error('Партия не завершилась после голосования всех');
  const final = buildView(room, 'p1');
  if (final.location !== room.location) throw new Error('На итогах локация должна быть открыта');
  if (final.players.some((item) => !item.role)) throw new Error('На итогах роли должны быть открыты');
}

// 4а. Чат общий для всех и не раскрывает ролей: в нём только имя и текст.
{
  const room = createRoomState('CHAT1', { playerId: 'p1', name: 'Хост' });
  for (let i = 2; i <= 4; i += 1) joinRoom(room, { playerId: `p${i}`, name: `Игрок ${i}` });
  startGame(room, 'p1', LOCATIONS);
  const spy = room.players.find((item) => item.role === 'spy');
  addChatMessage(room, spy.playerId, 'я точно был там');
  const view = buildView(room, 'p1');
  if (view.chat.length !== 1) throw new Error('Сообщение не дошло до вида комнаты');
  const keys = Object.keys(view.chat[0]).sort().join(',');
  if (keys !== 'at,id,name,playerId,text') throw new Error(`В сообщении лишние поля: ${keys}`);
  const spyView = JSON.stringify(buildView(room, spy.playerId));
  if (spyView.includes(room.location)) throw new Error('Локация утекла через чат');
}

// 5. Раздача честная: за много партий шпионом побывает каждый.
const seen = new Set();
for (let attempt = 0; attempt < 300; attempt += 1) {
  const room = createRoomState('TEST2', { playerId: 'p1', name: 'Хост' });
  for (let i = 2; i <= 4; i += 1) joinRoom(room, { playerId: `p${i}`, name: `Игрок ${i}` });
  startGame(room, 'p1', LOCATIONS);
  for (const player of room.players) if (player.role === 'spy') seen.add(player.playerId);
}
if (seen.size !== 4) throw new Error(`Шпион выпадал не всем: ${[...seen].join(', ')}`);

console.log(`OK: онлайн-Шпион — режимы на месте, ${LOCATIONS.length} локаций совпадают, текстовый чат без утечек, голосового чата нет.`);
