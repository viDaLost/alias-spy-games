// Runs every step of .github/workflows/quality.yml, in order, locally.
//
// The steps are read out of the workflow rather than duplicated here, so a step added
// to CI is picked up automatically instead of being silently skipped before a push.
//
//   node scripts/run-ci-locally.mjs            all steps
//   node scripts/run-ci-locally.mjs validate   one job only
//
// Steps needing outbound network (smoke:games) may fail in a sandbox that blocks it;
// the summary marks them so they are not mistaken for regressions.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/quality.yml'), 'utf8');
const only = process.argv[2];

const jobs = [];
let job = null;
let step = null;
for (const line of workflow.split('\n')) {
  const jobMatch = line.match(/^  ([a-z0-9-]+):\s*$/);
  if (jobMatch && !/^\s+(?:name|runs-on|steps|uses|with|run|env|permissions|on):/.test(line)) {
    job = { id: jobMatch[1], steps: [] };
    jobs.push(job);
    continue;
  }
  if (!job) continue;
  const nameMatch = line.match(/^      - name:\s*(.+)$/);
  if (nameMatch) { step = { name: nameMatch[1].trim(), run: null, dir: root }; continue; }
  if (!step) continue;
  const dirMatch = line.match(/^        working-directory:\s*(.+)$/);
  if (dirMatch) { step.dir = path.join(root, dirMatch[1].trim()); continue; }
  const runMatch = line.match(/^        run:\s*(.+)$/);
  if (runMatch && !runMatch[1].startsWith('|')) {
    step.run = runMatch[1].trim();
    if (!/^(?:echo|CHROME_BIN=)/.test(step.run)) job.steps.push(step);
    step = null;
  }
}

const selected = only ? jobs.filter((j) => j.id === only) : jobs;
if (!selected.length) {
  console.error(`no such job: ${only}. Available: ${jobs.map((j) => j.id).join(', ')}`);
  process.exit(2);
}

const env = { ...process.env };
if (!env.CHROME_BIN && fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) {
  env.CHROME_BIN = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
}

const results = [];
for (const item of selected) {
  console.log(`\n=== ${item.id} (${item.steps.length} шагов) ===`);
  for (const current of item.steps) {
    process.stdout.write(`${current.name.slice(0, 58).padEnd(60)} `);
    const done = spawnSync('bash', ['-lc', current.run], { cwd: current.dir, env, encoding: 'utf8', timeout: 600_000 });
    const output = `${done.stdout || ''}${done.stderr || ''}`;
    const network = /ERR_TUNNEL_CONNECTION_FAILED|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/.test(output);
    const ok = done.status === 0;
    console.log(ok ? 'OK' : network ? 'FAIL (сеть песочницы)' : 'FAIL');
    results.push({ job: item.id, name: current.name, ok, network, output });
  }
}

const failed = results.filter((r) => !r.ok);
const real = failed.filter((r) => !r.network);
console.log(`\n${results.length - failed.length}/${results.length} шагов прошли`);
for (const item of failed) {
  console.log(`\n--- ${item.job}: ${item.name}${item.network ? ' (сеть песочницы, не регрессия)' : ''}`);
  console.log(item.output.split('\n').filter((l) => /error|Error|failed|✗/i.test(l)).slice(0, 4).join('\n') || item.output.slice(-400));
}
process.exit(real.length ? 1 : 0);
