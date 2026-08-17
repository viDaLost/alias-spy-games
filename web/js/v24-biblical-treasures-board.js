(() => {
  'use strict';
  if (window.__bmtV24BoardInstalled) return;
  window.__bmtV24BoardInstalled = true;

  const STYLE_ID = 'bmt-v24-board-style';
  const NS = 'http://www.w3.org/2000/svg';
  let resizeObserver = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = 'web/styles/biblical-match-three-v24-board.css?v=24';
    document.head.appendChild(link);
  }

  function getMask(board) {
    const rows = Math.max(1, Number(board.dataset.rows || getComputedStyle(board).getPropertyValue('--bmt-rows') || 8));
    const cols = Math.max(1, Number(board.dataset.cols || getComputedStyle(board).getPropertyValue('--bmt-cols') || 8));
    const mask = new Array(rows * cols).fill(false);
    board.querySelectorAll('.bmt-tile').forEach((tile) => {
      const index = Number(tile.dataset.index);
      if (!Number.isFinite(index) || index < 0 || index >= mask.length) return;
      mask[index] = !tile.classList.contains('is-hole') && !tile.hasAttribute('aria-hidden');
    });
    return { rows, cols, mask };
  }

  function pathForMask(rows, cols, mask) {
    const parts = [];
    const active = (row, col) => row >= 0 && row < rows && col >= 0 && col < cols && mask[row * cols + col];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (!active(row, col)) continue;
        if (!active(row - 1, col)) parts.push(`M${col} ${row}H${col + 1}`);
        if (!active(row, col + 1)) parts.push(`M${col + 1} ${row}V${row + 1}`);
        if (!active(row + 1, col)) parts.push(`M${col + 1} ${row + 1}H${col}`);
        if (!active(row, col - 1)) parts.push(`M${col} ${row + 1}V${row}`);
      }
    }
    return parts.join(' ');
  }

  function rebuildUnderlay(board, underlay) {
    const { rows, cols, mask } = getMask(board);
    const signature = `${rows}x${cols}:${mask.map((value) => value ? '1' : '0').join('')}`;
    if (underlay.dataset.signature === signature) return;
    underlay.dataset.signature = signature;
    underlay.replaceChildren();

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${cols} ${rows}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('bmt-v24-field-svg');

    const cells = document.createElementNS(NS, 'g');
    cells.classList.add('bmt-v24-field-cells');
    mask.forEach((on, index) => {
      if (!on) return;
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', String(index % cols));
      rect.setAttribute('y', String(Math.floor(index / cols)));
      rect.setAttribute('width', '1');
      rect.setAttribute('height', '1');
      cells.appendChild(rect);
    });

    const contour = document.createElementNS(NS, 'path');
    contour.classList.add('bmt-v24-field-contour');
    contour.setAttribute('d', pathForMask(rows, cols, mask));
    contour.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(cells, contour);
    underlay.appendChild(svg);
  }

  function positionUnderlay(board, wrap, underlay) {
    if (!board.isConnected || !wrap.isConnected) return;
    const boardRect = board.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    if (!boardRect.width || !boardRect.height || !wrapRect.width || !wrapRect.height) return;
    underlay.style.left = `${boardRect.left - wrapRect.left}px`;
    underlay.style.top = `${boardRect.top - wrapRect.top}px`;
    underlay.style.width = `${boardRect.width}px`;
    underlay.style.height = `${boardRect.height}px`;
  }

  function patchBoard(board) {
    if (!board || !board.isConnected) return;
    const wrap = board.closest('.bmt-board-wrap');
    if (!wrap) return;

    wrap.classList.add('bmt-v24-board-wrap');
    board.classList.add('bmt-v24-board');
    wrap.dataset.boardShape = board.dataset.shape || wrap.dataset.boardShape || 'rect';

    let underlay = wrap.querySelector(':scope > .bmt-v24-field-underlay');
    if (!underlay) {
      underlay = document.createElement('div');
      underlay.className = 'bmt-v24-field-underlay';
      underlay.setAttribute('aria-hidden', 'true');
      wrap.insertBefore(underlay, board);
    }

    rebuildUnderlay(board, underlay);
    positionUnderlay(board, wrap, underlay);

    if (window.ResizeObserver) {
      if (!resizeObserver) resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const target = entry.target;
          const targetWrap = target.closest('.bmt-board-wrap');
          const targetUnderlay = targetWrap?.querySelector(':scope > .bmt-v24-field-underlay');
          if (targetWrap && targetUnderlay) positionUnderlay(target, targetWrap, targetUnderlay);
        }
      });
      if (board.dataset.v24ResizeObserved !== '1') {
        board.dataset.v24ResizeObserved = '1';
        resizeObserver.observe(board);
      }
    }
  }

  function patchAll() {
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
    document.querySelectorAll('.bmt-board').forEach(patchBoard);
  }

  function start() {
    ensureStyle();
    patchAll();
    const root = document.getElementById('game-container') || document.body;
    new MutationObserver(patchAll).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-shape'] });
    window.addEventListener('resize', patchAll, { passive: true });
    window.setInterval(patchAll, 450);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
