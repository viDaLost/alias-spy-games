(() => {
  'use strict';
  const SRC = 'web/js/v22-game-polish.js?v=22';
  let loading = false;

  function load() {
    if (loading || window.__bmtV22GamePolishInstalled) return;
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
    loading = true;
    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.dataset.v22GamePolish = '1';
    script.onload = () => { loading = false; };
    script.onerror = () => { loading = false; script.remove(); };
    document.head.appendChild(script);
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
