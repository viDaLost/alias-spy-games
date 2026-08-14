// Focused UI upgrade for «Библейские слова».
// Keeps the game engine untouched and adds a larger wheel, a single input display,
// and per-letter flights into the exact crossword cells of a newly solved word.

(() => {
  'use strict';

  const state = {
    wrap: null,
    dragging: false,
    submissionSeq: 0,
  };

  const $ = (selector, root = document) => root?.querySelector?.(selector) || null;
  const $$ = (selector, root = document) => Array.from(root?.querySelectorAll?.(selector) || []);

  function normalizeWord(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/Ё/g, 'Е')
      .replace(/[^А-Я]/g, '');
  }

  function readPreviewWord(wrap) {
    return normalizeWord($$('.wow-preview-let', wrap).map((node) => node.textContent || '').join(''));
  }

  function numericPosition(cell) {
    return {
      top: Number.parseFloat(cell.style.top || '0') || 0,
      left: Number.parseFloat(cell.style.left || '0') || 0,
    };
  }

  function positionKey(top, left) {
    return `${Math.round(top * 10) / 10}:${Math.round(left * 10) / 10}`;
  }

  function solvedCells(wrap) {
    return $$('.wow-cell.solved', wrap).map((cell) => {
      const { top, left } = numericPosition(cell);
      return {
        cell,
        top,
        left,
        key: positionKey(top, left),
        letter: normalizeWord(cell.textContent).slice(0, 1),
      };
    }).filter((item) => item.letter);
  }

  function allCellPositions(wrap) {
    return $$('.wow-cell', wrap).map((cell) => {
      const { top, left } = numericPosition(cell);
      return { top, left };
    });
  }

  function smallestPositiveDiff(values) {
    const sorted = [...new Set(values.map((value) => Math.round(value * 10) / 10))].sort((a, b) => a - b);
    let best = Infinity;
    for (let i = 1; i < sorted.length; i += 1) {
      const diff = sorted[i] - sorted[i - 1];
      if (diff > 0.5 && diff < best) best = diff;
    }
    return Number.isFinite(best) ? best : 0;
  }

  function detectGridStep(wrap) {
    const positions = allCellPositions(wrap);
    const rowGroups = new Map();
    const colGroups = new Map();

    positions.forEach(({ top, left }) => {
      const row = Math.round(top * 10) / 10;
      const col = Math.round(left * 10) / 10;
      if (!rowGroups.has(row)) rowGroups.set(row, []);
      if (!colGroups.has(col)) colGroups.set(col, []);
      rowGroups.get(row).push(left);
      colGroups.get(col).push(top);
    });

    const candidates = [];
    rowGroups.forEach((values) => {
      const diff = smallestPositiveDiff(values);
      if (diff) candidates.push(diff);
    });
    colGroups.forEach((values) => {
      const diff = smallestPositiveDiff(values);
      if (diff) candidates.push(diff);
    });

    return candidates.length ? Math.min(...candidates) : 44;
  }

  function findSolvedPath(wrap, word, beforeSolved) {
    const cells = solvedCells(wrap);
    if (!cells.length || !word) return null;

    const step = detectGridStep(wrap);
    const byPosition = new Map(cells.map((item) => [item.key, item]));
    const directions = [
      [0, step],
      [0, -step],
      [step, 0],
      [-step, 0],
    ];
    const candidates = [];

    for (const start of cells) {
      if (start.letter !== word[0]) continue;
      for (const [dt, dl] of directions) {
        const path = [];
        let matches = true;
        for (let index = 0; index < word.length; index += 1) {
          const key = positionKey(start.top + dt * index, start.left + dl * index);
          const item = byPosition.get(key);
          if (!item || item.letter !== word[index]) {
            matches = false;
            break;
          }
          path.push(item);
        }
        if (!matches) continue;
        const newCount = path.reduce((count, item) => count + (beforeSolved.has(item.key) ? 0 : 1), 0);
        candidates.push({ path, newCount });
      }
    }

    candidates.sort((a, b) => b.newCount - a.newCount);
    return candidates.find((candidate) => candidate.newCount > 0)?.path || null;
  }

  function makeFlightLetter(letter, fromX, fromY, toX, toY, delayMs) {
    const node = document.createElement('div');
    node.className = 'wow-letter-flight';
    node.textContent = letter;
    node.style.left = `${fromX}px`;
    node.style.top = `${fromY}px`;
    node.style.setProperty('--wow-flight-x', `${toX - fromX}px`);
    node.style.setProperty('--wow-flight-y', `${toY - fromY}px`);
    node.style.setProperty('--wow-flight-delay', `${delayMs}ms`);
    document.body.appendChild(node);
    requestAnimationFrame(() => node.classList.add('go'));
    setTimeout(() => node.remove(), delayMs + 820);
  }

  function animateLettersToPath(wrap, word, path, beforeSolved) {
    const preview = $('#wow-preview', wrap);
    if (!preview || path.length !== word.length) return;

    const source = preview.getBoundingClientRect();
    const centerX = source.left + source.width / 2;
    const centerY = source.top + source.height / 2;
    const spacing = Math.min(36, Math.max(20, source.width / Math.max(word.length + 2, 7)));
    const startOffset = -((word.length - 1) * spacing) / 2;

    path.forEach((item, index) => {
      const target = item.cell.getBoundingClientRect();
      const targetX = target.left + target.width / 2;
      const targetY = target.top + target.height / 2;
      const fromX = centerX + startOffset + spacing * index;
      const delayMs = index * 92;
      const isNewCell = !beforeSolved.has(item.key);

      if (isNewCell) item.cell.classList.add('wow-cell-awaiting-letter');
      makeFlightLetter(word[index], fromX, centerY, targetX, targetY, delayMs);

      setTimeout(() => {
        if (!item.cell.isConnected) return;
        item.cell.classList.remove('wow-cell-awaiting-letter');
        item.cell.classList.remove('wow-cell-letter-land');
        void item.cell.offsetWidth;
        item.cell.classList.add('wow-cell-letter-land');
        setTimeout(() => item.cell.classList.remove('wow-cell-letter-land'), 520);
      }, delayMs + 500);
    });
  }

  function tryAnimateSubmission(wrap, word, beforeSolved, seq, attempt = 0) {
    if (!wrap?.isConnected || state.wrap !== wrap || state.submissionSeq !== seq) return;
    const path = findSolvedPath(wrap, word, beforeSolved);
    if (path) {
      animateLettersToPath(wrap, word, path, beforeSolved);
      return;
    }
    if (attempt < 4) {
      setTimeout(() => tryAnimateSubmission(wrap, word, beforeSolved, seq, attempt + 1), 45 + attempt * 40);
    }
  }

  function captureSubmission() {
    const wrap = state.wrap;
    if (!state.dragging || !wrap?.isConnected) return;
    state.dragging = false;

    const word = readPreviewWord(wrap);
    if (word.length < 3) return;

    const beforeSolved = new Set(solvedCells(wrap).map((item) => item.key));
    state.submissionSeq += 1;
    const seq = state.submissionSeq;

    setTimeout(() => tryAnimateSubmission(wrap, word, beforeSolved, seq), 0);
  }

  function installOnWrap(wrap) {
    if (!wrap || wrap.dataset.wowWordFlow === '1') return;
    wrap.dataset.wowWordFlow = '1';
    state.wrap = wrap;
    state.dragging = false;

    wrap.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('#wow-wheel')) return;
      state.dragging = true;
    }, true);
  }

  document.addEventListener('pointerup', captureSubmission, true);
  document.addEventListener('pointercancel', captureSubmission, true);

  function discover() {
    const wrap = $('.wow-wrap');
    if (!wrap) {
      state.wrap = null;
      state.dragging = false;
      return;
    }
    if (state.wrap !== wrap || wrap.dataset.wowWordFlow !== '1') installOnWrap(wrap);
  }

  const timer = setInterval(discover, 140);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', discover, { once: true });
  else discover();
})();
