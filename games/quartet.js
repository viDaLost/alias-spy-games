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
    ui.startBtn.textContent = canStart ? 'Начать игру' : 'Начать игру может только хост';
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
    
    // Скрываем форму входа при подключении
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
      ui.hand.innerHTML = '<div class="quartet-muted" style="text-align:center; padding: 20px;">У тебя пока нет карт.</div>';
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

    // НОВЫЙ КОМПАКТНЫЙ ДИЗАЙН: Группа квартета -> Внутри пилюли с картами
    ui.hand.innerHTML = groups.map(group => {
      const chipsHtml = group.cards.sort((a, b) => a.title.localeCompare(b.title, 'ru')).map(c => `
        <span class="q-card-chip">${escapeHtml(c.title)}</span>
      `).join('');

      return `
        <div class="q-quartet-group">
          <div class="q-quartet-header">${escapeHtml(group.quartet.name)}</div>
          <div class="q-card-chips">${chipsHtml}</div>
        </div>
      `;
    }).join('');
  }

  function renderAskPanel(st) {
    if (st.status !== 'playing') { ui.askPanel.innerHTML = '<div class="quartet-muted">Игра завершена
