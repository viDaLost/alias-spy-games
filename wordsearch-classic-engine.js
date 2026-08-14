// Fast deterministic classic boards for «Поиск библейских слов».
// Loaded after the visual runtime so the game starts instantly even with all 40 levels.

(() => {
  'use strict';

  const MODE_KEY = 'bible_wordsearch_mode_v1';
  const ALPHABET = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';

  function isWordSearchUrl(url) {
    return String(url || '').includes('bible_wordsearch_levels.json');
  }

  function mode() {
    return localStorage.getItem(MODE_KEY) === 'snake' ? 'snake' : 'classic';
  }

  function hashSeed(text) {
    let h = 2166136261 >>> 0;
    for (const char of String(text || '')) {
      h ^= char.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function randomFor(text) {
    let s = hashSeed(text) || 1;
    return () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  function shuffle(list, random) {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function normaliseWords(level) {
    return (level.wordsList || level.words || [])
      .map((item) => typeof item === 'string' ? item : item?.text)
      .map((word) => String(word || '').toUpperCase().replace(/Ё/g, 'Е').replace(/[^А-Я]/g, ''))
      .filter((word) => word.length >= 2);
  }

  function buildClassicLevel(level) {
    const words = normaliseWords(level);
    if (!words.length) return level;

    const random = randomFor(`${level.id}|${level.theme}|${words.join('|')}`);
    const ordered = shuffle(words, random).sort((a, b) => b.length - a.length);

    // Long words go vertically into the upper zone, shorter words horizontally
    // into rows below it. The zones never cross, so a found word can still be
    // disabled by the legacy UI without blocking another word. Keeping the
    // number of columns low also preserves comfortable 30px+ touch targets.
    const verticalCount = Math.ceil(ordered.length / 2);
    const vertical = ordered.slice(0, verticalCount);
    const horizontal = ordered.slice(verticalCount);
    const maxVertical = Math.max(3, ...vertical.map((word) => word.length));
    const maxHorizontal = Math.max(3, ...horizontal.map((word) => word.length));
    const rowGap = 2;
    const cols = Math.max(8, maxHorizontal + 1, vertical.length + 2);
    const rows = Math.max(8, maxVertical + rowGap + horizontal.length);

    const grid = Array.from({ length: rows }, () => Array(cols).fill(''));
    const placements = [];
    const verticalCols = shuffle(Array.from({ length: cols }, (_, index) => index), random).slice(0, vertical.length);

    vertical.forEach((word, index) => {
      const col = verticalCols[index];
      const start = Math.floor(random() * (Math.max(0, maxVertical - word.length) + 1));
      const reversed = random() > .5;
      const display = reversed ? word.split('').reverse().join('') : word;
      const path = [];
      for (let i = 0; i < display.length; i++) {
        const row = start + i;
        grid[row][col] = display[i];
        path.push([row, col]);
      }
      placements.push({ text: word, path: reversed ? path.reverse() : path });
    });

    const horizontalRows = shuffle(
      Array.from({ length: horizontal.length }, (_, index) => maxVertical + rowGap + index),
      random,
    );
    horizontal.forEach((word, index) => {
      const row = horizontalRows[index];
      const maxStart = Math.max(0, cols - word.length);
      const start = Math.floor(random() * (maxStart + 1));
      const reversed = random() > .5;
      const display = reversed ? word.split('').reverse().join('') : word;
      const path = [];
      for (let i = 0; i < display.length; i++) {
        const col = start + i;
        grid[row][col] = display[i];
        path.push([row, col]);
      }
      placements.push({ text: word, path: reversed ? path.reverse() : path });
    });

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!grid[row][col]) grid[row][col] = ALPHABET[Math.floor(random() * ALPHABET.length)];
      }
    }

    const upgraded = {
      ...level,
      rows,
      cols,
      grid: grid.map((row) => row.join('')),
      words: placements,
    };
    delete upgraded.wordsList;
    return upgraded;
  }

  function install() {
    // Direct fetch keeps the classic transformation O(number of letters)
    // instead of running placement-search loops for all forty levels.
    window.loadJSON = async function fastWordGamesLoadJSON(url) {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ошибка: ${response.status} при загрузке ${url}`);
      const data = await response.json();
      if (!isWordSearchUrl(url) || mode() !== 'classic' || !Array.isArray(data?.levels)) return data;
      return { ...data, levels: data.levels.map(buildClassicLevel) };
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();