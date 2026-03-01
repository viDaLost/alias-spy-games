/**
 * Quartet (Квартет) — Google Apps Script WebApp API
 * Хранение состояния в Google Sheets.
 *
 * Как развернуть:
 * 1) Создай Google Таблицу.
 * 2) Extensions → Apps Script → вставь этот файл (можно как один .gs).
 * 3) Запусти setupQuartetSheets() один раз.
 * 4) Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5) Скопируй URL WebApp и вставь в игре как GAS_URL.
 */

const Q_SHEETS = {
  ROOMS: "Rooms",
  PLAYERS: "Players",
  PENDING: "Pending",
  LOG: "Log",
};

const Q_RULES = {
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 8,
  GIVE_TIMEOUT_MS: 10_000,
};

/**
 * Колода 12 квартетов / 48 карт.
 * cardId должен совпадать с data/quartet_bible.json
 */
const Q_DECK = (function buildDeck_() {
  const quartets = [
    { id: "apostles", name: "Апостолы (из 12)", cards: [
      { id: "apostles_peter", title: "Пётр" },
      { id: "apostles_john", title: "Иоанн" },
      { id: "apostles_james", title: "Иаков" },
      { id: "apostles_andrew", title: "Андрей" },
    ]},
    { id: "evangelists", name: "Евангелисты", cards: [
      { id: "evangelists_matthew", title: "Матфей" },
      { id: "evangelists_mark", title: "Марк" },
      { id: "evangelists_luke", title: "Лука" },
      { id: "evangelists_john", title: "Иоанн" },
    ]},
    { id: "patriarchs", name: "Патриархи", cards: [
      { id: "patriarchs_abraham", title: "Авраам" },
      { id: "patriarchs_isaac", title: "Исаак" },
      { id: "patriarchs_jacob", title: "Иаков" },
      { id: "patriarchs_joseph", title: "Иосиф" },
    ]},
    { id: "major_prophets", name: "Пророки", cards: [
      { id: "prophets_isaiah", title: "Исаия" },
      { id: "prophets_jeremiah", title: "Иеремия" },
      { id: "prophets_ezekiel", title: "Иезекииль" },
      { id: "prophets_daniel", title: "Даниил" },
    ]},
    { id: "judges", name: "Судьи Израиля", cards: [
      { id: "judges_deborah", title: "Девора" },
      { id: "judges_gideon", title: "Гедеон" },
      { id: "judges_samson", title: "Самсон" },
      { id: "judges_jephthah", title: "Иеффай" },
    ]},
    { id: "kings", name: "Цари Израиля", cards: [
      { id: "kings_saul", title: "Саул" },
      { id: "kings_david", title: "Давид" },
      { id: "kings_solomon", title: "Соломон" },
      { id: "kings_hezekiah", title: "Езекия" },
    ]},
    { id: "matriarchs", name: "Жёны веры", cards: [
      { id: "matriarchs_sarah", title: "Сарра" },
      { id: "matriarchs_rebekah", title: "Ревекка" },
      { id: "matriarchs_rachel", title: "Рахиль" },
      { id: "matriarchs_leah", title: "Лия" },
    ]},
    { id: "women_nt", name: "Женщины Библии", cards: [
      { id: "women_ruth", title: "Руфь" },
      { id: "women_esther", title: "Есфирь" },
      { id: "women_mary", title: "Мария" },
      { id: "women_anna", title: "Анна" },
    ]},
    { id: "paul_team", name: "Сотрудники Павла", cards: [
      { id: "paulteam_barnabas", title: "Варнава" },
      { id: "paulteam_silas", title: "Сила" },
      { id: "paulteam_timothy", title: "Тимофей" },
      { id: "paulteam_titus", title: "Тит" },
    ]},
    { id: "nt_places", name: "Города Нового Завета", cards: [
      { id: "places_bethlehem", title: "Вифлеем" },
      { id: "places_nazareth", title: "Назарет" },
      { id: "places_capernaum", title: "Капернаум" },
      { id: "places_jerusalem", title: "Иерусалим" },
    ]},
    { id: "miracles_jesus", name: "Чудеса Иисуса", cards: [
      { id: "miracles_water_wine", title: "Вода в вино" },
      { id: "miracles_feeding_5000", title: "Накормил 5000" },
      { id: "miracles_calm_storm", title: "Утихомирил бурю" },
      { id: "miracles_raise_lazarus", title: "Воскресил Лазаря" },
    ]},
    { id: "armor_of_god", name: "Всеоружие Божие (Еф 6)", cards: [
      { id: "armor_belt_truth", title: "Пояс истины" },
      { id: "armor_breastplate", title: "Броня праведности" },
      { id: "armor_shield_faith", title: "Щит веры" },
      { id: "armor_helmet_salvation", title: "Шлем спасения" },
    ]},
  ];

  const cardToQuartet = {};
  const cardTitle = {};
  for (const q of quartets) {
    for (const c of q.cards) {
      cardToQuartet[c.id] = q.id;
      cardTitle[c.id] = c.title;
    }
  }

  return { quartets: quartets, cardToQuartet: cardToQuartet, cardTitle: cardTitle };
})();

function setupQuartetSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, Q_SHEETS.ROOMS, [
    "roomId", "status", "hostId", "turnPlayerId", "version", "createdAtMs"
  ]);
  ensureSheet_(ss, Q_SHEETS.PLAYERS, [
    "roomId", "playerId", "name", "isHost", "isActive", "handJson", "quartetsJson", "lastSeenMs"
  ]);
  ensureSheet_(ss, Q_SHEETS.PENDING, [
    "roomId", "pendingId", "status", "askerId", "targetId", "cardId", "createdAtMs"
  ]);
  ensureSheet_(ss, Q_SHEETS.LOG, [
    "roomId", "tsMs", "text"
  ]);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20_000);
  try {
    const body = JSON.parse(e.postData.contents || "{}") || {};
    const action = String(body.action || "");
    const roomId = (body.roomId ? String(body.roomId) : "").toUpperCase();
    const playerId = String(body.playerId || "");
    const name = sanitizeName_(body.name);

    if (!action) return json_({ ok: false, error: "No action" });

    if (action === "createRoom") {
      const rid = createRoom_(playerId, name);
      return json_({ ok: true, roomId: rid });
    }
    if (action === "joinRoom") {
      if (!roomId) return json_({ ok: false, error: "roomId required" });
      joinRoom_(roomId, playerId, name);
      return json_({ ok: true });
    }
    if (action === "leave") {
      if (!roomId) return json_({ ok: true });
      markLeft_(roomId, playerId);
      return json_({ ok: true });
    }
    if (action === "startGame") {
      ensureInRoom_(roomId, playerId);
      startGame_(roomId, playerId);
      return json_({ ok: true });
    }
    if (action === "askCard") {
      const targetId = String(body.targetId || "");
      const cardId = String(body.cardId || "");
      askCard_(roomId, playerId, targetId, cardId);
      return json_({ ok: true });
    }
    if (action === "giveCard") {
      const pendingId = String(body.pendingId || "");
      giveCard_(roomId, playerId, pendingId);
      return json_({ ok: true });
    }
    if (action === "getState") {
      ensureInRoom_(roomId, playerId);
      const st = getState_(roomId, playerId);
      return json_({ ok: true, state: st });
    }

    return json_({ ok: false, error: "Unknown action" });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

// =========================
// Core actions
// =========================

function createRoom_(playerId, name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rooms = ss.getSheetByName(Q_SHEETS.ROOMS);
  const players = ss.getSheetByName(Q_SHEETS.PLAYERS);

  const roomId = randomRoomId_();
  const now = Date.now();

  rooms.appendRow([roomId, "lobby", playerId, playerId, 1, now]);
  players.appendRow([roomId, playerId, name, true, true, JSON.stringify([]), JSON.stringify([]), now]);
  log_(roomId, `Комната создана. Хост: ${name}`);
  return roomId;
}

function joinRoom_(roomId, playerId, name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rooms = ss.getSheetByName(Q_SHEETS.ROOMS);
  const players = ss.getSheetByName(Q_SHEETS.PLAYERS);
  const now = Date.now();

  const roomRow = findRow_(rooms, 1, roomId);
  if (!roomRow) throw new Error("Комната не найдена");

  const status = rooms.getRange(roomRow, 2).getValue();
  if (status === "finished") throw new Error("Игра уже завершена");

  // если игрок уже есть — обновим имя/lastSeen
  const pr = findPlayerRow_(players, roomId, playerId);
  if (pr) {
    players.getRange(pr, 3).setValue(name);
    players.getRange(pr, 5).setValue(true);
    players.getRange(pr, 8).setValue(now);
    bumpVersion_(rooms, roomRow);
    return;
  }

  const count = countPlayers_(players, roomId);
  if (count >= Q_RULES.MAX_PLAYERS) throw new Error("В комнате уже 8 игроков");

  players.appendRow([roomId, playerId, name, false, true, JSON.stringify([]), JSON.stringify([]), now]);
  bumpVersion_(rooms, roomRow);
  log_(roomId, `${name} вошёл(ла) в комнату.`);
}

function markLeft_(roomId, playerId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rooms = ss.getSheetByName(Q_SHEETS.ROOMS);
  const players = ss.getSheetByName(Q_SHEETS.PLAYERS);

  const roomRow = findRow_(rooms, 1, roomId);
  if (!roomRow) return;
  const pr = findPlayerRow_(players, roomId, playerId);
  if (!pr) return;

  players.getRange(pr, 5).setValue(false);
  bumpVersion_(rooms, roomRow);
}

function startGame_(roomId, hostId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rooms = ss.getSheetByName(Q_SHEETS.ROOMS);
  const players = ss.getSheetByName(Q_SHEETS.PLAYERS);
  const pending = ss.getSheetByName(Q_SHEETS.PENDING);

  const roomRow = findRow_(rooms, 1, roomId);
  if (!roomRow) throw new Error("Комната не найдена");
  const realHostId = String(rooms.getRange(roomRow, 3).getValue());
  if (String(hostId) !== realHostId) throw new Error("Только хост может начать игру");

  const ps = listPlayers_(players, roomId).filter(p => p.isActive);
  if (ps.length < Q_RULES.MIN_PLAYERS) throw new Error("Нужно минимум 4 игрока");

  // очистим pending
  clearPending_(pending, roomId);

  // создаём колоду и раздаём
  const allCards = [];
  for (const q of Q_DECK.quartets) for (const c of q.cards) allCards.push(c.id);
  shuffleInPlace_(allCards);

  // round-robin
  for (let i = 0; i < ps.length; i++) {
    ps[i].hand = [];
    ps[i].quartets = [];
  }
  for (let i = 0; i < allCards.length; i++) {
    ps[i % ps.length].hand.push(allCards[i]);
  }

  // записать обратно
  for (const p of ps) {
    const pr = findPlayerRow_(players, roomId, p.playerId);
    players.getRange(pr, 6).setValue(JSON.stringify(p.hand));
    players.getRange(pr, 7).setValue(JSON.stringify([]));
  }

  // первый ход — хост
  rooms.getRange(roomRow, 2).setValue("playing");
  rooms.getRange(roomRow, 4).setValue(realHostId);
  bumpVersion_(rooms, roomRow);
  log_(roomId, "Игра началась. Карты розданы.");

  // Авто-сбор квартетов при раздаче (если повезло)
  for (const p of ps) {
    autoCollectQuartets_(roomId, p.playerId);
  }
}

function askCard_(roomId, askerId, targetId, cardId) {
  if (!roomId) throw new Error("roomId required");
  if (!targetId) throw new Error("targetId required");
  if (!cardId) throw new Error("cardId required");
  if (!Q_DECK.cardToQuartet[cardId]) throw new Error("Неизвестная карта");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rooms = ss.getSheetByName(Q_SHEETS.ROOMS);
  const players = ss.getSheetByName(Q_SHEETS.PLAYERS);
  const pending = ss.getSheetByName(Q_SHEETS.PENDING);

  const roomRow = findRow_(rooms, 1, roomId);
  if (!roomRow) throw new Error("Комната не найдена");
  const status = String(rooms.getRange(roomRow, 2).getValue());
  if (status !== "playing") throw new Error("Игра ещё не началась");

  // нельзя спрашивать, если уже есть pending
  const pend = getPending_(pending, roomId);
  if (pend) throw new Error("Есть активный запрос. Подожди.");

  const turnId = String(rooms.getRange(roomRow, 4).getValue());
  if (String(askerId) !== turnId) throw new Error("Сейчас не твой ход");

  const asker = getPlayer_(players, roomId, askerId);
  const target = getPlayer_(players, roomId, targetId);
  if (!asker || !asker.isActive) throw new Error("Игрок не активен");
  if (!target || !target.isActive) throw new Error("Цель не активна");

  const qid = Q_DECK.cardToQuartet[cardId];
  const askerHasAny = (asker.hand || []).some(c => Q_DECK.cardToQuartet[c] === qid);
  if (!askerHasAny) throw new Error("Можно спрашивать только карту из квартета, часть которого у тебя уже есть");

  const targetHas = (target.hand || []).indexOf(cardId) >= 0;
  const askerName = asker.name || "Игрок";
  const targetName = target.name || "Игрок";
  const title = Q_DECK.cardTitle[cardId] || cardId;

  if (!targetHas) {
    // промах — ход переходит target
    rooms.getRange(roomRow, 4).setValue(String(targetId));
    bumpVersion_(rooms, roomRow);
    log_(roomId, `${askerName} спросил(а) у ${targetName}: «${title}» — карты нет. Ход переходит к ${targetName}.`);
    return;
  }

  // Есть карта — создаём pending на 10 секунд
  const pendingId = Utilities.getUuid();
  pending.appendRow([roomId, pendingId, "waiting", String(askerId), String(targetId), String(cardId), Date.now()]);
  bumpVersion_(rooms, roomRow);
  log_(roomId, `${askerName} спросил(а) у ${targetName}: «${title}». Ожидаем ответ (10 сек).`);
}

function giveCard_(roomId, actorId, pendingId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rooms = ss.getSheetByName(Q_SHEETS.ROOMS);
  const pending = ss.getSheetByName(Q_SHEETS.PENDING);

  const roomRow = findRow_(rooms, 1, roomId);
  if (!roomRow) throw new Error("Комната не найдена");

  const pend = getPending_(pending, roomId);
  if (!pend) throw new Error("Нет активного запроса");
  if (String(pend.pendingId) !== String(pendingId)) throw new Error("pendingId не совпадает");
  if (String(pend.targetId) !== String(actorId)) throw new Error("Отдать может только тот, кого спросили");

  resolvePending_(roomId, pend, true);
}

function getState_(roomId, viewerId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rooms = ss.getSheetByName(Q_SHEETS.ROOMS);
  const players = ss.getSheetByName(Q_SHEETS.PLAYERS);
  const pending = ss.getSheetByName(Q_SHEETS.PENDING);
  const logS = ss.getSheetByName(Q_SHEETS.LOG);

  const roomRow = findRow_(rooms, 1, roomId);
  if (!roomRow) throw new Error("Комната не найдена");

  // авто-резолв pending, если истёк
  const pend = getPending_(pending, roomId);
  if (pend) {
    const expiresAt = Number(pend.createdAtMs) + Q_RULES.GIVE_TIMEOUT_MS;
    if (Date.now() >= expiresAt) {
      resolvePending_(roomId, pend, false);
    }
  }

  const status = String(rooms.getRange(roomRow, 2).getValue());
  const hostId = String(rooms.getRange(roomRow, 3).getValue());
  const turnPlayerId = String(rooms.getRange(roomRow, 4).getValue());
  const version = Number(rooms.getRange(roomRow, 5).getValue()) || 1;

  // players list
  const ps = listPlayers_(players, roomId);
  const me = ps.find(p => String(p.playerId) === String(viewerId));
  if (!me) throw new Error("Ты не в комнате");

  // обновим lastSeen
  const pr = findPlayerRow_(players, roomId, viewerId);
  players.getRange(pr, 8).setValue(Date.now());

  const publicPlayers = ps.map(p => ({
    playerId: String(p.playerId),
    name: p.name,
    isHost: String(p.playerId) === hostId,
    isActive: !!p.isActive,
    cardsCount: (p.hand || []).length,
    quartetsCount: (p.quartets || []).length,
  }));

  // pending view
  const pendNow = getPending_(pending, roomId);
  let pendingView = null;
  if (pendNow) {
    const expiresAtMs = Number(pendNow.createdAtMs) + Q_RULES.GIVE_TIMEOUT_MS;
    const asker = ps.find(p => String(p.playerId) === String(pendNow.askerId));
    const target = ps.find(p => String(p.playerId) === String(pendNow.targetId));
    const cardTitle = Q_DECK.cardTitle[pendNow.cardId] || pendNow.cardId;
    const targetHasCard = target ? (target.hand || []).indexOf(pendNow.cardId) >= 0 : false;
    pendingView = {
      pendingId: pendNow.pendingId,
      status: pendNow.status,
      askerId: pendNow.askerId,
      targetId: pendNow.targetId,
      cardId: pendNow.cardId,
      cardTitle: cardTitle,
      askerName: asker ? asker.name : "",
      targetName: target ? target.name : "",
      targetHasCard: targetHasCard,
      createdAtMs: Number(pendNow.createdAtMs),
      expiresAtMs: expiresAtMs,
    };
  }

  const turnName = (ps.find(p => String(p.playerId) === String(turnPlayerId)) || {}).name || "";

  // log
  const logItems = readLog_(logS, roomId, 60);

  return {
    roomId: roomId,
    status: status,
    hostId: hostId,
    turnPlayerId: turnPlayerId,
    turnPlayerName: turnName,
    version: version,
    players: publicPlayers,
    me: {
      playerId: String(me.playerId),
      name: me.name,
      isHost: String(me.playerId) === hostId,
      isActive: !!me.isActive,
      hand: me.hand || [],
      quartetsCount: (me.quartets || []).length,
    },
    pending: pendingView,
    log: logItems,
  };
}

// =========================
// Pending resolve
// =========================

function resolvePending_(roomId, pend, manual) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rooms = ss.getSheetByName(Q_SHEETS.ROOMS);
  const players = ss.getSheetByName(Q_SHEETS.PLAYERS);
  const pending = ss.getSheetByName(Q_SHEETS.PENDING);

  const roomRow = findRow_(rooms, 1, roomId);
  if (!roomRow) return;

  const asker = getPlayer_(players, roomId, pend.askerId);
  const target = getPlayer_(players, roomId, pend.targetId);
  if (!asker || !target) {
    clearPending_(pending, roomId);
    bumpVersion_(rooms, roomRow);
    return;
  }

  const cardId = String(pend.cardId);
  const title = Q_DECK.cardTitle[cardId] || cardId;
  const askerName = asker.name || "Игрок";
  const targetName = target.name || "Игрок";
  const targetHas = (target.hand || []).indexOf(cardId) >= 0;

  if (targetHas) {
    // передаём карту
    target.hand = (target.hand || []).filter(c => c !== cardId);
    asker.hand = (asker.hand || []).concat([cardId]);
    setPlayerHand_(players, roomId, target.playerId, target.hand);
    setPlayerHand_(players, roomId, asker.playerId, asker.hand);

    clearPending_(pending, roomId);
    bumpVersion_(rooms, roomRow);
    log_(roomId, `${targetName} отдал(а) карту «${title}» игроку ${askerName}${manual ? "" : " (авто через 10 сек)"}. ${askerName} ходит ещё раз.`);

    // ход остаётся у asker
    rooms.getRange(roomRow, 4).setValue(String(asker.playerId));

    // автосбор квартетов
    autoCollectQuartets_(roomId, asker.playerId);
    autoCollectQuartets_(roomId, target.playerId);
    return;
  }

  // карты нет (может случиться, если карту успели отдать раньше, но на всякий)
  clearPending_(pending, roomId);
  rooms.getRange(roomRow, 4).setValue(String(target.playerId));
  bumpVersion_(rooms, roomRow);
  log_(roomId, `${askerName} спросил(а) «${title}» у ${targetName} — карты нет. Ход переходит к ${targetName}.`);
}

