(() => {
  'use strict';

  const VERSION = '22';
  const ASSETS = {
    biblical: `web/assets/icons/biblical-treasures.webp?v=${VERSION}`,
    support: `web/assets/icons/support.webp?v=${VERSION}`,
    android: `web/assets/icons/android-download.webp?v=${VERSION}`,
    admin: `web/assets/icons/admin.webp?v=${VERSION}`,
  };

  function findCardByTitle(text) {
    return [...document.querySelectorAll('#system-actions .game-card')].find((card) =>
      (card.querySelector('.game-card__title')?.textContent || '').trim().includes(text)
    );
  }

  function setIcon(card, src, type) {
    const host = card?.querySelector('.game-card__icon');
    if (!host) return false;
    const current = host.querySelector('img');
    if (current?.getAttribute('src') === src && current.dataset.iconVersion === VERSION) return true;
    host.innerHTML = `<img class="game-card__img system-art-img" src="${src}" alt="" aria-hidden="true" draggable="false" loading="eager" decoding="async" data-system-icon="${type}" data-icon-version="${VERSION}">`;
    host.classList.add('game-card__icon--system-art');
    return true;
  }

  function titleOnly(card) {
    if (!card) return;
    card.querySelector('.game-card__desc')?.remove();
    card.classList.add('game-card--title-only-v22');
  }

  function patch() {
    const biblical = document.getElementById('biblical-match-three-card');
    const biblicalHost = biblical?.querySelector('.game-card__icon');
    if (biblicalHost) {
      const current = biblicalHost.querySelector('img');
      if (current?.getAttribute('src') !== ASSETS.biblical || current.dataset.iconVersion !== VERSION) {
        biblicalHost.innerHTML = `<img class="game-card__img" src="${ASSETS.biblical}" alt="Библейские сокровища" draggable="false" loading="eager" decoding="async" data-icon-version="${VERSION}" data-bmt-menu-art="v22">`;
      }
    }

    const support = findCardByTitle('Тех-поддержка');
    setIcon(support, ASSETS.support, 'support');
    titleOnly(support);

    const android = document.getElementById('android-download-btn') || findCardByTitle('Скачать для Android');
    setIcon(android, ASSETS.android, 'android');
    titleOnly(android);

    const admin = document.getElementById('admin-btn') || findCardByTitle('Админ-панель');
    setIcon(admin, ASSETS.admin, 'admin');
    titleOnly(admin);
  }

  function observeRoot(root) {
    if (!root || root.dataset.v22HomeObserved === '1') return;
    root.dataset.v22HomeObserved = '1';
    new MutationObserver(patch).observe(root, { childList: true, subtree: true });
  }

  function start() {
    patch();
    observeRoot(document.getElementById('kids-games'));
    observeRoot(document.getElementById('system-actions'));
    let tries = 0;
    const timer = window.setInterval(() => {
      patch();
      observeRoot(document.getElementById('kids-games'));
      observeRoot(document.getElementById('system-actions'));
      tries += 1;
      if (tries >= 24) window.clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
