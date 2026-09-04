// games/bible-sketch.js — «Библейский художник»: realtime drawing + spy

function startBibleSketchGame() {
  const container = document.getElementById('game-container');
  if (!container) return;

  const tg = window.Telegram?.WebApp || null;
  try { tg?.expand?.(); } catch {}
  try { tg?.enableClosingConfirmation?.(); } catch {}

  const LS = {
    roomId: 'bible_sketch_room_id_v1',
    playerName: 'bible_sketch_player_name_v1',
    guestId: 'bible_sketch_guest_id_v1',
  };
  const CATEGORIES = [
    { id: 'objects', title: 'Предметы', icon: '🪔', size: 32, hint: 'Ковчег, жезл, скрижали и другие предметы' },
    { id: 'places', title: 'Места', icon: '🗺️', size: 32, hint: 'Города, земли, горы и места событий' },
    { id: 'people', title: 'Люди', icon: '👤', size: 38, hint: 'Персонажи Ветхого и Нового Завета' },
    { id: 'events', title: 'События', icon: '✨', size: 30, hint: 'События и короткие фразы из библейского текста' },
  ];
  const PHASE_MS = { drawing: 40_000, answerReview: 30_000, voting: 50_000, finalGuess: 30_000 };
  const backendBase = resolveBackendBase();
  const telegramInitData = String(tg?.initData || '');
  const telegramUser = tg?.initDataUnsafe?.user || {};
  const defaultName = String(telegramUser.first_name || telegramUser.username || 'Игрок').trim() || 'Игрок';
  const guestId = getOrCreateGuestId();

  let state = null;
  let roomId = localStorage.getItem(LS.roomId) || '';
  let playerName = localStorage.getItem(LS.playerName) || defaultName;
  let sessionToken = '';
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let destroyed = false;
  let leaving = false;
  let selectedCategory = 'objects';
  let brushColor = '#111827';
  let brushWidth = 5;
  let brushMode = 'draw';
  let chatDraft = '';
  let guessDraft = '';
  let timerInterval = null;
  let toastTimer = null;
  let allowPortrait = false;
  let activePointer = null;
  let activePoints = [];

  injectStylesheet();
  renderRoot();
  bindRootEvents();
  startClock();
  window.__bibleSketchCleanup = cleanup;

  boot().catch((error) => {
    console.error('Bible Sketch boot error', error);
    showFatal(String(error?.message || error));
  });

  async function boot() {
    if (!backendBase) return showBackendNotConfigured();
    if (roomId) {
      showConnecting('Возвращаемся в комнату…');
      try {
        await joinOrResume(roomId, true);
        return;
      } catch (error) {
        if (error?.clientBackoff) {
          // Комната цела, вход просто отложен: ждём возвращения на экран.
          showConnecting('Возвращаемся в комнату…');
          scheduleReconnect();
          return;
        }
        console.warn('Bible Sketch resume failed', error);
        clearRoomSession();
      }
    }
    renderHome();
  }

  function resolveBackendBase() {
    const fromWindow = String(window.BIBLE_SKETCH_BACKEND_URL || '').trim();
    const fromMeta = String(document.querySelector('meta[name="bible-sketch-backend"]')?.content || '').trim();
    return (fromWindow || fromMeta).replace(/\/+$/, '');
  }

  function getOrCreateGuestId() {
    let id = localStorage.getItem(LS.guestId) || '';
    if (/^[a-zA-Z0-9_-]{16,64}$/.test(id)) return id;
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(LS.guestId, id);
    return id;
  }

  function injectStylesheet() {
    let link = document.getElementById('bible-sketch-css');
    if (!link) {
      link = document.createElement('link');
      link.id = 'bible-sketch-css';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = 'web/games/bible-sketch.css?v=1';
  }

  function renderRoot() {
    container.innerHTML = `
      <section class="bsk-root" id="bsk-root">
        <header class="bsk-topbar bsk-glass">
          <button type="button" class="bsk-icon-btn" data-action="back" aria-label="Назад">←</button>
          <div class="bsk-titlebox"><h2>Библейский художник</h2><div class="bsk-subtitle" id="bsk-subtitle">Онлайн-рисование со шпионом</div></div>
          <div class="bsk-connection" id="bsk-connection"><span class="bsk-dot"></span><span id="bsk-connection-text">Не подключено</span></div>
          <button type="button" class="bsk-icon-btn bsk-orientation-btn" data-action="landscape" aria-label="Горизонтальный режим">⛶</button>
        </header>
        <div class="bsk-content" id="bsk-content"></div>
        <div class="bsk-rotate" id="bsk-rotate"><div class="bsk-rotate-card"><span class="bsk-rotate-icon">📱</span><h3>Поверните телефон</h3><p>Для рисования удобнее горизонтальный режим. Поверните устройство — игра подстроится автоматически.</p><button class="bsk-secondary" data-action="allow-portrait">Остаться вертикально</button></div></div>
        <div class="bsk-toast" id="bsk-toast" role="status" aria-live="polite"></div>
      </section>`;
  }

  function bindRootEvents() {
    const root = document.getElementById('bsk-root');
    root?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      // await обязателен. Без него «return createRoom(button)» отдаёт промис из
      // try, а catch к тому времени уже пройден: беда уходила мимо него
      // необработанным отказом — человек не видел ни причины, ни подсказки, зато
      // администратору она прилетала как ошибка приложения.
      try {
        if (action === 'back') return await onBack();
        if (action === 'landscape') return await requestLandscape();
        if (action === 'allow-portrait') { allowPortrait = true; root.classList.add('allow-portrait-round'); return; }
        if (action === 'category') { selectedCategory = button.dataset.category || 'objects'; return await renderHome(); }
        if (action === 'create-room') return await createRoom(button);
        if (action === 'join-room') return await joinRoomFromForm(button);
        if (action === 'copy-room') return await copyRoomCode();
        if (action === 'share-room') return await shareRoom();
        if (action === 'start-round') return await sendAction('startRound', {}, button);
        if (action === 'restart-round') return await sendAction('restartRound', {}, button);
        if (action === 'finish-turn') return await sendAction('finishTurn', {}, button);
        if (action === 'undo') return await sendAction('undoStroke', {}, button);
        if (action === 'brush-mode') { brushMode = button.dataset.mode || 'draw'; return await renderState(); }
        if (action === 'brush-color') { brushColor = button.dataset.color || '#111827'; brushMode = 'draw'; return await renderState(); }
        if (action === 'brush-width') { brushWidth = Number(button.dataset.width || 5); return await renderState(); }
        if (action === 'submit-guess') return await submitGuess(button);
        if (action === 'review-guess') return await sendAction('reviewGuess', { accept: button.dataset.accept === '1' }, button);
        if (action === 'vote-spy') return await sendAction('voteSpy', { targetId: button.dataset.playerId || '' }, button);
        if (action === 'leave-room') return await leaveRoom();
      } catch (error) { showToast(String(error?.message || error), 'error'); }
    });

    root?.addEventListener('input', (event) => {
      if (event.target.id === 'bsk-player-name') {
        playerName = String(event.target.value || '').slice(0, 32);
        localStorage.setItem(LS.playerName, playerName);
      }
      if (event.target.id === 'bsk-room-code') event.target.value = normalizeRoomId(event.target.value);
      if (event.target.id === 'bsk-chat-input') chatDraft = event.target.value;
      if (event.target.id === 'bsk-guess-input') guessDraft = event.target.value;
    });

    root?.addEventListener('submit', (event) => {
      if (event.target.id === 'bsk-chat-form') {
        event.preventDefault();
        sendChat().catch((error) => showToast(String(error?.message || error), 'error'));
      }
      if (event.target.id === 'bsk-guess-form') {
        event.preventDefault();
        submitGuess(event.target.querySelector('[data-action="submit-guess"]')).catch((error) => showToast(String(error?.message || error), 'error'));
      }
    });

    window.addEventListener('orientationchange', onOrientationChange);
    window.addEventListener('resize', onOrientationChange);
  }

  async function requestLandscape() {
    try { tg?.requestFullscreen?.(); } catch {}
    if (window.innerWidth > window.innerHeight) {
      try { tg?.lockOrientation?.(); } catch {}
      try { await screen.orientation?.lock?.('landscape'); } catch {}
      showToast('Горизонтальный режим готов');
    } else {
      try { tg?.unlockOrientation?.(); } catch {}
      showToast('Поверните телефон горизонтально');
    }
  }

  function onOrientationChange() {
    if (window.innerWidth > window.innerHeight && state && !['lobby', 'finished'].includes(state.status)) {
      try { tg?.requestFullscreen?.(); } catch {}
      try { tg?.lockOrientation?.(); } catch {}
    }
    requestAnimationFrame(drawCanvasFromState);
  }

  function authBody() {
    return { telegramInitData, guestId, name: playerName || defaultName };
  }

  async function createRoom(button) {
    const nameInput = document.getElementById('bsk-player-name');
    playerName = String(nameInput?.value || playerName || defaultName).trim().slice(0, 32) || defaultName;
    localStorage.setItem(LS.playerName, playerName);
    setBusy(button, true);
    try {
      const data = await postJson(`${backendBase}/rooms`, { ...authBody(), categoryId: selectedCategory });
      roomId = data.roomId;
      sessionToken = data.sessionToken;
      localStorage.setItem(LS.roomId, roomId);
      await connectSocket();
    } finally { setBusy(button, false); }
  }

  async function joinRoomFromForm(button) {
    const code = normalizeRoomId(document.getElementById('bsk-room-code')?.value || '');
    if (code.length < 4) throw new Error('Введите код комнаты');
    const nameInput = document.getElementById('bsk-player-name');
    playerName = String(nameInput?.value || playerName || defaultName).trim().slice(0, 32) || defaultName;
    localStorage.setItem(LS.playerName, playerName);
    setBusy(button, true);
    try { await joinOrResume(code, false); } finally { setBusy(button, false); }
  }

  async function joinOrResume(code, silent) {
    const normalized = normalizeRoomId(code);
    const data = await postJson(`${backendBase}/rooms/${normalized}/join`, authBody());
    roomId = normalized;
    sessionToken = data.sessionToken;
    localStorage.setItem(LS.roomId, roomId);
    if (!silent) showConnecting('Входим в комнату…');
    await connectSocket();
  }

  async function connectSocket() {
    if (!roomId || !sessionToken || destroyed) return;
    clearTimeout(reconnectTimer);
    try { socket?.close?.(); } catch {}
    const url = new URL(`${backendBase}/rooms/${roomId}/ws`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', sessionToken);
    setConnection('reconnecting', 'Подключение');
    socket = new WebSocket(url.toString());

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Сервер долго не отвечает')), 10_000);
      socket.addEventListener('open', () => {
        clearTimeout(timeout);
        reconnectAttempt = 0;
        setConnection('online', 'Онлайн');
        resolve();
      }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Не удалось подключиться к комнате')); }, { once: true });
    });

    socket.addEventListener('message', onSocketMessage);
    socket.addEventListener('close', () => {
      if (!destroyed && !leaving && roomId) scheduleReconnect();
    });
  }

  function onSocketMessage(event) {
    let payload;
    try { payload = JSON.parse(event.data); } catch { return; }
    if (payload.type === 'state' && payload.state) {
      const previousStatus = state?.status;
      state = payload.state;
      if (previousStatus !== state.status && state.status === 'drawing') allowPortrait = false;
      renderState();
      window.GameChatToasts?.sync({
        key: `bible-sketch:${roomId}`,
        messages: state.chat || [],
        selfId: state.me?.playerId || '',
        // Чат тут не сворачивается, а стоит карточкой в раскладке: во время
        // рисования он уезжает за край экрана, и уведомление как раз к месту.
        chatVisible: () => chatOnScreen(),
        onOpen: revealChat,
      });
      return;
    }
    if (payload.type === 'error') showToast(payload.error || 'Ошибка комнаты', 'error');
  }

  function scheduleReconnect() {
    if (destroyed || leaving || document.hidden || !roomId) return;
    reconnectAttempt += 1;
    setConnection('reconnecting', 'Возвращаем связь');
    const delay = Math.min(30_000, 2_500 * (2 ** Math.min(4, reconnectAttempt - 1)));
    reconnectTimer = setTimeout(() => {
      joinOrResume(roomId, true).catch((error) => {
        console.warn('Bible Sketch reconnect failed', error);
        scheduleReconnect();
      });
    }, delay);
  }

  async function sendAction(action, payload = {}, button = null) {
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Нет связи с комнатой');
    setBusy(button, true);
    try { socket.send(JSON.stringify({ type: 'action', action, payload })); }
    finally { setTimeout(() => setBusy(button, false), 250); }
  }

  async function sendChat() {
    const input = document.getElementById('bsk-chat-input');
    const text = String(input?.value || chatDraft || '').trim();
    if (!text) return;
    chatDraft = '';
    if (input) input.value = '';
    await sendAction('chat', { text });
  }

  async function submitGuess(button) {
    const input = document.getElementById('bsk-guess-input');
    const text = String(input?.value || guessDraft || '').trim();
    if (!text) throw new Error('Введите ответ');
    guessDraft = '';
    if (input) input.value = '';
    await sendAction('submitGuess', { text }, button);
  }

  function renderHome() {
    state = null;
    allowPortrait = false;
    document.getElementById('bsk-root')?.classList.remove('allow-portrait-round');
    updateHeader();
    setConnection('', 'Не подключено');
    const categoryCards = CATEGORIES.map((category) => `
      <button type="button" class="bsk-category ${category.id === selectedCategory ? 'is-selected' : ''}" data-action="category" data-category="${category.id}">
        <span class="bsk-category-icon">${category.icon}</span><b>${category.title}</b><small>${category.size} слов · ${esc(category.hint)}</small>
      </button>`).join('');
    document.getElementById('bsk-content').innerHTML = `
      <div class="bsk-home">
        <section class="bsk-hero"><span class="bsk-kicker">Realtime · 3–8 игроков</span><h2>Рисуйте. Наблюдайте. Найдите шпиона.</h2><p>Все, кроме шпиона, знают библейское слово. Игроки по очереди продолжают общий рисунок, а шпион пытается понять ответ по подсказкам.</p>
          <div class="bsk-rules"><div class="bsk-rule"><b>1 · Категория</b>Создатель комнаты выбирает Предметы, Места, Людей или События.</div><div class="bsk-rule"><b>2 · По очереди</b>Каждый получает 40 секунд и добавляет линии на общий холст.</div><div class="bsk-rule"><b>3 · Шпион</b>Может рискнуть и назвать ответ раньше голосования.</div></div>
        </section>
        <div class="bsk-home-grid">
          <section class="bsk-card bsk-glass"><h3 class="bsk-section-title">Создать комнату</h3><label class="bsk-field"><span>Ваше имя</span><input id="bsk-player-name" class="bsk-input" maxlength="32" value="${attr(playerName)}"></label><div class="bsk-category-grid">${categoryCards}</div><p class="bsk-note">Слово в одной комнате не повторяется, пока не будут использованы все слова выбранной категории. После этого колода начинается заново.</p><button type="button" class="bsk-primary" data-action="create-room" style="width:100%;margin-top:10px">Создать лобби</button></section>
          <section class="bsk-card bsk-glass"><h3 class="bsk-section-title">Войти по коду</h3><label class="bsk-field"><span>Код комнаты</span><input id="bsk-room-code" class="bsk-input" maxlength="10" placeholder="ABC123" autocapitalize="characters"></label><button type="button" class="bsk-secondary" data-action="join-room" style="width:100%">Войти в комнату</button><p class="bsk-note">Для игры через Telegram используется ваша проверенная сессия. В обычном браузере доступен гостевой режим.</p></section>
        </div>
      </div>`;
  }

  function renderState() {
    if (!state) return;
    updateHeader();
    const root = document.getElementById('bsk-root');
    const active = !['lobby', 'finished'].includes(state.status);
    root.dataset.activeRound = active ? '1' : '0';
    root.classList.toggle('allow-portrait-round', allowPortrait);

    if (state.status === 'lobby') renderLobby();
    else if (state.status === 'finished') renderFinished();
    else renderRound();
    requestAnimationFrame(() => {
      drawCanvasFromState();
      bindCanvas();
      scrollChatToBottom();
      updateClock();
    });
  }

  function updateHeader() {
    const subtitle = document.getElementById('bsk-subtitle');
    if (!subtitle) return;
    if (!state) subtitle.textContent = 'Онлайн-рисование со шпионом';
    else subtitle.textContent = `Комната ${state.roomId} · ${state.category?.icon || '✨'} ${state.category?.title || ''}`;
  }

  function renderLobby() {
    const me = state.me || {};
    const activePlayers = state.players.filter((player) => player.isActive !== false);
    const players = activePlayers.map(renderPlayer).join('');
    document.getElementById('bsk-content').innerHTML = `
      <div class="bsk-lobby-grid">
        <section class="bsk-card bsk-glass"><div class="bsk-room-head"><div><div class="bsk-section-title">Код комнаты</div><div class="bsk-room-code">${esc(state.roomId)}</div><div class="bsk-room-meta">${state.category.icon} ${esc(state.category.title)} · ${state.category.size} слов · использовано ${state.usedWordsCount}</div></div><div class="bsk-link-row"><button class="bsk-secondary" data-action="copy-room">Копировать</button><button class="bsk-secondary" data-action="share-room">Поделиться</button></div></div><div class="bsk-section-title">Игроки · ${activePlayers.length}/8</div><div class="bsk-player-list">${players}</div>${me.isHost ? `<button class="bsk-primary" data-action="start-round" style="width:100%;margin-top:12px" ${activePlayers.length < 3 ? 'disabled' : ''}>${activePlayers.length < 3 ? 'Нужно минимум 3 игрока' : 'Начать раунд'}</button>` : '<div class="bsk-wait">Ждём, когда создатель комнаты начнёт раунд…</div>'}<button class="bsk-danger" data-action="leave-room" style="width:100%;margin-top:8px">Выйти из комнаты</button></section>
        ${renderChat()}
      </div>`;
  }

  function renderRound() {
    const me = state.me || {};
    const isSpy = me.role === 'spy';
    const statusCard = renderStatusCard();
    const players = state.players.filter((player) => player.isActive !== false).map(renderPlayer).join('');
    let phasePanel = '';
    if (state.status === 'answerReview') phasePanel = renderGuessReview();
    else if (state.status === 'voting') phasePanel = renderVoting();
    else if (state.status === 'finalGuess') phasePanel = renderFinalGuess();
    else if (state.status === 'drawing' && isSpy && !me.earlyGuessUsed) phasePanel = renderEarlyGuess();

    document.getElementById('bsk-content').innerHTML = `
      <div class="bsk-game-layout">
        <aside class="bsk-side">${statusCard}<section class="bsk-card bsk-glass bsk-roster"><div class="bsk-section-title">Игроки</div><div class="bsk-player-list">${players}</div></section>${phasePanel}</aside>
        <main class="bsk-canvas-card"><div class="bsk-canvas-wrap"><canvas id="bsk-canvas" class="bsk-canvas" aria-label="Общий холст"></canvas><div class="bsk-canvas-cover" id="bsk-canvas-cover" ${state.status === 'drawing' ? 'hidden' : ''}>${canvasCoverText()}</div></div>${renderTools()}</main>
        ${renderChat()}
      </div>`;
  }

  function renderStatusCard() {
    const me = state.me || {};
    const isSpy = me.role === 'spy';
    const turnName = state.currentDrawerName || 'Игрок';
    const secret = isSpy
      ? `<div class="bsk-secret bsk-spy-secret"><b>Вы — шпион 🕵️</b><small>Вы знаете только категорию: ${esc(state.category.title)}. Смотрите на рисунки и не выдавайте себя.</small></div>`
      : `<div class="bsk-secret"><small>Ваше слово</small><b>${esc(me.secret?.label || '—')}</b><small>${esc(me.secret?.ref || '')} · Синодальный перевод</small></div>`;
    return `<section class="bsk-status bsk-glass"><span class="bsk-status-tag">Раунд ${state.roundNumber} · ${esc(state.category.title)}</span><h3>${state.status === 'drawing' ? (me.canDraw ? 'Ваш ход — рисуйте' : `Рисует ${esc(turnName)}`) : phaseTitle()}</h3><p>${state.status === 'drawing' ? `Ход ${Math.min(state.turnIndex + 1, state.turnCount)} из ${state.turnCount}` : phaseDescription()}</p>${secret}<div class="bsk-turn" style="margin-top:9px"><strong>${phaseTimerLabel()}</strong><span class="bsk-timer" id="bsk-timer">—</span></div><div class="bsk-progress"><span id="bsk-progress" style="width:100%"></span></div></section>`;
  }

  function phaseTitle() {
    if (state.status === 'answerReview') return 'Проверка ответа шпиона';
    if (state.status === 'voting') return 'Кто шпион?';
    if (state.status === 'finalGuess') return state.me?.role === 'spy' ? 'Последний шанс' : 'Шпион отвечает';
    return 'Раунд';
  }
  function phaseDescription() {
    if (state.status === 'answerReview') return 'Приложение не нашло точного совпадения. Художники решают, засчитать ли ответ.';
    if (state.status === 'voting') return 'Выберите игрока, который, по вашему мнению, не знал слово.';
    if (state.status === 'finalGuess') return 'Шпиона нашли. Он может назвать секретное слово и украсть победу.';
    return '';
  }
  function phaseTimerLabel() {
    if (state.status === 'drawing') return 'До конца хода';
    if (state.status === 'answerReview') return 'На подтверждение';
    if (state.status === 'voting') return 'На голосование';
    if (state.status === 'finalGuess') return 'На ответ';
    return '';
  }

  function renderTools() {
    const canDraw = state.status === 'drawing' && state.me?.canDraw;
    if (!canDraw) return `<div class="bsk-tools"><span class="bsk-count">${state.strokes.length} линий на общем рисунке</span>${state.status === 'drawing' ? '<span class="bsk-count"> · инструменты появятся в ваш ход</span>' : ''}</div>`;
    const colors = ['#111827', '#4f46e5', '#0284c7', '#059669', '#d97706', '#dc2626', '#9333ea'];
    return `<div class="bsk-tools"><div class="bsk-colors">${colors.map((color) => `<button class="bsk-color ${brushMode === 'draw' && brushColor === color ? 'is-selected' : ''}" style="--c:${color}" data-action="brush-color" data-color="${color}" aria-label="Цвет"></button>`).join('')}</div><button class="bsk-tool ${brushMode === 'erase' ? 'is-selected' : ''}" data-action="brush-mode" data-mode="erase">Ластик</button>${[3, 6, 11].map((width) => `<button class="bsk-tool ${brushWidth === width ? 'is-selected' : ''}" data-action="brush-width" data-width="${width}">${width === 3 ? 'Тонко' : width === 6 ? 'Средне' : 'Толсто'}</button>`).join('')}<button class="bsk-tool" data-action="undo">↶ Отменить</button><button class="bsk-primary bsk-finish-turn" data-action="finish-turn">Завершить ход</button></div>`;
  }

  function renderEarlyGuess() {
    return `<section class="bsk-guess"><h4>Думаете, что поняли слово?</h4><p>У шпиона один досрочный ответ. Если приложение не найдёт точное совпадение, остальные игроки проголосуют, можно ли его засчитать.</p><form id="bsk-guess-form" class="bsk-guess-form"><input id="bsk-guess-input" class="bsk-input" maxlength="80" placeholder="Введите ответ" value="${attr(guessDraft)}"><button class="bsk-primary" type="submit" data-action="submit-guess">Отправить ответ</button></form></section>`;
  }

  function renderGuessReview() {
    const review = state.guessReview || {};
    if (state.me?.role === 'spy') return `<section class="bsk-review"><h3>Ответ отправлен</h3><div class="bsk-review-answer">«${esc(review.text || '')}»</div><p>Приложение не нашло точного совпадения. Ждём решения остальных игроков: ${review.votesCount || 0}/${review.votersCount || 0}.</p></section>`;
    const voted = review.myVote !== null && review.myVote !== undefined;
    return `<section class="bsk-review"><h3>Засчитать ответ?</h3><div class="bsk-review-answer">«${esc(review.text || '')}»</div><p>Автоматическая проверка считает ответ несовпадающим. Если это допустимая формулировка или синоним — подтвердите.</p>${voted ? `<div class="bsk-wait">Ваш голос принят · ${review.votesCount}/${review.votersCount}</div>` : `<div class="bsk-review-actions"><button class="bsk-success" data-action="review-guess" data-accept="1">✓ Засчитать</button><button class="bsk-danger" data-action="review-guess" data-accept="0">✕ Не засчитывать</button></div>`}</section>`;
  }

  function renderVoting() {
    const players = state.players.filter((player) => player.isActive !== false && player.playerId !== state.me?.playerId);
    if (state.me?.hasVotedSpy) return `<section class="bsk-review"><h3>Голос принят</h3><p>Ждём остальных игроков. После голосования станет известно, удалось ли найти шпиона.</p></section>`;
    return `<section class="bsk-card bsk-glass"><div class="bsk-section-title">Ваш голос</div><div class="bsk-vote-grid">${players.map((player) => `<button class="bsk-vote-player" data-action="vote-spy" data-player-id="${attr(player.playerId)}">${esc(player.name)}</button>`).join('')}</div></section>`;
  }

  function renderFinalGuess() {
    if (state.me?.role !== 'spy') return `<section class="bsk-review"><h3>Шпион найден</h3><p>Сейчас он попробует назвать секретное слово. Если ответ будет неверным, художники победят.</p></section>`;
    return `<section class="bsk-guess"><h4>Последний шанс</h4><p>Назовите слово. Точное совпадение приложение проверит автоматически; спорную формулировку смогут подтвердить художники.</p><form id="bsk-guess-form" class="bsk-guess-form"><input id="bsk-guess-input" class="bsk-input" maxlength="80" placeholder="Ваш ответ" value="${attr(guessDraft)}"><button class="bsk-primary" type="submit" data-action="submit-guess">Ответить</button></form></section>`;
  }

  function canvasCoverText() {
    if (state.status === 'answerReview') return 'Рисование на паузе, пока команда проверяет ответ.';
    if (state.status === 'voting') return 'Рисунок завершён. Время найти шпиона.';
    if (state.status === 'finalGuess') return 'Шпион даёт последний ответ.';
    return '';
  }

  function renderFinished() {
    const result = state.result || {};
    const spyWon = result.winner === 'spy';
    const reason = resultReason(result.reason);
    document.getElementById('bsk-content').innerHTML = `
      <section class="bsk-result"><div class="bsk-result-icon">${spyWon ? '🕵️' : '🎨'}</div><h2>${spyWon ? 'Шпион победил' : 'Художники победили'}</h2><p>${esc(reason)}</p><div class="bsk-result-word"><small>Секретное слово</small><b>${esc(result.word?.label || '—')}</b><small>${esc(result.word?.ref || '')} · Синодальный перевод</small></div><p>Шпион: <b>${esc(result.spyName || '—')}</b>${result.guessText ? ` · ответ «${esc(result.guessText)}»` : ''}</p><div class="bsk-actions">${state.me?.isHost ? '<button class="bsk-primary" data-action="restart-round">Новый раунд</button>' : ''}<button class="bsk-secondary" data-action="copy-room">Код комнаты</button><button class="bsk-danger" data-action="leave-room">Выйти</button></div></section>
      <div class="bsk-lobby-grid" style="margin-top:12px"><section class="bsk-canvas-card"><div class="bsk-canvas-wrap"><canvas id="bsk-canvas" class="bsk-canvas"></canvas></div></section>${renderChat()}</div>`;
  }

  function resultReason(reason) {
    const map = {
      early_guess_auto: 'Шпион назвал слово досрочно, и приложение подтвердило точное совпадение.',
      early_guess_human: 'Шпион назвал слово досрочно, и художники засчитали его ответ.',
      final_guess_auto: 'Шпиона нашли, но он точно назвал слово в последней попытке.',
      final_guess_human: 'Шпиона нашли, но команда засчитала его финальный ответ.',
      final_guess_rejected: 'Шпиона нашли, а его последний ответ команда не засчитала.',
      final_guess_timeout: 'Шпиона нашли, но он не успел назвать слово.',
      spy_not_found: 'После рисунков команда выбрала не того игрока.',
      vote_tie: 'Голоса разделились, поэтому шпион остался нераскрытым.',
      spy_left: 'Шпион покинул раунд.',
      not_enough_players: 'В комнате осталось слишком мало игроков для продолжения.',
    };
    return map[reason] || 'Раунд завершён.';
  }

  function renderPlayer(player) {
    const initials = String(player.name || '?').trim().slice(0, 1).toUpperCase();
    const details = [player.connected ? 'онлайн' : 'нет связи'];
    if (player.isCurrentDrawer) details.unshift('сейчас рисует');
    return `<div class="bsk-player"><div class="bsk-avatar">${esc(initials)}</div><div><b>${esc(player.name)}</b><small>${details.join(' · ')}</small></div>${player.isHost ? '<span class="bsk-host">Ведущий</span>' : ''}</div>`;
  }

  function renderChat() {
    const messages = (state?.chat || []).map((message) => `<div class="bsk-message ${message.playerId === state?.me?.playerId ? 'is-me' : ''}"><b>${esc(message.name)}</b>${esc(message.text)}<time>${formatTime(message.at)}</time></div>`).join('');
    return `<section class="bsk-chat bsk-card bsk-glass"><div class="bsk-chat-head"><b>Чат комнаты</b><span class="bsk-count">${state?.chat?.length || 0}</span></div><div class="bsk-chat-list" id="bsk-chat-list">${messages || '<div class="bsk-empty">Сообщений пока нет</div>'}</div><form id="bsk-chat-form" class="bsk-chat-form"><input id="bsk-chat-input" class="bsk-input" maxlength="300" placeholder="Сообщение…" value="${attr(chatDraft)}"><button class="bsk-send" type="submit" aria-label="Отправить">↑</button></form><div class="bsk-note">Во время раунда секретное слово нельзя отправить в чат.</div></section>`;
  }

  function bindCanvas() {
    const canvas = document.getElementById('bsk-canvas');
    if (!canvas || !state?.me?.canDraw || state.status !== 'drawing') return;
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
  }

  function onPointerDown(event) {
    if (!state?.me?.canDraw) return;
    const canvas = event.currentTarget;
    activePointer = event.pointerId;
    activePoints = [pointFromEvent(canvas, event)];
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
  }
  function onPointerMove(event) {
    if (activePointer !== event.pointerId || !activePoints.length) return;
    const canvas = event.currentTarget;
    const point = pointFromEvent(canvas, event);
    const last = activePoints[activePoints.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) < .0025) return;
    activePoints.push(point);
    drawCanvasFromState(activePoints);
    event.preventDefault();
  }
  function onPointerCancel() { activePointer = null; activePoints = []; drawCanvasFromState(); }
  async function onPointerUp(event) {
    if (activePointer !== event.pointerId) return;
    const points = activePoints;
    activePointer = null;
    activePoints = [];
    if (points.length < 2) return drawCanvasFromState();
    const step = Math.max(1, Math.ceil(points.length / 300));
    const compact = points.filter((_, index) => index % step === 0);
    if (compact[compact.length - 1] !== points[points.length - 1]) compact.push(points[points.length - 1]);
    try { await sendAction('drawStroke', { stroke: { mode: brushMode, color: brushColor, width: brushWidth, points: compact } }); }
    catch (error) { showToast(String(error?.message || error), 'error'); drawCanvasFromState(); }
  }

  function pointFromEvent(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))];
  }

  function drawCanvasFromState(previewPoints = null) {
    const canvas = document.getElementById('bsk-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(300, Math.round(rect.width * dpr));
    const height = Math.max(180, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    for (const stroke of state?.strokes || []) drawStroke(ctx, stroke, width, height, dpr);
    if (previewPoints?.length > 1) drawStroke(ctx, { mode: brushMode, color: brushColor, width: brushWidth, points: previewPoints }, width, height, dpr);
  }

  function drawStroke(ctx, stroke, width, height, dpr) {
    const points = stroke.points || [];
    if (points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.mode === 'erase' ? '#ffffff' : (stroke.color || '#111827');
    ctx.lineWidth = Math.max(2, Number(stroke.width || 5)) * dpr;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = point[0] * width;
      const y = point[1] * height;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  function startClock() {
    clearInterval(timerInterval);
    timerInterval = setInterval(updateClock, 250);
  }
  function updateClock() {
    if (!state?.turnDeadlineMs) return;
    const timer = document.getElementById('bsk-timer');
    const progress = document.getElementById('bsk-progress');
    if (!timer || !progress) return;
    const remaining = Math.max(0, Number(state.turnDeadlineMs) - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    timer.textContent = `${seconds}с`;
    timer.classList.toggle('is-low', seconds <= 8);
    const total = PHASE_MS[state.status] || 40_000;
    progress.style.width = `${Math.max(0, Math.min(100, remaining / total * 100))}%`;
  }

  async function leaveRoom() {
    if (!roomId) return renderHome();
    leaving = true;
    try {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'action', action: 'leave', payload: {} }));
    } catch {}
    clearRoomSession();
    try { socket?.close?.(1000, 'left'); } catch {}
    socket = null;
    leaving = false;
    renderHome();
  }

  async function onBack() {
    if (!roomId) return window.goToMainMenu?.();
    const ok = window.confirm('Выйти из текущей комнаты?');
    if (ok) await leaveRoom();
  }

  function clearRoomSession() {
    roomId = '';
    sessionToken = '';
    state = null;
    localStorage.removeItem(LS.roomId);
  }

  async function copyRoomCode() {
    if (!roomId) return;
    try { await navigator.clipboard.writeText(roomId); showToast('Код комнаты скопирован'); }
    catch { showToast(`Код комнаты: ${roomId}`); }
  }

  async function shareRoom() {
    if (!roomId) return;
    const text = `Библейский художник · код комнаты ${roomId}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Библейский художник', text }); return; } catch {}
    }
    await copyRoomCode();
  }

  function showConnecting(text) {
    document.getElementById('bsk-content').innerHTML = `<section class="bsk-result"><div class="app-loader__ring"></div><h2 style="margin-top:14px">${esc(text)}</h2><p>Подключаем realtime-комнату…</p></section>`;
  }
  function showBackendNotConfigured() { showFatal('Онлайн-сервер игры пока не настроен.'); }
  function showFatal(message) {
    document.getElementById('bsk-content').innerHTML = `<section class="bsk-result"><div class="bsk-result-icon">⚠️</div><h2>Не удалось запустить игру</h2><p>${esc(message)}</p><div class="bsk-actions"><button class="bsk-secondary" data-action="back">В главное меню</button></div></section>`;
  }

  function setConnection(kind, text) {
    const box = document.getElementById('bsk-connection');
    const label = document.getElementById('bsk-connection-text');
    if (box) {
      box.className = `bsk-connection ${kind ? `is-${kind}` : ''}`;
      box.setAttribute('role', 'status');
      box.setAttribute('title', text);
      box.setAttribute('aria-label', `Связь: ${text}`);
    }
    if (label) label.textContent = text;
  }

  function showToast(text, kind = 'info') {
    const toast = document.getElementById('bsk-toast');
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.className = `bsk-toast is-visible ${kind === 'error' ? 'is-error' : ''}`;
    toastTimer = setTimeout(() => { toast.className = 'bsk-toast'; }, 2600);
  }
  function setBusy(button, busy) {
    if (!button) return;
    button.disabled = Boolean(busy);
    button.dataset.busy = busy ? '1' : '0';
  }

  async function postJson(url, body) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    let data = {};
    try { data = await response.json(); } catch {}
    // Отказ бюджета запросов означает «не сейчас», а не «не вышло»: запрос
    // придержал сам клиент — приложение свёрнуто или вход в комнату повторился
    // слишком быстро. Комнату по такому отказу терять нельзя.
    if (response.headers.get('X-Client-Backoff') === '1') {
      throw Object.assign(new Error('Подключение отложено'), { clientBackoff: true });
    }
    if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  function scrollChatToBottom() {
    const list = document.getElementById('bsk-chat-list');
    if (list) list.scrollTop = list.scrollHeight;
  }

  /** Видно ли ленту чата в окне прямо сейчас. */
  function chatOnScreen() {
    const list = document.getElementById('bsk-chat-list');
    if (!list) return false;
    const box = list.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    return box.bottom > 0 && box.top < (window.innerHeight || document.documentElement.clientHeight);
  }

  /** Подводит чат к глазам — сюда ведёт нажатие на всплывшее уведомление. */
  function revealChat() {
    const list = document.getElementById('bsk-chat-list');
    if (!list) return;
    list.scrollIntoView({ block: 'center', behavior: 'smooth' });
    scrollChatToBottom();
    document.getElementById('bsk-chat-input')?.focus({ preventScroll: true });
  }
  function normalizeRoomId(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); }
  function formatTime(value) { try { return new Date(value || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function attr(value) { return esc(value).replace(/`/g, '&#96;'); }

  /*
    Возврат на экран. Переподключение не назначается из фона — и правильно, в
    сеть оттуда ходить незачем. Но и обратно оно не возвращалось: таймер,
    доживший до сворачивания, отменялся, нового не ставил никто, и человек
    возвращался в мёртвую комнату. Отсчёт сбрасывается, чтобы вход был сразу.
  */
  function onVisible() {
    if (destroyed || leaving || document.hidden || !roomId) return;
    if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;
    reconnectAttempt = 0;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    joinOrResume(roomId, true).catch(() => scheduleReconnect());
  }
  document.addEventListener('visibilitychange', onVisible);

  function cleanup() {
    window.GameChatToasts?.reset(`bible-sketch:${roomId}`);
    destroyed = true;
    document.removeEventListener('visibilitychange', onVisible);
    clearTimeout(reconnectTimer);
    clearInterval(timerInterval);
    clearTimeout(toastTimer);
    try { socket?.close?.(1000, 'cleanup'); } catch {}
    try { tg?.unlockOrientation?.(); } catch {}
    window.removeEventListener('orientationchange', onOrientationChange);
    window.removeEventListener('resize', onOrientationChange);
    const link = document.getElementById('bible-sketch-css');
    if (link) link.remove();
    delete window.__bibleSketchCleanup;
  }
}

window.startBibleSketchGame = startBibleSketchGame;
