// Раскладка кроссворда «Библейских слов» — та же, что в web/games/bible-wow.js.
//
// Живёт отдельным модулем, потому что нужна двоим: проверке уровней и подбору
// слов взамен небиблейских. Две копии одного алгоритма разошлись бы, и подбор
// начал бы предлагать слова, которые игра посадить на поле не может.

// --- crossword layout, mirroring web/games/bible-wow.js -----------------------

const SIZE = 40;
const CENTER = 20;

function canPlaceWord(grid, word, r, c, dr, dc) {
  const len = word.length;
  if (r < 0 || c < 0 || r + dr * len > SIZE || c + dc * len > SIZE) return false;

  const headR = r - dr;
  const headC = c - dc;
  if (headR >= 0 && headR < SIZE && headC >= 0 && headC < SIZE && grid[headR][headC] !== null) return false;

  const tailR = r + dr * len;
  const tailC = c + dc * len;
  if (tailR >= 0 && tailR < SIZE && tailC >= 0 && tailC < SIZE && grid[tailR][tailC] !== null) return false;

  for (let i = 0; i < len; i += 1) {
    const cr = r + dr * i;
    const cc = c + dc * i;
    const cell = grid[cr][cc];
    if (cell !== null) {
      if (cell !== word[i]) return false;
    } else {
      const n1r = cr + dc;
      const n1c = cc + dr;
      const n2r = cr - dc;
      const n2c = cc - dr;
      if (n1r >= 0 && n1r < SIZE && n1c >= 0 && n1c < SIZE && grid[n1r][n1c] !== null) return false;
      if (n2r >= 0 && n2r < SIZE && n2c >= 0 && n2c < SIZE && grid[n2r][n2c] !== null) return false;
    }
  }
  return true;
}

function placeWord(grid, word, r, c, dr, dc) {
  for (let i = 0; i < word.length; i += 1) grid[r + dr * i][c + dc * i] = word[i];
}

/**
 * The words the crossword actually seats. The game picks the first word's direction
 * at random and is deterministic after that, so both directions are tried and the
 * worse one is what a player can be dealt.
 */
export function seatedWords(words, dir) {
  const sorted = [...words].sort((a, b) => b.length - a.length);
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  const placed = [];

  if (sorted.length) {
    const word = sorted[0];
    const dr = dir === 0 ? 0 : 1;
    const dc = dir === 0 ? 1 : 0;
    const sr = CENTER - Math.floor((dr * word.length) / 2);
    const sc = CENTER - Math.floor((dc * word.length) / 2);
    placeWord(grid, word, sr, sc, dr, dc);
    placed.push({ word, r: sr, c: sc, dr, dc });
  }

  const remaining = sorted.slice(1);
  let changed = true;
  while (changed && remaining.length) {
    changed = false;
    for (let i = 0; i < remaining.length; i += 1) {
      const word = remaining[i];
      let seated = false;
      for (let j = 0; j < word.length && !seated; j += 1) {
        for (const anchor of placed) {
          if (seated) break;
          for (let k = 0; k < anchor.word.length; k += 1) {
            if (anchor.word[k] !== word[j]) continue;
            const interR = anchor.r + anchor.dr * k;
            const interC = anchor.c + anchor.dc * k;
            const newDr = anchor.dr === 0 ? 1 : 0;
            const newDc = anchor.dc === 0 ? 1 : 0;
            const startR = interR - newDr * j;
            const startC = interC - newDc * j;
            if (canPlaceWord(grid, word, startR, startC, newDr, newDc)) {
              placeWord(grid, word, startR, startC, newDr, newDc);
              placed.push({ word, r: startR, c: startC, dr: newDr, dc: newDc });
              remaining.splice(i, 1);
              i -= 1;
              seated = true;
              changed = true;
              break;
            }
          }
        }
      }
    }
  }
  // The loader keeps a Set of placed words, so duplicates collapse into one.
  return new Set(placed.map((item) => item.word));
}
