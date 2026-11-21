import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const engine = fs.readFileSync(new URL('../web/games/bible-wordsearch.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../web/js/word-games-upgrade-lite.js', import.meta.url), 'utf8');
const storageKey = 'bible_wordsearch_progress_v2_anon';
const text = 'ВОСКРЕСЕНИЕ';
const grid = [
  'АПОРАСТИРИ', 'ЭАМИЕПЯЕПШ', 'ЕЗННАДЕРПЕ', 'НАМКРИЕТТС', 'ИБСЛЕНЕИВФ',
  'ЕБЕИЩЕПЗОВ', 'ФЯИНЕСЕНЮЕ', 'ССМГВОСКХИ', 'ТДИСОЩКРПН', 'ХАМХШГПЕСЕ',
];
const drawnPath = [[7, 4], [7, 5], [7, 6], [7, 7], [8, 7], [9, 7], [9, 8], [9, 9], [8, 9], [7, 9], [6, 9]];
const placedPath = drawnPath.map((cell, i) => i === 3 ? [8, 6] : cell);

async function setup({ snake = true, reserveUpperK = false } = {}) {
  const dom = new JSDOM('<div id="game-container"></div>', {
    url: 'https://wordsearch.test', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  let updateUi;
  let target;
  window.setInterval = (callback) => { updateUi = callback; };
  document.elementFromPoint = () => target;

  const words = structuredClone([
    { text, path: placedPath },
    reserveUpperK
      ? { text: 'КХ', path: [[7, 7], [7, 8]] }
      : { text: 'ПОМАЗАНИЕ', path: [[0, 1], [0, 2], [1, 2], [1, 1], [2, 1], [3, 1], [3, 0], [4, 0], [5, 0]] },
  ]);
  const level = { id: 3, theme: 'События', rows: 10, cols: 10 };
  if (snake) {
    level.wordsList = words.map((word) => word.text);
    window.localStorage.setItem('bible_wordsearch_mode_v1', 'snake');
    window.localStorage.setItem(storageKey, JSON.stringify({
      version: 5, currentLevel: 0, state: { 0: { generatedGrid: grid, generatedWords: words, found: [] } },
    }));
  } else {
    Object.assign(level, { grid, words });
  }

  window.loadJSON = async () => ({ levels: [level] });
  window.eval(engine + '\nwindow.startBibleWordSearchGame = startBibleWordSearchGame;');
  window.eval(ui);
  window.startBibleWordSearchGame('levels.json');
  await new Promise((resolve) => setImmediate(resolve));
  updateUi();

  const cell = ([r, c]) => document.querySelector(`.ws-cell[data-r="${r}"][data-c="${c}"]`);
  const dispatch = (host, event) => host.dispatchEvent(new window.MouseEvent(event, { bubbles: true, cancelable: true }));
  const move = (position) => {
    target = cell(position);
    dispatch(window, 'pointermove');
  };
  return {
    close: () => window.close(),
    readProgress: () => JSON.parse(window.localStorage.getItem(storageKey)).state[0],
    trace([start, ...rest]) {
      dispatch(cell(start), 'pointerdown');
      rest.forEach(move);
    },
    move,
    release: () => dispatch(window, 'pointerup'),
    preview() {
      updateUi();
      return document.querySelector('.ws-live-word').textContent;
    },
    solved: (position) => cell(position).classList.contains('ws-cell--solved'),
  };
}

for (const reverse of [false, true]) {
  const game = await setup();
  try {
    const path = reverse ? [...drawnPath].reverse() : drawnPath;
    const expected = reverse ? [...text].reverse().join('') : text;
    game.trace(path);
    assert.equal(game.preview(), expected, 'preview follows the gesture, even when it goes up or left');
    game.move(path.at(-2));
    assert.equal(game.preview(), expected.slice(0, -1), 'moving back one cell removes the last letter');
    game.move(path.at(-1));
    game.release();
    assert.deepEqual(game.readProgress().found, [text]);
    assert.deepEqual(game.readProgress().generatedWords[0].path, drawnPath);
    assert.equal(game.solved([7, 7]), true, 'highlight the K the player actually selected');
    assert.equal(game.solved([8, 6]), false);
    assert.equal(game.preview(), 'Проведите по буквам');
  } finally {
    game.close();
  }
}

const reserved = await setup({ reserveUpperK: true });
try {
  reserved.trace(drawnPath);
  reserved.release();
  assert.deepEqual(reserved.readProgress().found, [text]);
  assert.equal(reserved.solved([7, 7]), false, 'do not block a cell used by the other word');
  reserved.trace([[7, 7], [7, 8]]);
  reserved.release();
  assert.deepEqual(reserved.readProgress().found, [text, 'КХ']);
} finally {
  reserved.close();
}

const classic = await setup({ snake: false });
try {
  classic.trace(drawnPath);
  classic.release();
  assert.deepEqual(classic.readProgress()?.found ?? [], []);
  classic.trace(placedPath);
  classic.release();
  assert.deepEqual(classic.readProgress().found, [text]);
} finally {
  classic.close();
}

console.log('Word search selection follows the gesture and accepts equivalent snake paths without blocking other words.');
