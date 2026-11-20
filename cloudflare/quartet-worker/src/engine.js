import { CARD_BY_ID, CARD_TO_QUARTET, CATALOG } from './catalog.js';

const LEGACY_QUARTET_COUNT = 12;
export const ROOM_LIMIT = 24;
// Втроём и больше. Вдвоём «Квартет» вырождается: спрашивать можно только
// одного соперника, и каждый ход — это перебор его руки, пока карта не найдётся.
// Выбор, у кого спросить, появляется начиная с третьего игрока.
export const MIN_PLAYERS = 3;
export const TURN_TIMEOUT_MS = 90_000;

export function sanitizeName(value) {
  return String(value || 'Игрок').replace(/[<>\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 32) || 'Игрок';
}

export function createRoomState(roomId, player, now = Date.now()) {
  return {
    roomId,
    version: 1,
    status: 'lobby',
    hostPlayerId: player.playerId,
    requestedQuartetCount: null,
    players: [{
      playerId: player.playerId,
      name: sanitizeName(player.name),
      joinedAt: now,
      isActive: true,
      hand: [],
      completedQuartets: [],
    }],
    turnPlayerId: null,
    turnDeadlineMs: 0,
    winnerIds: [],
    log: [`${sanitizeName(player.name)} создал комнату`],
    lastEvent: makeEvent('room_created', { playerId: player.playerId, playerName: sanitizeName(player.name) }, now),
    createdAt: now,
    updatedAt: now,
  };
}

export function joinRoom(state, player, now = Date.now()) {
  const existing = state.players.find((item) => item.playerId === player.playerId);
  const roomFull = state.status !== 'playing' && activePlayers(state).length >= ROOM_LIMIT;
  if (roomFull && (!existing || existing.isActive === false)) {
    throw gameError(`В комнате уже максимум ${ROOM_LIMIT} игроков`, 'ROOM_FULL');
  }
  if (existing) {
    if (state.status === 'playing' && existing.isActive === false) {
      throw gameError('Нельзя вернуться в уже начатую партию после выхода', 'LEFT_GAME');
    }
    existing.name = sanitizeName(player.name || existing.name);
    existing.isActive = true;
    state.updatedAt = now;
    touch(state);
    return { rejoined: true };
  }

  if (state.status !== 'lobby') throw gameError('Игра уже началась', 'GAME_STARTED');
  state.players.push({
    playerId: player.playerId,
    name: sanitizeName(player.name),
    joinedAt: now,
    isActive: true,
    hand: [],
    completedQuartets: [],
  });
  state.log.push(`${sanitizeName(player.name)} вошёл в комнату`);
  state.lastEvent = makeEvent('player_joined', { playerId: player.playerId, playerName: sanitizeName(player.name) }, now);
  trimLog(state);
  touch(state, now);
  return { rejoined: false };
}

function deckSettings(state, playerCount) {
  const min = Math.max(MIN_PLAYERS, playerCount);
  const max = CATALOG.length;
  const requested = state.requestedQuartetCount ?? null;
  return {
    min,
    max,
    requested,
    count: Math.max(min, Math.min(max, requested ?? LEGACY_QUARTET_COUNT)),
  };
}

export function setDeckSize(state, actorId, count, now = Date.now()) {
  assertHost(state, actorId);
  if (state.status !== 'lobby' && state.status !== 'finished') {
    throw gameError('Размер колоды можно изменить между партиями', 'GAME_ALREADY_RUNNING');
  }
  const { min, max } = deckSettings(state, activePlayers(state).length);
  if (count !== null && (!Number.isInteger(count) || count < min || count > max)) {
    throw gameError(`Выберите от ${min} до ${max} квартетов`, 'BAD_DECK_SIZE');
  }
  if ((state.requestedQuartetCount ?? null) === count) return;
  state.requestedQuartetCount = count;
  touch(state, now);
}

export function startGame(state, actorId, now = Date.now(), rng = cryptoRandomInt) {
  assertHost(state, actorId);
  if (state.status === 'playing') {
    throw gameError('Партия уже идёт', 'GAME_ALREADY_RUNNING');
  }
  const players = activePlayers(state);
  if (players.length < MIN_PLAYERS) {
    throw gameError(`Нужно минимум ${MIN_PLAYERS} игрока`, 'NOT_ENOUGH_PLAYERS');
  }

  for (const player of state.players) {
    player.hand = [];
    player.completedQuartets = [];
  }

  const { count } = deckSettings(state, players.length);
  const quartets = shuffle([...CATALOG], rng).slice(0, count);
  const deck = shuffle(quartets.flatMap((quartet) => quartet.cards.map((card) => card.id)), rng);
  state.dealtQuartetCount = quartets.length;
  deck.forEach((cardId, index) => {
    players[index % players.length].hand.push(cardId);
  });

  const completedNow = [];
  for (const player of players) {
    completedNow.push(...collectCompletedQuartets(player));
  }

  state.status = 'playing';
  state.winnerIds = [];
  state.turnPlayerId = firstTurnPlayer(state)?.playerId || null;
  state.turnDeadlineMs = state.turnPlayerId ? now + TURN_TIMEOUT_MS : 0;
  state.log = [`Игра началась · ${players.length} игроков · ${quartets.length} квартетов`];
  for (const entry of completedNow) {
    state.log.push(`${entry.player.name} сразу собрал «${entry.quartet.name}»`);
  }
  state.lastEvent = makeEvent('game_started', { playerCount: players.length }, now);
  touch(state, now);
  checkFinished(state, now);
  return state;
}

export function askCard(state, actorId, targetId, cardId, now = Date.now()) {
  if (state.status !== 'playing') throw gameError('Игра сейчас не идёт', 'NOT_PLAYING');
  if (state.turnPlayerId !== actorId) throw gameError('Сейчас ход другого игрока', 'NOT_YOUR_TURN');

  const asker = getActivePlayer(state, actorId);
  const target = getActivePlayer(state, targetId);
  if (!asker || !target) throw gameError('Игрок недоступен', 'PLAYER_NOT_FOUND');
  if (actorId === targetId) throw gameError('Нельзя спрашивать карту у себя', 'SELF_TARGET');
  if (target.hand.length === 0) throw gameError('У игрока больше нет карт', 'EMPTY_TARGET');

  const card = CARD_BY_ID.get(cardId);
  const quartet = CARD_TO_QUARTET.get(cardId);
  if (!card || !quartet) throw gameError('Неизвестная карта', 'UNKNOWN_CARD');
  if (asker.hand.includes(cardId)) throw gameError('Эта карта у тебя уже есть', 'ALREADY_OWNED');

  const ownsSameQuartet = quartet.cards.some((item) => asker.hand.includes(item.id));
  if (!ownsSameQuartet) {
    throw gameError('Можно спрашивать только карту из квартета, который уже есть у тебя', 'QUARTET_NOT_OPENED');
  }

  const targetIndex = target.hand.indexOf(cardId);
  if (targetIndex >= 0) {
    target.hand.splice(targetIndex, 1);
    asker.hand.push(cardId);
    const completed = collectCompletedQuartets(asker);
    const completedNames = completed.map((entry) => entry.quartet.name);

    state.log.push(`${asker.name} получил «${card.title}» у ${target.name}`);
    for (const name of completedNames) state.log.push(`${asker.name} собрал квартет «${name}» 🏆`);

    state.lastEvent = makeEvent('ask_success', {
      actorId,
      actorName: asker.name,
      targetId,
      targetName: target.name,
      cardId,
      cardTitle: card.title,
      quartetId: quartet.id,
      completedQuartets: completedNames,
    }, now);

    checkFinished(state, now);
    if (state.status === 'playing') {
      if (asker.hand.length === 0) {
        state.turnPlayerId = nextTurnPlayer(state, actorId)?.playerId || null;
      } else {
        state.turnPlayerId = actorId;
      }
      state.turnDeadlineMs = state.turnPlayerId ? now + TURN_TIMEOUT_MS : 0;
    }
  } else {
    const next = nextTurnPlayer(state, actorId);
    state.turnPlayerId = next?.playerId || null;
    state.turnDeadlineMs = state.turnPlayerId ? now + TURN_TIMEOUT_MS : 0;
    state.log.push(`${asker.name} спросил «${card.title}» у ${target.name} — карты нет`);
    state.lastEvent = makeEvent('ask_miss', {
      actorId,
      actorName: asker.name,
      targetId,
      targetName: target.name,
      cardId,
      cardTitle: card.title,
      quartetId: quartet.id,
    }, now);
  }

  trimLog(state);
  touch(state, now);
  return state.lastEvent;
}

export function passTimedOutTurn(state, now = Date.now()) {
  if (state.status !== 'playing' || !state.turnPlayerId || state.turnDeadlineMs > now) return false;
  const player = getActivePlayer(state, state.turnPlayerId);
  const next = nextTurnPlayer(state, state.turnPlayerId);
  if (!next) return false;

  state.log.push(`${player?.name || 'Игрок'} пропустил ход по таймеру`);
  state.lastEvent = makeEvent('turn_timeout', {
    actorId: player?.playerId || state.turnPlayerId,
    actorName: player?.name || 'Игрок',
  }, now);
  state.turnPlayerId = next.playerId;
  state.turnDeadlineMs = now + TURN_TIMEOUT_MS;
  trimLog(state);
  touch(state, now);
  return true;
}

export function leaveRoom(state, actorId, now = Date.now()) {
  const player = getActivePlayer(state, actorId);
  if (!player) return { deleted: false, changed: false };

  if (state.status === 'lobby') {
    state.players = state.players.filter((item) => item.playerId !== actorId);
    state.log.push(`${player.name} вышел из комнаты`);
  } else if (state.status === 'finished') {
    player.isActive = false;
  } else {
    player.isActive = false;
    const remaining = activePlayers(state);
    if (remaining.length) {
      let cursor = 0;
      const cards = [...player.hand];
      player.hand = [];
      for (const cardId of cards) {
        remaining[cursor % remaining.length].hand.push(cardId);
        cursor += 1;
      }
      for (const recipient of remaining) collectCompletedQuartets(recipient);
      state.log.push(`${player.name} вышел · его карты перераспределены`);
      if (remaining.length === 1) {
        state.status = 'finished';
        state.turnPlayerId = null;
        state.turnDeadlineMs = 0;
        state.winnerIds = [remaining[0].playerId];
        state.log.push(`Игра завершена · ${remaining[0].name}`);
        state.lastEvent = makeEvent('game_finished', { winnerIds: [remaining[0].playerId], winnerNames: [remaining[0].name] }, now);
      }
    } else {
      player.hand = [];
      state.status = 'finished';
      state.turnPlayerId = null;
      state.turnDeadlineMs = 0;
      state.winnerIds = [];
    }
  }

  if (!state.players.length || activePlayers(state).length === 0) {
    return { deleted: true, changed: true };
  }

  if (state.hostPlayerId === actorId || !getActivePlayer(state, state.hostPlayerId)) {
    state.hostPlayerId = activePlayers(state)[0]?.playerId || state.players[0]?.playerId || null;
  }

  const current = getActivePlayer(state, state.turnPlayerId);
  if (state.status === 'playing' && !current?.hand.length) {
    state.turnPlayerId = nextTurnPlayer(state, state.turnPlayerId)?.playerId || null;
    state.turnDeadlineMs = state.turnPlayerId ? now + TURN_TIMEOUT_MS : 0;
  }

  if (state.status !== 'finished') state.lastEvent = makeEvent('player_left', { playerId: actorId, playerName: player.name }, now);
  trimLog(state);
  touch(state, now);
  checkFinished(state, now);
  return { deleted: false, changed: true };
}

export function restartGame(state, actorId, now = Date.now(), rng = cryptoRandomInt) {
  return startGame(state, actorId, now, rng);
}

export function buildView(state, playerId, connectedIds = new Set()) {
  const me = state.players.find((item) => item.playerId === playerId) || null;
  const players = state.players.map((player) => ({
    playerId: player.playerId,
    name: player.name,
    isHost: player.playerId === state.hostPlayerId,
    isActive: player.isActive !== false,
    connected: connectedIds.has(player.playerId),
    cardsCount: player.hand.length,
    quartetsCount: player.completedQuartets.length,
    completedQuartets: [...player.completedQuartets],
  }));

  const turnPlayer = state.players.find((item) => item.playerId === state.turnPlayerId);
  const score = [...players]
    .sort((a, b) => b.quartetsCount - a.quartetsCount || b.cardsCount - a.cardsCount || a.name.localeCompare(b.name, 'ru'));
  const limits = deckSettings(state, players.filter((player) => player.isActive).length);

  return {
    roomId: state.roomId,
    version: state.version,
    status: state.status,
    hostPlayerId: state.hostPlayerId,
    players,
    me: me ? {
      playerId: me.playerId,
      name: me.name,
      hand: [...me.hand],
      completedQuartets: [...me.completedQuartets],
      quartetsCount: me.completedQuartets.length,
      cardsCount: me.hand.length,
      isHost: me.playerId === state.hostPlayerId,
    } : null,
    turnPlayerId: state.turnPlayerId,
    turnPlayerName: turnPlayer?.name || '',
    turnDeadlineMs: state.turnDeadlineMs,
    winnerIds: [...(state.winnerIds || [])],
    score,
    log: [...state.log],
    lastEvent: state.lastEvent,
    totalQuartets: state.status === 'lobby' ? limits.count : state.dealtQuartetCount ?? LEGACY_QUARTET_COUNT,
    deckSettings: limits,
    playerLimit: ROOM_LIMIT,
    minPlayers: MIN_PLAYERS,
  };
}

export function checkFinished(state, now = Date.now()) {
  if (state.status !== 'playing') return false;
  const completed = state.players.reduce((sum, player) => sum + player.completedQuartets.length, 0);
  const cardsInHands = state.players.reduce((sum, player) => sum + player.hand.length, 0);
  if (completed < (state.dealtQuartetCount ?? LEGACY_QUARTET_COUNT) && cardsInHands > 0) return false;

  state.status = 'finished';
  state.turnPlayerId = null;
  state.turnDeadlineMs = 0;
  const active = state.players.filter((item) => item.isActive !== false);
  const best = Math.max(0, ...active.map((item) => item.completedQuartets.length));
  state.winnerIds = active.filter((item) => item.completedQuartets.length === best).map((item) => item.playerId);
  const winners = active.filter((item) => state.winnerIds.includes(item.playerId)).map((item) => item.name);
  state.log.push(`Игра завершена · ${winners.length ? winners.join(', ') : 'нет победителя'}`);
  state.lastEvent = makeEvent('game_finished', { winnerIds: [...state.winnerIds], winnerNames: winners }, now);
  trimLog(state);
  touch(state, now);
  return true;
}

function collectCompletedQuartets(player) {
  const completed = [];
  const handSet = new Set(player.hand);
  for (const quartet of CATALOG) {
    if (player.completedQuartets.includes(quartet.id)) continue;
    if (quartet.cards.every((card) => handSet.has(card.id))) {
      player.completedQuartets.push(quartet.id);
      const ids = new Set(quartet.cards.map((card) => card.id));
      player.hand = player.hand.filter((cardId) => !ids.has(cardId));
      for (const id of ids) handSet.delete(id);
      completed.push({ player, quartet });
    }
  }
  return completed;
}

function firstTurnPlayer(state) {
  return activePlayers(state).find((player) => player.hand.length > 0) || activePlayers(state)[0] || null;
}

function nextTurnPlayer(state, currentId) {
  const players = state.players;
  if (!players.length) return null;
  const currentIndex = players.findIndex((item) => item.playerId === currentId);
  for (let step = 1; step <= players.length; step += 1) {
    const candidate = players[(currentIndex + step) % players.length];
    if (candidate.isActive !== false && candidate.hand.length > 0) return candidate;
  }
  return null;
}

function activePlayers(state) {
  return state.players.filter((item) => item.isActive !== false);
}

function getActivePlayer(state, playerId) {
  return state.players.find((item) => item.playerId === playerId && item.isActive !== false) || null;
}

function assertHost(state, actorId) {
  if (state.hostPlayerId !== actorId) throw gameError('Только ведущий может начать новую партию', 'HOST_ONLY');
}

function touch(state, now = Date.now()) {
  state.version = Number(state.version || 0) + 1;
  state.updatedAt = now;
}

function trimLog(state) {
  if (state.log.length > 60) state.log = state.log.slice(-60);
}

function makeEvent(type, payload, now) {
  return { id: `${now}_${Math.random().toString(36).slice(2, 8)}`, type, at: now, ...payload };
}

function shuffle(items, rng) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function cryptoRandomInt(maxExclusive) {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % maxExclusive;
}

export function gameError(message, code = 'GAME_ERROR') {
  const error = new Error(message);
  error.code = code;
  return error;
}
