// games/quartet.js
// Онлайн-игра «Квартет» для Telegram WebApp
// Клиент для Google Apps Script WebApp

function startQuartetGame(quartetsUrl) {
  const container = document.getElementById('game-container');
  if (!container) return;

  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  try { if (tg && tg.expand) tg.expand(); } catch (e) {}

  // 1. НАДЕЖНОЕ ПОЛУЧЕНИЕ ID: Читаем из Telegram или генерируем локальный
  let tgUser = {};
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    tgUser = tg.initDataUnsafe.user;
  } else if (typeof getTelegramUser === 'function') {
    tgUser = getTelegramUser() || {};
  }

  let localPlayerId = localStorage.getItem('quartet_player_id');
  if (!localPlayerId) {
    localPlayerId = 'p_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    localStorage.setItem('quartet_player_id', localPlayerId);
  }

  // Блокируем заглушки, чтобы избежать склейки разных устройств в одного юзера
  let finalId = tgUser.id;
  const strId = String(finalId || '').toLowerCase();
  if (!finalId || strId === 'anon' || strId === 'аноним') {
    finalId = localPlayerId;
  }
  
  const playerId = String(finalId);

  const defaultName = (tgUser.first_name || tgUser.username)
    ? String(tgUser.first_name || tgUser.username).trim()
    : 'Игрок';

  const LS = {
    roomId: 'quartet_room_id',
    name: 'quartet_player_name',
  };

  // URL твоего развернутого скрипта GAS
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbzWuUrRglBmztMR--MFTNNgGlT6fm_gAqWlN_3Si7jrnA0LAsX1xZemuwyxSN_u3qzy/exec';
  
  const POLL_MS_LOBBY = 1000;
  const POLL_MS_GAME = 1800;
  const POLL_MS_IDLE = 2500;

  let gameData = null;
  let state = null;
  let lastVersion = -1;
  let pollTimer = null;
  let pollingStopped = false;
  let inFlight = false;
  let failStreak = 0;
  let nextAllowedAt = 0;

  let myName = localStorage.getItem(LS.name) || defaultName;
  let roomId = localStorage.getItem(LS.roomId) || '';

  const ui = {
    status: null,
    main: null,
    lobby: null,
    game: null,
    players: null,
    hand: null,
    askPanel: null,
    log: null,
    pendingModal: null,
    roomLabel: null,
    startBtn: null,
    nameInput: null,
    roomInput: null,
    gameInfo: null,
    pendingText: null,
    giveBtn: null,
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(text, kind) {
    if (!ui.status) return;
    ui.status.textContent = text || '';
    ui.status.dataset.kind = kind || 'info';
  }

  function saveInputs() {
    myName = ((ui.nameInput && ui.nameInput.value) || '').trim() || defaultName;
    roomId = (((ui.roomInput && ui.roomInput.value) || '').trim()).toUpperCase();
    localStorage.setItem(LS.name, myName);
    if (roomId) localStorage.setItem(LS.roomId, roomId);
  }

  function setStartButtonState(st) {
    if (!ui.startBtn) return;
    const canStart = !!(st && st.status === 'lobby' && st.me && st.me.isHost);
    ui.startBtn.disabled = !canStart;
    ui.startBtn.textContent = canStart
      ? 'Начать игру'
      : 'Начать игру может только создатель лобби';
  }

  async function api(action, payload) {
    const body = Object.assign({
      action: action,
      roomId: roomId,
      playerId: playerId, 
      name: myName,
    }, payload || {});

    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      cache: 'no-store',
    });

    const raw = await res.text().catch(function () { return ''; });
    let data;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (e) {
      const snippet = String(raw || '').slice(0, 180).replace(/\s+/g, ' ').trim();
      throw new Error('Сервер вернул не-JSON. HTTP ' + res.status + '. Ответ: ' + (snippet || '—'));
    }

    if (!res.ok || !data || data.ok === false) {
      throw new Error(data && data.error ? String(data.error) : ('HTTP ' + res.status));
    }

    return data;
  }

  function stopPolling() {
    pollingStopped = true;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }

  function scheduleNextPoll(ms) {
    if (pollingStopped) return;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(function () {
      refreshState(false);
    }, ms);
  }

  function startPolling() {
    pollingStopped = false;
    if (pollTimer) clearTimeout(pollTimer);
    refreshState(true);
  }

  function currentPollDelay() {
    if (!state) return POLL_MS_IDLE;
    return state.status === 'lobby' ? POLL_MS_LOBBY : POLL_MS_GAME;
  }

  async function refreshState(force) {
    if (!roomId) return;
    if (inFlight) {
      scheduleNextPoll(currentPollDelay());
      return;
    }
    if (Date.now() < nextAllowedAt) {
      scheduleNextPoll(Math.max(400, nextAllowedAt - Date.now()));
      return;
    }

    inFlight = true;
    try {
      const res = await api('getState');
      state = res.state || null;
      failStreak = 0;
      nextAllowedAt = 0;

      if (!state) {
        scheduleNextPoll(POLL_MS_IDLE);
        return;
      }

      updateScreenMode(state);

      if (!force && typeof state.version === 'number' && state.version === lastVersion) {
        updatePendingModal(state);
        scheduleNextPoll(currentPollDelay());
        return;
      }

      lastVersion = typeof state.version === 'number' ? state.version : lastVersion;
      renderPlayers(state);
      renderLog(state);
      renderGame(state);
      updatePendingModal(state);
      scheduleNextPoll(currentPollDelay());
    } catch (e) {
      failStreak += 1;
      const delay = Math.min(12000, failStreak * 1500);
      nextAllowedAt = Date.now() + delay;
      setStatus(String((e && e.message) || e || 'Ошибка связи'), 'err');
      scheduleNextPoll(delay);
    } finally {
      inFlight = false;
    }
  }

  function updateScreenMode(st) {
    const showMain = !!roomId;
    ui.main.classList.toggle('hidden', !showMain);
    ui.roomLabel.textContent = roomId || '—';

    const inLobby = st.status === 'lobby';
    const inGame = st.status === 'playing' || st.status === 'finished';
    ui.lobby.classList.toggle('hidden', !inLobby);
    ui.game.classList.toggle('hidden', !inGame);

    setStartButtonState(st);
  }

  function renderPlayers(st) {
    const ps = st.players || [];
    ui.players.innerHTML = ps.map(function (p) {
      const isMe = String(p.playerId) === String(playerId);
      const isTurn = String(st.turnPlayerId || '') === String(p.playerId);
      const badges = [
        isMe ? '<span class="q-badge">ты</span>' : '',
        p.isHost ? '<span class="q-badge q-badge--host">хост</span>' : '',
        isTurn ? '<span class="q-badge q-badge--turn">ход</span>' : '',
        p.isActive === false ? '<span class="q-badge">вышел</span>' : '',
      ].filter(Boolean).join(' ');

      return '' +
        '<div class="q-player">' +
          '<div class="q-player-name">' + escapeHtml(p.name || 'Игрок') + ' ' + badges + '</div>' +
          '<div class="q-player-meta">🂠 ' + Number(p.cardsCount || 0) + ' • 🏆 ' + Number(p.quartetsCount || 0) + '</div>' +
        '</div>';
    }).join('');
  }

  function renderLog(st) {
    const items = (st.log || []).slice(-40);
    ui.log.innerHTML = items.map(function (x) {
      return '<div class="q-log-item">' + escapeHtml(x) + '</div>';
    }).join('');
  }

  function renderGame(st) {
    if (st.status === 'lobby') return;

    const myTurn = String(st.turnPlayerId || '') === String(playerId);
    let header = '';

    if (st.status === 'finished') {
      header = '<div><b>Игра завершена</b></div>';
    } else {
      header = '<div><b>' + (myTurn ? 'Твой ход' : 'Ход другого игрока') + '</b></div>';
    }

    header += '<div class="quartet-muted">Текущий ход: ' + escapeHtml(st.turnPlayerName || '—') + '</div>';
    header += '<div class="quartet-muted">Твои квартеты: <b>' + Number((st.me && st.me.quartetsCount) || 0) + '</b></div>';

    ui.gameInfo.innerHTML = header;
    renderHand(st);
    renderAskPanel(st);
  }

  function findCardMeta(cardId) {
    if (!gameData || !gameData.quartets) return null;
    for (let i = 0; i < gameData.quartets.length; i++) {
      const q = gameData.quartets[i];
      const card = (q.cards || []).find(function (x) { return x.id === cardId; });
      if (card) return { quartet: q, card: card };
    }
    return null;
  }

  function renderHand(st) {
    const hand = (st.me && st.me.hand) || [];
    if (!hand.length) {
      ui.hand.innerHTML = '<div class="quartet-muted">У тебя нет карт.</div>';
      return;
    }

    const byQuartet = {};
    hand.forEach(function (cid) {
      const meta = findCardMeta(cid);
      if (!meta) return;
      const key = meta.quartet.id;
      if (!byQuartet[key]) byQuartet[key] = { quartet: meta.quartet, cards: [] };
      byQuartet[key].cards.push(meta.card);
    });

    const groups = Object.keys(byQuartet).map(function (k) { return byQuartet[k]; });
    groups.sort(function (a, b) {
      return String(a.quartet.name).localeCompare(String(b.quartet.name), 'ru');
    });

    ui.hand.innerHTML = groups.map(function (group) {
      const cards = group.cards.slice().sort(function (a, b) {
        return String(a.title).localeCompare(String(b.title), 'ru');
      }).map(function (c) {
        return '<span class="q-chip">' + escapeHtml(c.title) + '</span>';
      }).join('');

      return '' +
        '<div class="q-qblock">' +
          '<div class="q-qname">' + escapeHtml(group.quartet.name) + '</div>' +
          '<div class="q-chips">' + cards + '</div>' +
        '</div>';
    }).join('');
  }

  function renderAskPanel(st) {
    if (st.status !== 'playing') {
      ui.askPanel.innerHTML = '<div class="quartet-muted">Игра завершена.</div>';
      return;
    }

    const myTurn = String(st.turnPlayerId || '') === String(playerId);
    const pending = st.pending;
    const hand = (st.me && st.me.hand) || [];

    if (!myTurn) {
      ui.askPanel.innerHTML = '<div class="quartet-muted">Сейчас не твой ход.</div>';
      return;
    }
    if (pending && pending.status === 'waiting') {
      ui.askPanel.innerHTML = '<div class="quartet-muted">Ожидаем ответа на запрос…</div>';
      return;
    }
    if (!hand.length) {
      ui.askPanel.innerHTML = '<div class="quartet-muted">У тебя нет карт — ходить нельзя.</div>';
      return;
    }

    const targets = (st.players || []).filter(function (p) {
      return String(p.playerId) !== String(playerId) && p.isActive !== false;
    });
    if (!targets.length) {
      ui.askPanel.innerHTML = '<div class="quartet-muted">Нет доступных игроков.</div>';
      return;
    }

    const myCards = new Set(hand);
    const eligible = [];
    (gameData.quartets || []).forEach(function (q) {
      const hasAny = (q.cards || []).some(function (c) { return myCards.has(c.id); });
      if (!hasAny) return;
      (q.cards || []).forEach(function (c) {
        if (!myCards.has(c.id)) eligible.push({ quartet: q, card: c });
      });
    });

    if (!eligible.length) {
      ui.askPanel.innerHTML = '<div class="quartet-muted">Сейчас у тебя нет подходящих карт для запроса.</div>';
      return;
    }

    ui.askPanel.innerHTML = '' +
      '<div class="quartet-field">' +
        '<label>Кого спросить</label>' +
        '<select id="q_target" class="q-input">' +
          targets.map(function (p) {
            return '<option value="' + escapeHtml(String(p.playerId)) + '">' +
              escapeHtml(p.name) + ' (🂠 ' + Number(p.cardsCount || 0) + ')' +
            '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div class="quartet-field">' +
        '<label>Какую карту спросить</label>' +
        '<select id="q_card" class="q-input">' +
          eligible.map(function (x) {
            return '<option value="' + escapeHtml(String(x.card.id)) + '">' +
              escapeHtml(x.quartet.name) + ' — ' + escapeHtml(x.card.title) +
            '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<button id="q_ask_btn" class="start-button">Спросить карту</button>' +
      '<div class="quartet-hint">Если карта есть у другого игрока, он должен отдать её. Через 10 секунд сработает авто-отдача.</div>';

    const askBtn = document.getElementById('q_ask_btn');
    if (askBtn) {
      askBtn.addEventListener('click', async function () {
        try {
          const targetId = document.getElementById('q_target').value;
          const cardId = document.getElementById('q_card').value;
          if (!targetId || !cardId) return;
          askBtn.disabled = true;
          setStatus('Отправляю запрос…', 'info');
          await api('askCard', { targetId: targetId, cardId: cardId });
          setStatus('Запрос отправлен.', 'ok');
          refreshState(true);
        } catch (e) {
          setStatus(String((e && e.message) || e || 'Ошибка'), 'err');
          askBtn.disabled = false;
        }
      });
    }
  }

  function updatePendingModal(st) {
    const pending = st.pending;
    if (!pending || pending.status !== 'waiting' || String(pending.targetId) !== String(playerId)) {
      ui.pendingModal.classList.add('hidden');
      return;
    }

    const secsLeft = Math.max(0, Math.ceil((Number(pending.expiresAtMs || 0) - Date.now()) / 1000));
    ui.pendingText.innerHTML = '' +
      'Игрок <b>' + escapeHtml(pending.askerName || '') + '</b> просит карту: ' +
      '<b>' + escapeHtml(pending.cardTitle || pending.cardId || '') + '</b><br>' +
      '<span class="quartet-muted">Осталось: ' + secsLeft + ' сек.</span>';

    ui.giveBtn.disabled = !pending.targetHasCard;
    ui.giveBtn.textContent = pending.targetHasCard ? 'Отдать карту' : 'Карты нет';
    ui.pendingModal.classList.remove('hidden');
  }

  async function onCreateRoom() {
    try {
      saveInputs();
      setStatus('Создаю комнату…', 'info');
      ui.startBtn.disabled = true;
      const res = await api('createRoom');
      roomId = String(res.roomId || '');
      localStorage.setItem(LS.roomId, roomId);
      ui.roomInput.value = roomId;
      ui.roomLabel.textContent = roomId;
      ui.main.classList.remove('hidden');
      setStatus('Комната создана: ' + roomId, 'ok');
      startPolling();
    } catch (e) {
      setStatus(String((e && e.message) || e || 'Ошибка'), 'err');
    }
  }

  async function onJoinRoom() {
    try {
      saveInputs();
      if (!roomId) throw new Error('Укажи код комнаты');
      setStatus('Вхожу в комнату…', 'info');
      ui.startBtn.disabled = true;
      await api('joinRoom', { roomId: roomId });
      localStorage.setItem(LS.roomId, roomId);
      ui.roomLabel.textContent = roomId;
      ui.main.classList.remove('hidden');
      setStatus('Ты вошёл в комнату: ' + roomId, 'ok');
      startPolling();
    } catch (e) {
      setStatus(String((e && e.message) || e || 'Ошибка'), 'err');
    }
  }

  async function onStartGame() {
    try {
      setStatus('Запускаю игру…', 'info');
      ui.startBtn.disabled = true;
      await api('startGame');
      setStatus('Игра началась!', 'ok');
      refreshState(true);
    } catch (e) {
      setStatus(String((e && e.message) || e || 'Ошибка'), 'err');
      setStartButtonState(state);
    }
  }

  async function onGiveCard() {
    try {
      if (!state || !state.pending || !state.pending.pendingId) return;
      ui.giveBtn.disabled = true;
      await api('giveCard', { pendingId: state.pending.pendingId });
      ui.pendingModal.classList.add('hidden');
      setStatus('Карта передана.', 'ok');
      refreshState(true);
    } catch (e) {
      ui.giveBtn.disabled = false;
      setStatus(String((e && e.message) || e || 'Ошибка'), 'err');
    }
  }

  async function onLeave() {
    stopPolling();
    try {
      await api('leave');
    } catch (e) {}
    roomId = '';
    state = null;
    lastVersion = -1;
    localStorage.removeItem(LS.roomId);
    ui.roomInput.value = '';
    ui.roomLabel.textContent = '—';
    ui.main.classList.add('hidden');
    ui.lobby.classList.remove('hidden');
    ui.game.classList.add('hidden');
    ui.players.innerHTML = '';
    ui.hand.innerHTML = '';
    ui.askPanel.innerHTML = '';
    ui.log.innerHTML = '';
    ui.pendingModal.classList.add('hidden');
    setStartButtonState(null);
    setStatus('Ты вышел из комнаты.', 'info');

    if (typeof goToMainMenu === 'function') {
      goToMainMenu();
    }
  }

  function renderShell() {
    container.innerHTML = '' +
      '<div class="quartet-wrap fade-in">' +
        '<div class="quartet-header">' +
          '<div class="quartet-title">🃏 Квартет</div>' +
          '<div class="quartet-subtitle">Создай лобби, войди и играй</div>' +
        '</div>' +

        '<div class="quartet-card">' +
          '<div class="quartet-grid2">' +
            '<div class="quartet-field">' +
              '<label>Твоё имя</label>' +
              '<input id="q_name" class="q-input" placeholder="Имя" />' +
            '</div>' +
            '<div class="quartet-field">' +
              '<label>Комната</label>' +
              '<input id="q_room" class="q-input" placeholder="Код комнаты" maxlength="5" />' +
            '</div>' +
          '</div>' +
          '<div class="quartet-grid2">' +
            '<button id="q_create" class="start-button">Создать лобби</button>' +
            '<button id="q_join" class="menu-button">Войти</button>' +
          '</div>' +
          '<div id="q_status" class="quartet-status" data-kind="info"></div>' +
        '</div>' +

        '<div id="q_main" class="quartet-main hidden">' +
          '<div class="quartet-topbar">' +
            '<div class="quartet-room">Комната: <b id="q_room_label">—</b></div>' +
            '<button id="q_leave" class="back-button">⬅️ В меню</button>' +
          '</div>' +

          '<div id="q_lobby" class="quartet-card">' +
            '<div class="quartet-section-title">Лобби</div>' +
            '<div class="quartet-row"><div class="quartet-muted">Игроки (3–8):</div></div>' +
            '<div id="q_players" class="quartet-players"></div>' +
            '<button id="q_start" class="start-button" disabled>Начать игру может только создатель лобби</button>' +
          '</div>' +

          '<div id="q_game" class="quartet-card hidden">' +
            '<div class="quartet-section-title">Игра</div>' +
            '<div id="q_game_info" class="quartet-info"></div>' +
            '<div class="quartet-split">' +
              '<div>' +
                '<div class="quartet-subsection">Моя рука</div>' +
                '<div id="q_hand" class="quartet-hand"></div>' +
              '</div>' +
              '<div>' +
                '<div class="quartet-subsection">Ход</div>' +
                '<div id="q_ask" class="quartet-ask"></div>' +
              '</div>' +
            '</div>' +
            '<div class="quartet-subsection">Лог</div>' +
            '<div id="q_log" class="quartet-log"></div>' +
          '</div>' +
        '</div>' +

        '<div id="q_pending" class="quartet-modal hidden" role="dialog" aria-modal="true">' +
          '<div class="quartet-modal-card">' +
            '<div class="quartet-modal-title">Запрос карты</div>' +
            '<div id="q_pending_text" class="quartet-modal-text"></div>' +
            '<button id="q_give" class="start-button">Отдать карту</button>' +
            '<button id="q_close_pending" class="menu-button">Понятно</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    ui.status = document.getElementById('q_status');
    ui.main = document.getElementById('q_main');
    ui.lobby = document.getElementById('q_lobby');
    ui.game = document.getElementById('q_game');
    ui.players = document.getElementById('q_players');
    ui.hand = document.getElementById('q_hand');
    ui.askPanel = document.getElementById('q_ask');
    ui.log = document.getElementById('q_log');
    ui.pendingModal = document.getElementById('q_pending');
    ui.roomLabel = document.getElementById('q_room_label');
    ui.startBtn = document.getElementById('q_start');
    ui.nameInput = document.getElementById('q_name');
    ui.roomInput = document.getElementById('q_room');
    ui.gameInfo = document.getElementById('q_game_info');
    ui.pendingText = document.getElementById('q_pending_text');
    ui.giveBtn = document.getElementById('q_give');

    ui.nameInput.value = myName;
    ui.roomInput.value = roomId;
    ui.roomLabel.textContent = roomId || '—';

    document.getElementById('q_create').addEventListener('click', onCreateRoom);
    document.getElementById('q_join').addEventListener('click', onJoinRoom);
    document.getElementById('q_leave').addEventListener('click', onLeave);
    document.getElementById('q_start').addEventListener('click', onStartGame);
    document.getElementById('q_give').addEventListener('click', onGiveCard);
    document.getElementById('q_close_pending').addEventListener('click', function () {
      ui.pendingModal.classList.add('hidden');
    });
  }

  async function loadGameData() {
    if (typeof loadJSON === 'function') {
      return loadJSON(quartetsUrl);
    }
    const res = await fetch(quartetsUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('Не удалось загрузить quartet_bible.json');
    return res.json();
  }

  (async function init() {
    renderShell();
    try {
      gameData = await loadGameData();
      setStatus('Готово. Введи имя и создай лобби или войди в существующее.', 'info');
      if (roomId) {
        ui.main.classList.remove('hidden');
        startPolling();
      }
    } catch (e) {
      setStatus('Не удалось загрузить данные игры.', 'err');
    }
  })();
}
