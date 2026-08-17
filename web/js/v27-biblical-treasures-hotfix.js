(() => {
  'use strict';
  if (window.__bmtV27HotfixInstalled) return;
  window.__bmtV27HotfixInstalled = true;

  function captureResultStars(root = document) {
    root.querySelectorAll?.('.bmt-result-card.is-win:not([data-result-stars])').forEach((card) => {
      const stars = card.querySelector('.bmt-result-stars, .bmt-v22-result-stars');
      if (!stars) return;
      const label = stars.getAttribute('aria-label') || '';
      let rating = Number((label.match(/([1-3])\s*(?:из|\/)/i) || [])[1] || 0);
      if (!rating) rating = stars.querySelectorAll('.is-on').length;
      if (rating >= 1 && rating <= 3) card.dataset.resultStars = String(rating);
    });
  }

  function installArkGuard() {
    document.addEventListener('click', (event) => {
      const ark = event.target?.closest?.('[data-booster="ark"]');
      if (!ark || document.body?.dataset?.currentGame !== 'biblical-match-three') return;

      const nativeMap = Array.prototype.map;
      if (nativeMap.__bmtArkGuard) return;

      function guardedMap(callback, thisArg) {
        const array = this;
        const looksLikeBoard = Array.isArray(array)
          && array.some((value) => value === null)
          && array.some((value) => value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'type'));

        if (!looksLikeBoard) return nativeMap.call(array, callback, thisArg);
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

      guardedMap.__bmtArkGuard = true;
      Array.prototype.map = guardedMap;
      queueMicrotask(() => {
        if (Array.prototype.map === guardedMap) Array.prototype.map = nativeMap;
      });
    }, true);
  }

  function start() {
    installArkGuard();
    captureResultStars(document);
    new MutationObserver((records) => {
      if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
      if (records.some((record) => record.type === 'childList' && record.addedNodes.length)) captureResultStars(document);
    }).observe(document.getElementById('game-container') || document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
