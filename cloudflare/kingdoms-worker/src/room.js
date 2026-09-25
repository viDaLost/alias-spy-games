// room.js — комната «Царств». Чистая, как и правила игры.
//
// Здесь нет ни сети, ни хранилища, ни часов сверх переданного времени: комната
// — это данные и переходы между ними. Ради этого её и вынесли отдельным
// файлом: так её можно прогнать проверкой без воркера, без Durable Object и
// без браузера — сотню раз, с разными порядками входов и отвалов.
//
// Главное правило этого файла — buildView. Закрытый приказ не покидает
// сервер видом и силой: наружу уходит вид партии, собранный движком отдельно
// для каждого игрока (kingdoms-engine.js: visibleStateFor). Комната здесь
// только оборачивает его местом в комнате, готовностью и настройками.
//
// Второе правило — кто ходит, когда игрок не отвечает. Соперник от игры
// решает эвристикой (Bots.pick), а человек, не успевший разместить приказ за
// девяносто секунд, просто пропускает размещение — это не то же самое, что
// сыграть за него: партия не должна делать ходы, которых человек не выбирал.

import { R, E, Bots } from './rules.js';

export const MAX_PLAYERS = 5; // предел карты: столько раскладок задано в kingdoms-rules.js
export const MIN_PLAYERS = 2;
const NAME_LIMIT = 24;

/*
  Девяносто секунд — на размещение приказа думающим человеком; так же
  считает и локальная партия против соперников от игры (R.TURN_LIMIT_MS).
  Ушедшего пропускают быстрее: возвращаться ему уже не к чему.
*/
export const TURN_LIMIT_MS = R.TURN_LIMIT_MS;
export const AWAY_TURN_LIMIT_MS = 6000;
export const OFFLINE_TURN_LIMIT_MS = 20000;
/** Пауза между ходами соперников от игры: мгновенный ход читается как вспышка. */
export const BOT_STEP_MS = 900;

/** Имя игрока: без управляющих знаков, без краёв, не длиннее строки. */
export function sanitizeName(value, fallback = 'Игрок') {
  const clean = String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_LIMIT);
  return clean || fallback;
}

/*
  Единственная настройка партии — сколько мест займут соперники от игры.
  Раскладку целиком решает число мест за столом (R.STARTING_LAYOUTS): ни
  очков, ни продолжительности партии настраивать не нужно — раундов всегда
  пять.
*/
export function sanitizeSettings(value, previous = null) {
  const asked = Number(value?.bots);
  const bots = Number.isFinite(asked)
    ? Math.max(0, Math.min(MAX_PLAYERS - 1, Math.floor(asked)))
    : Number(previous?.bots || 0);
  return { bots };
}

export const seated = (room) => room.players.filter((one) => !one.leftAt);
export const tableSize = (room) => seated(room).length + Number(room.settings?.bots || 0);
const findPlayer = (room, playerId) => room.players.find((one) => one.id === String(playerId || ''));

