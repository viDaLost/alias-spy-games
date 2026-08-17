(() => {
  'use strict';

  if (window.__bmtV23PolishInstalled) return;
  window.__bmtV23PolishInstalled = true;

  const VERSION = '23';
  const STYLE_ID = 'bmt-v23-polish-style';
  const HERO_ASSET = `web/assets/biblical-match-three/completion-hero-v23.svg?v=${VERSION}`;

  const SHAPE_PATHS = {
    rect: 'M6 2H94Q98 2 98 6V94Q98 98 94 98H6Q2 98 2 94V6Q2 2 6 2Z',
    oval: 'M50 2C76.5 2 98 23.5 98 50S76.5 98 50 98 2 76.5 2 50 23.5 2 50 2Z',
    diamond: 'M50 2L98 50 50 98 2 50Z',
    cross: 'M34 2H66V34H98V66H66V98H34V66H2V34H34Z',
    bowl: 'M18 2H82Q91 6 95 17Q98 28 98 44V98H2V44Q2 28 5 17Q9 6 18 2Z',
    shield: 'M7 2H93L92 61Q90 73 82 80L50 98 18 80Q10 73 8 61Z',
  };

  let scheduled = false;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = `web/styles/biblical-match-three-v23-polish.css?v=${VERSION}`;
    document.head.appendChild(link);
  }

  function boundaryMarkup(path) {
    return `
      <defs>
        <linearGradient id="bmtV23BoundaryGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fff7c7"/>
          <stop offset=".2" stop-color="#e8c776"/>
          <stop offset=".48" stop-color="#7767f0"/>
          <stop offset=".76" stop-color="#a9c8ff"/>
          <stop offset="1" stop-color="#fff9dd"/>
        </linearGradient>
        <filter id="bmtV23BoundaryGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path class="bmt-v23-boundary-shadow" d="${path}"/>
      <path class="bmt-v23-boundary-main" d="${path}"/>
      <path class="bmt-v23-boundary-highlight" d="${path}"/>
    `;
  }

  function patchBoard(board) {
    if (!board) return;
    const wrap = board.closest('.bmt-board-wrap');
    if (!wrap) return;

    board.classList.add('bmt-v23-board');
    wrap.classList.add('bmt-v23-board-wrap');

    const shape = SHAPE_PATHS[board.dataset.shape] ? board.dataset.shape : 'rect';
    let svg = board.querySelector(':scope > .bmt-v23-boundary');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('bmt-v23-boundary');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      board.appendChild(svg);
    }
    if (svg.dataset.shape !== shape) {
      svg.dataset.shape = shape;
      svg.innerHTML = boundaryMarkup(SHAPE_PATHS[shape]);
    }
  }

  function patchWinResult(card) {
    if (!card || card.dataset.v23Result === '1' || !card.classList.contains('is-win')) return;

    // V22 builds the result structure and button behavior. V23 only replaces the
    // decorative hero with one dedicated high-resolution asset and refines layout.
    const hero = card.querySelector('.bmt-v22-win-hero');
    if (!hero) return;

    hero.classList.add('bmt-v23-win-hero');
    hero.innerHTML = `<img class="bmt-v23-win-art" src="${HERO_ASSET}" alt="" aria-hidden="true">`;

    const next = card.querySelector('.bmt-v22-next');
    const repeat = card.querySelector('.bmt-v22-repeat');
    const menu = card.querySelector('.bmt-v22-menu');
    if (next) next.setAttribute('aria-label', 'Перейти к следующему уровню');
    if (repeat) repeat.setAttribute('aria-label', 'Повторить текущий уровень');
    if (menu) menu.setAttribute('aria-label', 'Вернуться в меню уровней');

    card.dataset.v23Result = '1';
  }

  function patchAll() {
    scheduled = false;
    ensureStyle();
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
    document.querySelectorAll('.bmt-board').forEach(patchBoard);
    document.querySelectorAll('.bmt-result-card.is-win').forEach(patchWinResult);
  }

  function schedulePatch() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(patchAll);
  }

  function start() {
    ensureStyle();
    schedulePatch();
    new MutationObserver(schedulePatch).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-current-game', 'data-shape', 'data-v22-result'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
