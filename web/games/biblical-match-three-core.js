(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BiblicalMatchThreeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function cloneCell(cell) {
    return { type: cell.type, special: cell.special || null };
  }

  function cloneBoard(board) {
    return board.map(cloneCell);
  }

  function indexOf(row, col, cols) {
    return row * cols + col;
  }

  function coordinates(index, cols) {
    return { row: Math.floor(index / cols), col: index % cols };
  }

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
        while (end < cols && board[indexOf(row, end, cols)]?.type === type) end += 1;
        if (type && end - start >= 3) {
          const indices = [];
          for (let col = start; col < end; col += 1) indices.push(indexOf(row, col, cols));
          groups.push({ orientation: "h", indices, type });
        }
        start = end;
      }
    }

    for (let col = 0; col < cols; col += 1) {
      let start = 0;
      while (start < rows) {
        const type = board[indexOf(start, col, cols)]?.type;
        let end = start + 1;
        while (end < rows && board[indexOf(end, col, cols)]?.type === type) end += 1;
        if (type && end - start >= 3) {
          const indices = [];
          for (let row = start; row < end; row += 1) indices.push(indexOf(row, col, cols));
          groups.push({ orientation: "v", indices, type });
        }
        start = end;
      }
    }
    return groups;
  }

  function findMatches(board, rows, cols) {
    const matches = new Set();
    for (const group of findMatchGroups(board, rows, cols)) {
      group.indices.forEach((index) => matches.add(index));
    }
    return [...matches].sort((a, b) => a - b);
  }

  function createsMatch(board, rows, cols, a, b) {
    if (!areAdjacent(a, b, cols)) return false;
    const next = swap(board, a, b);
    return findMatches(next, rows, cols).length > 0;
  }

  function findHint(board, rows, cols) {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const a = indexOf(row, col, cols);
        if (col + 1 < cols) {
          const b = indexOf(row, col + 1, cols);
          if (createsMatch(board, rows, cols, a, b)) return [a, b];
        }
        if (row + 1 < rows) {
          const b = indexOf(row + 1, col, cols);
          if (createsMatch(board, rows, cols, a, b)) return [a, b];
        }
      }
    }
    return null;
  }

  function createBoard(rows, cols, typeIds, rng = Math.random) {
    if (!Array.isArray(typeIds) || typeIds.length < 3) throw new Error("At least three tile types are required");
    for (let attempt = 0; attempt < 80; attempt += 1) {
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
          const type = pool[Math.floor(rng() * pool.length) % pool.length];
          board[indexOf(row, col, cols)] = { type, special: null };
        }
      }
      if (findMatches(board, rows, cols).length === 0 && findHint(board, rows, cols)) return board;
    }
    throw new Error("Could not generate a playable board");
  }

  function reshuffle(board, rows, cols, rng = Math.random) {
    const typeIds = [...new Set(board.map((cell) => cell.type).filter(Boolean))];
    const specialByType = new Map();
    board.forEach((cell) => {
      if (cell.special && !specialByType.has(cell.type)) specialByType.set(cell.type, cell.special);
    });
    const fresh = createBoard(rows, cols, typeIds, rng);
    for (const cell of fresh) {
      if (specialByType.has(cell.type) && rng() < 0.12) {
        cell.special = specialByType.get(cell.type);
        specialByType.delete(cell.type);
      }
    }
    return fresh;
  }

  return {
    cloneBoard,
    coordinates,
    areAdjacent,
    swap,
    findMatchGroups,
    findMatches,
    createsMatch,
    findHint,
    createBoard,
    reshuffle,
  };
});