export function createRoomState(roomId, host, now = Date.now()) {
  const room = {
    roomId: String(roomId || '').toUpperCase(),
    phase: 'lobby', // lobby | playing
    hostPlayerId: String(host?.playerId || ''),
    players: [],
    settings: { bots: 1 },
    seats: [], // место за столом → id человека ('' у соперника от игры)
    game: null,
    turnAt: 0, // когда начался нынешний ход планирования
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  joinRoom(room, host, now);
  return room;
}

export function joinRoom(room, player, now = Date.now()) {
  const id = String(player?.playerId || '');
  if (!id) throw roomError('NO_PLAYER', 'Игрок не назвался');
  const already = findPlayer(room, id);
  if (already) {
    already.name = sanitizeName(player?.name, already.name);
    already.leftAt = 0;
    touch(room, now);
    return already;
  }
  /*
    Вход в идущую партию — не отказ, а место зрителя: человек видит карту,
    но своей области у него нет и приказов ему не разместить. Отказывать
    здесь значило бы выставлять за дверь того, кто пришёл по ссылке друга.
  */
  if (room.players.length >= MAX_PLAYERS + 3) throw roomError('ROOM_FULL', 'В комнате уже некуда');
  if (room.phase === 'lobby' && seated(room).length >= MAX_PLAYERS) {
    throw roomError('ROOM_FULL', `За столом уже ${MAX_PLAYERS}`);
  }
  const one = { id, name: sanitizeName(player?.name), ready: false, joinedAt: now, leftAt: 0 };
  room.players.push(one);
  if (!findPlayer(room, room.hostPlayerId) || findPlayer(room, room.hostPlayerId).leftAt) passHost(room);
  touch(room, now);
  return one;
}

export function leaveRoom(room, playerId, now = Date.now()) {
  const one = findPlayer(room, playerId);
  if (!one) return false;
  if (room.phase === 'lobby') room.players = room.players.filter((other) => other.id !== one.id);
  else one.leftAt = now;
  if (room.hostPlayerId === one.id) passHost(room);
  touch(room, now);
  return true;
}

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

/*
  Выбор царства в комнате — как выбор клана: одно царство — одному
  человеку. null — «всё равно»: место получит царство, что останется.
*/
export function setClan(room, playerId, kingdomId, now = Date.now()) {
  const one = findPlayer(room, playerId);
  if (!one) throw roomError('NOT_IN_ROOM', 'Вас нет в этой комнате');
  if (room.phase !== 'lobby') throw roomError('ROOM_STARTED', 'Партия уже идёт');
  const clan = kingdomId ? String(kingdomId) : null;
  if (clan && !R.kingdomOf(clan)) throw roomError('BAD_CLAN', 'Такого царства нет');
  if (clan && seated(room).some((other) => other.id !== one.id && other.clan === clan)) {
    throw roomError('CLAN_TAKEN', 'Это царство уже выбрал другой игрок');
  }
  one.clan = clan;
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
  if (room.hostPlayerId !== String(playerId || '')) throw roomError('NOT_HOST', 'Настройки меняет хозяин комнаты');
  if (room.phase !== 'lobby') throw roomError('ROOM_STARTED', 'Партия уже идёт');
  room.settings = sanitizeSettings(value, room.settings);
  room.settings.bots = Math.max(0, Math.min(room.settings.bots, MAX_PLAYERS - seated(room).length));
  touch(room, now);
  return room.settings;
}

export function canStart(room) {
  if (room.phase !== 'lobby') return false;
  const table = seated(room);
  if (!table.length) return false;
  if (tableSize(room) < MIN_PLAYERS || tableSize(room) > MAX_PLAYERS) return false;
  return table.every((one) => one.ready || one.id === room.hostPlayerId);
}

export function startGame(room, playerId, now = Date.now(), random = Math.random) {
  if (room.hostPlayerId !== String(playerId || '')) throw roomError('NOT_HOST', 'Партию начинает хозяин комнаты');
  if (room.phase !== 'lobby') throw roomError('ROOM_STARTED', 'Партия уже идёт');
  if (!canStart(room)) throw roomError('NOT_READY', 'Не все готовы');
  const table = seated(room);
  /*
    Места раздаются здесь и до конца партии не меняются. Кто выбрал
    царство в комнате, тот его и получает; остальные места добираются из
    раскладки на это число мест (R.kingdomsFor) — так же, как в партии за
    одним устройством. Имя соперника от игры — имя его
    царства: отдельного списка имён заводить незачем, царство и так
    названо.
  */
  room.seats = [...table.map((one) => one.id), ...new Array(room.settings.bots).fill('')];
  const size = room.seats.length;
  const kingdomIds = R.kingdomsFor(size, room.seats.map((id) => (id ? findPlayer(room, id).clan || null : null)));
  const players = room.seats.map((id, at) => (id
    ? { name: findPlayer(room, id).name, isBot: false }
    : { name: R.kingdomOf(kingdomIds[at]).name, isBot: true, botLevel: 'captain' }));
  room.game = E.createGame({ kingdomIds, players, random });
  room.phase = 'playing';
  room.startedAt = now;
  room.turnAt = now;
  touch(room, now);
  return room;
}

export function backToLobby(room, playerId, now = Date.now()) {
  if (room.hostPlayerId !== String(playerId || '')) throw roomError('NOT_HOST', 'Вернуть в комнату может хозяин');
  room.phase = 'lobby';
  room.game = null;
  room.seats = [];
  room.startedAt = 0;
  for (const one of room.players) one.ready = false;
  room.players = room.players.filter((one) => !one.leftAt);
  if (!findPlayer(room, room.hostPlayerId)) passHost(room);
  touch(room, now);
  return room;
}

/*
  Ещё раз, теми же людьми.

  Партия кончилась, и обычный путь отсюда — назад в комнату, где каждый заново
  жмёт «готов», а хозяин заново «начать». Для тех, кто только что доиграл и
  хочет сыграть ещё, это три лишних нажатия и полминуты на то, чтобы все
  собрались обратно, — за это время кто-нибудь да выйдет.

  Поэтому есть короткий путь: комната возвращается в лобби и тут же сдаёт
  заново. Готовность не спрашивается — её только что подтвердили самой
  доигранной партией, — а ушедшие в новую раздачу не попадают: их вычёркивает
  тот же возврат в лобби, что и всегда.
*/
export function playAgain(room, playerId, now = Date.now(), random = Math.random) {
  if (room.hostPlayerId !== String(playerId || '')) {
    throw roomError('NOT_HOST', 'Начать ещё раз может хозяин');
  }
  if (room.phase !== 'playing') throw roomError('NOT_PLAYING', 'Партия не идёт');
  backToLobby(room, playerId, now);
  for (const one of room.players) one.ready = true;
  return startGame(room, playerId, now, random);
}

/** Место человека за столом или −1, если он смотрит партию со стороны. */
export const seatOf = (room, playerId) => (room.seats || []).indexOf(String(playerId || ''));

/*
  Приказ или пропуск от игрока. Проверка своей очереди и законности приказа
  целиком лежит в движке (E.placeOrder/E.skipTurn) — комната не повторяет её,
  только переводит место за столом в номер места в партии.
*/
export function playerAction(room, playerId, action, data = {}, now = Date.now()) {
  if (room.phase !== 'playing' || !room.game) throw roomError('NOT_PLAYING', 'Партия не идёт');
  const seat = seatOf(room, playerId);
  if (seat < 0) throw roomError('NO_SEAT', 'Вы смотрите партию со стороны');
  const game = room.game;

  if (action === 'placeOrder') {
    E.placeOrder(game, seat, data);
  } else if (action === 'placeControl') {
    E.placeControl(game, seat, String(data.area || ''));
  } else if (action === 'chooseObjective') {
    E.chooseObjective(game, seat, String(data.id || ''));
    // Выбор цели — не ход: часы того, чей ход, он не трогает.
    touch(room, now);
    return room;
  } else if (action === 'useCard') {
    E.useCard(game, seat, { card: String(data.card || ''), target: String(data.target || '') });
    // Карта играется в начале хода и хода не заканчивает — часы идут дальше.
    touch(room, now);
    return room;
  } else if (action === 'skipTurn') {
    E.skipTurn(game, seat);
  } else {
    throw roomError('UNKNOWN_ACTION', 'Неизвестное действие');
  }
  room.turnAt = now;
  touch(room, now);
  return room;
}

/*
  Шаг стола без действия человека: ход соперника от игры, пропуск того, кто
  не успел, или разрешение раунда, как только оно готово. Раскрытие не ждёт
  никого — оно не спрашивает игрока, оно считает то, что все уже разместили.

  Возвращает true, если что-то случилось: по этому ответу воркер решает,
  рассылать ли новое состояние.
*/
export function stepTable(room, now = Date.now(), random = Math.random, online = null) {
  if (room.phase !== 'playing' || !room.game) return false;
  const game = room.game;
  if (game.status !== 'playing') return false;

  if (game.phase === 'reveal') {
    E.resolveRound(game);
    room.turnAt = now;
    touch(room, now);
    return true;
  }
  if (game.phase !== 'planning' && game.phase !== 'setup') return false; // results/over ждут хозяина

  const seat = E.currentTurn(game);
  if (seat < 0) return false;
  const player = game.players[seat];
  const human = room.seats[seat] ? findPlayer(room, room.seats[seat]) : null;
  const overdue = now - Number(room.turnAt ?? now) >= turnLimit(human, online);
  if (!player.isBot && !overdue) return false;

  if (player.isBot) {
    try { Bots.play(game, seat); } catch { E.skipTurn(game, seat); }
  } else {
    /*
      Человек не успел разместить приказ вовремя. Правило партии здесь —
      «пропускает размещение», а не «сервер решает за него»: соперник от
      игры и молчащий человек не должны ходить одинаково умно.
    */
    E.skipTurn(game, seat);
  }
  room.turnAt = now;
  touch(room, now);
  return true;
}

/*
  Сколько ждать этого игрока. Ушедшего — считаные секунды, потерявшего связь
  — двадцать, думающего — полторы минуты.
*/
function turnLimit(human, online) {
  if (!human) return 0;
  if (human.leftAt) return AWAY_TURN_LIMIT_MS;
  if (online && !online.has(human.id)) return OFFLINE_TURN_LIMIT_MS;
  return TURN_LIMIT_MS;
}

/** Когда столу нужен следующий ход от сервера. Ноль — не нужен вовсе. */
export function nextStepAt(room, now = Date.now(), online = null) {
  if (room.phase !== 'playing' || !room.game || room.game.status !== 'playing') return 0;
  const game = room.game;
  if (game.phase === 'reveal') return now; // разрешать раунд можно сразу, без паузы
  if (game.phase !== 'planning' && game.phase !== 'setup') return 0;
  const seat = E.currentTurn(game);
  if (seat < 0) return 0;
  const player = game.players[seat];
  if (player.isBot) return now + BOT_STEP_MS;
  const human = room.seats[seat] ? findPlayer(room, room.seats[seat]) : null;
  return Number(room.turnAt ?? now) + turnLimit(human, online);
}

export function nextRound(room, playerId, now = Date.now()) {
  if (room.phase !== 'playing' || !room.game) throw roomError('NOT_PLAYING', 'Партия не идёт');
  if (room.hostPlayerId !== String(playerId || '')) throw roomError('NOT_HOST', 'Следующий раунд начинает хозяин комнаты');
  if (!E.nextRound(room.game)) throw roomError('NOT_OVER', 'Раунд ещё не завершён');
  room.turnAt = now;
  touch(room, now);
  return room;
}

/*
  Вид комнаты для одного игрока. Место за столом решает движок
  (E.visibleStateFor): своя область и свой закрытый приказ — целиком, чужой
  закрытый приказ — только хозяин и место на карте. Зритель без места
  (seat = −1) получает тот же вид со всеми приказами закрытыми — ровно то,
  что вправе увидеть посторонний.
*/
export function buildView(room, playerId, online = new Set()) {
  const me = findPlayer(room, playerId);
  const view = {
    roomId: room.roomId,
    phase: room.phase,
    version: room.version,
    hostPlayerId: room.hostPlayerId,
    youAreHost: room.hostPlayerId === String(playerId || ''),
    you: me ? { id: me.id, name: me.name, ready: me.ready, clan: me.clan || null } : null,
    settings: { ...room.settings },
    canStart: canStart(room),
    tableSize: tableSize(room),
    maxPlayers: MAX_PLAYERS,
    minPlayers: MIN_PLAYERS,
    seat: seatOf(room, playerId),
    players: room.players.map((one) => ({
      id: one.id,
      name: one.name,
      ready: one.ready,
      clan: one.clan || null,
      host: one.id === room.hostPlayerId,
      left: Boolean(one.leftAt),
      online: online.has(one.id),
      seat: (room.seats || []).indexOf(one.id),
    })),
    game: null,
  };
  if (room.phase !== 'playing' || !room.game) return view;
  const seat = seatOf(room, playerId);
  view.game = E.visibleStateFor(room.game, seat);
  return view;
}

/*
  Комната уходит в хранилище без источника случайности: движок держит его
  прямо в состоянии партии, а Durable Object укладывает данные структурным
  клоном, на функции падающим. Перед укладкой источник снимается, после
  подъёма — ставится обратно.
*/
export function forStorage(room) {
  if (!room || !room.game) return room;
  return { ...room, game: { ...room.game, random: undefined } };
}

export function reviveGame(room, random = Math.random) {
  if (room?.game && typeof room.game.random !== 'function') room.game.random = random;
  return room;
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
