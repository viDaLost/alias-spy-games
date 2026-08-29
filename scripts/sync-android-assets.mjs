import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '..');
const defaultOutput = path.join(repositoryRoot, 'android-app', 'app', 'build', 'generated', 'assets', 'native');
const outputRoot = path.resolve(process.argv[2] || defaultOutput);

// The Android WebView now boots from a bundled copy of the production web app.
// Keep the same repository-relative layout so every relative URL in index.html
// behaves exactly as it does on GitHub Pages:
//   index.html
//   web/js/...
//   web/styles/...
//   web/games/...
//   web/assets/...
//   web/data/...
const assetMappings = [
  ['index.html', 'index.html'],
  ['web', 'web'],
];

const apkExcludedFiles = new Set();
let fileCount = 0;
let totalBytes = 0;

if (!outputRoot.startsWith(path.join(repositoryRoot, 'android-app') + path.sep)
    && !outputRoot.startsWith(path.resolve('/tmp') + path.sep)) {
  throw new Error(`Refusing to write Android assets outside a build directory: ${outputRoot}`);
}

function copyFile(source, destination) {
  const relativeSource = path.relative(repositoryRoot, source).split(path.sep).join('/');
  if (apkExcludedFiles.has(relativeSource)) return;
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  const stat = fs.statSync(source);
  fileCount += 1;
  totalBytes += stat.size;
}

function copyTree(sourceRoot, destinationRoot) {
  if (!fs.existsSync(sourceRoot)) return;
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const source = path.join(sourceRoot, entry.name);
    const destination = path.join(destinationRoot, entry.name);
    if (entry.isDirectory()) copyTree(source, destination);
    else if (entry.isFile()) copyFile(source, destination);
  }
}

function copyMapping(sourceRelative, destinationRelative) {
  const source = path.join(repositoryRoot, sourceRelative);
  const destination = path.join(outputRoot, destinationRelative);
  if (!fs.existsSync(source)) {
    throw new Error(`Required Android web asset is missing: ${sourceRelative}`);
  }
  const stat = fs.statSync(source);
  if (stat.isDirectory()) copyTree(source, destination);
  else if (stat.isFile()) copyFile(source, destination);
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

for (const [source, destination] of assetMappings) {
  copyMapping(source, destination);
}

for (const required of [
  'index.html',
  'web/js/app.js',
  'web/js/android-runtime.js',
  'web/js/backend-bridge.js',
  'web/styles/style.css',
]) {
  const target = path.join(outputRoot, required);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw new Error(`Android web bundle is incomplete: ${required}`);
  }
}

console.log(`Android bundled web app: ${fileCount} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB -> ${outputRoot}`);
