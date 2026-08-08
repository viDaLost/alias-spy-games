// games/quartet.js — Quartet v2, Cloudflare Workers + Durable Objects + WebSocket

function startQuartetGame(catalogUrl = 'data/quartet_bible.json') {
  const container = document.getElementById('game-container');
  if (!container) return;

  const tg = window.Telegram?.WebApp || null;
  try { tg?.expand?.(); } catch {}
  try { tg?.enableClosingConfirmation?.(); } catch {}

  const LS = {
    roomId: 'quartet_v2_room_id',
    playerName: 'quartet_v2_player_name',
    guestId: 'quartet_v2_guest_id',
  };

  const backendBase = resolveBackendBase();
  const guestId = getOrCreateGuestId();
  const telegramInitData = String(tg?.initData || '');
  const telegramUser = tg?.initDataUnsafe?.user || {};
  const defaultName = String(telegramUser.first_name || telegramUser.username || 'Игрок').trim() || 'Игрок';

  let catalog = [];
  let quartetById = new Map();
  let cardById = new Map();
  let quartetByCardId = new Map();
  let state = null;
  let roomId = localStorage.getItem(LS.roomId) || '';
  let playerName = localStorage.getItem(LS.playerName) || defaultName;
  let sessionToken = '';
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let reconnecting = false;
  let destroyed = false;
  let leaving = false;
  let selectedTargetId = '';
  let lastEventId = '';
  let turnTimerInterval = null;
  let toastTimer = null;
  let currentScreen = 'loading';

  const ui = {};

  injectStylesheet();
  renderRoot();
  bindRootEvents();
  startTurnClock();

  window.__quartetCleanup = cleanup;

  boot().catch((error) => {
    console.error('Quartet v2 boot error', error);
    showFatal(String(error?.message || error));
  });

  async function boot() {
    catalog = normalizeCatalog(await loadCatalog(catalogUrl));
    indexCatalog(catalog);

    if (!backendBase) {
      showBackendNotConfigured();
      return;
    }

    if (roomId) {
      showConnecting('Возвращаемся в комнату…');
      try {
        await joinOrResume(roomId, true);
        return;
      } catch (error) {
        console.warn('Quartet resume failed', error);
        clearRoomSession();
      }
    }

    renderHome();
  }

  function resolveBackendBase() {
    const fromWindow = String(window.QUARTET_BACKEND_URL || '').trim();
    const fromMeta = String(document.querySelector('meta[name="quartet-backend"]')?.content || '').trim();
    return (fromWindow || fromMeta).replace(/\/+$/, '');
  }

  function getOrCreateGuestId() {
    let id = localStorage.getItem(LS.guestId);
    if (!id) {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(LS.guestId, id);
    }
    return id;
  }

  function injectStylesheet() {
    if (document.getElementById('quartet-v2-css')) return;
    const link = document.createElement('link');
    link.id = 'quartet-v2-css';
    link.rel = 'stylesheet';
    link.href = 'games/quartet-v2.css?v=1';
    document.head.appendChild(link);
  }

  async function loadCatalog(url) {
    if (typeof window.loadJSON === 'function') return window.loadJSON(url);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Не удалось загрузить колоду Квартета');
    return response.json();
  }

  function normalizeCatalog(data) {
    if (!data || !Array.isArray(data.quartets)) throw new Error('Колода Квартета повреждена');
    return data.quartets.map((quartet) => ({
      id: String(quartet.id || ''),
      name: String(quartet.name || quartet.theme || 'Квартет'),
      icon: String(quartet.icon || '🃏'),
      cards: (quartet.cards || []).map((card, index) => typeof card === 'string'
        ? { id: `${quartet.id || 'q'}_${index}`, title: card }
        : { id: String(card.id || ''), title: String(card.title || '') }),
    }));
  }

  function indexCatalog(items) {
    quartetById = new Map();
    cardById = new Map();
    quartetByCardId = new Map();
    for (const quartet of items) {
      quartetById.set(quartet.id, quartet);
      for (const card of quartet.cards) {
        cardById.set(card.id, card);
        quartetByCardId.set(card.id, quartet);
      }
    }
  }

  function renderRoot() {
    container.innerHTML = `
      <section class="qv2-root" id="qv2-root">
        <header class="qv2-topbar qv2-glass">
          <button type="button" class="qv2-icon-btn" data-action="back" aria-label="Назад">←</button>
          <div class="qv2-titlebox">
            <h2 class="qv2-title">Квартет</h2>
            <div class="qv2-subtitle" id="qv2-subtitle">Онлайн-игра</div>
          </div>
          <div class="qv2-connection" id="qv2-connection">
            <span class="qv2-dot"></span><span id="qv2-connection-text">Подключение</span>
          </div>
        </header>
        <div id="qv2-content"></div>
        <div class="qv2-toast" id="qv2-toast" role="status" aria-live="polite"></div>
        <div id="qv2-modal-root"></div>
      </section>
    `;
    ui.root = document.getElementById('qv2-root');
    ui.content = document.getElementById('qv2-content');
    ui.subtitle = document.getElementById('qv2-subtitle');
    ui.connection = document.getElementById('qv2-connection');
    ui.connectionText = document.getElementById('qv2-connection-text');
    ui.toast = document.getElementById('qv2-toast');
    ui.modalRoot = document.getElementById('qv2-modal-root');
    setConnection('offline', 'Не подключено');
  }

  function bindRootEvents() {
    ui.root?.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'close-modal' && event.target.closest('[data-modal-card]') && !event.target.closest('button[data-action="close-modal"]')) return;

      try {
        if (action === 'back') return onBack();
        if (action === 'create') return createRoom(target);
        if (action === 'join') return joinRoomFromForm(target);
        if (action === 'copy-room') return copyRoomCode();
        if (action === 'share-room') return shareRoom();
        if (action === 'start-game') return sendAction('startGame', {}, target);
        if (action === 'restart-game') return sendAction('restartGame', {}, target);
        if (action === 'leave-room') return confirmLeave();
        if (action === 'select-target') {
          selectedTargetId = String(target.dataset.playerId || '');
          renderState();
          haptic('selection');
          return;
        }
        if (action === 'ask-card') {
          const cardId = String(target.dataset.cardId || '');
          if (!selectedTargetId) return showToast('Сначала выбери игрока', 'error');
          return sendAction('askCard', { targetId: selectedTargetId, cardId }, target);
        }
        if (action === 'open-rules') return openRules();
        if (action === 'close-modal') return closeModal();
        if (action === 'retry-connect') return retryConnect();
      } catch (error) {
        showToast(String(error?.message || error), 'error');
      }
    });

    ui.root?.addEventListener('input', (event) => {
      if (event.target.id === 'qv2-room-code') event.target.value = normalizeRoomId(event.target.value);
    });
  }

  function renderHome() {
    currentScreen = 'home';
    state = null;
    selectedTargetId = '';
    updateHeader();
    ui.content.innerHTML = `
      <div class="qv2-home">
        <section class="qv2-hero qv2-glass">
          <span class="qv2-kicker">Realtime · 2–8 игроков</span>
          <h2>Собери больше квартетов</h2>
          <p>Выбирай соперника, проси конкретную карту и собирай группы по четыре. Если карта есть — ход остаётся у тебя.</p>
          <div class="qv2-steps">
            <div class="qv2-step"><b>1 · Выбери</b><span>игрока, у которого хочешь спросить карту</span></div>
            <div class="qv2-step"><b>2 · Спроси</b><span>только карту из группы, которая уже есть в руке</span></div>
            <div class="qv2-step"><b>3 · Собери</b><span>четыре карты — квартет автоматически засчитается</span></div>
          </div>
        </section>

        <section class="qv2-form-card qv2-glass">
          <label class="qv2-label">
            <span>Имя игрока</span>
            <input id="qv2-player-name" class="qv2-input" maxlength="32" value="${escapeHtml(playerName)}" autocomplete="nickname" />
          </label>
          <div class="qv2-actions">
            <button class="qv2-btn qv2-btn--primary" type="button" data-action="create">＋ Создать комнату</button>
            <button class="qv2-btn qv2-btn--secondary" type="button" data-action="open-rules">? Правила</button>
          </div>
          <label class="qv2-label">
            <span>Код комнаты</span>
            <input id="qv2-room-code" class="qv2-input qv2-code-input" maxlength="8" placeholder="ABC123" autocomplete="off" />
          </label>
          <button class="qv2-btn qv2-btn--secondary qv2-btn--full" type="button" data-action="join">Войти по коду</button>
        </section>
      </div>
    `;
  }

  function showBackendNotConfigured() {
    currentScreen = 'backend-missing';
    setConnection('offline', 'Cloudflare не настроен');
    ui.content.innerHTML = `
      <section class="qv2-hero qv2-glass">
        <span class="qv2-kicker">Quartet v2</span>
        <h2>Cloudflare backend готов к подключению</h2>
        <p>Frontend уже переведён на realtime WebSocket, но в <code>index.html</code> ещё не указан URL развернутого Worker.</p>
        <div class="qv2-backend-note" style="margin-top:16px;">⚙️ Сначала разверните <b>cloudflare/quartet-worker</b>, затем вставьте выданный <b>workers.dev</b> URL в meta <b>quartet-backend</b>.</div>
      </section>
    `;
  }

  function showConnecting(text = 'Подключение…') {
    currentScreen = 'connecting';
    ui.content.innerHTML = `
      <section class="qv2-loading qv2-glass" style="border-radius:28px;">
        <div class="qv2-loading-box"><div class="qv2-spinner"></div><div>${escapeHtml(text)}</div></div>
      </section>
    `;
  }

  function showFatal(message) {
    currentScreen = 'error';
    setConnection('offline', 'Ошибка');
    ui.content.innerHTML = `
      <section class="qv2-hero qv2-glass">
        <span class="qv2-kicker">Ошибка</span>
        <h2>Квартет не запустился</h2>
        <p>${escapeHtml(message)}</p>
        <button class="qv2-btn qv2-btn--primary qv2-btn--full" style="margin-top:16px;" data-action="retry-connect">Повторить</button>
      </section>
    `;
  }

  async function createRoom(button) {
    persistNameFromInput();
    setButtonBusy(button, true, 'Создаём…');
    try {
      const response = await http('/rooms', {
        method: 'POST',
        body: authBody(),
      });
      roomId = normalizeRoomId(response.roomId);
      sessionToken = String(response.sessionToken || '');
      localStorage.setItem(LS.roomId, roomId);
      showConnecting('Открываем лобби…');
      connectSocket();
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function joinRoomFromForm(button) {
    persistNameFromInput();
    const code = normalizeRoomId(document.getElementById('qv2-room-code')?.value || '');
    if (!code) throw new Error('Введите код комнаты');
    setButtonBusy(button, true, 'Входим…');
    try {
      await joinOrResume(code, false);
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function joinOrResume(code, quiet) {
    roomId = normalizeRoomId(code);
    if (!quiet) showConnecting('Подключаемся к комнате…');
    const response = await http(`/rooms/${encodeURIComponent(roomId)}/join`, {
      method: 'POST',
      body: authBody(),
    });
    sessionToken = String(response.sessionToken || '');
    localStorage.setItem(LS.roomId, roomId);
    connectSocket();
  }

  function authBody() {
    return {
      telegramInitData,
      guestId,
      name: playerName,
    };
  }

  async function http(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(`${backendBase}${path}`, {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: 'no-store',
        signal: controller.signal,
      });
      let payload = null;
      try { payload = await response.json(); } catch {}
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Сервер долго не отвечает');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function connectSocket() {
    if (destroyed || !roomId || !sessionToken) return;
    closeSocket(false);
    const url = new URL(`${backendBase}/rooms/${encodeURIComponent(roomId)}/ws`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', sessionToken);

    setConnection('connecting', reconnectAttempt ? 'Переподключение' : 'Подключение');
    socket = new WebSocket(url.toString());

    socket.addEventListener('open', () => {
      reconnectAttempt = 0;
      reconnecting = false;
      setConnection('online', 'Онлайн');
    });

    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'state' && message.state) {
        state = message.state;
        roomId = normalizeRoomId(state.roomId || roomId);
        localStorage.setItem(LS.roomId, roomId);
        handleServerEvent(state.lastEvent);
        renderState();
      } else if (message.type === 'error') {
        showToast(message.error || 'Ошибка сервера', 'error');
      }
    });

    socket.addEventListener('close', () => {
      if (destroyed || leaving) return;
      setConnection('offline', 'Связь потеряна');
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      setConnection('offline', 'Ошибка связи');
    });
  }

  function scheduleReconnect() {
    if (destroyed || leaving || reconnectTimer || reconnecting || !roomId) return;
    reconnectAttempt += 1;
    const delay = Math.min(8000, 800 * 2 ** Math.min(reconnectAttempt - 1, 4));
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      reconnecting = true;
      try {
        await joinOrResume(roomId, true);
      } catch (error) {
        reconnecting = false;
        setConnection('offline', 'Нет связи');
        scheduleReconnect();
      }
    }, delay);
  }

  async function retryConnect() {
    if (!backendBase) return showBackendNotConfigured();
    if (roomId) {
      showConnecting('Переподключаемся…');
      try { await joinOrResume(roomId, true); } catch (error) { showFatal(String(error?.message || error)); }
    } else {
      renderHome();
    }
  }

  function renderState() {
    if (!state) return;
    updateHeader();
    if (state.status === 'lobby') renderLobby();
    else if (state.status === 'playing') renderGame();
    else if (state.status === 'finished') renderResults();
  }

  function updateHeader() {
    if (ui.subtitle) ui.subtitle.textContent = roomId ? `Комната ${roomId}` : 'Онлайн-игра';
  }

  function renderLobby() {
    currentScreen = 'lobby';
    const me = state.me || {};
    const activePlayers = (state.players || []).filter((player) => player.isActive !== false);
    const canStart = !!me.isHost && activePlayers.length >= 2;

    ui.content.innerHTML = `
      <div class="qv2-lobby">
        <section class="qv2-room-card qv2-glass">
          <div class="qv2-room-label">Код комнаты</div>
          <div class="qv2-room-code">${escapeHtml(roomId)}</div>
          <div class="qv2-room-actions">
            <button class="qv2-btn qv2-btn--secondary" data-action="copy-room">⧉ Скопировать</button>
            <button class="qv2-btn qv2-btn--secondary" data-action="share-room">↗ Поделиться</button>
          </div>
        </section>

        <section class="qv2-section qv2-glass">
          <div class="qv2-section-head">
            <h3 class="qv2-section-title">Игроки</h3>
            <div class="qv2-section-meta">${activePlayers.length}/8</div>
          </div>
          <div class="qv2-player-list">${activePlayers.map(renderLobbyPlayer).join('')}</div>
        </section>

        <section class="qv2-section qv2-glass">
          ${me.isHost
            ? `<button class="qv2-btn qv2-btn--primary qv2-btn--full" data-action="start-game" ${canStart ? '' : 'disabled'}>${canStart ? 'Начать игру' : 'Ждём ещё игрока'}</button>`
            : `<div class="qv2-empty">Ведущий начнёт игру, когда все будут готовы.</div>`}
          <button class="qv2-btn qv2-btn--danger qv2-btn--full" style="margin-top:8px;" data-action="leave-room">Выйти из комнаты</button>
        </section>
      </div>
    `;
  }

  function renderLobbyPlayer(player) {
    const initial = String(player.name || 'И').charAt(0).toUpperCase();
    return `
      <div class="qv2-player-row">
        <div class="qv2-avatar">${escapeHtml(initial)}</div>
        <div>
          <div class="qv2-player-name">${escapeHtml(player.name)}${player.playerId === state.me?.playerId ? ' · ты' : ''}</div>
          <div class="qv2-player-meta">${player.isHost ? 'Ведущий' : 'Игрок'}</div>
        </div>
        <div class="qv2-online ${player.connected ? 'is-on' : ''}">${player.connected ? 'онлайн' : 'не в сети'}</div>
      </div>
    `;
  }

  function renderGame() {
    currentScreen = 'game';
    const me = state.me || {};
    const myTurn = state.turnPlayerId === me.playerId;
    const targets = (state.players || []).filter((player) => player.isActive !== false && player.playerId !== me.playerId && player.cardsCount > 0);
    if (!targets.some((player) => player.playerId === selectedTargetId)) selectedTargetId = targets[0]?.playerId || '';

    const groupedHand = buildHandGroups(me.hand || []);
    const completed = (me.completedQuartets || []).map((id) => quartetById.get(id)).filter(Boolean);
    const lastEvent = renderLastEvent(state.lastEvent, me.playerId);

    ui.content.innerHTML = `
      <div class="qv2-home">
        ${renderTurnBanner(myTurn)}

        <section class="qv2-section qv2-glass">
          <div class="qv2-section-head">
            <h3 class="qv2-section-title">Игроки</h3>
            <div class="qv2-section-meta">${myTurn ? '1. Выбери соперника' : 'Счёт партии'}</div>
          </div>
          <div class="qv2-score-strip">${(state.players || []).filter((player) => player.isActive !== false).map((player) => renderScorePlayer(player, myTurn)).join('')}</div>
        </section>

        ${lastEvent ? `<div class="qv2-event ${lastEvent.className}">${lastEvent.text}</div>` : ''}

        <section class="qv2-section qv2-glass">
          <div class="qv2-section-head">
            <h3 class="qv2-section-title">Твои карты</h3>
            <div class="qv2-section-meta">${me.cardsCount || 0} карт · ${me.quartetsCount || 0} квартетов</div>
          </div>
          ${completed.length ? `<div class="qv2-completed" style="margin-bottom:10px;">${completed.map((quartet) => `<span class="qv2-trophy">🏆 ${escapeHtml(quartet.name)}</span>`).join('')}</div>` : ''}
          <div class="qv2-hand">${groupedHand.length ? groupedHand.map((group) => renderHandGroup(group, myTurn)).join('') : '<div class="qv2-empty">В руке больше нет карт.</div>'}</div>
        </section>

        <details class="qv2-section qv2-glass qv2-log">
          <summary><span>История ходов</span><span>⌄</span></summary>
          <div class="qv2-log-list">${(state.log || []).slice().reverse().map((item) => `<div class="qv2-log-item">${escapeHtml(item)}</div>`).join('')}</div>
        </details>

        <button class="qv2-btn qv2-btn--danger qv2-btn--full" data-action="leave-room">Выйти из партии</button>
      </div>
    `;
    updateTurnTimer();
  }

  function renderTurnBanner(myTurn) {
    return `
      <section class="qv2-turn-banner qv2-glass ${myTurn ? 'is-mine' : ''}">
        <div class="qv2-turn-icon">${myTurn ? '👆' : '⏳'}</div>
        <div>
          <div class="qv2-turn-title">${myTurn ? 'Твой ход' : `Ходит ${escapeHtml(state.turnPlayerName || 'игрок')}`}</div>
          <div class="qv2-turn-text">${myTurn ? 'Выбери игрока, затем недостающую карту.' : 'Смотри свою руку — ход придёт автоматически.'}</div>
        </div>
        <div class="qv2-turn-timer" id="qv2-turn-timer">--</div>
      </section>
    `;
  }

  function renderScorePlayer(player, myTurn) {
    const meId = state.me?.playerId;
    const selectable = myTurn && player.playerId !== meId && player.cardsCount > 0;
    const classes = [
      player.playerId === selectedTargetId ? 'is-target' : '',
      player.playerId === state.turnPlayerId ? 'is-turn' : '',
      player.playerId === meId ? 'is-me' : '',
    ].filter(Boolean).join(' ');
    return `
      <button type="button" class="qv2-score-player ${classes}" ${selectable ? `data-action="select-target" data-player-id="${escapeHtml(player.playerId)}"` : 'disabled'}>
        <div class="qv2-score-top"><span class="qv2-score-name">${escapeHtml(player.name)}${player.playerId === meId ? ' · ты' : ''}</span><span>${player.connected ? '●' : '○'}</span></div>
        <div class="qv2-score-stats"><span>🃏 ${Number(player.cardsCount || 0)}</span><span>🏆 ${Number(player.quartetsCount || 0)}</span></div>
      </button>
    `;
  }

  function buildHandGroups(hand) {
    const owned = new Set(hand || []);
    return catalog
      .map((quartet) => ({
        quartet,
        ownedCount: quartet.cards.filter((card) => owned.has(card.id)).length,
        cards: quartet.cards.map((card) => ({ ...card, owned: owned.has(card.id) })),
      }))
      .filter((group) => group.ownedCount > 0)
      .sort((a, b) => b.ownedCount - a.ownedCount || a.quartet.name.localeCompare(b.quartet.name, 'ru'));
  }

  function renderHandGroup(group, myTurn) {
    const near = group.ownedCount >= 3 ? 'is-near' : '';
    return `
      <article class="qv2-group ${near}">
        <div class="qv2-group-head">
          <div class="qv2-group-icon">${escapeHtml(group.quartet.icon)}</div>
          <div><div class="qv2-group-title">${escapeHtml(group.quartet.name)}</div><div class="qv2-group-progress">${group.ownedCount === 3 ? 'Осталась одна карта' : 'Собирай все четыре карты'}</div></div>
          <div class="qv2-progress-ring">${group.ownedCount}/4</div>
        </div>
        <div class="qv2-cards">
          ${group.cards.map((card) => renderCardSlot(card, myTurn)).join('')}
        </div>
      </article>
    `;
  }

  function renderCardSlot(card, myTurn) {
    if (card.owned) {
      return `<div class="qv2-card-slot is-owned"><span class="qv2-card-state">Есть</span><span class="qv2-card-title">${escapeHtml(card.title)}</span></div>`;
    }
    if (myTurn && selectedTargetId) {
      return `<button type="button" class="qv2-card-slot is-missing is-askable" data-action="ask-card" data-card-id="${escapeHtml(card.id)}"><span class="qv2-card-state">2. Спросить</span><span class="qv2-card-title">${escapeHtml(card.title)}</span></button>`;
    }
    return `<div class="qv2-card-slot is-missing"><span class="qv2-card-state">Нужно</span><span class="qv2-card-title">${escapeHtml(card.title)}</span></div>`;
  }

  function renderResults() {
    currentScreen = 'results';
    const me = state.me || {};
    const winners = (state.score || []).filter((player) => (state.winnerIds || []).includes(player.playerId));
    const iWon = (state.winnerIds || []).includes(me.playerId);
    const winnerText = winners.length ? winners.map((player) => player.name).join(', ') : 'Партия завершена';

    ui.content.innerHTML = `
      <div class="qv2-home">
        <section class="qv2-result-hero qv2-glass">
          <div class="qv2-result-icon">${iWon ? '🏆' : '🎉'}</div>
          <div class="qv2-result-title">${iWon ? 'Победа!' : 'Игра завершена'}</div>
          <div class="qv2-result-text">${escapeHtml(winnerText)}</div>
        </section>
        <section class="qv2-section qv2-glass">
          <div class="qv2-section-head"><h3 class="qv2-section-title">Результаты</h3><div class="qv2-section-meta">${state.totalQuartets || catalog.length} квартетов</div></div>
          <div class="qv2-leaderboard">${(state.score || []).map((player, index) => `
            <div class="qv2-leader-row">
              <div class="qv2-place">${index + 1}</div>
              <div class="qv2-leader-name">${escapeHtml(player.name)}${player.playerId === me.playerId ? ' · ты' : ''}</div>
              <div class="qv2-leader-score">🏆 ${Number(player.quartetsCount || 0)}</div>
            </div>`).join('')}</div>
        </section>
        ${me.isHost ? '<button class="qv2-btn qv2-btn--primary qv2-btn--full" data-action="restart-game">Новая партия</button>' : '<div class="qv2-event">Ведущий может запустить новую партию в этой же комнате.</div>'}
        <button class="qv2-btn qv2-btn--danger qv2-btn--full" data-action="leave-room">Выйти из комнаты</button>
      </div>
    `;
  }

  function renderLastEvent(event, meId) {
    if (!event?.type) return null;
    if (event.type === 'ask_success') {
      const actor = event.actorId === meId ? 'Ты' : escapeHtml(event.actorName || 'Игрок');
      const target = event.targetId === meId ? 'тебя' : escapeHtml(event.targetName || 'игрока');
      const extra = Array.isArray(event.completedQuartets) && event.completedQuartets.length
        ? ` · собран квартет «${escapeHtml(event.completedQuartets.join(', '))}» 🏆`
        : '';
      return { className: 'is-success', text: `${actor} получил карту «${escapeHtml(event.cardTitle)}» у ${target}${extra}` };
    }
    if (event.type === 'ask_miss') {
      const actor = event.actorId === meId ? 'Ты' : escapeHtml(event.actorName || 'Игрок');
      return { className: 'is-miss', text: `${actor} спросил «${escapeHtml(event.cardTitle)}» — такой карты у выбранного игрока нет. Ход перешёл дальше.` };
    }
    if (event.type === 'turn_timeout') return { className: 'is-miss', text: `${escapeHtml(event.actorName || 'Игрок')} не успел сделать ход — очередь перешла дальше.` };
    return null;
  }

  function handleServerEvent(event) {
    if (!event?.id || event.id === lastEventId) return;
    lastEventId = event.id;
    const meId = state?.me?.playerId;
    if (event.type === 'ask_success') {
      if (event.actorId === meId) {
        showToast(`Карта «${event.cardTitle}» получена`, 'success');
        haptic('success');
      } else if (event.targetId === meId) {
        showToast(`${event.actorName} забрал у тебя «${event.cardTitle}»`, 'info');
        haptic('warning');
      }
    } else if (event.type === 'ask_miss' && event.actorId === meId) {
      showToast('Карты нет — ход переходит дальше', 'info');
      haptic('warning');
    } else if (event.type === 'game_finished') {
      haptic('success');
    }
  }

  async function sendAction(action, payload = {}, button = null) {
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Нет соединения с комнатой');
    if (button) setButtonBusy(button, true, '…');
    try {
      socket.send(JSON.stringify({ type: 'action', action, payload }));
    } finally {
      if (button) setTimeout(() => setButtonBusy(button, false), 600);
    }
  }

  async function confirmLeave() {
    const ok = window.confirm(state?.status === 'playing'
      ? 'Выйти из партии? Твои оставшиеся карты будут перераспределены между игроками.'
      : 'Выйти из комнаты?');
    if (!ok) return;
    leaving = true;
    try {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'action', action: 'leave', payload: {} }));
      await new Promise((resolve) => setTimeout(resolve, 120));
    } finally {
      closeSocket(false);
      clearRoomSession();
      leaving = false;
      if (typeof window.appGoToMainMenu === 'function') window.appGoToMainMenu();
      else if (typeof window.goToMainMenu === 'function') window.goToMainMenu();
    }
  }

  function onBack() {
    if (currentScreen === 'home' || currentScreen === 'backend-missing' || !roomId) {
      cleanup();
      if (typeof window.appGoToMainMenu === 'function') return window.appGoToMainMenu();
      if (typeof window.goToMainMenu === 'function') return window.goToMainMenu();
      return;
    }
    confirmLeave();
  }

  async function copyRoomCode() {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      showToast('Код скопирован', 'success');
    } catch {
      showToast(`Код комнаты: ${roomId}`, 'info');
    }
  }

  async function shareRoom() {
    if (!roomId) return;
    const text = `Присоединяйся к игре «Квартет». Код комнаты: ${roomId}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Библейский Квартет', text });
      else await copyRoomCode();
    } catch (error) {
      if (error?.name !== 'AbortError') await copyRoomCode();
    }
  }

  function openRules() {
    ui.modalRoot.innerHTML = `
      <div class="qv2-modal" data-action="close-modal">
        <div class="qv2-modal-card" data-modal-card>
          <h3>Как играть в Квартет</h3>
          <ol>
            <li>В каждой группе четыре карты. Цель — собрать больше полных групп.</li>
            <li>Во время своего хода выбери другого игрока.</li>
            <li>Можно спросить только карту из квартета, от которого у тебя уже есть хотя бы одна карта.</li>
            <li>Если выбранная карта есть у соперника, она сразу переходит к тебе и ты ходишь ещё раз.</li>
            <li>Если карты нет, ход автоматически переходит следующему игроку.</li>
            <li>Когда все четыре карты группы у одного игрока, квартет автоматически засчитывается и карты уходят из руки.</li>
          </ol>
          <button class="qv2-btn qv2-btn--primary qv2-btn--full" data-action="close-modal">Понятно</button>
        </div>
      </div>
    `;
  }

  function closeModal() {
    ui.modalRoot.innerHTML = '';
  }

  function persistNameFromInput() {
    playerName = String(document.getElementById('qv2-player-name')?.value || defaultName).replace(/[<>\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 32) || defaultName;
    localStorage.setItem(LS.playerName, playerName);
  }

  function clearRoomSession() {
    roomId = '';
    sessionToken = '';
    state = null;
    selectedTargetId = '';
    reconnectAttempt = 0;
    localStorage.removeItem(LS.roomId);
  }

  function setConnection(mode, text) {
    if (!ui.connection) return;
    ui.connection.classList.remove('is-online', 'is-offline');
    if (mode === 'online') ui.connection.classList.add('is-online');
    if (mode === 'offline') ui.connection.classList.add('is-offline');
    if (ui.connectionText) ui.connectionText.textContent = text;
  }

  function setButtonBusy(button, busy, text = '') {
    if (!button) return;
    if (busy) {
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
      button.disabled = true;
      if (text) button.textContent = text;
    } else {
      button.disabled = false;
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  function showToast(message, type = 'info') {
    if (!ui.toast) return;
    clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.className = `qv2-toast is-visible ${type === 'error' ? 'is-error' : type === 'success' ? 'is-success' : ''}`;
    toastTimer = setTimeout(() => { if (ui.toast) ui.toast.className = 'qv2-toast'; }, 2400);
  }

  function haptic(kind) {
    try {
      if (!tg?.HapticFeedback) return;
      if (kind === 'selection') tg.HapticFeedback.selectionChanged();
      else tg.HapticFeedback.notificationOccurred(kind === 'warning' ? 'warning' : 'success');
    } catch {}
  }

  function startTurnClock() {
    clearInterval(turnTimerInterval);
    turnTimerInterval = setInterval(updateTurnTimer, 1000);
  }

  function updateTurnTimer() {
    const element = document.getElementById('qv2-turn-timer');
    if (!element || !state?.turnDeadlineMs || state.status !== 'playing') return;
    const seconds = Math.max(0, Math.ceil((Number(state.turnDeadlineMs) - Date.now()) / 1000));
    element.textContent = `${seconds}с`;
  }

  function normalizeRoomId(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function closeSocket(schedule = false) {
    if (socket) {
      try { socket.close(1000, 'client closing'); } catch {}
      socket = null;
    }
    if (schedule) scheduleReconnect();
  }

  function cleanup() {
    destroyed = true;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
    clearTimeout(toastTimer);
    closeSocket(false);
    try { tg?.disableClosingConfirmation?.(); } catch {}
    window.__quartetCleanup = null;
  }
}

window.startQuartetGame = startQuartetGame;
