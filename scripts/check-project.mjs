import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { styleSources, scriptSources } from './web-sources.mjs';

const root = process.cwd();
const failures = [];
const warnings = [];
// Installed dependencies are not project sources: they carry their own broken-looking
// relative references and bundled vendor HTML, and scanning them makes the result depend
// on whether `npm install` has run.
const ignoredDirs = new Set(['.git', 'node_modules', 'build', '.gradle']);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  if (entry.isDirectory() && ignoredDirs.has(entry.name)) return [];
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const rel = (file) => path.relative(root, file).replaceAll(path.sep, '/');
const files = walk(root);

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

// Some art is assembled at runtime from ASSET_ROOT + filename, so the full path never
// appears as one literal string in a source file. Keep the allowlist narrow and explicit.
const dynamicPublishedFiles = new Set([
  'web/assets/home-gamehub-parallax-v1/01-gamehub-base.webp',
  'web/assets/home-gamehub-parallax-v1/02-atmosphere.webp',
  'web/assets/home-gamehub-parallax-v1/03-architecture.webp',
  'web/assets/home-gamehub-parallax-v1/04-game-icons.webp',
  'web/assets/home-gamehub-parallax-v1/05-game-library.webp',
  'web/assets/startup-loader/portal-01.webp',
]);

// Runtime catalogs may point at media directly (for example one illustration per
// Quartet card), so JSON participates in the published-file reachability graph.
const runtimeReferenceFiles = files.filter((file) => /\.(?:html|js|css|json|kt|gradle)$/i.test(file));
const runtimeReferenceText = new Map(
  runtimeReferenceFiles.map((file) => [file, fs.readFileSync(file, 'utf8')])
);
const bundledSources = new Set([...styleSources, ...scriptSources]);
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

  if (!referenced && !dynamicPublishedFiles.has(name) && !bundledSources.has(name)) {
    failures.push(`Unreferenced published file: ${name}`);
  }
}

// The eager stylesheets and scripts reach the browser through web/dist, so their own
// paths no longer appear in index.html. They are reachable by being in the bundle.
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [kind, pattern] of [['stylesheet', /<link rel="stylesheet" href="(web\/dist\/app\.[0-9a-f]+\.css)"/], ['script', /<script src="(web\/dist\/app\.[0-9a-f]+\.js)" defer><\/script>/]]) {
  const built = indexHtml.match(pattern)?.[1];
  if (!built) failures.push(`index.html does not reference a built bundle ${kind}`);
  else if (!fs.existsSync(path.join(root, built))) failures.push(`Built bundle ${kind} is missing: ${built}`);
}
for (const source of [...styleSources, ...scriptSources]) {
  if (!fs.existsSync(path.join(root, source))) failures.push(`Bundle source is missing: ${source}`);
}
const distFiles = files.filter((f) => rel(f).startsWith('web/dist/')).map(rel);
const staleDist = distFiles.filter((name) => !indexHtml.includes(name));
if (staleDist.length) failures.push(`Stale build output not referenced by index.html: ${staleDist.join(', ')}`);

// Every published raster now ships in WebP at its display resolution, so the
// 600 KiB budget applies without exemptions.
for (const file of files.filter((f) => /\.(?:png|jpe?g|webp)$/i.test(f))) {
  const size = fs.statSync(file).size;
  if (size <= 600 * 1024) continue;
  failures.push(`Image over 600 KiB: ${rel(file)} (${Math.round(size / 1024)} KiB)`);
}

if (warnings.length) console.warn(`Project warnings (${warnings.length}):\n\n${warnings.join('\n\n')}`);
if (failures.length) {
  console.error(`Project check failed (${failures.length}):\n\n${failures.join('\n\n')}`);
  process.exit(1);
}
console.log(`OK: ${files.length} files checked; syntax, JSON, links, published-file reachability and non-PWA constraints are valid.`);
