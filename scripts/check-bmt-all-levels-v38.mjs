import fs from 'node:fs';
import vm from 'node:vm';

const levels = JSON.parse(fs.readFileSync('web/data/biblical_match_three_levels.json', 'utf8')).levels;
const source = fs.readFileSync('web/games/biblical-match-three-core.js', 'utf8');
const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(source, context);
const Core = context.BiblicalMatchThreeCore;
const COLS = 8;
const SYMBOLS = ['bible', 'fish', 'dove', 'lamp', 'crown', 'ark', 'bread', 'grapes', 'tablets'];
const SHAPES = {1:'rect',2:'rect',3:'oval',4:'bowl',5:'diamond',6:'oval',7:'cross',8:'bowl',9:'diamond',10:'cross',11:'shield',12:'oval',13:'diamond',14:'bowl',15:'cross',16:'shield',17:'cross',18:'diamond',19:'bowl',20:'shield',21:'diamond',22:'cross',23:'bowl',24:'diamond',25:'shield',26:'cross',27:'bowl',28:'diamond',29:'shield',30:'cross'};

function assert(value, message) { if (!value) throw new Error(message); }
function requiredSymbols(level) { return [...new Set(level.goals.filter(goal => goal.type === 'collect').map(goal => goal.symbol))]; }
function symbolPool(level) {
  const required = requiredSymbols(level);
  const pool = SYMBOLS.slice(0, Math.max(3, Math.min(SYMBOLS.length, Number(level.symbolCount || 6))));
  for (const symbol of required) {
    if (pool.includes(symbol)) continue;
    const slot = pool.findLastIndex(item => !required.includes(item));
    if (slot >= 0) pool[slot] = symbol;
    else pool.push(symbol);
  }
  return [...new Set(pool)];
}
function maskFor(level) {
  const rows = level.rows;
  const shape = SHAPES[level.id] || 'rect';
  const mask = new Array(rows * COLS).fill(true);
  const cx = (COLS - 1) / 2, cy = (rows - 1) / 2;
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < COLS; col += 1) {
    const dx = Math.abs(col - cx), dy = Math.abs(row - cy); let active = true;
    if (shape === 'oval') active = ((col-cx)/Math.max(1,COLS*.53))**2 + ((row-cy)/Math.max(1,rows*.57))**2 <= 1;
    else if (shape === 'diamond') active = dx/Math.max(1,COLS*.52) + dy/Math.max(1,rows*.55) <= 1;
    else if (shape === 'cross') active = dx <= 1.55 || dy <= 1.15;
    else if (shape === 'bowl') active = row >= Math.floor((dx/Math.max(1,cx))**2 * Math.max(1,rows*.38));
    else if (shape === 'shield') { const t = rows <= 1 ? 0 : row/(rows-1); const half = t < .42 ? COLS*.46 : Math.max(1.35,COLS*.46-(t-.42)*COLS*.52); active = dx <= half; }
    mask[row*COLS+col] = active;
  }
  for (const group of level.blockers || []) for (const raw of group.cells || []) {
    const index = Number(raw); mask[index] = true;
    const row = Math.floor(index/COLS), col = index%COLS;
    for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) { const nr=row+dr,nc=col+dc; if(nr>=0&&nr<rows&&nc>=0&&nc<COLS) mask[nr*COLS+nc]=true; }
  }
  return mask;
}
function generate(level, mask) {
  const pool = symbolPool(level), required = requiredSymbols(level);
  for (let attempt = 0; attempt < 360; attempt += 1) {
    const board = Core.createBoard(level.rows, COLS, pool);
    board.forEach((_, index) => { if (!mask[index]) board[index] = null; });
    const enoughRequired = required.every(symbol => board.filter(cell => cell?.type === symbol).length >= 3);
    const moves = Core.findMoves(board, level.rows, COLS, (a,b) => mask[a] && mask[b], 3);
    if (enoughRequired && !Core.findMatches(board, level.rows, COLS).length && moves.length >= 3) return board;
  }
  return null;
}
function seedGoalSpecials(level, board, mask) {
  const goal = level.goals.find(item => item.type === 'activateSpecials');
  if (!goal) return 0;
  const blockers = new Set((level.blockers || []).flatMap(group => group.cells || []).map(Number));
  const target = Math.min(10, Math.ceil(Math.max(2, Number(goal.count || 0)) / 2) * 2);
  const used = new Set(); let placed = 0;
  const available = index => mask[index] && board[index] && !board[index].special && !blockers.has(index) && !used.has(index);
  const pairs = [];
  for (let row = 0; row < level.rows; row += 1) for (let col = 0; col < COLS - 1; col += 1) pairs.push([row * COLS + col, row * COLS + col + 1]);
  for (let col = 0; col < COLS; col += 1) for (let row = 0; row < level.rows - 1; row += 1) pairs.push([row * COLS + col, (row + 1) * COLS + col]);
  for (const [a, b] of pairs) {
    if (placed >= target) break;
    if (!available(a) || !available(b)) continue;
    board[a].special = 'lineH'; board[b].special = 'lineV'; used.add(a); used.add(b); placed += 2;
  }
  return placed;
}

