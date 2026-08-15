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
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const levelFile = JSON.parse(read('web/data/biblical_match_three_levels.json'));
const levels = levelFile.levels;
assert(levelFile.version === 2, 'Campaign data must use v2 schema');
assert(levelFile.rows === 8 && levelFile.cols === 8, 'Campaign file must use an 8x8 board');
assert(Array.isArray(levels) && levels.length === 30, 'V2 campaign must contain exactly 30 levels');

const goalTypes = new Set();
const blockerTypes = new Set();
for (const [index, level] of levels.entries()) {
  assert(level.id === index + 1, `Level ${index + 1} has wrong id`);
  assert(typeof level.chapter === 'string' && level.chapter.length >= 3, `Level ${level.id} is missing chapter`);
  assert(level.moves >= 18 && level.moves <= 28, `Level ${level.id} has invalid move count`);
  assert(level.symbolCount >= 6 && level.symbolCount <= 9, `Level ${level.id} has invalid symbol count`);
  assert(Array.isArray(level.goals) && level.goals.length >= 2 && level.goals.length <= 4, `Level ${level.id} must have 2-4 goals`);
  assert(Array.isArray(level.starThresholds) && level.starThresholds.length === 3, `Level ${level.id} must have 3 star thresholds`);
  assert(level.starThresholds[0] > 0 && level.starThresholds[0] < level.starThresholds[1] && level.starThresholds[1] < level.starThresholds[2], `Level ${level.id} star thresholds must increase`);
  assert(Number(level.reward) >= 5, `Level ${level.id} reward is too small`);

  for (const goal of level.goals) {
    goalTypes.add(goal.type);
    assert(Number(goal.count) > 0, `Level ${level.id} has non-positive goal`);
    if (goal.type === 'collect') assert(typeof goal.symbol === 'string', `Level ${level.id} collection goal has no symbol`);
    if (goal.type === 'clearBlockers') assert(['tablet','chain'].includes(goal.blocker), `Level ${level.id} blocker goal is invalid`);
  }

  for (const group of level.blockers || []) {
    blockerTypes.add(group.type);
    assert(['tablet','chain','lamp'].includes(group.type), `Level ${level.id} has unknown blocker ${group.type}`);
    assert(Array.isArray(group.cells) && group.cells.length > 0, `Level ${level.id} blocker group is empty`);
    assert(Number(group.layers || 1) >= 1 && Number(group.layers || 1) <= 3, `Level ${level.id} blocker layers are invalid`);
    for (const cell of group.cells) assert(Number.isInteger(cell) && cell >= 0 && cell < 64, `Level ${level.id} blocker cell ${cell} is outside the board`);
  }
}

for (const type of ['score','collect','clearBlockers','lightLamps','activateSpecials','cascade']) {
  assert(goalTypes.has(type), `Campaign does not exercise goal type ${type}`);
}
for (const type of ['tablet','chain','lamp']) assert(blockerTypes.has(type), `Campaign does not exercise blocker ${type}`);

const symbolDir = path.join(root, 'web/assets/biblical-match-three');
const svgNames = fs.readdirSync(symbolDir).filter((name) => name.endsWith('.svg')).sort();
const expected = ['ark.svg','bible.svg','bread.svg','crown.svg','dove.svg','fish.svg','grapes.svg','lamp.svg','tablets.svg'];
assert(expected.every((name) => svgNames.includes(name)), `Missing Biblical SVG symbols: ${expected.filter((name) => !svgNames.includes(name)).join(', ')}`);
for (const name of expected) {
  const svg = read(`web/assets/biblical-match-three/${name}`);
  assert(svg.includes('<svg') && svg.includes('viewBox='), `${name} is not a self-contained SVG`);
}

const symbols = ['bible','fish','dove','lamp','crown','ark','bread','grapes','tablets'];
for (let seed = 1; seed <= 120; seed += 1) {
  const board = Core.createBoard(8, 8, symbols.slice(0, 6 + (seed % 4)), mulberry32(seed));
  assert(board.length === 64, `Generated board ${seed} is not 8x8`);
  assert(Core.findMatches(board, 8, 8).length === 0, `Generated board ${seed} starts with a match`);
  const hint = Core.findHint(board, 8, 8);
  assert(hint, `Generated board ${seed} has no legal move`);
  const swapped = Core.swap(board, hint[0], hint[1]);
  assert(Core.findMatches(swapped, 8, 8).length >= 3, `Hint ${seed} does not create a match`);
}

