import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const coreSource = read('web/games/biblical-match-three-core.js');
const rulesSource = read('web/js/v45-biblical-treasures-special-swipe.js');
const launcherSource = read('web/js/biblical-match-three-launcher.js');
const indexSource = read('index.html');

assert.match(launcherSource, /const VERSION="45"/);
assert.match(launcherSource, /v45-biblical-treasures-special-swipe\.js/);
assert.match(launcherSource, /rainbow: \{ label: \"Радуга Завета\"/);
assert.match(launcherSource, /id === \"rainbow\"/);
assert.match(launcherSource, /special:\"rainbow\"/);
assert.match(launcherSource, /patchGameSource/);
assert.match(launcherSource, /useNoahArk/); // old signature exists only as a removal target
assert.match(rulesSource, /\[data-booster=\"ark\"\]/);
assert.match(rulesSource, /arkBoosterRemoved: true/);
assert.match(indexSource, /biblical-match-three-launcher\.js\?v=45/);

const document = {
  body: { dataset: {} },
  documentElement: {},
  querySelectorAll: () => [],
  querySelector: () => null,
};
class MutationObserver { observe() {} disconnect() {} }
const context = {
  console,
  document,
  MutationObserver,
  requestAnimationFrame: (fn) => { fn(); return 1; },
  cancelAnimationFrame: () => {},
  setTimeout,
  clearTimeout,
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(coreSource, context, { filename: 'biblical-match-three-core.js' });
vm.runInContext(rulesSource, context, { filename: 'v45-biblical-treasures-special-swipe.js' });

const Core = context.BiblicalMatchThreeCore;
assert.ok(Core);
assert.equal(context.__bmtV45SpecialSwipeInstalled, true);

const rows = 3;
const cols = 4;
const cell = (type, special = null) => ({ type, special });

// Rainbow + Bible removes the rainbow, swapped Bible and every Bible on the board.
{
  const board = [
    cell('fish', 'rainbow'), cell('bible'), cell('dove'), cell('bible'),
    cell('lamp'), cell('bible'), cell('fish'), cell('crown'),
    cell('dove'), cell('bread'), cell('bible'), cell('lamp'),
  ];
  const result = Core.specialComboClearSet(board, 0, 1, rows, cols);
  assert.equal(result?.combo, 'rainbowColor');
  assert.deepEqual([...result.clearSet].sort((a, b) => a - b), [0, 1, 3, 5, 10]);
}

// A single horizontal special activates simply by being swiped; no match is needed.
{
  const board = [
    cell('fish'), cell('dove'), cell('lamp'), cell('crown'),
    cell('bible', 'lineH'), cell('fish'), cell('dove'), cell('lamp'),
    cell('crown'), cell('bread'), cell('fish'), cell('dove'),
  ];
  const result = Core.specialComboClearSet(board, 4, 5, rows, cols);
  assert.equal(result?.trigger, 'swipe');
  assert.deepEqual([...result.clearSet].sort((a, b) => a - b), [4, 5, 6, 7]);
}

// Vertical staff effect follows the destination column after the swipe.
{
  const board = [
    cell('fish'), cell('dove'), cell('lamp'), cell('crown'),
    cell('bible', 'lineV'), cell('fish'), cell('dove'), cell('lamp'),
    cell('crown'), cell('bread'), cell('fish'), cell('dove'),
  ];
  const result = Core.specialComboClearSet(board, 4, 5, rows, cols);
  assert.deepEqual([...result.clearSet].sort((a, b) => a - b), [1, 4, 5, 9]);
}

// Jericho/burst effect activates on swipe around its destination.
{
  const board = [
    cell('fish'), cell('dove'), cell('lamp'), cell('crown'),
    cell('bible'), cell('fish', 'burst'), cell('dove'), cell('lamp'),
    cell('crown'), cell('bread'), cell('fish'), cell('dove'),
  ];
  const result = Core.specialComboClearSet(board, 5, 6, rows, cols);
  assert.equal(result?.combo, 'singleBurst');
  assert.deepEqual([...result.clearSet].sort((a, b) => a - b), [1, 2, 3, 5, 6, 7, 9, 10, 11]);
}

// Normal tiles still cannot activate without a normal match.
{
  const board = Array.from({ length: rows * cols }, (_, index) => cell(['fish', 'dove', 'lamp', 'crown'][index % 4]));
  assert.equal(Core.specialComboClearSet(board, 0, 1, rows, cols), null);
}

// Move discovery must include a single-special swipe, otherwise hint/no-moves logic would break.
{
  const board = [
    cell('fish', 'lineH'), cell('dove'), cell('lamp'), cell('crown'),
    cell('bible'), cell('fish'), cell('dove'), cell('lamp'),
    cell('crown'), cell('bread'), cell('fish'), cell('dove'),
  ];
  const moves = Core.findMoves(board, rows, cols, null, Infinity);
  assert.ok(moves.some(([a, b]) => (a === 0 && b === 1) || (a === 1 && b === 0)));
}

console.log('Biblical Treasures V45 special swipe checks passed');
