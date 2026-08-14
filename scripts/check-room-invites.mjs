import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`Room invite check failed: ${label}`);
};
const forbidText = (text, needle, label) => {
  if (text.includes(needle)) throw new Error(`Room invite check failed: ${label}`);
};

const invite = read('room-invite.js');
const scanner = read('room-qr-scanner.js');
const addon = read('room-qr-addon.js');
const css = read('room-invite.css');
const html = read('index.html');

requireText(invite, "quartet_v2_room_id", 'Quartet invite does not seed room storage');
requireText(invite, "bible_sketch_room_id_v1", 'Bible Sketch invite does not seed room storage');
requireText(invite, "searchParams.set('join'", 'shareable room URL is missing');
requireText(invite, 'join_', 'Telegram start parameter format is missing');
requireText(invite, 'biblegames:', 'internal QR payload format is missing');
requireText(invite, 'acceptScanned', 'scanned QR cannot be accepted in-app');
requireText(invite, 'QRCode', 'QR renderer is missing');
requireText(invite, 'window.showGame', 'invite does not auto-open the target game');

requireText(scanner, 'showScanQrPopup', 'Telegram QR scanner is missing');
requireText(scanner, 'acceptScanned', 'scanner does not hand off to room invite flow');
requireText(scanner, 'return true', 'valid Telegram scan does not close the QR popup');
forbidText(scanner, 'getUserMedia', 'browser camera scanner must not be used');
forbidText(scanner, 'BarcodeDetector', 'browser BarcodeDetector scanner must not be used');
forbidText(scanner, 'jsQR', 'jsQR fallback must not be used');

requireText(addon, '.qv2-room-actions', 'Quartet lobby QR button mount is missing');
requireText(addon, '.bsk-link-row', 'Bible Sketch lobby QR button mount is missing');
requireText(addon, 'data-room-scan="quartet"', 'Quartet scanner button is missing');
requireText(addon, 'data-room-scan="bible-sketch"', 'Bible Sketch scanner button is missing');
requireText(addon, 'data-room-scan-global', 'main menu scanner entry is missing');
requireText(addon, 'data-action="join"', 'Quartet fallback auto-join is missing');
requireText(addon, 'data-action="join-room"', 'Bible Sketch fallback auto-join is missing');

requireText(css, '.room-invite-qr>canvas', 'QR overflow containment styles are missing');
requireText(css, '.room-invite-hint{display:none!important}', 'obsolete QR browser notice is still visible');
requireText(css, '.bsk-room-head', 'Bible Sketch room header mobile fix is missing');
requireText(css, 'grid-template-columns:repeat(3,minmax(0,1fr))', 'Bible Sketch room actions are not laid out responsively');
forbidText(css, '.room-scan-camera', 'obsolete custom camera scanner styles must be removed');

requireText(html, 'room-invite.css?v=3', 'updated QR styles are not mounted');
requireText(html, 'room-invite.js?v=2', 'room invite helper is not mounted');
requireText(html, 'room-qr-scanner.js?v=2', 'Telegram QR scanner is not mounted');
requireText(html, 'room-qr-addon.js?v=2', 'room QR addon is not mounted');

console.log('Room QR invite, Telegram scanner and Bible Sketch lobby checks passed.');
