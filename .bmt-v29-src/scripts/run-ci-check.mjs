import { spawnSync } from 'node:child_process';

const target = process.argv[2];
if (!target) throw new Error('check target required');
const result = spawnSync(process.execPath, [target], { encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) {
  console.error(`::error title=${target}::${String(result.error.message || result.error).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
  process.exit(1);
}
if (result.status !== 0) {
  const text = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
  const lines = text.split(/\r?\n/).filter(Boolean).slice(-20);
  for (const line of lines) console.error(`::error title=${target}::${line.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
  process.exit(result.status || 1);
}
