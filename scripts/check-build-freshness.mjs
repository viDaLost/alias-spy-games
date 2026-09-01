// Fails when the committed web/dist bundle does not match a fresh build of its sources.
//
// GitHub Pages serves the committed tree, so a stale bundle means users get old code
// even though the source in the same commit looks correct. This needs esbuild, so it
// runs in the CI job that installs dependencies rather than in `npm run check`.

import fs from 'node:fs';
import path from 'node:path';
import { build } from './build-web.mjs';

const root = path.resolve(import.meta.dirname, '..');
const fresh = await build({ write: false });

const problems = [];
const compare = (rel, expected) => {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return problems.push(`missing build output: ${rel}`);
  if (fs.readFileSync(file, 'utf8') !== expected) problems.push(`stale build output: ${rel}`);
};

compare(`web/dist/${fresh.cssName}`, fresh.css);
compare(`web/dist/${fresh.jsName}`, fresh.js);
if (fs.readFileSync(path.join(root, 'index.html'), 'utf8') !== fresh.html) {
  problems.push('index.html does not reference the current bundle');
}
// Список кеша офлайн-работника собирается той же сборкой. Отстанет он — в
// дороге откроется вчерашнее приложение, и заметить это будет некому.
if (fs.readFileSync(path.join(root, 'sw.js'), 'utf8') !== fresh.sw) {
  problems.push('sw.js precache list is stale');
}

const dist = fs.existsSync(path.join(root, 'web/dist')) ? fs.readdirSync(path.join(root, 'web/dist')) : [];
const extra = dist.filter((name) => name !== fresh.cssName && name !== fresh.jsName);
if (extra.length) problems.push(`leftover build output: ${extra.join(', ')}`);

if (problems.length) {
  console.error(`Build freshness check failed (${problems.length}):\n\n${problems.join('\n')}\n\nRun \`npm run build\` and commit the result.`);
  process.exit(1);
}
console.log(`Build is fresh: web/dist/${fresh.cssName} and web/dist/${fresh.jsName} match their sources.`);
