// Resolves the Core Worker's layer chain from wrangler.jsonc.
//
// Each index-vN.js wraps its predecessor, so the production entrypoint moves forward
// every time a layer is added. Checks that care about a specific layer should assert it
// is still reachable from the entrypoint instead of pinning the entrypoint's version,
// which silently goes stale and turns CI red on the next layer.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const workerDir = path.join(root, 'cloudflare/app-core-worker');

const wrangler = fs.readFileSync(path.join(workerDir, 'wrangler.jsonc'), 'utf8');
const entry = wrangler.match(/"main"\s*:\s*"src\/([^"]+)"/)?.[1];
if (!entry) throw new Error('Core Worker entrypoint is not declared in wrangler.jsonc');

/** Layer filenames from the production entrypoint down to the base, e.g. index-v15.js first. */
export const coreWorkerChain = [];
for (let file = entry; file && !coreWorkerChain.includes(file); ) {
  coreWorkerChain.push(file);
  const source = fs.readFileSync(path.join(workerDir, 'src', file), 'utf8');
  file = source.match(/^import\s+[^;]*from\s+'\.\/(index-v\d+\.js)'/m)?.[1];
}

export const coreEntrypoint = entry;

/** True when a layer still runs as part of the deployed Core Worker. */
export const coreWorkerHasLayer = (file) => coreWorkerChain.includes(file);
