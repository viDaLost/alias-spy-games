import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const fail = (message) => { throw new Error(message); };

const html = read('index.html');
const admin = read('admin-enhancements.js');
const mount = read('broadcast-admin-mount.js');
const broadcast = read('broadcast-cloudflare.js');

if (!admin.includes('admin-v2__broadcast')) fail('Admin v2 broadcast container is missing.');
if (!mount.includes("querySelectorAll('.admin-v2__broadcast')")) fail('Broadcast mount bridge does not target admin v2.');
if (!mount.includes("classList.add('admin-broadcast')")) fail('Broadcast mount bridge does not normalize the Cloudflare target class.');
if (!broadcast.includes("document.querySelector('.admin-broadcast')")) fail('Cloudflare broadcast module does not hydrate the normalized target.');

const mountIndex = html.indexOf('broadcast-admin-mount.js?v=1');
const broadcastIndex = html.indexOf('broadcast-cloudflare.js?v=2');
if (mountIndex < 0) fail('Broadcast mount bridge is not loaded by index.html.');
if (broadcastIndex < 0) fail('Fresh Cloudflare broadcast bundle is not loaded by index.html.');
if (mountIndex > broadcastIndex) fail('Broadcast mount bridge must load before the Cloudflare broadcast module.');
if (!html.includes('admin-enhancements.js?v=23')) fail('Admin bundle cache version was not bumped.');
if (!html.includes('broadcast-cloudflare.css?v=2')) fail('Broadcast stylesheet cache version was not bumped.');

console.log('OK: admin v2 mounts the rich Cloudflare broadcast UI and bypasses stale Telegram cache.');
