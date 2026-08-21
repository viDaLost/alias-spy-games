import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const exists = (path) => fs.existsSync(path);
const assert = (condition, message) => {
  if (!condition) throw new Error(`Web/Android parity check failed: ${message}`);
};

const app = read('web/js/app.js');
const groupSource = app.slice(app.indexOf('const GAME_GROUPS'), app.indexOf('const GAME_TITLES'));
const webRoutes = new Set([...groupSource.matchAll(/\bkey:\s*"([a-z0-9-]+)"/g)].map((match) => match[1]));

for (const launcher of ['web/js/bible-sketch-launcher.js', 'web/js/biblical-match-three-launcher.js']) {
  const source = read(launcher);
  const route = source.match(/const GAME_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
  assert(route, `${launcher} does not declare GAME_KEY`);
  webRoutes.add(route);
}

const models = read('android-app/app/src/main/java/com/vidalost/biblegames/model/Models.kt');
const androidRoutes = new Set([...models.matchAll(/^\s*[A-Z_]+\("([a-z0-9-]+)"/gm)].map((match) => match[1]));
const expectedRoutes = new Set([
  'alias', 'coimaginarium', 'guess', 'describe', 'spy', 'quartet',
  'bible-wow', 'bible-wordsearch', 'sacred-word', 'kids-ark-pairs',
  'bible-sketch', 'biblical-match-three',
]);

const sorted = (values) => [...values].sort();
assert(JSON.stringify(sorted(webRoutes)) === JSON.stringify(sorted(expectedRoutes)), `unexpected Web routes: ${sorted(webRoutes).join(', ')}`);
assert(JSON.stringify(sorted(androidRoutes)) === JSON.stringify(sorted(expectedRoutes)), `unexpected Android routes: ${sorted(androidRoutes).join(', ')}`);

const host = read('android-app/app/src/main/java/com/vidalost/biblegames/games/GameHost.kt');
assert(host.includes('GameKey.SKETCH -> BibleSketchGame('), 'Bible Sketch is not launchable in the APK');
assert(host.includes('GameKey.MATCH_THREE -> BiblicalMatchThreeGame(assets, onBack)'), 'Biblical Treasures is not launchable with packaged artwork in the APK');
assert(models.includes('MATCH_THREE("biblical-match-three", "Библейские сокровища"'), 'APK uses the wrong Biblical Treasures title');
assert(models.includes('assets/icons/biblical-treasures-v38.png'), 'APK uses a placeholder Biblical Treasures menu icon');

const matchThree = read('android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeGame.kt');
for (const name of ['bible', 'fish', 'dove', 'candle', 'crown', 'ark', 'bread', 'grapes', 'tablets', 'staff', 'jericho', 'covenant']) {
  assert(matchThree.includes(`assets/biblical-match-three/icons-v17/${name}.webp`), `APK Biblical Treasures does not use the real ${name} artwork`);
  assert(exists(`web/assets/biblical-match-three/icons-v17/${name}.webp`), `source artwork is missing: ${name}.webp`);
}
assert(matchThree.includes('assets/biblical-match-three/board-background-v35.webp'), 'APK Biblical Treasures does not use the real board texture');
assert(exists('web/assets/biblical-match-three/board-background-v35.webp'), 'source board texture is missing');

const gradle = read('android-app/app/build.gradle');
const androidMenu = read('web/js/android-download-menu.js');
assert(gradle.includes('versionCode 24') && gradle.includes("versionName '2.8.0-native'"), 'APK version must be 2.8.0-native (24)');
assert(androidMenu.includes('BibleGames-Android-2.8.0-native.apk'), 'Web download menu does not point to APK 2.8.0');

console.log(`Web/Android game parity passed: ${androidRoutes.size} routes, including Bible Sketch and Biblical Treasures with real artwork`);
