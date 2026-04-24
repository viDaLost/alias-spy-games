// games/quartet.js
// Онлайн-игра «Квартет» для Telegram WebApp
// Адаптированная JS-версия на основе HTML-макета

function startQuartetGame() {
  const container = document.getElementById('game-container');
  if (!container) return;

  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  try {
    if (tg && tg.expand) tg.expand();
    if (tg && tg.enableClosingConfirmation) tg.enableClosingConfirmation();
  } catch (e) {}

  let tgUser = {};
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    tgUser = tg.initDataUnsafe.user;
  } else if (typeof getTelegramUser === 'function') {
    tgUser = getTelegramUser() || {};
  }

  let localPlayerId = localStorage.getItem('quartet_player_id');
  if (!localPlayerId) {
    localPlayerId = 'p_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
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
    openGroups: 'quartet_open_groups'
  };

  const GAS_URL = 'https://script.google.com/macros/s/AKfycby7mfu5zwKSY1IShcpzddZB0XKCo70CTpEhrSpbZjJsWgcse__9Cx7sibo5hmfc4heJ/exec';
  const POLL_MS_LOBBY = 1000;
  const POLL_MS_GAME = 1800;
  const POLL_MS_IDLE = 2500;

  const gameData = {
    quartets: [
      { id: 'apostles', name: 'Апостолы', icon: '⛪', cards: [
        { id: 'apostles_peter', title: 'Пётр' },
        { id: 'apostles_john', title: 'Иоанн' },
        { id: 'apostles_james', title: 'Иаков' },
        { id: 'apostles_andrew', title: 'Андрей' }
      ]},
      { id: 'evangelists', name: 'Евангелисты', icon: '📖', cards: [
        { id: 'evangelists_matthew', title: 'Матфей' },
        { id: 'evangelists_mark', title: 'Марк' },
        { id: 'evangelists_luke', title: 'Лука' },
        { id: 'evangelists_john', title: 'Иоанн' }
      ]},
      { id: 'patriarchs', name: 'Патриархи', icon: '👑', cards: [
        { id: 'patriarchs_abraham', title: 'Авраам' },
        { id: 'patriarchs_isaac', title: 'Исаак' },
        { id: 'patriarchs_jacob', title: 'Иаков' },
        { id: 'patriarchs_joseph', title: 'Иосиф' }
      ]},
      { id: 'prophets', name: 'Пророки', icon: '🔮', cards: [
        { id: 'prophets_isaiah', title: 'Исаия' },
        { id: 'prophets_jeremiah', title: 'Иеремия' },
        { id: 'prophets_ezekiel', title: 'Иезекииль' },
        { id: 'prophets_daniel', title: 'Даниил' }
      ]},
      { id: 'judges', name: 'Судьи', icon: '⚖️', cards: [
        { id: 'judges_deborah', title: 'Девора' },
        { id: 'judges_gideon', title: 'Гедеон' },
        { id: 'judges_samson', title: 'Самсон' },
        { id: 'judges_jephthah', title: 'Иеффай' }
      ]},
      { id: 'kings', name: 'Цари', icon: '🏰', cards: [
        { id: 'kings_saul', title: 'Саул' },
        { id: 'kings_david', title: 'Давид' },
        { id: 'kings_solomon', title: 'Соломон' },
        { id: 'kings_hezekiah', title: 'Езекия' }
      ]},
      { id: 'women', name: 'Жёны веры', icon: '👸', cards: [
        { id: 'matriarchs_sarah', title: 'Сарра' },
        { id: 'matriarchs_rebekah', title: 'Ревекка' },
        { id: 'matriarchs_rachel', title: 'Рахиль' },
        { id: 'matriarchs_leah', title: 'Лия' }
      ]},
      { id: 'heroes', name: 'Женщины Библии', icon: '🌟', cards: [
        { id: 'women_ruth', title: 'Руфь' },
        { id: 'women_esther', title: 'Есфирь' },
        { id: 'women_mary', title: 'Мария' },
        { id: 'women_anna', title: 'Анна' }
      ]},
      { id: 'paulteam', name: 'Команда Павла', icon: '🤝', cards: [
        { id: 'paulteam_barnabas', title: 'Варнава' },
        { id: 'paulteam_silas', title: 'Сила' },
        { id: 'paulteam_timothy', title: 'Тимофей' },
        { id: 'paulteam_titus', title: 'Тит' }
      ]},
      { id: 'places', name: 'Города', icon: '🏛️', cards: [
        { id: 'places_bethlehem', title: 'Вифлеем' },
        { id: 'places_nazareth', title: 'Назарет' },
        { id: 'places_capernaum', title: 'Капернаум' },
        { id: 'places_jerusalem', title: 'Иерусалим' }
      ]},
      { id: 'miracles', name: 'Чудеса', icon: '✨', cards: [
        { id: 'miracles_water_wine', title: 'Вода в вино' },
        { id: 'miracles_feeding_5000', title: 'Накормил 5000' },
        { id: 'miracles_calm_storm', title: 'Утихомирил бурю' },
        { id: 'miracles_raise_lazarus', title: 'Воскресил Лазаря' }
      ]},
      { id: 'armor', name: 'Всеоружие', icon: '🛡️', cards: [
        { id: 'armor_belt_truth', title: 'Пояс истины' },
        { id: 'armor_breastplate', title: 'Броня праведности' },
        { id: 'armor_shield_faith', title: 'Щит веры' },
        { id: 'armor_helmet_salvation', title: 'Шлем спасения' }
      ]}
    ]
  };

  let myName = localStorage.getItem(LS.name) || defaultName;
  let roomId = localStorage.getItem(LS.roomId) || '';

  let state = null;
  let lastVersion = -1;
  let pollTimer = null;
  let pollingStopped = false;
  let inFlight = false;
  let failStreak = 0;
  let nextAllowedAt = 0;
  let leavingNow = false;
  let reconnectLoading = false;
  let pendingMutedId = '';
  let isViewingCardsWhileWaiting = false;
  let waitToggleLoading = false;
  let currentTargetId = ''; // Для хранения выбранного игрока при запросе

  let openGroups = {};
  try {
    openGroups = JSON.parse(localStorage.getItem(LS.openGroups) || '{}') || {};
  } catch (e) {
    openGroups = {};
  }

  const ui = {};

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function saveOpenGroups() {
    localStorage.setItem(LS.openGroups, JSON.stringify(openGroups));
  }

  function haptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      tg.HapticFeedback.notificationOccurred(kind || 'success');
    } catch (e) {}
  }

  function showToast(message, type) {
    if (!ui.toast) return;
    ui.toast.textContent = message || '';
    ui.toast.className = 'toast show ' + (type || 'info');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      if (ui.toast) ui.toast.className = 'toast';
    }, 3000);
  }

  function showStatus(message, type) {
    if (!ui.statusBar) return;
    ui.statusBar.textContent = message || '';
    ui.statusBar.className = 'status-bar show ' + (type || 'info');
    clearTimeout(showStatus._timer);
    showStatus._timer = setTimeout(() => {
      if (ui.statusBar) ui.statusBar.className = 'status-bar';
    }, 3000);
  }

  function saveInputs() {
    myName = ((ui.playerName && ui.playerName.value) || '').trim() || defaultName;
    roomId = (((ui.roomCode && ui.roomCode.value) || '').trim()).toUpperCase();
    localStorage.setItem(LS.name, myName);
    if (roomId) localStorage.setItem(LS.roomId, roomId);
  }

  function setAuthButtonsIdle() {
    if (!ui.createBtn || !ui.joinBtn) return;
    ui.createBtn.disabled = false;
    ui.joinBtn.disabled = false;
    ui.createBtn.innerHTML = '<span>Создать</span>';
    ui.joinBtn.innerHTML = '<span>Войти</span>';
  }

  function setReconnectLoading(isLoading, text) {
    reconnectLoading = !!isLoading;
    if (!ui.loadingState) return;
    ui.loadingState.classList.toggle('hidden', !reconnectLoading);
    if (ui.loadingText) ui.loadingText.textContent = text || 'Подключение...';
  }

  function switchScreen(name) {
    if (!ui.authScreen || !ui.gameScreen || !ui.lobby || !ui.activeGame || !ui.loadingState) return;

    ui.authScreen.classList.add('hidden');
    ui.gameScreen.classList.add('hidden');
    ui.loadingState.classList.add('hidden');
    ui.lobby.classList.add('hidden');
    ui.activeGame.classList.add('hidden');

    if (name === 'auth') {
      ui.authScreen.classList.remove('hidden');
      return;
    }

    ui.gameScreen.classList.remove('hidden');
    if (name === 'loading') ui.loadingState.classList.remove('hidden');
    if (name === 'lobby') ui.lobby.classList.remove('hidden');
    if (name === 'game') ui.activeGame.classList.remove('hidden');
  }

  function updateHeaderRoom() {
    if (ui.roomDisplay) ui.roomDisplay.textContent = 'Комната: ' + (roomId || '—');
    if (ui.roomCodeBig) ui.roomCodeBig.textContent = roomId || '—';
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

  async function api(action, payload) {
    const body = Object.assign({
      action: action,
      roomId: roomId,
      playerId: playerId,
      name: myName
    }, payload || {});

    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      cache: 'no-store'
    });

    const raw = await res.text().catch(() => '');
    let data = null;
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

  function startPolling() {
    pollingStopped = false;
    if (pollTimer) clearTimeout(pollTimer);
    if (roomId) {
      updateHeaderRoom();
      switchScreen('loading');
      setReconnectLoading(true, 'Подключение...');
    }
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
        switchScreen('loading');
        setReconnectLoading(true, 'Подключение...');
        scheduleNextPoll(POLL_MS_IDLE);
        return;
      }

      setReconnectLoading(false);
      updateHeaderRoom();
      updateScreenMode(state);
      if (!force && typeof state.version === 'number' && state.version === lastVersion) {
        updatePendingModal(state);
        applyWaitMode(state);
        scheduleNextPoll(state.status === 'lobby' ? POLL_MS_LOBBY : POLL_MS_GAME);
        return;
      }

      lastVersion = typeof state.version === 'number' ? state.version : lastVersion;
      updateLobby(state);
      renderGame(state);
      updatePendingModal(state);
      renderRoomGuide(state);
      applyWaitMode(state);

      scheduleNextPoll(state.status === 'lobby' ? POLL_MS_LOBBY : POLL_MS_GAME);
    } catch (e) {
      failStreak += 1;
      if (!state) {
        switchScreen('loading');
        setReconnectLoading(true, failStreak > 1 ? 'Переподключение...' : 'Подключение...');
      }
      nextAllowedAt = Date.now() + Math.min(12000, failStreak * 1500);
      scheduleNextPoll(Math.min(12000, failStreak * 1500));
    } finally {
      inFlight = false;
    }
  }

  function updateScreenMode(st) {
    if (!roomId) {
      switchScreen('auth');
      return;
    }

    if (st.status === 'lobby') {
      switchScreen('lobby');
    } else {
      switchScreen('game');
    }
  }

  function renderRoomGuide(st) {
    if (!ui.roomGuide) return;
    const isHost = !!(st && st.me && st.me.isHost);
    ui.roomGuide.innerHTML = `
      <div class="guide-title">Как подключиться</div>
      <div class="guide-text">
        ${isHost
          ? '1. Нажми «Скопировать код». 2. Отправь код другу. 3. Друг открывает игру, вводит код комнаты и нажимает «Войти».'
          : 'Если ты получил код комнаты, просто введи его в поле «Код комнаты» и нажми «Войти».'}
      </div>
    `;
  }

  function updateLobby(st) {
    if (!ui.playersList || st.status !== 'lobby') return;

    const players = st.players || [];
    const me = st.me || players.find(p => String(p.playerId) === String(playerId)) || {};
    const isHost = !!me.isHost;

    if (ui.playerCount) ui.playerCount.textContent = players.length;
    if (ui.startBtn) {
      const canStart = isHost && players.length >= 3 && players.length <= 8;
      ui.startBtn.disabled = !canStart;
      ui.startBtn.textContent = isHost ? 'Начать игру' : 'Ожидание хоста...';
    }

    ui.playersList.innerHTML = players.map(p => {
      const isMe = String(p.playerId) === String(playerId);
      const letter = escapeHtml(String(p.name || 'И').charAt(0).toUpperCase());
      return `
        <div class="lobby-player-row">
          <div class="lobby-avatar">${letter}</div>
          <div class="lobby-player-main">
            <div class="lobby-player-name">${escapeHtml(p.name || 'Игрок')} ${isMe ? '<span class="badge-you">(ты)</span>' : ''}</div>
            <div class="lobby-player-meta">${p.isHost ? '👑 Хост' : 'Игрок'}${p.isActive === false ? ' · вышел' : ''}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function buildHandGroups(hand) {
    const myCards = new Set(hand || []);
    const groups = [];

    gameData.quartets.forEach(q => {
      const owned = q.cards.filter(c => myCards.has(c.id));
      if (!owned.length) return;

      const missing = q.cards.filter(c => !myCards.has(c.id));
      groups.push({
        quartet: q,
        ownedCount: owned.length,
        owned: owned,
        missing: missing,
        cards: q.cards.map(c => ({
          id: c.id,
          title: c.title,
          owned: myCards.has(c.id)
        }))
      });
    });

    groups.sort((a, b) => {
      if (b.ownedCount !== a.ownedCount) return b.ownedCount - a.ownedCount;
      return a.quartet.name.localeCompare(b.quartet.name, 'ru');
    });

    return groups;
  }

  function renderHand(st, hand, myTurn) {
    if (!ui.handCards) return;

    const groups = buildHandGroups(hand);
    if (!groups.length) {
      ui.handCards.innerHTML = '<div class="empty-note">У тебя пока нет карт</div>';
      return;
    }

    groups.forEach((g, i) => {
      if (typeof openGroups[g.quartet.id] === 'undefined') {
        openGroups[g.quartet.id] = i < 2 || g.ownedCount >= 3;
      }
    });
    saveOpenGroups();

    let html = '';

    // Сектор выбора цели над картами, если сейчас твой ход
    if (myTurn && st.status === 'playing') {
      const targets = (st.players || []).filter(p => String(p.playerId) !== String(playerId) && p.isActive !== false);
      if (targets.length > 0) {
        // Проверяем актуальность выбранного таргета
        if (!currentTargetId || !targets.find(t => String(t.playerId) === currentTargetId)) {
          currentTargetId = String(targets[0].playerId);
        }
        
        html += `
          <div class="turn-target-selector" style="margin-bottom: 16px; background: #eff6ff; padding: 14px; border-radius: 16px; border: 1.5px solid #bfdbfe; box-shadow: 0 4px 12px rgba(37,99,235,0.08);">
            <div style="font-size:13px; font-weight:900; color:#1e40af; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.03em;">Кого спросить:</div>
            <select id="hand_target_select" class="input-field compact-select" style="background:white; border-color:#93c5fd; color:#1e3a8a; font-weight:700;">
              ${targets.map(p => `<option value="${escapeHtml(String(p.playerId))}" ${String(p.playerId) === currentTargetId ? 'selected' : ''}>${escapeHtml(p.name)} · 🃏 ${Number(p.cardsCount || 0)}</option>`).join('')}
            </select>
          </div>
        `;
      } else {
        html += `<div style="margin-bottom:16px; color:var(--danger); font-weight:bold; text-align:center;">Нет доступных игроков для запроса</div>`;
      }
    }

    html += groups.map((group, idx) => {
      const isComplete = group.ownedCount === 4;
      const isOpen = !!openGroups[group.quartet.id];
      const needText = group.missing.length
        ? group.missing.map(m => `<span class="mini-chip">${escapeHtml(m.title)}</span>`).join('')
        : '<span class="mini-chip mini-chip-complete">Квартет собран</span>';

      return `
        <div class="card-wrapper ${isComplete ? 'floating' : ''}" style="--rotation:${idx % 2 === 0 ? '-1deg' : '1deg'};">
          <div class="hand-group ${isComplete ? 'card-collected' : 'owned'}">
            <button type="button" class="hand-group-head" data-group-id="${escapeHtml(group.quartet.id)}">
              <div class="card-header-row">
                <div class="card-icon">${group.quartet.icon}</div>
                <div class="card-number">${group.ownedCount}/4</div>
              </div>
              <div class="card-content-block">
                <div class="card-title">${escapeHtml(group.quartet.name)}</div>
                <div class="card-subtitle">${isComplete ? 'Полный квартет' : (myTurn ? 'Нажми на нужную карту ниже' : 'Собирай эту группу')}</div>
              </div>
              <div class="accordion-arrow ${isOpen ? 'open' : ''}">⌄</div>
            </button>

            <div class="hand-group-body-wrapper ${isOpen ? 'open' : ''}" id="hand_group_wrapper_${escapeHtml(group.quartet.id)}">
              <div class="hand-group-body-inner">
                <div class="hand-group-body">
                  <div class="mini-cards-grid">
                    ${group.cards.map(card => {
                      if (card.owned) {
                        return `
                          <div class="mini-card owned">
                            <div class="mini-card-top">Есть</div>
                            <div class="mini-card-title">${escapeHtml(card.title)}</div>
                          </div>
                        `;
                      } else {
                        if (myTurn) {
                          return `
                            <button type="button" class="mini-card missing interactive-ask-btn" data-card-id="${escapeHtml(card.id)}">
                              <div class="mini-card-top">Запросить</div>
                              <div class="mini-card-title">${escapeHtml(card.title)}</div>
                            </button>
                          `;
                        } else {
                          return `
                            <div class="mini-card missing">
                              <div class="mini-card-top">Нужно</div>
                              <div class="mini-card-title">${escapeHtml(card.title)}</div>
                            </div>
                          `;
                        }
                      }
                    }).join('')}
                  </div>
                  <div class="card-footer-note">${needText}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    ui.handCards.innerHTML = html;

    // Привязка обработчиков для селектора цели и кнопок запроса
    if (myTurn) {
      const selectEl = document.getElementById('hand_target_select');
      if (selectEl) {
        selectEl.addEventListener('change', (e) => {
          currentTargetId = e.target.value;
        });
      }

      ui.handCards.querySelectorAll('.interactive-ask-btn').forEach(btn => {
        btn.addEventListener('click', async function () {
          if (!currentTargetId) {
            showToast('Сначала выбери игрока для запроса сверху', 'error');
            return;
          }
          await sendAskCard(currentTargetId, this.dataset.cardId, this);
        });
      });
    }

    // Привязка обработчиков аккордеона (теперь переключает классы без полного рендера для устранения микротряски)
    ui.handCards.querySelectorAll('.hand-group-head').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.groupId;
        openGroups[id] = !openGroups[id];
        saveOpenGroups();
        
        const wrapper = document.getElementById(`hand_group_wrapper_${id}`);
        const arrow = btn.querySelector('.accordion-arrow');
        
        if (openGroups[id]) {
          if (wrapper) wrapper.classList.add('open');
          if (arrow) arrow.classList.add('open');
        } else {
          if (wrapper) wrapper.classList.remove('open');
          if (arrow) arrow.classList.remove('open');
        }
      });
    });
  }

  async function sendAskCard(targetId, cardId, buttonEl) {
    if (!targetId || !cardId) return;
    try {
      if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.innerHTML = '<div class="spinner spinner-dark" style="width:16px;height:16px;border-width:2px;margin:0;"></div>';
      }
      showStatus('Отправляю запрос...', 'info');
      await api('askCard', { targetId: targetId, cardId: cardId });
      showToast('Запрос отправлен', 'success');
      await refreshStateAwait(true);
    } catch (e) {
      showToast(String((e && e.message) || e), 'error');
      // В случае ошибки кнопка перерисуется при следующем poll-е
      await refreshStateAwait(true); 
    }
  }

  function renderActionPanel(st, myTurn) {
    if (!ui.actionContent) return;

    if (st.status === 'finished') {
      ui.actionContent.innerHTML = `
        <div class="action-empty">
          <div class="action-big">🏁</div>
          <div class="action-title">Игра завершена</div>
          <div class="action-text">Посмотри результаты наверху и лог последних ходов ниже.</div>
        </div>
      `;
      return;
    }

    if (st.pending && st.pending.status === 'waiting') {
      ui.actionContent.innerHTML = `
        <div class="action-empty">
          <div class="spinner spinner-dark"></div>
          <div class="action-title" style="margin-top:12px;">Ожидаем ответ</div>
          <div class="action-text">Запрос отправлен. Ждём реакции игрока.</div>
        </div>
      `;
      return;
    }

    if (myTurn) {
      ui.actionContent.innerHTML = `
        <div class="action-empty">
          <div class="action-big" style="font-size:36px;">👆</div>
          <div class="action-title" style="color:var(--primary);">Твой ход!</div>
          <div class="action-text">Выбери кого спросить в самом верху своих карт, затем кликни на нужную карту.</div>
        </div>
      `;
    } else {
      ui.actionContent.innerHTML = `
        <div class="action-empty">
          <div class="action-big">⏳</div>
          <div class="action-title">Ожидание хода</div>
          <div class="action-text">Сейчас ходит другой игрок. Ты можешь смотреть стол и свою руку.</div>
        </div>
      `;
    }
  }

  function renderGame(st) {
    if (st.status === 'lobby') return;

    const players = st.players || [];
    const me = st.me || players.find(p => String(p.playerId) === String(playerId)) || {};
    const myTurn = String(st.turnPlayerId || '') === String(playerId);

    if (ui.turnIndicator) {
      if (st.status === 'finished') {
        ui.turnIndicator.textContent = 'Игра завершена!';
        ui.turnIndicator.style.color = 'var(--success)';
      } else if (myTurn) {
        ui.turnIndicator.textContent = 'Твой ход! Выбирай карту в руке';
        ui.turnIndicator.style.color = 'var(--primary)';
        haptic('success');
      } else {
        ui.turnIndicator.textContent = 'Ходит: ' + escapeHtml(st.turnPlayerName || '...');
        ui.turnIndicator.style.color = 'var(--text-muted)';
      }
    }

    if (ui.playersRing) {
      ui.playersRing.innerHTML = players.map((p, idx) => {
        const isTurn = String(st.turnPlayerId || '') === String(p.playerId);
        const isMe = String(p.playerId) === String(playerId);
        const letter = escapeHtml(String(p.name || 'И').charAt(0).toUpperCase());
        return `
          <div class="player-avatar ${isTurn ? 'active' : ''}" style="animation-delay:${idx * 0.08}s;">
            <div class="avatar-circle ${p.isHost ? 'host' : ''} ${isMe ? 'me' : ''}">${letter}</div>
            <div class="player-info">
              <div>${escapeHtml(p.name || 'Игрок')}${isMe ? ' · ты' : ''}</div>
              <div class="player-cards-count">🃏 ${Number(p.cardsCount || 0)} | 🏆 ${Number(p.quartetsCount || 0)}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    if (ui.quartetsDisplay) {
      const count = Number(me.quartetsCount || 0);
      if (count > 0) {
        ui.quartetsDisplay.innerHTML = Array.from({ length: count }).map((_, i) => (
          `<div class="quartet-badge">🏆 Квартет ${i + 1}</div>`
        )).join('');
      } else {
        ui.quartetsDisplay.innerHTML = '<div class="empty-quartets">Пока нет квартетов</div>';
      }
    }

    renderHand(st, (st.me && st.me.hand) || [], myTurn);
    renderActionPanel(st, myTurn);
    renderGameLog(st);
  }

  function renderGameLog(st) {
    if (!ui.gameLog) return;
    const items = (st.log || []).slice(-50);
    const html = items.length
      ? items.map(x => `<div class="log-entry">${escapeHtml(x)}</div>`).join('')
      : '<div class="empty-log">Лог игры пока пуст.</div>';

    if (ui.gameLog.innerHTML !== html) {
      ui.gameLog.innerHTML = html;
      ui.gameLog.scrollTop = ui.gameLog.scrollHeight;
    }
  }

  function updatePendingModal(st) {
    if (!ui.pendingModal || !ui.pendingText || !ui.giveBtn) return;

    const pending = st.pending;
    if (!pending || pending.status !== 'waiting' || String(pending.targetId) !== String(playerId)) {
      ui.pendingModal.classList.remove('active');
      return;
    }

    if (pendingMutedId && pendingMutedId === String(pending.pendingId || '')) {
      return;
    }

    const secsLeft = Math.max(0, Math.ceil((Number(pending.expiresAtMs || 0) - Date.now()) / 1000));
    ui.pendingText.innerHTML = `
      <div style="font-size:18px; margin-bottom:8px;">Игрок <strong>${escapeHtml(pending.askerName || '')}</strong> просит:</div>
      <div style="font-size:24px; font-weight:800; color:var(--primary); margin:16px 0;">${escapeHtml(pending.cardTitle || pending.cardId || '')}</div>
      <div style="color:var(--text-muted); font-size:14px; margin-bottom:8px;">${pending.targetHasCard ? 'У тебя есть эта карта' : 'У тебя нет этой карты'}</div>
      <div style="color:var(--text-muted); font-size:13px;">Осталось: ${secsLeft} сек.</div>
    `;

    ui.giveBtn.disabled = !pending.targetHasCard;
    ui.giveBtn.style.opacity = pending.targetHasCard ? '1' : '0.55';
    ui.giveBtn.textContent = pending.targetHasCard ? 'Отдать карту' : 'Карты нет';
    ui.pendingModal.classList.add('active');
    haptic('warning');
  }

  function closePending() {
    if (!ui.pendingModal) return;
    const pending = state && state.pending;
    if (pending && pending.pendingId) pendingMutedId = String(pending.pendingId);
    ui.pendingModal.classList.remove('active');
  }

  function applyWaitMode(st) {
    if (!ui.waitOverlay || !ui.waitBackBtn || !ui.waitTurnName) return;

    const inGame = !!(st && st.status === 'playing');
    const myTurn = !!(st && String(st.turnPlayerId || '') === String(playerId));

    if (!inGame || myTurn) {
      isViewingCardsWhileWaiting = false;
      ui.waitOverlay.classList.add('hidden');
      ui.waitBackBtn.classList.add('hidden');
      syncWaitButtons();
      return;
    }

    ui.waitTurnName.textContent = st.turnPlayerName || 'другой игрок';

    if (isViewingCardsWhileWaiting) {
      ui.waitOverlay.classList.add('hidden');
      ui.waitBackBtn.classList.remove('hidden');
    } else {
      ui.waitOverlay.classList.remove('hidden');
      ui.waitBackBtn.classList.add('hidden');
    }

    syncWaitButtons();
  }

  function syncWaitButtons() {
    if (!ui.waitShowCardsBtn || !ui.waitBackBtn) return;
    if (waitToggleLoading) {
      ui.waitShowCardsBtn.textContent = 'Загрузка...';
      ui.waitBackBtn.textContent = 'Загрузка...';
      ui.waitShowCardsBtn.disabled = true;
      ui.waitBackBtn.disabled = true;
      return;
    }
    ui.waitShowCardsBtn.textContent = 'Показать мои карты';
    ui.waitBackBtn.textContent = 'Скрыть карты';
    ui.waitShowCardsBtn.disabled = false;
    ui.waitBackBtn.disabled = false;
  }

  async function handleWaitViewToggle(showCards) {
    if (waitToggleLoading) return;
    waitToggleLoading = true;
    isViewingCardsWhileWaiting = !!showCards;
    applyWaitMode(state || {});
    try {
      await refreshStateAwait(true);
    } finally {
      waitToggleLoading = false;
      applyWaitMode(state || {});
    }
  }

  async function copyRoomCode() {
    if (!roomId) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(roomId);
      } else {
        const ta = document.createElement('textarea');
        ta.value = roomId;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      const old = ui.copyCodeBtn ? ui.copyCodeBtn.textContent : 'Скопировать код';
      if (ui.copyCodeBtn) {
        ui.copyCodeBtn.textContent = 'Скопировано ✓';
        ui.copyCodeBtn.disabled = true;
        setTimeout(() => {
          if (ui.copyCodeBtn) {
            ui.copyCodeBtn.textContent = old;
            ui.copyCodeBtn.disabled = false;
          }
        }, 1500);
      }
      showToast('Код комнаты скопирован', 'success');
    } catch (e) {
      showToast('Не удалось скопировать код', 'error');
    }
  }

  function openRulesModal() {
    if (ui.rulesModal) ui.rulesModal.classList.add('active');
  }

  function closeRulesModal() {
    if (ui.rulesModal) ui.rulesModal.classList.remove('active');
  }

  async function onCreateRoom() {
    try {
      saveInputs();
      showStatus('Создаю комнату...', 'info');
      ui.createBtn.disabled = true;
      ui.joinBtn.disabled = true;
      ui.createBtn.innerHTML = '<span>Загрузка...</span>';

      const res = await api('createRoom');
      roomId = String(res.roomId || '');
      localStorage.setItem(LS.roomId, roomId);
      updateHeaderRoom();
      switchScreen('loading');
      setReconnectLoading(true, 'Загрузка лобби...');
      startPolling();
    } catch (e) {
      setAuthButtonsIdle();
      setReconnectLoading(false);
      showToast(String((e && e.message) || e), 'error');
    }
  }

  async function onJoinRoom() {
    try {
      saveInputs();
      if (!roomId) throw new Error('Введи код комнаты');

      showStatus('Подключаюсь...', 'info');
      ui.createBtn.disabled = true;
      ui.joinBtn.disabled = true;
      ui.joinBtn.innerHTML = '<span>Загрузка...</span>';

      await api('joinRoom', { roomId: roomId });
      localStorage.setItem(LS.roomId, roomId);
      updateHeaderRoom();
      switchScreen('loading');
      setReconnectLoading(true, 'Загрузка лобби...');
      startPolling();
    } catch (e) {
      setAuthButtonsIdle();
      setReconnectLoading(false);
      showToast(String((e && e.message) || e), 'error');
    }
  }

  async function onStartGame() {
    try {
      if (!ui.startBtn) return;
      ui.startBtn.disabled = true;
      ui.startBtn.textContent = 'Загрузка...';
      await api('startGame');
      showToast('Игра начинается!', 'success');
      await refreshStateAwait(true);
    } catch (e) {
      showToast(String((e && e.message) || e), 'error');
      if (ui.startBtn) {
        ui.startBtn.disabled = false;
        ui.startBtn.textContent = 'Начать игру';
      }
    }
  }

  async function onGiveCard() {
    try {
      if (!ui.giveBtn) return;
      ui.giveBtn.disabled = true;
      ui.giveBtn.textContent = 'Загрузка...';
      await api('giveCard', { pendingId: state && state.pending ? state.pending.pendingId : '' });
      pendingMutedId = '';
      ui.pendingModal.classList.remove('active');
      await refreshStateAwait(true);
    } catch (e) {
      showToast(String((e && e.message) || e), 'error');
    }
  }

  async function onLeave() {
    if (leavingNow) return;
    leavingNow = true;

    pollingStopped = true;
    if (pollTimer) clearTimeout(pollTimer);

    if (ui.leaveBtn) {
      ui.leaveBtn.disabled = true;
      ui.leaveBtn.textContent = 'Загрузка...';
    }

    try {
      await api('leave');
    } catch (e) {}

    roomId = '';
    state = null;
    lastVersion = -1;
    failStreak = 0;
    nextAllowedAt = 0;
    pendingMutedId = '';
    reconnectLoading = false;
    isViewingCardsWhileWaiting = false;
    waitToggleLoading = false;
    leavingNow = false;
    currentTargetId = '';
    localStorage.removeItem(LS.roomId);

    if (ui.roomCode) ui.roomCode.value = '';
    updateHeaderRoom();
    setAuthButtonsIdle();
    setReconnectLoading(false);
    switchScreen('auth');

    if (ui.leaveBtn) {
      ui.leaveBtn.disabled = false;
      ui.leaveBtn.textContent = '✕';
    }

    if (typeof goToMainMenu === 'function') goToMainMenu();
  }

  function renderShell() {
    container.innerHTML = `
          <style>
        :root {
          --primary: #2563eb;
          --primary-dark: #1d4ed8;
          --primary-light: #dbe7ff;
          --success: #10b981;
          --warning: #f59e0b;
          --danger: #ef4444;
          --bg: #f0f4f8;
          --card-bg: #ffffff;
          --text: #0f172a;
          --text-muted: #64748b;
          --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
          --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          --shadow-card: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          --radius: 16px;
          --radius-sm: 12px;
        }

        * {
          box-sizing: border-box;tap-highlight-color: transparent;
        }

        #game-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: var(--text);
        }

        .quartet-root {
          background: linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%);
          color: var(--text);
          min-height: 100vh;
          overflow-x: hidden;
          padding-bottom: env(safe-area-inset-bottom);
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideIn {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        @keyframes glow {
          0%, 100% { box-shadow: 0 0 5px rgba(37, 99, 235, 0.5); }
          50% { box-shadow: 0 0 20px rgba(37, 99, 235, 0.8), 0 0 40px rgba(37, 99, 235, 0.25); }
        }

        @keyframes cardDeal {
          0% { transform: translateY(-50px) rotate(0deg); opacity: 0; }
          100% { transform: translateY(0) rotate(var(--rotation, 0deg)); opacity: 1; }
        }

        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }

        .hidden { display: none !important; }
        .fade-in { animation: fadeIn .35s ease-out; }

        .game-header {
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
          color: white;
          padding: 20px;
          text-align: center;
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: var(--shadow-lg);
        }

        .game-header.row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          text-align: left;
        }

        .game-title {
          font-size: 28px;
          font-weight: 900;
          letter-spacing: -0.5px;
          text-shadow: 0 2px 4px rgba(0,0,0,0.2);
          margin-bottom: 4px;
        }

        .game-subtitle {
          font-size: 14px;
          opacity: 0.92;
          font-weight: 500;
        }

        .content-wrap {
          padding: 24px;
          max-width: 520px;
          margin: 0 auto;
        }

        .btn {
          border: none;
          border-radius: var(--radius);
          padding: 16px 24px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: transform .2s ease, opacity .2s ease, box-shadow .2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          position: relative;
          overflow: hidden;
        }

        .btn:active { transform: scale(0.97); }
        .btn:disabled { opacity: 0.65; cursor: default; }

        .btn-primary {
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
          color: white;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
        }

        .btn-secondary {
          background: white;
          color: var(--text);
          border: 2px solid #e2e8f0;
        }

        .btn-success {
          background: linear-gradient(135deg, var(--success) 0%, #059669 100%);
          color: white;
          box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
        }

        .btn-icon {
          width: 48px;
          height: 48px;
          padding: 0;
          border-radius: 50%;
        }

        .w-full { width: 100%; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .mt-4 { margin-top: 16px; }

        .card-3d {
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
          border-radius: var(--radius);
          box-shadow:
            0 2px 4px rgba(0,0,0,0.05),
            0 4px 8px rgba(0,0,0,0.05),
            0 8px 16px rgba(0,0,0,0.05),
            inset 0 1px 0 rgba(255,255,255,0.8);
          border: 1px solid rgba(226, 232, 240, 0.8);
          transition: transform .3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        .card-3d::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, var(--primary-light), var(--primary));
          opacity: .65;
        }

        .input-group { margin-bottom: 16px; }
        .input-group.compact { margin-bottom: 12px; }

        .input-label {
          display: block;
          font-size: 14px;
          font-weight: 700;
          color: var(--text-muted);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .input-field {
          width: 100%;
          padding: 16px;
          border: 2px solid #e2e8f0;
          border-radius: var(--radius);
          font-size: 16px;
          font-weight: 600;
          transition: all .2s;
          background: #f8fafc;
          color: var(--text);
        }

        .compact-select {
          padding-right: 40px;
          appearance: none;appearance: none;
        }

        .input-field:focus {
          outline: none;
          border-color: var(--primary);
          background: white;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .status-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          padding: 12px 20px;
          background: var(--primary);
          color: white;
          font-weight: 700;
          font-size: 14px;
          z-index: 2000;
          transform: translateY(-100%);
          transition: transform .25s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .status-bar.show { transform: translateY(0); }
        .status-bar.success { background: var(--success); }
        .status-bar.error { background: var(--danger); }

        .spinner {
          width: 24px;
          height: 24px;
          border: 3px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }

        .spinner-dark {
          border-color: rgba(37,99,235,.18);
          border-top-color: var(--primary);
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .room-code-display {
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          color: white;
          padding: 24px;
          border-radius: var(--radius);
          text-align: center;
          position: relative;
          overflow: hidden;
          margin: 16px 0;
        }

        .room-code-display::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
          animation: shimmer 3s infinite;
        }

        .room-code-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          opacity: 0.7;
          margin-bottom: 8px;
        }

        .room-code {
          font-size: 36px;
          font-weight: 900;
          letter-spacing: 0.18em;
          font-family: 'Courier New', monospace;
          text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }

        .copy-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
          margin-top: 16px;
        }

        .guide-title {
          margin-top: 16px;
          font-size: 13px;
          font-weight: 900;
          color: white;
          opacity: .95;
          text-transform: uppercase;
          letter-spacing: .05em;
        }

        .guide-text {
          margin-top: 8px;
          font-size: 14px;
          line-height: 1.5;
          color: rgba(255,255,255,.8);
        }

        .lobby-player-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #f8fafc;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }

        .lobby-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
        }

        .lobby-player-main { flex: 1; min-width: 0; }
        .lobby-player-name { font-weight: 800; color: var(--text); }
        .lobby-player-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .badge-you { color: var(--primary); }

        .game-table {
          background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%);
          min-height: 220px;
          border-radius: 24px;
          margin: 16px;
          padding: 20px;
          position: relative;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.3), 0 20px 40px rgba(0,0,0,0.18);
          border: 4px solid rgba(255,255,255,0.1);
        }

        .table-felt {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(circle at 20% 80%, rgba(255,255,255,0.03) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255,255,255,0.03) 0%, transparent 50%);
          pointer-events: none;
        }

        .players-ring {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
          gap: 12px;
          position: relative;
          z-index: 1;
        }

        .player-avatar {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          transition: transform .3s ease;
        }

        .player-avatar.active { transform: scale(1.05); }
        .player-avatar.active .avatar-circle {
          box-shadow: 0 0 0 4px var(--warning), 0 0 20px rgba(245, 158, 11, 0.45);
          animation: pulse 2s infinite;
        }

        .avatar-circle {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #475569 0%, #334155 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: 900;
          color: white;
          border: 3px solid rgba(255,255,255,0.2);
          box-shadow: var(--shadow);
          position: relative;
        }

        .avatar-circle.me {
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
        }

        .avatar-circle.host::after {
          content: '👑';
          position: absolute;
          bottom: -4px;
          right: -4px;
          font-size: 16px;
          background: var(--warning);
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid white;
        }

        .player-info {
          text-align: center;
          color: white;
          font-size: 12px;
          font-weight: 700;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }

        .player-cards-count {
          background: rgba(0,0,0,0.28);
          padding: 2px 8px;
          border-radius: 999px;
          margin-top: 3px;
          display: inline-block;
        }

        .game-info-wrap {
          padding: 8px 16px 0;
          text-align: center;
        }

        #turnIndicator {
          font-size: 18px;
          font-weight: 900;
          color: var(--text);
          margin-bottom: 10px;
        }

        #quartetsDisplay {
          display: flex;
          gap: 8px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .quartet-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
          color: white;
          padding: 8px 16px;
          border-radius: 999px;
          font-weight: 800;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);
          border: 2px solid rgba(255,255,255,0.3);
        }

        .empty-quartets,
        .empty-note,
        .empty-log {
          color: var(--text-muted);
          font-size: 14px;
          text-align: center;
          padding: 12px;
        }

        .hand-section,
        .log-section {
          padding: 16px;
        }

        .section-caption {
          font-weight: 800;
          margin-bottom: 12px;
          color: var(--text-muted);
          text-transform: uppercase;
          font-size: 12px;
          letter-spacing: .05em;
          text-align: center;
        }

        .cards-fan {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .card-wrapper {
          width: 100%;
          transition: transform .3s ease, opacity .3s ease; /* Убрано transition: all для избежания микротряски */
          animation: cardDeal .35s ease-out backwards;
          will-change: transform;
        }

        .card-wrapper.floating {
          animation: float 3s ease-in-out infinite;
        }

        .hand-group {
          width: 100%;
          border-radius: var(--radius);
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
          box-shadow: 0 10px 24px rgba(15,23,42,.08);
          border: 1px solid #e2e8f0;
          overflow: hidden;
        }

        .hand-group.owned {
          border-color: #bfdbfe;
          background: linear-gradient(180deg, #ffffff 0%, #f0f7ff 100%);
        }

        .card-collected {
          background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
          border-color: #fbbf24;
          animation: glow 2s infinite;
        }

        .hand-group-head {
          width: 100%;
          border: none;
          background: transparent;
          padding: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          text-align: left;
        }

        .card-header-row {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          flex: 0 0 56px;
        }

        .card-icon {
          width: 42px;
          height: 42px;
          background: var(--primary-light);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        }

        .card-number {
          font-size: 12px;
          font-weight: 900;
          color: var(--text-muted);
          background: #f1f5f9;
          padding: 3px 8px;
          border-radius: 999px;
        }

        .card-content-block {
          flex: 1;
          min-width: 0;
        }

        .card-title {
          font-size: 16px;
          font-weight: 900;
          line-height: 1.2;
          color: var(--text);
        }

        .card-subtitle {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 4px;
          line-height: 1.4;
        }

        .accordion-arrow {
          flex: 0 0 auto;
          font-size: 24px;
          color: var(--text-muted);
          transform: rotate(-90deg);
          transition: transform .25s ease;
        }

        .accordion-arrow.open { transform: rotate(0deg); }

        /* Использование CSS Grid для плавной анимации высоты гармошки */
        .hand-group-body-wrapper {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          will-change: grid-template-rows;
        }

        .hand-group-body-wrapper.open {
          grid-template-rows: 1fr;
        }

        .hand-group-body-inner {
          overflow: hidden;
        }

        .hand-group-body {
          padding: 0 14px 14px;
        }

        .mini-cards-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .mini-card {
          border-radius: 14px;
          padding: 12px;
          min-height: 82px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          border: 1.5px solid #dbeafe;
          background: white;
          box-shadow: 0 6px 14px rgba(15,23,42,.05);
        }

        .mini-card.missing {
          border-style: dashed;
          border-color: #cbd5e1;
          background: #f8fafc;
        }

        /* Стили для интерактивной кнопки карточки, которую можно запросить */
        button.mini-card.missing.interactive-ask-btn {
          cursor: pointer;
          background: #eff6ff;
          border-color: #93c5fd;
          border-style: solid;
          transition: transform 0.1s ease, background 0.15s ease, box-shadow 0.15s ease;
          text-align: left;
          font-family: inherit;
          box-shadow: 0 4px 12px rgba(37,99,235,0.08);
        }
        
        button.mini-card.missing.interactive-ask-btn:active {
          transform: scale(0.96);
          background: #dbeafe;
        }

        button.mini-card.missing.interactive-ask-btn .mini-card-top {
          color: var(--primary);
        }

        button.mini-card.missing.interactive-ask-btn .mini-card-title {
          color: #1e3a8a;
        }
        
        button.mini-card.missing.interactive-ask-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .mini-card-top {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .04em;
          color: var(--text-muted);
          font-weight: 800;
        }

        .mini-card-title {
          font-size: 14px;
          font-weight: 900;
          color: var(--text);
          line-height: 1.2;
        }

        .mini-card.missing .mini-card-title {
          color: #64748b;
        }

        .card-footer-note {
          margin-top: 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .mini-chip {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
          color: #475569;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
        }

        .mini-chip-complete {
          background: #ecfdf5;
          color: #15803d;
          border: 1px solid #bbf7d0;
        }

        .action-panel {
          background: white;
          border-radius: 24px 24px 0 0;
          padding: 20px 16px calc(18px + env(safe-area-inset-bottom));
          box-shadow: 0 -10px 40px rgba(0,0,0,0.1);
          position: sticky;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 50;
          margin-top: 12px;
        }

        .action-handle {
          width: 40px;
          height: 4px;
          background: #e2e8f0;
          border-radius: 2px;
          margin: 0 auto 16px;
        }

        .action-empty {
          text-align: center;
          color: var(--text-muted);
          padding: 10px 6px;
        }

        .action-big {
          font-size: 42px;
          margin-bottom: 10px;
        }

        .action-title {
          font-size: 18px;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 6px;
        }

        .action-text {
          font-size: 14px;
          color: var(--text-muted);
          line-height: 1.5;
        }

        .game-log {
          background: #f8fafc;
          border-radius: var(--radius);
          padding: 16px;
          max-height: 220px;
          overflow-y: auto;
          font-size: 14px;
          line-height: 1.5;
          border: 1px solid #e2e8f0;
        }

        .log-entry {
          padding: 8px 0;
          border-bottom: 1px solid #e2e8f0;
          animation: slideIn .25s ease-out;
        }

        .log-entry:last-child { border-bottom: none; }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          z-index: 2500;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          opacity: 0;
          pointer-events: none;
          transition: opacity .25s ease;
        }

        .modal-overlay.active {
          opacity: 1;
          pointer-events: all;
        }

        .modal-content {
          background: white;
          border-radius: 24px;
          padding: 24px;
          width: 100%;
          max-width: 520px;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.45);
          transform: scale(.94);
          transition: transform .25s ease;
        }

        .modal-overlay.active .modal-content { transform: scale(1); }

        .toast {
          position: fixed;
          bottom: calc(100px + env(safe-area-inset-bottom));
          left: 50%;
          transform: translateX(-50%) translateY(100px);
          background: #1e293b;
          color: white;
          padding: 16px 24px;
          border-radius: var(--radius);
          font-weight: 700;
          box-shadow: var(--shadow-lg);
          z-index: 2600;
          opacity: 0;
          transition: all .25s ease;
          max-width: calc(100vw - 32px);
          text-align: center;
        }

        .toast.show {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }

        .toast.success { background: var(--success); }
        .toast.error { background: var(--danger); }

        .wait-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.72);
          z-index: 2400;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }

        .wait-box {
          background: white;
          padding: 28px 20px;
          border-radius: 24px;
          width: 100%;
          max-width: 340px;
          text-align: center;
          box-shadow: 0 24px 50px rgba(0,0,0,.25);
        }

        .wait-box h3 {
          margin: 0 0 10px;
          color: #1f2937;
          font-size: 22px;
        }

        .wait-box p {
          margin: 0 0 22px;
          color: #4b5563;
          font-size: 16px;
          line-height: 1.45;
        }

        .wait-name {
          color: #2563eb;
          font-weight: 900;
        }

        .wait-back {
          position: fixed;
          bottom: calc(22px + env(safe-area-inset-bottom));
          left: 50%;
          transform: translateX(-50%);
          z-index: 2401;
          min-width: 220px;
          box-shadow: 0 12px 24px rgba(37,99,235,.34);
        }

        .rules-scroll {
          max-height: 78vh;
          overflow-y: auto;
        }

        .rules-title {
          font-size: 22px;
          font-weight: 900;
          color: var(--text);
          margin-bottom: 16px;
        }

        .rules-intro {
          background: linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
          border: 1px solid #dbe7ff;
          color: #334155;
          border-radius: 16px;
          padding: 14px;
          line-height: 1.45;
          font-size: 14px;
          margin-bottom: 14px;
        }

        .rules-section {
          margin-bottom: 14px;
          padding: 14px;
          border-radius: 16px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }

        .rules-section-title {
          font-size: 16px;
          font-weight: 900;
          color: #1e293b;
          margin-bottom: 8px;
        }

        .rules-list {
          margin: 0;
          padding-left: 18px;
          color: #475569;
          line-height: 1.5;
          font-size: 14px;
        }

        .rules-list li + li { margin-top: 6px; }

        .rules-tip {
          margin-top: 8px;
          padding: 10px 12px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 12px;
          color: #1e40af;
          font-size: 13px;
          line-height: 1.4;
          font-weight: 700;
        }

        @media (max-width: 640px) {
          .content-wrap { padding: 18px; }
          .grid-2 { grid-template-columns: 1fr; }
          .game-title { font-size: 24px; }
          .room-code { font-size: 28px; }
          .mini-cards-grid { grid-template-columns: 1fr 1fr; }
        }

        @media (max-width: 420px) {
          .mini-cards-grid { grid-template-columns: 1fr; }
          .game-table { min-height: 190px; }
          .room-code { font-size: 26px; }
        }
      </style>

      <div class="quartet-root fade-in">
        <div id="statusBar" class="status-bar"></div>

        <div id="authScreen">
          <div class="game-header">
            <div class="game-title">🃏 Квартет</div>
            <div class="game-subtitle">Собери 4 карты одной группы</div>
          </div>

          <div class="content-wrap">
            <div class="card-3d" style="padding:24px; margin-bottom:20px;">
              <div class="input-group">
                <label class="input-label">Твоё имя</label>
                <input type="text" id="playerName" class="input-field" placeholder="Введи имя" maxlength="20">
              </div>

              <div class="input-group">
                <label class="input-label">Код комнаты</label>
                <input type="text" id="roomCode" class="input-field" placeholder="Для входа в существующую" maxlength="5" style="text-transform:uppercase;">
              </div>

              <div class="grid-2">
                <button id="createBtn" class="btn btn-primary w-full"><span>Создать</span></button>
                <button id="joinBtn" class="btn btn-secondary w-full"><span>Войти</span></button>
              </div>
            </div>

            <button id="rulesOpenBtnAuth" class="btn btn-secondary w-full" style="margin-bottom: 12px;"><span>📋 Правила игры</span></button>
            <button id="exitToMenuBtnAuth" class="btn btn-secondary w-full"><span>🚪 Выйти в меню</span></button>
          </div>
        </div>

        <div id="gameScreen" class="hidden">
          <div class="game-header row">
            <div>
              <div class="game-title" style="margin-bottom:2px;">Квартет</div>
              <div class="game-subtitle" id="roomDisplay">Комната: —</div>
            </div>
            <button id="leaveBtn" class="btn btn-icon btn-secondary" style="background:rgba(255,255,255,.18); color:white; border:none;">✕</button>
          </div>

          <div id="loadingState" class="content-wrap hidden" style="text-align:center; padding-top:40px;">
            <div class="spinner spinner-dark"></div>
            <p id="loadingText" style="margin-top:16px; color:var(--text-muted); font-weight:600;">Подключение...</p>
          </div>

          <div id="lobby" class="hidden">
            <div class="content-wrap" style="padding-bottom:24px;">
              <div class="room-code-display">
                <div class="room-code-label">Код комнаты</div>
                <div class="room-code" id="roomCodeBig">—</div>
                <div class="copy-row">
                  <button id="copyCodeBtn" class="btn btn-secondary"><span>Скопировать код</span></button>
                </div>
                <div id="roomGuide"></div>
              </div>

              <div class="card-3d" style="padding:20px; margin-bottom:16px;">
                <div style="font-weight:900; margin-bottom:12px; color:var(--text-muted); text-transform:uppercase; font-size:12px; letter-spacing:.05em;">
                  Игроки <span id="playerCount">0</span>/8
                </div>
                <div id="playersList" style="display:flex; flex-direction:column; gap:8px;"></div>
              </div>

              <button id="startBtn" class="btn btn-primary w-full" disabled>Начать игру</button>
              <div style="text-align:center; margin-top:8px; font-size:12px; color:var(--text-muted);">
                Только хост может начать игру. Нужно 3–8 игроков.
              </div>
            </div>
          </div>

          <div id="activeGame" class="hidden">
            <div class="game-table">
              <div class="table-felt"></div>
              <div id="playersRing" class="players-ring"></div>
            </div>

            <div class="game-info-wrap">
              <div id="turnIndicator">Ожидание хода...</div>
              <div id="quartetsDisplay"></div>
            </div>

            <div class="hand-section">
              <div class="section-caption">Твои карты</div>
              <div id="handCards" class="cards-fan"></div>
            </div>

            <div class="action-panel">
              <div class="action-handle"></div>
              <div id="actionContent">
                <div class="action-empty">
                  <div class="spinner spinner-dark"></div>
                  <div class="action-title" style="margin-top:12px;">Загрузка...</div>
                </div>
              </div>
            </div>

            <div class="log-section">
              <div class="section-caption">Лог игры</div>
              <div id="gameLog" class="game-log"></div>
            </div>
          </div>
        </div>

        <div id="pendingModal" class="modal-overlay">
          <div class="modal-content">
            <h3 style="margin-bottom:16px; text-align:center;">Запрос карты</h3>
            <div id="pendingText" style="text-align:center; margin-bottom:24px;"></div>
            <div class="grid-2">
              <button id="pendingCloseBtn" class="btn btn-secondary w-full">Закрыть</button>
              <button id="giveBtn" class="btn btn-success w-full">Отдать карту</button>
            </div>
          </div>
        </div>

        <div id="waitOverlay" class="wait-overlay hidden">
          <div class="wait-box">
            <h3>Ожидание хода</h3>
            <p>Сейчас ходит: <span id="waitTurnName" class="wait-name">...</span></p>
            <button id="waitShowCardsBtn" class="btn btn-primary w-full">Показать мои карты</button>
          </div>
        </div>

        <button id="waitBackBtn" class="btn btn-primary wait-back hidden">Скрыть карты</button>

        <div id="rulesModal" class="modal-overlay">
          <div class="modal-content rules-scroll">
            <div class="rules-title">Правила игры «Квартет»</div>

            <div class="rules-intro">
              Это простая карточная игра. Твоя цель — собрать как можно больше полных наборов из 4 связанных карт. Такой полный набор называется <b>квартет</b>.
            </div>

            <div class="rules-section">
              <div class="rules-section-title">1. В чём смысл игры</div>
              <ul class="rules-list">
                <li>Все карты разбиты на группы по 4 карты.</li>
                <li>Твоя задача — собрать у себя все 4 карты одной группы.</li>
                <li>Каждая полностью собранная четвёрка приносит тебе 1 квартет.</li>
                <li>Побеждает тот, кто соберёт больше квартетов к концу игры.</li>
              </ul>
            </div>

            <div class="rules-section">
              <div class="rules-section-title">2. Как начать игру</div>
              <ul class="rules-list">
                <li>Один игрок создаёт лобби.</li>
                <li>После создания появляется код комнаты.</li>
                <li>Этот код нужно отправить другим игрокам.</li>
                <li>Остальные вводят код и нажимают «Войти».</li>
                <li>Когда игроков достаточно, хост нажимает «Начать игру».</li>
              </ul>
              <div class="rules-tip">Хост — это создатель комнаты. Только он запускает игру.</div>
            </div>

            <div class="rules-section">
              <div class="rules-section-title">3. Как проходит ход</div>
              <ul class="rules-list">
                <li>В свой ход ты выбираешь игрока.</li>
                <li>Потом выбираешь карту, которую хочешь попросить.</li>
                <li>Просить можно только карты из группы, которой ты уже частично владеешь.</li>
                <li>То есть у тебя уже должна быть хотя бы 1 карта из этой четвёрки.</li>
              </ul>
            </div>

            <div class="rules-section">
              <div class="rules-section-title">4. Что происходит после запроса</div>
              <ul class="rules-list">
                <li>Если у выбранного игрока есть карта, он отдаёт её тебе.</li>
                <li>Если карты нет — запрос считается неудачным.</li>
                <li>Когда нужная карта получена, ты приближаешься к полному квартету.</li>
              </ul>
              <div class="rules-tip">Следи за логом игры — по нему удобно понимать, у кого какие группы могут быть.</div>
            </div>

            <div class="rules-section">
              <div class="rules-section-title">5. Как собирается квартет</div>
              <ul class="rules-list">
                <li>Как только у тебя оказываются все 4 карты одной группы, эта группа считается собранной.</li>
                <li>За неё ты получаешь 1 квартет.</li>
                <li>Чем больше квартетов — тем ближе победа.</li>
              </ul>
            </div>

            <div class="rules-section">
              <div class="rules-section-title">6. Самая простая стратегия</div>
              <ul class="rules-list">
                <li>Сначала добивай группы, где у тебя уже 2 или 3 карты.</li>
                <li>Не распыляйся на слишком много разных групп сразу.</li>
                <li>Используй быстрый выбор в панели действий — он поднимает самые выгодные группы выше.</li>
              </ul>
            </div>

            <button id="rulesCloseBtn" class="btn btn-primary w-full mt-4">Понятно</button>
          </div>
        </div>

        <div id="toast" class="toast"></div>
      </div>
    `;

    ui.statusBar = document.getElementById('statusBar');
    ui.toast = document.getElementById('toast');
    ui.authScreen = document.getElementById('authScreen');
    ui.gameScreen = document.getElementById('gameScreen');
    ui.loadingState = document.getElementById('loadingState');
    ui.loadingText = document.getElementById('loadingText');
    ui.lobby = document.getElementById('lobby');
    ui.activeGame = document.getElementById('activeGame');
    ui.playerName = document.getElementById('playerName');
    ui.roomCode = document.getElementById('roomCode');
    ui.createBtn = document.getElementById('createBtn');
    ui.joinBtn = document.getElementById('joinBtn');
    ui.rulesOpenBtnAuth = document.getElementById('rulesOpenBtnAuth');
    ui.exitToMenuBtnAuth = document.getElementById('exitToMenuBtnAuth');
    ui.leaveBtn = document.getElementById('leaveBtn');
    ui.roomDisplay = document.getElementById('roomDisplay');
    ui.roomCodeBig = document.getElementById('roomCodeBig');
    ui.copyCodeBtn = document.getElementById('copyCodeBtn');
    ui.roomGuide = document.getElementById('roomGuide');
    ui.playerCount = document.getElementById('playerCount');
    ui.playersList = document.getElementById('playersList');
    ui.startBtn = document.getElementById('startBtn');
    ui.playersRing = document.getElementById('playersRing');
    ui.turnIndicator = document.getElementById('turnIndicator');
    ui.quartetsDisplay = document.getElementById('quartetsDisplay');
    ui.handCards = document.getElementById('handCards');
    ui.actionContent = document.getElementById('actionContent');
    ui.gameLog = document.getElementById('gameLog');
    ui.pendingModal = document.getElementById('pendingModal');
    ui.pendingText = document.getElementById('pendingText');
    ui.pendingCloseBtn = document.getElementById('pendingCloseBtn');
    ui.giveBtn = document.getElementById('giveBtn');
    ui.waitOverlay = document.getElementById('waitOverlay');
    ui.waitTurnName = document.getElementById('waitTurnName');
    ui.waitShowCardsBtn = document.getElementById('waitShowCardsBtn');
    ui.waitBackBtn = document.getElementById('waitBackBtn');
    ui.rulesModal = document.getElementById('rulesModal');
    ui.rulesCloseBtn = document.getElementById('rulesCloseBtn');

    ui.playerName.value = myName;
    ui.roomCode.value = roomId;
    updateHeaderRoom();

    ui.createBtn.addEventListener('click', onCreateRoom);
    ui.joinBtn.addEventListener('click', onJoinRoom);
    ui.leaveBtn.addEventListener('click', onLeave);
    ui.copyCodeBtn.addEventListener('click', copyRoomCode);
    ui.startBtn.addEventListener('click', onStartGame);
    ui.giveBtn.addEventListener('click', onGiveCard);
    ui.pendingCloseBtn.addEventListener('click', closePending);
    ui.waitShowCardsBtn.addEventListener('click', () => handleWaitViewToggle(true));
    ui.waitBackBtn.addEventListener('click', () => handleWaitViewToggle(false));
    ui.rulesOpenBtnAuth.addEventListener('click', openRulesModal);
    ui.rulesCloseBtn.addEventListener('click', closeRulesModal);
    
    if (ui.exitToMenuBtnAuth) {
      ui.exitToMenuBtnAuth.addEventListener('click', () => {
        if (typeof goToMainMenu === 'function') {
          goToMainMenu();
        } else if (window.Telegram && window.Telegram.WebApp) {
          window.Telegram.WebApp.close();
        }
      });
    }

    ui.pendingModal.addEventListener('click', (e) => {
      if (e.target === ui.pendingModal) closePending();
    });

    ui.rulesModal.addEventListener('click', (e) => {
      if (e.target === ui.rulesModal) closeRulesModal();
    });

    syncWaitButtons();
  }

  (function init() {
    renderShell();

    if (roomId) {
      switchScreen('loading');
      setReconnectLoading(true, 'Загрузка лобби...');
      startPolling();
    } else {
      switchScreen('auth');
      setAuthButtonsIdle();
    }
  })();
}

window.startQuartetGame = startQuartetGame;
