// Validates web/data/bible_wordsearch_levels.json.
//
//   node scripts/check-wordsearch-levels.mjs           check every level
//   node scripts/check-wordsearch-levels.mjs --report  also print per-level fill
//
// The game builds each board at runtime, and it does so twice over: «Змейка» snakes
// words through the rows x cols grid from this file, while «Классика» -- the default
// mode -- ignores those dimensions and derives its own from the words. The snake
// generator also gives up quietly: when a word will not fit it returns the board it
// got so far, so a level packed too tightly ships with words the player can never
// find. Nothing caught either, so this runs both placements and fails if any level
// cannot seat all of its words or would build a board larger than the game already
// asks a phone to show.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'web/data/bible_wordsearch_levels.json');
const report = process.argv.includes('--report');

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const levels = data.levels;
const failures = [];

// --- placement, mirroring web/games/bible-wordsearch.js -----------------------

/** Deterministic shuffle, so a level that passes here passes every time. */
function makeRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shuffled(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function dfs(word, charIndex, r, c, path_, grid, rows, cols, random) {
  if (charIndex === word.length) return true;
  for (const [dr, dc] of shuffled([[0, 1], [1, 0], [0, -1], [-1, 0]], random)) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    if (grid[nr][nc] !== '') continue;
    grid[nr][nc] = word[charIndex];
    path_.push([nr, nc]);
    if (dfs(word, charIndex + 1, nr, nc, path_, grid, rows, cols, random)) return true;
    path_.pop();
    grid[nr][nc] = '';
  }
  return false;
}

function placeWord(word, grid, rows, cols, random) {
  const cells = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) cells.push([r, c]);
  for (const [r, c] of shuffled(cells, random)) {
    if (grid[r][c] !== '') continue;
    const path_ = [[r, c]];
    grid[r][c] = word[0];
    if (dfs(word, 1, r, c, path_, grid, rows, cols, random)) return path_;
    grid[r][c] = '';
  }
  return null;
}

/** How many of the level's words the generator can actually seat, over 200 attempts. */
function bestPlacement(level) {
  const words = [...level.wordsList].sort((a, b) => b.length - a.length);
  let best = 0;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const random = makeRandom(level.id * 7919 + attempt);
    const grid = Array.from({ length: level.rows }, () => Array(level.cols).fill(''));
    let placed = 0;
    for (const word of words) {
      let path_ = null;
      for (let retry = 0; retry < 15 && !path_; retry += 1) {
        path_ = placeWord(word, grid, level.rows, level.cols, random);
      }
      if (!path_) break;
      placed += 1;
    }
    if (placed === words.length) return placed;
    if (placed > best) best = placed;
  }
  return best;
}

// --- schema ------------------------------------------------------------------

if (!Array.isArray(levels) || !levels.length) failures.push('levels must be a non-empty array');

// Levels up to here predate the rule below and keep their overlapping words.
const GRANDFATHERED_THROUGH = 40;

const seenIds = new Set();
const wordOwners = new Map();
const CYRILLIC = /^[А-ЯЁ]+$/;

for (const [index, level] of levels.entries()) {
  const where = `уровень ${level?.id ?? `#${index + 1}`}`;
  if (!Number.isInteger(level.id) || level.id < 1) failures.push(`${where}: id must be a positive integer`);
  if (seenIds.has(level.id)) failures.push(`${where}: duplicate id`);
  seenIds.add(level.id);
  if (typeof level.theme !== 'string' || !level.theme.trim()) failures.push(`${where}: missing theme`);
  if (!Number.isInteger(level.rows) || level.rows < 4) failures.push(`${where}: rows must be at least 4`);
  if (!Number.isInteger(level.cols) || level.cols < 4) failures.push(`${where}: cols must be at least 4`);
  if (!Array.isArray(level.wordsList)) {
    failures.push(`${where}: wordsList must be an array`);
    continue;
  }
  // Four is the floor a level has to clear to be worth playing.
  if (level.wordsList.length < 4) failures.push(`${where}: only ${level.wordsList.length} words, at least 4 are required`);

  for (const word of level.wordsList) {
    if (typeof word !== 'string' || !CYRILLIC.test(word)) {
      failures.push(`${where}: "${word}" must be uppercase Cyrillic letters only`);
      continue;
    }
    if (word.length < 3) failures.push(`${where}: "${word}" is too short to hunt for`);
    // A word that turns up on two levels is found twice for the same thought. The
    // first forty levels already repeat 45 words between them; that is theirs to
    // keep, but nothing added after them may repeat anything -- its own words or
    // theirs.
    const owner = wordOwners.get(word);
    if (owner === undefined) wordOwners.set(word, level.id);
    else if (level.id > GRANDFATHERED_THROUGH || owner > GRANDFATHERED_THROUGH) {
      failures.push(`${where}: "${word}" already appears on level ${owner}`);
    }
  }
}

