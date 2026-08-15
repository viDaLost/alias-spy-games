import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '..');
const defaultOutput = path.join(repositoryRoot, 'android-app', 'app', 'build', 'generated', 'assets', 'native');
const outputRoot = path.resolve(process.argv[2] || defaultOutput);
const assetMappings = [
  ['web/assets', 'assets'],
  ['web/data', 'data'],
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

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

for (const [source, destination] of assetMappings) {
  copyTree(path.join(repositoryRoot, source), path.join(outputRoot, destination));
}

console.log(`Android native assets: ${fileCount} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB -> ${outputRoot}`);