function autoCollectQuartets_(roomId, playerId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rooms = ss.getSheetByName(Q_SHEETS.ROOMS);
  const players = ss.getSheetByName(Q_SHEETS.PLAYERS);
  const roomRow = findRow_(rooms, 1, roomId);
  if (!roomRow) return;

  const p = getPlayer_(players, roomId, playerId);
  if (!p || !p.isActive) return;

  const hand = p.hand || [];
  const have = new Set(hand);
  const collected = new Set(p.quartets || []);

  let changed = false;

  for (const q of Q_DECK.quartets) {
    if (collected.has(q.id)) continue;
    const full = q.cards.every(c => have.has(c.id));
    if (!full) continue;

    // убрать 4 карты
    for (const c of q.cards) {
      const idx = hand.indexOf(c.id);
      if (idx >= 0) hand.splice(idx, 1);
    }
    collected.add(q.id);
    changed = true;
    log_(roomId, `${p.name} собрал(а) квартет: «${q.name}».`);
  }

  if (changed) {
    setPlayerHand_(players, roomId, playerId, hand);
    setPlayerQuartets_(players, roomId, playerId, Array.from(collected));
    bumpVersion_(rooms, roomRow);
  }

  // Если игрок остался без карт — выбыл
  if ((hand || []).length === 0 && p.isActive) {
    const pr = findPlayerRow_(players, roomId, playerId);
    players.getRange(pr, 5).setValue(false);
    bumpVersion_(rooms, roomRow);
    log_(roomId, `${p.name} остался без карт и выбыл(а) из игры.`);
  }
}

