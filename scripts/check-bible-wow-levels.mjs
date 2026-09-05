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

import { seatedWords } from './lib/bible-wow-layout.mjs';

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
