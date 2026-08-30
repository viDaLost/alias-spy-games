import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isBundled } from './web-sources.mjs';

const read = (path) => fs.readFileSync(path, 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const includes = (path, value, message) => assert(read(path).includes(value), message || `${path} must include ${value}`);
const excludes = (path, value, message) => assert(!read(path).includes(value), message || `${path} must not include ${value}`);

for (const file of ['web/js/admin-live-rescue.js', 'cloudflare/app-observability-worker/src/index-v6.js']) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert(result.status === 0, `${file} syntax check failed:\n${result.stderr || result.stdout}`);
}

assert(isBundled('web/styles/admin-live-v3.css'), 'Admin live CSS cache key must be refreshed');
assert(isBundled('web/js/admin-live-v3.js'), 'Primary admin live cache key must be refreshed');
assert(isBundled('web/js/admin-live-rescue.js'), 'Recovery live panel must be loaded');
includes('web/js/admin-live-rescue.js', "document.getElementById('admin-live-rescue')", 'Recovery panel must have a stable mount');
includes('web/js/admin-live-rescue.js', "document.querySelector('.admin-v2, .admin-page')", 'Recovery panel must support the current admin shell');
includes('web/js/admin-live-rescue.js', "headers: { Authorization: `Bearer ${token}` }", 'Recovery must prefer scoped bearer sessions');
includes('web/js/admin-live-rescue.js', "'X-Telegram-Init-Data': initData", 'Recovery must support rollout-safe header auth');
excludes('web/js/admin-live-rescue.js', '?initData=', 'Telegram initData must never be placed in a live URL');
includes('web/js/admin-live-rescue.js', 'Пользователи онлайн', 'Recovery panel must expose the online user list');
includes('web/js/admin-live-rescue.js', 'Перезагрузить свежую версию', 'Recovery panel must provide a stale-WebView escape hatch');

includes('cloudflare/app-observability-worker/src/index-v6.js', 'await verifyAdminRequest(request, env)', 'Observability admin endpoints must use rollout-safe verification');
includes('cloudflare/app-observability-worker/src/index-v6.js', "token.startsWith('bgw_')", 'Bearer auth must remain the preferred admin path');
includes('cloudflare/app-observability-worker/src/index-v6.js', "request.headers.get('X-Telegram-Init-Data')", 'Header fallback must be accepted');
includes('cloudflare/app-observability-worker/src/index-v6.js', "https://core.internal/admin/verify", 'Header fallback must still verify Telegram data through Core');
includes('cloudflare/app-observability-worker/src/index-v6.js', 'X-Telegram-Init-Data', 'CORS must permit the rollout-safe auth header');

console.log('Admin live recovery regression checks passed.');