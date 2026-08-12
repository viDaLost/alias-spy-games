import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`Support check failed: ${label}`);
};

const core = read('cloudflare/app-core-worker/src/index-v4.js');
const store = read('cloudflare/app-core-worker/src/support-user-store.js');
const web = read('support-center.js');
const html = read('index.html');
const android = read('android-app/app/src/main/java/com/vidalost/biblegames/App.kt');
const repo = read('android-app/app/src/main/java/com/vidalost/biblegames/data/CloudRepository.kt');
const gradle = read('android-app/app/build.gradle');

requireText(core, "supportCreate", 'core route missing');
requireText(core, "notifySupportAdmin", 'Telegram notification missing');
requireText(core, "ADMIN_TELEGRAM_ID", 'admin destination missing');
requireText(store, 'CREATE TABLE IF NOT EXISTS support_tickets', 'ticket SQL missing');
requireText(store, 'CREATE TABLE IF NOT EXISTS support_messages', 'message SQL missing');
requireText(web, 'window.openSupportChat = openSupportCenter', 'legacy web support callback not replaced');
requireText(web, 'supportAdminList', 'admin support panel missing');
requireText(web, 'supportReply', 'admin reply action missing');
requireText(html, 'support-center.js?v=1', 'support JS not mounted');
requireText(html, 'support-center.css?v=1', 'support CSS not mounted');
requireText(android, 'SupportScreen(cloud = cloud', 'Android support navigation missing');
requireText(android, 'AccessRestrictedScreen(', 'blocked-user support route missing');
requireText(repo, 'createSupportTicket', 'Android create API missing');
requireText(repo, 'listSupportTickets', 'Android list API missing');
requireText(gradle, "versionName '2.7.0-native'", 'Android release version is not current');
if (android.includes('t.me/D_a_n_Vi')) throw new Error('Personal Telegram support link is still in Android app');
if (android.includes('openSupport(')) throw new Error('Legacy Android support callback is still present');

console.log('Support center integration checks passed.');
