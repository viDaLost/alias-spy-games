import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);
const Core = require(path.join(root, 'web/games/biblical-match-three-core.js'));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const ok = (value, message) => { if (!value) throw new Error(message); };

const data = JSON.parse(read('web/data/biblical_match_three_levels.json'));
ok(data.rows === 8 && data.cols === 8, '8-column default required');
ok(data.levels?.length === 30, '30 levels required');
const rowSet = new Set(data.levels.map((level) => Number(level.rows || data.rows)));
ok([5, 6, 7, 8].every((rows) => rowSet.has(rows)), 'varied 5/6/7/8-row levels required');
for (const level of data.levels) {
  const rows = Number(level.rows || data.rows);
  ok(rows >= 5 && rows <= 8, `level ${level.id} rows invalid`);
  for (const group of level.blockers || []) {
    for (const cell of group.cells || []) ok(Number(cell) >= 0 && Number(cell) < rows * data.cols, `level ${level.id} blocker ${cell} outside ${rows}x${data.cols}`);
  }
}

const core = read('web/games/biblical-match-three-core.js');
const runtime = read('web/games/biblical-match-three-v10-runtime.js');
const loader = read('web/games/biblical-match-three-v5-loader.js');
const effects = read('web/games/biblical-match-three-effects.js');
const game = read('web/games/biblical-match-three.js');
const ui15 = read('web/games/biblical-match-three-v15-ui.js');
const polish15 = read('web/games/biblical-match-three-v15-polish.js');
const css15 = read('web/styles/biblical-match-three-v15-polish.css');
const css21 = read('web/styles/biblical-match-three-v21-art.css');
const launcher = read('web/js/biblical-match-three-launcher.js');
const systemIcons = read('web/js/system-icons.js');
const androidMenu = read('web/js/android-download-menu.js');
const qrAddon = read('web/js/room-qr-addon.js');
const indexHtml = read('index.html');

ok(runtime.includes('TIMED_SECONDS = 90') && runtime.includes('setInterval(updateTimedHud, 500)'), 'timed mode / low-frequency timer missing');
ok(runtime.includes('nodeImportant') && runtime.includes('addedNodes') && !runtime.includes('attributeFilter: ["class"'), 'runtime observer must ignore animation attribute churn');
ok(loader.includes('kind:"file-webp-v17"') && loader.includes('transport:"file"') && loader.includes('icons-v17/ark.webp') && loader.includes('icons-v17/bible.webp'), 'V17 direct WebP loader missing');
ok(!loader.includes('canvas.toDataURL') && !loader.includes('canvas.toBlob') && !loader.includes('URL.createObjectURL'), 'V17 must use ordinary files instead of generated data/blob URLs');
ok(!loader.includes('hq-v5/atlas-') && !loader.includes('FALLBACK_BASE') && !loader.includes('safe-fallback'), 'legacy atlas/fallback still referenced');
ok(ui15.includes('window.__bmtV15UiInstalled') && ui15.includes('attachSwipe') && ui15.includes('fitBoardNow') && ui15.includes('bmt-v13-menu'), 'full-screen UI/swipe missing');
ok(!ui15.includes('ARK_URL') && !ui15.includes('patchArkImages'), 'UI must not override direct Ark art');
ok(polish15.includes('webp-v17') && polish15.includes('patchBoardPieces') && polish15.includes('patchBoosters'), 'V17 image patching missing');
ok(css15.includes('.bmt-tile.is-swapping') && css15.includes('overflow:visible!important') && css15.includes('contain:none!important'), 'swipe clipping fix missing');
ok(css15.includes('background:transparent!important') && css15.includes('webp-v17'), 'transparent direct-WebP tile style missing');
ok(effects.includes('function lowPower()') && effects.includes('count=Math.min(count,lowPower()?6:10)'), 'mobile FX throttling missing');
ok(game.includes('let ROWS = 8') && game.includes('resolveBoardRows') && game.includes('currentSymbolAsset'), 'variable board runtime missing');
ok(launcher.includes('isAllowedUser(){return true}') && launcher.includes('publicAccess:true') && !launcher.includes('ALLOWED_USER_ID') && !launcher.includes('removeMenuCard'), 'Public Biblical Treasures access wiring missing');
ok(launcher.includes('file-webp-v17') && launcher.includes('transport!=="file"'), 'V17 launcher must require direct WebP art');

const icons = ['ark', 'bible', 'bread', 'candle', 'chains', 'covenant', 'crown', 'dove', 'fish', 'grapes', 'jericho', 'score', 'sling', 'staff', 'tablets'];
for (const name of icons) ok(exists(`web/assets/biblical-match-three/icons-v17/${name}.webp`), `V17 ${name}.webp missing`);
for (const f of ['web/assets/biblical-match-three/hq-v5/atlas-00.txt', 'web/assets/biblical-match-three/hq-v5/atlas-10.txt', 'web/assets/biblical-match-three/hq-v5/symbols/fish.webp']) ok(!exists(f), `obsolete V16 art must be deleted: ${f}`);
for (const f of ['web/games/biblical-match-three-v15-ui.js', 'web/games/biblical-match-three-v15-polish.js', 'web/styles/biblical-match-three-v15-polish.css']) ok(exists(f), `${f} missing`);
ok(!exists('web/games/biblical-match-three-v14-raster-pack.js'), 'V14 low-quality raster pack must stay deleted');

