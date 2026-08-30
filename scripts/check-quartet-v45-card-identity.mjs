import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { isBundled } from './web-sources.mjs';

const catalog = JSON.parse(fs.readFileSync('web/data/quartet_bible.json', 'utf8'));
const source = fs.readFileSync('web/js/quartet-v45-card-id-fix.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

const byTitle = new Map();
for (const quartet of catalog.quartets || []) {
  for (const card of quartet.cards || []) {
    const list = byTitle.get(card.title) || [];
    list.push({ quartetId: quartet.id, cardId: card.id });
    byTitle.set(card.title, list);
  }
}

assert.deepEqual(byTitle.get('Иоанн')?.map((item) => item.cardId).sort(), ['apostles_john', 'evangelists_john']);
assert.deepEqual(byTitle.get('Иаков')?.map((item) => item.cardId).sort(), ['apostles_james', 'patriarchs_jacob']);
assert.ok(isBundled('web/js/quartet-v45-card-id-fix.js'), 'card identity fix must ship in the bundle');
assert.match(source, /qv2-group-/);
assert.match(source, /document\.addEventListener\('click', repairBeforeSelection, true\)/);

const listeners = new Map();
const root = { querySelectorAll: () => [] };
const document = {
  body: {},
  getElementById: (id) => id === 'qv2-root' ? root : null,
  querySelectorAll: () => [],
  addEventListener: (type, fn, capture) => listeners.set(`${type}:${capture === true}`, fn),
};
class MutationObserver { observe() {} }

const context = {
  console,
  document,
  MutationObserver,
  requestAnimationFrame: (fn) => { fn(); return 1; },
  fetch: async () => ({ ok: true, json: async () => catalog }),
  addEventListener: () => {},
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'quartet-v45-card-id-fix.js' });
await new Promise((resolve) => setTimeout(resolve, 0));

const clickCapture = listeners.get('click:true');
assert.equal(typeof clickCapture, 'function');

function makeMissingCard(quartetId, title, initialCardId) {
  const group = { id: `qv2-group-${quartetId}` };
  const button = {
    dataset: { cardId: initialCardId },
    matches: (selector) => selector === 'button.qv2-playing-card.is-missing',
    closest: (selector) => selector.startsWith('.qv2-quartet-card') ? group : null,
    querySelector: (selector) => selector === '.qv2-playing-card-title' ? { textContent: title } : null,
  };
  return button;
}

const apostleJohn = makeMissingCard('apostles', 'Иоанн', 'evangelists_john');
clickCapture({ target: { closest: () => apostleJohn } });
assert.equal(apostleJohn.dataset.cardId, 'apostles_john');
assert.equal(apostleJohn.dataset.qv45CardIdentity, 'repaired');

const evangelistJohn = makeMissingCard('evangelists', 'Иоанн', 'apostles_john');
clickCapture({ target: { closest: () => evangelistJohn } });
assert.equal(evangelistJohn.dataset.cardId, 'evangelists_john');

const apostleJames = makeMissingCard('apostles', 'Иаков', 'patriarchs_jacob');
clickCapture({ target: { closest: () => apostleJames } });
assert.equal(apostleJames.dataset.cardId, 'apostles_james');

assert.equal(context.QuartetV45CardIdentity.resolveCardId('patriarchs', 'Иаков'), 'patriarchs_jacob');
console.log('Quartet V45 card identity checks passed: duplicate titles resolve by quartet + title.');
