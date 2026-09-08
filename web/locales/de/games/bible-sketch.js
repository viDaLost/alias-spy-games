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
  // Список повторяет CATEGORY_META и CATALOG воркера: клиент рисует выбор
  // категории до того, как узнает комнату, и спросить сервер ему негде.
  // Расхождение ловит scripts/check-bible-sketch-catalog.mjs — руками эти два
  // списка уже разъезжались.
  const CATEGORIES = [
    { id: 'objects', title: 'Gegenstände', icon: '🪔', size: 31, hint: 'Arche, Stab, Tafeln und weitere Gegenstände' },
    { id: 'places', title: 'Orte', icon: '🗺️', size: 32, hint: 'Städte, Länder, Berge und Schauplätze' },
    { id: 'people', title: 'Menschen', icon: '👤', size: 38, hint: 'Personen des Alten und Neuen Testaments' },
    { id: 'events', title: 'Ereignisse', icon: '✨', size: 30, hint: 'Ereignisse und kurze Wendungen aus der Bibel' },
    { id: 'nature', title: 'Natur', icon: '🌿', size: 38, hint: 'Tiere, Vögel, Bäume und Himmelszeichen' },
    { id: 'crafts', title: 'Handwerk', icon: '🛠️', size: 32, hint: 'Hirte, Töpfer, Sämann und andere Berufe' },
  ];
  const PHASE_MS = { drawing: 40_000, answerReview: 30_000, voting: 50_000, finalGuess: 30_000 };
  const backendBase = resolveBackendBase();
  const telegramInitData = String(tg?.initData || '');
  const telegramUser = tg?.initDataUnsafe?.user || {};
  const defaultName = String(telegramUser.first_name || telegramUser.username || 'Spieler').trim() || 'Spieler';
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
  let previewFrame = 0;
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
      showConnecting('Zurück zum Raum…');
      try {
        await joinOrResume(roomId, true);
        return;
      } catch (error) {
        if (error?.clientBackoff) {
          // Комната цела, вход просто отложен: ждём возвращения на экран.
          showConnecting('Zurück zum Raum…');
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

  /*
    Базовый лист обязан идти перед альбомным.

    Альбомный подключает лаунчер, ещё до загрузки этого файла, а базовый мы
    добавляли в конец головы — то есть после него. Правила у них одинаковой
    специфичности, и при равенстве решает порядок: весь альбомный лист молча
    проигрывал базовому везде, где они спорят. Полосу инструментов он просил не
    переносить, база переносила; холст он растягивал на всю высоту, база держала
    его в 5:3. Отсюда и «в горизонтальном не пролистнуть до кисти»: полоса
    уезжала вторым рядом за нижний край, а холст оставался с ладонь.
  */
  function injectStylesheet() {
    let link = document.getElementById('bible-sketch-css');
    if (!link) {
      link = document.createElement('link');
      link.id = 'bible-sketch-css';
      link.rel = 'stylesheet';
    }
    link.href = 'web/locales/de/games/bible-sketch.css?v=2';
    const landscape = document.getElementById('bible-sketch-landscape-v2-css');
    if (landscape?.parentNode === document.head) document.head.insertBefore(link, landscape);
    else if (!link.isConnected) document.head.appendChild(link);
  }

  function renderRoot() {
    container.innerHTML = `\n      <section class="bsk-root" id="bsk-root">\n        <header class="bsk-topbar bsk-glass">\n          <button type="button" class="bsk-icon-btn" data-action="back" aria-label="Zurück">←</button>\n          <div class="bsk-titlebox"><h2>Bibelkünstler</h2><div class="bsk-subtitle" id="bsk-subtitle">Online-Zeichnen mit Spion</div></div>\n          <div class="bsk-connection" id="bsk-connection"><span class="bsk-dot"></span><span id="bsk-connection-text">Nicht verbunden</span></div>\n          <button type="button" class="bsk-icon-btn bsk-orientation-btn" data-action="landscape" aria-label="Querformat">⛶</button>\n        </header>\n        <div class="bsk-content" id="bsk-content"></div>\n        <div class="bsk-rotate" id="bsk-rotate"><div class="bsk-rotate-card"><span class="bsk-rotate-icon">📱</span><h3>Drehe dein Handy</h3><p>Im Querformat zeichnet es sich leichter. Drehe dein Gerät, das Spiel passt sich automatisch an.</p><button class="bsk-secondary" data-action="allow-portrait">Im Hochformat bleiben</button></div></div>\n        <div class="bsk-toast" id="bsk-toast" role="status" aria-live="polite"></div>\n      </section>`;
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
      showToast('Querformat bereit');
    } else {
      try { tg?.unlockOrientation?.(); } catch {}
      showToast('Drehe dein Handy ins Querformat');
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
    if (code.length < 4) throw new Error('Raumcode eingeben');
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
    if (!silent) showConnecting('Raum wird betreten…');
    await connectSocket();
  }

  async function connectSocket() {
    if (!roomId || !sessionToken || destroyed) return;
    clearTimeout(reconnectTimer);
    try { socket?.close?.(); } catch {}
    const url = new URL(`${backendBase}/rooms/${roomId}/ws`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', sessionToken);
    setConnection('reconnecting', 'Verbindung');
    socket = new WebSocket(url.toString());

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server antwortet zu langsam')), 10_000);
      socket.addEventListener('open', () => {
        clearTimeout(timeout);
        reconnectAttempt = 0;
        setConnection('online', 'Online');
        resolve();
      }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Verbindung zum Raum fehlgeschlagen')); }, { once: true });
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
    if (payload.type === 'error') showToast(payload.error || 'Raumfehler', 'error');
  }

  function scheduleReconnect() {
    if (destroyed || leaving || document.hidden || !roomId) return;
    reconnectAttempt += 1;
    setConnection('reconnecting', 'Verbindung wird wiederhergestellt');
    const delay = Math.min(30_000, 2_500 * (2 ** Math.min(4, reconnectAttempt - 1)));
    reconnectTimer = setTimeout(() => {
      joinOrResume(roomId, true).catch((error) => {
        console.warn('Bible Sketch reconnect failed', error);
        scheduleReconnect();
      });
    }, delay);
  }

  async function sendAction(action, payload = {}, button = null) {
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Keine Verbindung zum Raum');
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
    if (!text) throw new Error('Antwort eingeben');
    guessDraft = '';
    if (input) input.value = '';
    await sendAction('submitGuess', { text }, button);
  }

  function renderHome() {
    state = null;
    allowPortrait = false;
    document.getElementById('bsk-root')?.classList.remove('allow-portrait-round');
    updateHeader();
    setConnection('', 'Nicht verbunden');
    const categoryCards = CATEGORIES.map((category) => `
      <button type="button" class="bsk-category ${category.id === selectedCategory ? 'is-selected' : ''}" data-action="category" data-category="${category.id}">
        <span class="bsk-category-icon">${category.icon}</span><b>${category.title}</b><small>${category.size} Wörter · ${esc(category.hint)}</small>
      </button>`).join('');
    document.getElementById('bsk-content').innerHTML = `\n      <div class="bsk-home">\n        <section class="bsk-hero"><span class="bsk-kicker">Realtime · 3–15 Spieler</span><h2>Zeichnen. Beobachten. Spion finden.</h2><p>Alle außer dem Spion kennen das Bibelwort. Die Spieler ergänzen abwechselnd eine gemeinsame Zeichnung, während der Spion das Wort herauszufinden versucht.</p>\n          <div class="bsk-rules"><div class="bsk-rule"><b>1 · Kategorie</b>Der Gastgeber wählt eine von sechs Kategorien: Gegenstände, Orte, Menschen, Ereignisse, Natur oder Handwerk.</div><div class="bsk-rule"><b>2 · Abwechselnd</b>Jeder Spieler hat 40 Sekunden, um Linien zur gemeinsamen Zeichnung hinzuzufügen.</div><div class="bsk-rule"><b>3 · Spion</b>Kann vor der Abstimmung eine Antwort riskieren.</div></div>\n        </section>\n        <div class="bsk-home-grid">\n          <section class="bsk-card bsk-glass"><h3 class="bsk-section-title">Raum erstellen</h3><label class="bsk-field"><span>Dein Name</span><input id="bsk-player-name" class="bsk-input" maxlength="32" value="${attr(playerName)}"></label><div class="bsk-category-grid">${categoryCards}</div><p class="bsk-note">Wörter wiederholen sich erst, wenn alle Wörter der Kategorie verwendet wurden. Danach beginnt der Stapel von vorn.</p><button type="button" class="bsk-primary" data-action="create-room" style="width:100%;margin-top:10px">Lobby erstellen</button></section>\n          <section class="bsk-card bsk-glass"><h3 class="bsk-section-title">Mit Code beitreten</h3><label class="bsk-field"><span>Raumcode</span><input id="bsk-room-code" class="bsk-input" maxlength="10" placeholder="ABC123" autocapitalize="characters"></label><button type="button" class="bsk-secondary" data-action="join-room" style="width:100%">Raum beitreten</button><p class="bsk-note">Beim Spielen über Telegram wird deine bestätigte Sitzung genutzt. Im normalen Browser gibt es einen Gastmodus.</p></section>\n        </div>\n      </div>`;
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
    if (!state) subtitle.textContent = 'Online-Zeichnen mit Spion';
    else subtitle.textContent = `Raum ${state.roomId} · ${state.category?.icon || '✨'} ${state.category?.title || ''}`;
  }

  function renderLobby() {
    const me = state.me || {};
    const activePlayers = state.players.filter((player) => player.isActive !== false);
    const players = activePlayers.map(renderPlayer).join('');
    document.getElementById('bsk-content').innerHTML = `\n      <div class="bsk-lobby-grid">\n        <section class="bsk-card bsk-glass"><div class="bsk-room-head"><div><div class="bsk-section-title">Raumcode</div><div class="bsk-room-code">${esc(state.roomId)}</div><div class="bsk-room-meta">${state.category.icon} ${esc(window.AppLanguage?.text(state.category.title) || state.category.title)} · ${state.category.size} Wörter · verwendet ${state.usedWordsCount}</div></div><div class="bsk-link-row"><button class="bsk-secondary" data-action="copy-room">Kopieren</button><button class="bsk-secondary" data-action="share-room">Teilen</button></div></div><div class="bsk-section-title">Spieler · ${activePlayers.length}/8</div><div class="bsk-player-list">${players}</div>${me.isHost ? `<button class="bsk-primary" data-action="start-round" style="width:100%;margin-top:12px" ${activePlayers.length < 3 ? 'disabled' : ''}>${activePlayers.length < 3 ? 'Mindestens 3 Spieler nötig' : 'Runde starten'}</button>` : '<div class="bsk-wait">Warten auf den Rundenstart durch den Gastgeber…</div>'}<button class="bsk-danger" data-action="leave-room" style="width:100%;margin-top:8px">Raum verlassen</button></section>\n        ${renderChat()}
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
        <aside class="bsk-side">${statusCard}<section class="bsk-card bsk-glass bsk-roster"><div class="bsk-section-title">Spieler</div><div class="bsk-player-list">${players}</div></section>${phasePanel}</aside>\n        <main class="bsk-canvas-card"><div class="bsk-canvas-wrap"><canvas id="bsk-canvas" class="bsk-canvas" aria-label="Gemeinsame Leinwand"></canvas><div class="bsk-canvas-cover" id="bsk-canvas-cover" ${state.status === 'drawing' ? 'hidden' : ''}>${canvasCoverText()}</div></div>${renderTools()}</main>
        ${renderChat()}
      </div>`;
  }

  function renderStatusCard() {
    const clock = clockValues();
    const me = state.me || {};
    const isSpy = me.role === 'spy';
    const turnName = state.currentDrawerName || 'Spieler';
    const secret = isSpy
      ? `<div class="bsk-secret bsk-spy-secret"><b>Du bist der Spion 🕵️</b><small>Du kennst nur die Kategorie: ${esc(window.AppLanguage?.text(state.category.title) || state.category.title)}. Beobachte die Zeichnungen und verrate dich nicht.</small></div>`
      : `<div class="bsk-secret"><small>Dein Wort</small><b>${esc(window.AppLanguage?.text(me.secret?.label) || me.secret?.label || '—')}</b><small>${esc(me.secret?.ref || '')} · Biblischer Wortschatz</small></div>`;
    return `<section class="bsk-status bsk-glass"><span class="bsk-status-tag">Runde ${state.roundNumber} · ${esc(window.AppLanguage?.text(state.category.title) || state.category.title)}</span><h3>${state.status === 'drawing' ? (me.canDraw ? 'Du bist dran — zeichne' : `Zeichnet ${esc(turnName)}`) : phaseTitle()}</h3><p>${state.status === 'drawing' ? `Zug ${Math.min(state.turnIndex + 1, state.turnCount)} von ${state.turnCount}` : phaseDescription()}</p>${secret}<div class="bsk-turn" style="margin-top:9px"><strong>${phaseTimerLabel()}</strong><span class="bsk-timer${clock.low ? ' is-low' : ''}" id="bsk-timer">${clock.text}</span></div><div class="bsk-progress"><span id="bsk-progress" style="width:${clock.percent}%"></span></div></section>`;
  }

  function phaseTitle() {
    if (state.status === 'answerReview') return 'Antwort des Spions prüfen';
    if (state.status === 'voting') return 'Wer ist der Spion?';
    if (state.status === 'finalGuess') return state.me?.role === 'spy' ? 'Letzte Chance' : 'Spion antwortet';
    return 'Runde';
  }
  function phaseDescription() {
    if (state.status === 'answerReview') return 'Keine genaue Übereinstimmung. Die Künstler entscheiden, ob die Antwort zählt.';
    if (state.status === 'voting') return 'Wähle den Spieler, der deiner Meinung nach das Wort nicht kannte.';
    if (state.status === 'finalGuess') return 'Der Spion wurde gefunden. Er kann das geheime Wort nennen und den Sieg stehlen.';
    return '';
  }
  function phaseTimerLabel() {
    if (state.status === 'drawing') return 'Zug endet in';
    if (state.status === 'answerReview') return 'Bestätigungszeit';
    if (state.status === 'voting') return 'Abstimmungszeit';
    if (state.status === 'finalGuess') return 'Antwortzeit';
    return '';
  }

  function renderTools() {
    const canDraw = state.status === 'drawing' && state.me?.canDraw;
    if (!canDraw) return `<div class="bsk-tools"><span class="bsk-count">${state.strokes.length} Linien auf der gemeinsamen Zeichnung</span>${state.status === 'drawing' ? '<span class="bsk-count"> · Werkzeuge erscheinen bei deinem Zug</span>' : ''}</div>`;
    const colors = ['#111827', '#4f46e5', '#0284c7', '#059669', '#d97706', '#dc2626', '#9333ea'];
    return `<div class="bsk-tools"><div class="bsk-colors">${colors.map((color) => `<button class="bsk-color ${brushMode === 'draw' && brushColor === color ? 'is-selected' : ''}" style="--c:${color}" data-action="brush-color" data-color="${color}" aria-label="Farbe"></button>`).join('')}</div><button class="bsk-tool ${brushMode === 'erase' ? 'is-selected' : ''}" data-action="brush-mode" data-mode="erase">Radierer</button>${[3, 6, 11].map((width) => `<button class="bsk-tool ${brushWidth === width ? 'is-selected' : ''}" data-action="brush-width" data-width="${width}">${width === 3 ? 'Dünn' : width === 6 ? 'Mittel' : 'Dick'}</button>`).join('')}<button class="bsk-tool" data-action="undo">↶ Rückgängig</button><button class="bsk-primary bsk-finish-turn" data-action="finish-turn">Zug beenden</button></div>`;
  }

  function renderEarlyGuess() {
    return `<section class="bsk-guess"><h4>Glaubst du, das Wort zu kennen?</h4><p>Der Spion hat einen vorzeitigen Versuch. Gibt es keine genaue Übereinstimmung, stimmen die anderen über die Antwort ab.</p><form id="bsk-guess-form" class="bsk-guess-form"><input id="bsk-guess-input" class="bsk-input" maxlength="80" placeholder="Antwort eingeben" value="${attr(guessDraft)}"><button class="bsk-primary" type="submit" data-action="submit-guess">Antwort senden</button></form></section>`;
  }

  function renderGuessReview() {
    const review = state.guessReview || {};
    if (state.me?.role === 'spy') return `<section class="bsk-review"><h3>Antwort gesendet</h3><div class="bsk-review-answer">«${esc(review.text || '')}»</div><p>Keine genaue Übereinstimmung. Warten auf die Entscheidung der anderen: ${review.votesCount || 0}/${review.votersCount || 0}.</p></section>`;
    const voted = review.myVote !== null && review.myVote !== undefined;
    return `<section class="bsk-review"><h3>Diese Antwort akzeptieren?</h3><div class="bsk-review-answer">«${esc(review.text || '')}»</div><p>Die automatische Prüfung fand keine Übereinstimmung. Bestätige eine gültige Formulierung oder ein Synonym.</p>${voted ? `<div class="bsk-wait">Deine Stimme wurde gezählt · ${review.votesCount}/${review.votersCount}</div>` : `<div class="bsk-review-actions"><button class="bsk-success" data-action="review-guess" data-accept="1">✓ Akzeptieren</button><button class="bsk-danger" data-action="review-guess" data-accept="0">✕ Ablehnen</button></div>`}</section>`;
  }

  function renderVoting() {
    const players = state.players.filter((player) => player.isActive !== false && player.playerId !== state.me?.playerId);
    if (state.me?.hasVotedSpy) return `<section class="bsk-review"><h3>Stimme gezählt</h3><p>Warten auf andere Spieler. Die Abstimmung zeigt, ob der Spion gefunden wurde.</p></section>`;
    return `<section class="bsk-card bsk-glass"><div class="bsk-section-title">Deine Stimme</div><div class="bsk-vote-grid">${players.map((player) => `<button class="bsk-vote-player" data-action="vote-spy" data-player-id="${attr(player.playerId)}">${esc(player.name)}</button>`).join('')}</div></section>`;
  }

  function renderFinalGuess() {
    if (state.me?.role !== 'spy') return `<section class="bsk-review"><h3>Spion gefunden</h3><p>Er versucht jetzt, das geheime Wort zu nennen. Bei einer falschen Antwort gewinnen die Künstler.</p></section>`;
    return `<section class="bsk-guess"><h4>Letzte Chance</h4><p>Nenne das Wort. Genaue Treffer werden automatisch geprüft; andere gültige Antworten können die Künstler bestätigen.</p><form id="bsk-guess-form" class="bsk-guess-form"><input id="bsk-guess-input" class="bsk-input" maxlength="80" placeholder="Deine Antwort" value="${attr(guessDraft)}"><button class="bsk-primary" type="submit" data-action="submit-guess">Antworten</button></form></section>`;
  }

  function canvasCoverText() {
    if (state.status === 'answerReview') return 'Zeichnen pausiert, während das Team die Antwort prüft.';
    if (state.status === 'voting') return 'Zeichnung fertig. Zeit, den Spion zu finden.';
    if (state.status === 'finalGuess') return 'Der Spion gibt seine letzte Antwort.';
    return '';
  }

  function renderFinished() {
    const result = state.result || {};
    const spyWon = result.winner === 'spy';
    const reason = resultReason(result.reason);
    document.getElementById('bsk-content').innerHTML = `
      <section class="bsk-result"><div class="bsk-result-icon">${spyWon ? '🕵️' : '🎨'}</div><h2>${spyWon ? 'Der Spion gewinnt' : 'Die Künstler gewinnen'}</h2><p>${esc(reason)}</p><div class="bsk-result-word"><small>Geheimes Wort</small><b>${esc(window.AppLanguage?.text(result.word?.label) || result.word?.label || '—')}</b><small>${esc(result.word?.ref || '')} · Biblischer Wortschatz</small></div><p>Spion: <b>${esc(result.spyName || '—')}</b>${result.guessText ? ` · Antwort «${esc(result.guessText)}»` : ''}</p><div class="bsk-actions">${state.me?.isHost ? '<button class="bsk-primary" data-action="restart-round">Neue Runde</button>' : ''}<button class="bsk-secondary" data-action="copy-room">Raumcode</button><button class="bsk-danger" data-action="leave-room">Verlassen</button></div></section>\n      <div class="bsk-lobby-grid" style="margin-top:12px"><section class="bsk-canvas-card"><div class="bsk-canvas-wrap"><canvas id="bsk-canvas" class="bsk-canvas"></canvas></div></section>${renderChat()}</div>`;
  }

  function resultReason(reason) {
    const map = {
      early_guess_auto: 'Der Spion hat das Wort vorzeitig genau erraten.',
      early_guess_human: 'Der Spion antwortete vorzeitig und die Künstler akzeptierten die Antwort.',
      final_guess_auto: 'Der Spion wurde gefunden, erriet aber das Wort im letzten Versuch.',
      final_guess_human: 'Der Spion wurde gefunden, aber das Team akzeptierte seine letzte Antwort.',
      final_guess_rejected: 'Der Spion wurde gefunden und das Team lehnte seine letzte Antwort ab.',
      final_guess_timeout: 'Der Spion wurde gefunden, antwortete aber nicht rechtzeitig.',
      spy_not_found: 'Das Team wählte nach dem Zeichnen den falschen Spieler.',
      vote_tie: 'Die Abstimmung war unentschieden, daher blieb der Spion unerkannt.',
      spy_left: 'Der Spion hat die Runde verlassen.',
      not_enough_players: 'Zu wenige Spieler zum Fortsetzen übrig.',
    };
    return map[reason] || 'Runde beendet.';
  }

  function renderPlayer(player) {
    const initials = String(player.name || '?').trim().slice(0, 1).toUpperCase();
    const details = [player.connected ? 'online' : 'keine Verbindung'];
    if (player.isCurrentDrawer) details.unshift('zeichnet gerade');
    return `<div class="bsk-player"><div class="bsk-avatar">${esc(initials)}</div><div><b>${esc(player.name)}</b><small>${details.join(' · ')}</small></div>${player.isHost ? '<span class="bsk-host">Gastgeber</span>' : ''}</div>`;
  }

  function renderChat() {
    const messages = (state?.chat || []).map((message) => `<div class="bsk-message ${message.playerId === state?.me?.playerId ? 'is-me' : ''}"><b>${esc(message.name)}</b>${esc(message.text)}<time>${formatTime(message.at)}</time></div>`).join('');
    return `<section class="bsk-chat bsk-card bsk-glass"><div class="bsk-chat-head"><b>Raumchat</b><span class="bsk-count">${state?.chat?.length || 0}</span></div><div class="bsk-chat-list" id="bsk-chat-list">${messages || '<div class="bsk-empty">Noch keine Nachrichten</div>'}</div><form id="bsk-chat-form" class="bsk-chat-form"><input id="bsk-chat-input" class="bsk-input" maxlength="300" placeholder="Nachricht…" value="${attr(chatDraft)}"><button class="bsk-send" type="submit" aria-label="Senden">↑</button></form><div class="bsk-note">Während der Runde darf das geheime Wort nicht im Chat gesendet werden.</div></section>`;
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
  /*
    Палец опрашивается чаще, чем экран успевает обновляться, и браузер копит
    промежуточные события до кадра. Раньше из них брался только последний: на
    быстром движении след срезал углы. Теперь берутся все, а холст
    перерисовывается раз в кадр — до этого он переписывался на каждое событие
    вместе со всеми уже нарисованными линиями, отчего к концу раунда рисование
    и начинало тормозить.
  */
  function onPointerMove(event) {
    if (activePointer !== event.pointerId || !activePoints.length) return;
    const canvas = event.currentTarget;
    const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    for (const step of (events.length ? events : [event])) {
      const point = pointFromEvent(canvas, step);
      const last = activePoints[activePoints.length - 1];
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < .0025) continue;
      activePoints.push(point);
    }
    schedulePreview();
    event.preventDefault();
  }

  function schedulePreview() {
    if (previewFrame) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      if (activePoints.length) drawCanvasFromState(activePoints);
    });
  }

  function cancelPreview() {
    if (!previewFrame) return;
    cancelAnimationFrame(previewFrame);
    previewFrame = 0;
  }

  function onPointerCancel() { activePointer = null; activePoints = []; cancelPreview(); drawCanvasFromState(); }
  async function onPointerUp(event) {
    if (activePointer !== event.pointerId) return;
    const points = activePoints;
    activePointer = null;
    activePoints = [];
    cancelPreview();
    // Касание без ведения — точка. Сервер линию короче двух точек не примет,
    // поэтому она отправляется как отрезок нулевой длины, а рисуется кругом.
    if (points.length === 1) points.push([...points[0]]);
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

  /*
    Штрих ведётся кривой, а не ломаной.

    Точки приходят с частотой опроса пальца, а перед отправкой прореживаются до
    трёхсот: по прямым отрезкам такой след выходит гранёным, и на дуге видно
    каждый излом. Кривая Безье через середины соседних точек убирает изломы,
    ничего не искажая: она проходит ровно по тем же серединам, а сами точки
    становятся направляющими.

    Одна точка — это касание без ведения. Раньше оно не оставляло ничего: линию
    короче двух точек рисовать было нечем. Теперь это круг радиусом в половину
    кисти — то, чего человек и ждёт от тычка карандашом.
  */
  function drawStroke(ctx, stroke, width, height, dpr) {
    const points = stroke.points || [];
    if (!points.length) return;
    const lineWidth = Math.max(2, Number(stroke.width || 5)) * dpr;
    const paint = stroke.mode === 'erase' ? '#ffffff' : (stroke.color || '#111827');
    const at = (index) => [points[index][0] * width, points[index][1] * height];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = paint;
    ctx.fillStyle = paint;
    ctx.lineWidth = lineWidth;

    if (points.length === 1 || (points.length === 2 && points[0][0] === points[1][0] && points[0][1] === points[1][1])) {
      const [x, y] = at(0);
      ctx.beginPath();
      ctx.arc(x, y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    const [startX, startY] = at(0);
    ctx.moveTo(startX, startY);
    for (let index = 1; index < points.length - 1; index += 1) {
      const [x, y] = at(index);
      const [nextX, nextY] = at(index + 1);
      ctx.quadraticCurveTo(x, y, (x + nextX) / 2, (y + nextY) / 2);
    }
    const [endX, endY] = at(points.length - 1);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
  }

  function startClock() {
    clearInterval(timerInterval);
    timerInterval = setInterval(updateClock, 250);
  }

  /*
    Показания часов считаются в одном месте — и для разметки, и для тика.

    Раньше разметка выдавала «—» и полосу на все сто, а настоящее время
    появлялось только со следующим тиком. Состояние комнаты приходит на каждое
    действие любого игрока — на каждый штрих, на очистку холста, — и каждый раз
    экран собирался заново: часы прыгали на полное время и через четверть
    секунды возвращались назад. Полоса при этом ещё и переезжала анимацией.
    Отсюда и «при стирании таймер начинается заново».
  */
  function clockValues() {
    const deadline = Number(state?.turnDeadlineMs || 0);
    if (!deadline) return { text: '—', percent: 100, low: false };
    const remaining = Math.max(0, deadline - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    const total = PHASE_MS[state.status] || 40_000;
    return {
      text: `${seconds}с`,
      percent: Math.max(0, Math.min(100, (remaining / total) * 100)),
      low: seconds <= 8,
    };
  }

  function updateClock() {
    if (!state?.turnDeadlineMs) return;
    const timer = document.getElementById('bsk-timer');
    const progress = document.getElementById('bsk-progress');
    if (!timer || !progress) return;
    const clock = clockValues();
    if (timer.textContent !== clock.text) timer.textContent = clock.text;
    timer.classList.toggle('is-low', clock.low);
    progress.style.width = `${clock.percent}%`;
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
    const ok = window.confirm('Aktuellen Raum verlassen?');
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
    try { await navigator.clipboard.writeText(roomId); showToast('Raumcode kopiert'); }
    catch { showToast(`Raumcode: ${roomId}`); }
  }

  async function shareRoom() {
    if (!roomId) return;
    const text = `Bibelkünstler · Raumcode ${roomId}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Bibelkünstler', text }); return; } catch {}
    }
    await copyRoomCode();
  }

  function showConnecting(text) {
    document.getElementById('bsk-content').innerHTML = `<section class="bsk-result"><div class="app-loader__ring"></div><h2 style="margin-top:14px">${esc(text)}</h2><p>Verbindung wird hergestellt realtime-Raum…</p></section>`;
  }
  function showBackendNotConfigured() { showFatal('Onlineserver noch nicht eingerichtet.'); }
  function showFatal(message) {
    document.getElementById('bsk-content').innerHTML = `<section class="bsk-result"><div class="bsk-result-icon">⚠️</div><h2>Spiel konnte nicht gestartet werden</h2><p>${esc(message)}</p><div class="bsk-actions"><button class="bsk-secondary" data-action="back">Zum Hauptmenü</button></div></section>`;
  }

  function setConnection(kind, text) {
    const box = document.getElementById('bsk-connection');
    const label = document.getElementById('bsk-connection-text');
    if (box) {
      box.className = `bsk-connection ${kind ? `is-${kind}` : ''}`;
      box.setAttribute('role', 'status');
      box.setAttribute('title', text);
      box.setAttribute('aria-label', `Verbindung: ${text}`);
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
      throw Object.assign(new Error('Verbindung verzögert'), { clientBackoff: true });
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
  function formatTime(value) { try { return new Date(value || Date.now()).toLocaleTimeString("de", { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }
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
