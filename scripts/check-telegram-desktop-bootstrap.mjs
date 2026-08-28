import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const index = await readFile(path.join(root, 'index.html'), 'utf8');
const launchContext = await readFile(path.join(root, 'web/js/telegram-launch-context.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`[telegram-desktop-bootstrap] ${message}`);
}

const sdkMatch = index.match(/<script\s+id="telegram-web-app-sdk"[^>]*src="https:\/\/telegram\.org\/js\/telegram-web-app\.js\?63"[^>]*><\/script>/);
assert(sdkMatch, 'Telegram WebApp SDK tag is missing or does not use the expected current URL.');
assert(/id="telegram-web-app-sdk"[^>]*\sasync(?:\s|>)/.test(index), 'Telegram SDK must load asynchronously so it cannot block local deferred scripts.');
assert(!/telegram-web-app\.js[^>]*\sdefer(?:\s|>)/.test(index), 'Telegram SDK must not participate in the deferred execution chain.');

const launchIndex = index.indexOf('web/js/telegram-launch-context.js');
const backendIndex = index.indexOf('web/js/backend-bridge.js');
const appIndex = index.indexOf('web/js/app.js');
assert(launchIndex >= 0, 'telegram-launch-context.js is not included.');
assert(backendIndex > launchIndex, 'launch context must execute before backend-bridge.js.');
assert(appIndex > launchIndex, 'launch context must execute before app.js.');

assert(index.includes("window.setTimeout(() =>"), 'inline bootstrap watchdog is missing.');
assert(index.includes('Не удалось завершить запуск приложения.'), 'bootstrap watchdog must expose a recoverable error state.');
assert(index.includes('onclick="location.reload()"'), 'bootstrap watchdog retry action is missing.');

assert(launchContext.includes("readLaunchParam('tgWebAppData')"), 'launch context does not read tgWebAppData.');
assert(launchContext.includes('window.location.search'), 'launch context does not inspect URL search parameters.');
assert(launchContext.includes('window.location.hash'), 'launch context does not inspect URL hash parameters.');
assert(launchContext.includes('sessionStorage'), 'launch context does not persist init data for the current session.');
assert(launchContext.includes('window.Telegram.WebApp = compat'), 'launch context does not provide the compatibility WebApp object.');
assert(launchContext.includes("new Set(['user', 'receiver', 'chat'])"), 'launch context does not restore structured Telegram user data.');

console.log('Telegram Desktop bootstrap checks passed.');
