(() => {
  if (window.__APP_TELEMETRY_DISABLED__) return;

  const backend = String(document.querySelector('meta[name="app-observability"]')?.content || '').replace(/\/+$/, '');
  const initData = String(window.Telegram?.WebApp?.initData || '');

  // Web presence is accepted only with verified Telegram initData. Native Android
  // uses AppPresenceClient with its authenticated Bearer session.
  if (!backend || !initData) return;

  const HEARTBEAT_MS = 15_000;
  const sid = getSessionId();
  let socket = null;
  let reconnectTimer = null;
  let pingTimer = null;
  let updateTimer = null;
  let lastPresence = '';
  let pageLeaving = false;

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

  function roomFromText(value) {
    const text = String(value || '');
    const explicit = text.match(/Комната\s+([A-Z0-9]{4,10})/i);
    if (explicit) return normalizeRoom(explicit[1]);
    return normalizeRoom(text.trim());
  }

  function currentRoomId() {
    const game = currentGame();
    if (game === 'quartet') {
      return roomFromText(document.querySelector('.qv2-room-code')?.textContent)
        || roomFromText(document.querySelector('.qv2-subtitle')?.textContent);
    }
    if (game === 'bible-sketch') {
      return roomFromText(document.querySelector('.bsk-room-code')?.textContent)
        || roomFromText(document.querySelector('.bsk-subtitle')?.textContent);
    }
    return '';
  }

  function socketUrl() {
    const url = new URL(`${backend}/presence`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('sid', sid);
    url.searchParams.set('initData', initData);
    return url.toString();
  }

  function connect() {
    if (pageLeaving || document.hidden || !navigator.onLine) return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    clearTimeout(reconnectTimer);
    reconnectTimer = null;

    try {
      socket = new WebSocket(socketUrl());
    } catch {
      socket = null;
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      if (pageLeaving || document.hidden) {
        sendOfflineAndClose('hidden-on-open');
        return;
      }
      lastPresence = '';
      sendPresence(true);
      restartHeartbeat();
    });

    socket.addEventListener('close', () => {
      socket = null;
      clearInterval(pingTimer);
      pingTimer = null;
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {});
  }

  function restartHeartbeat() {
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (document.hidden || pageLeaving) {
        sendOfflineAndClose('hidden-heartbeat');
        return;
      }
      if (socket?.readyState === WebSocket.OPEN) {
        try { socket.send(JSON.stringify({ type: 'ping' })); } catch {}
      } else {
        connect();
      }
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
    try {
      socket.send(JSON.stringify({
        type: 'presence',
        platform: 'telegram',
        visible: true,
        game,
        roomId,
      }));
    } catch {}
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
      try { current.close(1000, reason); } catch {}
    } else {
      try { current.close(1000, reason); } catch {}
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => sendPresence(), 80);
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-current-game', 'class'],
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      sendOfflineAndClose('hidden');
    } else {
      connect();
      window.setTimeout(() => sendPresence(true), 60);
    }
  });

  window.addEventListener('online', () => {
    connect();
    window.setTimeout(() => sendPresence(true), 60);
  });
  window.addEventListener('offline', () => sendOfflineAndClose('network-offline'));

  window.addEventListener('pagehide', () => {
    pageLeaving = true;
    observer.disconnect();
    clearTimeout(updateTimer);
    sendOfflineAndClose('pagehide');
  }, { once: true });

  connect();
})();