// =========================
// Helpers
// =========================

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizeName_(name) {
  const s = String(name || "Игрок").trim();
  if (!s) return "Игрок";
  return s.slice(0, 24);
}

function randomRoomId_() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function shuffleInPlace_(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

function findRow_(sheet, colIndex, value) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const range = sheet.getRange(2, colIndex, last - 1, 1).getValues();
  for (let i = 0; i < range.length; i++) {
    if (String(range[i][0]) === String(value)) return i + 2;
  }
  return null;
}

function bumpVersion_(roomsSheet, roomRow) {
  const v = Number(roomsSheet.getRange(roomRow, 5).getValue()) || 0;
  roomsSheet.getRange(roomRow, 5).setValue(v + 1);
}

function countPlayers_(playersSheet, roomId) {
  const last = playersSheet.getLastRow();
  if (last < 2) return 0;
  const vals = playersSheet.getRange(2, 1, last - 1, 2).getValues();
  let c = 0;
  for (const row of vals) if (String(row[0]) === String(roomId)) c++;
  return c;
}

function findPlayerRow_(playersSheet, roomId, playerId) {
  const last = playersSheet.getLastRow();
  if (last < 2) return null;
  const vals = playersSheet.getRange(2, 1, last - 1, 2).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(roomId) && String(vals[i][1]) === String(playerId)) return i + 2;
  }
  return null;
}

