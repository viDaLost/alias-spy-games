// room.js — состояние комнаты «Земли обетованной». Чистое, как и правила игры.
//
// Здесь нет ни сети, ни хранилища, ни часов сверх переданного времени: комната
// — это данные и переходы между ними. Ради этого её и вынесли отдельным
// файлом: так её можно прогнать проверкой без воркера, без Durable Object и
// без браузера — и прогнать не один раз, а сотню, с разными порядками
// подключений и отвалов.
//
// Что здесь есть, а чего нет. Есть: игроки, их готовность, настройки партии,
// переписка и хозяин комнаты. Нет правил самой игры — они лежат в engine.js
// рядом с доской и не знают ни про какие комнаты. Это разделение не
// формальное: правила уже проверены шестьюстами партиями, и тащить в них сеть
// значило бы всё это переигрывать.

export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;
const MAX_CHAT = 60;
const NAME_LIMIT = 24;
const TEXT_LIMIT = 200;

/** Имя игрока: без управляющих знаков, без краёв, не длиннее строки. */
export function sanitizeName(value, fallback = 'Странник') {
  const clean = String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_LIMIT);
  return clean || fallback;
}

const sanitizeText = (value) => String(value == null ? '' : value)
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, TEXT_LIMIT);

/*
  Настройки партии — те же, что и за одним столом: срок и способ его окончания.
  Числа сюда приходят от игрока, и доверять им нельзя: «лет» может оказаться
  строкой «сто», а «режим» — чем угодно.
*/
export function sanitizeSettings(value, previous = null) {
  const mode = value?.mode === 'last' ? 'last' : 'jubilee';
  const years = [3, 5, 7].includes(Number(value?.years)) ? Number(value.years) : (previous?.years || 3);
  /*
    Соперники от игры. Онлайн — не обязательно полный стол: вдвоём с другом
    интереснее, когда рядом ходят ещё двое-трое. Сколько их поместится, решает
    setSettings: здесь комнаты не видно, и кламп по числу сидящих делать нечем.
  */
  const asked = Number(value?.bots);
  const bots = Number.isFinite(asked) ? Math.max(0, Math.min(MAX_PLAYERS - 1, Math.floor(asked)))
    : Number(previous?.bots || 0);
  /*
    Лад партии: усложнённый — строить на целом цвете, простой — на своём уделе.
    Умолчание усложнённое: правило это старше игры, и менять его молча за
    хозяина комнаты не надо. Отсутствие поля — не «простой», а «как было»:
    иначе старая вкладка, не знающая про лад, переводила бы комнату в простой
    каждым нажатием на число соперников.
  */
  const strict = value?.strict === undefined
    ? (previous?.strict !== false)
    : value.strict !== false;
  return { mode, years, bots, strict };
}

/** Сколько всего будет за столом: люди плюс соперники от игры. */
export const tableSize = (room) => seated(room).length + Number(room.settings?.bots || 0);

