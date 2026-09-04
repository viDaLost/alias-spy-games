// games/spy-online.js — «Шпион» по сети, с текстовым чатом.
//
// Отличие от игры на одном телефоне: локацию и роли раздаёт воркер, и каждый
// видит только свою. Клиент никогда не знает ни локацию (если он шпион), ни
// чужие роли — до экрана итогов их просто нет в приходящем состоянии.
//
// Транспорт двухуровневый, как в «Квартете»: WebSocket, а если он не встал
// (корпоративный прокси, старый WebView), клиент переходит на HTTP-опрос и
// партия продолжается.
//
// Обсуждение идёт в текстовом чате — том же, что и в других играх набора.
// Переписка не чистится между этапами: она и есть улика, по которой голосуют.

function startSpyOnlineGame() {
  const container = document.getElementById('game-container');
  if (!container) return;

  const tg = window.Telegram?.WebApp || null;
  try { tg?.expand?.(); } catch {}

  const LS = {
    roomId: 'spy_online_room_id',
    name: 'spy_online_player_name',
    guestId: 'spy_online_guest_id',
  };

  const backendBase = resolveBackendBase();
  const guestId = getOrCreateGuestId();
  const telegramInitData = String(tg?.initData || '');
  const telegramUser = tg?.initDataUnsafe?.user || {};
  const defaultName = String(telegramUser.first_name || telegramUser.username || '').trim();

  let state = null;
  let roomId = localStorage.getItem(LS.roomId) || '';
  let playerName = localStorage.getItem(LS.name) || defaultName;
  let sessionToken = '';
  let socket = null;
  let pollTimer = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let transport = 'ws';
  let destroyed = false;
  let leaving = false;
  let screen = 'home';
  let roleFaceUp = false;
  let clockTimer = null;
  let toastTimer = null;
  let errorText = '';

  // Черновик сообщения переживает перерисовку: состояние комнаты приходит
  // каждую секунду, и без этого набранный текст стирался бы на полуслове.
  let chatDraft = '';
  let chatSeen = 0;
  let chatOpen = false;

  injectStyles();
  window.__spyOnlineCleanup = cleanup;

  boot();

  async function boot() {
    if (!backendBase) return renderBackendMissing();
    if (roomId) {
      renderConnecting('Возвращаемся в комнату…');
      try {
        await joinRoom(roomId, true);
        return;
      } catch (error) {
        console.warn('Spy online resume failed', error);
        forgetRoom();
      }
    }
    renderHome();
  }

  /* ------------------------------------------------------------------ *
   * Транспорт                                                           *
   * ------------------------------------------------------------------ */

  function resolveBackendBase() {
    const fromWindow = String(window.SPY_BACKEND_URL || '').trim();
    const fromMeta = String(document.querySelector('meta[name="spy-backend"]')?.content || '').trim();
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

  function identity() {
    return { name: playerName || 'Игрок', guestId, telegramInitData: telegramInitData || undefined };
  }

  async function api(path, body) {
    const response = await fetch(`${backendBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw Object.assign(new Error(payload.error || `Сервер ответил ${response.status}`), { code: payload.code });
    }
    return payload;
  }

  async function createRoom() {
    const requestId = `${guestId}-${Date.now()}`;
    const payload = await api('/rooms', { ...identity(), requestId });
    adoptSession(payload);
  }

  async function joinRoom(code, silent = false) {
    const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normalized.length < 4) throw new Error('Код комнаты — от четырёх символов');
    if (!silent) renderConnecting('Входим в комнату…');
    const payload = await api(`/rooms/${normalized}`.concat('/join'), identity());
    adoptSession(payload);
  }

  function adoptSession(payload) {
    roomId = String(payload.roomId || '');
    sessionToken = String(payload.sessionToken || '');
    state = payload.state || null;
    localStorage.setItem(LS.roomId, roomId);
    localStorage.setItem(LS.name, playerName || 'Игрок');
    screen = 'room';
    roleFaceUp = false;
    openSocket();
    renderRoom();
  }

  function openSocket() {
    if (destroyed || !roomId || !sessionToken) return;
    closeSocket();
    let url;
    try {
      url = new URL(`${backendBase}/rooms/${roomId}/ws`);
    } catch {
      return startPolling();
    }
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', sessionToken);

    try {
      socket = new WebSocket(url.toString());
    } catch {
      return startPolling();
    }

    socket.addEventListener('open', () => {
      transport = 'ws';
      reconnectAttempt = 0;
      stopPolling();
      renderRoom();
    });
    socket.addEventListener('message', (event) => {
      let payload;
      try { payload = JSON.parse(event.data); } catch { return; }
      handleServerMessage(payload);
    });
    socket.addEventListener('close', () => {
      socket = null;
      if (destroyed || leaving) return;
      scheduleReconnect();
    });
    socket.addEventListener('error', () => { try { socket?.close(); } catch {} });
  }

  function closeSocket() {
    if (!socket) return;
    try { socket.close(); } catch {}
    socket = null;
  }

  function scheduleReconnect() {
    if (destroyed || leaving || reconnectTimer) return;
    reconnectAttempt += 1;
    // Три неудачных попытки — значит WebSocket в этой сети не пройдёт.
    // Партию это ронять не должно: уходим на опрос и играем дальше.
    if (reconnectAttempt > 3) {
      startPolling();
      return;
    }
    const delay = Math.min(6000, 600 * reconnectAttempt);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket();
    }, delay);
  }

  function startPolling() {
    if (destroyed || pollTimer) return;
    transport = 'poll';
    renderRoom();
    const tick = async () => {
      if (destroyed || !roomId || !sessionToken) return;
      try {
        const response = await fetch(`${backendBase}/rooms/${roomId}/poll?token=${encodeURIComponent(sessionToken)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const payload = await response.json().catch(() => ({}));
        if (payload.closed) return handleRoomClosed();
        if (payload.state) applyState(payload.state);
      } catch (error) {
        console.warn('Spy poll failed', error);
      }
    };
    pollTimer = setInterval(tick, 1500);
    tick();
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function handleServerMessage(payload) {
    if (payload.type === 'state') return applyState(payload.state);
    if (payload.type === 'error') return toast(payload.error || 'Ошибка комнаты');
  }

  function applyState(next) {
    const previous = state;
    state = next;
    if (chatOpen) chatSeen = (next.chat || []).length;
    window.GameChatToasts?.sync({
      key: `spy:${roomId}`,
      messages: next.chat || [],
      selfId: next.me?.playerId || '',
      chatVisible: () => chatOpen && onScreen(container.querySelector('[data-spy-chat-log]')),
      onOpen: openChat,
    });
    // Новая раздача — карта снова рубашкой вверх, иначе роль показалась бы
    // сама собой тому, кто просто не закрыл прошлый экран.
    if (previous && previous.round !== next.round) roleFaceUp = false;
    if (previous?.status !== next.status) roleFaceUp = next.status === 'roles' ? false : roleFaceUp;
    if (screen === 'room') renderRoom();
  }

  function handleRoomClosed() {
    stopPolling();
    closeSocket();
    forgetRoom();
    state = null;
    screen = 'home';
    toast('Комната закрыта');
    renderHome();
  }

  function send(action, payload = {}) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'action', action, payload }));
      return;
    }
    // На опросе действие уходит отдельным запросом с идентификатором, чтобы
    // повтор при обрыве не сыграл его дважды.
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    fetch(`${backendBase}/rooms/${roomId}/poll?token=${encodeURIComponent(sessionToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload, requestId }),
    })
      .then((response) => response.json().catch(() => ({})))
      .then((result) => {
        if (result.closed) return handleRoomClosed();
        if (result.ok === false) return toast(result.error || 'Действие не прошло');
        if (result.state) applyState(result.state);
      })
      .catch((error) => toast(String(error?.message || error)));
    if (!pollTimer) startPolling();
  }

  function forgetRoom() {
    localStorage.removeItem(LS.roomId);
    roomId = '';
    sessionToken = '';
  }

  function cleanup() {
    window.GameChatToasts?.reset(`spy:${roomId}`);
    destroyed = true;
    leaving = true;
    stopPolling();
    closeSocket();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (clockTimer) clearInterval(clockTimer);
    if (toastTimer) clearTimeout(toastTimer);
    reconnectTimer = null;
    clockTimer = null;
    toastTimer = null;
  }

  /* ------------------------------------------------------------------ *
   * Экраны                                                              *
   * ------------------------------------------------------------------ */

  function renderBackendMissing() {
    screen = 'home';
    container.innerHTML = `
      <section class="app-error-card fade-in">
        <div class="app-error-icon">!</div>
        <h2>Онлайн пока не настроен</h2>
        <p>В <code>index.html</code> нужен адрес воркера в meta <b>spy-backend</b>.</p>
        <button class="menu-button" data-spy-online="single">Играть на одном телефоне</button>
        <button class="back-button" data-spy-online="menu">В меню</button>
      </section>`;
    bindHome();
  }

  function renderConnecting(text) {
    screen = 'connecting';
    container.innerHTML = `
      <div class="spy-online-wrap fade-in">
        <div class="app-game-loading"><div class="app-loader__ring"></div><p>${esc(text)}</p></div>
      </div>`;
  }

  function renderHome() {
    screen = 'home';
    container.innerHTML = `
      <div class="spy-online-wrap fade-in">
        <h2>🌐 Шпион по сети</h2>
        <p class="spy-online-lead">Каждый играет со своего телефона. Роль видит только её хозяин, а обсуждать можно прямо в игре — чат встроен.</p>

        ${errorText ? `<div class="spy-online-alert">${esc(errorText)}</div>` : ''}

        <label class="setup-label" for="spyOnlineName">Ваше имя</label>
        <input id="spyOnlineName" class="input input-lg" maxlength="24" placeholder="Как вас звать" value="${esc(playerName)}">

        <button class="menu-button" data-spy-online="create">Создать комнату</button>

        <div class="spy-online-divider"><span>или войти по коду</span></div>

        <label class="setup-label" for="spyOnlineCode">Код комнаты</label>
        <input id="spyOnlineCode" class="input input-lg spy-online-code-input" maxlength="10" autocomplete="off"
               autocapitalize="characters" spellcheck="false" placeholder="ABCDE">
        <button class="correct-button" data-spy-online="join">Войти</button>

        <button class="menu-button" data-spy-online="single">Играть на одном телефоне</button>
        <button class="back-button" data-spy-online="menu">Главное меню</button>
      </div>`;
    bindHome();
  }

  function bindHome() {
    const nameInput = container.querySelector('#spyOnlineName');
    nameInput?.addEventListener('input', () => { playerName = nameInput.value.trim(); });
    const codeInput = container.querySelector('#spyOnlineCode');
    codeInput?.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    codeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') container.querySelector('[data-spy-online="join"]')?.click();
    });

    container.querySelectorAll('[data-spy-online]').forEach((node) => {
      node.addEventListener('click', async () => {
        const action = node.dataset.spyOnline;
        if (action === 'menu') return window.goToMainMenu?.();
        if (action === 'single') return window.startSpyGame?.('web/data/spy_locations.json', 'single');
        errorText = '';
        node.disabled = true;
        try {
          if (action === 'create') await createRoom();
          if (action === 'join') await joinRoom(codeInput?.value || '');
        } catch (error) {
          errorText = String(error?.message || error);
          renderHome();
        } finally {
          node.disabled = false;
        }
      });
    });
  }

  function renderRoom() {
    screen = 'room';
    if (!state) return renderConnecting('Ждём комнату…');
    const body = {
      lobby: renderLobby,
      roles: renderRoles,
      discussion: renderDiscussion,
      voting: renderVoting,
      results: renderResults,
    }[state.status] || renderLobby;

    container.innerHTML = `
      <div class="spy-online-wrap fade-in">
        ${renderTopBar()}
        ${body()}
        ${renderChatPanel()}
        <button class="back-button" data-spy-room="leave">Выйти из комнаты</button>
      </div>`;
    bindRoom();
    startClock();
  }

  function renderTopBar() {
    const online = state.players.filter((item) => item.online).length;
    return `
      <div class="spy-room-top">
        <button class="spy-room-code" data-spy-room="copy" title="Скопировать код">
          <span class="spy-room-code__label">Комната</span>
          <strong>${esc(state.roomId)}</strong>
        </button>
        <div class="spy-room-meta">
          <span class="spy-room-dot ${transport === 'ws' ? 'is-live' : 'is-poll'}"></span>
          ${online} из ${state.players.length} на связи
        </div>
      </div>`;
  }

  function renderLobby() {
    const canStart = state.isHost && state.players.length >= state.minPlayers;
    return `
      <h2>Комната собирается</h2>
      <p class="spy-online-lead">Передайте код друзьям. Партия начнётся, когда ведущий нажмёт «Раздать роли».</p>
      ${renderPlayers()}
      ${state.isHost ? `
        <div class="setup-grid">
          <div class="setup-block">
            <label class="setup-label" for="spySpyCount">Шпионов</label>
            <input id="spySpyCount" type="number" class="number-input input-lg" min="1" max="${Math.max(1, state.players.length - 1)}" value="${state.spyCount}">
          </div>
          <div class="setup-block">
            <label class="setup-label" for="spyRoundMinutes">Обсуждение, мин</label>
            <input id="spyRoundMinutes" type="number" class="number-input input-lg" min="1" max="20" value="${Math.round(state.roundSeconds / 60)}">
          </div>
        </div>` : `
        <div class="card"><strong>Настройки ведущего</strong>
          <p style="margin-top:8px;color:var(--ink-soft);font-size:1rem;">Шпионов: ${state.spyCount} · обсуждение ${Math.round(state.roundSeconds / 60)} мин</p>
        </div>`}
      ${state.isHost
        ? `<button class="correct-button" data-spy-room="start" ${canStart ? '' : 'disabled'}>Раздать роли</button>
           ${canStart ? '' : `<p class="hint">Нужно минимум ${state.minPlayers} игрока</p>`}`
        : '<div class="card"><strong>Ждём ведущего</strong><p style="margin-top:8px;color:var(--ink-soft);font-size:1rem;">Он раздаст роли, когда все соберутся.</p></div>'}`;
  }

  function renderRoles() {
    const me = state.me || {};
    const waiting = state.players.filter((item) => !item.ready).length;
    return `
      <h2>Ваша роль</h2>
      <p class="spy-online-lead">Смотрите только свой экран. Никто другой вашу роль не увидит.</p>
      <button class="spy-online-card ${roleFaceUp ? 'is-open' : ''}" data-spy-room="flip" type="button">
        <span class="spy-online-card__face spy-online-card__back">
          <span class="spy-online-card__crest">🕵️</span>
          <span class="spy-online-card__hint">Нажмите, чтобы посмотреть</span>
        </span>
        <span class="spy-online-card__face spy-online-card__front ${me.isSpy ? 'is-spy' : 'is-citizen'}">
          ${me.isSpy
            ? '<span class="spy-online-card__role">Вы шпион</span><span class="spy-online-card__value">Локация неизвестна</span><span class="spy-online-card__hint">Слушайте и не выдайте себя</span>'
            : `<span class="spy-online-card__role">Локация</span><span class="spy-online-card__value">${esc(state.location)}</span><span class="spy-online-card__hint">Найдите того, кто её не знает</span>`}
        </span>
      </button>
      ${roleFaceUp
        ? `<button class="correct-button" data-spy-room="roleSeen">Запомнил</button>`
        : ''}
      <p class="hint">${waiting ? `Ещё не готовы: ${waiting}` : 'Все готовы'}</p>
      ${state.isHost ? '<button class="menu-button" data-spy-room="forceDiscussion">Начать обсуждение</button>' : ''}
      ${renderPlayers()}`;
  }

  function renderDiscussion() {
    const me = state.me || {};
    return `
      <h2>🗣 Обсуждение</h2>
      <div class="spy-online-clock" data-spy-clock>—</div>
      <p class="spy-online-lead">Задавайте вопросы по очереди. Шпион не знает локацию, но пытается её вычислить.</p>
      ${me.isSpy ? '' : `<div class="card"><strong>Локация</strong><p style="margin-top:8px;color:var(--ink-soft);font-size:1.05rem;">${esc(state.location)}</p></div>`}
      ${me.isSpy ? renderGuessBlock() : ''}
      ${state.isHost ? '<button class="correct-button" data-spy-room="beginVoting">Перейти к голосованию</button>' : ''}
      ${renderPlayers()}`;
  }

  function renderGuessBlock() {
    return `
      <div class="card spy-online-guess">
        <strong>Назвать локацию</strong>
        <p style="margin-top:6px;color:var(--ink-soft);font-size:.98rem;">Угадаете — победа ваша сразу. Ошибётесь — партия закончится не в вашу пользу.</p>
        <input id="spyGuessInput" class="input input-lg" maxlength="60" placeholder="Например: Иерусалим">
        <button class="menu-button" data-spy-room="guess">Назвать</button>
      </div>`;
  }

  function renderVoting() {
    const me = state.me || {};
    const options = state.players.filter((item) => item.playerId !== me.playerId);
    const pending = state.players.filter((item) => !item.voted).length;
    return `
      <h2>🎯 Голосование</h2>
      <p class="spy-online-lead">Кто, по-вашему, шпион? Голоса откроются, когда проголосуют все.</p>
      <div class="spy-vote-list">
        ${options.map((item) => `
          <button class="spy-vote-option ${me.votedFor === item.playerId ? 'is-picked' : ''}" data-spy-vote="${esc(item.playerId)}">
            <span class="spy-vote-name">${esc(item.name)}</span>
            <span class="spy-vote-mark">${me.votedFor === item.playerId ? '✓' : ''}</span>
          </button>`).join('')}
      </div>
      <p class="hint">${pending ? `Ждём ещё ${pending}` : 'Все проголосовали'}</p>
      ${me.isSpy ? renderGuessBlock() : ''}
      ${renderPlayers()}`;
  }

  function renderResults() {
    const outcome = state.outcome || {};
    const spies = state.players.filter((item) => item.role === 'spy');
    const accused = state.players.find((item) => item.playerId === outcome.accusedId);
    const guessed = outcome.kind === 'guess';
    return `
      <h2>${outcome.spyWon ? '🕵️ Победа шпиона' : '🎉 Шпион раскрыт'}</h2>
      <div class="card spy-online-outcome ${outcome.spyWon ? 'is-spy' : 'is-town'}">
        <strong>Локация: ${esc(outcome.location || state.location)}</strong>
        <p style="margin-top:8px;color:var(--ink-soft);font-size:1rem;">
          ${guessed
            ? `Шпион назвал «${esc(outcome.guess)}» — ${outcome.spyWon ? 'и попал' : 'и промахнулся'}.`
            : outcome.tie
              ? 'Голоса разделились поровну, и шпион остался неразоблачённым.'
              : `Больше всего голосов у игрока ${esc(accused?.name || '—')}.`}
        </p>
      </div>
      <div class="card">
        <strong>Шпион${spies.length > 1 ? 'ы' : ''}: ${spies.map((item) => esc(item.name)).join(', ') || '—'}</strong>
      </div>
      ${outcome.tally?.length ? `
        <div class="spy-tally">
          ${outcome.tally.map((row) => {
            const player = state.players.find((item) => item.playerId === row.playerId);
            return `<div class="spy-tally-row"><span>${esc(player?.name || '—')}</span><b>${row.votes}</b></div>`;
          }).join('')}
        </div>` : ''}
      ${state.isHost
        ? '<button class="correct-button" data-spy-room="start">Ещё партию</button><button class="menu-button" data-spy-room="backToLobby">В лобби</button>'
        : '<div class="card"><strong>Ждём ведущего</strong><p style="margin-top:8px;color:var(--ink-soft);font-size:1rem;">Он начнёт следующую партию.</p></div>'}
      ${renderPlayers()}`;
  }

  function renderPlayers() {
    return `
      <div class="spy-player-list">
        ${state.players.map((item) => `
          <div class="spy-player ${item.online ? '' : 'is-away'}">
            <span class="spy-player-dot ${item.online ? 'is-online' : ''}"></span>
            <span class="spy-player-name">${esc(item.name)}</span>
            ${item.isHost ? '<span class="spy-player-tag">ведущий</span>' : ''}
            ${item.role === 'spy' ? '<span class="spy-player-tag is-spy">шпион</span>' : ''}
            ${state.status === 'roles' && item.ready ? '<span class="spy-player-tag is-ok">готов</span>' : ''}
            ${state.status === 'voting' && item.voted ? '<span class="spy-player-tag is-ok">голос</span>' : ''}
          </div>`).join('')}
      </div>`;
  }

  /*
    Чат комнаты. Он же и есть обсуждение: игроки задают вопросы и ищут того,
    кто локации не знает. В лобби чат тоже открыт — там договариваются о
    составе, а лишний экран для этого заводить незачем.
  */
  function renderChatPanel() {
    const messages = state.chat || [];
    const unread = Math.max(0, messages.length - chatSeen);
    return `
      <div class="spy-chat">
        <div class="spy-chat-head">
          <strong>Чат</strong>
          ${unread && !chatOpen ? `<span class="spy-chat-badge">${unread}</span>` : ''}
          <button class="spy-chat-toggle" data-spy-room="chatToggle">${chatOpen ? 'Свернуть' : 'Открыть'}</button>
        </div>
        ${chatOpen ? `
          <div class="spy-chat-log" data-spy-chat-log>
            ${messages.length
              ? messages.map((entry) => `
                  <div class="spy-chat-line ${entry.playerId === state.me?.playerId ? 'is-mine' : ''}">
                    <span class="spy-chat-author">${esc(entry.name)}</span>
                    <span class="spy-chat-text">${esc(entry.text)}</span>
                  </div>`).join('')
              : '<p class="spy-chat-empty">Пока тихо. Задайте первый вопрос.</p>'}
          </div>
          <form class="spy-chat-form" data-spy-chat-form>
            <input class="spy-chat-input" data-spy-chat-input maxlength="300"
                   placeholder="Спросить у стола…" autocomplete="off" value="${esc(chatDraft)}">
            <button class="spy-chat-send" type="submit" aria-label="Отправить">➤</button>
          </form>` : ''}
      </div>`;
  }

  function bindRoom() {
    container.querySelectorAll('[data-spy-room]').forEach((node) => {
      node.addEventListener('click', () => onRoomAction(node.dataset.spyRoom, node));
    });

    const chatInput = container.querySelector('[data-spy-chat-input]');
    chatInput?.addEventListener('input', () => { chatDraft = chatInput.value; });
    container.querySelector('[data-spy-chat-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = String(chatInput?.value || '').trim();
      if (!text) return;
      send('chat', { text });
      chatDraft = '';
      if (chatInput) chatInput.value = '';
    });
    // Лента открывается на последнем сообщении: листать вручную к свежему
    // после каждого обновления никто не станет.
    const log = container.querySelector('[data-spy-chat-log]');
    if (log) log.scrollTop = log.scrollHeight;
    container.querySelectorAll('[data-spy-vote]').forEach((node) => {
      node.addEventListener('click', () => send('vote', { targetId: node.dataset.spyVote }));
    });
    const spyCount = container.querySelector('#spySpyCount');
    spyCount?.addEventListener('change', () => send('setSettings', { spyCount: Number(spyCount.value) }));
    const minutes = container.querySelector('#spyRoundMinutes');
    minutes?.addEventListener('change', () => send('setSettings', { roundSeconds: Math.round(Number(minutes.value) * 60) }));
  }

  async function onRoomAction(action, node) {
    if (action === 'copy') return copyRoomCode();
    if (action === 'flip') { roleFaceUp = !roleFaceUp; return renderRoom(); }
    if (action === 'roleSeen') return send('roleSeen');
    if (action === 'start') return send('startGame');
    if (action === 'forceDiscussion') return send('forceDiscussion');
    if (action === 'beginVoting') return send('beginVoting');
    if (action === 'backToLobby') return send('backToLobby');
    if (action === 'guess') {
      const input = container.querySelector('#spyGuessInput');
      const guess = String(input?.value || '').trim();
      if (!guess) return toast('Впишите локацию');
      return send('guess', { guess });
    }
    if (action === 'leave') return leaveRoomAndGoHome();
    if (action === 'chatToggle') {
      if (chatOpen) {
        chatOpen = false;
        renderRoom();
        return;
      }
      openChat();
    }
  }

  /** Раскрывает чат и подводит его к глазам — сюда же ведёт всплывшее уведомление. */
  function openChat() {
    chatOpen = true;
    chatSeen = (state?.chat || []).length;
    renderRoom();
    const log = container.querySelector('[data-spy-chat-log]');
    if (!onScreen(log)) log?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    container.querySelector('[data-spy-chat-input]')?.focus({ preventScroll: true });
  }

  /** Виден ли элемент в окне: у «Шпиона» чат легко уезжает за край при прокрутке. */
  function onScreen(element) {
    if (!element) return false;
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    return box.bottom > 0 && box.top < (window.innerHeight || document.documentElement.clientHeight);
  }

  function leaveRoomAndGoHome() {
    leaving = true;
    send('leave');
    stopPolling();
    closeSocket();
    forgetRoom();
    state = null;
    leaving = false;
    renderHome();
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(state.roomId);
      toast('Код скопирован');
    } catch {
      toast(`Код комнаты: ${state.roomId}`);
    }
  }

  function startClock() {
    if (clockTimer) clearInterval(clockTimer);
    const node = container.querySelector('[data-spy-clock]');
    if (!node) return;
    // Отсчёт ведётся от серверного дедлайна с поправкой на расхождение
    // часов: у телефонов оно бывает в минуты, и без поправки таймер
    // показывал бы у разных игроков разное время.
    const skew = Number(state.serverNow || 0) - Date.now();
    const tick = () => {
      const left = Math.max(0, Math.round((Number(state.roundDeadlineMs || 0) - (Date.now() + skew)) / 1000));
      const minutes = String(Math.floor(left / 60)).padStart(2, '0');
      const seconds = String(left % 60).padStart(2, '0');
      node.textContent = `${minutes}:${seconds}`;
      node.classList.toggle('is-urgent', left <= 30);
    };
    tick();
    clockTimer = setInterval(tick, 500);
  }

  function toast(message) {
    let node = document.getElementById('spy-online-toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'spy-online-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2600);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  }

  function injectStyles() {
    if (document.getElementById('spy-online-styles')) return;
    const style = document.createElement('style');
    style.id = 'spy-online-styles';
    style.textContent = SPY_ONLINE_CSS;
    document.head.appendChild(style);
  }
}

window.startSpyOnlineGame = startSpyOnlineGame;

const SPY_ONLINE_CSS = `
  .spy-online-wrap { width: min(100%, 560px); margin: 0 auto; display: grid; gap: 14px; padding-bottom: 24px; }
  .spy-online-wrap h2 { margin: 0; color: #312e81; font-size: clamp(1.6rem, 6.4vw, 2.1rem); font-weight: 950; letter-spacing: -.045em; }
  .spy-online-lead { margin: 0; color: rgba(49,46,129,.66); font-size: .98rem; line-height: 1.4; font-weight: 650; }
  .spy-online-wrap .setup-label, .spy-online-wrap .hint { text-align: left; }
  .spy-chat-head, .spy-tally-row, .spy-vote-option { text-align: left; }
  .spy-online-alert { padding: 12px 14px; border-radius: 16px; background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.28); color: #b91c1c; font-weight: 800; font-size: .94rem; }
  .spy-online-divider { display: flex; align-items: center; gap: 10px; color: rgba(49,46,129,.42); font-size: .82rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
  .spy-online-divider::before, .spy-online-divider::after { content: ''; flex: 1; height: 1px; background: rgba(49,46,129,.16); }
  .spy-online-code-input { text-transform: uppercase; letter-spacing: .32em; text-align: center; font-weight: 900; }

  .spy-room-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .spy-room-code { display: grid; gap: 2px; padding: 10px 16px; border: 0; border-radius: 18px; background: linear-gradient(135deg,#4f46e5,#7c3aed); color: #fff; cursor: pointer; text-align: left; }
  .spy-room-code__label { font-size: .68rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; opacity: .74; }
  .spy-room-code strong { font-size: 1.5rem; font-weight: 950; letter-spacing: .2em; }
  .spy-room-meta { display: flex; align-items: center; gap: 7px; color: rgba(49,46,129,.6); font-size: .84rem; font-weight: 800; }
  .spy-room-dot { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.18); }
  .spy-room-dot.is-poll { background: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,.18); }

  /* Карта роли: рубашка вверх, пока игрок сам её не перевернул. */
  .spy-online-card { width: min(80vw, 320px); aspect-ratio: 5/7; margin: 4px auto; border: 0; padding: 0; background: transparent; perspective: 1200px; cursor: pointer; display: block; -webkit-tap-highlight-color: transparent; }
  .spy-online-card__face { position: absolute; inset: 0; display: grid; align-content: center; justify-items: center; gap: 10px; padding: 22px; border-radius: 26px; backface-visibility: hidden; transition: transform .52s cubic-bezier(.4,0,.2,1); box-shadow: 0 18px 36px rgba(49,46,129,.2); }
  .spy-online-card { position: relative; }
  .spy-online-card__back { background: linear-gradient(150deg,#4338ca,#6d28d9); color: #ede9fe; transform: rotateY(0deg); }
  .spy-online-card__front { background: linear-gradient(150deg,#fef3c7,#fde68a); color: #78350f; transform: rotateY(180deg); }
  .spy-online-card__front.is-spy { background: linear-gradient(150deg,#fecaca,#fca5a5); color: #7f1d1d; }
  .spy-online-card.is-open .spy-online-card__back { transform: rotateY(-180deg); }
  .spy-online-card.is-open .spy-online-card__front { transform: rotateY(0deg); }
  .spy-online-card__crest { font-size: 3.4rem; }
  .spy-online-card__role { font-size: .82rem; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; opacity: .68; }
  .spy-online-card__value { font-size: clamp(1.3rem, 6vw, 1.9rem); font-weight: 950; line-height: 1.1; text-align: center; }
  .spy-online-card__hint { font-size: .84rem; font-weight: 700; opacity: .66; text-align: center; }

  .spy-online-clock { margin: 0 auto; padding: 8px 22px; border-radius: 999px; background: rgba(79,70,229,.1); color: #4338ca; font-size: 2rem; font-weight: 950; font-variant-numeric: tabular-nums; letter-spacing: .04em; }
  .spy-online-clock.is-urgent { background: rgba(239,68,68,.14); color: #b91c1c; animation: spyClockPulse 1s ease-in-out infinite; }
  @keyframes spyClockPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }

  .spy-online-guess { display: grid; gap: 10px; }
  .spy-vote-list { display: grid; gap: 8px; }
  .spy-vote-option { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 18px; border: 2px solid rgba(79,70,229,.18); border-radius: 18px; background: #fff; color: #312e81; font-size: 1.02rem; font-weight: 850; cursor: pointer; transition: transform .12s, border-color .12s, background .12s; }
  .spy-vote-option:active { transform: scale(.98); }
  .spy-vote-option.is-picked { border-color: #4f46e5; background: rgba(79,70,229,.1); }
  .spy-vote-mark { color: #4f46e5; font-weight: 950; }

  .spy-player-list { display: grid; gap: 6px; }
  /* Оболочка центрирует текст, а список игроков должен читаться слева. */
  .spy-player { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 14px; background: rgba(79,70,229,.06); font-size: .96rem; font-weight: 800; color: #312e81; text-align: left; }
  .spy-player.is-away { opacity: .48; }
  .spy-player-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(49,46,129,.24); flex: none; }
  .spy-player-dot.is-online { background: #22c55e; }
  .spy-player-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .spy-player-tag { padding: 2px 8px; border-radius: 999px; background: rgba(79,70,229,.16); font-size: .7rem; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
  .spy-player-tag.is-spy { background: rgba(239,68,68,.18); color: #b91c1c; }
  .spy-player-tag.is-ok { background: rgba(34,197,94,.18); color: #15803d; }
  .spy-player-mic { font-size: .92rem; }
  .spy-player-mic.is-muted { opacity: .5; }

  .spy-chat { display: grid; gap: 10px; padding: 12px 14px; border-radius: 20px; background: rgba(15,23,42,.05); border: 1px solid rgba(49,46,129,.12); }
  .spy-chat-head { display: flex; align-items: center; gap: 8px; color: #312e81; font-size: .96rem; }
  .spy-chat-head strong { flex: 1; }
  .spy-chat-badge { min-width: 20px; padding: 2px 7px; border-radius: 999px; background: #ef4444; color: #fff; font-size: .74rem; font-weight: 900; text-align: center; }
  .spy-chat-toggle { border: 0; border-radius: 10px; padding: 6px 12px; background: rgba(79,70,229,.12); color: #4338ca; font-size: .84rem; font-weight: 850; cursor: pointer; }
  /* Лента прокручивается сама, а не тянет за собой всю страницу: на телефоне
     иначе экран уезжает при каждом новом сообщении. */
  .spy-chat-log { max-height: 216px; overflow-y: auto; overscroll-behavior: contain; display: grid; gap: 6px; padding-right: 2px; }
  .spy-chat-line { display: grid; gap: 1px; padding: 7px 11px; border-radius: 12px; background: rgba(255,255,255,.72); text-align: left; }
  .spy-chat-line.is-mine { background: rgba(79,70,229,.12); }
  .spy-chat-author { color: rgba(49,46,129,.6); font-size: .74rem; font-weight: 900; letter-spacing: .02em; }
  .spy-chat-text { color: #312e81; font-size: .94rem; font-weight: 650; line-height: 1.35; overflow-wrap: anywhere; white-space: pre-wrap; }
  .spy-chat-empty { margin: 0; padding: 10px 2px; color: rgba(49,46,129,.5); font-size: .9rem; font-weight: 700; }
  .spy-chat-form { display: flex; gap: 8px; }
  .spy-chat-input { flex: 1; min-width: 0; min-height: 44px; padding: 10px 14px; border-radius: 14px; border: 2px solid rgba(79,70,229,.18); background: #fff; color: #312e81; font-size: 1rem; font-weight: 650; }
  .spy-chat-input:focus { outline: none; border-color: #4f46e5; }
  .spy-chat-send { flex: none; width: 46px; min-height: 44px; border: 0; border-radius: 14px; background: #4f46e5; color: #fff; font-size: 1.05rem; cursor: pointer; }
  .spy-chat-send:active { transform: scale(.95); }

  .spy-online-outcome.is-spy { border-left: 5px solid #ef4444; }
  .spy-online-outcome.is-town { border-left: 5px solid #22c55e; }
  .spy-tally { display: grid; gap: 5px; }
  .spy-tally-row { display: flex; justify-content: space-between; padding: 8px 14px; border-radius: 12px; background: rgba(79,70,229,.07); font-weight: 800; color: #312e81; }

  #spy-online-toast { position: fixed; left: 50%; bottom: 26px; z-index: 60; transform: translate(-50%, 14px); padding: 11px 18px; border-radius: 999px; background: rgba(30,27,75,.92); color: #ede9fe; font-size: .92rem; font-weight: 800; opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; }
  #spy-online-toast.is-visible { opacity: 1; transform: translate(-50%, 0); }

  @media (prefers-reduced-motion: reduce) {
    .spy-online-card__face, .spy-online-clock { transition: none; animation: none; }
  }
`;
