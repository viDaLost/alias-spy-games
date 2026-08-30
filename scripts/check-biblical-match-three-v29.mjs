import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const root = process.cwd();
const require = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const bytes = (p) => fs.readFileSync(path.join(root, p));
const exists = (p) => fs.existsSync(path.join(root, p));
const ok = (value, message) => { if (!value) throw new Error(message); };

const WEBP = (p) => {
  const b = bytes(p);
  return b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP';
};
const BOARD_BACKGROUND = 'web/assets/biblical-match-three/board-background-v35.webp';
const COMPLETION_ART = [
  'web/assets/biblical-match-three/completion-1-star-v40.webp',
  'web/assets/biblical-match-three/completion-2-stars-v40.webp',
  'web/assets/biblical-match-three/completion-3-stars-v40.webp',
];
const required = [
  'web/assets/icons/biblical-treasures-v38.webp',
  BOARD_BACKGROUND,
  ...COMPLETION_ART,
  'web/assets/biblical-match-three/icons-v29/lamp-unlit.webp',
  'web/assets/biblical-match-three/icons-v17/candle.webp',
];
for (const file of required) ok(exists(file), `Biblical Treasures asset missing: ${file}`);
for (const file of required.filter((f) => f.endsWith('.webp'))) ok(WEBP(file), `Biblical Treasures WebP has invalid bytes: ${file}`);
for (const file of COMPLETION_ART) {
  ok(bytes(file).length >= 160_000, `V40 completion artwork is unexpectedly compressed: ${file}`);
  ok(bytes(file).length < 600 * 1024, `V40 completion artwork exceeds the project image-size limit: ${file}`);
}
const backgroundBytes = bytes(BOARD_BACKGROUND);
ok(backgroundBytes.length >= 200_000, 'V35 supplied board background must keep maximum-quality image data');
ok(backgroundBytes.length < 600 * 1024, 'V35 supplied board background must stay below the project image-size limit');

const index = read('index.html');
const loader = read('web/js/v22-game-loader.js');
const gamePolish = read('web/js/v22-game-polish.js');
const home = read('web/js/v22-home-art.js');
const result = read('web/js/v23-biblical-treasures-polish.js');
const board = read('web/js/v24-biblical-treasures-board.js');
const boardCss = read('web/styles/biblical-match-three-v24-board.css');
const artCss = read('web/styles/biblical-match-three-v21-art.css');
const hotfix = read('web/js/v29-biblical-treasures-hotfix.js');
const lampSwipe = read('web/js/v37-biblical-treasures-lamp-swipe.js');
const launcher = read('web/js/biblical-match-three-launcher.js');
const progress = read('web/games/biblical-match-three-progress.js');
const game = read('web/games/biblical-match-three.js');
const experienceCss = read('web/styles/biblical-match-three-v38.css');
const motionCss = read('web/styles/app-motion.css');
const levels = JSON.parse(read('web/data/biblical_match_three_levels.json'));

