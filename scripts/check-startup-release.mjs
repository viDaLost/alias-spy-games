import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { scriptSources, adminScriptSources } from './web-sources.mjs';

const read = (file) => fs.readFileSync(file, 'utf8');
// A failed lazy download must be retryable, and concurrent opens share a request.
const scripts = [];
const sandbox = { window: {}, document: {
  createElement: () => ({ remove() { this.removed = true; } }),
  head: { appendChild(script) { scripts.push(script); } },
} };
vm.runInNewContext(read('web/js/admin-loader.js'), sandbox);
const first = sandbox.window.loadAdminFeatures();
assert.equal(first, sandbox.window.loadAdminFeatures());
assert.equal(scripts.length, 1);
const rejection = assert.rejects(first);
scripts[0].onerror();
await rejection;
assert.equal(scripts[0].removed, true);
const second = sandbox.window.loadAdminFeatures();
assert.equal(scripts.length, 2);
scripts[1].onload();
await second;
assert.equal(second, sandbox.window.loadAdminFeatures());
for (const file of adminScriptSources) assert.ok(!scriptSources.includes(file));
assert.ok(scriptSources.includes('web/js/admin-live-modal-safety.js'));

// Exercise the real shaped-board shuffle with null cells, specials and a relic.
// Expose only this private function in the test VM; production API stays unchanged.
const gameContext = vm.createContext({ window: { addEventListener() {}, BiblicalMatchThreeProgress: {} } });
vm.runInContext(read('web/games/biblical-match-three-core.js'), gameContext);
gameContext.window.BiblicalMatchThreeCore = gameContext.BiblicalMatchThreeCore;
const game = read('web/games/biblical-match-three.js');
vm.runInContext(game.replace('window.startBiblicalMatchThreeGame = start;', `
window.testShuffle = (state) => { runtime = state; return reshufflePlayable(); };
window.startBiblicalMatchThreeGame = start;`), gameContext);
vm.runInContext(`
const mask = Array.from({length:64}, (_, i) => ![0,1,6,7,56,57,62,63].includes(i));
const board = Array.from({length:64}, (_, i) => mask[i] ? {type:['bible','fish','dove','lamp','crown'][i % 5],special:null} : null);
board[10] = {type:'relic-1', relic:true, special:null};
board[20].special = 'lineH';
board[30].special = 'burst';
const originalMap = Array.prototype.map;
const shuffled = window.testShuffle({mode:'free', board, symbolIds:['bible','fish','dove','lamp','crown'], activeMask:mask});
globalThis.result = { holes: shuffled.filter(cell => cell === null).length, relic: shuffled[10].relic,
 specials: shuffled.filter(cell => cell?.special).map(cell => cell.special).sort().join(','), unchanged: originalMap === Array.prototype.map };
`, gameContext);
assert.equal(gameContext.result.holes, 8);
assert.equal(gameContext.result.relic, true);
assert.equal(gameContext.result.specials, 'burst,lineH');
assert.equal(gameContext.result.unchanged, true);
assert.doesNotMatch(read('web/js/v29-biblical-treasures-hotfix.js'), /Array\.prototype\.map\s*=/);
console.log('Startup release: lazy retry/deduplication, bundle separation and null-safe shaped shuffle passed.');
