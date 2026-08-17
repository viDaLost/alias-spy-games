import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const sourcePath = path.join(root, 'scripts/check-biblical-match-three.mjs');
const tempPath = path.join(root, 'scripts/.check-biblical-match-three-v27.tmp.mjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const start = source.indexOf('const v21Assets =');
const end = source.indexOf('const syms =', start);
if (start < 0 || end < 0) throw new Error('Legacy Biblical Treasures artwork-check section not found');

const currentChecks = `const currentAssets = [
  'web/assets/icons/biblical-treasures.webp',
  'web/assets/icons/support.webp',
  'web/assets/icons/android-download.webp',
  'web/assets/icons/qr-scanner.webp',
  'web/assets/icons/admin.webp',
  'web/assets/biblical-match-three/board-background-v26.avif',
  'web/assets/biblical-match-three/completion-1-star-v26.avif',
  'web/assets/biblical-match-three/completion-2-stars-v26.avif',
  'web/assets/biblical-match-three/completion-3-stars-v26.avif',
  'web/assets/biblical-match-three/icons-v27/lamp-unlit.svg',
];
for (const f of currentAssets) ok(exists(f), \`Current Biblical Treasures artwork missing: \${f}\`);
ok(launcher.includes('MENU_ICON'), 'Biblical menu artwork wiring missing');
ok(css21.includes('board-background-v26.avif') && css21.includes('.bmt-board-wrap') && css21.includes('.bmt-board'), 'Current board background styling missing');
ok(systemIcons.includes('support.webp') && systemIcons.includes('admin.webp') && !systemIcons.includes('<svg'), 'support/admin artwork wiring missing');
ok(androidMenu.includes('android-download.webp') && !androidMenu.includes('<svg'), 'Android artwork wiring missing');
ok(qrAddon.includes('qr-scanner.webp'), 'QR artwork wiring missing');
ok(indexHtml.includes('biblical-match-three-launcher.js?v=27') && indexHtml.includes('v22-game-loader.js?v=27') && indexHtml.includes('v24-biblical-treasures-board.js?v=27') && indexHtml.includes('v27-biblical-treasures-hotfix.js?v=27'), 'V27 cache-bust/hotfix wiring missing');
const v23Polish = read('web/js/v23-biblical-treasures-polish.js');
const v24Board = read('web/js/v24-biblical-treasures-board.js');
const v27Hotfix = read('web/js/v27-biblical-treasures-hotfix.js');
ok(v23Polish.includes('completion-1-star-v26.avif') && v23Polish.includes('completion-2-stars-v26.avif') && v23Polish.includes('completion-3-stars-v26.avif') && v23Polish.includes('dataset.resultStars'), 'V27 result-star artwork selection missing');
ok(v24Board.includes('lamp-unlit.svg') && v24Board.includes('icons-v17/candle.webp'), 'V27 extinguished/lit lamp artwork wiring missing');
ok(v27Hotfix.includes('__bmtV27HotfixInstalled') && v27Hotfix.includes('data-result-stars') && v27Hotfix.includes('data-booster="ark"') && v27Hotfix.includes('Array.prototype.map'), 'V27 result/Ark hotfix missing');

`;

fs.writeFileSync(tempPath, source.slice(0, start) + currentChecks + source.slice(end));
try {
  const result = spawnSync(process.execPath, [tempPath], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
} finally {
  try { fs.unlinkSync(tempPath); } catch {}
}