const campaignSymbols = ['bible', 'fish', 'dove', 'lamp', 'crown', 'ark', 'bread', 'grapes', 'tablets'];
const levelShapes = {
  1:'rect',2:'rect',3:'oval',4:'bowl',5:'diamond',6:'oval',7:'cross',8:'bowl',9:'diamond',10:'cross',
  11:'shield',12:'oval',13:'diamond',14:'bowl',15:'cross',16:'shield',17:'cross',18:'diamond',19:'bowl',20:'shield',
  21:'diamond',22:'cross',23:'bowl',24:'diamond',25:'shield',26:'cross',27:'bowl',28:'diamond',29:'shield',30:'cross',
};
function maskFor(shape, rows, cols, level) {
  const mask = new Array(rows * cols).fill(true);
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const dx = Math.abs(col - cx);
      const dy = Math.abs(row - cy);
      let active = true;
      if (shape === 'oval') active = ((col - cx) / Math.max(1, cols * .53)) ** 2 + ((row - cy) / Math.max(1, rows * .57)) ** 2 <= 1;
      else if (shape === 'diamond') active = dx / Math.max(1, cols * .52) + dy / Math.max(1, rows * .55) <= 1;
      else if (shape === 'cross') active = dx <= 1.55 || dy <= 1.15;
      else if (shape === 'bowl') { const edge = dx / Math.max(1, cx); active = row >= Math.floor(edge * edge * Math.max(1, rows * .38)); }
      else if (shape === 'shield') { const t = rows <= 1 ? 0 : row / (rows - 1); const half = t < .42 ? cols * .46 : Math.max(1.35, cols * .46 - (t - .42) * cols * .52); active = dx <= half; }
      mask[row * cols + col] = active;
    }
  }
  for (const group of level.blockers || []) {
    for (const rawIndex of group.cells || []) {
      const index = Number(rawIndex);
      const row = Math.floor(index / cols);
      const col = index % cols;
      mask[index] = true;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) mask[nr * cols + nc] = true;
      }
    }
  }
  return mask;
}

for (const level of data.levels) {
  const required = [...new Set((level.goals || []).filter((goal) => goal.type === 'collect').map((goal) => goal.symbol))];
  let pool = campaignSymbols.slice(0, Math.max(3, Math.min(campaignSymbols.length, Number(level.symbolCount || 6))));
  for (const symbol of required) {
    if (pool.includes(symbol)) continue;
    let slot = -1;
    for (let i = pool.length - 1; i >= 0; i -= 1) if (!required.includes(pool[i])) { slot = i; break; }
    if (slot >= 0) pool[slot] = symbol; else pool.push(symbol);
  }
  for (const symbol of required) ok(pool.includes(symbol), `level ${level.id} target ${symbol} absent from symbol pool`);
  for (const goal of level.goals || []) {
    if (goal.type === 'clearBlockers') {
      const total = (level.blockers || []).filter((b) => b.type === goal.blocker).reduce((sum, b) => sum + (b.cells || []).length, 0);
      ok(total >= Number(goal.count || 0), `level ${level.id} blocker goal impossible`);
    }
    if (goal.type === 'lightLamps') {
      const total = (level.blockers || []).filter((b) => b.type === 'lamp').reduce((sum, b) => sum + (b.cells || []).length, 0);
      ok(total >= Number(goal.count || 0), `level ${level.id} lamp goal impossible`);
    }
  }
  const rows = Number(level.rows || data.rows);
  const mask = maskFor(levelShapes[level.id] || 'rect', rows, data.cols, level);
  ok(mask.filter(Boolean).length >= 24, `level ${level.id} shaped board too small`);
  for (const group of level.blockers || []) {
    for (const cell of group.cells || []) {
      const index = Number(cell), row = Math.floor(index / data.cols), col = index % data.cols;
      ok(mask[index], `level ${level.id} blocker placed in a hole`);
      const neighbors = [[-1,0],[1,0],[0,-1],[0,1]]
        .map(([dr, dc]) => [row + dr, col + dc])
        .filter(([r, c]) => r >= 0 && r < rows && c >= 0 && c < data.cols)
        .map(([r, c]) => r * data.cols + c);
      ok(neighbors.some((i) => mask[i]), `level ${level.id} blocker ${index} isolated by board shape`);
    }
  }
  for (let seed = 1; seed <= 12; seed += 1) {
    let s = seed + level.id * 997;
    const rng = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let playable = false;
    for (let attempt = 0; attempt < 30 && !playable; attempt += 1) {
      const board = Core.createBoard(rows, data.cols, pool, rng);
      board.forEach((_, i) => { if (!mask[i]) board[i] = null; });
      playable = Core.findMatches(board, rows, data.cols).length === 0
        && Core.findMoves(board, rows, data.cols, (a, b) => mask[a] && mask[b], 3).length >= 3
        && required.every((sym) => board.filter((cell) => cell?.type === sym).length >= 3);
    }
    ok(playable, `level ${level.id} seed ${seed} cannot produce playable shaped board`);
  }
}

