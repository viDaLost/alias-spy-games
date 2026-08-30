import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scriptSources } from './web-sources.mjs';

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

// The launch context stays outside the bundle: it must run synchronously in <head>,
// before any deferred script. Everything that depends on it lives in the deferred
// bundle, so ordering is now checked against the bundle's own source list.
const launchIndex = index.indexOf('web/js/telegram-launch-context.js');
assert(launchIndex >= 0, 'telegram-launch-context.js is not included.');
assert(!/telegram-launch-context\.js[^>]*\s(?:defer|async)(?:\s|>)/.test(index),
  'launch context must stay synchronous so it runs before every deferred script.');
assert(!scriptSources.includes('web/js/telegram-launch-context.js'),
  'launch context must not be bundled: the bundle is deferred and would run too late.');

const bundleTagIndex = index.search(/<script src="web\/dist\/app\.[0-9a-f]+\.js" defer><\/script>/);
assert(bundleTagIndex >= 0, 'the built bundle is not referenced from index.html.');
assert(bundleTagIndex > launchIndex, 'launch context must be declared before the bundle.');

const backendIndex = scriptSources.indexOf('web/js/backend-bridge.js');
const appIndex = scriptSources.indexOf('web/js/app.js');
assert(backendIndex >= 0, 'backend-bridge.js is not in the bundle.');
assert(appIndex >= 0, 'app.js is not in the bundle.');
assert(backendIndex < appIndex, 'backend-bridge.js must execute before app.js.');

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
