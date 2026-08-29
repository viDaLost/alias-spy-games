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
assert(JSON.stringify(sorted(androidRoutes)) === JSON.stringify(sorted(expectedRoutes)), `unexpected Android fallback routes: ${sorted(androidRoutes).join(', ')}`);

// APK 3.x uses the actual production Web UI after the encrypted native OTP
// gate. Starting with 3.0.2 the web tree is bundled into the APK and served by
// WebViewAssetLoader, so visual/feature parity no longer depends on GitHub Pages
// network availability during application startup.
const mainActivity = read('android-app/app/src/main/java/com/vidalost/biblegames/MainActivity.kt');
const parityShell = read('android-app/app/src/main/java/com/vidalost/biblegames/AndroidParityApp.kt');
const assetSync = read('scripts/sync-android-assets.mjs');
assert(mainActivity.includes('AndroidParityApp('), 'MainActivity does not launch the Web parity shell');
assert(parityShell.includes('WebViewAssetLoader'), 'APK parity shell does not use WebViewAssetLoader');
assert(parityShell.includes('https://$WEB_APP_ORIGIN/assets/index.html'), 'APK parity shell does not load the bundled production app');
assert(parityShell.includes('appassets.androidplatform.net'), 'APK parity shell uses the wrong local HTTPS origin');
assert(!parityShell.includes('https://vidalost.github.io/alias-spy-games/'), 'APK startup still depends on GitHub Pages');
assert(parityShell.includes('sessionStore.load()'), 'APK parity shell bypasses the encrypted native login session');
assert(parityShell.includes('addJavascriptInterface(') && parityShell.includes('"AndroidApp"'), 'APK parity shell does not expose the audited Android bridge');
assert(parityShell.includes('getTelegramId()'), 'Android bridge does not provide the verified Telegram ID');
assert(parityShell.includes('mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW'), 'WebView allows mixed content');
assert(parityShell.includes('allowFileAccess = false') && parityShell.includes('allowContentAccess = false'), 'WebView local file/content access is not disabled');
assert(parityShell.includes('DisposableEffect(Unit)'), 'WebView cleanup is not tied to screen lifecycle');
assert(!parityShell.includes('DisposableEffect(webView)'), 'WebView can be destroyed during startup state replacement');
assert(assetSync.includes("['index.html', 'index.html']"), 'Android asset sync does not bundle index.html');
assert(assetSync.includes("['web', 'web']"), 'Android asset sync does not bundle the production web tree');

// Native implementations stay packaged as the offline fallback and must keep
// the same 12-route catalog and real Biblical Treasures artwork.
const host = read('android-app/app/src/main/java/com/vidalost/biblegames/games/GameHost.kt');
assert(host.includes('GameKey.SKETCH -> BibleSketchGame('), 'Bible Sketch is not launchable in the offline fallback');
assert(host.includes('GameKey.MATCH_THREE -> BiblicalMatchThreeGame(assets, profile, onProfileChange, onBack)'), 'Biblical Treasures is not launchable in the offline fallback');
assert(models.includes('MATCH_THREE("biblical-match-three", "Библейские сокровища"'), 'APK uses the wrong Biblical Treasures title');
assert(models.includes('assets/icons/biblical-treasures-v38.png'), 'APK uses a placeholder Biblical Treasures menu icon');

const matchThree = read('android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeGame.kt');
const matchThreeEngine = read('android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeEngine.kt');
for (const name of ['bible', 'fish', 'dove', 'candle', 'crown', 'ark', 'bread', 'grapes', 'tablets', 'staff', 'jericho', 'covenant']) {
  assert((matchThree + matchThreeEngine).includes(`assets/biblical-match-three/icons-v17/${name}.webp`), `APK Biblical Treasures fallback does not use the real ${name} artwork`);
  assert(exists(`web/assets/biblical-match-three/icons-v17/${name}.webp`), `source artwork is missing: ${name}.webp`);
}
assert(matchThree.includes('assets/biblical-match-three/board-background-v35.webp'), 'APK Biblical Treasures fallback does not use the real board texture');
assert(exists('web/assets/biblical-match-three/board-background-v35.webp'), 'source board texture is missing');

const gradle = read('android-app/app/build.gradle');
const androidMenu = read('web/js/android-download-menu.js');
const releaseWorkflow = read('.github/workflows/build-android-apk.yml');
assert(gradle.includes('versionCode 29') && gradle.includes("versionName '3.0.2-web-parity'"), 'APK version must be 3.0.2-web-parity (29)');
assert(gradle.includes("implementation 'androidx.webkit:webkit:1.17.0'"), 'APK is missing current AndroidX WebKit');
assert(androidMenu.includes('BibleGames-Android-latest.apk'), 'Web download menu does not point to the stable latest APK');
assert(releaseWorkflow.includes('BibleGames-Android-3.0.2-web-parity.apk'), 'Android release workflow does not publish the versioned 3.0.2 APK');
assert(releaseWorkflow.includes('BibleGames-Android-latest.apk'), 'Android release workflow does not publish the stable latest APK alias');

console.log(`Web/Android parity passed: bundled production Web UI + ${androidRoutes.size} native fallback routes`);
