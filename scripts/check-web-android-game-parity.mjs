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
assert(host.includes('GameKey.MATCH_THREE -> BiblicalMatchThreeGame(assets, profile, onProfileChange, onBack)'), 'Biblical Treasures is not launchable with packaged artwork and the shared wallet in the APK');
assert(host.includes('GameEntryLoader(game, assets)'), 'APK does not show the per-game entry loader');

const expectedCopy = [
  ['QUARTET', 'Собери четыре связанные карты'],
  ['PAIRS', 'Соберите животных попарно'],
  ['MATCH_THREE', 'Комбинации, бустеры и путь из 30 уровней'],
  ['SKETCH', 'Рисуйте по очереди и найдите шпиона'],
];
for (const [key, copy] of expectedCopy) {
  assert(models.includes(`${key}(`) && models.includes(copy), `APK catalog copy drifted for ${key}`);
}
assert(models.includes('MATCH_THREE("biblical-match-three", "Библейские сокровища"'), 'APK uses the wrong Biblical Treasures title');
assert(models.includes('assets/icons/biblical-treasures-v38.png'), 'APK uses a placeholder Biblical Treasures menu icon');

const nativeApp = read('android-app/app/src/main/java/com/vidalost/biblegames/App.kt');
const homeParity = read('android-app/app/src/main/java/com/vidalost/biblegames/ui/HomeParity.kt');
assert(nativeApp.includes('HomeParallaxBackground(assets, listState)'), 'APK home does not use the Web parallax scene');
assert(nativeApp.includes('HomeContinueCard(latest, assets)'), 'APK home is missing the Continue card');
assert(nativeApp.includes('HomeProgressSummary(profile)'), 'APK home is missing the Web-style progress summary');
for (const file of [
  '    01-gamehub-base.PNG',
  '    02-atmosphere.PNG',
  '    03-architecture.PNG',
  '    04-game-icons.PNG',
  '    05-game-library.PNG',
]) {
  assert(homeParity.includes(`assets/home-gamehub-parallax-v1/${file}`), `APK home parallax is missing ${file}`);
  assert(exists(`web/assets/home-gamehub-parallax-v1/${file}`), `Web parallax source layer is missing ${file}`);
}

const gameEntry = read('android-app/app/src/main/java/com/vidalost/biblegames/ui/GameEntryLoader.kt');
for (const game of ['ALIAS', 'COIMAGINARIUM', 'GUESS', 'DESCRIBE', 'SPY', 'QUARTET', 'SKETCH', 'WOW', 'WORD_SEARCH', 'SACRED', 'PAIRS', 'MATCH_THREE']) {
  assert(gameEntry.includes(`GameKey.${game}`), `APK loader has no custom theme for ${game}`);
}
for (const status of ['Перемешиваем слова…', 'Шифруем роли…', 'Тасуем колоду…', 'Готовим холст…', 'Строим сетку…', 'Открываем сокровищницу…']) {
  assert(gameEntry.includes(status), `APK loader copy is missing: ${status}`);
}

const matchThree = read('android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeGame.kt');
const matchThreeEngine = read('android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeEngine.kt');
for (const name of ['bible', 'fish', 'dove', 'candle', 'crown', 'ark', 'bread', 'grapes', 'tablets', 'staff', 'jericho', 'covenant']) {
  assert((matchThree + matchThreeEngine).includes(`assets/biblical-match-three/icons-v17/${name}.webp`), `APK Biblical Treasures does not use the real ${name} artwork`);
  assert(exists(`web/assets/biblical-match-three/icons-v17/${name}.webp`), `source artwork is missing: ${name}.webp`);
}
assert(matchThree.includes('assets/biblical-match-three/board-background-v35.webp'), 'APK Biblical Treasures does not use the real board texture');
assert(exists('web/assets/biblical-match-three/board-background-v35.webp'), 'source board texture is missing');
assert(matchThreeEngine.includes('RAINBOW("Радуга Завета"'), 'APK still lacks the V45 Rainbow in-game booster');
assert(!matchThreeEngine.includes('BmtBooster.ARK'), 'APK still routes the removed Ark in-game booster');
assert(matchThree.includes('cell.copy(special = BmtSpecial.RAINBOW)'), 'APK Rainbow booster does not convert the selected tile');
assert(matchThree.includes('blockers.containsKey(index)'), 'APK Rainbow booster can incorrectly target a blocker');

const onlineGames = read('android-app/app/src/main/java/com/vidalost/biblegames/games/OnlineGames.kt');
assert(onlineGames.includes('chatState.optJSONArray("chat").objects()'), 'APK Quartet does not render the server room chat');
assert(onlineGames.includes('session.action("chat", JSONObject().put("text", text))'), 'APK Quartet cannot send room chat messages');

const gradle = read('android-app/app/build.gradle');
const androidMenu = read('web/js/android-download-menu.js');
const androidWorkflow = read('.github/workflows/build-android-apk.yml');
assert(gradle.includes('versionCode 27') && gradle.includes("versionName '2.10.0-native'"), 'APK version must be 2.10.0-native (27)');
assert(gradle.includes("include 'web/assets/**', 'web/data/**'"), 'Android asset sync is not tracking the complete Web asset catalog');
assert(androidMenu.includes('BibleGames-Android-2.10.0-native.apk'), 'Web download menu does not point to APK 2.10.0');
assert(androidWorkflow.includes('BibleGames-Android-2.10.0-native.apk'), 'Signed Android workflow still publishes the previous APK filename');

console.log(`Web/Android parity passed: ${androidRoutes.size} routes, five home parallax layers, 12 game loaders, Quartet chat and Biblical Treasures V45 booster behavior.`);