ok(levels.version === 4, 'Biblical Treasures level balance version missing');
ok(levels.levels?.length === 30, 'Biblical Treasures must keep 30 levels');
ok(levels.levels.some((level) => (level.blockers || []).some((group) => group.type === 'lamp')), 'Lamp levels missing');
ok(index.includes('biblical-match-three-launcher.js?v=42') && index.includes('v22-home-art.js?v=39'), 'Biblical Treasures V42 public launcher/menu icon wiring missing');
ok(index.includes('v22-game-loader.js?v=41') && index.includes('v29-biblical-treasures-hotfix.js?v=40') && index.includes('v37-biblical-treasures-lamp-swipe.js?v=37'), 'V41 experience/lamp cache-bust wiring missing');
ok(index.includes('app-motion.css?v=2') && index.includes('biblical-match-three-v38.css?v=41'), 'V41 layout/menu motion cache-bust wiring missing');
ok(index.includes('v24-biblical-treasures-board.js?v=29'), 'Stable V29 board wiring changed unexpectedly');
ok(!index.includes('v27-biblical-treasures-hotfix.js'), 'V27 hotfix must not be loaded');
ok(loader.includes("const VERSION = '41'") && loader.includes('__bmtV31HotfixInstalled') && loader.includes('v29-biblical-treasures-hotfix.js'), 'Existing lazy-loader compatibility wiring missing');
ok(loader.includes('v37-biblical-treasures-lamp-swipe.js?v=37') && loader.includes('__bmtV37LampSwipeInstalled'), 'V37 lazy-loader wiring missing');
ok(home.includes("BIBLICAL_VERSION = '39'") && home.includes('biblical-treasures-v38.webp') && home.includes("bmtMenuArt = 'v39'"), 'V39 stable menu icon patch missing');
ok(launcher.includes('const VERSION="42"') && launcher.includes('const MENU_ART_VERSION="39"') && launcher.includes('biblical-treasures-v38.webp') && launcher.includes('data-bmt-menu-art="v39"'), 'V42 canonical launcher icon source missing');
ok(hotfix.includes("MENU_ART_VERSION = '39'") && hotfix.includes('biblical-treasures-v38.webp'), 'Legacy hotfix can still revert the V39 menu icon');
ok(!read('web/games/biblical-match-three-v15-polish.js').includes('patchAppCard'), 'Game polish can still replace the app icon after returning to the menu');
ok(game.includes('applyLevelGoalSpecials') && game.includes('seededGoalSpecials'), 'Special-goal levels do not guarantee activatable pieces');
ok(result.includes('completion-1-star-v40.webp') && result.includes('completion-2-stars-v40.webp') && result.includes('completion-3-stars-v40.webp') && result.includes('dataset.resultStars'), 'HQ star-specific completion art wiring missing');
ok(hotfix.includes("RESULT_ART_VERSION = '40'") && hotfix.includes('completion-3-stars-v40.webp'), 'The result synchronizer can still restore compressed completion artwork');
ok(board.includes('icons-v29/lamp-unlit.webp') && board.includes('icons-v17/candle.webp') && board.includes('data-blocker-lit'), 'Extinguished/lit lamp art wiring missing');
ok(boardCss.includes('board-background-v35.webp?v=35') && boardCss.includes('.bmt-tile.has-lamp .bmt-piece-wrap') && boardCss.includes('visibility:hidden!important'), 'V35 board background / standalone lamp styling missing');
ok(artCss.includes('board-background-v35.webp?v=35'), 'V35 board art fallback missing');

ok(hotfix.includes('__bmtV34HotfixInstalled') && hotfix.includes("const VERSION = '35'") && hotfix.includes('board-background-v35.webp') && hotfix.includes('.bmt-board-wrap'), 'V35 board artwork hotfix missing');
ok(hotfix.includes('background-image:none!important') && hotfix.includes('#game-container') && hotfix.includes('.bmt-shell.bmt-board-screen'), 'V35 must explicitly keep the supplied artwork off the full game screen');
ok(hotfix.includes('.bmt-v24-field-cells rect') && hotfix.includes('fill:rgba(255,255,255,.11)'), 'V35 board underlay must expose the supplied artwork behind pieces');
ok(!hotfix.includes('BOARD_WRAP_BACKGROUND'), 'V35 must not paint an old secondary board background over the supplied artwork');
ok(hotfix.includes('THREE_STAR_REMAINING_RATIO = 0.20') && hotfix.includes('TWO_STAR_REMAINING_RATIO = 0.08') && hotfix.includes('efficiencyRating') && hotfix.includes('__bmtV34RatingPatched'), 'V35 attainable star-rating logic missing');
ok(hotfix.includes('patchPrelevelStarRules') && hotfix.includes('Как получить звёзды') && hotfix.includes('applyRunRatingToResult'), 'V35 star rules/result synchronization missing');
ok(hotfix.includes("stars.getAttribute('aria-label') !== label"), 'Result aria-label must be written only when it actually changes');
ok(hotfix.includes("attributeFilter:['data-current-game','class']"), 'V35 result observer must not observe aria-label');
ok(!hotfix.includes("attributeFilter:['data-current-game','class','aria-label']") && !hotfix.includes("attributeFilter: ['data-current-game', 'class', 'aria-label']"), 'Old self-triggering aria-label observer returned');
ok(hotfix.includes('requestAnimationFrame(patchAll)') && hotfix.includes('patchScheduled'), 'V35 mutation processing must be coalesced to one animation frame');
ok(hotfix.includes('v34ResultSynced'), 'V35 result synchronization marker missing');
ok(hotfix.includes('sourceLamp') && hotfix.includes("target?.classList.contains('has-lamp')") && hotfix.includes("document.addEventListener('pointerdown'") && hotfix.includes("document.addEventListener('pointerup'"), 'Lamp swipe guard missing');

