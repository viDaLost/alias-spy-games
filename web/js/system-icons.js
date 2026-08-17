(() => {
  const ICON_VERSION = '22';
  const SOURCES = {
    support: 'web/assets/icons/support.webp',
    admin: 'web/assets/icons/admin.webp',
  };

  function systemIcon(type) {
    const src = SOURCES[type] || SOURCES.support;
    return `<img class="game-card__img system-art-img" src="${src}?v=${ICON_VERSION}" alt="" aria-hidden="true" draggable="false" loading="eager" decoding="async" data-system-icon="${type}" data-icon-version="${ICON_VERSION}" style="display:block;width:100%;height:100%;object-fit:contain">`;
  }

  function replaceHost(host, type) {
    if (!host) return;
    if (host.querySelector(`[data-system-icon="${type}"][data-icon-version="${ICON_VERSION}"]`)) return;
    host.innerHTML = systemIcon(type);
    host.classList.add('game-card__icon--system-art');
  }

  function markTitleOnly(button) {
    button?.classList.add('game-card--title-only-v22');
  }

  function refresh() {
    const root = document.getElementById('system-actions');
    if (root) {
      const supportButton = [...root.querySelectorAll('.game-card')].find((button) => (button.querySelector('.game-card__title')?.textContent || '').includes('Тех-поддержка'));
      replaceHost(supportButton?.querySelector('.game-card__icon'), 'support');
      markTitleOnly(supportButton);
      const adminButton = document.getElementById('admin-btn');
      replaceHost(adminButton?.querySelector('.game-card__icon'), 'admin');
      markTitleOnly(adminButton);
    }
    replaceHost(document.querySelector('#support-modal-overlay .support-icon'), 'support');
  }

  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { subtree: true, childList: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();
})();
