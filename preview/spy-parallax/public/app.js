(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const scene = byId('scene');
  const role = byId('role');
  const patrolButton = byId('patrol');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const layers = {
    sky: byId('sky'),
    mountains: byId('mountains'),
    temple: byId('temple'),
    city: byId('city'),
    roofs: byId('roofs'),
    fog: byId('fog'),
    particles: byId('particles'),
    spy: byId('spyLayer'),
    left: byId('leftForeground'),
    right: byId('rightForeground'),
    leaves: byId('leaves'),
    plants: byId('plantsRight'),
  };

  // Horizontal movement is intentionally stronger than vertical scroll depth.
  const depths = {
    sky: [4, 3],
    mountains: [7, 5],
    temple: [10, 7],
    city: [16, 10],
    roofs: [24, 14],
    fog: [29, 18],
    particles: [32, 18],
    spy: [55, 32],
    left: [42, 24],
    right: [42, 24],
    leaves: [48, 27],
    plants: [50, 28],
  };

  const target = { x: 0, progress: 0 };
  const current = { x: 0, progress: 0 };
  const drag = { id: null, startX: 0, startY: 0, lastX: 0, axis: null };
  let rafId = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function readScroll() {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    target.progress = clamp(scrollY / maxScroll, 0, 1);
    scheduleRender();
  }

  function render() {
    rafId = 0;

    if (reducedMotion) {
      scene.classList.remove('is-moving');
      return;
    }

    current.x += (target.x - current.x) * 0.14;
    current.progress += (target.progress - current.progress) * 0.12;

    for (const [name, element] of Object.entries(layers)) {
      const [horizontalDepth, verticalDepth] = depths[name];
      const x = current.x * horizontalDepth;
      const y = -current.progress * verticalDepth;
      element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(1.08)`;
    }

    const isMoving = Math.abs(target.x - current.x) > 0.05
      || Math.abs(target.progress - current.progress) > 0.0005;

    if (isMoving) {
      scheduleRender();
    } else {
      scene.classList.remove('is-moving');
    }
  }

  function scheduleRender() {
    if (reducedMotion || rafId) return;
    scene.classList.add('is-moving');
    rafId = requestAnimationFrame(render);
  }

  function startDrag(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag.id = event.pointerId;
    drag.startX = drag.lastX = event.clientX;
    drag.startY = event.clientY;
    drag.axis = null;
  }

  function moveDrag(event) {
    if (drag.id !== event.pointerId) return;

    const totalX = event.clientX - drag.startX;
    const totalY = event.clientY - drag.startY;

    if (!drag.axis && Math.hypot(totalX, totalY) >= 8) {
      drag.axis = Math.abs(totalX) > Math.abs(totalY) * 1.15 ? 'horizontal' : 'vertical';
    }

    if (drag.axis !== 'horizontal') return;

    event.preventDefault();
    const delta = event.clientX - drag.lastX;
    drag.lastX = event.clientX;
    target.x = clamp(target.x + delta / 155, -1, 1);
    scheduleRender();
  }

  function endDrag(event) {
    if (event.pointerId !== drag.id) return;
    drag.id = null;
    drag.axis = null;
  }

  async function ensureAsset(element) {
    if (!element) return;
    if (!element.getAttribute('src') && element.dataset.src) {
      element.src = element.dataset.src;
    }

    try {
      await element.decode();
    } catch {
      // A cached image may already be usable even if decode() rejects.
    }
  }

  function replayClass(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    element.addEventListener('animationend', () => element.classList.remove(className), { once: true });
  }

  async function pulseLanterns() {
    if (reducedMotion) return;
    const container = byId('lanternEffects');
    const sprites = [...container.querySelectorAll('img')];
    await Promise.all(sprites.map(ensureAsset));
    replayClass(container, 'pulse');
  }

  function setRole(isSpy) {
    scene.classList.toggle('spy-state', isSpy);

    if (isSpy) {
      role.innerHTML = '<strong>Вы — шпион</strong><span>Туман становится плотнее. Наблюдайте за городом и не выдавайте себя.</span>';
      ensureAsset(layers.particles);
    } else {
      role.innerHTML = '<strong>Вы — игрок</strong><span>Атмосфера становится спокойнее. Запомните локацию и найдите шпиона.</span>';
    }

    pulseLanterns();
    navigator.vibrate?.(18);
  }

  async function playPatrol() {
    const patrol = byId('patrolLayer');
    const birds = byId('birds');
    patrolButton.disabled = true;
    patrolButton.setAttribute('aria-busy', 'true');

    await Promise.all([ensureAsset(patrol), ensureAsset(birds)]);

    patrolButton.disabled = false;
    patrolButton.removeAttribute('aria-busy');

    if (reducedMotion) {
      role.innerHTML = '<strong>Патруль рядом</strong><span>Анимация отключена системной настройкой уменьшения движения.</span>';
      return;
    }

    replayClass(patrol, 'walk');
    replayClass(birds, 'fly');
  }

  addEventListener('scroll', readScroll, { passive: true });
  addEventListener('resize', readScroll, { passive: true });
  addEventListener('pointerdown', startDrag, { passive: true });
  addEventListener('pointermove', moveDrag, { passive: false });
  addEventListener('pointerup', endDrag, { passive: true });
  addEventListener('pointercancel', endDrag, { passive: true });

  byId('revealSpy').addEventListener('click', () => setRole(true));
  byId('revealPlayer').addEventListener('click', () => setRole(false));
  patrolButton.addEventListener('click', playPatrol);
  byId('resetView').addEventListener('click', () => {
    target.x = 0;
    scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    scheduleRender();
  });

  readScroll();
  render();
})();
