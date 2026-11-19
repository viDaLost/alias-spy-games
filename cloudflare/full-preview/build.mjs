import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { build, transform } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, 'preview-dist/full');
const exec = promisify(execFile);
const source = (file) => path.join(root, file);

async function copy(file, target = file, options = {}) {
  const destination = path.join(output, target);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source(file), destination, { recursive: true, ...options });
}

async function compile(files, loader, target) {
  const text = (await Promise.all(files.map((file) => readFile(source(file), 'utf8')))).join('\n');
  const result = await transform(text, { loader, minifyWhitespace: true, minifySyntax: true, target: 'es2020' });
  await writeFile(path.join(output, target), result.code);
}

function standaloneMarkup(html) {
  return html
    .replace(/\s*<style>html:not\(\.standalone-access-allowed\)[^<]*<\/style>/g, '')
    .replace(/\s*<script[^>]+standalone-app-access\.js[^>]*><\/script>/g, '')
    .replace(/(href|src)="sabbath\/(sabbath-[^"]+)"/g, (_, attribute, file) =>
      `${attribute}="/web/${file.endsWith('.css') ? 'styles' : 'js'}/${file}"`)
    .replace(/\s*<script[^>]+src="https:\/\/telegram\.org[^"]+"[^>]*><\/script>/g, '')
    .replace(/type="application\/x-app-access" data-app-access-src=/g, 'src=')
    .replace('<head>', '<head>\n  <script src="/display-preferences.js"></script>\n  <link rel="stylesheet" href="/display-preferences.css">');
}

async function buildFrames() {
  await copy('cloudflare/promised-land-preview/public', 'land');
  await copy('web/assets/promised-land', 'land/art');
  for (const [file, target] of [
    ['web/assets/game-scenes/scenes/promised-land.webp', 'scene.webp'],
    ['web/assets/icons/promised-land-v2.webp', 'menu-icon.webp'],
    ['web/games/moses-nile-v7/vendor/three-r128.min.js', 'three-r128.min.js'],
    ['web/games/moses-nile-v7/vendor/GLTFLoader-r128.js', 'GLTFLoader-r128.js'],
    ...['PalmTree_4.glb', 'Bush_1.glb', 'Rock_1.glb', 'Grass.glb', 'Plant_1.glb', 'Plant_2.glb']
      .map((name) => [`web/games/moses-nile-v7/models/environment/nature_pack/${name}`, 'models/' + name]),
    ['web/games/moses-nile-v7/models/environment/survival_pack/WoodLog.glb', 'models/WoodLog.glb'],
  ]) await copy(file, 'land/art/' + target);

  for (const file of ['land/index.html', 'web/games/moses-nile-v7/index.html']) {
    const html = standaloneMarkup(await readFile(path.join(output, file), 'utf8'))
      .replace(/<script>\s*if\(!window\.THREE\)document\.write[\s\S]*?<\/script>/, '');
    const libraryPattern = file.startsWith('land/')
      ? /<script src="art\/(?:three-r128\.min|GLTFLoader-r128)\.js"><\/script>/g
      : /<script src="vendor\/(?:three-r128\.min|GLTFLoader-r128|OBJLoader-r128)\.js"><\/script>/g;
    const lightHtml = html.replace(libraryPattern, (tag) => {
      const escaped = JSON.stringify(tag).replaceAll('</script>', '<\\/script>');
      return `<script>if(!window.GameDisplay.lowGraphics())document.write(${escaped});</script>`;
    });
    await writeFile(path.join(output, file), lightHtml);
  }
}

async function thumbnails(from, into, geometry) {
  const destination = path.join(output, into);
  await mkdir(destination, { recursive: true });
  const files = (await readdir(source(from))).filter((name) => name.endsWith('.webp'));
  for (let index = 0; index < files.length; index += 8) {
    await Promise.all(files.slice(index, index + 8).map((name) => exec('magick', [
      source(path.join(from, name)), '-thumbnail', geometry, '-strip', '-quality', '74', path.join(destination, name),
    ], { env: { ...process.env, MAGICK_THREAD_LIMIT: '1' } })));
  }
}

await rm(output, { recursive: true, force: true });
await cp(source('cloudflare/full-preview/public'), output, { recursive: true });

await Promise.all([
  copy('web/assets', 'web/assets', { filter: (file) => {
    const [folder, scene] = path.relative(source('web/assets'), file).split(path.sep);
    if (folder === 'game-scenes') return !scene || scene === 'path';
    return !['startup-loader', 'promised-land'].includes(folder);
  } }),
  copy('web/data'),
  copy('web/games'),
  copy('web/js'),
  copy('web/styles'),
  copy('web/vendor'),
  copy('cloudflare/reopening-preview/public/quartet-polling.js', 'quartet-polling.js'),
]);
await Promise.all([
  buildFrames(),
  build({
    entryPoints: [source('cloudflare/full-preview/src/quartet-practice.js')],
    outfile: path.join(output, 'quartet-practice.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    minify: true,
    target: 'es2020',
  }),
  compile([
    'web/js/game-card-details.js',
    'web/js/theme-switch.js',
    'web/js/sabbath-clock.js',
    'web/js/app.js',
    'web/games/kids-ark-pairs.js',
    'web/games/biblical-match-three-progress.js',
    'web/js/biblical-match-three-launcher.js',
    'web/js/bible-sketch-launcher.js',
    'web/js/three-gate.js',
    'web/js/game-shell.js',
    'web/js/wordsearch-classic-engine.js',
    'web/js/word-games-upgrade-lite.js',
    'web/js/bible-wow-word-flow.js',
    'web/js/word-games-shuffle.js',
    'web/js/progress-reset.js',
    'web/js/game-rules-demos.js',
    'web/js/game-rules.js',
    'web/js/room-qr-scanner.js',
    'web/js/channel-promo.js',
    'web/js/bot-start-promo.js',
    'web/js/game-frame-safe-area.js',
    'web/js/game-scene-parallax.js',
  ], 'js', 'full-runtime.js'),
  compile([
    'web/styles/home-parallax-v1.css',
    'web/styles/tokens.css',
    'web/styles/style.css',
    'web/styles/games-mobile-polish.css',
    'web/games/kids-ark-pairs.css',
    'web/styles/word-games-upgrade.css',
    'web/styles/bible-wow-word-flow.css',
    'web/styles/biblical-match-three-v38.css',
    'web/styles/typography.css',
    'web/styles/surfaces.css',
    'web/styles/game-shell.css',
    'web/styles/word-games-polish.css',
    'web/styles/game-titles-polish.css',
    'web/styles/sacred-word-polish.css',
    'web/styles/lobby-polish.css',
    'web/styles/channel-promo.css',
    'web/styles/game-rules.css',
    'web/styles/progress-reset.css',
    'web/styles/dark-theme.css',
    'web/styles/game-scene-parallax.css',
    'web/styles/sabbath-access.css',
  ], 'css', 'web/styles/full-games.css'),
  thumbnails('web/assets/icons/unified-v1', 'web/assets/catalog-low', '100x100'),
  thumbnails('web/assets/quartet/cards', 'web/assets/quartet/thumbs', '140x175'),
]);
