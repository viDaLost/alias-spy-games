import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(import.meta.url);
const Core = require(path.join(root, 'web/games/biblical-match-three-core.js'));
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function mulberry32(seed) {
let a = seed >>> 0;
return () => {
a |= 0; a = (a + 0x6D2B79F5) | 0;
let t = Math.imul(a ^ (a >>> 15), 1 | a);
t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
}
const levelFile = JSON.parse(read('web/data/biblical_match_three_levels.json'));
const levels = levelFile.levels;
assert(levelFile.rows === 8 && levelFile.cols === 8, 'Campaign file must use an 8x8 board');
assert(Array.isArray(levels) && levels.length === 10, 'Campaign must contain exactly 10 levels');
for (const [index, level] of levels.entries()) {
assert(level.id === index + 1, `Level ${index + 1} has wrong id`);
assert(level.moves >= 10 && level.targetScore > 0, `Level ${index + 1} has invalid goals`);
assert(level.collect && Object.keys(level.collect).length >= 1, `Level ${index + 1} must have collection goals`);
}
const symbolDir = path.join(root, 'web/assets/biblical-match-three');
const svgNames = fs.readdirSync(symbolDir).filter((name) => name.endsWith('.svg')).sort();
const expected = ['ark.svg','bible.svg','bread.svg','crown.svg','dove.svg','fish.svg','grapes.svg','lamp.svg','tablets.svg'];
assert(JSON.stringify(svgNames) === JSON.stringify(expected), `Expected exactly 9 Biblical SVG symbols, got: ${svgNames.join(', ')}`);
for (const name of svgNames) {
const svg = read(`web/assets/biblical-match-three/${name}`);
assert(svg.includes('<svg') && svg.includes('viewBox='), `${name} is not a self-contained SVG`);
}
const symbols = ['bible','fish','dove','lamp','crown','ark','bread','grapes','tablets'];
for (let seed = 1; seed <= 80; seed += 1) {
const board = Core.createBoard(8, 8, symbols.slice(0, 6 + (seed % 4)), mulberry32(seed));
assert(board.length === 64, `Generated board ${seed} is not 8x8`);
assert(Core.findMatches(board, 8, 8).length === 0, `Generated board ${seed} starts with a match`);
assert(Core.findHint(board, 8, 8), `Generated board ${seed} has no legal move`);
const hint = Core.findHint(board, 8, 8);
const swapped = Core.swap(board, hint[0], hint[1]);
assert(Core.findMatches(swapped, 8, 8).length >= 3, `Hint ${seed} does not create a match`);
}
const game = read('web/games/biblical-match-three.js');
const launcher = read('web/js/biblical-match-three-launcher.js');
const css = read('web/styles/biblical-match-three.css');
const index = read('index.html');
const models = read('android-app/app/src/main/java/com/vidalost/biblegames/model/Models.kt');
const host = read('android-app/app/src/main/java/com/vidalost/biblegames/games/GameHost.kt');
const nativeGame = read('android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeGame.kt');
assert(game.includes('ROWS = 8') && game.includes('COLS = 8'), 'Web game must use an 8x8 board');
assert(game.includes('rainbow') && game.includes('burst') && game.includes('lineH'), 'Web game special pieces are missing');
assert(game.includes('FREE_MODES') && game.includes('hard'), 'Free mode difficulties are missing');
assert(game.includes('Hint') || game.includes('hint'), 'Hint control is missing');
assert(game.includes('shuffle') || game.includes('Перемешать'), 'Shuffle control is missing');
assert(css.includes('grid-template-columns: repeat(8'), 'Responsive 8-column board style is missing');
assert(launcher.includes('biblical-match-three-core.js') && launcher.includes('biblical_match_three_levels.json'), 'Launcher does not load restored game files');
assert(index.includes('biblical-match-three-launcher.js'), 'Root index does not load the match-three launcher');
assert(models.includes('MATCH_THREE(') && models.includes('"biblical-match-three"'), 'Android GameKey is missing');
assert(host.includes('GameKey.MATCH_THREE -> BiblicalMatchThreeGame(onBack)'), 'Android GameHost route is missing');
assert(nativeGame.includes('fun BiblicalMatchThreeGame') && nativeGame.includes('NativeDifficulty'), 'Native Android game is missing');
assert(nativeGame.includes('NativeSpecial.LINE') && nativeGame.includes('NativeSpecial.BURST') && nativeGame.includes('NativeSpecial.RAINBOW'), 'Native Android special pieces are missing');
console.log(`Biblical match-three checks passed: ${levels.length} levels, ${svgNames.length} SVG symbols, 80 playable-board seeds, web + Android integration.`);