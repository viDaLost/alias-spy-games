import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isBundled } from './web-sources.mjs';

const script = 'web/js/admin-live-modal-safety.js';
const index = fs.readFileSync('index.html', 'utf8');
const source = fs.readFileSync(script, 'utf8');
const result = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Modal safety syntax check failed');
if (!source.includes("classList.remove('admin-live-modal-open')")) throw new Error('Modal guard must unlock background scrolling');
if (!source.includes('lastOpener.focus')) throw new Error('Modal guard must restore focus to its opener');
if (!isBundled('web/js/admin-live-modal-safety.js')) throw new Error('Modal guard must ship in the bundle');
console.log('Admin modal accessibility guard OK.');
