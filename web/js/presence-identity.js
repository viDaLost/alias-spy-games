(() => {
  if (window.__APP_TELEMETRY_DISABLED__) return;

  const backend = String(document.querySelector('meta[name="app-observability"]')?.content || '').replace(/\/+$/, '');
  const coreBackend = String(document.querySelector('meta[name="app-core-backend"]')?.content || '').replace(/\/+$/, '');
  const initData = String(window.Telegram?.WebApp?.initData || '');
  if (!backend || !coreBackend || !initData) return;

  const HEARTBEAT_MS = 15_000;
  const CONTEXT_CHECK_MS = 900;
  const sid = getSessionId();
  let socket = null;
  let reconnectTimer = null;
  let pingTimer = null;
  let contextTimer = null;
  let lastPresence = '';
  let pageLeaving = false;
  let sessionToken = '';
  let sessionExpiresAt = 0;
  let sessionPromise = null;
  let explicitRoom = '';
  let explicitGame = '';

  function getSessionId() {
    const key = 'app_telemetry_sid_v1';
    let value = localStorage.getItem(key) || '';
    if (/^[a-zA-Z0-9_-]{16,64}$/.test(value)) return value;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    value = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(key, value);
    return value;
  }

  function currentGame() {
    return String(document.body?.dataset?.currentGame || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  }

  function normalizeRoom(value) {
    const room = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    return /^[A-Z0-9]{4,10}$/.test(room) ? room : '';
  }

  function roomFromStorage(game) {
    try {
      if (game === 'quartet') return normalizeRoom(localStorage.getItem('quartet_v2_room_id'));
      if (game === 'bible-sketch') return normalizeRoom(localStorage.getItem('bible_sketch_room_id_v1'));
    } catch {}
    return '';
  }

  function currentRoomId() {
    const game = currentGame();
    if (explicitGame === game && explicitRoom) return explicitRoom;
    return roomFromStorage(game);
  }

  window.AppPresenceContext = Object.freeze({
    setRoom(game, roomId) {
      explicitGame = String(game || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
      explicitRoom = normalizeRoom(roomId);
      sendPresence(true);
    },
    clearRoom(game = '') {
      if (!game || explicitGame === String(game).toLowerCase()) {
        explicitGame = '';
        explicitRoom = '';
        sendPresence(true);
      }
    },
  });

  async function ensureSession() {
    const now = Date.now();
    if (sessionToken && sessionExpiresAt - now > 60_000) return sessionToken;
    if (sessionPromise) return sessionPromise;
    sessionPromise = (async () => {
      const response = await fetch(`${coreBackend}/web/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramInitData: initData, scope: 'presence' }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok !== true || !data?.token) throw new Error(data?.error || `Session HTTP ${response.status}`);
      sessionToken = String(data.token);
      sessionExpiresAt = Number(data.expiresAt || 0);
      return sessionToken;
    })().finally(() => { sessionPromise = null; });
    return sessionPromise;
  }

  async function connect() {
    if (pageLeaving || document.hidden || !navigator.onLine) return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;

    try {
      const token = await ensureSession();
      if (pageLeaving || document.hidden) return;
      const url = new URL(`${backend}/presence`);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('sid', sid);
      url.searchParams.set('token', token);
      socket = new WebSocket(url.toString());
    } catch (error) {
      console.warn('Presence session unavailable:', error);
      socket = null;
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      if (pageLeaving || document.hidden) return sendOfflineAndClose('hidden-on-open');
      lastPresence = '';
      sendPresence(true);
      restartHeartbeat();
    });

    socket.addEventListener('close', (event) => {
      socket = null;
      clearInterval(pingTimer);
      pingTimer = null;
      if (event?.code === 1008 || event?.code === 4401) {
        sessionToken = '';
        sessionExpiresAt = 0;
      }
      scheduleReconnect();
    });
    socket.addEventListener('error', () => {});
  }

  function restartHeartbeat() {
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (document.hidden || pageLeaving) return sendOfflineAndClose('hidden-heartbeat');
      if (socket?.readyState === WebSocket.OPEN) {
        try { socket.send(JSON.stringify({ type: 'ping' })); } catch {}
      } else connect();
    }, HEARTBEAT_MS);
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (pageLeaving || document.hidden || !navigator.onLine) return;
    reconnectTimer = setTimeout(connect, 2_500);
  }

  function sendPresence(force = false) {
    if (document.hidden || pageLeaving) return;
    const game = currentGame();
    const roomId = currentRoomId();
    const signature = `${game}|${roomId}`;
    if (!force && signature === lastPresence) return;
    if (socket?.readyState !== WebSocket.OPEN) {
      connect();
      return;
    }
    lastPresence = signature;
    try { socket.send(JSON.stringify({ type: 'presence', platform: 'telegram', visible: true, game, roomId })); } catch {}
  }

  function sendOfflineAndClose(reason = 'hidden') {
    clearInterval(pingTimer);
    pingTimer = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    lastPresence = '';
    const current = socket;
    socket = null;
    if (!current) return;
    if (current.readyState === WebSocket.OPEN) {
      try { current.send(JSON.stringify({ type: 'offline', reason })); } catch {}
    }
    try { current.close(1000, reason); } catch {}
  }

  const observer = new MutationObserver(() => sendPresence());
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-current-game', 'data-mode'] });
  contextTimer = window.setInterval(() => sendPresence(), CONTEXT_CHECK_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sendOfflineAndClose('hidden');
    else { connect(); window.setTimeout(() => sendPresence(true), 60); }
  });
  window.addEventListener('online', () => { connect(); window.setTimeout(() => sendPresence(true), 60); });
  window.addEventListener('offline', () => sendOfflineAndClose('network-offline'));
  window.addEventListener('pagehide', () => {
    pageLeaving = true;
    observer.disconnect();
    clearInterval(contextTimer);
    sendOfflineAndClose('pagehide');
  }, { once: true });

  connect();
})();
