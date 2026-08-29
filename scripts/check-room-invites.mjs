import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`Room invite check failed: ${label}`);
};
const forbidText = (text, needle, label) => {
  if (text.includes(needle)) throw new Error(`Room invite check failed: ${label}`);
};

const invite = read('web/js/room-invite.js');
const scanner = read('web/js/room-qr-scanner.js');
const addon = read('web/js/room-qr-addon.js');
const brand = read('web/js/room-qr-brand.js');
const brandCss = read('web/styles/room-qr-brand.css');
const css = read('web/styles/room-invite.css');
const gestureCss = read('web/styles/quartet-gesture-guard.css');
const gestureJs = read('web/js/telegram-gesture-guard.js');
const inviteCore = read('cloudflare/app-core-worker/src/index-v7.js');
const balanceCore = read('cloudflare/app-core-worker/src/index-v8.js');
const secureCore = read('cloudflare/app-core-worker/src/index-v9.js');
const richEntryCore = read('cloudflare/app-core-worker/src/index-v10.js');
const socialEntryCore = read('cloudflare/app-core-worker/src/index-v11.js');
const wrangler = read('cloudflare/app-core-worker/wrangler.jsonc');
const html = read('index.html');

requireText(invite, "quartet_v2_room_id", 'Quartet invite does not seed room storage');
requireText(invite, "bible_sketch_room_id_v1", 'Bible Sketch invite does not seed room storage');
requireText(invite, '/telegram/miniapp-config', 'Telegram bot profile is not loaded from core backend');
requireText(invite, 'https://t.me/', 'shareable room link is not a Telegram Mini App deep link');
requireText(invite, '?startapp=', 'Telegram Mini App start parameter is missing');
requireText(invite, 'join_', 'Telegram start parameter format is missing');
requireText(invite, 'biblegames:', 'internal QR payload fallback is missing');
requireText(invite, 'getShareUrl', 'async Telegram share URL resolver is missing');
requireText(invite, 'acceptScanned', 'scanned QR cannot be accepted in-app');
requireText(invite, 'QRCode', 'QR renderer is missing');
requireText(invite, 'window.showGame', 'invite does not auto-open the target game');
forbidText(invite, "searchParams.set('join'", 'new invitations must not point at the public website');

requireText(scanner, 'showScanQrPopup', 'Telegram QR scanner is missing');
requireText(scanner, "onEvent('qrTextReceived'", 'Telegram QR event fallback is missing');
requireText(scanner, "offEvent('qrTextReceived'", 'Telegram QR event cleanup is missing');
requireText(scanner, "onEvent('scanQrPopupClosed'", 'Telegram scanner close event is missing');
requireText(scanner, "typeof value.data === 'string'", 'qrTextReceived event.data is not normalized');
requireText(scanner, 'closeScanQrPopup', 'successful scan does not explicitly close the Telegram scanner');
requireText(scanner, 'acceptScanned', 'scanner does not hand off to room invite flow');
forbidText(scanner, 'getUserMedia', 'browser camera scanner must not be used');
forbidText(scanner, 'BarcodeDetector', 'browser BarcodeDetector scanner must not be used');
forbidText(scanner, 'jsQR', 'jsQR fallback must not be used');

requireText(brand, 'buildQrPayload', 'branded QR does not use the short in-app payload');
requireText(brand, 'renderBrandedQr', 'branded QR renderer is missing');
requireText(brand, 'qrPayload', 'branded QR payload is missing');
requireText(brand, 'CorrectLevel?.H', 'branded QR does not use high error correction');
requireText(brand, '_oQRCode', 'custom QR module renderer is missing');
requireText(brand, 'quiet = 4', 'QR quiet zone is missing');
requireText(brand, '__brandedQr', 'RoomInvite openQr override is not installed');
forbidText(brand, 'text: inviteUrl', 'QR must never encode the external Telegram link');
requireText(brandCss, '.room-invite-qr-shell', 'branded QR shell styles are missing');
requireText(brandCss, '.room-invite-qr-brand', 'branded QR label styles are missing');

requireText(addon, '.qv2-room-actions', 'Quartet lobby QR button mount is missing');
requireText(addon, '.bsk-link-row', 'Bible Sketch lobby QR button mount is missing');
requireText(addon, 'data-room-scan="quartet"', 'Quartet scanner button is missing');
requireText(addon, 'data-room-scan="bible-sketch"', 'Bible Sketch scanner button is missing');
requireText(addon, 'data-room-scan-global', 'main menu scanner entry is missing');
requireText(addon, 'telegramRoomShare', 'legacy room share buttons are not replaced');
requireText(addon, 'getShareUrl', 'room share button does not resolve Telegram deep link');
requireText(addon, 't.me/share/url', 'room share button does not use Telegram share flow');
requireText(addon, 'data-action="join"', 'Quartet fallback auto-join is missing');
requireText(addon, 'data-action="join-room"', 'Bible Sketch fallback auto-join is missing');

requireText(inviteCore, "'/telegram/miniapp-config'", 'core backend does not expose Mini App bot config');
requireText(inviteCore, '/getMe', 'core backend does not resolve Telegram bot username');
requireText(balanceCore, "from './index-v7.js'", 'v8 entrypoint must preserve Mini App config runtime');
requireText(secureCore, "from './index-v8.js'", 'v9 entrypoint must preserve v8 runtime');
requireText(richEntryCore, "from './index-v9.js'", 'v10 entrypoint must preserve hardened v9 runtime');
requireText(socialEntryCore, "from './index-v10.js'", 'v11 entrypoint must preserve the Mini App invite runtime');
requireText(wrangler, 'src/index-v11.js', 'v11 Mini App config worker entrypoint is not active');

requireText(gestureJs, 'disableVerticalSwipes', 'Telegram vertical swipe guard is missing');
requireText(gestureJs, "dataset?.currentGame === 'quartet'", 'Quartet-specific pull-down fallback is missing');
requireText(gestureJs, "event.preventDefault()", 'Quartet pull-down fallback does not block top overscroll');
requireText(gestureCss, 'overscroll-behavior-y: none', 'Quartet vertical overscroll containment is missing');

requireText(css, '.room-invite-qr>canvas', 'QR overflow containment styles are missing');
requireText(css, '.room-invite-hint{display:none!important}', 'obsolete QR browser notice is still visible');
requireText(css, '.bsk-room-head', 'Bible Sketch room header mobile fix is missing');
requireText(css, 'grid-template-columns:repeat(3,minmax(0,1fr))', 'Bible Sketch room actions are not laid out responsively');
forbidText(css, '.room-scan-camera', 'obsolete custom camera scanner styles must be removed');

requireText(html, 'room-invite.css?v=3', 'updated QR base styles are not mounted');
requireText(html, 'room-qr-brand.css?v=1', 'branded QR styles are not mounted');
requireText(html, 'room-invite.js?v=3', 'updated room invite helper is not mounted');
requireText(html, 'room-qr-brand.js?v=1', 'branded QR renderer is not mounted');
requireText(html, 'room-qr-scanner.js?v=4', 'fixed Telegram QR scanner is not mounted');
requireText(html, 'room-qr-addon.js?v=4', 'updated room QR addon is not mounted');
requireText(html, 'telegram-gesture-guard.js?v=1', 'Telegram gesture guard is not mounted');
requireText(html, 'quartet-gesture-guard.css?v=1', 'Quartet gesture styles are not mounted');

console.log('Room QR scanner, branded in-app QR payloads, Telegram Mini App links and Quartet swipe guard checks passed through the v11 social-profile entry chain.');
