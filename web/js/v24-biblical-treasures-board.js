(() => {
  'use strict';
  if (window.__bmtV24BoardInstalled) return;
  window.__bmtV24BoardInstalled = true;

  const VERSION = '25';
  const STYLE_ID = 'bmt-v24-board-style';
  const NS = 'http://www.w3.org/2000/svg';
  const observedBoards = new WeakSet();
  let resizeObserver = null;
  let mutationObserver = null;
  let patchScheduled = false;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = `web/styles/biblical-match-three-v24-board.css?v=${VERSION}`;
    document.head.appendChild(link);
  }

  function getMask(board) {
    const styles = getComputedStyle(board);
    const rows = Math.max(1, Number(board.dataset.rows || styles.getPropertyValue('--bmt-rows') || 8));
    const cols = Math.max(1, Number(board.dataset.cols || styles.getPropertyValue('--bmt-cols') || 8));
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
    underlay.replaceChildren(svg);
  }

  function positionUnderlay(board, wrap, underlay) {
    if (!board.isConnected || !wrap.isConnected) return;
    const boardRect = board.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    if (!boardRect.width || !boardRect.height || !wrapRect.width || !wrapRect.height) return;

    const left = `${boardRect.left - wrapRect.left}px`;
    const top = `${boardRect.top - wrapRect.top}px`;
    const width = `${boardRect.width}px`;
    const height = `${boardRect.height}px`;
    if (underlay.style.left !== left) underlay.style.left = left;
    if (underlay.style.top !== top) underlay.style.top = top;
    if (underlay.style.width !== width) underlay.style.width = width;
    if (underlay.style.height !== height) underlay.style.height = height;
  }

  function observeBoardSize(board) {
    if (!window.ResizeObserver || observedBoards.has(board)) return;
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const target = entry.target;
          const wrap = target.closest('.bmt-board-wrap');
          const underlay = wrap?.querySelector(':scope > .bmt-v24-field-underlay');
          if (wrap && underlay) positionUnderlay(target, wrap, underlay);
        }
      });
    }
    observedBoards.add(board);
    resizeObserver.observe(board);
  }

  function patchBoard(board) {
    if (!board?.isConnected) return;
    const wrap = board.closest('.bmt-board-wrap');
    if (!wrap) return;

    if (!wrap.classList.contains('bmt-v24-board-wrap')) wrap.classList.add('bmt-v24-board-wrap');
    if (!board.classList.contains('bmt-v24-board')) board.classList.add('bmt-v24-board');

    const shape = board.dataset.shape || 'rect';
    if (wrap.dataset.boardShape !== shape) wrap.dataset.boardShape = shape;

    let underlay = wrap.querySelector(':scope > .bmt-v24-field-underlay');
    if (!underlay) {
      underlay = document.createElement('div');
      underlay.className = 'bmt-v24-field-underlay';
      underlay.setAttribute('aria-hidden', 'true');
      wrap.insertBefore(underlay, board);
    }

    rebuildUnderlay(board, underlay);
    positionUnderlay(board, wrap, underlay);
    observeBoardSize(board);
  }

  function patchAll() {
    patchScheduled = false;
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
    document.querySelectorAll('.bmt-board').forEach(patchBoard);
  }

  function schedulePatch() {
    if (patchScheduled) return;
    patchScheduled = true;
    requestAnimationFrame(patchAll);
  }

  function mutationNeedsPatch(record) {
    if (record.type === 'attributes') return record.target?.classList?.contains('bmt-board');
    if (record.type !== 'childList') return false;
    if (record.target?.classList?.contains('bmt-board')) return true;
    const nodes = [...record.addedNodes, ...record.removedNodes];
    return nodes.some((node) => node.nodeType === 1 && (
      node.matches?.('.bmt-board, .bmt-tile') || node.querySelector?.('.bmt-board, .bmt-tile')
    ));
  }

  function start() {
    ensureStyle();
    schedulePatch();

    const root = document.getElementById('game-container') || document.body;
    mutationObserver = new MutationObserver((records) => {
      if (records.some(mutationNeedsPatch)) schedulePatch();
    });
    mutationObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-shape'],
    });

    window.addEventListener('resize', schedulePatch, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
