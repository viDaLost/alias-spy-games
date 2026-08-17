import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const bytes = (p) => fs.readFileSync(path.join(root, p));
const exists = (p) => fs.existsSync(path.join(root, p));
const ok = (value, message) => { if (!value) throw new Error(message); };

const WEBP = (p) => {
  const b = bytes(p);
  return b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP';
};
const AVIF = (p) => {
  const b = bytes(p);
  return b.length > 12 && b.subarray(4, 12).toString('ascii') === 'ftypavif';
};

const required = [
  'web/assets/icons/biblical-treasures.webp',
  'web/assets/biblical-match-three/board-background-v29.webp',
  'web/assets/biblical-match-three/completion-1-star-v29.webp',
  'web/assets/biblical-match-three/completion-2-stars-v29.webp',
  'web/assets/biblical-match-three/completion-3-stars-v29.avif',
  'web/assets/biblical-match-three/icons-v29/lamp-unlit.webp',
  'web/assets/biblical-match-three/icons-v17/candle.webp',
];
for (const file of required) ok(exists(file), `V29 asset missing: ${file}`);
for (const file of required.filter((f) => f.endsWith('.webp'))) ok(WEBP(file), `V29 WebP has invalid bytes: ${file}`);
ok(AVIF('web/assets/biblical-match-three/completion-3-stars-v29.avif'), 'V29 three-star AVIF has invalid bytes');

const index = read('index.html');
const loader = read('web/js/v22-game-loader.js');
const home = read('web/js/v22-home-art.js');
const result = read('web/js/v23-biblical-treasures-polish.js');
const board = read('web/js/v24-biblical-treasures-board.js');
const boardCss = read('web/styles/biblical-match-three-v24-board.css');
const artCss = read('web/styles/biblical-match-three-v21-art.css');
const hotfix = read('web/js/v29-biblical-treasures-hotfix.js');
const launcher = read('web/js/biblical-match-three-launcher.js');
const levels = JSON.parse(read('web/data/biblical_match_three_levels.json'));

ok(levels.levels?.length === 30, 'Biblical Treasures must keep 30 levels');
ok(levels.levels.some((level) => (level.blockers || []).some((group) => group.type === 'lamp')), 'Lamp levels missing');
ok(index.includes('biblical-match-three-launcher.js?v=29') && index.includes('v22-game-loader.js?v=29') && index.includes('v24-biblical-treasures-board.js?v=29') && index.includes('v29-biblical-treasures-hotfix.js?v=29'), 'V29 index cache-bust wiring missing');
ok(!index.includes('v27-biblical-treasures-hotfix.js'), 'V27 hotfix must not be loaded');
ok(loader.includes('v29-biblical-treasures-hotfix.js') && loader.includes('v24-biblical-treasures-board.js'), 'V29 game loader wiring missing');
ok(home.includes("BIBLICAL_VERSION = '29'") && home.includes('biblical-treasures.webp'), 'V29 menu icon patch missing');
ok(result.includes('completion-1-star-v29.webp') && result.includes('completion-2-stars-v29.webp') && result.includes('completion-3-stars-v29.avif') && result.includes('dataset.resultStars'), 'V29 star-specific completion art wiring missing');
ok(board.includes('icons-v29/lamp-unlit.webp') && board.includes('icons-v17/candle.webp') && board.includes('data-blocker-lit'), 'V29 extinguished/lit lamp art wiring missing');
ok(boardCss.includes('board-background-v29.webp') && boardCss.includes('.bmt-tile.has-lamp .bmt-piece-wrap') && boardCss.includes('visibility:hidden!important'), 'V29 board background / standalone lamp styling missing');
ok(artCss.includes('board-background-v29.webp'), 'V29 board fallback background missing');
ok(hotfix.includes('__bmtV29HotfixInstalled') && hotfix.includes('sourceLamp') && hotfix.includes("target?.classList.contains('has-lamp')") && hotfix.includes("document.addEventListener('pointerdown'") && hotfix.includes("document.addEventListener('pointerup'"), 'V29 lamp swipe guard missing');
ok(hotfix.includes('biblical-treasures.webp') && hotfix.includes("VERSION = '29'"), 'V29 menu hotfix missing');
ok(launcher.includes('ALLOWED_USER_ID="1288379477"') && launcher.includes('5693086211') && launcher.includes('5502223852') && launcher.includes('MENU_ICON'), 'Biblical Treasures access/menu launcher gate changed unexpectedly');

for (const obsolete of [
  'web/js/v27-biblical-treasures-hotfix.js',
  'web/assets/biblical-match-three/board-background-v28.avif',
  'web/assets/biblical-match-three/completion-1-star-v28.webp',
  'web/assets/biblical-match-three/completion-2-stars-v28.webp',
  'web/assets/biblical-match-three/completion-3-stars-v28.avif',
  'web/assets/biblical-match-three/icons-v28/lamp-unlit.webp',
]) ok(!exists(obsolete), `Obsolete Biblical Treasures asset must be removed: ${obsolete}`);

for (const file of [
  'web/js/v22-game-loader.js',
  'web/js/v22-home-art.js',
  'web/js/v23-biblical-treasures-polish.js',
  'web/js/v24-biblical-treasures-board.js',
  'web/js/v29-biblical-treasures-hotfix.js',
]) {
  const check = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  ok(check.status === 0, `JS syntax failed: ${file}\n${check.stderr || ''}`);
}

console.log('OK: Biblical Treasures V29 art, board background, menu icon, standalone lamps and swipe guards are wired correctly');