ok(lampSwipe.includes('__bmtV37LampSwipeInstalled') && lampSwipe.includes('bmtLampCleared') && lampSwipe.includes('data-blocker-lit'), 'V37 lit-lamp unlock patch missing');
ok(lampSwipe.includes("tile.classList.remove('has-lamp', 'is-lamp-lit')") && lampSwipe.includes("blocker.replaceChildren()"), 'V37 lit lamps must become normal playable cells');
ok(lampSwipe.includes('edgeFallback') && lampSwipe.includes('fallbackIndex') && lampSwipe.includes('document.addEventListener(\'pointermove\''), 'V37 edge swipe fallback missing');
ok(lampSwipe.includes('validSwapTile') && lampSwipe.includes('!unlitLamp(tile)'), 'V37 must keep unlit lamp obstacles protected');

ok(launcher.includes('const VERSION="42"') && launcher.includes('function isAllowedUser(){return true}') && launcher.includes('publicAccess:true') && launcher.includes('installPublic') && launcher.includes('MENU_ICON'), 'Biblical Treasures public launcher wiring missing');
ok(!launcher.includes('ALLOWED_USER_ID') && !launcher.includes('removeMenuCard') && !launcher.includes('installAuthorized') && !launcher.includes('eligibilityTimer'), 'Biblical Treasures still contains a private-user access gate');
const launcherNodes = new Map();
const launcherMenuRoot = { append: (node) => launcherNodes.set(node.id, node) };
const launcherContext = {
  Telegram: { WebApp: { initDataUnsafe: { user: { id: 999999999 } } } },
  document: {
    readyState: 'complete',
    body: { appendChild() {} },
    documentElement: {},
    getElementById: (id) => id === 'kids-games' ? launcherMenuRoot : launcherNodes.get(id) || null,
    createElement: () => ({ dataset: {}, setAttribute() {}, addEventListener() {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
  },
  MutationObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: (callback) => callback(),
  setTimeout: () => 0,
  clearTimeout() {},
  console,
};
launcherContext.window = launcherContext;
launcherContext.globalThis = launcherContext;
vm.createContext(launcherContext);
vm.runInContext(launcher, launcherContext);
ok(launcherNodes.has('biblical-match-three-card'), 'A previously denied Telegram user must see the Biblical Treasures menu card');
ok(launcherContext.BiblicalMatchThreeAccess.publicAccess === true && launcherContext.BiblicalMatchThreeAccess.isAllowedUser() === true, 'Biblical Treasures must report public access for every user');
ok(progress.includes('levelBestScores') && progress.includes('previousBestScore') && progress.includes('newBestScore') && progress.includes('isImproved'), 'Campaign best-score persistence missing');
ok(game.includes('data-bmt-pre-balance') && game.includes('Доступно') && game.includes('Выбрано') && game.includes('selectedCost() + booster.cost <= starBalance()') && game.includes('aria-pressed'), 'Pre-level boosters do not expose or enforce the real star balance');
ok(gamePolish.includes(".bmt-prelevel__boost-title > span:first-child") && !gamePolish.includes("querySelectorAll('.bmt-prelevel__boost-title span')"), 'Legacy polish can still delete the pre-level balance controls and crash booster selection');
ok(game.includes('if (balanceNode)') && game.includes('if (totalNode)') && game.includes('!runtime.blockers.has(index)'), 'Pre-level booster application is not defensive against patched markup or blocker cells');
ok(game.includes('match3-preboost-refund-level-') && game.includes('kind:"prelevel-booster"') && game.includes('selectedBoosters.forEach'), 'A failed pre-level booster start must be contained and refund its stars');
ok(progress.includes('if (!progress.boosterStats || typeof progress.boosterStats !== "object") progress.boosterStats = {}'), 'Legacy progress can still crash while recording a pre-level booster');
ok(experienceCss.includes('.bmt-board.bmt-v24-board{overflow:visible!important') && experienceCss.includes('padding:8px 8px 14px!important'), 'The outer board pieces can still be clipped');
ok(experienceCss.includes('.bmt-v22-result-actions{display:grid!important;grid-template-columns:minmax(0,1fr)!important;width:100%!important}') && experienceCss.includes('.bmt-v22-next{width:100%!important'), 'Next-level button is not guaranteed to span the result card');
ok(motionCss.includes('.menu-container:not(.hidden) .game-card__icon') && motionCss.includes('@keyframes appGameIconFloat') && motionCss.includes('@keyframes appGameIconSway') && motionCss.includes('@keyframes appGameIconBreathe'), 'Main-menu game icons are not animated');
ok(motionCss.includes('prefers-reduced-motion:reduce') && motionCss.includes('.menu-container:not(.hidden) .game-card__icon{animation:none!important}'), 'Menu icon motion does not respect reduced-motion preferences');

const testStore = new Map([['bible_stars_v1_5693086211', '87']]);
const progressContext = {
  localStorage: {
    getItem: (key) => testStore.has(key) ? testStore.get(key) : null,
    setItem: (key, value) => testStore.set(key, String(value)),
    removeItem: (key) => testStore.delete(key),
  },
  getTelegramUser: () => ({ id: 'аноним' }),
  __ANDROID_TELEGRAM_ID__: '5693086211',
};
progressContext.globalThis = progressContext;
vm.createContext(progressContext);
vm.runInContext(progress, progressContext);
ok(progressContext.BiblicalMatchThreeProgress.userId() === '5693086211', 'Android user id must win over the anonymous Telegram placeholder');
ok(progressContext.BiblicalMatchThreeProgress.getStars() === 87, 'Pre-level balance must read the authenticated Android/Telegram wallet');
const boosterPurchase = progressContext.BiblicalMatchThreeProgress.spendStars(6, 'qa-prelevel-booster');
ok(boosterPurchase.ok && boosterPurchase.balance === 81, 'An affordable pre-level booster must be purchased from the visible wallet');
const legacyBoosterProgress = progressContext.BiblicalMatchThreeProgress.load();
legacyBoosterProgress.boosterStats = null;
const repairedBoosterProgress = progressContext.BiblicalMatchThreeProgress.noteBoosterUse(legacyBoosterProgress, 'manna');
ok(repairedBoosterProgress.boosterStats.manna === 1, 'Legacy progress must not crash when any pre-level booster is recorded');

for (const level of levels.levels) {
  const thresholds = level.starThresholds || [];
  ok(thresholds.length === 3, `Level ${level.id}: expected exactly three star thresholds`);
  const [one, two, three] = thresholds.map(Number);
  ok(Number.isFinite(one) && Number.isFinite(two) && Number.isFinite(three), `Level ${level.id}: star thresholds must be finite`);
  ok(one > 0 && one < two && two < three, `Level ${level.id}: star thresholds must be strictly ascending`);
  ok(two <= Math.ceil(one * 1.35) + 100, `Level ${level.id}: two-star target is too far above completion score`);
  ok(three <= Math.ceil(one * 1.65) + 100, `Level ${level.id}: three-star target is too far above completion score`);
  const moves = Number(level.moves || 0);
  ok(moves >= 20, `Level ${level.id}: move budget is unexpectedly low`);
  for (const goal of level.goals || []) {
    const count = Number(goal.count || 0);
    ok(count > 0, `Level ${level.id}: goal count must be positive`);
    if (goal.type === 'score') ok(one === count, `Level ${level.id}: one-star threshold must equal the required score`);
    if (goal.type === 'collect') ok(count <= moves, `Level ${level.id}: collect goal is too high for the move budget`);
    if (goal.type === 'activateSpecials') ok(count <= Math.ceil(moves / 3), `Level ${level.id}: special activation goal is too high for the move budget`);
    if (goal.type === 'cascade') ok(count <= 4, `Level ${level.id}: cascade goal is outside the supported balanced range`);
    if (goal.type === 'clearBlockers') {
      const available = (level.blockers || []).filter((group) => group.type === goal.blocker).reduce((sum, group) => sum + (group.cells || []).length, 0);
      ok(available >= count, `Level ${level.id}: blocker goal requests more blockers than exist`);
    }
    if (goal.type === 'lightLamps') {
      const available = (level.blockers || []).filter((group) => group.type === 'lamp').reduce((sum, group) => sum + (group.cells || []).length, 0);
      ok(available >= count, `Level ${level.id}: lamp goal requests more lamps than exist`);
    }
  }
}

const progressApi = require(path.join(root, 'web/games/biblical-match-three-progress.js'));
let replay = progressApi.load();
const first = progressApi.completeLevel(replay, 1, 1, 6, 30, 1500);
const improved = progressApi.completeLevel(first.progress, 1, 3, 6, 30, 2200);
const worseReplay = progressApi.completeLevel(improved.progress, 1, 2, 6, 30, 1800);
ok(worseReplay.progress.levelRatings['1'] === 3, 'A worse replay must not replace the best star rating');
ok(worseReplay.progress.levelBestScores['1'] === 2200, 'A worse replay must not replace the best campaign score');
ok(improved.isImproved === true, 'A better replay must be recognized as an improvement');

for (const obsolete of [
  'web/js/v27-biblical-treasures-hotfix.js',
  'web/assets/biblical-match-three/board-background-v28.avif',
  'web/assets/biblical-match-three/board-background-v29.webp',
  'web/assets/biblical-match-three/board-background-v31.webp',
  'web/assets/biblical-match-three/board-background-v31.PNG',
  'web/assets/biblical-match-three/completion-1-star-v28.webp',
  'web/assets/biblical-match-three/completion-2-stars-v28.webp',
  'web/assets/biblical-match-three/completion-3-stars-v28.avif',
  'web/assets/biblical-match-three/completion-1-star-v29.webp',
  'web/assets/biblical-match-three/completion-2-stars-v29.webp',
  'web/assets/biblical-match-three/completion-3-stars-v29.avif',
  'web/assets/biblical-match-three/icons-v28/lamp-unlit.webp',
]) ok(!exists(obsolete), `Obsolete Biblical Treasures asset must be removed: ${obsolete}`);

for (const file of [
  'web/js/biblical-match-three-launcher.js',
  'web/js/v22-game-loader.js',
  'web/js/v22-home-art.js',
  'web/js/v23-biblical-treasures-polish.js',
  'web/js/v24-biblical-treasures-board.js',
  'web/js/v29-biblical-treasures-hotfix.js',
  'web/js/v37-biblical-treasures-lamp-swipe.js',
  'web/games/biblical-match-three-progress.js',
]) {
  const check = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  ok(check.status === 0, `JS syntax failed: ${file}\n${check.stderr || ''}`);
}

console.log('OK: Biblical Treasures V37 keeps lit lamp cells playable and edge swipes usable while preserving V35/V36 gameplay fixes');
