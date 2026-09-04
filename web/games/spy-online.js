// games/spy-online.js — «Шпион» по сети, с голосовым чатом.
//
// Отличие от игры на одном телефоне: локацию и роли раздаёт воркер, и каждый
// видит только свою. Клиент никогда не знает ни локацию (если он шпион), ни
// чужие роли — до экрана итогов их просто нет в приходящем состоянии.
//
// Транспорт двухуровневый, как в «Квартете»: WebSocket, а если он не встал
// (корпоративный прокси, старый WebView), клиент переходит на HTTP-опрос и
// партия продолжается. Голосовой чат при опросе тоже работает: сигналы
// WebRTC складываются в очередь на сервере и забираются тем же опросом.
//
// Звук идёт напрямую между телефонами (WebRTC mesh) — через воркер проходят
// только offer/answer/ICE. Меш выбран из-за размера комнаты: на 3–12 игроков
// он не требует ни медиасервера, ни платного трафика.

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

  const voice = createVoiceChat({
    sendSignal: (to, kind, data) => sendSignal(to, kind, data),
    onChange: () => { if (screen === 'room') renderRoom(); },
    onError: (message) => toast(message),
  });

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
        for (const signal of payload.signals || []) voice.handleSignal(signal);
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
    if (payload.type === 'signal') return voice.handleSignal(payload);
    if (payload.type === 'error') return toast(payload.error || 'Ошибка комнаты');
  }

  function applyState(next) {
    const previous = state;
    state = next;
    // Новая раздача — карта снова рубашкой вверх, иначе роль показалась бы
    // сама собой тому, кто просто не закрыл прошлый экран.
    if (previous && previous.round !== next.round) roleFaceUp = false;
    if (previous?.status !== next.status) roleFaceUp = next.status === 'roles' ? false : roleFaceUp;
    voice.syncPeers(next);
    if (screen === 'room') renderRoom();
  }

  function handleRoomClosed() {
    stopPolling();
    closeSocket();
    voice.leave();
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
        for (const signal of result.signals || []) voice.handleSignal(signal);
      })
      .catch((error) => toast(String(error?.message || error)));
    if (!pollTimer) startPolling();
  }

  function sendSignal(to, kind, data) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'signal', to, kind, data }));
      return;
    }
    fetch(`${backendBase}/rooms/${roomId}/poll?token=${encodeURIComponent(sessionToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal: { to, kind, data } }),
    }).catch(() => {});
  }

  function forgetRoom() {
    localStorage.removeItem(LS.roomId);
    roomId = '';
    sessionToken = '';
  }

  function cleanup() {
    destroyed = true;
    leaving = true;
    stopPolling();
    closeSocket();
    voice.leave();
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
        <p class="spy-online-lead">Каждый играет со своего телефона. Роль видит только её хозяин, а разговаривать можно прямо в игре — голосовой чат встроен.</p>

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
        ${renderVoicePanel()}
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
            ${item.voice.joined ? `<span class="spy-player-mic ${item.voice.muted ? 'is-muted' : ''}">${item.voice.muted ? '🔇' : '🎙'}</span>` : ''}
          </div>`).join('')}
      </div>`;
  }

  function renderVoicePanel() {
    const joined = voice.isJoined();
    const speaking = voice.speakingIds();
    const peers = state.players.filter((item) => item.voice.joined && item.playerId !== state.me?.playerId);
    return `
      <div class="spy-voice ${joined ? 'is-live' : ''}">
        <div class="spy-voice-head">
          <strong>Голосовой чат</strong>
          <span class="spy-voice-count">${peers.length ? `${peers.length} рядом` : 'никого'}</span>
        </div>
        ${voice.isSupported()
          ? `<div class="spy-voice-actions">
              <button class="spy-voice-btn ${joined ? 'is-on' : ''}" data-spy-room="voiceToggle">${joined ? 'Выйти из чата' : 'Подключить микрофон'}</button>
              ${joined ? `<button class="spy-voice-btn ${voice.isMuted() ? 'is-muted' : ''}" data-spy-room="voiceMute">${voice.isMuted() ? 'Включить' : 'Заглушить'}</button>` : ''}
             </div>
             ${joined && peers.length ? `
               <div class="spy-voice-peers">
                 ${peers.map((item) => `<span class="spy-voice-peer ${speaking.has(item.playerId) ? 'is-talking' : ''}">${esc(item.name)}</span>`).join('')}
               </div>` : ''}
             ${joined ? '<p class="hint">Звук идёт напрямую между телефонами, сервер его не слышит.</p>' : ''}`
          : '<p class="hint">Этот браузер не поддерживает голосовой чат.</p>'}
      </div>`;
  }

  function bindRoom() {
    container.querySelectorAll('[data-spy-room]').forEach((node) => {
      node.addEventListener('click', () => onRoomAction(node.dataset.spyRoom, node));
    });
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
    if (action === 'voiceToggle') {
      node.disabled = true;
      try {
        if (voice.isJoined()) {
          voice.leave();
          send('voice', { joined: false, muted: false });
        } else {
          await voice.join();
          send('voice', { joined: true, muted: voice.isMuted() });
        }
      } catch (error) {
        toast(String(error?.message || error));
      } finally {
        node.disabled = false;
        renderRoom();
      }
      return;
    }
    if (action === 'voiceMute') {
      const muted = voice.toggleMute();
      send('voice', { joined: true, muted });
      renderRoom();
    }
  }

  function leaveRoomAndGoHome() {
    leaving = true;
    voice.leave();
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

/* -------------------------------------------------------------------- *
 * Голосовой чат                                                         *
 * -------------------------------------------------------------------- *
 *
 * Полносвязный меш: у каждого игрока по одному RTCPeerConnection на
 * собеседника. Для комнаты на 3–12 человек это дешевле медиасервера и не
 * требует ни платного трафика, ни отдельной инфраструктуры — сигналы идут
 * через тот же Durable Object, что и состояние партии.
 *
 * Кто кому звонит, решает сравнение идентификаторов: инициатор всегда тот,
 * у кого id меньше. Без этого правила оба конца начинают переговоры
 * одновременно и соединение разваливается на «glare».
 *
 * Ограничение, о котором честно сказано в интерфейсе: TURN-сервера нет,
 * только публичные STUN. За симметричным NAT (часть мобильных операторов)
 * прямое соединение может не встать — тогда собеседник просто не появится
 * в списке говорящих.
 */
function createVoiceChat({ sendSignal, onChange, onError }) {
  const ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  const peers = new Map(); // playerId -> { pc, audio, analyser, speaking }
  let localStream = null;
  let joined = false;
  let muted = false;
  let selfId = '';
  let audioContext = null;
  let levelTimer = null;
  const speaking = new Set();

  function isSupported() {
    return Boolean(navigator.mediaDevices?.getUserMedia && window.RTCPeerConnection);
  }

  async function join() {
    if (joined) return;
    if (!isSupported()) throw new Error('Браузер не умеет голосовой чат');
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (error) {
      // Отказ в доступе — самая частая причина, и сообщение должно быть
      // человеческим, а не NotAllowedError.
      if (error?.name === 'NotAllowedError') throw new Error('Доступ к микрофону запрещён');
      if (error?.name === 'NotFoundError') throw new Error('Микрофон не найден');
      throw new Error('Не удалось включить микрофон');
    }
    joined = true;
    muted = false;
    startLevelMeter();
    onChange?.();
  }

  function leave() {
    for (const [playerId] of peers) dropPeer(playerId);
    peers.clear();
    speaking.clear();
    if (localStream) for (const track of localStream.getTracks()) track.stop();
    localStream = null;
    joined = false;
    muted = false;
    stopLevelMeter();
    onChange?.();
  }

  function toggleMute() {
    if (!joined || !localStream) return muted;
    muted = !muted;
    for (const track of localStream.getAudioTracks()) track.enabled = !muted;
    onChange?.();
    return muted;
  }

  /*
    Сверка списка собеседников с состоянием комнаты. Соединение поднимается
    только с теми, кто сам включил микрофон: звонить тому, кто в чат не
    заходил, значит просить у него разрешение, которого он не давал.
  */
  function syncPeers(state) {
    selfId = String(state?.me?.playerId || '');
    if (!joined || !selfId) {
      if (!joined && peers.size) { for (const [playerId] of peers) dropPeer(playerId); peers.clear(); }
      return;
    }
    const wanted = new Set(
      (state.players || [])
        .filter((item) => item.voice?.joined && item.playerId !== selfId)
        .map((item) => item.playerId),
    );
    for (const [playerId] of peers) if (!wanted.has(playerId)) dropPeer(playerId);
    for (const playerId of wanted) {
      if (peers.has(playerId)) continue;
      // Инициатор — тот, у кого идентификатор меньше. Иначе оба шлют offer
      // одновременно и соединение не встаёт.
      const initiator = selfId < playerId;
      createPeer(playerId, initiator);
    }
  }

  function createPeer(playerId, initiator) {
    let pc;
    try {
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    } catch {
      onError?.('Голосовой чат недоступен в этом браузере');
      return null;
    }

    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.dataset.spyVoicePeer = playerId;
    document.body.appendChild(audio);

    const entry = { pc, audio, analyser: null, source: null, pending: [], polite: !initiator };
    peers.set(playerId, entry);

    if (localStream) for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) sendSignal(playerId, 'ice', event.candidate.toJSON());
    });
    pc.addEventListener('track', (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      audio.srcObject = stream;
      audio.play?.().catch(() => {});
      attachAnalyser(playerId, stream);
    });
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        speaking.delete(playerId);
        onChange?.();
      }
    });

    if (initiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer).then(() => sendSignal(playerId, 'offer', offer)))
        .catch(() => {});
    }
    return entry;
  }

  function dropPeer(playerId) {
    const entry = peers.get(playerId);
    if (!entry) return;
    try { entry.pc.close(); } catch {}
    try { entry.source?.disconnect(); } catch {}
    entry.audio?.remove();
    peers.delete(playerId);
    speaking.delete(playerId);
  }

  async function handleSignal(message) {
    if (!joined) return;
    const from = String(message?.from || '');
    if (!from || from === selfId) return;
    let entry = peers.get(from);
    if (!entry) entry = createPeer(from, false);
    if (!entry) return;
    const { pc } = entry;

    try {
      if (message.kind === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(message.data));
        await flushPending(entry);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(from, 'answer', answer);
        return;
      }
      if (message.kind === 'answer') {
        if (pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription(new RTCSessionDescription(message.data));
        await flushPending(entry);
        return;
      }
      if (message.kind === 'ice') {
        // Кандидат может обогнать описание сессии — тогда его надо
        // придержать, иначе addIceCandidate бросит исключение.
        if (!pc.remoteDescription || !pc.remoteDescription.type) {
          entry.pending.push(message.data);
          return;
        }
        await pc.addIceCandidate(new RTCIceCandidate(message.data));
      }
    } catch (error) {
      console.warn('Spy voice signal failed', message.kind, error);
    }
  }

  async function flushPending(entry) {
    const queued = entry.pending.splice(0);
    for (const candidate of queued) {
      try { await entry.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    }
  }

  /*
    Индикатор говорящего. Считается по громкости входящего потока: рисовать
    рамку вокруг того, кто сейчас говорит, — единственный способ понять в
    голосовой комнате, кто именно подал голос.
  */
  function attachAnalyser(playerId, stream) {
    const entry = peers.get(playerId);
    if (!entry) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      entry.source = source;
      entry.analyser = analyser;
      entry.levels = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // Без индикатора чат работает — это украшение, а не механика.
    }
  }

  function startLevelMeter() {
    if (levelTimer) return;
    levelTimer = setInterval(() => {
      let changed = false;
      for (const [playerId, entry] of peers) {
        if (!entry.analyser || !entry.levels) continue;
        entry.analyser.getByteFrequencyData(entry.levels);
        let sum = 0;
        for (let i = 0; i < entry.levels.length; i += 1) sum += entry.levels[i];
        const average = sum / entry.levels.length;
        const talking = average > 14;
        if (talking && !speaking.has(playerId)) { speaking.add(playerId); changed = true; }
        else if (!talking && speaking.has(playerId)) { speaking.delete(playerId); changed = true; }
      }
      if (changed) onChange?.();
    }, 320);
  }

  function stopLevelMeter() {
    if (!levelTimer) return;
    clearInterval(levelTimer);
    levelTimer = null;
  }

  return {
    isSupported,
    isJoined: () => joined,
    isMuted: () => muted,
    speakingIds: () => speaking,
    join,
    leave,
    toggleMute,
    syncPeers,
    handleSignal,
  };
}

const SPY_ONLINE_CSS = `
  .spy-online-wrap { width: min(100%, 560px); margin: 0 auto; display: grid; gap: 14px; padding-bottom: 24px; }
  .spy-online-wrap h2 { margin: 0; color: #312e81; font-size: clamp(1.6rem, 6.4vw, 2.1rem); font-weight: 950; letter-spacing: -.045em; }
  .spy-online-lead { margin: 0; color: rgba(49,46,129,.66); font-size: .98rem; line-height: 1.4; font-weight: 650; }
  .spy-online-wrap .setup-label, .spy-online-wrap .hint { text-align: left; }
  .spy-voice-head, .spy-tally-row, .spy-vote-option { text-align: left; }
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

  .spy-voice { display: grid; gap: 10px; padding: 14px 16px; border-radius: 20px; background: rgba(15,23,42,.05); border: 1px solid rgba(49,46,129,.12); }
  .spy-voice.is-live { background: rgba(34,197,94,.08); border-color: rgba(34,197,94,.28); }
  .spy-voice-head { display: flex; align-items: center; justify-content: space-between; color: #312e81; font-size: .96rem; }
  .spy-voice-count { color: rgba(49,46,129,.56); font-size: .84rem; font-weight: 800; }
  .spy-voice-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .spy-voice-btn { flex: 1 1 140px; min-height: 46px; border: 0; border-radius: 14px; background: #4f46e5; color: #fff; font-size: .96rem; font-weight: 900; cursor: pointer; transition: transform .12s, filter .12s; }
  .spy-voice-btn:active { transform: scale(.97); }
  .spy-voice-btn:disabled { opacity: .6; }
  .spy-voice-btn.is-on { background: #15803d; }
  .spy-voice-btn.is-muted { background: #b45309; }
  .spy-voice-peers { display: flex; gap: 6px; flex-wrap: wrap; }
  .spy-voice-peer { padding: 5px 11px; border-radius: 999px; background: rgba(79,70,229,.1); font-size: .84rem; font-weight: 850; color: #312e81; transition: background .18s, transform .18s; }
  /* Рамка вокруг говорящего — иначе в голосовой комнате не понять, кто подал голос. */
  .spy-voice-peer.is-talking { background: rgba(34,197,94,.22); box-shadow: 0 0 0 2px rgba(34,197,94,.4); transform: scale(1.04); }

  .spy-online-outcome.is-spy { border-left: 5px solid #ef4444; }
  .spy-online-outcome.is-town { border-left: 5px solid #22c55e; }
  .spy-tally { display: grid; gap: 5px; }
  .spy-tally-row { display: flex; justify-content: space-between; padding: 8px 14px; border-radius: 12px; background: rgba(79,70,229,.07); font-weight: 800; color: #312e81; }

  #spy-online-toast { position: fixed; left: 50%; bottom: 26px; z-index: 60; transform: translate(-50%, 14px); padding: 11px 18px; border-radius: 999px; background: rgba(30,27,75,.92); color: #ede9fe; font-size: .92rem; font-weight: 800; opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; }
  #spy-online-toast.is-visible { opacity: 1; transform: translate(-50%, 0); }

  @media (prefers-reduced-motion: reduce) {
    .spy-online-card__face, .spy-online-clock, .spy-voice-peer { transition: none; animation: none; }
  }
`;
