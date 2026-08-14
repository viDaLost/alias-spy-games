import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`Room invite check failed: ${label}`);
};

const invite = read('room-invite.js');
const addon = read('room-qr-addon.js');
const css = read('room-invite.css');
const html = read('index.html');

requireText(invite, "quartet_v2_room_id", 'Quartet invite does not seed room storage');
requireText(invite, "bible_sketch_room_id_v1", 'Bible Sketch invite does not seed room storage');
requireText(invite, "searchParams.set('join'", 'shareable room URL is missing');
requireText(invite, 'join_', 'Telegram start parameter format is missing');
requireText(invite, 'QRCode', 'QR renderer is missing');
requireText(invite, 'window.showGame', 'invite does not auto-open the target game');
requireText(addon, '.qv2-room-actions', 'Quartet lobby QR button mount is missing');
requireText(addon, '.bsk-link-row', 'Bible Sketch lobby QR button mount is missing');
requireText(addon, "data-action=\"join\"", 'Quartet fallback auto-join is missing');
requireText(addon, "data-action=\"join-room\"", 'Bible Sketch fallback auto-join is missing');
requireText(css, '.room-invite-overlay', 'QR modal styles are missing');
requireText(html, 'room-invite.css?v=1', 'QR styles are not mounted');
requireText(html, 'room-invite.js?v=1', 'room invite helper is not mounted');
requireText(html, 'room-qr-addon.js?v=1', 'room QR addon is not mounted');

console.log('Room QR invite checks passed.');
