(() => {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  function motionAllowed() {
    return !reduced?.matches;
  }

  function enter(node, pop = false) {
    if (!node || node.nodeType !== 1 || !motionAllowed()) return;
    if (node.dataset.appMotionSeen === '1') return;
    node.dataset.appMotionSeen = '1';
    node.classList.add(pop ? 'app-motion-pop' : 'app-motion-enter');
    setTimeout(() => {
      node.classList.remove('app-motion-enter', 'app-motion-pop');
      delete node.dataset.appMotionSeen;
    }, 460);
  }

  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.parentElement?.id === 'game-container') enter(node);
    if (node.matches?.('.support-box,.admin-v2,.banned-card,.app-error-card,.app-toast')) enter(node, true);
    node.querySelectorAll?.('#game-container > *,.support-box,.admin-v2,.banned-card,.app-error-card,.app-toast').forEach((child) => {
      const pop = child.matches('.support-box,.admin-v2,.banned-card,.app-error-card,.app-toast');
      enter(child, pop);
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) mutation.addedNodes.forEach(scan);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });

  document.querySelectorAll('#game-container > *,.support-box,.admin-v2,.banned-card,.app-error-card,.app-toast').forEach(scan);
  window.__appMotionReady = true;
})();
