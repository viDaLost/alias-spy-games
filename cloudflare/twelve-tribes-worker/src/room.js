// room.js — комната «Двенадцати колен». Чистая, как и правила игры.
//
// Здесь нет ни сети, ни хранилища, ни часов сверх переданного времени: комната
// — это данные и переходы между ними. Ради этого её и вынесли отдельным
// файлом: так её можно прогнать проверкой без воркера, без Durable Object и
// без браузера — сотню раз, с разными порядками входов и отвалов.
//
// Что здесь есть: игроки, их готовность, настройки партии, переписка, хозяин
// комнаты и мост между местами за столом и людьми. Правил самой игры здесь
// нет — они лежат в web/games и не знают ни про какие комнаты.
//
// Главное правило этого файла — buildView. Рука игрока не покидает сервер:
// наружу уходит своя рука и только число карт у соседей. Иначе чужую руку
// читали бы во вкладке разработчика за две секунды, и игры бы не было.

import { R, E, Bots } from './rules.js';

export const MAX_PLAYERS = R.SEATS_MAX;      // восемь мест — предел колоды
export const MIN_PLAYERS = 2;
const MAX_CHAT = 60;
const NAME_LIMIT = 24;
const TEXT_LIMIT = 200;
const MAX_LOG = 10;
/*
  Сколько ждать ход. Человек думает, отвлекается на разговор, кладёт телефон —
  это нормально. Ненормально, когда из-за одного ушедшего стол стоит вечно:
  поэтому через полторы минуты за него ходит сервер — ровно так же, как ходит
  соперник от игры. Партия продолжается, место остаётся за человеком.
*/
export const TURN_LIMIT_MS = 90000;
/** За ушедшим ждать нечего: к этому ходу он уже не вернётся. */
export const AWAY_TURN_LIMIT_MS = 6000;
/*
  Связь оборвалась — ждём меньше, чем думающего. Двадцати секунд хватает
  вернуться после метро или переключения сети, и не хватает, чтобы остальные
  успели заскучать над чужим ходом.
*/
export const OFFLINE_TURN_LIMIT_MS = 20000;
/** Пауза между ходами соперников от игры: мгновенный ход читается как вспышка. */
export const BOT_STEP_MS = 900;

const BOT_NAMES = ['Асаф', 'Вооз', 'Нафан', 'Гедеон', 'Иофор', 'Елеазар', 'Ахия'];

/** Имя игрока: без управляющих знаков, без краёв, не длиннее строки. */
export function sanitizeName(value, fallback = 'Игрок') {
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
  Настройки партии — те же две, что и за одним столом: до трёхсот очков или
  одна раздача, и сколько соперников от игры сядет рядом. Числа приходят от
  игрока, и доверять им нельзя: «до скольки» может оказаться строкой.
*/
export function sanitizeSettings(value, previous = null) {
  const target = Number(value?.target) === 300 ? 300 : 0;
  const asked = Number(value?.bots);
  const bots = Number.isFinite(asked)
    ? Math.max(0, Math.min(MAX_PLAYERS - 1, Math.floor(asked)))
    : Number(previous?.bots || 0);
  return { target, bots };
}

export const seated = (room) => room.players.filter((one) => !one.leftAt);
export const tableSize = (room) => seated(room).length + Number(room.settings?.bots || 0);
const findPlayer = (room, playerId) => room.players.find((one) => one.id === String(playerId || ''));

export function createRoomState(roomId, host, now = Date.now()) {
  const room = {
    roomId: String(roomId || '').toUpperCase(),
    phase: 'lobby',                 // lobby | playing
    hostPlayerId: String(host?.playerId || ''),
    players: [],
    chat: [],
    settings: { target: 300, bots: 1 },
    seats: [],                      // место за столом → id человека ('' у соперника от игры)
    game: null,
    turnAt: 0,                      // когда начался нынешний ход
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
    // Возвращение — не новый игрок: место за столом, карты и очки остаются его.
    already.name = sanitizeName(player?.name, already.name);
    already.leftAt = 0;
    touch(room, now);
    return already;
  }
  /*
    Вход в идущую партию — не отказ, а место зрителя: человек видит стол и
    переписку, но карт ему не сдают до следующей раздачи. Отказывать здесь
    значило бы выставлять за дверь того, кто пришёл по ссылке друга.
  */
  if (room.players.length >= MAX_PLAYERS + 4) throw roomError('ROOM_FULL', 'В комнате уже некуда');
  if (room.phase === 'lobby' && seated(room).length >= MAX_PLAYERS) {
    throw roomError('ROOM_FULL', `За столом уже ${MAX_PLAYERS}`);
  }
  const one = { id, name: sanitizeName(player?.name), ready: false, joinedAt: now, leftAt: 0 };
  room.players.push(one);
  if (!findPlayer(room, room.hostPlayerId) || findPlayer(room, room.hostPlayerId).leftAt) passHost(room);
  touch(room, now);
  return one;
}

/*
  Уход. В лобби игрок вычёркивается совсем, в партии — помечается ушедшим: его
  рука и очки остаются за столом, и вернуться он должен к своему месту. За него
  тем временем ходит сервер, иначе стол замрёт на всю раздачу.
*/
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
  // Стол на восьмерых считает всех: и людей, и соперников от игры.
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
  // Переписка не растёт без предела: на телефоне её всё равно не пролистать.
  if (room.chat.length > MAX_CHAT) room.chat = room.chat.slice(-MAX_CHAT);
  touch(room, now);
  return room.chat[room.chat.length - 1];
}

