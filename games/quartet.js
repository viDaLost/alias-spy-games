// games/quartet_modern.js
// Обновленная версия онлайн-игры «Квартет» для Telegram WebApp
// Клиент для Google Apps Script WebApp с новым UI

function startQuartetGame() {
  const container = document.getElementById('game-container');
  if (!container) return;

  // Инициализация Telegram WebApp
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (tg) {
    try {
      tg.expand();
      tg.enableClosingConfirmation();
    } catch (e) {}
  }

  // Настройка профиля игрока
  let tgUser = {};
  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    tgUser = tg.initDataUnsafe.user;
  } else if (typeof getTelegramUser === 'function') {
    tgUser = getTelegramUser() || {};
  }

  let playerId = localStorage.getItem('quartet_player_id');
  if (!playerId) {
    playerId = 'p_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    localStorage.setItem('quartet_player_id', playerId);
  }

  const defaultName = (tgUser.first_name || tgUser.username)
    ? String(tgUser.first_name || tgUser.username).trim()
    : 'Игрок';
  
  let playerName = localStorage.getItem('quartet_player_name') || defaultName;
  let roomId = '';
  
  // Состояние игры
  let gameState = null;
  let lastVersion = -1;
  let pollTimer = null;
  let isHost = false;
  let selectedCardId = null;
  let selectedCardTitle = '';

  const GAS_URL = 'https://script.google.com/macros/s/AKfycby7mfu5zwKSY1IShcpzddZB0XKCo70CTpEhrSpbZjJsWgcse__9Cx7sibo5hmfc4heJ/exec';

  const gameData = {
    quartets: [
      { id: 'apostles', name: 'Апостолы', icon: '⛪', cards: [{ id: 'apostles_peter', title: 'Пётр' }, { id: 'apostles_john', title: 'Иоанн' }, { id: 'apostles_james', title: 'Иаков' }, { id: 'apostles_andrew', title: 'Андрей' }]},
      { id: 'evangelists', name: 'Евангелисты', icon: '📖', cards: [{ id: 'evangelists_matthew', title: 'Матфей' }, { id: 'evangelists_mark', title: 'Марк' }, { id: 'evangelists_luke', title: 'Лука' }, { id: 'evangelists_john', title: 'Иоанн' }]},
      { id: 'patriarchs', name: 'Патриархи', icon: '👑', cards: [{ id: 'patriarchs_abraham', title: 'Авраам' }, { id: 'patriarchs_isaac', title: 'Исаак' }, { id: 'patriarchs_jacob', title: 'Иаков' }, { id: 'patriarchs_joseph', title: 'Иосиф' }]},
      { id: 'prophets', name: 'Пророки', icon: '🔮', cards: [{ id: 'prophets_isaiah', title: 'Исаия' }, { id: 'prophets_jeremiah', title: 'Иеремия' }, { id: 'prophets_ezekiel', title: 'Иезекииль' }, { id: 'prophets_daniel', title: 'Даниил' }]},
      { id: 'judges', name: 'Судьи', icon: '⚖️', cards: [{ id: 'judges_deborah', title: 'Девора' }, { id: 'judges_gideon', title: 'Гедеон' }, { id: 'judges_samson', title: 'Самсон' }, { id: 'judges_jephthah', title: 'Иеффай' }]},
      { id: 'kings', name: 'Цари', icon: '🏰', cards: [{ id: 'kings_saul', title: 'Саул' }, { id: 'kings_david', title: 'Давид' }, { id: 'kings_solomon', title: 'Соломон' }, { id: 'kings_hezekiah', title: 'Езекия' }]},
      { id: 'women', name: 'Жёны веры', icon: '👸', cards: [{ id: 'women_sarah', title: 'Сарра' }, { id: 'women_rebekah', title: 'Ревекка' }, { id: 'women_rachel', title: 'Рахиль' }, { id: 'women_leah', title: 'Лия' }]},
      { id: 'heroes', name: 'Героини', icon: '🌟', cards: [{ id: 'heroes_ruth', title: 'Руфь' }, { id: 'heroes_esther', title: 'Есфирь' }, { id: 'heroes_mary', title: 'Мария' }, { id: 'heroes_anna', title: 'Анна' }]},
      { id: 'paulteam', name: 'Команда Павла', icon: '🤝', cards: [{ id: 'paulteam_barnabas', title: 'Варнава' }, { id: 'paulteam_silas', title: 'Сила' }, { id: 'paulteam_timothy', title: 'Тимофей' }, { id: 'paulteam_titus', title: 'Тит' }]},
      { id: 'places', name: 'Города', icon: '🏛️', cards: [{ id: 'places_bethlehem', title: 'Вифлеем' }, { id: 'places_nazareth', title: 'Назарет' }, { id: 'places_capernaum', title: 'Капернаум' }, { id: 'places_jerusalem', title: 'Иерусалим' }]},
      { id: 'miracles', name: 'Чудеса', icon: '✨', cards: [{ id: 'miracles_water', title: 'Вода в вино' }, { id: 'miracles_bread', title: 'Накормил 5000' }, { id: 'miracles_storm', title: 'Утихомирил бурю' }, { id: 'miracles_lazarus', title: 'Воскресил Лазаря' }]},
      { id: 'armor', name: 'Всеоружие', icon: '🛡️', cards: [{ id: 'armor_belt', title: 'Пояс истины' }, { id: 'armor_breastplate', title: 'Броня праведности' }, { id: 'armor_shield', title: 'Щит веры' }, { id: 'armor_helmet', title: 'Шлем спасения' }]}
    ]
  };

  // --- Утилиты ---
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showToast(message, type = 'info') {
    const toast = document.getElementById('q_toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function showStatus(message, type = 'info') {
    const bar = document.getElementById('q_statusBar');
    if (!bar) return;
    bar.textContent = message;
    bar.className = 'status-bar show ' + type;
    setTimeout(() => bar.classList.remove('show'), 3000);
  }

  function switchScreen(screenName) {
    ['q_authScreen', 'q_gameScreen', 'q_loadingState', 'q_lobby', 'q_activeGame'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    if (screenName === 'auth') {
      document.getElementById('q_authScreen').classList.remove('hidden');
    } else {
      document.getElementById('q_gameScreen').classList.remove('hidden');
      if (screenName === 'loading') document.getElementById('q_loadingState').classList.remove('hidden');
      if (screenName === 'lobby') document.getElementById('q_lobby').classList.remove('hidden');
      if (screenName === 'game') document.getElementById('q_activeGame').classList.remove('hidden');
    }
  }

  // --- API ---
  async function api(action, payload = {}) {
    const body = { action, roomId, playerId, name: playerName, ...payload };
    try {
      const res = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow'
      });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : null;
      if (!res.ok || !data || data.ok === false) {
        throw new Error(data?.error || 'Ошибка сервера');
      }
      return data;
    } catch (e) {
      showToast(e.message, 'error');
      throw e;
    }
  }

  // --- Логика комнат ---
  async function createRoom() {
    const nameInput = document.getElementById('q_playerName');
    playerName = nameInput.value.trim() || 'Игрок';
    localStorage.setItem('quartet_player_name', playerName);
    
    try {
      const res = await api('createRoom');
      roomId = res.roomId;
      enterRoom();
    } catch (e) {
      console.error(e);
    }
  }

  async function joinRoom() {
    const codeInput = document.getElementById('q_roomCode');
    const code = codeInput.value.trim().toUpperCase();
    if (!code) {
      showToast('Введи код комнаты', 'error');
      return;
    }

    const nameInput = document.getElementById('q_playerName');
    playerName = nameInput.value.trim() || 'Игрок';
    localStorage.setItem('quartet_player_name', playerName);
    roomId = code;

    try {
      await api('joinRoom', { roomId });
      enterRoom();
    } catch (e) {
      roomId = '';
    }
  }

  function enterRoom() {
    document.getElementById('q_roomDisplay').textContent = 'Комната: ' + roomId;
    document.getElementById('q_roomCodeBig').textContent = roomId;
    switchScreen('loading');
    startPolling();
  }

  async function leaveRoom() {
    if (!confirm('Точно хочешь выйти?')) return;
    
    stopPolling();
    try { await api('leave'); } catch (e) {}
    
    roomId = '';
    gameState = null;
    switchScreen('auth');
  }

  function copyRoomCode() {
    if (!roomId) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(roomId).then(() => {
        showToast('Код скопирован!');
      });
    } else {
      // Фолбэк
      const ta = document.createElement('textarea');
      ta.value = roomId;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Код скопирован!');
    }
  }

  // --- Игровые действия ---
  async function startGame() {
    try {
      await api('startGame');
      showToast('Игра начинается!');
    } catch (e) {}
  }

  async function askCard(targetId, cardId) {
    try {
      await api('askCard', { targetId, cardId });
      showToast('Запрос отправлен');
    } catch (e) {}
  }

  async function giveCard() {
    try {
      await api('giveCard', { pendingId: gameState.pending?.pendingId });
      closePending();
    } catch (e) {}
  }

  async function declineCard() {
    closePending();
  }

  // --- Polling ---
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const res = await api('getState');
        updateGameState(res.state);
      } catch (e) {
        console.error('Poll error:', e);
      }
    }, 1500);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  // --- Обновление UI ---
  function updateGameState(state) {
    if (!state) return;
    
    const versionChanged = state.version !== lastVersion;
    lastVersion = state.version;
    gameState = state;

    if (state.status === 'lobby') {
      if (document.getElementById('q_lobby').classList.contains('hidden')) switchScreen('lobby');
      updateLobby(state);
    } else {
      if (document.getElementById('q_activeGame').classList.contains('hidden')) switchScreen('game');
      updateGame(state);
    }

    if (state.pending?.status === 'waiting' && String(state.pending.targetId) === String(playerId)) {
      showPending(state.pending);
    } else {
      closePending();
    }
  }

  function updateLobby(state) {
    const players = state.players || [];
    const me = players.find(p => String(p.playerId) === String(playerId));
    isHost = me?.isHost || false;

    document.getElementById('q_playerCount').textContent = players.length;
    
    const startBtn = document.getElementById('q_startBtn');
    startBtn.disabled = !isHost || players.length < 3 || players.length > 8;
    startBtn.textContent = isHost ? 'Начать игру' : 'Ожидание хоста...';

    const list = document.getElementById('q_playersList');
    list.innerHTML = players.map(p => `
      <div class="flex items-center gap-2" style="padding: 12px; background: #f8fafc; border-radius: 12px;">
        <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 700;">
          ${escapeHtml(p.name).charAt(0).toUpperCase()}
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 700;">${escapeHtml(p.name)} ${String(p.playerId) === String(playerId) ? '(ты)' : ''}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${p.isHost ? '👑 Хост' : 'Игрок'}</div>
        </div>
        ${p.isActive === false ? '<span style="color: var(--text-muted);">вышел</span>' : ''}
      </div>
    `).join('');
  }

  function updateGame(state) {
    const myTurn = String(state.turnPlayerId) === String(playerId);
    const players = state.players || [];
    const me = players.find(p => String(p.playerId) === String(playerId)) || {};
    
    const turnEl = document.getElementById('q_turnIndicator');
    if (state.status === 'finished') {
      turnEl.textContent = 'Игра завершена!';
      turnEl.style.color = 'var(--success)';
    } else if (myTurn) {
      turnEl.textContent = 'Твой ход! Выбери карту для запроса';
      turnEl.style.color = 'var(--primary)';
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
      const turnPlayer = players.find(p => String(p.playerId) === String(state.turnPlayerId));
      turnEl.textContent = `Ходит: ${turnPlayer ? escapeHtml(turnPlayer.name) : '...'}`;
      turnEl.style.color = 'var(--text-muted)';
    }

    const ring = document.getElementById('q_playersRing');
    ring.innerHTML = players.map((p, idx) => {
      const isActive = String(p.playerId) === String(state.turnPlayerId);
      const isMe = String(p.playerId) === String(playerId);
      return `
        <div class="player-avatar ${isActive ? 'active' : ''}" style="animation-delay: ${idx * 0.1}s;">
          <div class="avatar-circle ${p.isHost ? 'host' : ''}" style="background: ${isMe ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' : ''}">
            ${escapeHtml(p.name).charAt(0).toUpperCase()}
          </div>
          <div class="player-info">
            <div>${escapeHtml(p.name)}</div>
            <div class="player-cards-count">🃏 ${p.cardsCount || 0} | 🏆 ${p.quartetsCount || 0}</div>
          </div>
        </div>
      `;
    }).join('');

    const quartetsEl = document.getElementById('q_quartetsDisplay');
    if (me.quartetsCount > 0) {
      let html = '';
      for (let i = 0; i < me.quartetsCount; i++) {
        html += `<div class="quartet-badge">🏆 Квартет ${i + 1}</div>`;
      }
      quartetsEl.innerHTML = html;
    } else {
      quartetsEl.innerHTML = '<div style="color: var(--text-muted); font-size: 14px;">Пока нет квартетов</div>';
    }

    renderHand(state, me.hand || [], myTurn);
    renderActionPanel(state, myTurn);
  }

  function renderHand(state, hand, myTurn) {
    const container = document.getElementById('q_handCards');
    const groups = {};
    
    gameData.quartets.forEach(q => {
      groups[q.id] = { ...q, owned: [], missing: [...q.cards] };
    });

    hand.forEach(cardId => {
      for (const q of gameData.quartets) {
        const card = q.cards.find(c => c.id === cardId);
        if (card) {
          groups[q.id].owned.push(card);
          groups[q.id].missing = groups[q.id].missing.filter(m => m.id !== cardId);
          break;
        }
      }
    });

    let html = '';
    Object.values(groups).forEach((group, idx) => {
      if (group.owned.length === 0) return;
      const isComplete = group.owned.length === 4;
      
      html += `
        <div class="card-wrapper" style="${isComplete ? 'animation: float 3s ease-in-out infinite;' : ''}">
          <div class="playing-card ${isComplete ? 'card-collected' : 'owned'}" style="${isComplete ? 'border-color: #fbbf24;' : ''}">
            <div class="card-header">
              <div class="card-icon">${group.icon}</div>
              <div class="card-number">${group.owned.length}/4</div>
            </div>
            <div class="card-content">
              <div class="card-title">${escapeHtml(group.name)}</div>
            </div>
            <div class="card-footer">
              ${isComplete ? 'Собрано!' : 'Нужно: ' + group.missing.map(m => escapeHtml(m.title)).join(', ')}
            </div>
          </div>
        </div>
      `;
    });

    if (html === '') {
      html = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">У тебя пока нет карт</div>';
    }
    container.innerHTML = html;
  }

  function renderActionPanel(state, myTurn) {
    const panel = document.getElementById('q_actionContent');
    
    if (!myTurn) {
      panel.innerHTML = `
        <div class="text-center" style="padding: 20px; color: var(--text-muted);">
          <div style="font-size: 48px; margin-bottom: 12px;">⏳</div>
          <div style="font-weight: 700; font-size: 18px; margin-bottom: 8px;">Ожидание хода</div>
          <div>Сейчас ходит другой игрок. Ты можешь наблюдать за игрой.</div>
        </div>
      `;
      return;
    }

    if (state.pending?.status === 'waiting') {
      panel.innerHTML = `
        <div class="text-center" style="padding: 20px;">
          <div class="spinner" style="margin: 0 auto; border-color: var(--primary-light); border-top-color: var(--primary);"></div>
          <div style="margin-top: 12px; color: var(--text-muted);">Ожидаем ответ...</div>
        </div>
      `;
      return;
    }

    const hand = state.me?.hand || [];
    const eligibleGroups = [];
    
    gameData.quartets.forEach(q => {
      const owned = hand.filter(cardId => q.cards.some(c => c.id === cardId));
      if (owned.length > 0 && owned.length < 4) {
        const missing = q.cards.filter(c => !hand.includes(c.id));
        eligibleGroups.push({ ...q, owned, missing });
      }
    });

    if (eligibleGroups.length === 0) {
      panel.innerHTML = '<div class="text-center" style="padding: 20px; color: var(--text-muted);">Нет доступных карт для запроса</div>';
      return;
    }

    let html = `
      <div style="font-weight: 700; margin-bottom: 12px;">Выбери карту для запроса:</div>
      <div class="flex flex-col gap-2" style="max-height: 40vh; overflow-y: auto;">
    `;

    eligibleGroups.forEach(group => {
      html += `
        <div style="background: #f8fafc; padding: 16px; border-radius: 12px; border: 2px solid #e2e8f0;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-weight: 700; color: var(--text);">
            <span>${group.icon}</span>
            <span>${escapeHtml(group.name)}</span>
            <span style="margin-left: auto; color: var(--primary);">${group.owned.length}/4</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${group.missing.map(card => `
              <button class="btn btn-primary q-action-select-card" style="flex: 1; min-width: 120px; font-size: 14px; padding: 12px;" 
                      data-card-id="${escapeHtml(card.id)}" data-card-title="${escapeHtml(card.title)}">
                ${escapeHtml(card.title)}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    });
    html += '</div>';
    panel.innerHTML = html;
  }

  function renderTargetSelection(cardId, cardTitle) {
    selectedCardId = cardId;
    selectedCardTitle = cardTitle;
    
    const targets = gameState.players.filter(p => String(p.playerId) !== String(playerId) && p.isActive !== false);
    const panel = document.getElementById('q_actionContent');
    
    panel.innerHTML = `
      <div style="margin-bottom: 16px;">
        <button class="btn btn-secondary q-action-back" style="font-size: 14px;">← Назад</button>
      </div>
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 14px; color: var(--text-muted); margin-bottom: 8px;">Запрашиваем:</div>
        <div style="font-size: 20px; font-weight: 800; color: var(--primary);">${escapeHtml(cardTitle)}</div>
      </div>
      <div style="font-weight: 700; margin-bottom: 12px;">У кого спросить:</div>
      <div class="flex flex-col gap-2">
        ${targets.map(p => `
          <button class="btn btn-primary q-action-confirm-ask" style="justify-content: space-between;" 
                  data-target-id="${escapeHtml(String(p.playerId))}" data-target-name="${escapeHtml(p.name)}">
            <span>${escapeHtml(p.name)}</span>
            <span style="opacity: 0.8;">🃏 ${Number(p.cardsCount) || 0}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  function showPending(pending) {
    const modal = document.getElementById('q_pendingModal');
    const text = document.getElementById('q_pendingText');
    const giveBtn = document.getElementById('q_giveBtn');
    
    text.innerHTML = `
      <div style="font-size: 18px; margin-bottom: 8px;">Игрок <strong>${escapeHtml(pending.askerName)}</strong> просит:</div>
      <div style="font-size: 24px; font-weight: 800; color: var(--primary); margin: 16px 0;">${escapeHtml(pending.cardTitle || pending.cardId)}</div>
      <div style="color: var(--text-muted); font-size: 14px;">У тебя ${pending.targetHasCard ? 'есть эта карта' : 'нет этой карты'}</div>
    `;
    
    giveBtn.disabled = !pending.targetHasCard;
    giveBtn.style.opacity = pending.targetHasCard ? '1' : '0.5';
    modal.classList.add('active');
    
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
  }

  function closePending() {
    const modal = document.getElementById('q_pendingModal');
    if (modal) modal.classList.remove('active');
  }

  function showRules() {
    document.getElementById('q_rulesModal').classList.add('active');
  }

  function closeRules() {
    document.getElementById('q_rulesModal').classList.remove('active');
  }

  // --- Инициализация DOM и стилей ---
  function renderShell() {
    container.innerHTML = `
      <style>
        .q-root {
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
          
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%);
          color: var(--text);
          min-height: 100vh;
          overflow-x: hidden;
          padding-bottom: env(safe-area-inset-bottom);
        }

        .q-root * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

        @keyframes q-fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes q-slideIn { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes q-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes q-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes q-glow { 0%, 100% { box-shadow: 0 0 5px rgba(37, 99, 235, 0.5); } 50% { box-shadow: 0 0 20px rgba(37, 99, 235, 0.8), 0 0 40px rgba(37, 99, 235, 0.4); } }
        @keyframes q-cardDeal { 0% { transform: translateY(-100vh) rotate(0deg); opacity: 0; } 100% { transform: translateY(0) rotate(var(--rotation)); opacity: 1; } }
        @keyframes q-shimmer { 0% { background-position: -1000px 0; } 100% { background-position: 1000px 0; } }
        @keyframes q-spin { to { transform: rotate(360deg); } }

        .fade-in { animation: q-fadeIn 0.5s ease-out; }
        .slide-in { animation: q-slideIn 0.4s ease-out; }

        .game-header { background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; padding: 20px; text-align: center; position: sticky; top: 0; z-index: 100; box-shadow: var(--shadow-lg); }
        .game-title { font-size: 28px; font-weight: 900; letter-spacing: -0.5px; text-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-bottom: 4px; }
        .game-subtitle { font-size: 14px; opacity: 0.9; font-weight: 500; }

        .btn { border: none; border-radius: var(--radius); padding: 16px 24px; font-size: 16px; font-weight: 700; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 8px; position: relative; overflow: hidden; }
        .btn:active { transform: scale(0.96); }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-primary { background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4); }
        .btn-primary:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5); }
        .btn-secondary { background: white; color: var(--text); border: 2px solid #e2e8f0; }
        .btn-secondary:not(:disabled):hover { background: #f8fafc; border-color: var(--primary-light); }
        .btn-success { background: linear-gradient(135deg, var(--success) 0%, #059669 100%); color: white; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4); }
        .btn-icon { width: 48px; height: 48px; padding: 0; border-radius: 50%; }

        .card-3d { background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border-radius: var(--radius); box-shadow: 0 2px 4px rgba(0,0,0,0.05), 0 4px 8px rgba(0,0,0,0.05), 0 8px 16px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8); border: 1px solid rgba(226, 232, 240, 0.8); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden; }
        .card-3d::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, var(--primary-light), var(--primary)); opacity: 0.5; }
        .card-3d:hover { transform: translateY(-4px) rotateX(5deg); box-shadow: 0 8px 16px rgba(0,0,0,0.1), 0 16px 32px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.9); }

        .playing-card { width: 100%; aspect-ratio: 3/4; border-radius: var(--radius-sm); background: white; box-shadow: 0 1px 2px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,1); border: 1px solid #e2e8f0; display: flex; flex-direction: column; padding: 12px; position: relative; transition: all 0.3s; cursor: default; }
        .playing-card.owned { background: linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%); border-color: #bfdbfe; }
        .card-collected { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-color: #fbbf24; animation: q-glow 2s infinite; }
        .card-collected::before { content:''; position: absolute; top:0; left:0; right:0; height:4px; background: linear-gradient(90deg, #fbbf24, #f59e0b); }
        
        .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .card-icon { width: 32px; height: 32px; background: var(--primary-light); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .card-number { font-size: 12px; font-weight: 800; color: var(--text-muted); background: #f1f5f9; padding: 2px 8px; border-radius: 999px; }
        .card-content { flex: 1; display: flex; flex-direction: column; justify-content: center; }
        .card-title { font-size: 14px; font-weight: 800; color: var(--text); line-height: 1.2; text-align: center; }
        .card-footer { margin-top: 8px; text-align: center; font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }

        .game-table { background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%); min-height: 300px; border-radius: 24px; margin: 16px; padding: 20px; position: relative; box-shadow: inset 0 2px 4px rgba(0,0,0,0.3), 0 20px 40px rgba(0,0,0,0.2); border: 4px solid rgba(255,255,255,0.1); }
        .table-felt { position: absolute; inset: 0; background-image: radial-gradient(circle at 20% 80%, rgba(255,255,255,0.03) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.03) 0%, transparent 50%); pointer-events: none; }
        .players-ring { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 12px; position: relative; z-index: 1; }
        .player-avatar { display: flex; flex-direction: column; align-items: center; gap: 8px; transition: all 0.3s; }
        .player-avatar.active { transform: scale(1.1); }
        .player-avatar.active .avatar-circle { box-shadow: 0 0 0 4px var(--warning), 0 0 20px rgba(245, 158, 11, 0.5); animation: q-pulse 2s infinite; }
        .avatar-circle { width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #475569 0%, #334155 100%); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; color: white; border: 3px solid rgba(255,255,255,0.2); box-shadow: var(--shadow); position: relative; }
        .avatar-circle.host::after { content: '👑'; position: absolute; bottom: -4px; right: -4px; font-size: 16px; background: var(--warning); border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border: 2px solid white; }
        .player-info { text-align: center; color: white; font-size: 12px; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
        .player-cards-count { background: rgba(0,0,0,0.3); padding: 2px 8px; border-radius: 999px; margin-top: 2px; display: inline-block; }

        .hand-container { perspective: 1000px; padding: 20px; }
        .cards-fan { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; transform-style: preserve-3d; }
        .card-wrapper { flex: 0 0 calc(25% - 9px); min-width: 140px; max-width: 200px; transition: all 0.3s; animation: q-cardDeal 0.5s ease-out backwards; }
        .card-wrapper:nth-child(1) { --rotation: -2deg; animation-delay: 0.1s; }
        .card-wrapper:nth-child(2) { --rotation: 1deg; animation-delay: 0.15s; }
        .card-wrapper:nth-child(3) { --rotation: -1deg; animation-delay: 0.2s; }
        .card-wrapper:nth-child(4) { --rotation: 2deg; animation-delay: 0.25s; }
        .card-wrapper:hover { z-index: 10; transform: translateY(-8px) scale(1.05); }

        .quartet-badge { display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: white; padding: 8px 16px; border-radius: 999px; font-weight: 800; font-size: 14px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4); animation: q-float 3s ease-in-out infinite; border: 2px solid rgba(255,255,255,0.3); }

        .action-panel { background: white; border-radius: 24px 24px 0 0; padding: 24px; box-shadow: 0 -10px 40px rgba(0,0,0,0.1); position: fixed; bottom: 0; left: 0; right: 0; max-height: 60vh; overflow-y: auto; z-index: 50; transform: translateY(0); transition: transform 0.3s; }
        .action-handle { width: 40px; height: 4px; background: #e2e8f0; border-radius: 2px; margin: 0 auto 16px; }

        .input-group { margin-bottom: 16px; }
        .input-label { display: block; font-size: 14px; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em; }
        .input-field { width: 100%; padding: 16px; border: 2px solid #e2e8f0; border-radius: var(--radius); font-size: 16px; font-weight: 600; transition: all 0.2s; background: #f8fafc; }
        .input-field:focus { outline: none; border-color: var(--primary); background: white; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }

        .room-code-display { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; padding: 24px; border-radius: var(--radius); text-align: center; position: relative; overflow: hidden; margin: 16px 0; cursor: pointer; }
        .room-code-display::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent); animation: q-shimmer 3s infinite; }
        .room-code-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.7; margin-bottom: 8px; }
        .room-code { font-size: 36px; font-weight: 900; letter-spacing: 0.2em; font-family: 'Courier New', monospace; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }

        .status-bar { position: fixed; top: 0; left: 0; right: 0; padding: 12px 20px; background: var(--primary); color: white; font-weight: 600; font-size: 14px; z-index: 1000; transform: translateY(-100%); transition: transform 0.3s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .status-bar.show { transform: translateY(0); }
        .status-bar.error { background: var(--danger); }
        .status-bar.success { background: var(--success); }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
        .modal-overlay.active { opacity: 1; pointer-events: all; }
        .modal-content { background: white; border-radius: 24px; padding: 28px; width: 100%; max-width: 400px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); transform: scale(0.9); transition: transform 0.3s; }
        .modal-overlay.active .modal-content { transform: scale(1); }

        .hidden { display: none !important; }
        .text-center { text-align: center; }
        .mb-4 { margin-bottom: 16px; }
        .mt-4 { margin-top: 16px; }
        .flex { display: flex; }
        .flex-col { flex-direction: column; }
        .gap-2 { gap: 8px; }
        .gap-4 { gap: 16px; }
        .w-full { width: 100%; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .spinner { width: 24px; height: 24px; border: 3px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: q-spin 1s linear infinite; }
        .toast { position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%) translateY(100px); background: #1e293b; color: white; padding: 16px 24px; border-radius: var(--radius); font-weight: 600; box-shadow: var(--shadow-lg); z-index: 2000; opacity: 0; transition: all 0.3s; }
        .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
        .toast.success { background: var(--success); }
        .toast.error { background: var(--danger); }

        @media (max-width: 640px) {
          .card-wrapper { flex: 0 0 calc(50% - 6px); min-width: unset; }
          .game-title { font-size: 24px; }
          .room-code { font-size: 28px; }
        }
      </style>

      <div class="q-root">
        <div id="q_statusBar" class="status-bar"></div>

        <div id="q_authScreen" class="fade-in">
          <div class="game-header">
            <div class="game-title">🃏 Квартет</div>
            <div class="game-subtitle">Собери 4 карты одной группы</div>
          </div>
          <div style="padding: 24px; max-width: 480px; margin: 0 auto;">
            <div class="card-3d" style="padding: 24px; margin-bottom: 20px;">
              <div class="input-group">
                <label class="input-label">Твоё имя</label>
                <input type="text" id="q_playerName" class="input-field" placeholder="Введи имя" maxlength="20">
              </div>
              <div class="input-group">
                <label class="input-label">Код комнаты</label>
                <input type="text" id="q_roomCode" class="input-field" placeholder="Для входа в существующую" maxlength="5" style="text-transform: uppercase;">
              </div>
              <div class="grid-2">
                <button id="q_btn_create" class="btn btn-primary w-full"><span>Создать</span></button>
                <button id="q_btn_join" class="btn btn-secondary w-full"><span>Войти</span></button>
              </div>
            </div>
            <button id="q_btn_rules_open" class="btn btn-secondary w-full"><span>📋 Правила игры</span></button>
          </div>
        </div>

        <div id="q_gameScreen" class="hidden">
          <div class="game-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div class="game-title">Квартет</div>
              <div class="game-subtitle" id="q_roomDisplay">Комната: —</div>
            </div>
            <button id="q_btn_leave" class="btn btn-icon btn-secondary" style="background: rgba(255,255,255,0.2); color: white; border: none;">✕</button>
          </div>

          <div id="q_loadingState" class="text-center" style="padding: 40px;">
            <div class="spinner" style="margin: 0 auto; border-color: var(--primary-light); border-top-color: var(--primary);"></div>
            <p style="margin-top: 16px; color: var(--text-muted);">Подключение...</p>
          </div>

          <div id="q_lobby" class="hidden">
            <div style="padding: 16px;">
              <div id="q_room_code_box" class="room-code-display">
                <div class="room-code-label">Код комнаты</div>
                <div class="room-code" id="q_roomCodeBig">—</div>
                <div style="margin-top: 8px; font-size: 12px; opacity: 0.7;">Нажми, чтобы скопировать</div>
              </div>
              <div class="card-3d" style="padding: 20px; margin-bottom: 16px;">
                <div style="font-weight: 800; margin-bottom: 12px; color: var(--text-muted); text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em;">
                  Игроки <span id="q_playerCount">0</span>/8
                </div>
                <div id="q_playersList" class="flex flex-col gap-2"></div>
              </div>
              <button id="q_startBtn" class="btn btn-primary w-full" disabled>Начать игру</button>
              <div style="text-align: center; margin-top: 8px; font-size: 12px; color: var(--text-muted);">
                Только хост может начать игру (нужно 3–8 игроков)
              </div>
            </div>
          </div>

          <div id="q_activeGame" class="hidden">
            <div class="game-table">
              <div class="table-felt"></div>
              <div id="q_playersRing" class="players-ring"></div>
            </div>
            <div style="padding: 16px; text-align: center;">
              <div id="q_turnIndicator" style="font-size: 18px; font-weight: 800; color: var(--text); margin-bottom: 8px;">Ожидание хода...</div>
              <div id="q_quartetsDisplay" style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;"></div>
            </div>
            <div class="hand-container">
              <div style="font-weight: 800; margin-bottom: 12px; color: var(--text-muted); text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; text-align: center;">Твои карты</div>
              <div id="q_handCards" class="cards-fan"></div>
            </div>
            <div id="q_actionPanel" class="action-panel">
              <div class="action-handle"></div>
              <div id="q_actionContent"><div class="text-center" style="color: var(--text-muted); padding: 20px;">Загрузка...</div></div>
            </div>
          </div>
        </div>

        <div id="q_pendingModal" class="modal-overlay">
          <div class="modal-content">
            <h3 style="margin-bottom: 16px; text-align: center;">Запрос карты</h3>
            <div id="q_pendingText" style="text-align: center; margin-bottom: 24px;"></div>
            <div class="flex gap-4">
              <button id="q_declineBtn" class="btn btn-secondary w-full">Нет карты</button>
              <button id="q_giveBtn" class="btn btn-success w-full">Отдать карту</button>
            </div>
          </div>
        </div>

        <div id="q_rulesModal" class="modal-overlay">
          <div class="modal-content" style="max-width: 500px; max-height: 80vh; overflow-y: auto;">
            <h2 style="margin-bottom: 20px;">Правила игры</h2>
            <div style="line-height: 1.6; color: var(--text-muted);">
              <p style="margin-bottom: 16px;"><strong>Цель:</strong> Собрать как можно больше квартетов (4 карты одной группы).</p>
              <p style="margin-bottom: 8px;"><strong>Как играть:</strong></p>
              <ul style="margin-left: 20px; margin-bottom: 16px;">
                <li>В свой ход выбери игрока и попроси у него нужную карту</li>
                <li>Можно просить только карты из групп, которые у тебя уже есть</li>
                <li>Если у игрока есть карта — он отдаёт её тебе</li>
                <li>Собери 4 карты одной группы — получи квартет!</li>
              </ul>
              <p style="margin-bottom: 16px;"><strong>Подсказка:</strong> Следи за тем, какие карты просят другие игроки — это поможет понять, что есть у соперников.</p>
            </div>
            <button id="q_btn_rules_close" class="btn btn-primary w-full mt-4">Понятно</button>
          </div>
        </div>

        <div id="q_toast" class="toast"></div>
      </div>
    `;

    // --- Привязка событий ---
    document.getElementById('q_playerName').value = playerName;

    document.getElementById('q_btn_create').addEventListener('click', createRoom);
    document.getElementById('q_btn_join').addEventListener('click', joinRoom);
    document.getElementById('q_btn_rules_open').addEventListener('click', showRules);
    document.getElementById('q_btn_rules_close').addEventListener('click', closeRules);
    document.getElementById('q_btn_leave').addEventListener('click', leaveRoom);
    document.getElementById('q_room_code_box').addEventListener('click', copyRoomCode);
    document.getElementById('q_startBtn').addEventListener('click', startGame);
    document.getElementById('q_giveBtn').addEventListener('click', giveCard);
    document.getElementById('q_declineBtn').addEventListener('click', declineCard);

    // Закрытие модалок по клику на фон
    document.getElementById('q_pendingModal').addEventListener('click', (e) => {
      if (e.target.id === 'q_pendingModal') closePending();
    });
    document.getElementById('q_rulesModal').addEventListener('click', (e) => {
      if (e.target.id === 'q_rulesModal') closeRules();
    });

    // Делегирование событий для динамической панели действий
    document.getElementById('q_actionContent').addEventListener('click', (e) => {
      const selectBtn = e.target.closest('.q-action-select-card');
      if (selectBtn) {
        renderTargetSelection(selectBtn.dataset.cardId, selectBtn.dataset.cardTitle);
        return;
      }

      const confirmBtn = e.target.closest('.q-action-confirm-ask');
      if (confirmBtn) {
        const targetId = confirmBtn.dataset.targetId;
        const targetName = confirmBtn.dataset.targetName;
        if (confirm(`Попросить "${selectedCardTitle}" у игрока ${targetName}?`)) {
          askCard(targetId, selectedCardId);
        }
        return;
      }

      const backBtn = e.target.closest('.q-action-back');
      if (backBtn) {
        renderActionPanel(gameState, true);
        return;
      }
    });

    // Предупреждение о выходе
    window.addEventListener('beforeunload', (e) => {
      if (roomId) {
        e.preventDefault();
        e.returnValue = 'Игра будет прервана. Точно выйти?';
      }
    });
  }

  // --- Запуск ---
  renderShell();

  // Если был сохранен roomId, пробуем переподключиться
  if (roomId) { // (тут roomId пустой при старте, но если нужно восстанавливать сессию, можно достать из LS)
     // Для чистого старта по твоей логике roomId изначально пустой
  }
}