function listPlayers_(playersSheet, roomId) {
  const last = playersSheet.getLastRow();
  if (last < 2) return [];
  const vals = playersSheet.getRange(2, 1, last - 1, 8).getValues();
  const out = [];
  for (const r of vals) {
    if (String(r[0]) !== String(roomId)) continue;
    out.push({
      roomId: String(r[0]),
      playerId: String(r[1]),
      name: String(r[2] || "Игрок"),
      isHost: String(r[3]) === "true" || r[3] === true,
      isActive: String(r[4]) === "true" || r[4] === true,
      hand: safeJsonArray_(r[5]),
      quartets: safeJsonArray_(r[6]),
      lastSeenMs: Number(r[7] || 0),
    });
  }
  return out;
}

function getPlayer_(playersSheet, roomId, playerId) {
  const pr = findPlayerRow_(playersSheet, roomId, playerId);
  if (!pr) return null;
  const r = playersSheet.getRange(pr, 1, 1, 8).getValues()[0];
  return {
    roomId: String(r[0]),
    playerId: String(r[1]),
    name: String(r[2] || "Игрок"),
    isHost: String(r[3]) === "true" || r[3] === true,
    isActive: String(r[4]) === "true" || r[4] === true,
    hand: safeJsonArray_(r[5]),
    quartets: safeJsonArray_(r[6]),
    lastSeenMs: Number(r[7] || 0),
  };
}

