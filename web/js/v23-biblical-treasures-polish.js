(() => {
  'use strict';

  if (window.__bmtV23PolishInstalled) return;
  window.__bmtV23PolishInstalled = true;

  const VERSION = '24';
  const STYLE_ID = 'bmt-v23-polish-style';
  const HERO_ASSET = `web/assets/biblical-match-three/completion-hero-v23.svg?v=${VERSION}`;

  let scheduled = false;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = `web/styles/biblical-match-three-v23-polish.css?v=${VERSION}`;
    document.head.appendChild(link);
  }

  function activeCellSet(board, cols) {
    const active = new Set();
    board.querySelectorAll(':scope > .bmt-tile:not(.is-hole)').forEach((tile) => {
      const index = Number(tile.dataset.index);
      if (Number.isInteger(index) && index >= 0) active.add(index);
    });
    return active;
  }

  function boundaryGeometry(board) {
    const rows = Math.max(1, Number(board.dataset.rows) || 8);
    const cols = Math.max(1, Number(board.dataset.cols) || 8);
    const active = activeCellSet(board, cols);
    const segments = [];

    const has = (row, col) => row >= 0 && row < rows && col >= 0 && col < cols && active.has(row * cols + col);
    for (const index of active) {
      const row = Math.floor(index / cols);
      const col = index % cols;
      if (!has(row - 1, col)) segments.push(`M${col} ${row}H${col + 1}`);
      if (!has(row, col + 1)) segments.push(`M${col + 1} ${row}V${row + 1}`);
      if (!has(row + 1, col)) segments.push(`M${col + 1} ${row + 1}H${col}`);
      if (!has(row, col - 1)) segments.push(`M${col} ${row + 1}V${row}`);
    }

    return { rows, cols, path: segments.join('') };
  }

  function patchBoard(board) {
    if (!board) return;
    const wrap = board.closest('.bmt-board-wrap');
    if (!wrap) return;

    board.classList.add('bmt-v23-board');
    wrap.classList.add('bmt-v23-board-wrap');

    const { rows, cols, path } = boundaryGeometry(board);
    if (!path) return;

    let svg = board.querySelector(':scope > .bmt-v23-boundary');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('bmt-v23-boundary');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      board.appendChild(svg);
    }
    svg.classList.add('bmt-v23-boundary--underlay');

    const signature = `${rows}x${cols}:${path}`;
    if (svg.dataset.geometry === signature) return;
    svg.dataset.geometry = signature;
    svg.setAttribute('viewBox', `0 0 ${cols} ${rows}`);
    svg.innerHTML = `<path class="bmt-v23-boundary-shadow" d="${path}"/><path class="bmt-v23-boundary-main" d="${path}"/>`;
  }

  function patchWinResult(card) {
    if (!card || card.dataset.v23Result === '1' || !card.classList.contains('is-win')) return;

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
      attributeFilter: ['data-current-game', 'data-shape', 'data-rows', 'data-cols'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
