// games/quartet.js
// Онлайн-игра «Квартет» для Telegram WebApp
// Клиент для Google Apps Script WebApp

function startQuartetGame() {
  const container = document.getElementById('game-container');
  if (!container) return;

  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  try { if (tg && tg.expand) tg.expand(); } catch (e) {}

  // НАДЕЖНОЕ ПОЛУЧЕНИЕ ID
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

  // --- ВСТРОЕННАЯ КОЛОДА ---
  const gameData = {
    quartets: [
      { id: 'apostles', name: 'Апостолы (из 12)', cards: [{ id: 'apostles_peter', title: 'Пётр' }, { id: 'apostles_john', title: 'Иоанн' }, { id: 'apostles_james', title: 'Иаков' }, { id: 'apostles_andrew', title: 'Андрей' }] },
      { id: 'evangelists', name: 'Евангелисты', cards: [{ id: 'evangelists_matthew', title: 'Матфей' }, { id: 'evangelists_mark', title: 'Марк' }, { id: 'evangelists_luke', title: 'Лука' }, { id: 'evangelists_john', title: 'Иоанн' }] },
      { id: 'patriarchs', name: 'Патриархи', cards: [{ id: 'patriarchs_abraham', title: 'Авраам' }, { id: 'patriarchs_isaac', title: 'Исаак' }, { id: 'patriarchs_jacob', title: 'Иаков' }, { id: 'patriarchs_joseph', title: 'Иосиф' }] },
      { id: 'major_prophets', name: 'Пророки', cards: [{ id: 'prophets_isaiah', title: 'Исаия' }, { id: 'prophets_jeremiah', title: 'Иеремия' }, { id: 'prophets_ezekiel', title: 'Иезекииль' }, { id: 'prophets_daniel', title: 'Даниил' }] },
      { id: 'judges', name: 'Судьи Израиля', cards: [{ id: 'judges_deborah', title: 'Девора' }, { id: 'judges_gideon', title: 'Гедеон' }, { id: 'judges_samson', title: 'Самсон' }, { id: 'judges_jephthah', title: 'Иеффай' }] },
      { id: 'kings', name: 'Цари Израиля', cards: [{ id: 'kings_saul', title: 'Саул' }, { id: 'kings_david', title: 'Давид' }, { id: 'kings_solomon', title: 'Соломон' }, { id: 'kings_hezekiah', title: 'Езекия' }] },
      { id: 'matriarchs', name: 'Жёны веры', cards: [{ id: 'matriarchs_sarah', title: 'Сарра' }, { id: 'matriarchs_rebekah', title: 'Ревекка' }, { id: 'matriarchs_rachel', title: 'Рахиль' }, { id: 'matriarchs_leah', title: 'Лия' }] },
      { id: 'women_nt', name: 'Женщины Библии', cards: [{ id: 'women_ruth', title: 'Руфь' }, { id: 'women_esther', title: 'Есфирь' }, { id: 'women_mary', title: 'Мария' }, { id: 'women_anna', title: 'Анна' }] },
      { id: 'paul_team', name: 'Сотрудники Павла', cards: [{ id: 'paulteam_barnabas', title: 'Варнава' }, { id: 'paulteam_silas', title: 'Сила' }, { id: 'paulteam_timothy', title: 'Тимофей' }, { id: 'paulteam_titus', title: 'Тит' }] },
      { id: 'nt_places', name: 'Города Нового Завета', cards: [{ id: 'places_bethlehem', title: 'Вифлеем' }, { id: 'places_nazareth', title: 'Назарет' }, { id: 'places_capernaum', title: 'Капернаум' }, { id: 'places_jerusalem', title: 'Иерусалим' }] },
      { id: 'miracles_jesus', name: 'Чудеса Иисуса', cards: [{ id: 'miracles_water_wine', title: 'Вода в вино' }, { id: 'miracles_feeding_5000', title: 'Накормил 5000' }, { id: 'miracles_calm_storm', title: 'Утихомирил бурю' }, { id: 'miracles_raise_lazarus', title: 'Воскресил Лазаря' }] },
      { id: 'armor_of_god', name: 'Всеоружие Божие (Еф 6)', cards: [{ id: 'armor_belt_truth', title: 'Пояс истины' }, { id: 'armor_breastplate', title: 'Броня праведности' }, { id: 'armor_shield_faith', title: 'Щит веры' }, { id: 'armor_helmet_salvation', title: 'Шлем спасения' }] }
    ]
  };

  // Твоя актуальная ссылка на Web App
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbxtxWp95-A1312RxVwrkEJ_-ujoZWtUp1Vfhn5oYotGS5BfMoxDSHQ2o-NjTlSyUhMWuQ/exec';
  
  const POLL_MS_LOBBY = 1000;
  const POLL_MS_GAME = 1800;
  const POLL_MS_IDLE = 2500;

  let state = null;
  let lastVersion = -1;
  let pollTimer = null;
  let pollingStopped = false;
  let inFlight = false;
  let failStreak = 0;
  let nextAllowedAt = 0;
  
  let isViewingCardsWhileWaiting = false;

  let myName = localStorage.getItem(LS.name) || defaultName;
  let roomId = localStorage.getItem(LS.roomId) || '';

  const ui = {};

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
      : 'Начать игру может только хост';
  }

  async function api(action, payload) {
    const body = Object.assign({
      action: action, roomId: roomId, playerId: playerId, name: myName,
    }, payload || {});

    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      cache: 'no-store',
    });

    const raw = await res.text().catch(() => '');
    let data;
    try { data = raw ? JSON.parse(raw) : null; } 
    catch (e) { throw new Error('Ошибка сервера. Ответ: ' + String(raw || '').slice(0, 100)); }

    if (!res.ok || !data || data.ok === false) {
      throw new Error(data && data.error ? String(data.error) : ('HTTP ' + res.status));
    }
    return data;
  }

  function scheduleNextPoll(ms) {
    if (pollingStopped) return;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => refreshState(false), ms);
  }

  function startPolling() {
    pollingStopped = false;
    if (pollTimer) clearTimeout(pollTimer);
    refreshState(true);
  }

  async function refreshState(force) {
    if (!roomId) return;
    if (inFlight) { scheduleNextPoll(state && state.status === 'lobby' ? POLL_MS_LOBBY : POLL_MS_GAME); return; }
    if (Date.now() < nextAllowedAt) { scheduleNextPoll(Math.max(400, nextAllowedAt - Date.now())); return; }

    inFlight = true;
    try {
      const res = await api('getState');
      state = res.state || null;
      failStreak = 0;
      nextAllowedAt = 0;

      if (!state) { scheduleNextPoll(POLL_MS_IDLE); return; }

      updateScreenMode(state);

      if (!force && typeof state.version === 'number' && state.version === lastVersion) {
        updatePendingModal(state);
        scheduleNextPoll(state.status === 'lobby' ? POLL_MS_LOBBY : POLL_MS_GAME);
        return;
      }

      lastVersion = typeof state.version === 'number' ? state.version : lastVersion;
      renderPlayers(state);
      renderLog(state);
      renderGame(state);
      updatePendingModal(state);
      scheduleNextPoll(state.status === 'lobby' ? POLL_MS_LOBBY : POLL_MS_GAME);
    } catch (e) {
      failStreak += 1;
      nextAllowedAt = Date.now() + Math.min(12000, failStreak * 1500);
      scheduleNextPoll(Math.min(12000, failStreak * 1500));
    } finally {
      inFlight = false;
    }
  }

  function updateScreenMode(st) {
    const showMain = !!roomId;
    
    // Скрываем форму входа
    ui.authPanel.classList.toggle('hidden', showMain);
    ui.main.classList.toggle('hidden', !showMain);
    ui.roomLabel.textContent = roomId || '—';

    const inLobby = st.status === 'lobby';
    const inGame = st.status === 'playing' || st.status === 'finished';
    ui.lobby.classList.toggle('hidden', !inLobby);
    ui.game.classList.toggle('hidden', !inGame);

    setStartButtonState(st);

    const myTurn = String(st.turnPlayerId || '') === String(playerId);
    if (st.status === 'playing' && !myTurn) {
      ui.waitTurnName.textContent = st.turnPlayerName || 'кого-то';
      if (!isViewingCardsWhileWaiting) {
        ui.waitOverlay.classList.remove('hidden');
        ui.waitBackBtn.classList.add('hidden');
      } else {
        ui.waitOverlay.classList.add('hidden');
        ui.waitBackBtn.classList.remove('hidden');
      }
    } else {
      isViewingCardsWhileWaiting = false;
      ui.waitOverlay.classList.add('hidden');
      ui.waitBackBtn.classList.add('hidden');
    }
  }

  function renderPlayers(st) {
    const ps = st.players || [];
    ui.players.innerHTML = ps.map(p => {
      const isMe = String(p.playerId) === String(playerId);
      const isTurn = String(st.turnPlayerId || '') === String(p.playerId);
      const badges = [
        isMe ? '<span class="q-badge">ты</span>' : '',
        p.isHost ? '<span class="q-badge q-badge--host">хост</span>' : '',
        isTurn ? '<span class="q-badge q-badge--turn">ход</span>' : '',
        p.isActive === false ? '<span class="q-badge">вышел</span>' : '',
      ].filter(Boolean).join(' ');

      return `<div class="q-player">
                <div class="q-player-name">${escapeHtml(p.name || 'Игрок')} ${badges}</div>
                <div class="q-player-meta">🂠 ${Number(p.cardsCount || 0)} • 🏆 ${Number(p.quartetsCount || 0)}</div>
              </div>`;
    }).join('');
  }

  function renderLog(st) {
    const items = (st.log || []).slice(-50);
    const html = items.map(x => `<div class="q-log-item">${escapeHtml(x)}</div>`).join('');
    
    if (ui.log.innerHTML !== html) {
      ui.log.innerHTML = html;
      ui.log.scrollTop = ui.log.scrollHeight;
    }
  }

  function renderGame(st) {
    if (st.status === 'lobby') return;

    const myTurn = String(st.turnPlayerId || '') === String(playerId);
    let header = st.status === 'finished' ? '<div><b>Игра завершена</b></div>' : `<div><b>${myTurn ? 'Твой ход' : 'Ход другого игрока'}</b></div>`;
    header += `<div class="quartet-muted">Текущий ход: ${escapeHtml(st.turnPlayerName || '—')}</div>`;
    header += `<div class="quartet-muted">Твои квартеты: <b>${Number((st.me && st.me.quartetsCount) || 0)}</b></div>`;

    ui.gameInfo.innerHTML = header;
    renderHand(st);
    renderAskPanel(st);
  }

  function findCardMeta(cardId) {
    for (const q of gameData.quartets) {
      const card = q.cards.find(x => x.id === cardId);
      if (card) return { quartet: q, card };
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
    hand.forEach(cid => {
      const meta = findCardMeta(cid);
      if (!meta) return;
      if (!byQuartet[meta.quartet.id]) byQuartet[meta.quartet.id] = { quartet: meta.quartet, cards: [] };
      byQuartet[meta.quartet.id].cards.push(meta.card);
    });

    const groups = Object.values(byQuartet).sort((a, b) => a.quartet.name.localeCompare(b.quartet.name, 'ru'));

    ui.hand.innerHTML = groups.map(group => {
      const cardsHtml = group.cards.sort((a, b) => a.title.localeCompare(b.title, 'ru')).map(c => `
        <div class="q-playing-card">
          <div class="q-quartet-name">${escapeHtml(group.quartet.name)}</div>
          <div class="q-card-title">${escapeHtml(c.title)}</div>
        </div>
      `).join('');

      return `<div class="q-cards-grid">${cardsHtml}</div>`;
    }).join('');
  }

  function renderAskPanel(st) {
    if (st.status !== 'playing') { ui.askPanel.innerHTML = '<div class="quartet-muted">Игра завершена.</div>'; return; }

    const myTurn = String(st.turnPlayerId || '') === String(playerId);
    if (!myTurn) { ui.askPanel.innerHTML = '<div class="quartet-muted">Сейчас не твой ход.</div>'; return; }
    
    if (st.pending && st.pending.status === 'waiting') { ui.askPanel.innerHTML = '<div class="quartet-muted">Ожидаем ответа на запрос…</div>'; return; }
    
    const hand = (st.me && st.me.hand) || [];
    if (!hand.length) { ui.askPanel.innerHTML = '<div class="quartet-muted">У тебя нет карт — ходить нельзя.</div>'; return; }

    const targets = (st.players || []).filter(p => String(p.playerId) !== String(playerId) && p.isActive !== false);
    if (!targets.length) { ui.askPanel.innerHTML = '<div class="quartet-muted">Нет доступных игроков.</div>'; return; }

    const myCards = new Set(hand);
    const eligible = [];
    gameData.quartets.forEach(q => {
      if (!q.cards.some(c => myCards.has(c.id))) return;
      q.cards.forEach(c => { if (!myCards.has(c.id)) eligible.push({ quartet: q, card: c }); });
    });

    if (!eligible.length) { ui.askPanel.innerHTML = '<div class="quartet-muted">У тебя нет подходящих карт для запроса.</div>'; return; }

    ui.askPanel.innerHTML = `
      <div class="q-ask-form">
        <div class="quartet-field">
          <label>Кого спросить</label>
          <select id="q_target" class="q-input">
            ${targets.map(p => `<option value="${escapeHtml(String(p.playerId))}">${escapeHtml(p.name)} (🂠 ${Number(p.cardsCount || 0)})</option>`).join('')}
          </select>
        </div>
        <div class="quartet-field">
          <label>Какую карту</label>
          <select id="q_card" class="q-input">
            ${eligible.map(x => `<option value="${escapeHtml(String(x.card.id))}">${escapeHtml(x.quartet.name)} — ${escapeHtml(x.card.title)}</option>`).join('')}
          </select>
        </div>
        <button id="q_ask_btn" class="start-button" style="margin-top: 10px;">Спросить карту</button>
      </div>
      <div class="quartet-hint">Если карта есть, игрок отдаст её. Авто-отдача через 10 сек.</div>
    `;

    document.getElementById('q_ask_btn').addEventListener('click', async function () {
      try {
        const tId = document.getElementById('q_target').value;
        const cId = document.getElementById('q_card').value;
        if (!tId || !cId) return;
        this.disabled = true;
        setStatus('Отправляю запрос…', 'info');
        await api('askCard', { targetId: tId, cardId: cId });
        setStatus('Запрос отправлен.', 'ok');
        refreshState(true);
      } catch (e) {
        setStatus(String((e && e.message) || e), 'err');
        this.disabled = false;
      }
    });
  }

  function updatePendingModal(st) {
    const pending = st.pending;
    if (!pending || pending.status !== 'waiting' || String(pending.targetId) !== String(playerId)) {
      ui.pendingModal.classList.add('hidden');
      return;
    }

    const secsLeft = Math.max(0, Math.ceil((Number(pending.expiresAtMs || 0) - Date.now()) / 1000));
    ui.pendingText.innerHTML = `Игрок <b>${escapeHtml(pending.askerName || '')}</b> просит карту:<br>
      <b>${escapeHtml(pending.cardTitle || pending.cardId || '')}</b><br>
      <span class="quartet-muted">Осталось: ${secsLeft} сек.</span>`;

    ui.giveBtn.disabled = !pending.targetHasCard;
    ui.giveBtn.textContent = pending.targetHasCard ? 'Отдать карту' : 'Карты нет';
    ui.pendingModal.classList.remove('hidden');
  }

  async function onCreateRoom() {
    try {
      saveInputs(); setStatus('Создаю...', 'info'); ui.startBtn.disabled = true;
      const res = await api('createRoom');
      roomId = String(res.roomId || ''); localStorage.setItem(LS.roomId, roomId);
      startPolling();
    } catch (e) { setStatus(String(e.message || e), 'err'); }
  }

  async function onJoinRoom() {
    try {
      saveInputs(); if (!roomId) throw new Error('Код комнаты?');
      setStatus('Вхожу...', 'info'); ui.startBtn.disabled = true;
      await api('joinRoom', { roomId: roomId });
      localStorage.setItem(LS.roomId, roomId);
      startPolling();
    } catch (e) { setStatus(String(e.message || e), 'err'); }
  }

  async function onLeave() {
    pollingStopped = true; clearTimeout(pollTimer);
    try { await api('leave'); } catch (e) {}
    roomId = ''; state = null; lastVersion = -1; localStorage.removeItem(LS.roomId);
    ui.authPanel.classList.remove('hidden'); ui.main.classList.add('hidden');
    ui.roomInput.value = ''; ui.status.textContent = '';
    if (typeof goToMainMenu === 'function') goToMainMenu();
  }

  function renderShell() {
    container.innerHTML = `
      <style>
        .hidden { display: none !important; }
        .q-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; margin-bottom: 16px; }
        .q-playing-card { background: #fff; border: 2px solid #e5e7eb; border-radius: 12px; padding: 14px 8px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05); display: flex; flex-direction: column; justify-content: center; min-height: 100px; }
        .q-quartet-name { font-size: 0.75em; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; font-weight: 700; line-height: 1.2; }
        .q-card-title { font-size: 1.15em; color: #111827; font-weight: 800; line-height: 1.2; }
        
        .q-ask-form { background: #f3f4f6; border-radius: 16px; padding: 16px; margin-top: 12px; border: 1px solid #e5e7eb;}
        .q-log-container { max-height: 200px; overflow-y: auto; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
        .q-log-item { font-size: 0.95em; color: #4b5563; border-bottom: 1px solid #f3f4f6; padding-bottom: 6px; }
        .q-log-item:last-child { border-bottom: none; padding-bottom: 0; }
        
        .q-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(17, 24, 39, 0.85); backdrop-filter: blur(5px); z-index: 2000; display: flex; align-items: center; justify-content: center; }
        .q-wait-box { background: white; padding: 30px 20px; border-radius: 20px; width: 85%; max-width: 320px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
        .q-wait-box h3 { margin: 0 0 10px 0; color: #1f2937; font-size: 1.4em; }
        .q-wait-box p { margin: 0 0 24px 0; color: #4b5563; font-size: 1.1em; }
        .q-wait-name { color: #2563eb; font-weight: bold; }
        .q-sticky-bottom { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); z-index: 1999; background: #2563eb; color: white; border: none; padding: 16px 32px; border-radius: 30px; font-size: 1.1em; font-weight: bold; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.4); cursor: pointer; }
      </style>

      <div class="quartet-wrap fade-in">
        <div class="quartet-header">
          <div class="quartet-title">🃏 Квартет</div>
          <div class="quartet-subtitle">Собери 4 карты одной группы</div>
        </div>

        <div id="q_auth_panel" class="quartet-card">
          <div class="quartet-grid2">
            <div class="quartet-field"><label>Твоё имя</label><input id="q_name" class="q-input" placeholder="Имя" /></div>
            <div class="quartet-field"><label>Комната</label><input id="q_room" class="q-input" placeholder="Код" maxlength="5" /></div>
          </div>
          <div class="quartet-grid2">
            <button id="q_create" class="start-button">Создать лобби</button>
            <button id="q_join" class="menu-button">Войти</button>
          </div>
          <div id="q_status" class="quartet-status" data-kind="info"></div>
        </div>

        <div id="q_main" class="quartet-main hidden">
          <div class="quartet-topbar">
            <div class="quartet-room">Комната: <b id="q_room_label">—</b></div>
            <button id="q_leave" class="back-button">⬅️ Выйти</button>
          </div>

          <div id="q_lobby" class="quartet-card hidden">
            <div class="quartet-section-title">Лобби</div>
            <div class="quartet-row"><div class="quartet-muted">Игроки (3–8):</div></div>
            <div id="q_players" class="quartet-players"></div>
            <button id="q_start" class="start-button" disabled>Начать игру</button>
          </div>

          <div id="q_game" class="quartet-card hidden">
            <div id="q_game_info" class="quartet-info"></div>
            
            <div class="quartet-subsection" style="margin-top:20px;">Моя рука</div>
            <div id="q_hand"></div>
            
            <div class="quartet-subsection" style="margin-top:10px;">Действие</div>
            <div id="q_ask"></div>
            
            <div class="quartet-subsection" style="margin-top:20px;">Лог игры</div>
            <div id="q_log" class="q-log-container"></div>
          </div>
        </div>

        <div id="q_pending" class="quartet-modal hidden">
          <div class="quartet-modal-card">
            <div class="quartet-modal-title">Запрос карты</div>
            <div id="q_pending_text" class="quartet-modal-text"></div>
            <button id="q_give" class="start-button">Отдать карту</button>
          </div>
        </div>

        <div id="q_wait_overlay" class="q-overlay hidden">
          <div class="q-wait-box">
            <h3>Ожидание хода</h3>
            <p>Сейчас ходит: <span id="q_wait_turn_name" class="q-wait-name">...</span></p>
            <button id="q_wait_show_cards" class="start-button">Показать мои карты</button>
          </div>
        </div>
        
        <button id="q_wait_back" class="q-sticky-bottom hidden">Скрыть карты</button>
      </div>
    `;

    ui.authPanel = document.getElementById('q_auth_panel');
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
    
    ui.waitOverlay = document.getElementById('q_wait_overlay');
    ui.waitTurnName = document.getElementById('q_wait_turn_name');
    ui.waitShowCardsBtn = document.getElementById('q_wait_show_cards');
    ui.waitBackBtn = document.getElementById('q_wait_back');

    ui.nameInput.value = myName;
    ui.roomInput.value = roomId;
    ui.roomLabel.textContent = roomId || '—';

    document.getElementById('q_create').addEventListener('click', onCreateRoom);
    document.getElementById('q_join').addEventListener('click', onJoinRoom);
    document.getElementById('q_leave').addEventListener('click', onLeave);
    document.getElementById('q_start').addEventListener('click', async () => {
      ui.startBtn.disabled = true; await api('startGame'); refreshState(true);
    });
    ui.giveBtn.addEventListener('click', async () => {
      ui.giveBtn.disabled = true; await api('giveCard', { pendingId: state.pending.pendingId }); refreshState(true);
    });
    
    ui.waitShowCardsBtn.addEventListener('click', () => {
      isViewingCardsWhileWaiting = true;
      refreshState(true);
    });
    
    ui.waitBackBtn.addEventListener('click', () => {
      isViewingCardsWhileWaiting = false;
      refreshState(true);
    });
  }

  (function init() {
    renderShell();
    if (roomId) { ui.authPanel.classList.add('hidden'); ui.main.classList.remove('hidden'); startPolling(); }
  })();
}
