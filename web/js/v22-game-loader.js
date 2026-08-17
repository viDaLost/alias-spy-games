(() => {
  'use strict';
  const GUARD = 'web/js/v22-legacy-tutorial-guard.js?v=22';
  const POLISH = 'web/js/v22-game-polish.js?v=22';
  const V23 = 'web/js/v23-biblical-treasures-polish.js?v=23';
  const V24 = 'web/js/v24-biblical-treasures-board.js?v=24';
  let loading = false;

  function appendScript(src, marker) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-${marker}]`)) { resolve(); return; }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset[marker] = '1';
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error(`Failed to load ${src}`)); };
      document.head.appendChild(script);
    });
  }

  async function load() {
    if (loading || window.__bmtV24BoardInstalled) return;
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
    loading = true;
    try {
      await appendScript(GUARD, 'v22TutorialGuard');
      if (!window.__bmtV22GamePolishInstalled) await appendScript(POLISH, 'v22GamePolish');
      if (!window.__bmtV23PolishInstalled) await appendScript(V23, 'v23BiblicalTreasuresPolish');
      await appendScript(V24, 'v24BiblicalTreasuresBoard');
    } catch (error) {
      console.error('[Biblical Treasures V24]', error);
    } finally {
      loading = false;
    }
  }

  function start() {
    load();
    new MutationObserver(load).observe(document.body, { attributes: true, attributeFilter: ['data-current-game'] });
    document.addEventListener('click', (event) => {
      if (event.target?.closest?.('#biblical-match-three-card')) window.setTimeout(load, 0);
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
