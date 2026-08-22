(() => {
  let lastOpener = null;
  let hadModal = false;

  document.addEventListener('click', (event) => {
    const opener = event.target?.closest?.('[data-user-chat],[data-observe-room]');
    if (opener) lastOpener = opener;
  }, true);

  const reconcile = () => {
    const hasModal = Boolean(document.querySelector('.admin-live-v3__modal'));
    if (hasModal) {
      hadModal = true;
      document.body?.classList.add('admin-live-modal-open');
      return;
    }
    document.body?.classList.remove('admin-live-modal-open');
    if (hadModal && lastOpener?.isConnected) {
      requestAnimationFrame(() => {
        try { lastOpener.focus({ preventScroll: true }); } catch {}
      });
    }
    hadModal = false;
    lastOpener = null;
  };

  const observer = new MutationObserver(reconcile);
  observer.observe(document.body, { childList: true, subtree: false });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  reconcile();
})();