function setPlayerHand_(playersSheet, roomId, playerId, hand) {
  const pr = findPlayerRow_(playersSheet, roomId, playerId);
  if (!pr) return;
  playersSheet.getRange(pr, 6).setValue(JSON.stringify(hand || []));
}

function setPlayerQuartets_(playersSheet, roomId, playerId, quartets) {
  const pr = findPlayerRow_(playersSheet, roomId, playerId);
  if (!pr) return;
  playersSheet.getRange(pr, 7).setValue(JSON.stringify(quartets || []));
}

function safeJsonArray_(v) {
  try {
    const a = JSON.parse(String(v || "[]"));
    return Array.isArray(a) ? a : [];
  } catch (e) {
    return [];
  }
}

function log_(roomId, text) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(Q_SHEETS.LOG);
  sh.appendRow([roomId, Date.now(), String(text || "")]);
}

function readLog_(logSheet, roomId, limit) {
  const last = logSheet.getLastRow();
  if (last < 2) return [];
  const rows = logSheet.getRange(2, 1, last - 1, 3).getValues();
  const filtered = [];
  for (const r of rows) {
    if (String(r[0]) === String(roomId)) filtered.push(String(r[2] || ""));
  }
  return filtered.slice(Math.max(0, filtered.length - (limit || 50)));
}