export function createRoomState(roomId, host, now = Date.now()) {
  const room = {
    roomId: String(roomId || '').toUpperCase(),
    phase: 'lobby',
    hostPlayerId: String(host?.playerId || ''),
    players: [],
    chat: [],
    settings: { mode: 'jubilee', years: 3, bots: 0, strict: true },
    seats: [],
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  joinRoom(room, host, now);
  return room;
}

const findPlayer = (room, playerId) => room.players.find((one) => one.id === String(playerId || ''));

export function joinRoom(room, player, now = Date.now()) {
  const id = String(player?.playerId || '');
  if (!id) throw roomError('NO_PLAYER', 'Игрок не назвался');
  const already = findPlayer(room, id);
  if (already) {
    // Возвращение — не новый игрок. Имя обновляется: человек мог войти с
    // другого устройства, где оно записано иначе.
    already.name = sanitizeName(player?.name, already.name);
    already.leftAt = 0;
    touch(room, now);
    return already;
  }
  if (room.phase !== 'lobby') throw roomError('ROOM_STARTED', 'Партия уже идёт');
  if (room.players.length >= MAX_PLAYERS) throw roomError('ROOM_FULL', 'За столом уже шестеро');
  const one = {
    id,
    name: sanitizeName(player?.name),
    ready: false,
    joinedAt: now,
    leftAt: 0,
  };
  room.players.push(one);
  /*
    Комната без хозяина — тупик: начать партию некому, настройки не поменять.
    А остаться без него легко: хозяин уходит последним, комната пустеет, и
    следующий вошедший застаёт её ничьей. Поэтому хозяин ищется при каждом
    входе, а не только при уходе прежнего.
  */
  if (!findPlayer(room, room.hostPlayerId) || findPlayer(room, room.hostPlayerId).leftAt) {
    passHost(room);
  }
  touch(room, now);
  return one;
}

/*
  Уход из комнаты. В лобби игрок вычёркивается совсем, в партии — только
  помечается ушедшим: его фишка, уделы и долги остаются на доске, и вернуться
  он должен к своему месту, а не к новому.
*/
export function leaveRoom(room, playerId, now = Date.now()) {
  const one = findPlayer(room, playerId);
  if (!one) return false;
  if (room.phase === 'lobby') {
    room.players = room.players.filter((other) => other.id !== one.id);
  } else {
    one.leftAt = now;
  }
  if (room.hostPlayerId === one.id) passHost(room);
  touch(room, now);
  return true;
}

/*
  Хозяин комнаты — тот, кто начинает партию и меняет настройки. Если он ушёл,
  комната не должна замереть: хозяином становится первый из оставшихся.
*/
function passHost(room) {
  const next = room.players.find((one) => !one.leftAt);
  room.hostPlayerId = next ? next.id : '';
}

export function setReady(room, playerId, ready, now = Date.now()) {
  const one = findPlayer(room, playerId);
  if (!one) throw roomError('NOT_IN_ROOM', 'Вас нет в этой комнате');
  one.ready = Boolean(ready);
  touch(room, now);
  return one;
}

export function renamePlayer(room, playerId, name, now = Date.now()) {
  const one = findPlayer(room, playerId);
  if (!one) throw roomError('NOT_IN_ROOM', 'Вас нет в этой комнате');
  one.name = sanitizeName(name, one.name);
  touch(room, now);
  return one;
}

export function setSettings(room, playerId, value, now = Date.now()) {
  if (room.hostPlayerId !== String(playerId || '')) {
    throw roomError('NOT_HOST', 'Настройки меняет хозяин комнаты');
  }
  if (room.phase !== 'lobby') throw roomError('ROOM_STARTED', 'Партия уже идёт');
  room.settings = sanitizeSettings(value, room.settings);
  // Стол на шестерых считает всех: и людей, и соперников от игры. Лишние
  // соперники не отвергаются отказом — их просто не остаётся куда посадить.
  room.settings.bots = Math.max(0, Math.min(room.settings.bots, MAX_PLAYERS - seated(room).length));
  touch(room, now);
  return room.settings;
}

export function addChatMessage(room, playerId, text, now = Date.now()) {
  const one = findPlayer(room, playerId);
  if (!one) throw roomError('NOT_IN_ROOM', 'Вас нет в этой комнате');
  const clean = sanitizeText(text);
  if (!clean) throw roomError('EMPTY_TEXT', 'Пустое сообщение');
  room.chat.push({ id: `${now}-${one.id}`, playerId: one.id, name: one.name, text: clean, at: now });
  // Переписка не растёт без предела: на телефоне её всё равно не пролистать,
  // а память комнаты она съедает.
  if (room.chat.length > MAX_CHAT) room.chat = room.chat.slice(-MAX_CHAT);
  touch(room, now);
  return room.chat[room.chat.length - 1];
}

/** Кто за столом на самом деле: ушедшие в лобби не считаются. */
export const seated = (room) => room.players.filter((one) => !one.leftAt);

export function canStart(room) {
  if (room.phase !== 'lobby') return false;
  const table = seated(room);
  if (!table.length) return false;
  // Двое за столом — это и есть игра. Второй может быть человеком из другой
  // комнаты или соперником от игры: правилам всё равно, кто бросает жребий.
  if (tableSize(room) < MIN_PLAYERS || tableSize(room) > MAX_PLAYERS) return false;
  // Хозяину готовность не нужна: он и есть тот, кто нажимает «начать».
  return table.every((one) => one.ready || one.id === room.hostPlayerId);
}

export function startGame(room, playerId, now = Date.now()) {
  if (room.hostPlayerId !== String(playerId || '')) {
    throw roomError('NOT_HOST', 'Партию начинает хозяин комнаты');
  }
  if (room.phase !== 'lobby') throw roomError('ROOM_STARTED', 'Партия уже идёт');
  const table = seated(room);
  if (tableSize(room) < MIN_PLAYERS) throw roomError('TOO_FEW', 'Нужны хотя бы двое');
  if (tableSize(room) > MAX_PLAYERS) throw roomError('TOO_MANY', 'За столом больше шестерых');
  if (!canStart(room)) throw roomError('NOT_READY', 'Не все готовы');
  /*
    Места за столом раздаются здесь и больше не меняются до конца партии.
    Движок знает игроков по номеру места («p0», «p1»), а комната — по имени
    подключения; seats и есть тот единственный мост между ними, по которому
    потом сверяется, чей сейчас ход.
  */
  room.seats = table.map((one) => one.id);
  room.phase = 'playing';
  room.startedAt = now;
  touch(room, now);
  return room;
}

export function backToLobby(room, playerId, now = Date.now()) {
  if (room.hostPlayerId !== String(playerId || '')) {
    throw roomError('NOT_HOST', 'Вернуть в комнату может хозяин');
  }
  room.phase = 'lobby';
  room.startedAt = 0;
  room.seats = [];
  for (const one of room.players) one.ready = false;
  // Ушедшие в партии вычёркиваются здесь: место за столом освободилось.
  room.players = room.players.filter((one) => !one.leftAt);
  if (!findPlayer(room, room.hostPlayerId)) passHost(room);
  touch(room, now);
  return room;
}

/*
  Вид комнаты для одного игрока. Отдельная функция, а не «отдать всё как
  есть»: наружу уходит только то, что игроку положено видеть, и когда в
  комнате появятся тайны — раздача карт, чужие кошельки, — прятать их надо
  будет ровно здесь, а не в десяти местах клиента.
*/
export function buildView(room, playerId, online = new Set()) {
  const me = findPlayer(room, playerId);
  return {
    roomId: room.roomId,
    phase: room.phase,
    version: room.version,
    hostPlayerId: room.hostPlayerId,
    youAreHost: room.hostPlayerId === String(playerId || ''),
    you: me ? { id: me.id, name: me.name, ready: me.ready } : null,
    settings: { ...room.settings },
    canStart: canStart(room),
    tableSize: tableSize(room),
    maxPlayers: MAX_PLAYERS,
    seats: [...(room.seats || [])],
    // Место игрока в партии: движок зовёт его «p0», «p1» — и без этого моста
    // клиент не отличит свой ход от чужого.
    seat: room.seats?.includes(String(playerId || ''))
      ? `p${room.seats.indexOf(String(playerId || ''))}` : '',
    players: room.players.map((one) => ({
      id: one.id,
      name: one.name,
      ready: one.ready,
      host: one.id === room.hostPlayerId,
      left: Boolean(one.leftAt),
      online: online.has(one.id),
    })),
    chat: room.chat.map((line) => ({ ...line })),
  };
}

function touch(room, now) {
  room.updatedAt = now;
  room.version += 1;
}

function roomError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
