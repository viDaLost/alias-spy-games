(() => {
  'use strict';

  const delay = 3000;
  const featured = ['quartet', 'biblical-match-three'];
  const colors = ['#37318a', '#39235b', '#255a7d', '#50377d', '#24605e', '#633847'];

  function mount({ feature, games, artwork, routeURL }) {
    const viewport = feature.querySelector('.catalog-promo-viewport');
    const pause = feature.querySelector('[data-carousel="pause"]');
    const indicator = feature.querySelector('[data-promo-index]');
    const low = () => window.GameDisplay.reducedMotion();
    const sort = (items) => [...featured.map(key => items.find(game => game.key === key)).filter(Boolean),
      ...items.filter(game => game.key !== 'kingdoms' && !featured.includes(game.key))];
    let order = sort(games);
    let index = 0;
    let timer = 0;
    let cleanup = 0;
    let paused = false;
    let inView = true;
    let pointer = null;
    let suppressClickUntil = 0;

    function reschedule() {
      clearTimeout(timer);
      const playing = !paused && !low() && inView && !pointer && !document.hidden
        && !document.body.dataset.mode && !document.body.dataset.currentGame
        && !document.querySelector('dialog[open]') && !viewport.contains(document.activeElement);
      pause.disabled = low();
      pause.textContent = playing ? 'Ⅱ' : '▶';
      pause.setAttribute('aria-label', paused ? 'Запустить смену игр' : 'Пауза смены игр');
      pause.setAttribute('aria-pressed', String(paused));
      if (playing) timer = setTimeout(() => step(1), delay);
    }

    function draw(direction = 0) {
      const game = order[index];
      const previous = viewport.querySelector('.catalog-promo.is-current');
      const slide = document.createElement('article');
      const treasure = game.key === 'biblical-match-three';
      const image = artwork(game);
      slide.className = 'catalog-promo is-current';
      slide.style.setProperty('--promo-color', colors[index % colors.length]);
      slide.dataset.promoGame = game.key;
      slide.innerHTML = `<div class="catalog-promo-copy"><h2>${game.title}</h2><p>${game.desc}</p><a class="catalog-hero-play" href="${routeURL(game.key, treasure ? { level: 51 } : {})}" data-launch="${game.key}">${treasure ? 'Начать раскопки' : 'Играть'} <span aria-hidden="true">›</span></a></div>
        <div class="catalog-promo-stage" aria-hidden="true"><img src="${image}" width="280" height="250" alt="" decoding="async" draggable="false"></div>`;
      clearTimeout(cleanup);
      if (direction && previous && !low()) {
        previous.classList.remove('is-current', 'from-left', 'from-right');
        previous.classList.add(direction > 0 ? 'go-left' : 'go-right');
        previous.setAttribute('aria-hidden', 'true');
        previous.querySelector('a').tabIndex = -1;
        slide.classList.add(direction > 0 ? 'from-right' : 'from-left');
        viewport.replaceChildren(previous, slide);
        cleanup = setTimeout(() => previous.remove(), 410);
      } else viewport.replaceChildren(slide);
      indicator.textContent = `${index + 1} / ${order.length}`;
      feature.dataset.activePromo = game.key;
      const next = order[(index + 1) % order.length];
      if (!window.GameDisplay.lowGraphics()) {
        const preload = new Image();
        preload.src = artwork(next);
      }
      reschedule();
    }

    function step(direction) {
      index = (index + direction + order.length) % order.length;
      draw(direction);
    }

    feature.addEventListener('click', (event) => {
      if (performance.now() < suppressClickUntil && event.target.closest('[data-launch]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
    feature.addEventListener('click', (event) => {
      const action = event.target.closest('[data-carousel]')?.dataset.carousel;
      if (action === 'previous') step(-1);
      if (action === 'next') step(1);
      if (action === 'pause') { paused = !paused; reschedule(); }
    });
    feature.addEventListener('keydown', (event) => {
      const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (!direction) return;
      event.preventDefault();
      const focusedSlide = viewport.contains(document.activeElement);
      step(direction);
      if (focusedSlide) viewport.querySelector('.is-current a').focus({ preventScroll: true });
    });
    viewport.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      reschedule();
    });
    window.addEventListener('pointerup', (event) => {
      if (pointer?.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer = null;
      if (Math.abs(dx) >= 42 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        suppressClickUntil = performance.now() + 350;
        step(dx < 0 ? 1 : -1);
      } else reschedule();
    });
    window.addEventListener('pointercancel', () => { pointer = null; reschedule(); });
    viewport.addEventListener('focusin', reschedule);
    viewport.addEventListener('focusout', () => queueMicrotask(reschedule));
    document.addEventListener('visibilitychange', reschedule);
    document.addEventListener('close', reschedule, true);
    new MutationObserver(reschedule).observe(document.body, { attributes: true, attributeFilter: ['data-mode', 'data-current-game'] });
    const dialogs = new MutationObserver(reschedule);
    for (const dialog of document.querySelectorAll('dialog')) dialogs.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; reschedule(); }, { threshold: .1 }).observe(feature);
    }
    window.addEventListener('game-display:change', () => draw());
    draw();
    return { refresh: reschedule, updateGames(items) {
      const key = order[index]?.key;
      order = sort(items);
      index = Math.max(0, order.findIndex((game) => game.key === key));
      draw();
    } };
  }

  window.CatalogCarousel = Object.freeze({ mount });
})();
