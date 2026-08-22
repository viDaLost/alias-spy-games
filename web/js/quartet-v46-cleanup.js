(() => {
  'use strict';
  if (window.__QUARTET_V46_CLEANUP__) return;
  window.__QUARTET_V46_CLEANUP__ = true;
  let raf = 0;

  function isQuartet() {
    return document.body?.dataset?.currentGame === 'quartet' && Boolean(document.getElementById('qv2-root'));
  }

  function cleanup() {
    raf = 0;
    if (isQuartet()) return;
    for (const selector of ['#qchat-fab', '#qchat-drawer', '#qv43-fixed-dock', '#qchat-backdrop-v44']) {
      document.querySelectorAll(selector).forEach((node) => node.remove());
    }
    document.body?.classList.remove('qv44-chat-open', 'qv43-quartet-active');
    document.documentElement?.style.removeProperty('--qv43-dock-height');
    document.body?.style.removeProperty('--qv43-dock-height');
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(cleanup);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-current-game', 'data-mode'], childList: true, subtree: false });
  window.addEventListener('pageshow', schedule);
  window.addEventListener('popstate', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  schedule();
})();