ok(game.includes('getLevelSymbolSet') && game.includes('LEVEL_SHAPES') && game.includes('createPlayableBoard') && game.includes('freeChallengeConfig'), 'V18 campaign rules missing');
ok(game.includes('moves: 30') && game.includes('rows: 7') && game.includes('rows: 8'), 'V18 free board sizing/move limits missing');
ok(game.includes('is-blocker-breaking') && css15.includes('bmt-v18-blocker-break'), 'V18 obstacle animation missing');
ok(game.includes('currentBlockerAsset') && game.includes('bmt-blocker-art') && game.includes('data-blocker-type=\"chain\"'), 'V19 obstacle WebP markup missing');
ok(core.includes('function findMoves') && typeof Core.findMoves === 'function', 'V20 move enumeration missing');
ok(game.includes('const MIN_START_MOVES = 3') && game.includes('function finishIfNoMoves()') && game.includes('countPlayableMoves(runtime.board, 1) !== 0') && game.includes('finishLevel(false, \"noMoves\")') && game.includes('openFreeExit(\"noMoves\")') && game.includes('checkDeadBoard:finishIfNoMoves'), 'V20 start/dead-board rules missing');
ok(!game.includes('Поле перемешано — появился новый доступный ход'), 'automatic dead-board reshuffle must stay removed');
ok(css15.includes('V19: obstacle artwork') && css15.includes('.bmt-blocker-art') && css15.includes('.bmt-blocker__layers'), 'V19 visible obstacle styling missing');
ok(css15.includes('V20: a lit lamp') && css15.includes('.bmt-tile.is-lamp-lit .bmt-blocker-art{display:none!important') && css15.includes('animation:none!important'), 'V20 lit-lamp settle styling missing');
ok(css15.includes('.bmt-tile.is-hole') && css15.includes('width:62px'), 'V18 shaped board/free icon polish missing');

const v21Assets = ['web/assets/icons/biblical-treasures-v38.png', 'web/assets/icons/support.webp', 'web/assets/icons/android-download.webp', 'web/assets/icons/qr-scanner.webp', 'web/assets/icons/admin.webp', 'web/assets/biblical-match-three/board-background-v35.webp'];
for (const f of v21Assets) ok(exists(f), `V21 artwork missing: ${f}`);
ok(launcher.includes('MENU_ICON'), 'V21 Biblical menu artwork wiring missing');
ok(css21.includes('board-background-v35.webp') && css21.includes('.bmt-board-wrap') && css21.includes('.bmt-board'), 'current board background styling missing');
ok(systemIcons.includes('support.webp') && systemIcons.includes('admin.webp') && !systemIcons.includes('<svg'), 'V21 support/admin artwork wiring missing');
ok(androidMenu.includes('android-download.webp') && !androidMenu.includes('<svg'), 'V21 Android artwork wiring missing');
ok(qrAddon.includes('qr-scanner.webp'), 'V21 QR artwork wiring missing');
ok(indexHtml.includes('biblical-match-three-launcher.js?v=42') && indexHtml.includes('system-icons.js?v=22') && indexHtml.includes('android-download-menu.js?v=24') && indexHtml.includes('room-qr-addon.js?v=4'), 'current cache bust wiring missing');

const v22Assets = ['web/assets/icons/biblical-treasures-v38.png', 'web/assets/icons/support.webp', 'web/assets/icons/android-download.webp', 'web/assets/icons/admin.webp', 'web/assets/biblical-match-three/board-background-v35.webp'];
for (const f of v22Assets) ok(exists(f), `V22 artwork missing: ${f}`);
ok(indexHtml.includes('v22-home-art.js?v=39') && indexHtml.includes('v22-game-loader.js?v=41'), 'current UI loader wiring missing');

const syms = ['bible', 'fish', 'dove', 'lamp', 'crown', 'ark'];
for (const rows of [5, 6, 7, 8]) {
  for (let seed = 1; seed <= 30; seed += 1) {
    let s = seed + rows * 101;
    const rng = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const board = Core.createBoard(rows, 8, syms, rng);
    ok(board.length === rows * 8 && Core.findMatches(board, rows, 8).length === 0 && Core.findMoves(board, rows, 8, null, 3).length >= 3, `${rows}x8 seed ${seed} has fewer than 3 starting moves`);
  }
}

console.log('OK: Biblical Treasures V22 artwork/UI wiring + V20 gameplay checks passed');
