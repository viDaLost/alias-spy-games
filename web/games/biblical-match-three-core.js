(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BiblicalMatchThreeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function cloneCell(cell) {
    if (!cell) return null;
    // Ковчег отличается от рядовой фишки только этим полем. Клон обязан его
    // сохранять: swap клонирует доску на каждом ходу.
    const next = { type: cell.type, special: cell.special || null };
    if (cell.relic) next.relic = true;
    return next;
  }

  function cloneBoard(board) { return board.map(cloneCell); }
  function indexOf(row, col, cols) { return row * cols + col; }
  function coordinates(index, cols) { return { row: Math.floor(index / cols), col: index % cols }; }

  function areAdjacent(a, b, cols) {
    const aa = coordinates(a, cols);
    const bb = coordinates(b, cols);
    return Math.abs(aa.row - bb.row) + Math.abs(aa.col - bb.col) === 1;
  }

  function swap(board, a, b) {
    const next = cloneBoard(board);
    [next[a], next[b]] = [next[b], next[a]];
    return next;
  }

  function findMatchGroups(board, rows, cols) {
    const groups = [];
    for (let row = 0; row < rows; row += 1) {
      let start = 0;
      while (start < cols) {
        const type = board[indexOf(row, start, cols)]?.type;
        let end = start + 1;
        while (end < cols && type && board[indexOf(row, end, cols)]?.type === type) end += 1;
        if (type && end - start >= 3) {
          const indices = [];
          for (let col = start; col < end; col += 1) indices.push(indexOf(row, col, cols));
          groups.push({ orientation: "h", indices, type });
        }
        start = Math.max(end, start + 1);
      }
    }
    for (let col = 0; col < cols; col += 1) {
      let start = 0;
      while (start < rows) {
        const type = board[indexOf(start, col, cols)]?.type;
        let end = start + 1;
        while (end < rows && type && board[indexOf(end, col, cols)]?.type === type) end += 1;
        if (type && end - start >= 3) {
          const indices = [];
          for (let row = start; row < end; row += 1) indices.push(indexOf(row, col, cols));
          groups.push({ orientation: "v", indices, type });
        }
        start = Math.max(end, start + 1);
      }
    }
    return groups;
  }

  function findMatches(board, rows, cols) {
    const matches = new Set();
    for (const group of findMatchGroups(board, rows, cols)) group.indices.forEach((index) => matches.add(index));
    return [...matches].sort((a, b) => a - b);
  }

  function analyzeMatches(board, rows, cols, preferred = []) {
    const groups = findMatchGroups(board, rows, cols);
    const clearSet = new Set();
    const intersections = new Map();
    groups.forEach((group) => {
      group.indices.forEach((index) => {
        clearSet.add(index);
        const orientations = intersections.get(index) || new Set();
        orientations.add(group.orientation);
        intersections.set(index, orientations);
      });
    });
    const creations = new Map();
    const chooseAnchor = (indices) => preferred.find((index) => indices.includes(index)) ?? indices[Math.floor(indices.length / 2)];
    for (const [index, orientations] of intersections.entries()) if (orientations.size > 1) creations.set(index, "burst");
    for (const group of groups) {
      const anchor = chooseAnchor(group.indices);
      if (group.indices.length >= 5) creations.set(anchor, "rainbow");
      else if (group.indices.length === 4 && !creations.has(anchor)) creations.set(anchor, group.orientation === "h" ? "lineH" : "lineV");
    }
    for (const index of creations.keys()) clearSet.delete(index);
    return { groups, clearSet, creations };
  }

  function createsMatch(board, rows, cols, a, b) {
    if (!areAdjacent(a, b, cols)) return false;
    return findMatches(swap(board, a, b), rows, cols).length > 0;
  }

  function findMoves(board, rows, cols, canSwap = null, limit = Infinity) {
    const moves = [];
    const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : Infinity;
    const playable = (a, b) => (!canSwap || canSwap(a, b)) && (createsMatch(board, rows, cols, a, b) || Boolean(specialComboClearSet(board, a, b, rows, cols)));
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const a = indexOf(row, col, cols);
        if (col + 1 < cols) {
          const b = indexOf(row, col + 1, cols);
          if (playable(a, b)) { moves.push([a, b]); if (moves.length >= max) return moves; }
        }
        if (row + 1 < rows) {
          const b = indexOf(row + 1, col, cols);
          if (playable(a, b)) { moves.push([a, b]); if (moves.length >= max) return moves; }
        }
      }
    }
    return moves;
  }

  function findHint(board, rows, cols, canSwap = null) {
    return findMoves(board, rows, cols, canSwap, 1)[0] || null;
  }

  function createBoard(rows, cols, typeIds, rng = Math.random) {
    if (!Array.isArray(typeIds) || typeIds.length < 3) throw new Error("At least three tile types are required");
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const board = new Array(rows * cols);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const blocked = new Set();
          if (col >= 2) {
            const a = board[indexOf(row, col - 1, cols)]?.type;
            const b = board[indexOf(row, col - 2, cols)]?.type;
            if (a && a === b) blocked.add(a);
          }
          if (row >= 2) {
            const a = board[indexOf(row - 1, col, cols)]?.type;
            const b = board[indexOf(row - 2, col, cols)]?.type;
            if (a && a === b) blocked.add(a);
          }
          const pool = typeIds.filter((id) => !blocked.has(id));
          const safePool = pool.length ? pool : typeIds;
          const type = safePool[Math.floor(rng() * safePool.length) % safePool.length];
          board[indexOf(row, col, cols)] = { type, special: null };
        }
      }
      if (findMatches(board, rows, cols).length === 0 && findMoves(board, rows, cols, null, 3).length >= 3) return board;
    }
    throw new Error("Could not generate a playable board");
  }

  function reshuffle(board, rows, cols, rng = Math.random) {
    const typeIds = [...new Set(board.map((cell) => cell?.type).filter(Boolean))];
    if (typeIds.length < 3) throw new Error("Could not reshuffle board with fewer than three tile types");
    const specials = board.filter((cell) => cell?.special).map((cell) => cell.special);
    const fresh = createBoard(rows, cols, typeIds, rng);
    for (const special of specials) {
      const available = fresh.map((cell, index) => (!cell.special ? index : -1)).filter((index) => index >= 0);
      if (!available.length) break;
      const index = available[Math.floor(rng() * available.length)];
      fresh[index].special = special;
    }
    return fresh;
  }

  function areaIndices(center, radius, rows, cols) {
    const { row, col } = coordinates(center, cols);
    const result = [];
    for (let dr = -radius; dr <= radius; dr += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        const rr = row + dr;
        const cc = col + dc;
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) result.push(indexOf(rr, cc, cols));
      }
    }
    return result;
  }

  function rowIndices(index, rows, cols, spread = 0) {
    const { row } = coordinates(index, cols);
    const result = [];
    for (let rr = Math.max(0, row - spread); rr <= Math.min(rows - 1, row + spread); rr += 1) {
      for (let col = 0; col < cols; col += 1) result.push(indexOf(rr, col, cols));
    }
    return result;
  }

  function columnIndices(index, rows, cols, spread = 0) {
    const { col } = coordinates(index, cols);
    const result = [];
    for (let cc = Math.max(0, col - spread); cc <= Math.min(cols - 1, col + spread); cc += 1) {
      for (let row = 0; row < rows; row += 1) result.push(indexOf(row, cc, cols));
    }
    return result;
  }

  function specialComboClearSet(board, a, b, rows, cols) {
    const first = board[a];
    const second = board[b];
    if (!first || !second) return null;
    const sa = first.special;
    const sb = second.special;
    if (!sa && !sb) return null;
    const set = new Set([a, b]);
    const add = (indices) => indices.forEach((index) => set.add(index));
    const line = (special) => special === "lineH" || special === "lineV";
    const rainbow = (special) => special === "rainbow";

    if (rainbow(sa) && rainbow(sb)) {
      board.forEach((cell, index) => { if (cell) set.add(index); });
      return { clearSet: set, combo: "doubleRainbow" };
    }
    if (rainbow(sa) || rainbow(sb)) {
      const rainbowIndex = rainbow(sa) ? a : b;
      const target = rainbow(sa) ? second : first;
      const targetSpecial = target.special;
      board.forEach((cell, index) => {
        if (cell?.type === target.type) {
          set.add(index);
          if (targetSpecial === "lineH") add(rowIndices(index, rows, cols));
          else if (targetSpecial === "lineV") add(columnIndices(index, rows, cols));
          else if (targetSpecial === "burst") add(areaIndices(index, 1, rows, cols));
        }
      });
      set.add(rainbowIndex);
      return { clearSet: set, combo: targetSpecial ? "rainbowSpecial" : "rainbowColor" };
    }
    if (line(sa) && line(sb)) {
      add(rowIndices(a, rows, cols)); add(columnIndices(a, rows, cols)); add(rowIndices(b, rows, cols)); add(columnIndices(b, rows, cols));
      return { clearSet: set, combo: "doubleLine" };
    }
    if ((line(sa) && sb === "burst") || (line(sb) && sa === "burst")) {
      const center = sa === "burst" ? a : b;
      add(rowIndices(center, rows, cols, 1)); add(columnIndices(center, rows, cols, 1));
      return { clearSet: set, combo: "lineBurst" };
    }
    if (sa === "burst" && sb === "burst") {
      add(areaIndices(a, 2, rows, cols)); add(areaIndices(b, 2, rows, cols));
      return { clearSet: set, combo: "doubleBurst" };
    }
    return null;
  }

  return { cloneBoard, coordinates, indexOf, areAdjacent, swap, findMatchGroups, findMatches, analyzeMatches, createsMatch, findMoves, findHint, createBoard, reshuffle, areaIndices, rowIndices, columnIndices, specialComboClearSet };
});
