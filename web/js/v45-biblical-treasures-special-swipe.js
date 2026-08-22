(() => {
  'use strict';

  if (window.__bmtV45SpecialSwipeInstalled) return;
  window.__bmtV45SpecialSwipeInstalled = true;

  const Core = window.BiblicalMatchThreeCore;
  if (!Core) throw new Error('BiblicalMatchThreeCore must load before V45 special rules');

  const originalCombo = Core.specialComboClearSet.bind(Core);
  const originalFindMoves = Core.findMoves.bind(Core);
  const isLine = (special) => special === 'lineH' || special === 'lineV';

  function addAll(target, indices) {
    for (const index of indices || []) target.add(index);
  }

  function specialSwipeClearSet(board, a, b, rows, cols) {
    const first = board?.[a];
    const second = board?.[b];
    if (!first || !second) return null;

    const sa = first.special || null;
    const sb = second.special || null;
    if (!sa && !sb) return null;

    // Preserve the existing authored combinations when both swapped pieces are special.
    if (sa && sb) return originalCombo(board, a, b, rows, cols);

    const special = sa || sb;
    const destination = sa ? b : a;
    const normal = sa ? second : first;
    const clearSet = new Set([a, b]);

    if (special === 'rainbow') {
      // Rainbow + symbol: remove the rainbow, the swapped piece and every piece
      // of that symbol currently present on the board.
      for (let index = 0; index < board.length; index += 1) {
        if (board[index]?.type === normal.type) clearSet.add(index);
      }
      return { clearSet, combo: 'rainbowColor', trigger: 'swipe' };
    }

    if (special === 'lineH') {
      addAll(clearSet, Core.rowIndices(destination, rows, cols));
      return { clearSet, combo: 'singleLine', trigger: 'swipe' };
    }

    if (special === 'lineV') {
      addAll(clearSet, Core.columnIndices(destination, rows, cols));
      return { clearSet, combo: 'singleLine', trigger: 'swipe' };
    }

    if (special === 'burst') {
      addAll(clearSet, Core.areaIndices(destination, 1, rows, cols));
      return { clearSet, combo: 'singleBurst', trigger: 'swipe' };
    }

    return originalCombo(board, a, b, rows, cols);
  }

  Core.specialComboClearSet = specialSwipeClearSet;

  Core.findMoves = function findMovesWithSwipeSpecials(board, rows, cols, canSwap = null, limit = Infinity) {
    const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : Infinity;
    const moves = originalFindMoves(board, rows, cols, canSwap, max);
    if (moves.length >= max) return moves;

    const keyOf = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
    const seen = new Set(moves.map(([a, b]) => keyOf(a, b)));
    const maybeAdd = (a, b) => {
      if (moves.length >= max || a < 0 || b < 0 || a >= board.length || b >= board.length) return;
      if (canSwap && !canSwap(a, b)) return;
      const first = board[a];
      const second = board[b];
      if (!first || !second || (!first.special && !second.special)) return;
      const key = keyOf(a, b);
      if (seen.has(key)) return;
      seen.add(key);
      moves.push([a, b]);
    };

    for (let row = 0; row < rows && moves.length < max; row += 1) {
      for (let col = 0; col < cols && moves.length < max; col += 1) {
        const a = row * cols + col;
        if (col + 1 < cols) maybeAdd(a, a + 1);
        if (row + 1 < rows) maybeAdd(a, a + cols);
      }
    }
    return moves;
  };

  function patchCopy() {
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;

    // Old Ark booster must never reappear even if an older cached game script renders it.
    document.querySelectorAll('#game-container [data-booster="ark"]').forEach((node) => node.remove());

    const covenant = document.querySelector('#game-container [data-bmt-pre-booster="covenant"] .bmt-prebooster__copy small');
    if (covenant) covenant.textContent = 'Смахните радугу с символом — исчезнут все такие фишки на поле.';

    document.querySelectorAll('#game-container .bmt-toast').forEach((node) => {
      if (node.textContent?.includes('соедините соседнюю пару')) {
        node.textContent = 'Особые фишки уже на поле — просто смахните нужную фишку.';
      }
    });
  }

  let scheduled = false;
  function schedulePatch() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      patchCopy();
    });
  }

  new MutationObserver(schedulePatch).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-current-game'],
  });
  schedulePatch();

  window.BiblicalMatchThreeV45 = Object.freeze({
    version: 45,
    specialSwipeClearSet,
    arkBoosterRemoved: true,
    rainbowSwipe: true,
  });
})();
