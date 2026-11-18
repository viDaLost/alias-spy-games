(() => {
  'use strict';

  const key = 'bible_game_display_v1';
  const levels = new Set(['low', 'normal', 'high']);
  const documentRoot = document.documentElement;
  if (!documentRoot.hasAttribute('data-full-preview') && new URLSearchParams(location.search).get('menu') !== 'catalog') return;
  documentRoot.dataset.gameCatalog = '';
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let preferences;

  function read() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
    return {
      graphics: levels.has(saved?.graphics) ? saved.graphics : 'normal',
      animations: levels.has(saved?.animations) ? saved.animations : reduceMotion?.matches ? 'low' : 'normal',
    };
  }

  function apply(next) {
    preferences = next;
    documentRoot.dataset.graphics = next.graphics;
    documentRoot.dataset.animations = next.animations;
  }

  function set(values) {
    const next = { ...preferences };
    for (const type of ['graphics', 'animations']) {
      if (levels.has(values[type])) next[type] = values[type];
    }
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    apply(next);
    window.dispatchEvent(new Event('game-display:change'));
  }

  function pixelRatio(limit = 2) {
    const budget = { low: 1, normal: 1.5, high: 2 }[preferences.graphics];
    return Math.min(window.devicePixelRatio || 1, limit, budget);
  }

  apply(read());
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
    pixelRatio,
  });
})();
