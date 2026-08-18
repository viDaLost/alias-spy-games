(() => {
  'use strict';

  const VERSION = '22';
  const BIBLICAL_VERSION = '31';
  const ICONS = {
    biblical: `web/assets/icons/biblical-treasures.webp?v=${BIBLICAL_VERSION}`,
    support: `web/assets/icons/support.webp?v=${VERSION}`,
    android: `web/assets/icons/android-download.webp?v=${VERSION}`,
    admin: `web/assets/icons/admin.webp?v=${VERSION}`,
  };

  function imageMarkup(src, type, alt = '') {
    const version = type === 'biblical' ? BIBLICAL_VERSION : VERSION;
    return `<img class="game-card__img system-art-img" src="${src}" alt="${alt}" draggable="false" loading="eager" decoding="async" data-system-icon="${type}" data-icon-version="${version}">`;
  }

  function patchIcon(card, type, src, alt = '') {
    const host = card?.querySelector('.game-card__icon');
    if (!host) return false;
    const version = type === 'biblical' ? BIBLICAL_VERSION : VERSION;
    const current = host.querySelector(`img[data-icon-version="${version}"][data-system-icon="${type}"]`);
    if (!current || current.getAttribute('src') !== src) {
      host.innerHTML = imageMarkup(src, type, alt);
      host.classList.add('game-card__icon--system-art');
    }
    return true;
  }

  function titleOnly(card) {
    if (!card) return false;
    card.querySelector('.game-card__desc')?.remove();
    if (!card.classList.contains('game-card--title-only-v22')) card.classList.add('game-card--title-only-v22');
    return true;
  }

  function findSystemCard(text) {
    return [...document.querySelectorAll('#system-actions .game-card')].find((card) =>
      (card.querySelector('.game-card__title')?.textContent || '').trim().includes(text)
    );
  }

  function patchAll() {
    let ready = true;

    const biblical = document.getElementById('biblical-match-three-card');
    const biblicalReady = patchIcon(biblical, 'biblical', ICONS.biblical, 'Иконка игры Библейские сокровища');
    if (biblicalReady) {
      const img = biblical.querySelector('img[data-system-icon="biblical"]');
      if (img) img.dataset.bmtMenuArt = 'v31';
    }
    ready = biblicalReady && ready;

    const support = findSystemCard('Тех-поддержка');
    ready = patchIcon(support, 'support', ICONS.support) && ready;
    titleOnly(support);

    const android = document.getElementById('android-download-btn') || findSystemCard('Скачать для Android');
    ready = patchIcon(android, 'android', ICONS.android) && ready;
    titleOnly(android);

    const admin = document.getElementById('admin-btn') || findSystemCard('Админ-панель');
    ready = patchIcon(admin, 'admin', ICONS.admin) && ready;
    titleOnly(admin);

    return ready;
  }

  function start() {
    patchAll();
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (patchAll() || tries >= 40) window.clearInterval(timer);
    }, 200);

    const root = document.getElementById('menu-container') || document.documentElement;
    const observer = new MutationObserver(() => patchAll());
    observer.observe(root, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
