(() => {
  'use strict';

  const key = 'bible_game_display_v1';
  const levels = new Set(['low', 'normal', 'high']);
  const documentRoot = document.documentElement;
  if (!documentRoot.hasAttribute('data-full-preview') && !documentRoot.hasAttribute('data-game-catalog')) return;
  documentRoot.dataset.gameCatalog = '';
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const apk = window.__ANDROID_APK__ === true;
  const android = apk || /Android/i.test(navigator.userAgent)
    || navigator.userAgentData?.platform === 'Android'
    || /^android/i.test(window.Telegram?.WebApp?.platform || '');
  const safeDisplay = apk && new URLSearchParams(location.search).get('safeDisplay') === '1';
  const limitedDevice = Boolean(navigator.connection?.saveData
    || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4)
    || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4)
    || (apk && window.AndroidApp?.isLowRamDevice?.()));
  let preferences;

  function staticMenu() {
    return android || limitedDevice || preferences.graphics === 'low';
  }

  function read() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
    return {
      graphics: levels.has(saved?.graphics) ? saved.graphics : limitedDevice ? 'low' : 'normal',
      animations: levels.has(saved?.animations) ? saved.animations : (limitedDevice || reduceMotion?.matches) ? 'low' : 'normal',
    };
  }

  function apply(next) {
    preferences = next;
    documentRoot.dataset.graphics = next.graphics;
    documentRoot.dataset.animations = next.animations;
    documentRoot.toggleAttribute('data-static-menu', staticMenu());
  }

  function set(values) {
    const saved = read();
    const next = { ...preferences };
    for (const type of ['graphics', 'animations']) {
      if (levels.has(values[type])) saved[type] = next[type] = values[type];
    }
    try { localStorage.setItem(key, JSON.stringify(saved)); } catch {}
    apply(next);
    window.dispatchEvent(new Event('game-display:change'));
  }

  function pixelRatio(limit = 2) {
    const budget = { low: 1, normal: 1.5, high: 2 }[preferences.graphics];
    return Math.min(window.devicePixelRatio || 1, limit, budget);
  }

  apply(safeDisplay ? { graphics: 'low', animations: 'low' } : read());
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    apply(read());
    window.dispatchEvent(new Event('game-display:change'));
  });
  window.GameDisplay = Object.freeze({
    get: () => ({ ...preferences }),
    set,
    lowGraphics: () => preferences.graphics === 'low',
    reducedMotion: () => preferences.animations === 'low' || reduceMotion?.matches === true,
    staticMenu,
    pixelRatio,
  });
})();
