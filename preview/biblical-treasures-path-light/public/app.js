(() => {
  'use strict';

  const scene = document.getElementById('path-scene');
  const depthLayers = [...document.querySelectorAll('.path-layer[data-depth]')];
  const eventLayers = new Map([...document.querySelectorAll('.path-event')].map((node) => [node.dataset.event, node]));
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let frozen = false;
  let targetX = 0, targetY = 0, currentX = 0, currentY = 0, raf = 0;
  let eventTimer = 0;

  function renderParallax() {
    raf = 0;
    if (frozen || reduceMotion) return;
    currentX += (targetX - currentX) * 0.14;
    currentY += (targetY - currentY) * 0.14;
    for (const layer of depthLayers) {
      const depth = Number(layer.dataset.depth || 0);
      layer.style.setProperty('--px', `${(currentX * depth).toFixed(2)}px`);
      layer.style.setProperty('--py', `${(currentY * depth).toFixed(2)}px`);
    }
    if (Math.abs(targetX - currentX) > 0.02 || Math.abs(targetY - currentY) > 0.02) scheduleParallax();
  }

  function scheduleParallax() {
    if (!raf && !frozen && !reduceMotion) raf = requestAnimationFrame(renderParallax);
  }

  function setTarget(clientX, clientY) {
    if (frozen || reduceMotion) return;
    const x = clientX / Math.max(1, innerWidth) - 0.5;
    const y = clientY / Math.max(1, innerHeight) - 0.5;
    targetX = Math.max(-1, Math.min(1, x * 2)) * 7;
    targetY = Math.max(-1, Math.min(1, y * 2)) * 5;
    scheduleParallax();
  }

  function freezeParallax() {
    frozen = true;
    scene?.classList.add('is-swipe-frozen');
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function releaseParallax() {
    frozen = false;
    scene?.classList.remove('is-swipe-frozen');
    targetX = currentX;
    targetY = currentY;
  }

  function playEvent(kind, detail = {}) {
    const node = eventLayers.get(kind) || eventLayers.get('match');
    if (!node) return;
    clearTimeout(eventTimer);
    for (const layer of eventLayers.values()) layer.classList.remove('is-playing');
    void node.offsetWidth;
    node.classList.add('is-playing');
    scene?.classList.toggle('is-path-open', kind === 'levelComplete');
    scene?.setAttribute('data-last-event', kind);
    const duration = kind === 'levelComplete' ? 2200 : kind === 'rainbow' ? 1450 : kind === 'cascade' ? 1150 : 900;
    eventTimer = setTimeout(() => {
      node.classList.remove('is-playing');
      if (kind !== 'levelComplete') scene?.classList.remove('is-path-open');
    }, duration);
    if (detail.cascade >= 3) scene?.classList.add('is-deep-cascade');
    setTimeout(() => scene?.classList.remove('is-deep-cascade'), 700);
  }

  window.addEventListener('pointermove', (event) => setTarget(event.clientX, event.clientY), { passive: true });
  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest?.('.bmt-board')) freezeParallax();
  }, true);
  document.addEventListener('pointerup', releaseParallax, true);
  document.addEventListener('pointercancel', releaseParallax, true);
  window.addEventListener('blur', releaseParallax, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseParallax(); });
  window.addEventListener('bmt:path-light', (event) => playEvent(event.detail?.kind || 'match', event.detail || {}));

  const observer = new MutationObserver(() => {
    const board = document.querySelector('.bmt-board');
    if (!board || board.dataset.pathLightMounted === '1') return;
    board.dataset.pathLightMounted = '1';
    document.body.dataset.pathLightReady = '1';
    const coach = document.createElement('div');
    coach.className = 'path-swipe-coach';
    coach.textContent = 'Свайп замораживает храм · свет отвечает на результат';
    board.closest('.bmt-board-wrap')?.prepend(coach);
    const hideCoach = () => coach.classList.add('is-hidden');
    board.addEventListener('pointerdown', hideCoach, { once: true, passive: true });
  });
  observer.observe(document.getElementById('game-container'), { childList: true, subtree: true });

  function autoOpen(attempt = 0) {
    if (typeof window.openBiblicalMatchThree === 'function') {
      window.openBiblicalMatchThree().catch((error) => {
        console.error('[Path of Light preview] open failed', error);
        const loading = document.querySelector('.preview-loading');
        if (loading) loading.innerHTML = '<strong>Не удалось открыть игру</strong><span>Обновите страницу и повторите попытку.</span>';
      });
      return;
    }
    if (attempt < 60) setTimeout(() => autoOpen(attempt + 1), 80);
  }
  autoOpen();

  window.PathOfLightReview = {
    playEvent,
    freezeParallax,
    releaseParallax,
    get frozen() { return frozen; },
    get eventNames() { return [...eventLayers.keys()]; },
  };
})();