assert(levels.length === 30, 'Expected 30 campaign levels');
for (const [offset, level] of levels.entries()) {
  assert(level.id === offset + 1, `Level ids are not continuous at ${level.id}`);
  assert(level.rows >= 5 && level.rows <= 8, `Level ${level.id}: invalid row count`);
  assert(level.moves >= 20, `Level ${level.id}: too few moves for a campaign level`);
  const mask = maskFor(level);
  assert(mask.filter(Boolean).length >= 24, `Level ${level.id}: fewer than 24 active cells`);
  const occupied = new Set();
  for (const group of level.blockers || []) for (const index of group.cells || []) {
    assert(index >= 0 && index < level.rows * COLS, `Level ${level.id}: blocker outside the board`);
    assert(!occupied.has(index), `Level ${level.id}: overlapping blockers at ${index}`);
    occupied.add(index);
  }
  for (const goal of level.goals) {
    assert(goal.count > 0, `Level ${level.id}: non-positive goal`);
    if (goal.type === 'collect') assert(symbolPool(level).includes(goal.symbol), `Level ${level.id}: required symbol is unavailable`);
    if (goal.type === 'clearBlockers') {
      const available = (level.blockers || []).filter(group => group.type === goal.blocker).flatMap(group => group.cells).length;
      assert(available >= goal.count, `Level ${level.id}: blocker goal ${goal.count} exceeds ${available}`);
    }
    if (goal.type === 'lightLamps') {
      const available = (level.blockers || []).filter(group => group.type === 'lamp').flatMap(group => group.cells).length;
      assert(available >= goal.count, `Level ${level.id}: lamp goal ${goal.count} exceeds ${available}`);
    }
    if (goal.type === 'collect') assert(goal.count <= level.moves * 2, `Level ${level.id}: collect target is outside the conservative move budget`);
    if (goal.type === 'score') assert(goal.count <= level.moves * 400, `Level ${level.id}: score target is outside the conservative move budget`);
    if (goal.type === 'activateSpecials') assert(goal.count <= Math.ceil(level.moves / 3), `Level ${level.id}: special target is too aggressive`);
  }
  for (let sample = 0; sample < 120; sample += 1) {
    const board = generate(level, mask);
    assert(board, `Level ${level.id}: could not generate a playable board (sample ${sample + 1})`);
    const specialGoal = level.goals.find(goal => goal.type === 'activateSpecials');
    if (specialGoal) {
      const seeded = seedGoalSpecials(level, board, mask);
      const comboMoves = Core.findMoves(board, level.rows, COLS, (a,b) => mask[a] && mask[b]).filter(([a,b]) => Core.specialComboClearSet(board, a, b, level.rows, COLS)).length;
      assert(seeded >= specialGoal.count, `Level ${level.id}: only ${seeded}/${specialGoal.count} guaranteed special pieces`);
      assert(comboMoves >= Math.ceil(specialGoal.count / 2), `Level ${level.id}: not enough immediately activatable special pairs`);
    }
  }
}
console.log(`OK: all ${levels.length} Biblical Treasures levels passed structural, goal-budget, special-goal and 3-starting-moves checks (3,600 boards)`);
