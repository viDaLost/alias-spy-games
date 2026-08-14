// Fast deterministic classic boards for «Поиск библейских слов».
// Loaded after word-games-upgrade.js so the game starts instantly even with all 40 levels.

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
    const ordered = shuffle(words, random);
    const horizontalCount = Math.ceil(ordered.length / 2);
    const horizontal = ordered.slice(0, horizontalCount);
    const vertical = ordered.slice(horizontalCount);
    const maxHorizontal = Math.max(3, ...horizontal.map((word) => word.length));
    const maxVertical = Math.max(3, ...vertical.map((word) => word.length));

    // Horizontal words live in the left zone, vertical words in a separate
    // right zone. Paths never intersect, which keeps the legacy solved-cell
    // behaviour fully compatible while still giving a classic straight-line board.
    const gap = 2;
    const leftWidth = maxHorizontal + 1;
    const rows = Math.max(
      Number(level.rows) || 0,
      maxVertical + 2,
      horizontal.length + 3,
      8,
    );
    const cols = Math.max(
      Number(level.cols) || 0,
      leftWidth + gap + Math.max(vertical.length, 2) + 1,
      9,
    );

    const grid = Array.from({ length: rows }, () => Array(cols).fill(''));
    const placements = [];
    const rowPool = shuffle(Array.from({ length: rows }, (_, index) => index), random).slice(0, horizontal.length);

    horizontal.forEach((word, index) => {
      const row = rowPool[index];
      const maxStart = Math.max(0, leftWidth - word.length);
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

    const verticalCols = shuffle(
      Array.from({ length: Math.max(vertical.length, 1) }, (_, index) => leftWidth + gap + index),
      random,
    );
    vertical.forEach((word, index) => {
      const col = verticalCols[index];
      const maxStart = Math.max(0, rows - word.length);
      const start = Math.floor(random() * (maxStart + 1));
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

  function installStableTextWrites() {
    const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    if (!descriptor?.get || !descriptor?.set || Node.prototype.__wordGamesStableText) return;

    const selector = '.ws-live-word, .wow-live-center b, .wow-live-center small, .wow-scroll-meter b';
    Object.defineProperty(Node.prototype, 'textContent', {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get() { return descriptor.get.call(this); },
      set(value) {
        const next = value == null ? '' : String(value);
        if (this instanceof Element && this.matches(selector) && descriptor.get.call(this) === next) return;
        descriptor.set.call(this, value);
      },
    });
    Object.defineProperty(Node.prototype, '__wordGamesStableText', { value: true, configurable: true });
  }

  function install() {
    installStableTextWrites();

    // Use a direct fetch wrapper instead of chaining the first experimental
    // transformer. This avoids doing expensive placement searches for all
    // forty levels during game startup.
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