// --- classic mode, mirroring web/js/wordsearch-classic-engine.js --------------

// The widest and tallest board the game already builds today. A level that needs
// more than this shrinks the letters below a comfortable touch target on a phone.
const MAX_CLASSIC_ROWS = 20;
const MAX_CLASSIC_COLS = 12;

/** The board «Классика» would build: long words down a top zone, short ones across below. */
function classicShape(level) {
  const ordered = [...level.wordsList].sort((a, b) => b.length - a.length);
  const verticalCount = Math.ceil(ordered.length / 2);
  const vertical = ordered.slice(0, verticalCount);
  const horizontal = ordered.slice(verticalCount);
  const maxVertical = Math.max(3, ...vertical.map((word) => word.length));
  const maxHorizontal = Math.max(3, ...horizontal.map((word) => word.length));
  const cols = Math.max(8, maxHorizontal + 1, vertical.length + 2);
  const rows = Math.max(8, maxVertical + 2 + horizontal.length);
  // Each vertical word owns a column and each horizontal word owns a row, and the two
  // zones never meet -- so the only way a word is lost is if the board is too small
  // to give it one.
  const seats = vertical.length <= cols && horizontal.length <= rows - (maxVertical + 2)
    && horizontal.every((word) => word.length <= cols)
    && vertical.every((word) => word.length <= maxVertical);
  return { rows, cols, seats };
}

// --- every word has to fit, in both modes ------------------------------------

const rows = [];
for (const level of levels) {
  if (!Array.isArray(level.wordsList) || !level.wordsList.length) continue;
  const cells = level.rows * level.cols;
  const letters = level.wordsList.reduce((sum, word) => sum + word.length, 0);

  const placed = bestPlacement(level);
  if (placed < level.wordsList.length) {
    failures.push(
      `уровень ${level.id} «${level.theme}»: «Змейка» seats only ${placed} of ${level.wordsList.length} words `
      + `in ${level.rows}x${level.cols} (${letters}/${cells} cells, ${Math.round((letters / cells) * 100)}% full) — `
      + 'players would look for words that are not on the board',
    );
  }

  const classic = classicShape(level);
  if (!classic.seats) {
    failures.push(`уровень ${level.id} «${level.theme}»: «Классика» cannot seat every word in ${classic.rows}x${classic.cols}`);
  }
  if (classic.rows > MAX_CLASSIC_ROWS || classic.cols > MAX_CLASSIC_COLS) {
    failures.push(
      `уровень ${level.id} «${level.theme}»: «Классика» would build ${classic.rows}x${classic.cols}, `
      + `larger than the ${MAX_CLASSIC_ROWS}x${MAX_CLASSIC_COLS} the game keeps readable on a phone`,
    );
  }

  rows.push(`${String(level.id).padStart(3)} ${level.theme.padEnd(24)} змейка ${level.rows}x${level.cols} `
    + `${String(Math.round((letters / cells) * 100)).padStart(3)}%   классика ${String(classic.rows).padStart(2)}x${classic.cols} `
    + `${String(level.wordsList.length).padStart(2)} слов`);
}

if (report) for (const row of rows) console.log(row);

if (failures.length) {
  console.error(`Word search levels check failed (${failures.length}):\n\n${failures.join('\n')}`);
  process.exit(1);
}

const words = levels.flatMap((level) => level.wordsList || []);
console.log(`Word search levels OK: ${levels.length} уровней, ${words.length} слов, все уникальны, `
  + `на каждом не меньше четырёх, и каждое слово помещается и в «Классике», и в «Змейке».`);
