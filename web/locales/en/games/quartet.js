// games/quartet.js — Quartet v3, tactile card-table UX

function startQuartetGame(catalogUrl = 'web/locales/en/data/quartet_bible.json') {
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

  const TURN_TIMEOUT_SECONDS = 90;
  const backendBase = resolveBackendBase();
  const guestId = getOrCreateGuestId();
  const telegramInitData = String(tg?.initData || '');
  const telegramUser = tg?.initDataUnsafe?.user || {};
  const defaultName = String(telegramUser.first_name || telegramUser.username || 'Player').trim() || 'Player';

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
  let selectedCardId = '';
  let lastEventId = '';
  let turnTimerInterval = null;
  let toastTimer = null;
  let turnNoticeTimer = null;
  let currentScreen = 'loading';

  const ui = {};

  injectStylesheet();
  renderRoot();
  bindRootEvents();
  startTurnClock();

  window.__quartetCleanup = cleanup;

  boot().catch((error) => {
    console.error('Quartet v3 boot error', error);
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
      showConnecting('Returning to room…');
      try {
        await joinOrResume(roomId, true);
        return;
      } catch (error) {
        if (error?.clientBackoff) {
          // Комната цела, вход просто отложен: ждём, пока приложение вернётся
          // на экран, и заходим снова.
          showConnecting('Returning to room…');
          scheduleReconnect();
          return;
        }
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
    const existing = document.getElementById('quartet-v2-css');
    if (existing) {
      existing.href = 'web/locales/en/games/quartet-v2.css?v=4';
      return;
    }
    const link = document.createElement('link');
    link.id = 'quartet-v2-css';
    link.rel = 'stylesheet';
    link.href = 'web/locales/en/games/quartet-v2.css?v=4';
    document.head.appendChild(link);
  }

  async function loadCatalog(url) {
    if (typeof window.loadJSON === 'function') return window.loadJSON(url);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load Quartet deck');
    return response.json();
  }

  function normalizeCatalog(data) {
    if (!data || !Array.isArray(data.quartets)) throw new Error('Quartet deck is damaged');
    return data.quartets.map((quartet) => ({
      id: String(quartet.id || ''),
      name: String(quartet.name || quartet.theme || 'Quartet'),
      icon: String(quartet.icon || '🃏'),
      cards: (quartet.cards || []).map((card, index) => typeof card === 'string'
        ? { id: `${quartet.id || 'q'}_${index}`, title: card, art: '' }
        : { id: String(card.id || ''), title: String(card.title || ''), art: String(card.art || '') }),
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
    container.innerHTML = `\n      <section class="qv2-root" id="qv2-root">\n        <header class="qv2-topbar qv2-glass">\n          <button type="button" class="qv2-icon-btn" data-action="back" aria-label="Back">←</button>\n          <div class="qv2-titlebox">\n            <h2 class="qv2-title">Quartet</h2>\n            <div class="qv2-subtitle" id="qv2-subtitle">Online game</div>\n          </div>\n          <div class="qv2-connection" id="qv2-connection">\n            <span class="qv2-dot"></span><span id="qv2-connection-text">Connection</span>\n          </div>\n        </header>\n        <div id="qv2-content"></div>\n        <div class="qv2-turn-notice" id="qv2-turn-notice" role="status" aria-live="assertive">\n          <div class="qv2-turn-notice-icon" id="qv2-turn-notice-icon">↻</div>\n          <div><strong id="qv2-turn-notice-title"></strong><span id="qv2-turn-notice-text"></span></div>\n        </div>\n        <div class="qv2-toast" id="qv2-toast" role="status" aria-live="polite"></div>\n        <div id="qv2-modal-root"></div>\n      </section>\n    `;
    ui.root = document.getElementById('qv2-root');
    ui.content = document.getElementById('qv2-content');
    ui.subtitle = document.getElementById('qv2-subtitle');
    ui.connection = document.getElementById('qv2-connection');
    ui.connectionText = document.getElementById('qv2-connection-text');
    ui.turnNotice = document.getElementById('qv2-turn-notice');
    ui.turnNoticeIcon = document.getElementById('qv2-turn-notice-icon');
    ui.turnNoticeTitle = document.getElementById('qv2-turn-notice-title');
    ui.turnNoticeText = document.getElementById('qv2-turn-notice-text');
    ui.toast = document.getElementById('qv2-toast');
    ui.modalRoot = document.getElementById('qv2-modal-root');
    setConnection('offline', 'Not connected');
  }

  function bindRootEvents() {
    ui.root?.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'close-modal' && event.target.closest('[data-modal-card]') && !event.target.closest('button[data-action="close-modal"]')) return;

      // await обязателен. Без него «return createRoom(target)» отдаёт промис из
      // try, а catch к тому времени уже пройден: беда уходила мимо него
      // необработанным отказом — человек не видел ни причины, ни подсказки, зато
      // администратору она прилетала как ошибка приложения.
      try {
        if (action === 'back') return await onBack();
        if (action === 'create') return await createRoom(target);
        if (action === 'join') return await joinRoomFromForm(target);
        if (action === 'copy-room') return await copyRoomCode();
        if (action === 'share-room') return await shareRoom();
        if (action === 'start-game') return await sendAction('startGame', {}, target);
        if (action === 'restart-game') return await sendAction('restartGame', {}, target);
        if (action === 'leave-room') return await confirmLeave();
        if (action === 'select-target') return await selectTarget(target);
        if (action === 'select-card') return await selectCard(target);
        if (action === 'confirm-ask') return await confirmAsk(target);
        if (action === 'focus-group') return await focusGroup(target.dataset.groupId || '');
        if (action === 'open-rules') return await openRules();
        if (action === 'close-modal') return await closeModal();
        if (action === 'retry-connect') return await retryConnect();
      } catch (error) {
        showToast(String(error?.message || error), 'error');
      }
    });

    ui.root?.addEventListener('input', (event) => {
      if (event.target.id === 'qv2-room-code') event.target.value = normalizeRoomId(event.target.value);
    });
  }

  function selectTarget(button) {
    if (!isMyTurn()) return;
    selectedTargetId = String(button.dataset.playerId || '');
    renderState();
    haptic('selection');
  }

  function selectCard(button) {
    if (!isMyTurn()) return;
    const cardId = String(button.dataset.cardId || '');
    if (!cardId) return;
    selectedCardId = selectedCardId === cardId ? '' : cardId;
    const groupId = quartetByCardId.get(cardId)?.id || '';
    renderState();
    if (groupId) requestAnimationFrame(() => focusGroup(groupId));
    haptic('selection');
  }

  function confirmAsk(button) {
    if (!isMyTurn()) return showToast('Another player is taking their turn', 'info');
    if (!selectedTargetId) return showToast('Choose a player first', 'info');
    if (!selectedCardId) return showToast('Now choose a missing card', 'info');
    const card = cardById.get(selectedCardId);
    showTurnNotice('Request sent', `Asking «${card?.title || 'card'}»…`, 'pending', '↗', 1200);
    return sendAction('askCard', { targetId: selectedTargetId, cardId: selectedCardId }, button);
  }

  function focusGroup(groupId) {
    const element = document.getElementById(`qv2-group-${safeDomId(groupId)}`);
    if (!element) return;
    element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
  }

  function renderHome() {
    currentScreen = 'home';
    state = null;
    resetSelection();
    updateHeader();
    ui.content.innerHTML = `\n      <div class="qv2-home">\n        <section class="qv2-hero qv2-glass">\n          <span class="qv2-kicker">Realtime · 2–15 players</span>\n          <h2>Collect the most quartets</h2>\n          <p>Choose an opponent, select a card and collect sets of four. A successful request lets you keep your turn.</p>\n          <div class="qv2-steps">\n            <div class="qv2-step"><b>1 · Player</b><span>choose an opponent</span></div>\n            <div class="qv2-step"><b>2 · Card</b><span>select the missing card</span></div>\n            <div class="qv2-step"><b>3 · Request</b><span>confirm action</span></div>\n          </div>\n        </section>\n\n        <section class="qv2-form-card qv2-glass">\n          <label class="qv2-label">\n            <span>Player name</span>\n            <input id="qv2-player-name" class="qv2-input" maxlength="32" value="${escapeHtml(playerName)}" autocomplete="nickname" />\n          </label>\n          <div class="qv2-actions">\n            <button class="qv2-btn qv2-btn--primary" type="button" data-action="create">＋ Create room</button>\n            <button class="qv2-btn qv2-btn--secondary" type="button" data-action="open-rules">? Rules</button>\n          </div>\n          <label class="qv2-label">\n            <span>Room code</span>\n            <input id="qv2-room-code" class="qv2-input qv2-code-input" maxlength="8" placeholder="ABC123" autocomplete="off" />\n          </label>\n          <button class="qv2-btn qv2-btn--secondary qv2-btn--full" type="button" data-action="join">Join with code</button>\n        </section>\n      </div>\n    `;
  }

  function showBackendNotConfigured() {
    currentScreen = 'backend-missing';
    setConnection('offline', 'Cloudflare not configured');
    ui.content.innerHTML = `\n      <section class="qv2-hero qv2-glass">\n        <span class="qv2-kicker">Quartet v2</span>\n        <h2>Cloudflare backend not connected</h2>\n        <p>В <code>index.html</code> must be specified URL Cloudflare Worker в meta <b>quartet-backend</b>.</p>\n      </section>\n    `;
  }

  function showConnecting(text = 'Connecting…') {
    currentScreen = 'connecting';
    ui.content.innerHTML = `
      <section class="qv2-loading qv2-glass">
        <div class="qv2-loading-box"><div class="qv2-spinner"></div><div>${escapeHtml(text)}</div></div>
      </section>
    `;
  }

  function showFatal(message) {
    currentScreen = 'error';
    setConnection('offline', 'Error');
    ui.content.innerHTML = `\n      <section class="qv2-hero qv2-glass">\n        <span class="qv2-kicker">Error</span>\n        <h2>Quartet could not start</h2>\n        <p>${escapeHtml(message)}</p>\n        <button class="qv2-btn qv2-btn--primary qv2-btn--full qv2-mt" data-action="retry-connect">Retry</button>\n      </section>\n    `;
  }

  async function createRoom(button) {
    persistNameFromInput();
    setButtonBusy(button, true, 'Creating…');
    try {
      const response = await http('/rooms', { method: 'POST', body: authBody() });
      roomId = normalizeRoomId(response.roomId);
      sessionToken = String(response.sessionToken || '');
      localStorage.setItem(LS.roomId, roomId);
      showConnecting('Opening lobby…');
      connectSocket();
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function joinRoomFromForm(button) {
    persistNameFromInput();
    const code = normalizeRoomId(document.getElementById('qv2-room-code')?.value || '');
    if (!code) throw new Error('Enter room code');
    setButtonBusy(button, true, 'Joining…');
    try { await joinOrResume(code, false); }
    finally { setButtonBusy(button, false); }
  }

  async function joinOrResume(code, quiet) {
    roomId = normalizeRoomId(code);
    if (!quiet) showConnecting('Connecting to room…');
    const response = await http(`/rooms/${encodeURIComponent(roomId)}/join`, { method: 'POST', body: authBody() });
    sessionToken = String(response.sessionToken || '');
    localStorage.setItem(LS.roomId, roomId);
    connectSocket();
  }

  function authBody() {
    return { telegramInitData, guestId, name: playerName };
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
      // Отказ бюджета запросов приходит с этой пометкой и означает «не сейчас»,
      // а не «не вышло»: запрос придержал сам клиент — приложение свёрнуто или
      // вход в комнату повторился слишком быстро. Это не беда, о которой нужно
      // говорить человеку или администратору, и комнату по ней терять нельзя.
      if (response.headers.get('X-Client-Backoff') === '1') {
        throw Object.assign(new Error('Connection delayed'), { clientBackoff: true });
      }
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Server is taking too long');
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

    setConnection('connecting', reconnectAttempt ? 'Reconnecting' : 'Connection');
    socket = new WebSocket(url.toString());

    socket.addEventListener('open', () => {
      reconnectAttempt = 0;
      reconnecting = false;
      setConnection('online', 'Online');
    });

    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'state' && message.state) {
        const previousState = state;
        state = message.state;
        roomId = normalizeRoomId(state.roomId || roomId);
        localStorage.setItem(LS.roomId, roomId);
        reconcileSelection(previousState, state);
        renderState();
        handleStateTransition(previousState, state);
      } else if (message.type === 'error') {
        showToast(message.error || 'Server error', 'error');
      }
    });

    socket.addEventListener('close', () => {
      if (destroyed || leaving) return;
      setConnection('offline', 'Connection lost');
      showToast('Connection lost. Reconnecting…', 'info');
      scheduleReconnect();
    });

    socket.addEventListener('error', () => setConnection('offline', 'Connection error'));
  }

  function scheduleReconnect() {
    if (destroyed || leaving || document.hidden || reconnectTimer || reconnecting || !roomId) return;
    reconnectAttempt += 1;
    const delay = Math.min(30_000, 2_500 * 2 ** Math.min(reconnectAttempt - 1, 4));
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      reconnecting = true;
      try { await joinOrResume(roomId, true); }
      catch {
        reconnecting = false;
        setConnection('offline', 'No connection');
        scheduleReconnect();
      }
    }, delay);
  }

  async function retryConnect() {
    if (!backendBase) return showBackendNotConfigured();
    if (roomId) {
      showConnecting('Reconnecting…');
      try { await joinOrResume(roomId, true); }
      catch (error) { showFatal(String(error?.message || error)); }
    } else renderHome();
  }

  function renderState() {
    if (!state) return;
    updateHeader();
    if (state.status === 'lobby') renderLobby();
    else if (state.status === 'playing') renderGame();
    else if (state.status === 'finished') renderResults();
  }

  function updateHeader() {
    if (ui.subtitle) ui.subtitle.textContent = roomId ? `Room ${roomId}` : 'Online game';
  }

  function renderLobby() {
    currentScreen = 'lobby';
    const me = state.me || {};
    const activePlayers = (state.players || []).filter((player) => player.isActive !== false);
    const canStart = !!me.isHost && activePlayers.length >= 2;

    ui.content.innerHTML = `\n      <div class="qv2-lobby">\n        <section class="qv2-room-card qv2-glass">\n          <div class="qv2-room-label">Room code</div>\n          <div class="qv2-room-code">${escapeHtml(roomId)}</div>\n          <div class="qv2-room-actions">\n            <button class="qv2-btn qv2-btn--secondary" data-action="copy-room">⧉ Copy</button>\n            <button class="qv2-btn qv2-btn--secondary" data-action="share-room">Share</button>\n          </div>\n        </section>\n\n        <section class="qv2-section qv2-glass">\n          <div class="qv2-section-head"><h3 class="qv2-section-title">Players</h3><div class="qv2-section-meta">${activePlayers.length}/8</div></div>
          <div class="qv2-player-list">${activePlayers.map(renderLobbyPlayer).join('')}</div>
        </section>

        <section class="qv2-section qv2-glass">
          ${me.isHost
            ? `<button class="qv2-btn qv2-btn--primary qv2-btn--full" data-action="start-game" ${canStart ? '' : 'disabled'}>${canStart ? 'Start game' : 'Waiting for another player'}</button>`
            : `<div class="qv2-empty">The host will start when everyone is ready.</div>`}\n          <button class="qv2-btn qv2-btn--danger qv2-btn--full qv2-mt-sm" data-action="leave-room">Leave room</button>\n        </section>\n      </div>\n    `;
  }

  function renderLobbyPlayer(player) {
    const initial = String(player.name || 'И').charAt(0).toUpperCase();
    return `
      <div class="qv2-player-row">
        <div class="qv2-avatar">${escapeHtml(initial)}</div>
        <div>
          <div class="qv2-player-name">${escapeHtml(player.name)}${player.playerId === state.me?.playerId ? ' · you' : ''}</div>
          <div class="qv2-player-meta">${player.isHost ? 'Host' : 'Player'}</div>
        </div>
        <div class="qv2-online ${player.connected ? 'is-on' : ''}">${player.connected ? 'online' : 'offline'}</div>
      </div>
    `;
  }

  function renderGame() {
    currentScreen = 'game';
    const me = state.me || {};
    const myTurn = isMyTurn();
    const targets = availableTargets();
    if (selectedTargetId && !targets.some((player) => player.playerId === selectedTargetId)) selectedTargetId = '';

    const groupedHand = buildHandGroups(me.hand || []);
    const completed = (me.completedQuartets || []).map((id) => quartetById.get(id)).filter(Boolean);
    const event = renderLastEvent(state.lastEvent, me.playerId);

    ui.content.innerHTML = `
      <div class="qv2-game ${myTurn ? 'is-my-turn' : 'is-waiting-turn'}">
        ${renderTurnBanner(myTurn)}\n\n        <section class="qv2-section qv2-glass qv2-players-section qv3-opponents">\n          <div class="qv2-section-head">\n            <div><h3 class="qv2-section-title">Players</h3><div class="qv2-section-caption">${myTurn ? 'Step 1 · choose whom to ask for a card' : `Now playing ${escapeHtml(state.turnPlayerName || 'player')}`}</div></div>
            <div class="qv2-section-meta">${(state.players || []).filter((player) => player.isActive !== false).length} in the game</div>\n          </div>\n          <div class="qv2-score-strip">${(state.players || []).filter((player) => player.isActive !== false).map((player) => renderScorePlayer(player, myTurn)).join('')}</div>
        </section>

        ${event ? `<div class="qv2-event ${event.className}"><span class="qv2-event-icon">${event.icon}</span><span>${event.text}</span></div>` : ''}\n\n        <section class="qv2-section qv2-glass qv2-hand-section qv3-hand-table">\n          <div class="qv2-section-head">\n            <div><h3 class="qv2-section-title">Your hand</h3><div class="qv2-section-caption">${myTurn ? 'Step 2 · choose a missing card' : 'You can plan your next request'}</div></div>
            <div class="qv2-section-meta">🃏 ${me.cardsCount || 0} · 🏆 ${me.quartetsCount || 0}</div>
          </div>
          ${completed.length ? `<div class="qv2-completed">${completed.map((quartet) => `<span class="qv2-trophy">🏆 ${escapeHtml(quartet.name)}</span>`).join('')}</div>` : ''}
          ${renderHandDeck(groupedHand, myTurn)}
        </section>

        ${renderActionDock(myTurn)}\n\n        <section class="qv2-section qv2-glass qv2-activity">\n          <div class="qv2-section-head"><h3 class="qv2-section-title">Recent actions</h3><div class="qv2-section-meta">real-time game</div></div>\n          <div class="qv2-activity-list">${renderRecentLog()}</div>\n          <details class="qv2-log">\n            <summary><span>Full history</span><span>⌄</span></summary>\n            <div class="qv2-log-list">${(state.log || []).slice().reverse().map((item) => `<div class="qv2-log-item">${escapeHtml(item)}</div>`).join('')}</div>\n          </details>\n        </section>\n\n        <button class="qv2-btn qv2-btn--danger qv2-btn--full" data-action="leave-room">Leave game</button>\n      </div>\n    `;
    updateTurnTimer();
  }

  function renderTurnBanner(myTurn) {
    const turnName = escapeHtml(state.turnPlayerName || 'player');
    return `
      <section class="qv2-turn-banner qv2-glass ${myTurn ? 'is-mine' : 'is-waiting'}" id="qv2-turn-banner">
        <div class="qv2-turn-badge">${myTurn ? 'YOUR TURN' : 'WAITING'}</div>
        <div class="qv2-turn-main">
          <div class="qv2-turn-avatar">${myTurn ? '✦' : escapeHtml(String(state.turnPlayerName || 'И').charAt(0).toUpperCase())}</div>
          <div>
            <div class="qv2-turn-title">${myTurn ? 'Your turn has started' : `Player turn ${turnName}`}</div>
            <div class="qv2-turn-text">${myTurn ? 'Choose an opponent and a card, then confirm your request.' : 'Your actions are temporarily disabled. Watch the game; turns change automatically.'}</div>\n          </div>\n        </div>\n        <div class="qv2-turn-timer-wrap"><span>Remaining</span><strong class="qv2-turn-timer" id="qv2-turn-timer">--</strong></div>\n        <div class="qv2-turn-progress" aria-hidden="true"><span id="qv2-turn-progress"></span></div>\n      </section>\n    `;
  }

  function renderScorePlayer(player, myTurn) {
    const meId = state.me?.playerId;
    const selectable = myTurn && player.playerId !== meId && player.cardsCount > 0;
    const isTurn = player.playerId === state.turnPlayerId;
    const isTarget = player.playerId === selectedTargetId;
    const classes = [isTarget ? 'is-target' : '', isTurn ? 'is-turn' : '', player.playerId === meId ? 'is-me' : ''].filter(Boolean).join(' ');
    const initial = escapeHtml(String(player.name || 'И').charAt(0).toUpperCase());
    return `
      <button type="button" class="qv2-score-player ${classes}" ${selectable ? `data-action="select-target" data-player-id="${escapeHtml(player.playerId)}" aria-pressed="${isTarget}"` : 'disabled'}>
        <div class="qv2-score-player-head">
          <span class="qv2-mini-avatar">${initial}</span>
          <span class="qv2-score-name">${escapeHtml(player.name)}${player.playerId === meId ? ' · you' : ''}</span>
          <span class="qv2-presence ${player.connected ? 'is-online' : ''}" title="${player.connected ? 'Online' : 'Offline'}"></span>
        </div>
        <div class="qv3-card-fan" aria-hidden="true"><i></i><i></i><i></i><b>${Number(player.cardsCount || 0)}</b></div>
        <div class="qv2-score-stats"><span>🃏 ${Number(player.cardsCount || 0)}</span><span>🏆 ${Number(player.quartetsCount || 0)}</span></div>
        ${isTurn ? '<div class="qv2-player-turn-label">Now playing</div>' : ''}
        ${isTarget ? '<div class="qv2-player-target-label">Selected</div>' : ''}
      </button>
    `;
  }

  function buildHandGroups(hand) {
    const owned = new Set(hand || []);
    return catalog
      .map((quartet, catalogIndex) => ({
        quartet,
        catalogIndex,
        ownedCount: quartet.cards.filter((card) => owned.has(card.id)).length,
        cards: quartet.cards.map((card) => ({ ...card, owned: owned.has(card.id) })),
      }))
      .filter((group) => group.ownedCount > 0)
      .sort((a, b) => b.ownedCount - a.ownedCount || a.quartet.name.localeCompare(b.quartet.name, 'ru'));
  }

  function renderHandDeck(groups, myTurn) {
    if (!groups.length) return '<div class="qv2-empty">No cards left in your hand.</div>';
    const selectedGroupId = quartetByCardId.get(selectedCardId)?.id || '';
    return `\n      <div class="qv2-group-tabs" aria-label="Quartets in hand">\n        ${groups.map((group) => `
          <button type="button" class="qv2-group-tab ${selectedGroupId === group.quartet.id ? 'is-active' : ''}" data-action="focus-group" data-group-id="${escapeHtml(group.quartet.id)}">
            <span>${escapeHtml(group.quartet.icon)}</span><b>${group.ownedCount}/4</b>
          </button>`).join('')}
      </div>
      <div class="qv2-quartet-deck" id="qv2-quartet-deck">
        ${groups.map((group, index) => renderHandGroup(group, myTurn, index)).join('')}\n      </div>\n      <div class="qv2-swipe-hint"><span>←</span> Browse quartets <span>→</span></div>\n    `;
  }

  function renderHandGroup(group, myTurn, index) {
    const near = group.ownedCount >= 3 ? 'is-near' : '';
    const selectedGroup = group.cards.some((card) => card.id === selectedCardId);
    const theme = (group.catalogIndex + index) % 6;
    const progressLabel = group.ownedCount === 3 ? '1 card left' : group.ownedCount === 2 ? 'Half collected' : 'Quartet started';
    return `
      <article class="qv2-quartet-card qv2-theme-${theme} ${near} ${selectedGroup ? 'has-selection' : ''}" id="qv2-group-${safeDomId(group.quartet.id)}">
        <div class="qv2-quartet-card-head">
          <div class="qv2-quartet-symbol">${escapeHtml(group.quartet.icon)}</div>\n          <div class="qv2-quartet-heading"><span>Quartet</span><strong>${escapeHtml(group.quartet.name)}</strong><small>${progressLabel}</small></div>
          <div class="qv2-quartet-progress"><strong>${group.ownedCount}</strong><span>/4</span></div>\n        </div>\n        <div class="qv2-progress-pips" aria-label="Collected ${group.ownedCount} of 4">\n          ${[0,1,2,3].map((n) => `<span class="${n < group.ownedCount ? 'is-filled' : ''}"></span>`).join('')}
        </div>
        <div class="qv2-card-grid">
          ${group.cards.map((card, cardIndex) => renderPlayingCard(card, myTurn, cardIndex + 1)).join('')}
        </div>
      </article>
    `;
  }

  function renderPlayingCard(card, myTurn, number) {
    const selected = card.id === selectedCardId;
    const quartet = quartetByCardId.get(card.id);
    if (card.owned) {
      return `
        <div class="qv2-playing-card is-owned" aria-label="${escapeHtml(card.title)}, you have this card">\n          <div class="qv2-card-corner"><span>${escapeHtml(quartet?.icon || '🃏')}</span><b>${number}</b></div>
          <div class="qv3-card-art"><img src="${escapeHtml(cardArtUrl(card))}" alt="" loading="lazy" decoding="async"></div>
          <div class="qv2-playing-card-title">${escapeHtml(card.title)}</div>\n          <div class="qv2-card-status">✓ In hand</div>\n        </div>`;
    }
    const canSelect = myTurn && !!selectedTargetId;
    return `
      <button type="button" class="qv2-playing-card is-missing ${canSelect ? 'is-selectable' : ''} ${selected ? 'is-selected' : ''}"
        ${canSelect ? `data-action="select-card" data-card-id="${escapeHtml(card.id)}" aria-pressed="${selected}"` : 'disabled'}
        aria-label="${escapeHtml(card.title)}, missing card${selected ? ', selected' : ''}">
        <div class="qv2-card-corner"><span>${escapeHtml(quartet?.icon || '🃏')}</span><b>${number}</b></div>
        <div class="qv3-card-art qv3-card-back"><span>${selected ? '✓' : '?'}</span></div>
        <div class="qv2-playing-card-title">${escapeHtml(card.title)}</div>
        <div class="qv2-card-status">${selected ? 'Selected' : canSelect ? 'Tap to select' : 'Collect these'}</div>
      </button>`;
  }

  function cardArtUrl(card) {
    return card?.art || `web/assets/quartet/cards/${encodeURIComponent(String(card?.id || ''))}.webp`;
  }

  function renderActionDock(myTurn) {
    const target = (state.players || []).find((player) => player.playerId === selectedTargetId);
    const card = cardById.get(selectedCardId);
    const ready = myTurn && !!target && !!card;
    return `
      <section class="qv2-action-dock qv2-glass ${myTurn ? 'is-active' : 'is-locked'}">\n        <div class="qv2-action-dock-step qv2-action-target"><span>1</span><div><small>Opponent</small><strong>${target ? escapeHtml(target.name) : myTurn ? 'Select a player' : 'Unavailable'}</strong></div></div>\n        <div class="qv2-action-arrow">→</div>\n        <div class="qv2-action-dock-step qv2-action-card"><span>2</span><div><small>Card</small><strong>${card ? escapeHtml(card.title) : myTurn ? 'Select a card' : 'Wait for your turn'}</strong></div></div>
        <button type="button" class="qv2-btn qv2-btn--primary qv2-confirm-ask" data-action="confirm-ask" ${ready ? '' : 'disabled'}>
          ${myTurn ? (ready ? 'Ask for card' : 'Make 2 selections') : `Playing ${escapeHtml(state.turnPlayerName || 'player')}`}
        </button>
      </section>
    `;
  }

  function renderRecentLog() {
    const recent = (state.log || []).slice(-3).reverse();
    if (!recent.length) return '<div class="qv2-empty">No actions yet.</div>';
    return recent.map((item, index) => `<div class="qv2-activity-item"><span>${index === 0 ? '●' : '○'}</span><div>${escapeHtml(item)}</div></div>`).join('');
  }

  function renderResults() {
    currentScreen = 'results';
    const me = state.me || {};
    const winners = (state.score || []).filter((player) => (state.winnerIds || []).includes(player.playerId));
    const iWon = (state.winnerIds || []).includes(me.playerId);
    const winnerText = winners.length ? winners.map((player) => player.name).join(', ') : 'Game over';

    ui.content.innerHTML = `
      <div class="qv2-home">
        <section class="qv2-result-hero qv2-glass">
          <div class="qv2-result-icon">${iWon ? '🏆' : '🎉'}</div>
          <div class="qv2-result-title">${iWon ? 'Victory!' : 'Game finished'}</div>
          <div class="qv2-result-text">${escapeHtml(winnerText)}</div>\n        </section>\n        <section class="qv2-section qv2-glass">\n          <div class="qv2-section-head"><h3 class="qv2-section-title">Results</h3><div class="qv2-section-meta">${state.totalQuartets || catalog.length} quartets</div></div>\n          <div class="qv2-leaderboard">${(state.score || []).map((player, index) => `
            <div class="qv2-leader-row">
              <div class="qv2-place">${index + 1}</div>
              <div class="qv2-leader-name">${escapeHtml(player.name)}${player.playerId === me.playerId ? ' · you' : ''}</div>
              <div class="qv2-leader-score">🏆 ${Number(player.quartetsCount || 0)}</div>
            </div>`).join('')}</div>
        </section>
        ${me.isHost ? '<button class="qv2-btn qv2-btn--primary qv2-btn--full" data-action="restart-game">New game</button>' : '<div class="qv2-event"><span class="qv2-event-icon">⏳</span><span>The host can start a new game in this room.</span></div>'}\n        <button class="qv2-btn qv2-btn--danger qv2-btn--full" data-action="leave-room">Leave room</button>\n      </div>\n    `;
  }

  function renderLastEvent(event, meId) {
    if (!event?.type) return null;
    if (event.type === 'ask_success') {
      const actor = event.actorId === meId ? 'You' : escapeHtml(event.actorName || 'Player');
      const target = event.targetId === meId ? 'you have' : `у ${escapeHtml(event.targetName || 'player')}`;
      const extra = Array.isArray(event.completedQuartets) && event.completedQuartets.length
        ? ` Quartet completed «${escapeHtml(event.completedQuartets.map(title=>window.AppLanguage?.text(title)||title).join(', '))}» 🏆`
        : '';
      const verb = event.actorId === meId ? 'received' : 'received';
      return { className: 'is-success', icon: '✓', text: `${actor} ${verb} card «${escapeHtml(cardById.get(event.cardId)?.title || window.AppLanguage?.text(event.cardTitle) || event.cardTitle)}» ${target}.${extra}` };
    }
    if (event.type === 'ask_miss') {
      const actor = event.actorId === meId ? 'Your request' : `Player request ${escapeHtml(event.actorName || '')}`;
      return { className: 'is-miss', icon: '↻', text: `${actor}: cards «${escapeHtml(cardById.get(event.cardId)?.title || window.AppLanguage?.text(event.cardTitle) || event.cardTitle)}» not found. Previous turn ended.` };
    }
    if (event.type === 'turn_timeout') return { className: 'is-miss', icon: '⌛', text: `${escapeHtml(event.actorName || 'Player')} ran out of time. Turn passed on.` };
    if (event.type === 'game_started') return { className: 'is-info', icon: '▶', text: 'Game started. The first turn is active.' };
    return null;
  }

  function handleStateTransition(previous, next) {
    if (!next) return;
    const event = next.lastEvent;
    const isNewEvent = !!event?.id && event.id !== lastEventId;
    const meId = next.me?.playerId;
    const previousTurn = previous?.turnPlayerId || '';
    const nextTurn = next.turnPlayerId || '';
    const turnChanged = !!previous && previousTurn !== nextTurn;

    if (isNewEvent) {
      lastEventId = event.id;
      handleServerEvent(event, next);
    }

    if (!previous && next.status === 'playing') {
      announceTurnStart(next, 'Game continues');
      return;
    }

    if (previous?.status === 'lobby' && next.status === 'playing') {
      resetSelection();
      announceTurnStart(next, 'Game started');
      return;
    }

    if (next.status === 'finished' && previous?.status !== 'finished') {
      resetSelection();
      showTurnNotice('Game over', 'Counting final quartets', 'success', '🏆', 2200);
      haptic('success');
      return;
    }

    if (previous?.status === 'playing' && next.status === 'playing' && turnChanged) {
      resetSelection();
      const previousName = playerNameById(previous, previousTurn) || 'Player';
      if (nextTurn === meId) {
        showTurnNotice('Previous turn ended', `${previousName} ended their turn · it is your turn now`, 'mine', '✦', 2400);
        haptic('success');
      } else {
        showTurnNotice('Turn ended', `${previousName} ended their turn · now ${next.turnPlayerName || 'next player'}`, 'waiting', '↻', 2200);
        if (previousTurn === meId) haptic('warning');
      }
      return;
    }

    if (previous?.status === 'playing' && next.status === 'playing' && !turnChanged && isNewEvent && event?.type === 'ask_success') {
      selectedCardId = '';
      if (event.actorId === meId) {
        showTurnNotice('Successful request', 'Card received · your turn continues', 'success', '✓', 1900);
        haptic('success');
      } else {
        showTurnNotice('Turn continues', `${event.actorName || 'Player'} received a card and plays again`, 'waiting', '↻', 1700);
      }
    }
  }

  function handleServerEvent(event, nextState) {
    const meId = nextState?.me?.playerId;
    if (event.type === 'ask_success') {
      if (event.actorId === meId) showToast(`Card «${cardById.get(event.cardId)?.title || window.AppLanguage?.text(event.cardTitle) || event.cardTitle}» received`, 'success');
      else if (event.targetId === meId) {
        showToast(`${event.actorName} received from you «${cardById.get(event.cardId)?.title || window.AppLanguage?.text(event.cardTitle) || event.cardTitle}»`, 'info');
        haptic('warning');
      }
    } else if (event.type === 'ask_miss' && event.actorId === meId) {
      showToast('No card — your turn is over', 'info');
    } else if (event.type === 'player_joined') {
      if (event.playerId !== meId) showToast(`${event.playerName} joined the room`, 'info');
    } else if (event.type === 'player_left') {
      if (event.playerId !== meId) showToast(`${event.playerName} left the room`, 'info');
    }
  }

  function announceTurnStart(next, prefix) {
    if (next.turnPlayerId === next.me?.playerId) {
      showTurnNotice(prefix, 'Your turn has started · choose an opponent and a card', 'mine', '✦', 2300);
      haptic('success');
    } else {
      showTurnNotice(prefix, `First turn ${next.turnPlayerName || 'player'}`, 'waiting', '▶', 2100);
    }
  }

  async function sendAction(action, payload = {}, button = null) {
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('No connection to room');
    if (button) setButtonBusy(button, true, 'Sending…');
    try { socket.send(JSON.stringify({ type: 'action', action, payload })); }
    finally { if (button) setTimeout(() => setButtonBusy(button, false), 700); }
  }

  async function confirmLeave() {
    const ok = window.confirm(state?.status === 'playing'
      ? 'Leave the game? Your remaining cards will be redistributed among players.'
      : 'Leave room?');
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
      showToast('Code copied', 'success');
    } catch { showToast(`Room code: ${roomId}`, 'info'); }
  }

  async function shareRoom() {
    if (!roomId) return;
    const text = `Join Quartet. Room code: ${roomId}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Bible Quartet', text });
      else await copyRoomCode();
    } catch (error) {
      if (error?.name !== 'AbortError') await copyRoomCode();
    }
  }

  function openRules() {
    ui.modalRoot.innerHTML = `\n      <div class="qv2-modal" data-action="close-modal">\n        <div class="qv2-modal-card" data-modal-card>\n          <h3>How to play Quartet</h3>\n          <ol>\n            <li>Each group has four cards. Collect the most complete quartets.</li>\n            <li>When the top shows <b>«Your turn”</b>, choose an opponent first.</li>\n            <li>Then browse your quartets and choose a missing card.</li>\n            <li>Check your selection below and tap <b>«Ask for card”</b>.</li>\n            <li>If the opponent has the card, you receive it and keep your turn.</li>\n            <li>If they do not have it or time runs out, the turn passes to the next player.</li>\n            <li>Collect all four cards and the quartet is counted automatically.</li>\n          </ol>\n          <button class="qv2-btn qv2-btn--primary qv2-btn--full" data-action="close-modal">Got it</button>\n        </div>\n      </div>\n    `;
  }

  function closeModal() { ui.modalRoot.innerHTML = ''; }

  function persistNameFromInput() {
    playerName = String(document.getElementById('qv2-player-name')?.value || defaultName)
      .replace(/[<>\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 32) || defaultName;
    localStorage.setItem(LS.playerName, playerName);
  }

  function reconcileSelection(previous, next) {
    if (!next || next.status !== 'playing') {
      resetSelection();
      return;
    }
    const myTurn = next.turnPlayerId === next.me?.playerId;
    if (!myTurn) {
      resetSelection();
      return;
    }
    if (previous && previous.turnPlayerId !== next.turnPlayerId) resetSelection();
    const targets = availableTargets(next);
    if (selectedTargetId && !targets.some((player) => player.playerId === selectedTargetId)) selectedTargetId = '';
    if (selectedCardId && next.me?.hand?.includes(selectedCardId)) selectedCardId = '';
    if (selectedCardId) {
      const q = quartetByCardId.get(selectedCardId);
      const ownsSameQuartet = q?.cards?.some((card) => next.me?.hand?.includes(card.id));
      if (!ownsSameQuartet) selectedCardId = '';
    }
  }

  function resetSelection() {
    selectedTargetId = '';
    selectedCardId = '';
  }

  function availableTargets(sourceState = state) {
    const meId = sourceState?.me?.playerId;
    return (sourceState?.players || []).filter((player) => player.isActive !== false && player.playerId !== meId && player.cardsCount > 0);
  }

  function isMyTurn() {
    return !!state?.me?.playerId && state.status === 'playing' && state.turnPlayerId === state.me.playerId;
  }

  function playerNameById(sourceState, playerId) {
    return sourceState?.players?.find((player) => player.playerId === playerId)?.name || '';
  }

  function clearRoomSession() {
    roomId = '';
    sessionToken = '';
    state = null;
    resetSelection();
    reconnectAttempt = 0;
    localStorage.removeItem(LS.roomId);
  }

  function setConnection(mode, text) {
    if (!ui.connection) return;
    ui.connection.classList.remove('is-online', 'is-offline');
    if (mode === 'online') ui.connection.classList.add('is-online');
    if (mode === 'offline') ui.connection.classList.add('is-offline');
    if (ui.connectionText) ui.connectionText.textContent = text;
    // На узких экранах подпись скрывается вёрсткой и остаётся только цветная
    // точка. Без имени она ничего не сообщает — ни глазами, ни озвучкой.
    ui.connection.setAttribute('role', 'status');
    ui.connection.setAttribute('title', text);
    ui.connection.setAttribute('aria-label', `Connection: ${text}`);
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
    ui.toast.className = `qv2-toast is-visible is-${type}`;
    toastTimer = setTimeout(() => { if (ui.toast) ui.toast.className = 'qv2-toast'; }, 2500);
  }

  function showTurnNotice(title, text, mode = 'waiting', icon = '↻', duration = 2100) {
    if (!ui.turnNotice) return;
    clearTimeout(turnNoticeTimer);
    ui.turnNoticeTitle.textContent = title;
    ui.turnNoticeText.textContent = text;
    ui.turnNoticeIcon.textContent = icon;
    ui.turnNotice.className = `qv2-turn-notice is-visible is-${mode}`;
    turnNoticeTimer = setTimeout(() => { if (ui.turnNotice) ui.turnNotice.className = 'qv2-turn-notice'; }, duration);
  }

  function haptic(kind) {
    try {
      if (typeof window.appHaptic === 'function') return window.appHaptic(kind);
      if (!tg?.HapticFeedback) return;
      if (kind === 'selection') tg.HapticFeedback.selectionChanged();
      else tg.HapticFeedback.notificationOccurred(kind === 'warning' ? 'warning' : 'success');
    } catch {}
  }

  function startTurnClock() {
    clearInterval(turnTimerInterval);
    turnTimerInterval = setInterval(updateTurnTimer, 500);
  }

  function updateTurnTimer() {
    const element = document.getElementById('qv2-turn-timer');
    const progress = document.getElementById('qv2-turn-progress');
    const banner = document.getElementById('qv2-turn-banner');
    if (!element || !state?.turnDeadlineMs || state.status !== 'playing') return;
    const seconds = Math.max(0, Math.ceil((Number(state.turnDeadlineMs) - Date.now()) / 1000));
    const percent = Math.max(0, Math.min(100, (seconds / TURN_TIMEOUT_SECONDS) * 100));
    element.textContent = `${seconds}с`;
    if (progress) progress.style.width = `${percent}%`;
    if (banner) banner.classList.toggle('is-urgent', seconds <= 15);
  }

  function prefersReducedMotion() {
    return document.documentElement.classList.contains('reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }

  function normalizeRoomId(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  function safeDomId(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
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

  /*
    Возврат на экран. Переподключение само себя не назначает, пока приложение
    свёрнуто — и правильно делает: незачем ходить в сеть из фона. Но и назад оно
    не возвращалось: таймер, доживший до сворачивания, отменялся, а нового не
    ставил никто. Человек уходил в другой чат на минуту и возвращался в мёртвую
    комнату. Отсчёт сбрасывается, чтобы вход был сразу, а не через полминуты.
  */
  function onVisible() {
    if (destroyed || leaving || document.hidden || !roomId) return;
    if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;
    reconnectAttempt = 0;
    reconnecting = false;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    joinOrResume(roomId, true).catch(() => scheduleReconnect());
  }
  document.addEventListener('visibilitychange', onVisible);

  function cleanup() {
    destroyed = true;
    document.removeEventListener('visibilitychange', onVisible);
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
    clearTimeout(toastTimer);
    clearTimeout(turnNoticeTimer);
    closeSocket(false);
    try { tg?.disableClosingConfirmation?.(); } catch {}
    window.__quartetCleanup = null;
  }
}

window.startQuartetGame = startQuartetGame;
