import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const rel = (file) => path.relative(root, file).replaceAll(path.sep, '/');
const files = walk(root).filter((f) => !rel(f).startsWith('.git/'));

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

const searchable = files.filter((f) => /\.(?:html|js|css|md)$/i.test(f));
for (const file of searchable.filter((f) => /\.(?:html|js|css)$/i.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  if (/manifest\.webmanifest|navigator\.serviceWorker|beforeinstallprompt|appinstalled/i.test(text)) {
    failures.push(`PWA reference found in ${rel(file)}`);
  }
}

const localRefRegex = /(?:src|href)=["'](?!https?:|data:|#|mailto:|tel:)([^"'?]+)|["'`](assets\/[A-Za-z0-9_./-]+|data\/[A-Za-z0-9_./-]+|games\/[A-Za-z0-9_./-]+)[?"'`]/g;
for (const file of searchable.filter((f) => /\.(?:html|js|css)$/i.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(localRefRegex)) {
    const ref = match[1] || match[2];
    if (!ref || ref.startsWith('javascript:') || ref.includes('${')) continue;
    const target = path.resolve(root, ref);
    if (!fs.existsSync(target)) failures.push(`Broken local reference in ${rel(file)}: ${ref}`);
  }
}

for (const file of files.filter((f) => /\.(?:png|jpe?g|webp)$/i.test(f))) {
  const size = fs.statSync(file).size;
  if (size > 600 * 1024) failures.push(`Image over 600 KiB: ${rel(file)} (${Math.round(size / 1024)} KiB)`);
}

if (failures.length) {
  console.error(`Project check failed (${failures.length}):\n\n${failures.join('\n\n')}`);
  process.exit(1);
}
console.log(`OK: ${files.length} files checked; JS, JSON, local assets and non-PWA constraints are valid.`);
