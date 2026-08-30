import fs from 'node:fs';
import path from 'node:path';
import { isBundled } from './web-sources.mjs';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const ok = (value, message) => { if (!value) throw new Error(message); };

const index = read('index.html');
const fix = read('web/js/quartet-v44-overlay-fix.js');
const invite = read('web/js/room-invite.js');
const chat = read('web/js/quartet-chat-addon.js');
const dockCss = read('web/styles/quartet-v43-smooth.css');

new Function(fix);

ok(isBundled('web/js/quartet-v44-overlay-fix.js'), 'Quartet V44 overlay fix is not wired');
ok(invite.includes('async function openQr(game, room, title'), 'RoomInvite QR signature changed');
ok(fix.includes("RoomInvite.openQr('quartet', roomId"), 'Quartet QR does not call RoomInvite with the canonical signature');
ok(fix.includes("event.stopImmediatePropagation()"), 'Broken V43 QR handler is not intercepted');
ok(fix.includes("document.body.appendChild(drawer)"), 'Chat drawer is not moved to the body viewport layer');
ok(fix.includes("document.body.appendChild(fab)"), 'Chat FAB is not moved out of the transformed game root');
ok(chat.includes("root.appendChild(drawer)"), 'Chat source structure changed; V44 relocation target needs review');
ok(dockCss.includes('z-index:9300'), 'V43 dock z-index changed; V44 overlay ordering needs review');
ok(fix.includes('z-index:2147482500!important'), 'Chat drawer is not guaranteed above the V43 dock');
ok(fix.includes('qchat-backdrop-v44'), 'Chat modal backdrop is missing');
ok(fix.includes("document.getElementById('qchat-close')?.click()"), 'Chat backdrop/Escape close path is missing');
ok(fix.includes("body.qv44-chat-open #qv43-fixed-dock"), 'Quick dock is not visually de-emphasized while chat is open');

console.log('OK: Quartet V44 QR uses the canonical RoomInvite API and chat renders in a body-owned overlay above the fixed action dock.');