export function canStart(room) {
  if (room.phase !== 'lobby') return false;
  const table = seated(room);
  if (!table.length) return false;
  if (tableSize(room) < MIN_PLAYERS || tableSize(room) > MAX_PLAYERS) return false;
  // Хозяину готовность не нужна: он и есть тот, кто нажимает «сдавать».
  return table.every((one) => one.ready || one.id === room.hostPlayerId);
}

export function startGame(room, playerId, now = Date.now(), random = Math.random) {
  if (room.hostPlayerId !== String(playerId || '')) throw roomError('NOT_HOST', 'Партию начинает хозяин комнаты');
  if (room.phase !== 'lobby') throw roomError('ROOM_STARTED', 'Партия уже идёт');
  if (!canStart(room)) throw roomError('NOT_READY', 'Не все готовы');
  const table = seated(room);
  /*
    Места раздаются здесь и до конца партии не меняются. Движок знает игроков
    по номеру места, комната — по имени подключения; seats и есть тот мост, по
    которому потом сверяется, чей сейчас ход. У соперника от игры на этом мосту
    пусто — за него ходит сервер.
  */
  room.seats = [...table.map((one) => one.id), ...new Array(room.settings.bots).fill('')];
  const players = room.seats.map((id, at) => (id
    ? { name: findPlayer(room, id).name }
    : { name: BOT_NAMES[at % BOT_NAMES.length], isBot: true }));
  room.game = E.createGame({ players, target: room.settings.target, random });
  room.game.players.forEach((one, at) => {
    one.isBot = !room.seats[at];
    one.botLevel = at % 2 ? 'elder' : 'scribe';
  });
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
  Ход игрока. Всё, что можно сделать за столом, приходит сюда — и сюда же
  сведена вся проверка прав: чужим ходом не походить, даже если попросить
  напрямую, минуя кнопки.
*/
export function playerAction(room, playerId, action, data = {}, now = Date.now()) {
  if (room.phase !== 'playing' || !room.game) throw roomError('NOT_PLAYING', 'Партия не идёт');
  const seat = seatOf(room, playerId);
  if (seat < 0) throw roomError('NO_SEAT', 'Вы смотрите партию со стороны');
  const game = room.game;

  if (action === 'play') {
    if (game.turn !== seat) throw roomError('NOT_YOUR_TURN', 'Сейчас ходите не вы');
    const index = game.players[seat].hand.findIndex((one) => one.id === String(data.card || ''));
    if (index < 0) throw roomError('NO_CARD', 'Такой карты у вас нет');
    const card = game.players[seat].hand[index];
    const camp = R.KINDS[card.kind].wild ? String(data.camp || '') : card.camp;
    if (!E.play(game, seat, index, camp)) throw roomError('BAD_MOVE', 'Такой картой сейчас не сходить');
    room.turnAt = now;
  } else if (action === 'draw') {
    if (game.turn !== seat) throw roomError('NOT_YOUR_TURN', 'Сейчас ходите не вы');
    E.draw(game, seat);
    room.turnAt = now;
  } else if (action === 'pass') {
    if (game.turn !== seat) throw roomError('NOT_YOUR_TURN', 'Сейчас ходите не вы');
    if (!E.pass(game, seat)) throw roomError('BAD_MOVE', 'Сейчас нечего оставлять себе');
    room.turnAt = now;
  } else if (action === 'jump') {
    /*
      Подброс делают не в свою очередь — в этом он весь. Поэтому здесь нет
      проверки очереди, а есть проверка самой карты: подбросить можно только
      такую же, какая лежит на столе, и решает это движок.
    */
    const index = game.players[seat].hand.findIndex((one) => one.id === String(data.card || ''));
    if (index < 0) throw roomError('NO_CARD', 'Такой карты у вас нет');
    if (!E.jump(game, seat, index)) throw roomError('BAD_JUMP', 'Эту карту сейчас не подбросить');
    room.turnAt = now;
  } else if (action === 'shabbat') {
    if (!E.shabbat(game, seat)) throw roomError('BAD_CALL', 'Сказать «Шабат» сейчас не о чем');
  } else if (action === 'catch') {
    const target = Number(data.seat);
    if (!E.catchOut(game, seat, target)) throw roomError('BAD_CATCH', 'Перебивать некого');
  } else {
    throw roomError('UNKNOWN_ACTION', 'Неизвестное действие');
  }
  touch(room, now);
  return room;
}

/*
  Шаг стола без игрока: ход соперника от игры или ход за того, кто ушёл и не
  возвращается. Делается ровно один ход за вызов — чтобы партия шла на глазах,
  а не проскакивала целиком между двумя кадрами.

  Возвращает true, если что-то случилось: по этому ответу воркер решает,
  рассылать ли новое состояние.
*/
export function stepTable(room, now = Date.now(), random = Math.random, online = null) {
  if (room.phase !== 'playing' || !room.game) return false;
  const game = room.game;
  if (game.status !== 'playing') return false;

  // Сначала объявления: соперник от игры говорит «Шабат» и перебивает соседа.
  let said = false;
  for (const one of game.players) {
    if (!one.isBot || one.hand.length !== 1 || one.said) continue;
    if (Bots.remembers(one.botLevel, random)) { E.shabbat(game, one.id); said = true; }
  }
  if (E.riskOpen(game)) {
    const target = game.risk.seat;
    for (const one of game.players) {
      if (one.id === target || !one.isBot || !Bots.notices(one.botLevel, random)) continue;
      if (E.catchOut(game, one.id, target)) { said = true; break; }
    }
  }

  /*
    Подброс соперника от игры. Делается до собственного хода и вместо него:
    подбросивший перехватывает круг на себя, и ходить дальше будет уже сосед
    за ним. Замечают они подброс не всегда — иначе человеку не досталось бы ни
    одного.
  */
  for (const one of game.players) {
    if (!one.isBot || one.out) continue;
    const jumps = E.canJump(game, one.id);
    if (!jumps.length || !Bots.jumps(one.botLevel, random)) continue;
    if (E.jump(game, one.id, jumps[0])) {
      room.turnAt = now;
      touch(room, now);
      return true;
    }
  }

  const seat = game.turn;
  const player = game.players[seat];
  const human = room.seats[seat] ? findPlayer(room, room.seats[seat]) : null;
  const overdue = now - Number(room.turnAt || now) >= turnLimit(human, online);
  if (!player.isBot && !overdue) {
    if (said) touch(room, now);
    return said;
  }

  /*
    Ход делается тем же выбором, что и за одним столом: сначала чем ходить,
    иначе взять карту и сыграть её, если подошла. Другого разума у сервера нет
    и не нужно — соперник от игры обязан быть похож на человека, а не на счёт.
  */
  const choice = Bots.pick(game, seat);
  if (choice) {
    E.play(game, seat, choice.index, choice.camp);
  } else {
    E.draw(game, seat);
    if (game.status === 'playing' && game.turn === seat && game.phase === 'drawn') {
      const after = Bots.pick(game, seat);
      if (after) E.play(game, seat, after.index, after.camp);
      else E.pass(game, seat);
    }
  }
  room.turnAt = now;
  touch(room, now);
  return true;
}

/*
  Сколько ждать этого игрока. Ушедшего — считаные секунды, потерявшего связь —
  двадцать, думающего — полторы минуты. Больше всего ждут того, кто сидит за
  столом и правда думает: это игра, а не соревнование в скорости.
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
  const seat = room.game.turn;
  const player = room.game.players[seat];
  if (player.isBot) return now + BOT_STEP_MS;
  // Кто-то остался с одной картой и молчит: соперники от игры должны успеть
  // это заметить, пока окно открыто.
  if (E.riskOpen(room.game)) return now + BOT_STEP_MS;
  const human = room.seats[seat] ? findPlayer(room, room.seats[seat]) : null;
  return Number(room.turnAt || now) + turnLimit(human, online);
}

/*
  Вид комнаты для одного игрока.

  Стол повёрнут так, что смотрящий всегда сидит на нулевом месте: экран игры
  написан от «вы — первый», и поворачивать его на клиенте значило бы завести
  вторую арифметику мест рядом с движковой. Поворот сохраняет и порядок, и
  сторону хода, поэтому очередь на столе остаётся верной.

  И главное: рука отдаётся только своя. У соседей — число карт.
*/
export function buildView(room, playerId, online = new Set()) {
  const me = findPlayer(room, playerId);
  const view = {
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
    minPlayers: MIN_PLAYERS,
    seat: seatOf(room, playerId),
    players: room.players.map((one) => ({
      id: one.id,
      name: one.name,
      ready: one.ready,
      host: one.id === room.hostPlayerId,
      left: Boolean(one.leftAt),
      online: online.has(one.id),
      seat: (room.seats || []).indexOf(one.id),
    })),
    chat: room.chat.map((line) => ({ ...line })),
    game: null,
  };
  if (room.phase !== 'playing' || !room.game) return view;

  const game = room.game;
  const size = game.players.length;
  const mine = seatOf(room, playerId);
  const base = mine >= 0 ? mine : 0;
  const rotate = (seat) => (seat - base + size) % size;
  view.game = {
    status: game.status,
    phase: game.phase,
    turn: rotate(game.turn),
    dir: game.dir,
    camp: game.camp,
    round: game.round,
    target: game.target,
    moves: game.moves,
    reshuffled: game.reshuffled,
    deck: game.deck.length,
    watching: mine < 0,
    // Сброс отдаётся хвостом: стопка на столе показывает три последние карты,
    // а вся прошлая раздача игроку не нужна и весит.
    pile: game.pile.slice(-3).map((card) => ({ ...card })),
    hand: mine >= 0 ? game.players[mine].hand.map((card) => ({ ...card })) : [],
    risk: game.risk ? { seat: rotate(game.risk.seat), until: game.risk.until } : null,
    // Накопленный перевод: сколько карт висит и какой картой его кроют.
    penalty: game.penalty ? { ...game.penalty } : null,
    winner: game.winner === null || game.winner === undefined ? null : rotate(game.winner),
    players: game.players.map((one, at) => {
      const real = (base + at) % size;
      const seatPlayer = game.players[real];
      const human = room.seats[real] ? findPlayer(room, room.seats[real]) : null;
      return {
        name: seatPlayer.name,
        cards: seatPlayer.hand.length,
        said: Boolean(seatPlayer.said),
        score: seatPlayer.score,
        // Вышедший из раздачи и его место: стол показывает их и после выхода.
        out: Boolean(seatPlayer.out),
        place: Number(seatPlayer.place || 0),
        isBot: Boolean(seatPlayer.isBot),
        online: human ? online.has(human.id) && !human.leftAt : true,
        left: human ? Boolean(human.leftAt) : false,
      };
    }),
    log: game.log.slice(-MAX_LOG).map((line) => ({ ...line })),
  };
  return view;
}

/*
  Комната уходит в хранилище без источника случайности.

  Движок держит его прямо в состоянии партии — это и позволяет прогнать десять
  тысяч раздач одинаково, — но функция не переживает укладку в хранилище:
  Durable Object укладывает данные структурным клоном, и на функции он падает.
  Поэтому перед укладкой источник снимается, а после подъёма ставится обратно.
*/
export function forStorage(room) {
  if (!room) return room;
  if (!room.game) return room;
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
