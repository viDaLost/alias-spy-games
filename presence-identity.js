(() => {
  if (window.__APP_TELEMETRY_DISABLED__) return;
  const backend = String(document.querySelector('meta[name="app-observability"]')?.content || '').replace(/\/+$/, '');
  const initData = String(window.Telegram?.WebApp?.initData || '');
  if (!backend || !initData) return;

  const sid = getSessionId();
  let socket = null;
  let reconnectTimer = null;
  let pingTimer = null;
  let updateTimer = null;
  let lastPresence = '';

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
    return String(document.body.dataset.currentGame || '').toLowerCase();
  }

  function currentRoomId() {
    if (currentGame() !== 'quartet') return '';
    const subtitle = document.querySelector('.qv2-subtitle')?.textContent || '';
    const match = subtitle.match(/Комната\s+([A-Z0-9]{4,10})/i);
    return match ? match[1].toUpperCase() : '';
  }

  function socketUrl() {
    const url = new URL(`${backend}/presence`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('sid', sid);
    url.searchParams.set('initData', initData);
    return url.toString();
  }

  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(reconnectTimer);
    try {
      socket = new WebSocket(socketUrl());
    } catch {
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      lastPresence = '';
      sendPresence(true);
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
      }, 45_000);
    });
    socket.addEventListener('close', scheduleReconnect);
    socket.addEventListener('error', () => {});
  }

  function scheduleReconnect() {
    clearInterval(pingTimer);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, document.hidden ? 15_000 : 4_000);
  }

  function sendPresence(force = false) {
    const game = currentGame();
    const roomId = currentRoomId();
    const signature = `${game}|${roomId}`;
    if (!force && signature === lastPresence) return;
    if (socket?.readyState !== WebSocket.OPEN) {
      connect();
      return;
    }
    lastPresence = signature;
    socket.send(JSON.stringify({ type: 'presence', game, roomId }));
  }

  const observer = new MutationObserver(() => {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(() => sendPresence(), 100);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-current-game', 'class'] });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      connect();
      sendPresence(true);
    }
  });
  window.addEventListener('online', connect);
  window.addEventListener('pagehide', () => {
    clearTimeout(reconnectTimer);
    clearInterval(pingTimer);
    try { socket?.close(1000, 'pagehide'); } catch {}
  });

  connect();
})();
