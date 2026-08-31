// Validates web/data/bible_wow_levels.json — уровни игры «Библейские слова».
//
//   node scripts/check-bible-wow-levels.mjs           check every level
//   node scripts/check-bible-wow-levels.mjs --report  also print per-level detail
//
// A level here is a wheel of letters plus the words spelled from them, and the game
// lays those words out as a crossword. Two things can silently shrink a level, and
// neither showed up anywhere before:
//
//   * a word shorter than three letters is dropped outright by the loader;
//   * a word the crossword cannot seat -- one that shares no letter with anything
//     already placed, or that would touch another word side-on -- falls out of the
//     grid and quietly becomes a bonus word instead.
//
// Either way the player ends up with fewer words on the board than the data promises.
// So this runs the game's own layout and counts what actually reaches the grid.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'web/data/bible_wow_levels.json');
const report = process.argv.includes('--report');

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const levels = data.levels;
const failures = [];
const warnings = [];

const MIN_WORDS = 4;

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
function seatedWords(words, dir) {
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

// --- checks ------------------------------------------------------------------

if (!Array.isArray(levels) || !levels.length) failures.push('levels must be a non-empty array');

const seenIds = new Set();
const wordOwners = new Map();
const CYRILLIC = /^[А-Я]+$/;
const rows = [];

for (const [index, level] of levels.entries()) {
  const where = `уровень ${level?.id ?? `#${index + 1}`}`;
  if (!Number.isInteger(level.id) || level.id < 1) failures.push(`${where}: id must be a positive integer`);
  if (seenIds.has(level.id)) failures.push(`${where}: duplicate id`);
  seenIds.add(level.id);

  if (typeof level.letters !== 'string' || !CYRILLIC.test(level.letters)) {
    failures.push(`${where}: letters must be uppercase Cyrillic without Ё`);
    continue;
  }
  if (!Array.isArray(level.words) || !level.words.length) {
    failures.push(`${where}: words must be a non-empty array`);
    continue;
  }

  const bonus = level.bonus || [];
  const all = [...level.words, ...bonus];
  const pool = new Map();
  for (const letter of level.letters) pool.set(letter, (pool.get(letter) || 0) + 1);

  // A bonus word is a find on top of the board, not part of the level's task, so the
  // one-level-owns-a-word rule does not reach it -- it only must be spellable and must
  // not repeat a word already on this level's own board.
  const onBoard = new Set(level.words);
  for (const word of bonus) {
    if (onBoard.has(word)) failures.push(`${where}: bonus "${word}" is already on the board`);
  }

  for (const word of all) {
    if (typeof word !== 'string' || !CYRILLIC.test(word)) {
      failures.push(`${where}: "${word}" must be uppercase Cyrillic without Ё`);
      continue;
    }
    // The loader drops anything under three letters before the level is even built.
    if (word.length < 3) failures.push(`${where}: "${word}" is shorter than three letters, so the game discards it`);

    const need = new Map();
    for (const letter of word) need.set(letter, (need.get(letter) || 0) + 1);
    for (const [letter, count] of need) {
      if (count > (pool.get(letter) || 0)) {
        failures.push(`${where}: "${word}" cannot be spelled from «${level.letters}» — not enough «${letter}»`);
        break;
      }
    }

    if (bonus.includes(word) && !onBoard.has(word)) continue;
    const owner = wordOwners.get(word);
    if (owner === undefined) wordOwners.set(word, level.id);
    else failures.push(`${where}: "${word}" already appears on level ${owner}`);
  }

  // What the crossword really seats, in the worse of the two starting directions.
  const gridWords = level.words.filter((word) => typeof word === 'string' && word.length >= 3);
  const seated = Math.min(seatedWords(gridWords, 0).size, seatedWords(gridWords, 1).size);

  if (seated < MIN_WORDS) {
    failures.push(
      `${where}: the crossword seats only ${seated} of ${level.words.length} words — `
      + `a level must put at least ${MIN_WORDS} on the board`,
    );
  } else if (seated < gridWords.length) {
    failures.push(
      `${where}: the crossword seats ${seated} of ${gridWords.length} words; `
      + `the rest silently become bonus words instead of appearing on the board`,
    );
  }

  rows.push(`${String(level.id).padStart(4)} ${level.letters.padEnd(14)} `
    + `${String(level.words.length).padStart(2)} слов, на поле ${String(seated).padStart(2)}`);
}

if (report) for (const row of rows) console.log(row);

if (warnings.length) console.warn(`Предупреждения по прежним уровням (${warnings.length}):\n${warnings.join('\n')}\n`);
if (failures.length) {
  console.error(`Bible WOW levels check failed (${failures.length}):\n\n${failures.join('\n')}`);
  process.exit(1);
}

const total = levels.reduce((sum, level) => sum + level.words.length, 0);
console.log(`Bible WOW levels OK: ${levels.length} уровней, ${total} слов, все складываются из своих букв, `
  + `слова уникальны, и на каждом уровне их не меньше четырёх на поле.`);
