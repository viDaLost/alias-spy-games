import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const warnings = [];
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const rel = (file) => path.relative(root, file).replaceAll(path.sep, '/');
const files = walk(root).filter((f) => !rel(f).startsWith('.git/'));

// Standalone preview sources are copied into an isolated Cloudflare bundle by their
// deployment workflow. Their vendor files are injected at build time and the subtree is
// intentionally not part of the production web reachability graph.
const previewOnlyPrefixes = ['web/games/moses-nile-v7/'];
const isPreviewOnly = (file) => previewOnlyPrefixes.some((prefix) => rel(file).startsWith(prefix));

for (const file of files.filter((f) => f.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (error) { failures.push(`JS syntax: ${rel(file)}\n${error.stderr?.toString() || error.message}`); }
}

for (const file of files.filter((f) => f.endsWith('.json'))) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { failures.push(`JSON invalid: ${rel(file)} — ${error.message}`); }
}

const forbidden = ['manifest.webmanifest', 'sw.js', 'PWA_INSTALL.md'];
for (const name of forbidden) {
  if (fs.existsSync(path.join(root, name))) failures.push(`PWA file must stay removed: ${name}`);
}

const searchable = files.filter((f) => /\.(?:html|js|css|md)$/i.test(f) && !isPreviewOnly(f));
for (const file of searchable.filter((f) => /\.(?:html|js|css)$/i.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  if (/manifest\.webmanifest|navigator\.serviceWorker|beforeinstallprompt|appinstalled/i.test(text)) {
    failures.push(`PWA reference found in ${rel(file)}`);
  }
}

const markdownLinkRegex = /\[[^\]]*\]\((?!https?:|mailto:|#)([^)#\s]+)(?:#[^)]+)?\)/g;
for (const file of files.filter((f) => f.endsWith('.md'))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(markdownLinkRegex)) {
    const target = path.resolve(path.dirname(file), decodeURI(match[1]));
    if (!fs.existsSync(target)) failures.push(`Broken Markdown link in ${rel(file)}: ${match[1]}`);
  }
}

const localRefRegex = /(?:src|href)=["'](?!https?:|data:|#|mailto:|tel:)([^"'?]+)|["'`](web\/(?:assets|data|games)\/[A-Za-z0-9_./-]+)[?"'`]/g;
for (const file of searchable.filter((f) => /\.(?:html|js|css)$/i.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(localRefRegex)) {
    const ref = match[1] || match[2];
    if (!ref || ref.startsWith('javascript:') || ref.includes('${')) continue;
    const target = path.resolve(root, ref);
    if (!fs.existsSync(target)) failures.push(`Broken local reference in ${rel(file)}: ${ref}`);
  }
}

// Runtime catalogs may point at media directly (for example one illustration per
// Quartet card), so JSON participates in the published-file reachability graph.
const runtimeReferenceFiles = files.filter((file) => /\.(?:html|js|css|json|kt|gradle)$/i.test(file));
const runtimeReferenceText = new Map(
  runtimeReferenceFiles.map((file) => [file, fs.readFileSync(file, 'utf8')])
);
const publishedFiles = files.filter((file) => rel(file).startsWith('web/') && !isPreviewOnly(file));

for (const file of publishedFiles) {
  const name = rel(file);
  const aliases = [name];
  if (name.startsWith('web/assets/') || name.startsWith('web/data/')) aliases.push(name.slice(4));

  const referenced = runtimeReferenceFiles.some((source) => {
    if (source === file) return false;
    const text = runtimeReferenceText.get(source) || '';
    return aliases.some((alias) => text.includes(alias));
  });

  if (!referenced) failures.push(`Unreferenced published file: ${name}`);
}

// These three files predate the size check and already exist on main. Keep them visible as
// technical debt without letting unrelated PRs stay permanently red. Any new oversized image
// still fails CI.
const legacyOversizedImages = new Set([
  'web/assets/cards/spy-card-back.png',
  'web/assets/cards/spy-card-player.png',
  'web/assets/cards/spy-card-spy.png',
]);

for (const file of files.filter((f) => /\.(?:png|jpe?g|webp)$/i.test(f))) {
  const size = fs.statSync(file).size;
  if (size <= 600 * 1024) continue;
  const name = rel(file);
  const message = `Image over 600 KiB: ${name} (${Math.round(size / 1024)} KiB)`;
  if (legacyOversizedImages.has(name)) warnings.push(`Legacy ${message}`);
  else failures.push(message);
}

if (warnings.length) console.warn(`Project warnings (${warnings.length}):\n\n${warnings.join('\n\n')}`);
if (failures.length) {
  console.error(`Project check failed (${failures.length}):\n\n${failures.join('\n\n')}`);
  process.exit(1);
}
console.log(`OK: ${files.length} files checked; syntax, JSON, links, published-file reachability and non-PWA constraints are valid.`);
