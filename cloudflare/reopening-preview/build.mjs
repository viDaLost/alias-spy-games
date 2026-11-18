import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'preview-dist', 'reopening');

const files = [
  'web/assets/biblical-match-three',
  'web/assets/fonts/onest-cyrillic.woff2',
  'web/assets/fonts/onest-latin.woff2',
  'web/assets/icons/unified-v1/biblical-treasures.webp',
  'web/assets/icons/unified-v1/quartet.webp',
  'web/assets/quartet',
  'web/data/biblical_match_three_levels.json',
  'web/data/quartet_bible.json',
  'web/games/biblical-match-three-core.js',
  'web/games/biblical-match-three-effects.js',
  'web/games/biblical-match-three-progress.js',
  'web/games/biblical-match-three-v10-runtime.js',
  'web/games/biblical-match-three-v15-polish.js',
  'web/games/biblical-match-three-v15-ui.js',
  'web/games/biblical-match-three-v5-loader.js',
  'web/games/biblical-match-three.js',
  'web/games/quartet-table.css',
  'web/games/quartet-table.js',
  'web/games/quartet-v2.css',
  'web/games/quartet.js',
  'web/js/biblical-match-three-launcher.js',
  'web/js/v45-biblical-treasures-special-swipe.js',
  'web/styles/biblical-match-three-v38.css',
  'web/styles/biblical-match-three-v45.css',
  'web/styles/biblical-match-three.css',
];

await rm(output, { recursive: true, force: true });
await cp(new URL('./public/', import.meta.url), output, { recursive: true });
for (const file of files) {
  const destination = path.join(output, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, file), destination, { recursive: true });
}
