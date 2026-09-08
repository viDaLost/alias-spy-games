(() => {
  'use strict';
  if (window.__bmtV22LegacyTutorialGuard) return;
  window.__bmtV22LegacyTutorialGuard = true;

  function dismissLegacyTutorial() {
    document.querySelectorAll('.bmt-v18-tutorial').forEach((overlay) => {
      const skip = overlay.querySelector('[data-skip]');
      if (skip) skip.click();
      if (overlay.isConnected) overlay.remove();
    });
  }

  function start() {
    dismissLegacyTutorial();
    const root = document.getElementById('game-container');
    if (root) new MutationObserver(dismissLegacyTutorial).observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
