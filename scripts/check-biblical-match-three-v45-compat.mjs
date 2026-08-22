import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const legacyPath = path.join(root, 'scripts/check-biblical-match-three-v29.mjs');
const tempPath = path.join(root, `scripts/.tmp-check-bmt-v45-${process.pid}.mjs`);
let source = fs.readFileSync(legacyPath, 'utf8');

// Keep the entire mature V29/V35/V41 regression suite, updating only the
// canonical public-launcher cache version that intentionally advanced in V45.
source = source
  .replaceAll('biblical-match-three-launcher.js?v=42', 'biblical-match-three-launcher.js?v=45')
  .replaceAll('const VERSION="42"', 'const VERSION="45"')
  .replaceAll('Biblical Treasures V42 public launcher/menu icon wiring missing', 'Biblical Treasures V45 public launcher/menu icon wiring missing')
  .replaceAll('V42 canonical launcher icon source missing', 'V45 canonical launcher icon source missing');

fs.writeFileSync(tempPath, source);
try {
  const result = spawnSync(process.execPath, [tempPath], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  try { fs.unlinkSync(tempPath); } catch {}
}
