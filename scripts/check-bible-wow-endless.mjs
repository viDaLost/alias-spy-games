import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const engine = fs.readFileSync(new URL('../web/games/bible-wow.js', import.meta.url), 'utf8');
const data = JSON.parse(fs.readFileSync(new URL('../web/data/bible_wow_levels.json', import.meta.url), 'utf8'));
assert.equal(data.levels.length, 200);
const vocabulary = [...new Set(data.levels.flatMap(level => level.words))];
const recordKey = 'bibleWowEndlessRecords_v1_123456_ru';

const dom = new JSDOM('<div id="game-container"></div>', {
  url: 'https://wow.test', runScripts: 'outside-only', pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;
const $ = selector => document.querySelector(selector);
const value = selector => Number($(selector).textContent);
let now = 1_000_000;
let tick;
let target;
let balance = 90;
let advances = [];
const timeouts = new Map();
let timeoutId = 0;
window.Date.now = () => now;
window.setInterval = callback => { tick = callback; return 1; };
window.clearInterval = () => { tick = null; };
window.setTimeout = (callback, delay) => {
  const id = ++timeoutId;
  timeouts.set(id, { callback, delay });
  if (delay === 350) advances.push(id);
  return id;
};
window.clearTimeout = id => timeouts.delete(id);
window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} });
document.elementFromPoint = () => target;
window.loadJSON = async () => data;
window.goToMainMenu = () => { $('#game-container').replaceChildren(); };
window.GameWallet = {
  accountId: () => '123456', balance: () => balance,
  add: delta => { balance += delta; }, spend: cost => { balance -= cost; return { ok: true }; },
};
window.eval(engine + '\nwindow.startBibleWowGame = startBibleWowGame;');

function press(selector) { $(selector).click(); }
function submit(word, elapsed = 0) {
  const buttons = [...document.querySelectorAll('.wow-btn-let')];
  const unused = [...buttons];
  for (const [index, char] of [...word].entries()) {
    const i = unused.findIndex(button => button.dataset.letter === char);
    assert.notEqual(i, -1, `wheel cannot make ${word}`);
    target = unused.splice(i, 1)[0];
    $('#wow-wheel').dispatchEvent(new window.MouseEvent(index ? 'pointermove' : 'pointerdown', { bubbles: true, cancelable: true }));
  }
  now += elapsed;
  $('#wow-wheel').dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, cancelable: true }));
}

function possibleWords() {
  const letters = [...document.querySelectorAll('.wow-btn-let')].map(button => button.dataset.letter);
  return vocabulary.filter(word => {
    const remaining = [...letters];
    for (const letter of word) {
      const index = remaining.indexOf(letter);
      if (index < 0) return false;
      remaining.splice(index, 1);
    }
    return true;
  });
}

function solveBoard() {
  const found = [];
  for (const word of possibleWords()) {
    const before = value('#wow-endless-words');
    submit(word, 200);
    if (value('#wow-endless-words') > before) {
      found.push(word);
      const score = value('#wow-endless-score');
      submit(word);
      assert.equal(value('#wow-endless-score'), score, 'repeat word must not score twice');
    }
    if (found.length === 4) break;
  }
  assert.equal(found.length, 4, 'every timed crossword must contain exactly four constructible words');
  return found;
}

function advanceBoard() {
  advances = advances.filter(id => timeouts.has(id));
  const id = advances.shift();
  assert.ok(timeouts.has(id), 'completed four-word board must advance');
  now += 350;
  timeouts.get(id).callback();
  timeouts.delete(id);
}

async function launch() {
  window.startBibleWowGame('levels.json');
  await new Promise(resolve => setImmediate(resolve));
}

