(() => {
  if (window.__APP_TELEMETRY_DISABLED__) return;

  const WRAPPED = Symbol('presenceGameBridgeWrapped');
  let lastAnnounced = null;
  let patchTimer = 0;

  function normalizeGame(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  }

  function announce(game) {
    const normalized = normalizeGame(game);
    if (lastAnnounced === normalized) return;
    lastAnnounced = normalized;
    try {
      if (normalized) window.AppPresenceContext?.setGame?.(normalized);
      else window.AppPresenceContext?.clearGame?.();
    } catch {}
    try { window.dispatchEvent(new CustomEvent('app:game-presence', { detail: { game: normalized } })); } catch {}
  }

  function syncFromDom() {
    const game = normalizeGame(document.body?.dataset?.currentGame || '');
    const mode = String(document.body?.dataset?.mode || '').toLowerCase();
    if (game) announce(game);
    else if (mode !== 'game') announce('');
  }

  function wrapGameLauncher() {
    const original = window.showGame;
    if (typeof original !== 'function' || original[WRAPPED]) return;
    function wrappedShowGame(gameName, ...args) {
      announce(gameName);
      return original.call(this, gameName, ...args);
    }
    Object.defineProperty(wrappedShowGame, WRAPPED, { value: true });
    window.showGame = wrappedShowGame;
  }

  function wrapMenuFunction(name) {
    const original = window[name];
    if (typeof original !== 'function' || original[WRAPPED]) return;
    function wrappedMenu(...args) {
      announce('');
      return original.apply(this, args);
    }
    Object.defineProperty(wrappedMenu, WRAPPED, { value: true });
    window[name] = wrappedMenu;
  }

  function patchGlobals() {
    wrapGameLauncher();
    wrapMenuFunction('goToMainMenu');
    wrapMenuFunction('appGoToMainMenu');
  }

  const observer = new MutationObserver(() => {
    syncFromDom();
    if (!patchTimer) {
      patchTimer = window.setTimeout(() => {
        patchTimer = 0;
        patchGlobals();
      }, 50);
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-current-game', 'data-mode'],
  });

  // Capture menu clicks as an early signal. The DOM/body marker remains the
  // source of truth, so this only removes latency during game launch.
  document.addEventListener('click', (event) => {
    const node = event.target?.closest?.('[data-game],[data-game-key],[data-open-game]');
    if (!node) return;
    const game = node.dataset.game || node.dataset.gameKey || node.dataset.openGame || '';
    if (game) announce(game);
  }, true);

  window.addEventListener('pageshow', () => {
    patchGlobals();
    syncFromDom();
  });

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    clearTimeout(patchTimer);
  }, { once: true });

  patchGlobals();
  syncFromDom();
  window.setTimeout(patchGlobals, 250);
  window.setTimeout(syncFromDom, 300);
})();
