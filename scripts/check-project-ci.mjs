import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['scripts/check-project.mjs'], { encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) {
  console.error(`::error title=Project check::${String(result.error.message || result.error).replaceAll('\n', '%0A')}`);
  process.exit(1);
}
if (result.status !== 0) {
  const text = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
  const lines = text.split(/\r?\n/).filter(Boolean).slice(-20);
  for (const line of lines) console.error(`::error title=Project check::${line.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
  process.exit(result.status || 1);
}
