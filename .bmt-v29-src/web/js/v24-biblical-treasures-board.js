(() => {
  'use strict';
  if (window.__bmtV24BoardInstalled) return;
  window.__bmtV24BoardInstalled = true;

  const VERSION = '29';
  const STYLE_ID = 'bmt-v24-board-style';
  const NS = 'http://www.w3.org/2000/svg';
  const BLOCKER_ASSETS = {
    chain: `web/assets/biblical-match-three/icons-v17/chains.webp?v=${VERSION}`,
    tablet: `web/assets/biblical-match-three/icons-v17/tablets.webp?v=${VERSION}`,
    lamp: `web/assets/biblical-match-three/icons-v29/lamp-unlit.webp?v=${VERSION}`,
  };
  const observedBoards = new WeakSet();
  let resizeObserver = null;
  let mutationObserver = null;
  let patchScheduled = false;

  function ensureStyle() {
    let link = document.getElementById(STYLE_ID);
    const href = `web/styles/biblical-match-three-v24-board.css?v=${VERSION}`;
    if (!link) {
      link = document.createElement('link');
      link.id = STYLE_ID;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== href) link.href = href;
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

    svg.append(cells);
    underlay.replaceChildren(svg);
  }

  function blockerType(node) {
    return node?.dataset?.blockerType || '';
  }

  function patchBlockerArt(board) {
    board.querySelectorAll('.bmt-blocker [data-blocker-type]').forEach((node) => {
      const type = blockerType(node);
      const isLit = type === 'lamp' && node.dataset.blockerLit === 'true';
      const src = isLit ? `web/assets/biblical-match-three/icons-v17/candle.webp?v=${VERSION}` : BLOCKER_ASSETS[type];
      if (!src) return;

      let image = node.querySelector('img.bmt-blocker-art');
      if (!image) {
        image = document.createElement('img');
        image.className = 'bmt-blocker-art';
        image.alt = '';
        image.setAttribute('aria-hidden', 'true');
        image.draggable = false;
        image.loading = 'eager';
        image.decoding = 'async';
        node.prepend(image);
      }
      image.onerror = null;
      if ((image.getAttribute('src') || '') !== src) image.src = src;
      node.querySelector('.bmt-blocker-fallback')?.remove();
      node.querySelector('.bmt-blocker__lamp-state')?.remove();
      node.querySelector('svg')?.remove();
    });
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

    wrap.querySelectorAll(':scope > .bmt-v23-boundary').forEach((node) => node.remove());
    board.querySelectorAll(':scope > .bmt-v23-boundary').forEach((node) => node.remove());

    let underlay = wrap.querySelector(':scope > .bmt-v24-field-underlay');
    if (!underlay) {
      underlay = document.createElement('div');
      underlay.className = 'bmt-v24-field-underlay';
      underlay.setAttribute('aria-hidden', 'true');
      wrap.insertBefore(underlay, board);
    }

    rebuildUnderlay(board, underlay);
    patchBlockerArt(board);
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
    if (record.type === 'attributes') return record.attributeName === 'data-shape' || record.attributeName === 'class';
    if (record.type !== 'childList') return false;
    if (record.target?.classList?.contains('bmt-board')) return true;
    const nodes = [...record.addedNodes, ...record.removedNodes];
    return nodes.some((node) => node.nodeType === 1 && (
      node.matches?.('.bmt-board, .bmt-tile, .bmt-blocker') || node.querySelector?.('.bmt-board, .bmt-tile, .bmt-blocker')
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
      attributeFilter: ['data-shape', 'class'],
    });

    window.addEventListener('resize', schedulePatch, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
