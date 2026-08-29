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
assert(JSON.stringify(sorted(androidRoutes)) === JSON.stringify(sorted(expectedRoutes)), `unexpected packaged Android routes: ${sorted(androidRoutes).join(', ')}`);

// Android 3.0.4 uses the exact production Web catalog copied into the APK after
// the encrypted native OTP gate. WebViewAssetLoader serves those packaged bytes
// from Android's private HTTPS appassets origin. This gives Web/Android feature
// parity without using GitHub Pages as an origin alias or runtime dependency.
const mainActivity = read('android-app/app/src/main/java/com/vidalost/biblegames/MainActivity.kt');
const parityShell = read('android-app/app/src/main/java/com/vidalost/biblegames/AndroidParityApp.kt');
const androidRuntime = read('web/js/android-runtime.js');
const backendBridge = read('web/js/backend-bridge.js');
const assetSync = read('scripts/sync-android-assets.mjs');
assert(mainActivity.includes('AndroidParityApp('), 'MainActivity does not launch the Web parity shell');
assert(parityShell.includes('WebViewAssetLoader'), 'APK parity shell does not use WebViewAssetLoader');
assert(parityShell.includes('WEB_APP_ORIGIN = "appassets.androidplatform.net"'), 'APK does not use the standalone Android HTTPS origin');
assert(parityShell.includes('WEB_APP_PATH_PREFIX = "/assets/"'), 'APK bundled path does not use the Android asset namespace');
assert(parityShell.includes('.setDomain(WEB_APP_ORIGIN)'), 'WebViewAssetLoader is not bound to the standalone Android domain');
assert(parityShell.includes('.setHttpAllowed(false)'), 'bundled Web UI can fall back to cleartext HTTP');
assert(parityShell.includes('https://$WEB_APP_ORIGIN${WEB_APP_PATH_PREFIX}index.html'), 'APK parity shell does not load the bundled app path');
assert(!parityShell.includes('WEB_APP_ORIGIN = "vidalost.github.io"'), 'APK still impersonates the GitHub Pages origin');
assert(!parityShell.includes('https://vidalost.github.io'), 'APK shell still contains a GitHub Pages runtime URL');
assert(parityShell.includes('sessionStore.load()'), 'APK parity shell bypasses the encrypted native login session');
assert(parityShell.includes('addJavascriptInterface(') && parityShell.includes('"AndroidApp"'), 'APK parity shell does not expose the audited Android bridge');
assert(parityShell.includes('getTelegramId()'), 'Android bridge does not provide the verified Telegram ID');
assert(parityShell.includes('getSessionToken()'), 'Android bridge cannot authenticate Web parity API calls');
assert(!parityShell.includes('onNativeFallback'), 'signed-in APK can still fall back to divergent native games');
assert(!parityShell.includes('nativeFallback'), 'signed-in APK retains the divergent native fallback state');
assert(parityShell.includes('mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW'), 'WebView allows mixed content');
assert(parityShell.includes('allowFileAccess = false') && parityShell.includes('allowContentAccess = false'), 'WebView local file/content access is not disabled');
assert(parityShell.includes('DisposableEffect(Unit)'), 'WebView cleanup is not tied to screen lifecycle');
assert(!parityShell.includes('DisposableEffect(webView)'), 'WebView can be destroyed during startup state replacement');
assert(androidRuntime.includes('ensureSocialFeatures'), 'Android does not mount profile/friends/favorites Web modules');
assert(androidRuntime.includes('android-native-session'), 'Android social identity marker is missing');
assert(backendBridge.includes("callCore('/android/compat'"), 'Android Web requests are not routed through authenticated compat API');
assert(backendBridge.includes('getSessionToken'), 'Android Web API requests do not use the verified bearer session');
assert(assetSync.includes("['index.html', 'index.html']"), 'Android asset sync does not bundle index.html');
assert(assetSync.includes("['web', 'web']"), 'Android asset sync does not bundle the production web tree');

// Native implementations remain packaged for the login-era codebase, but they
// are no longer a post-login game fallback. Keep their catalog/artwork valid so
// source compatibility and native tests do not silently rot.
const host = read('android-app/app/src/main/java/com/vidalost/biblegames/games/GameHost.kt');
assert(host.includes('GameKey.SKETCH -> BibleSketchGame('), 'packaged Bible Sketch route is missing');
assert(host.includes('GameKey.MATCH_THREE -> BiblicalMatchThreeGame(assets, profile, onProfileChange, onBack)'), 'packaged Biblical Treasures route is missing');
assert(models.includes('MATCH_THREE("biblical-match-three", "Библейские сокровища"'), 'APK uses the wrong Biblical Treasures title');
assert(models.includes('assets/icons/biblical-treasures-v38.png'), 'APK uses a placeholder Biblical Treasures menu icon');

const matchThree = read('android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeGame.kt');
const matchThreeEngine = read('android-app/app/src/main/java/com/vidalost/biblegames/games/BiblicalMatchThreeEngine.kt');
for (const name of ['bible', 'fish', 'dove', 'candle', 'crown', 'ark', 'bread', 'grapes', 'tablets', 'staff', 'jericho', 'covenant']) {
  assert((matchThree + matchThreeEngine).includes(`assets/biblical-match-three/icons-v17/${name}.webp`), `APK Biblical Treasures package does not use the real ${name} artwork`);
  assert(exists(`web/assets/biblical-match-three/icons-v17/${name}.webp`), `source artwork is missing: ${name}.webp`);
}
assert(matchThree.includes('assets/biblical-match-three/board-background-v35.webp'), 'APK Biblical Treasures package does not use the real board texture');
assert(exists('web/assets/biblical-match-three/board-background-v35.webp'), 'source board texture is missing');

const gradle = read('android-app/app/build.gradle');
const androidMenu = read('web/js/android-download-menu.js');
const releaseWorkflow = read('.github/workflows/build-android-apk.yml');
assert(gradle.includes('versionCode 31') && gradle.includes("versionName '3.0.4-standalone'"), 'APK version must be 3.0.4-standalone (31)');
assert(gradle.includes("implementation 'androidx.webkit:webkit:1.14.0'"), 'APK is missing the Kotlin-compatible AndroidX WebKit');
assert(androidMenu.includes('BibleGames-Android-latest.apk'), 'Web download menu does not point to the stable latest APK');
assert(releaseWorkflow.includes('BibleGames-Android-3.0.4-standalone.apk'), 'Android release workflow does not publish the versioned 3.0.4 standalone APK');
assert(releaseWorkflow.includes('BibleGames-Android-latest.apk'), 'Android release workflow does not publish the stable latest APK alias');

console.log(`Web/Android parity passed: standalone bundled Web UI + ${androidRoutes.size} packaged native compatibility routes, with no GitHub Pages runtime origin.`);