function getPending_(pendingSheet, roomId) {
  const last = pendingSheet.getLastRow();
  if (last < 2) return null;
  const vals = pendingSheet.getRange(2, 1, last - 1, 7).getValues();
  for (let i = 0; i < vals.length; i++) {
    const r = vals[i];
    if (String(r[0]) !== String(roomId)) continue;
    const status = String(r[2] || "");
    if (status === "waiting") {
      return {
        row: i + 2,
        roomId: String(r[0]),
        pendingId: String(r[1]),
        status: status,
        askerId: String(r[3]),
        targetId: String(r[4]),
        cardId: String(r[5]),
        createdAtMs: Number(r[6] || 0),
      };
    }
  }
  return null;
}

function clearPending_(pendingSheet, roomId) {
  const last = pendingSheet.getLastRow();
  if (last < 2) return;
  const vals = pendingSheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]) === String(roomId)) {
      pendingSheet.deleteRow(i + 2);
    }
  }
}

function ensureInRoom_(roomId, playerId) {
  if (!roomId) throw new Error("roomId required");
  if (!playerId) throw new Error("playerId required");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rooms = ss.getSheetByName(Q_SHEETS.ROOMS);
  const players = ss.getSheetByName(Q_SHEETS.PLAYERS);
  const roomRow = findRow_(rooms, 1, roomId);
  if (!roomRow) throw new Error("Комната не найдена");
  const pr = findPlayerRow_(players, roomId, playerId);
  if (!pr) throw new Error("Ты не в комнате");
}
