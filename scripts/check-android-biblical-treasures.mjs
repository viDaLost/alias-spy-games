import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const need = (value, token, message) => {
  if (!value.includes(token)) throw new Error(message);
};
const levels = JSON.parse(read('web/data/biblical_match_three_levels.json')).levels;
const engine = read('android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeEngine.kt');
const data = read('android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeData.kt');
const ui = read('android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeGame.kt');
const host = read('android-app/app/src/main/java/com/vidalost/biblegames/games/GameHost.kt');

if (levels.length !== 30 || levels.some((level, index) => level.id !== index + 1)) {
  throw new Error('Biblical Treasures must expose the same ordered 30-level campaign in Web and Android');
}

const supportedGoals = new Set(['score', 'collect', 'clearBlockers', 'lightLamps', 'activateSpecials', 'cascade']);
for (const level of levels) {
  if (level.rows < 5 || level.rows > 8 || level.moves < 1 || level.symbolCount < 3 || level.symbolCount > 9) {
    throw new Error(`Level ${level.id} has an unsupported board configuration`);
  }
  if (!Array.isArray(level.goals) || level.goals.length < 1 || level.goals.some((goal) => !supportedGoals.has(goal.type) || goal.count < 1)) {
    throw new Error(`Level ${level.id} has an unsupported or empty goal`);
  }
  if (!Array.isArray(level.starThresholds) || level.starThresholds.length !== 3 ||
      level.starThresholds.some((value, index, all) => value < 1 || (index > 0 && value <= all[index - 1]))) {
    throw new Error(`Level ${level.id} has invalid star thresholds`);
  }
  const blockers = (level.blockers || []).flatMap((group) => group.cells.map((cell) => ({ type: group.type, cell })));
  if (blockers.some(({ cell }) => cell < 0 || cell >= level.rows * 8)) throw new Error(`Level ${level.id} has a blocker outside its board`);
  for (const goal of level.goals) {
    if (goal.type === 'clearBlockers' && blockers.filter((item) => item.type === goal.blocker).length < goal.count) {
      throw new Error(`Level ${level.id} requires more ${goal.blocker} blockers than it contains`);
    }
    if (goal.type === 'lightLamps' && blockers.filter((item) => item.type === 'lamp').length < goal.count) {
      throw new Error(`Level ${level.id} requires more lamps than it contains`);
    }
    if (goal.type === 'activateSpecials' && goal.count > level.moves * 2) {
      throw new Error(`Level ${level.id} special goal is not reachable within its moves`);
    }
  }
}

for (const token of ['LINE_H', 'LINE_V', 'BURST', 'RAINBOW', 'specialComboClearSet', 'expandSpecials', 'seedSpecials', 'damageBlockers', 'createPlayableBoard']) {
  need(engine, token, `Android Biblical Treasures engine is missing ${token}`);
}
for (const token of ['require(levels.size == 30)', 'data/biblical_match_three_levels.json']) {
  need(data, token, `Android does not use the shared campaign source: ${token}`);
}
for (const token of [
  'BmtCatalog.load', 'detectDragGestures', 'BmtPreBooster.entries', 'BmtBooster.entries',
  'BmtEngine.resolveBooster', 'BmtEngine.reshuffle', 'completion-', 'board-background-v35.webp',
  'profile.wowStars', 'BmtMenuSection', 'BmtBoardScaffold', 'ContentScale.Crop', 'Color.Transparent',
  'Animatable(0f)', 'swapProgress.animateTo(1f', 'freeChallengeSeeds', 'BmtBlockerType.LAMP -> 1.08f',
]) {
  need(ui, token, `Android Biblical Treasures UI is missing ${token}`);
}
need(host, 'BiblicalMatchThreeGame(assets, profile, onProfileChange, onBack)', 'Biblical Treasures is not connected to the shared star wallet');

const assets = [
  ...['bible', 'fish', 'dove', 'candle', 'crown', 'ark', 'bread', 'grapes', 'tablets', 'chains', 'covenant', 'jericho', 'score', 'sling', 'staff'].map((name) => `web/assets/biblical-match-three/icons-v17/${name}.webp`),
  'web/assets/biblical-match-three/icons-v29/lamp-unlit.webp',
  'web/assets/biblical-match-three/board-background-v35.webp',
  'web/assets/biblical-match-three/completion-1-star-v40.webp',
  'web/assets/biblical-match-three/completion-2-stars-v40.webp',
  'web/assets/biblical-match-three/completion-3-stars-v40.webp',
];
assets.forEach((asset) => {
  if (!fs.existsSync(asset) || fs.statSync(asset).size < 100) throw new Error(`Required real game asset is missing: ${asset}`);
});

console.log(`Android Biblical Treasures parity OK: ${levels.length} levels, swipe, specials, blockers, boosters and HQ art.`);
