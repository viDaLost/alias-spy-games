(() => {
  'use strict';
  if (window.__bmtV27HotfixInstalled) return;
  window.__bmtV27HotfixInstalled = true;

  const VERSION = '28';
  const MENU_ICON = `web/assets/icons/biblical-treasures.webp?v=${VERSION}`;

  function patchMenuIcon(root = document) {
    const card = root.querySelector?.('#biblical-match-three-card') || document.getElementById('biblical-match-three-card');
    const img = card?.querySelector('img');
    if (!img) return;
    if ((img.getAttribute('src') || '') !== MENU_ICON) img.src = MENU_ICON;
    img.dataset.bmtMenuArt = 'v28';
  }

  function captureResultStars(root = document) {
    root.querySelectorAll?.('.bmt-result-card.is-win').forEach((card) => {
      const stars = card.querySelector('.bmt-result-stars, .bmt-v22-result-stars');
      if (!stars) return;
      const label = stars.getAttribute('aria-label') || '';
      let rating = Number((label.match(/([1-3])\s*(?:из|\/|of)\s*3/i) || [])[1] || 0);
      if (!rating) rating = stars.querySelectorAll('.is-on, .active, [data-on="true"], [aria-checked="true"]').length;
      if (rating >= 1 && rating <= 3) card.dataset.resultStars = String(rating);
    });
  }

  function installArkGuard() {
    document.addEventListener('click', (event) => {
      const ark = event.target?.closest?.('[data-booster="ark"]');
      if (!ark || document.body?.dataset?.currentGame !== 'biblical-match-three') return;

      const nativeMap = Array.prototype.map;
      if (nativeMap.__bmtArkGuardV28) return;

      function guardedMap(callback, thisArg) {
        const array = this;
        const looksLikeShapedBoard = Array.isArray(array)
          && array.some((value) => value === null)
          && array.some((value) => value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'type'));
        if (!looksLikeShapedBoard || typeof callback !== 'function') return nativeMap.call(array, callback, thisArg);

        return nativeMap.call(array, (value, index, source) => {
          if (value !== null) return callback.call(thisArg, value, index, source);
          try {
            return callback.call(thisArg, value, index, source);
          } catch (error) {
            if (error instanceof TypeError) return -1;
            throw error;
          }
        });
      }

      guardedMap.__bmtArkGuardV28 = true;
      Array.prototype.map = guardedMap;
      setTimeout(() => {
        if (Array.prototype.map === guardedMap) Array.prototype.map = nativeMap;
      }, 0);
    }, true);
  }

  function start() {
    installArkGuard();
    patchMenuIcon(document);
    captureResultStars(document);
    new MutationObserver(() => {
      patchMenuIcon(document);
      captureResultStars(document);
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-current-game', 'class', 'aria-label'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
