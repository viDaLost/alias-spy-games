// Stable layout patch for «Библейские слова».
// The game engine still works in its original coordinate model; this layer only
// resizes the real wheel element, repositions the letter buttons to that exact
// rendered size and draws the swipe line on a matching canvas.

(() => {
  'use strict';

  const state = {
    wrap: null,
    wheel: null,
    canvas: null,
    pointer: null,
    raf: 0,
    layoutRaf: 0,
  };

  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
  const $$ = (selector, root = document) => Array.from(root?.querySelectorAll?.(selector) || []);

  function clearCanvas() {
    const canvas = state.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function desiredWheelSize(wrap) {
    const viewport = Math.max(280, window.innerWidth || document.documentElement.clientWidth || 390);
    const wrapWidth = Math.max(280, wrap.getBoundingClientRect().width || viewport);
    const available = Math.min(viewport - 28, wrapWidth - 18);
    return Math.round(Math.min(350, Math.max(282, available)));
  }

  function forceWheelSize(wheel, size) {
    // The game injects its own styles after page CSS. Use inline !important so
    // its legacy 216×216 rule can never win again.
    wheel.style.setProperty('position', 'relative', 'important');
    wheel.style.setProperty('width', `${size}px`, 'important');
    wheel.style.setProperty('height', `${size}px`, 'important');
    wheel.style.setProperty('min-width', `${size}px`, 'important');
    wheel.style.setProperty('min-height', `${size}px`, 'important');
    wheel.style.setProperty('max-width', `${size}px`, 'important');
    wheel.style.setProperty('max-height', `${size}px`, 'important');
    wheel.style.setProperty('margin-left', 'auto', 'important');
    wheel.style.setProperty('margin-right', 'auto', 'important');
    wheel.style.setProperty('overflow', 'visible', 'important');
    wheel.style.setProperty('transform', 'none', 'important');
    wheel.style.setProperty('--wow-wheel-v2-size', `${size}px`);
  }

  function actualWheelSize(wheel) {
    const rect = wheel.getBoundingClientRect();
    return Math.max(1, Math.min(rect.width, rect.height));
  }

  function positionButtons(wheel) {
    const buttons = $$('.wow-btn-let', wheel);
    if (!buttons.length) return;

    const size = actualWheelSize(wheel);
    const center = size / 2;
    const firstRect = buttons[0].getBoundingClientRect();
    const buttonSize = Math.max(54, Math.min(firstRect.width || 66, 76));
    const radius = Math.max(78, center - buttonSize / 2 - 18);
    const count = buttons.length;

    buttons.forEach((button, index) => {
      const raw = Number.parseInt(button.dataset.idx || '', 10);
      const order = Number.isFinite(raw) ? raw : index;
      const angle = (2 * Math.PI * order) / count - Math.PI / 2;
      button.style.setProperty('left', `${center + radius * Math.cos(angle)}px`, 'important');
      button.style.setProperty('top', `${center + radius * Math.sin(angle)}px`, 'important');
    });
  }

  function ensureOverlayCanvas(wheel) {
    let canvas = $('.wow-wheel-v2-canvas', wheel);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'wow-wheel-v2-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      wheel.appendChild(canvas);
    }
    state.canvas = canvas;
    return canvas;
  }

  function syncCanvasSize() {
    const wheel = state.wheel;
    const canvas = state.canvas;
    if (!wheel || !canvas) return;

    const rect = wheel.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }

  function drawSelectionLine() {
    state.raf = 0;
    const wheel = state.wheel;
    const canvas = state.canvas;
    if (!wheel || !canvas || !wheel.isConnected) return;

    syncCanvasSize();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = wheel.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const active = $$('.wow-btn-let.active', wheel);
    if (!active.length) return;

    const points = active.map((button) => {
      const r = button.getBoundingClientRect();
      return {
        x: r.left - rect.left + r.width / 2,
        y: r.top - rect.top + r.height / 2,
      };
    });

    if (state.pointer) points.push(state.pointer);
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.lineWidth = Math.max(10, rect.width * 0.034);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(79, 70, 229, .34)';
    ctx.shadowColor = 'rgba(96, 165, 250, .34)';
    ctx.shadowBlur = 12;
    ctx.stroke();
  }

  function scheduleDraw() {
    if (state.raf) return;
    state.raf = requestAnimationFrame(drawSelectionLine);
  }

  function removeInlineLevelSwitch(wrap) {
    $$('.wow-level-switch', wrap).forEach((node) => node.remove());
  }

  function installWheelEvents(wheel) {
    if (wheel.dataset.wowWheelV2Events === '2') return;
    wheel.dataset.wowWheelV2Events = '2';

    wheel.addEventListener('pointerdown', (event) => {
      const rect = wheel.getBoundingClientRect();
      state.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      scheduleDraw();
    }, true);

    wheel.addEventListener('pointermove', (event) => {
      if (!$$('.wow-btn-let.active', wheel).length) return;
      const rect = wheel.getBoundingClientRect();
      state.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      scheduleDraw();
    }, true);

    const finish = () => {
      state.pointer = null;
      requestAnimationFrame(clearCanvas);
    };
    wheel.addEventListener('pointerup', finish, true);
    wheel.addEventListener('pointercancel', finish, true);
  }

  function applyLayoutNow(wrap) {
    if (!wrap?.isConnected) return;
    removeInlineLevelSwitch(wrap);

    const preview = $('#wow-preview', wrap);
    const wheel = $('#wow-wheel', wrap);
    if (!preview || !wheel) return;

    if (preview.nextElementSibling !== wheel && wheel.parentElement) {
      wheel.parentElement.insertBefore(preview, wheel);
    }

    state.wrap = wrap;
    state.wheel = wheel;

    const targetSize = desiredWheelSize(wrap);
    forceWheelSize(wheel, targetSize);
    ensureOverlayCanvas(wheel);
    installWheelEvents(wheel);

    // Read the *actual* rendered size only after forcing the legacy 216px rule
    // out of the cascade, then place all letters relative to that same box.
    positionButtons(wheel);
    syncCanvasSize();
  }

  function applyLayout(wrap) {
    if (state.layoutRaf) cancelAnimationFrame(state.layoutRaf);
    state.layoutRaf = requestAnimationFrame(() => {
      state.layoutRaf = 0;
      applyLayoutNow(wrap);
      // The game may append/reposition letters later in the same render pass.
      requestAnimationFrame(() => {
        if (wrap?.isConnected) {
          forceWheelSize(state.wheel, desiredWheelSize(wrap));
          positionButtons(state.wheel);
          syncCanvasSize();
        }
      });
    });
  }

  function discover() {
    const wrap = $('.wow-wrap');
    if (!wrap) {
      state.wrap = null;
      state.wheel = null;
      state.canvas = null;
      state.pointer = null;
      return;
    }
    applyLayout(wrap);
  }

  const gameContainer = document.getElementById('game-container');
  const observer = gameContainer ? new MutationObserver(discover) : null;
  observer?.observe(gameContainer, { childList: true, subtree: true });

  window.addEventListener('resize', discover, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(discover, 80), { passive: true });
  window.addEventListener('pagehide', () => observer?.disconnect(), { once: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', discover, { once: true });
  else discover();
})();
