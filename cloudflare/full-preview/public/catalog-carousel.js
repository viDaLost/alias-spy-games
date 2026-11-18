(() => {
  'use strict';

  const featured = ['quartet', 'biblical-match-three'];
  const sort = (games) => [
    ...featured.map(key => games.find(game => game.key === key)).filter(Boolean),
    ...games.filter(game => game.key !== 'kingdoms' && !featured.includes(game.key)),
  ];

  function mount({ feature, games, artwork, routeURL }) {
    const viewport = feature.querySelector('.catalog-promo-viewport');
    let order = sort(games);
    let index = 0;
    let cleanup;
    let pointer;
    let suppressClickUntil = 0;
    let autoplayTimer;

    function restartAutoplay() {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
      if (order.length < 2) return;
      autoplayTimer = setInterval(() => {
        if (document.hidden || pointer || document.body.dataset.mode || document.body.dataset.currentGame
          || viewport.contains(document.activeElement) || document.querySelector('dialog[open]')
          || !feature.getClientRects().length) return;
        index = (index + 1) % order.length;
        draw(1);
      }, 3000);
    }

    function draw(direction = 0) {
      const game = order[index];
      const previous = viewport.querySelector('.catalog-promo.is-current');
      clearTimeout(cleanup);
      feature.hidden = !game;
      if (!game) {
        viewport.replaceChildren();
        delete feature.dataset.activePromo;
        return;
      }

      const slide = document.createElement('article');
      const treasure = game.key === 'biblical-match-three';
      slide.className = 'catalog-promo is-current';
      slide.dataset.promoGame = game.key;
      slide.innerHTML = `<div class="catalog-promo-scene" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="catalog-promo-copy"><h2>${game.title}</h2><p>${game.desc}</p><a class="catalog-hero-play" href="${routeURL(game.key, treasure ? { level: 51 } : {})}" data-launch="${game.key}">${treasure ? 'Начать раскопки' : 'Играть'} <span aria-hidden="true">›</span></a></div>
        <div class="catalog-promo-stage" aria-hidden="true"><img src="${artwork(game)}" width="280" height="250" alt="" decoding="async" draggable="false"></div>`;

      if (direction && previous && !window.GameDisplay.reducedMotion()) {
        previous.className = 'catalog-promo ' + (direction > 0 ? 'go-left' : 'go-right');
        previous.setAttribute('aria-hidden', 'true');
        previous.querySelector('a').tabIndex = -1;
        slide.classList.add(direction > 0 ? 'from-right' : 'from-left');
        viewport.replaceChildren(previous, slide);
        cleanup = setTimeout(() => previous.remove(), 360);
      } else viewport.replaceChildren(slide);
      feature.dataset.activePromo = game.key;

      if (order.length > 1 && !window.GameDisplay.lowGraphics()) {
        const next = order[(index + (direction || 1) + order.length) % order.length];
        const preload = new Image();
        preload.src = artwork(next);
      }
    }

    viewport.addEventListener('click', (event) => {
      if (event.detail && performance.now() < suppressClickUntil && event.target.closest('[data-launch]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
    viewport.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0 || order.length < 2) return;
      suppressClickUntil = 0;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      restartAutoplay();
    });
    window.addEventListener('pointerup', (event) => {
      if (pointer?.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer = null;
      if (order.length < 2 || Math.abs(dx) < 42 || Math.abs(dx) <= Math.abs(dy) * 1.3) return;
      const direction = dx < 0 ? 1 : -1;
      suppressClickUntil = performance.now() + 350;
      index = (index + direction + order.length) % order.length;
      draw(direction);
      restartAutoplay();
    });
    window.addEventListener('pointercancel', (event) => {
      if (pointer?.id === event.pointerId) pointer = null;
    });
    window.addEventListener('game-display:change', () => draw());

    draw();
    restartAutoplay();
    return { updateGames(items) {
      const key = order[index]?.key;
      order = sort(items);
      index = Math.max(0, order.findIndex((game) => game.key === key));
      draw();
      restartAutoplay();
    } };
  }

  window.CatalogCarousel = Object.freeze({ mount });
})();
