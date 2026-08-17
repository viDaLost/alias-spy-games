(() => {
  'use strict';

  if (window.__bmtV24BoardInstalled) return;
  window.__bmtV24BoardInstalled = true;

  const VERSION = '24';
  const STYLE_ID = 'bmt-v24-board-style';
  let scheduled = false;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = `web/styles/biblical-match-three-v24-board.css?v=${VERSION}`;
    document.head.appendChild(link);
  }

  function gridSize(board) {
    const rows = Math.max(1, Number(board.dataset.rows || 8));
    const cols = Math.max(1, Number(board.dataset.cols || 8));
    return { rows, cols };
  }

  function activeSignature(board, rows, cols) {
    const active = new Set();
    board.querySelectorAll(':scope > .bmt-tile').forEach((tile) => {
      const index = Number(tile.dataset.index);
      if (!Number.isInteger(index) || index < 0 || index >= rows * cols) return;
      if (!tile.classList.contains('is-hole')) active.add(index);
    });
    return { active, signature: `${rows}x${cols}:${[...active].sort((a, b) => a - b).join(',')}` };
  }

  function edgePath(active, rows, cols) {
    const has = (row, col) => row >= 0 && row < rows && col >= 0 && col < cols && active.has(row * cols + col);
    const parts = [];
    for (const index of active) {
      const row = Math.floor(index / cols);
      const col = index % cols;
      if (!has(row - 1, col)) parts.push(`M${col} ${row}H${col + 1}`);
      if (!has(row, col + 1)) parts.push(`M${col + 1} ${row}V${row + 1}`);
      if (!has(row + 1, col)) parts.push(`M${col + 1} ${row + 1}H${col}`);
      if (!has(row, col - 1)) parts.push(`M${col} ${row + 1}V${row}`);
    }
    return parts.join('');
  }

  function patchBoard(board) {
    if (!board) return;
    const wrap = board.closest('.bmt-board-wrap');
    if (!wrap) return;

    board.classList.add('bmt-v24-board');
    wrap.classList.add('bmt-v24-board-wrap');

    const { rows, cols } = gridSize(board);
    const { active, signature } = activeSignature(board, rows, cols);
    if (!active.size) return;

    let svg = board.querySelector(':scope > .bmt-v24-boundary-underlay');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('bmt-v24-boundary-underlay');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('preserveAspectRatio', 'none');
      board.insertBefore(svg, board.firstChild);
    }

    svg.setAttribute('viewBox', `0 0 ${cols} ${rows}`);
    if (svg.dataset.signature === signature) return;
    svg.dataset.signature = signature;

    const path = edgePath(active, rows, cols);
    svg.innerHTML = `
      <path class="bmt-v24-boundary-soft" d="${path}"></path>
      <path class="bmt-v24-boundary-line" d="${path}"></path>
      <path class="bmt-v24-boundary-light" d="${path}"></path>`;
  }

  function patchAll() {
    scheduled = false;
    ensureStyle();
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
    document.querySelectorAll('.bmt-board').forEach(patchBoard);
  }

  function schedulePatch() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(patchAll);
  }

  function start() {
    ensureStyle();
    schedulePatch();
    const root = document.getElementById('game-container') || document.body;
    new MutationObserver(schedulePatch).observe(root, { childList: true, subtree: true });
    new MutationObserver(schedulePatch).observe(document.body, {
      attributes: true,
      attributeFilter: ['data-current-game'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
