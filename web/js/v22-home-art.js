(() => {
  'use strict';

  const VERSION = '22';
  const BIBLICAL_ICON = `web/assets/icons/biblical-treasures.webp?v=${VERSION}`;

  function patchBiblicalCard() {
    const card = document.getElementById('biblical-match-three-card');
    const host = card?.querySelector('.game-card__icon');
    if (!host) return false;
    const current = host.querySelector('img');
    if (current?.getAttribute('src') === BIBLICAL_ICON && current.dataset.iconVersion === VERSION) return true;
    host.innerHTML = `<img class="game-card__img" src="${BIBLICAL_ICON}" alt="Иконка игры Библейские сокровища" draggable="false" loading="eager" decoding="async" data-icon-version="${VERSION}" data-bmt-menu-art="v22">`;
    return true;
  }

  function start() {
    if (patchBiblicalCard()) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (patchBiblicalCard() || tries >= 24) window.clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