{
  const board = Core.createBoard(8, 8, symbols.slice(0, 6), mulberry32(9001));
  board[8].special = 'lineH';
  board[9].special = 'lineV';
  const combo = Core.specialComboClearSet(board, 8, 9, 8, 8);
  assert(combo?.combo === 'doubleLine' && combo.clearSet.size >= 15, 'Line + line combo is broken');
  board[18].special = 'burst';
  board[19].special = 'burst';
  const bursts = Core.specialComboClearSet(board, 18, 19, 8, 8);
  assert(bursts?.combo === 'doubleBurst' && bursts.clearSet.size >= 20, 'Burst + burst combo is broken');
  board[28].special = 'rainbow';
  board[29].special = 'rainbow';
  const rainbow = Core.specialComboClearSet(board, 28, 29, 8, 8);
  assert(rainbow?.combo === 'doubleRainbow' && rainbow.clearSet.size === 64, 'Rainbow + rainbow must clear the whole board');
}

const game = read('web/games/biblical-match-three.js');
const progress = read('web/games/biblical-match-three-progress.js');
const effects = read('web/games/biblical-match-three-effects.js');
const launcher = read('web/js/biblical-match-three-launcher.js');
const css = read('web/styles/biblical-match-three-v2.css');
const index = read('index.html');
const models = read('android-app/app/src/main/java/com/vidalost/biblegames/model/Models.kt');
const host = read('android-app/app/src/main/java/com/vidalost/biblegames/games/GameHost.kt');
const nativeGame = read('android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeGame.kt');

assert(game.includes('Праща Давида') && game.includes('Посох Моисея') && game.includes('Трубы Иерихона') && game.includes('Ноев ковчег'), 'Biblical in-level boosters are missing');
assert(game.includes('Манна с небес') && game.includes('Масло светильника') && game.includes('Радуга Завета'), 'Biblical pre-level boosters are missing');
assert(game.includes('FREE_MODES') && game.includes('persistFreeRecord'), 'Free mode records are missing');
assert(game.includes('clearBlockers') && game.includes('lightLamps') && game.includes('activateSpecials'), 'Diverse campaign goals are missing');
assert(progress.includes('bible_stars_v1_') && progress.includes('spendStars') && progress.includes('recordFree'), 'Match-three is not connected to the shared app star wallet');
assert(progress.includes('claimDaily'), 'Daily star reward is missing');
assert(effects.includes('particleBurst') && effects.includes('beam') && effects.includes('celebrate'), 'Animation/effects layer is incomplete');
assert(css.includes('grid-template-columns:repeat(8') && css.includes('@keyframes bmt-swap') && css.includes('@keyframes bmt-drop'), 'V2 board or smooth motion styles are missing');
assert(css.includes('.bmt-map-node') && css.includes('.bmt-booster-tray') && css.includes('.bmt-result-card'), 'V2 product UI styles are missing');
assert(launcher.includes('biblical-match-three-progress.js') && launcher.includes('biblical-match-three-effects.js') && launcher.includes('biblical-match-three-v2.css'), 'Launcher does not load v2 modules/styles');
assert(index.includes('biblical-match-three-launcher.js'), 'Root index does not load match-three launcher');
assert(models.includes('MATCH_THREE(') && models.includes('"biblical-match-three"'), 'Android GameKey is missing');
assert(host.includes('GameKey.MATCH_THREE -> BiblicalMatchThreeGame(onBack)'), 'Android GameHost route is missing');
assert(nativeGame.includes('fun BiblicalMatchThreeGame') && nativeGame.includes('NativeDifficulty'), 'Native Android game is missing');

console.log(`Biblical match-three v2 checks passed: ${levels.length} varied levels, ${goalTypes.size} goal types, ${blockerTypes.size} blocker types, shared star wallet, Biblical boosters, special combos, 120 playable-board seeds.`);
