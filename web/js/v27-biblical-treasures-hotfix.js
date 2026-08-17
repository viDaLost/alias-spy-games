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
      let rating = Number((label.match(/([1-3])\s*(?:из|\/)/i) || [])[1] || 0);
      if (!rating) rating = stars.querySelectorAll('.is-on, .active, [data-on="true"], [aria-checked="true"]').length;
      if (rating >= 1 && rating <= 3 && card.dataset.resultStars !== String(rating)) card.dataset.resultStars = String(rating);
    });
  }

  function installArkGuard() {
    const nativeMap = Array.prototype.map;
    if (nativeMap.__bmtArkGuardV28) return;

    function guardedMap(callback, thisArg) {
      const array = this;
      if (
        document.body?.dataset?.currentGame !== 'biblical-match-three' ||
        !Array.isArray(array) ||
        typeof callback !== 'function' ||
        !array.some((value) => value === null)
      ) {
        return nativeMap.call(array, callback, thisArg);
      }

      const source = Function.prototype.toString.call(callback);
      if (!source.includes('.special')) return nativeMap.call(array, callback, thisArg);

      return nativeMap.call(array, (value, index, sourceArray) => {
        if (value === null) return -1;
        return callback.call(thisArg, value, index, sourceArray);
      });
    }

    guardedMap.__bmtArkGuardV28 = true;
    guardedMap.__bmtNativeMap = nativeMap;
    Array.prototype.map = guardedMap;
  }

  function start() {
    installArkGuard();
    patchMenuIcon(document);
    captureResultStars(document);

    const observer = new MutationObserver((records) => {
      patchMenuIcon(document);
      if (document.body?.dataset?.currentGame === 'biblical-match-three' && records.some((record) => record.type === 'childList' || record.type === 'attributes')) {
        captureResultStars(document);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-current-game', 'class', 'aria-label'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
