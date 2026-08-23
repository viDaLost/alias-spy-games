(() => {
  if (window.__APP_TELEMETRY_DISABLED__) return;

  const backend = String(document.querySelector('meta[name="app-observability"]')?.content || '').replace(/\/+$/, '');
  if (!backend) return;

  let lastQuartetPhase = '';
  let observerTimer = 0;
  const sid = getSessionId();

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
    return String(document.body?.dataset?.currentGame || '').toLowerCase();
  }

  function currentRoomId() {
    const game = currentGame();
    try {
      if (game === 'quartet') return sanitizeRoom(localStorage.getItem('quartet_v2_room_id'));
      if (game === 'bible-sketch') return sanitizeRoom(localStorage.getItem('bible_sketch_room_id_v1'));
    } catch {}
    return '';
  }

  function sanitizeRoom(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  }

  function currentQuartetPhase() {
    if (currentGame() !== 'quartet') return '';
    if (document.querySelector('.qv2-result-hero')) return 'finished';
    if (document.querySelector('.qv2-game')) return 'playing';
    if (document.querySelector('.qv2-lobby')) return 'lobby';
    return '';
  }

  function track(event, details = {}) {
    if (!event || document.hidden || !navigator.onLine) return;
    const payload = {
      sid,
      event: String(event).slice(0, 64),
      game: String(details.game || currentGame()).slice(0, 40),
      roomId: String(details.roomId || currentRoomId()).slice(0, 10),
      message: details.message ? String(details.message).slice(0, 180) : undefined,
    };
    fetch(`${backend}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }

  function detectQuartetPhase() {
    const game = currentGame();
    const roomId = currentRoomId();
    if (game !== 'quartet' || !roomId) {
      lastQuartetPhase = '';
      return;
    }
    const phase = currentQuartetPhase();
    const key = `${roomId}:${phase}`;
    if (!phase || key === lastQuartetPhase) return;
    lastQuartetPhase = key;
    if (phase === 'playing') track('quartet_party_started', { game, roomId });
    if (phase === 'finished') track('quartet_party_finished', { game, roomId });
  }

  function wrapNavigation() {
    if (typeof window.showGame === 'function' && !window.showGame.__telemetryWrapped) {
      const originalShowGame = window.showGame;
      const wrapped = function(gameName) {
        track('game_open', { game: gameName, roomId: '' });
        return originalShowGame.apply(this, arguments);
      };
      wrapped.__telemetryWrapped = true;
      window.showGame = wrapped;
    }
  }

  function scheduleScan() {
    clearTimeout(observerTimer);
    observerTimer = window.setTimeout(() => {
      wrapNavigation();
      detectQuartetPhase();
    }, 250);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-current-game', 'class'],
  });

  window.addEventListener('pagehide', () => {
    clearTimeout(observerTimer);
    observer.disconnect();
  }, { once: true });

  wrapNavigation();
  detectQuartetPhase();

  // Presence and administrator live monitoring intentionally live in the
  // dedicated presence-identity.js and admin-live-v3.js clients. Keeping one
  // owner per realtime channel prevents duplicate WebSocket reconnect storms
  // and redundant Cloudflare polling.
  window.AppTelemetry = Object.freeze({ track });
})();
