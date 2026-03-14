// games/quartet.js
// Онлайн-игра «Квартет» для Telegram WebApp
// Клиент для Google Apps Script WebApp

function startQuartetGame() {
  const container = document.getElementById('game-container');
  if (!container) return;

  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  try { if (tg && tg.expand) tg.expand(); } catch (e) {}

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
  let waitToggleLoading = '';
  let reconnectLoading = false;

  let myName = localStorage.getItem(LS.name) || defaultName;
  let roomId = localStorage.getItem(LS.roomId) || '';

  const ui = {};

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

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

  function setReconnectLoading(isLoading, text) {
    reconnectLoading = !!isLoading;
    if (!ui.loadingPanel || !ui.loadingBtn) return;
    ui.loadingPanel.classList.toggle('hidden', !reconnectLoading);
    ui.loadingBtn.textContent = text || 'Загрузка лобби 🔄';
  }

  function setAuthButtonsIdle() {
    if (!ui.createBtn || !ui.joinBtn) return;
    ui.createBtn.disabled = false;
    ui.joinBtn.disabled = false;
    ui.createBtn.textContent = 'Создать лобби';
    ui.joinBtn.textContent = 'Войти';
  }

  function setStartButtonState(st) {
    if (!ui.startBtn) return;
    const canStart = !!(st && st.status === 'lobby' && st.me && st.me.isHost);
    ui.startBtn.disabled = !canStart;
    ui.startBtn.textContent = canStart ? 'Начать игру' : 'Начать игру может только хост';
  }

  function syncWaitButtons() {
    if (!ui.waitShowCardsBtn || !ui.waitBackBtn) return;

    if (waitToggleLoading) {
      ui.waitShowCardsBtn.textContent = 'Загрузка 🔄';
      ui.waitBackBtn.textContent = 'Загрузка 🔄';
      ui.waitShowCardsBtn.disabled = true;
      ui.waitBackBtn.disabled = true;
      return;
    }

    ui.waitShowCardsBtn.textContent = 'Показать мои карты';
    ui.waitBackBtn.textContent = 'Скрыть карты';
    ui.waitShowCardsBtn.disabled = false;
    ui.waitBackBtn.disabled = false;
  }

  function applyWaitMode(st) {
    if (!ui.waitOverlay || !ui.waitBackBtn || !ui.waitTurnName) return;

    const gameIsRunning = !!(st && st.status === 'playing');
    const myTurn = !!(st && String(st.turnPlayerId || '') === String(playerId));

    if (!gameIsRunning || myTurn) {
      isViewingCardsWhileWaiting = false;
      ui.waitOverlay.classList.add('hidden');
      ui.waitBackBtn.classList.add('hidden');
      syncWaitButtons();
      return;
    }

    ui.waitTurnName.textContent = st.turnPlayerName || 'кого-то';

    if (isViewingCardsWhileWaiting) {
      ui.waitOverlay.classList.add('hidden');
      ui.waitBackBtn.classList.remove('hidden');
    } else {
      ui.waitOverlay.classList.remove('hidden');
      ui.waitBackBtn.classList.add('hidden');
    }

    syncWaitButtons();
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

    const raw = await res.text().catch(() => '');
    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (e) {
      throw new Error('Ошибка сервера. Ответ: ' + String(raw || '').slice(0, 120));
    }

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

  async function refreshStateAwait(force) {
    let guard = 0;
    while (inFlight && guard < 40) {
      await sleep(100);
      guard += 1;
    }
    return refreshState(force);
  }

  function startPolling() {
    pollingStopped = false;
    if (pollTimer) clearTimeout(pollTimer);
    if (roomId) setReconnectLoading(true, 'Загрузка лобби 🔄');
    refreshState(true);
  }

  async function refreshState(force) {
    if (!roomId) return;
    if (inFlight) {
      scheduleNextPoll(state && state.status === 'lobby' ? POLL_MS_LOBBY : POLL_MS_GAME);
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
        setReconnectLoading(true, 'Загрузка лобби 🔄');
        scheduleNextPoll(POLL_MS_IDLE);
        return;
      }

      setReconnectLoading(false);
      updateScreenMode(state);

      if (!force && typeof state.version === 'number' && state.version === lastVersion) {
        updatePendingModal(state);
        applyWaitMode(state);
        scheduleNextPoll(state.status === 'lobby' ? POLL_MS_LOBBY : POLL_MS_GAME);
        return;
      }

      lastVersion = typeof state.version === 'number' ? state.version : lastVersion;
      renderPlayers(state);
      renderLog(state);
      renderGame(state);
      updatePendingModal(state);
      applyWaitMode(state);

      scheduleNextPoll(state.status === 'lobby' ? POLL_MS_LOBBY : POLL_MS_GAME);
    } catch (e) {
      failStreak += 1;
      if (!state) {
        setReconnectLoading(true, failStreak > 1 ? 'Переподключение… 🔄' : 'Загрузка лобби 🔄');
      }
      nextAllowedAt = Date.now() + Math.min(12000, failStreak * 1500);
      scheduleNextPoll(Math.min(12000, failStreak * 1500));
    } finally {
      inFlight = false;
      waitToggleLoading = '';
      syncWaitButtons();
    }
  }

  function updateScreenMode(st) {
    const showMain = !!roomId;

    ui.authPanel.classList.toggle('hidden', showMain);
    ui.main.classList.toggle('hidden', !showMain);
    ui.roomLabel.textContent = roomId || '—';

    const inLobby = st.status === 'lobby';
    const inGame = st.status === 'playing' || st.status === 'finished';
    ui.lobby.classList.toggle('hidden', !inLobby);
    ui.game.classList.toggle('hidden', !inGame);

    setStartButtonState(st);
    applyWaitMode(st);
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

      return `
        <div class="q-player">
          <div class="q-player-name">${escapeHtml(p.name || 'Игрок')} ${badges}</div>
          <div class="q-player-meta">🂠 ${Number(p.cardsCount || 0)} • 🏆 ${Number(p.quartetsCount || 0)}</div>
        </div>
      `;
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
    let header = st.status === 'finished'
      ? '<div><b>Игра завершена</b></div>'
      : `<div><b>${myTurn ? 'Твой ход' : 'Ход другого игрока'}</b></div>`;

    header += `<div class="quartet-muted">Текущий ход: ${escapeHtml(st.turnPlayerName || '—')}</div>`;
    header += `<div class="quartet-muted">Твои квартеты: <b>${Number((st.me && st.me.quartetsCount) || 0)}</b></div>`;

    ui.gameInfo.innerHTML = header;
    renderHand(st);
    renderAskPanel(st);
  }

  function findCardMeta(cardId) {
    for (const q of gameData.quartets) {
      const card = q.cards.find(x => x.id === cardId);
      if (card) return { quartet: q, card: card };
    }
    return null;
  }

  function buildHandGroups(hand) {
    const myCards = new Set(hand || []);
    const groups = [];

    gameData.quartets.forEach(q => {
      const owned = q.cards.filter(c => myCards.has(c.id));
      if (!owned.length) return;

      const slots = q.cards.map(c => ({
        id: c.id,
        title: c.title,
        owned: myCards.has(c.id)
      }));

      groups.push({
        quartet: q,
        ownedCount: owned.length,
        missingCount: 4 - owned.length,
        slots: slots,
        missingCards: q.cards.filter(c => !myCards.has(c.id))
      });
    });

    groups.sort((a, b) => {
      if (b.ownedCount !== a.ownedCount) return b.ownedCount - a.ownedCount;
      return a.quartet.name.localeCompare(b.quartet.name, 'ru');
    });

    return groups;
  }

  function renderHand(st) {
    const hand = (st.me && st.me.hand) || [];
    if (!hand.length) {
      ui.hand.innerHTML = '<div class="quartet-muted">У тебя нет карт.</div>';
      return;
    }

    const groups = buildHandGroups(hand);
    const almostReady = groups.filter(g => g.ownedCount === 3).length;

    ui.hand.innerHTML = `
      <div class="q-hand-summary">
        <div class="q-summary-pill">Карт: <b>${hand.length}</b></div>
        <div class="q-summary-pill">Групп: <b>${groups.length}</b></div>
        <div class="q-summary-pill ${almostReady ? 'q-summary-pill--accent' : ''}">Почти собраны: <b>${almostReady}</b></div>
      </div>

      <div class="q-hand-groups">
        ${groups.map(group => `
          <section class="q-hand-group ${group.ownedCount >= 3 ? 'q-hand-group--hot' : ''}">
            <div class="q-hand-group-head">
              <div class="q-hand-title-wrap">
                <div class="q-hand-group-title">${escapeHtml(group.quartet.name)}</div>
                <div class="q-hand-group-meta">Собрано ${group.ownedCount}/4</div>
              </div>
              <div class="q-group-progress">${group.ownedCount}/4</div>
            </div>

            <div class="q-hand-strip">
              ${group.slots.map(slot => `
                <div class="q-slot-card ${slot.owned ? '' : 'q-slot-card--ghost'}">
                  <div class="q-slot-top">${slot.owned ? 'Есть' : 'Нужно'}</div>
                  <div class="q-slot-title">${escapeHtml(slot.title)}</div>
                </div>
              `).join('')}
            </div>

            <div class="q-hand-footer">
              ${group.missingCards.length
                ? `Не хватает: ${group.missingCards.map(c => `<span class="q-missing-chip">${escapeHtml(c.title)}</span>`).join('')}`
                : `<span class="q-complete-chip">Квартет собран</span>`
              }
            </div>
          </section>
        `).join('')}
      </div>
    `;
  }

  function buildEligibleGroups(hand) {
    const myCards = new Set(hand || []);
    const result = [];

    gameData.quartets.forEach(q => {
      const ownedCount = q.cards.filter(c => myCards.has(c.id)).length;
      if (!ownedCount) return;

      const missingCards = q.cards.filter(c => !myCards.has(c.id));
      if (!missingCards.length) return;

      result.push({
        quartet: q,
        ownedCount: ownedCount,
        cards: missingCards
      });
    });

    result.sort((a, b) => {
      if (b.ownedCount !== a.ownedCount) return b.ownedCount - a.ownedCount;
      return a.quartet.name.localeCompare(b.quartet.name, 'ru');
    });

    return result;
  }

  async function sendAskCard(targetId, cardId, buttonEl) {
    if (!targetId || !cardId) return;
    try {
      if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.dataset.prev = buttonEl.textContent;
        buttonEl.textContent = 'Загрузка 🔄';
      }
      setStatus('Отправляю запрос…', 'info');
      await api('askCard', { targetId: targetId, cardId: cardId });
      setStatus('Запрос отправлен.', 'ok');
      await refreshStateAwait(true);
    } catch (e) {
      setStatus(String((e && e.message) || e), 'err');
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.textContent = buttonEl.dataset.prev || 'Спросить';
      }
    }
  }

  function renderAskPanel(st) {
    if (st.status !== 'playing') {
      ui.askPanel.innerHTML = '<div class="quartet-muted">Игра завершена.</div>';
      return;
    }

    const myTurn = String(st.turnPlayerId || '') === String(playerId);
    if (!myTurn) {
      ui.askPanel.innerHTML = '<div class="quartet-muted">Сейчас не твой ход.</div>';
      return;
    }

    if (st.pending && st.pending.status === 'waiting') {
      ui.askPanel.innerHTML = '<div class="quartet-muted">Ожидаем ответа на запрос…</div>';
      return;
    }

    const hand = (st.me && st.me.hand) || [];
    if (!hand.length) {
      ui.askPanel.innerHTML = '<div class="quartet-muted">У тебя нет карт — ходить нельзя.</div>';
      return;
    }

    const targets = (st.players || []).filter(p => String(p.playerId) !== String(playerId) && p.isActive !== false);
    if (!targets.length) {
      ui.askPanel.innerHTML = '<div class="quartet-muted">Нет доступных игроков.</div>';
      return;
    }

    const eligibleGroups = buildEligibleGroups(hand);
    const flatEligible = [];
    eligibleGroups.forEach(g => {
      g.cards.forEach(c => flatEligible.push({ quartet: g.quartet, ownedCount: g.ownedCount, card: c }));
    });

    if (!flatEligible.length) {
      ui.askPanel.innerHTML = '<div class="quartet-muted">У тебя нет подходящих карт для запроса.</div>';
      return;
    }

    ui.askPanel.innerHTML = `
      <div class="q-ask-form">
        <div class="quartet-field">
          <label>Кого спросить</label>
          <select id="q_target" class="q-input">
            ${targets.map(p => `<option value="${escapeHtml(String(p.playerId))}">${escapeHtml(p.name)} (🂠 ${Number(p.cardsCount || 0)})</option>`).join('')}
          </select>
        </div>

        <div class="q-quick-title">Быстрый выбор карты</div>

        <div class="q-quick-groups">
          ${eligibleGroups.map(group => `
            <div class="q-quick-group ${group.ownedCount >= 3 ? 'q-quick-group--hot' : ''}">
              <div class="q-quick-group-head">
                <span class="q-quick-group-name">${escapeHtml(group.quartet.name)}</span>
                <span class="q-quick-group-count">${group.ownedCount}/4</span>
              </div>
              <div class="q-quick-chips">
                ${group.cards.map(card => `
                  <button
                    type="button"
                    class="q-quick-chip"
                    data-card-id="${escapeHtml(card.id)}"
                    data-card-title="${escapeHtml(card.title)}"
                  >${escapeHtml(card.title)}</button>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        <details class="q-manual-box">
          <summary>Ручной выбор</summary>
          <div class="quartet-field" style="margin-top:10px;">
            <label>Какую карту</label>
            <select id="q_card" class="q-input">
              ${flatEligible.map(x => `<option value="${escapeHtml(String(x.card.id))}">${escapeHtml(x.quartet.name)} — ${escapeHtml(x.card.title)} · ${x.ownedCount}/4</option>`).join('')}
            </select>
          </div>
          <button id="q_ask_btn" class="start-button q-action-btn" style="margin-top: 10px;">Спросить карту</button>
        </details>
      </div>
      <div class="quartet-hint">Сначала идут карты из групп, которые ты почти собрал. Авто-отдача через 10 сек.</div>
    `;

    const targetSelect = document.getElementById('q_target');
    const manualAskBtn = document.getElementById('q_ask_btn');
    const cardSelect = document.getElementById('q_card');

    ui.askPanel.querySelectorAll('.q-quick-chip').forEach(btn => {
      btn.addEventListener('click', async function () {
        const targetId = targetSelect ? targetSelect.value : '';
        const cardId = this.dataset.cardId || '';
        await sendAskCard(targetId, cardId, this);
      });
    });

    if (manualAskBtn) {
      manualAskBtn.addEventListener('click', async function () {
        const targetId = targetSelect ? targetSelect.value : '';
        const cardId = cardSelect ? cardSelect.value : '';
        await sendAskCard(targetId, cardId, this);
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
    ui.pendingText.innerHTML = `Игрок <b>${escapeHtml(pending.askerName || '')}</b> просит карту:<br><b>${escapeHtml(pending.cardTitle || pending.cardId || '')}</b><br><span class="quartet-muted">Осталось: ${secsLeft} сек.</span>`;

    ui.giveBtn.disabled = !pending.targetHasCard;
    ui.giveBtn.textContent = pending.targetHasCard ? 'Отдать карту' : 'Карты нет';
    ui.pendingModal.classList.remove('hidden');
  }

  async function onCreateRoom() {
    try {
      saveInputs();
      setStatus('Создаю...', 'info');
      ui.createBtn.disabled = true;
      ui.joinBtn.disabled = true;
      ui.createBtn.textContent = 'Загрузка 🔄';

      const res = await api('createRoom');
      roomId = String(res.roomId || '');
      localStorage.setItem(LS.roomId, roomId);

      ui.authPanel.classList.add('hidden');
      ui.main.classList.remove('hidden');
      setReconnectLoading(true, 'Загрузка лобби 🔄');
      startPolling();
    } catch (e) {
      setStatus(String(e.message || e), 'err');
      setAuthButtonsIdle();
      setReconnectLoading(false);
      ui.authPanel.classList.remove('hidden');
      ui.main.classList.add('hidden');
    }
  }

  async function onJoinRoom() {
    try {
      saveInputs();
      if (!roomId) throw new Error('Код комнаты?');

      setStatus('Вхожу...', 'info');
      ui.createBtn.disabled = true;
      ui.joinBtn.disabled = true;
      ui.joinBtn.textContent = 'Загрузка 🔄';

      await api('joinRoom', { roomId: roomId });
      localStorage.setItem(LS.roomId, roomId);

      ui.authPanel.classList.add('hidden');
      ui.main.classList.remove('hidden');
      setReconnectLoading(true, 'Загрузка лобби 🔄');
      startPolling();
    } catch (e) {
      setStatus(String(e.message || e), 'err');
      setAuthButtonsIdle();
      setReconnectLoading(false);
      ui.authPanel.classList.remove('hidden');
      ui.main.classList.add('hidden');
    }
  }

  async function onLeave() {
    pollingStopped = true;
    if (pollTimer) clearTimeout(pollTimer);

    try { await api('leave'); } catch (e) {}

    roomId = '';
    state = null;
    lastVersion = -1;
    failStreak = 0;
    nextAllowedAt = 0;
    isViewingCardsWhileWaiting = false;
    waitToggleLoading = '';
    localStorage.removeItem(LS.roomId);

    setReconnectLoading(false);
    setAuthButtonsIdle();

    ui.authPanel.classList.remove('hidden');
    ui.main.classList.add('hidden');
    ui.roomInput.value = '';
    ui.status.textContent = '';

    if (typeof goToMainMenu === 'function') goToMainMenu();
  }

  async function handleWaitViewToggle(showCards) {
    if (waitToggleLoading) return;

    isViewingCardsWhileWaiting = !!showCards;
    waitToggleLoading = showCards ? 'show' : 'hide';
    applyWaitMode(state || {});

    try {
      await refreshStateAwait(true);
    } finally {
      waitToggleLoading = '';
      applyWaitMode(state || {});
    }
  }

  function renderShell() {
    container.innerHTML = `
      <style>
        .hidden { display: none !important; }

        .q-loading-panel {
          margin-bottom: 14px;
        }
        .q-loading-btn {
          width: 100%;
          min-height: 58px;
        }

        .q-hand-summary {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 6px 0 16px;
        }
        .q-summary-pill {
          background: #eef4ff;
          color: #334155;
          border: 1px solid #dbe7ff;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 0.92em;
          font-weight: 700;
        }
        .q-summary-pill--accent {
          background: #e8f1ff;
          color: #1d4ed8;
          border-color: #bfd5ff;
        }

        .q-hand-groups {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .q-hand-group {
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 14px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
        }
        .q-hand-group--hot {
          border-color: #c6d8ff;
          box-shadow: 0 14px 28px rgba(37, 99, 235, 0.08);
        }
        .q-hand-group-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 12px;
        }
        .q-hand-title-wrap {
          min-width: 0;
        }
        .q-hand-group-title {
          font-size: 0.98em;
          font-weight: 900;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: .03em;
          line-height: 1.2;
        }
        .q-hand-group-meta {
          margin-top: 3px;
          font-size: 0.9em;
          color: #64748b;
          font-weight: 700;
        }
        .q-group-progress {
          flex: 0 0 auto;
          background: #eef4ff;
          color: #1d4ed8;
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 900;
          font-size: .95em;
          border: 1px solid #dbe7ff;
        }

        .q-hand-strip {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 4px;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .q-hand-strip::-webkit-scrollbar {
          display: none;
        }

        .q-slot-card {
          flex: 0 0 145px;
          min-height: 88px;
          border-radius: 18px;
          padding: 12px;
          background: linear-gradient(180deg, #ffffff 0%, #f4f8ff 100%);
          border: 1.5px solid #d6e3f7;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .q-slot-card--ghost {
          background: linear-gradient(180deg, #fafafa 0%, #f3f4f6 100%);
          border: 1.5px dashed #cbd5e1;
          color: #94a3b8;
          box-shadow: none;
        }
        .q-slot-top {
          font-size: 0.78em;
          text-transform: uppercase;
          letter-spacing: .04em;
          color: #64748b;
          font-weight: 800;
        }
        .q-slot-title {
          font-size: 1em;
          font-weight: 900;
          color: #0f172a;
          line-height: 1.15;
          word-break: break-word;
        }
        .q-slot-card--ghost .q-slot-title {
          color: #64748b;
        }

        .q-hand-footer {
          margin-top: 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          color: #64748b;
          font-size: 0.92em;
          font-weight: 700;
          line-height: 1.3;
        }
        .q-missing-chip {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          color: #475569;
          border-radius: 999px;
          font-size: 0.9em;
          font-weight: 700;
        }
        .q-complete-chip {
          display: inline-flex;
          align-items: center;
          padding: 7px 12px;
          background: #ecfdf5;
          color: #15803d;
          border: 1px solid #bbf7d0;
          border-radius: 999px;
          font-size: 0.9em;
          font-weight: 800;
        }

        .q-ask-form {
          background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
          border-radius: 18px;
          padding: 16px;
          margin-top: 12px;
          border: 1px solid #dbe3ee;
        }
        .q-quick-title {
          margin-top: 4px;
          margin-bottom: 10px;
          font-size: 0.95em;
          font-weight: 900;
          color: #334155;
        }
        .q-quick-groups {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .q-quick-group {
          background: rgba(255,255,255,0.7);
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 12px;
        }
        .q-quick-group--hot {
          border-color: #bfd5ff;
          background: linear-gradient(180deg, #ffffff 0%, #eff6ff 100%);
        }
        .q-quick-group-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }
        .q-quick-group-name {
          font-size: 0.92em;
          font-weight: 900;
          color: #475569;
          text-transform: uppercase;
          line-height: 1.2;
        }
        .q-quick-group-count {
          flex: 0 0 auto;
          background: #eef4ff;
          color: #2563eb;
          border-radius: 999px;
          padding: 4px 9px;
          font-size: 0.82em;
          font-weight: 900;
          border: 1px solid #dbe7ff;
        }
        .q-quick-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .q-quick-chip {
          border: none;
          background: #2563eb;
          color: #fff;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 0.94em;
          font-weight: 800;
          line-height: 1;
          box-shadow: 0 8px 16px rgba(37, 99, 235, 0.18);
        }
        .q-quick-chip:disabled {
          opacity: 0.75;
        }

        .q-manual-box {
          margin-top: 14px;
          background: rgba(255,255,255,0.72);
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 12px;
        }
        .q-manual-box summary {
          cursor: pointer;
          font-weight: 800;
          color: #475569;
          outline: none;
          user-select: none;
        }
        .q-action-btn {
          min-height: 58px;
        }

        .q-log-container {
          max-height: 230px;
          overflow-y: auto;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 18px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .q-log-item {
          font-size: 0.98em;
          color: #4b5563;
          border-bottom: 1px solid #edf2f7;
          padding-bottom: 8px;
          line-height: 1.35;
        }
        .q-log-item:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .q-overlay {
          position: fixed;
          inset: 0;
          background: rgba(17, 24, 39, 0.78);
          backdrop-filter: blur(5px);
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }
        .q-wait-box {
          background: white;
          padding: 28px 20px;
          border-radius: 24px;
          width: 100%;
          max-width: 340px;
          text-align: center;
          box-shadow: 0 24px 50px rgba(0, 0, 0, 0.25);
        }
        .q-wait-box h3 {
          margin: 0 0 10px 0;
          color: #1f2937;
          font-size: 1.38em;
        }
        .q-wait-box p {
          margin: 0 0 22px 0;
          color: #4b5563;
          font-size: 1.06em;
          line-height: 1.4;
        }
        .q-wait-name {
          color: #2563eb;
          font-weight: 800;
        }
        .q-sticky-bottom {
          position: fixed;
          bottom: calc(22px + env(safe-area-inset-bottom));
          left: 50%;
          transform: translateX(-50%);
          z-index: 1999;
          background: #2563eb;
          color: white;
          border: none;
          min-width: 220px;
          padding: 16px 28px;
          border-radius: 999px;
          font-size: 1.08em;
          font-weight: 800;
          box-shadow: 0 12px 24px rgba(37, 99, 235, 0.34);
        }

        @media (max-width: 420px) {
          .q-slot-card {
            flex-basis: 138px;
            min-height: 84px;
            padding: 11px;
          }
          .q-slot-title {
            font-size: 0.95em;
          }
          .q-hand-group-title {
            font-size: 0.92em;
          }
          .q-group-progress {
            padding: 7px 10px;
            font-size: 0.9em;
          }
          .q-quick-chip {
            padding: 10px 12px;
            font-size: 0.9em;
          }
        }
      </style>

      <div class="quartet-wrap fade-in">
        <div class="quartet-header">
          <div class="quartet-title">🃏 Квартет</div>
          <div class="quartet-subtitle">Собери 4 карты одной группы</div>
        </div>

        <div id="q_auth_panel" class="quartet-card">
          <div class="quartet-grid2">
            <div class="quartet-field">
              <label>Твоё имя</label>
              <input id="q_name" class="q-input" placeholder="Имя" />
            </div>
            <div class="quartet-field">
              <label>Комната</label>
              <input id="q_room" class="q-input" placeholder="Код" maxlength="5" />
            </div>
          </div>
          <div class="quartet-grid2">
            <button id="q_create" class="start-button">Создать лобби</button>
            <button id="q_join" class="menu-button">Войти</button>
          </div>
          <div id="q_status" class="quartet-status" data-kind="info"></div>
        </div>

        <div id="q_main" class="quartet-main hidden">
          <div id="q_loading_panel" class="quartet-card q-loading-panel hidden">
            <button id="q_loading_btn" class="start-button q-loading-btn" disabled>Загрузка лобби 🔄</button>
          </div>

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

            <div class="quartet-subsection" style="margin-top:14px;">Действие</div>
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
    ui.loadingPanel = document.getElementById('q_loading_panel');
    ui.loadingBtn = document.getElementById('q_loading_btn');

    ui.waitOverlay = document.getElementById('q_wait_overlay');
    ui.waitTurnName = document.getElementById('q_wait_turn_name');
    ui.waitShowCardsBtn = document.getElementById('q_wait_show_cards');
    ui.waitBackBtn = document.getElementById('q_wait_back');

    ui.createBtn = document.getElementById('q_create');
    ui.joinBtn = document.getElementById('q_join');

    ui.nameInput.value = myName;
    ui.roomInput.value = roomId;
    ui.roomLabel.textContent = roomId || '—';

    ui.createBtn.addEventListener('click', onCreateRoom);
    ui.joinBtn.addEventListener('click', onJoinRoom);

    document.getElementById('q_leave').addEventListener('click', onLeave);

    document.getElementById('q_start').addEventListener('click', async () => {
      try {
        ui.startBtn.disabled = true;
        ui.startBtn.textContent = 'Загрузка 🔄';
        await api('startGame');
        await refreshStateAwait(true);
      } catch (e) {
        setStatus(String((e && e.message) || e), 'err');
        ui.startBtn.disabled = false;
        ui.startBtn.textContent = 'Начать игру';
      }
    });

    ui.giveBtn.addEventListener('click', async () => {
      try {
        ui.giveBtn.disabled = true;
        ui.giveBtn.textContent = 'Загрузка 🔄';
        await api('giveCard', { pendingId: state && state.pending ? state.pending.pendingId : '' });
        await refreshStateAwait(true);
      } catch (e) {
        setStatus(String((e && e.message) || e), 'err');
      }
    });

    ui.waitShowCardsBtn.addEventListener('click', () => handleWaitViewToggle(true));
    ui.waitBackBtn.addEventListener('click', () => handleWaitViewToggle(false));

    syncWaitButtons();
  }

  (function init() {
    renderShell();

    if (roomId) {
      ui.authPanel.classList.add('hidden');
      ui.main.classList.remove('hidden');
      setReconnectLoading(true, 'Загрузка лобби 🔄');
      startPolling();
    }
  })();
}
