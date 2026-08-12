import fs from 'node:fs';

const base = fs.readFileSync('cloudflare/app-observability-worker/src/index.js', 'utf8');
const v2 = fs.readFileSync('cloudflare/app-observability-worker/src/index-v2.js', 'utf8');

if (!base.includes('attachment.updatedAt = Date.now();')) {
  throw new Error('Ping must refresh presence updatedAt');
}
if (!v2.includes('const PRESENCE_STALE_MS = 90_000;')) {
  throw new Error('Presence stale timeout is missing');
}
if (!v2.includes('now - updatedAt > PRESENCE_STALE_MS')) {
  throw new Error('Stale presence sessions are not filtered');
}

console.log('Presence freshness regression check passed');
