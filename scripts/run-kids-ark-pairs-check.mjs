import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const sourcePath = path.join(root, 'scripts/check-kids-ark-pairs.mjs');
const tempPath = path.join(root, 'scripts/.check-kids-ark-pairs-ci.mjs');
const original = fs.readFileSync(sourcePath, 'utf8');
const exact = "await page.route('https://telegram.org/js/telegram-web-app.js',";
const wildcard = "await page.route('https://telegram.org/js/telegram-web-app.js*',";

if (!original.includes(exact)) {
  console.error('Kids pairs QA wrapper could not find the Telegram SDK route.');
  process.exit(1);
}

fs.writeFileSync(tempPath, original.replace(exact, wildcard));

try {
  const result = spawnSync(process.execPath, [tempPath], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(tempPath, { force: true });
}