await launch();
assert.ok($('#wow-mode-menu'), 'entry opens the mode selection');
assert.equal($('#wow-grid'), null);
assert.equal(value('#wow-score'), 90);
press('#wow-classic-open');
assert.ok($('#wow-grid'));
assert.equal($('#wow-title').textContent.trim(), 'Уровень 1');
press('#wow-levels-open');
assert.ok($('#wow-levels-modal').classList.contains('open'));
press('#wow-levels-close');
press('#wow-modes');
assert.ok($('#wow-mode-menu'));
press('#wow-endless-open');
assert.ok($('#wow-duration-menu'));
assert.equal(tick, null, 'timer starts only after choosing a duration');
press('#wow-duration-back');
assert.ok($('#wow-mode-menu'));
press('#wow-endless-open');
assert.equal(document.querySelectorAll('[data-wow-duration]').length, 3);
press('[data-wow-duration="60"]');
assert.equal($('#wow-endless-timer').textContent, '1:00');
assert.equal($('#wow-hint'), null);
assert.equal($('#wow-bonus-open'), null);
const first = solveBoard();
assert.equal(value('#wow-endless-words'), 4);
assert.ok(value('#wow-endless-score') > 400 && value('#wow-endless-score') <= 600);
advanceBoard();
const second = solveBoard();
assert.ok(second.every(word => !first.includes(word)), 'next crossword must use new words');
const score = value('#wow-endless-score');
assert.equal(value('#wow-endless-words'), 8);
assert.equal(balance, 90);
assert.equal(window.localStorage.getItem('bibleWowCompleted'), null);
assert.equal(window.localStorage.getItem('bibleWowProgressByLevel_v1'), null);
now += 60_000;
const expiredTick = tick;
expiredTick();
assert.equal($('#wow-endless-timer').textContent, '0:00');
assert.ok($('#wow-endless-result').classList.contains('open'));
assert.equal(value('#wow-endless-result-score'), score);
assert.equal(value('#wow-endless-result-words'), 8);
assert.equal(JSON.parse(window.localStorage.getItem(recordKey))[60].score, score);
assert.equal(tick, null);
assert.equal(balance, 90);

press('#wow-endless-retry');
assert.equal(value('#wow-endless-score'), 0);
assert.equal(value('#wow-endless-best'), score);
now += 60_000;
tick();
assert.equal(JSON.parse(window.localStorage.getItem(recordKey))[60].score, score, 'lower results must not overwrite personal best');
press('#wow-endless-retry');
for (let round = 0; round < 3; round++) {
  solveBoard();
  if (round < 2) advanceBoard();
}
const betterScore = value('#wow-endless-score');
assert.ok(betterScore > score);
now += 60_000;
tick();
assert.equal($('#wow-endless-result-title').textContent, 'Новый рекорд!');
assert.equal(JSON.parse(window.localStorage.getItem(recordKey))[60].score, betterScore);
press('#wow-endless-change');
assert.equal($('[data-wow-record="60"]').textContent, String(betterScore));
press('[data-wow-duration="120"]');
assert.equal($('#wow-endless-timer').textContent, '2:00');
assert.equal(value('#wow-endless-best'), 0);
solveBoard();
now += 120_000;
tick();
assert.equal(JSON.parse(window.localStorage.getItem(recordKey))[120].words, 4);
press('#wow-endless-change');
press('[data-wow-duration="180"]');
assert.equal($('#wow-endless-timer').textContent, '3:00');
press('#wow-modes');
assert.equal(tick, null);
assert.ok($('#wow-mode-menu'));
assert.equal(value('#wow-score'), 90);
press('#wow-classic-open');
assert.ok($('#wow-hint'));
assert.equal($('#wow-title').textContent.trim(), 'Уровень 1');

window.__bibleWowCleanup();
await launch();
assert.ok($('#wow-mode-menu'), 'every new entry shows mode selection');
press('#wow-endless-open');
assert.equal($('[data-wow-record="60"]').textContent, String(betterScore), 'record survives leaving and reopening the game');
press('[data-wow-duration="180"]');
window.__bibleWowCleanup();
assert.equal(tick, null, 'active timer is cleaned when leaving the game');
dom.window.close();
console.log('Bible Wow endless mode: 4-word rounds, 1/2/3-minute timers, speed score, records and isolated star balance OK.');
