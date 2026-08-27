import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) throw new Error(`Referral/retention check failed: ${label}`);
};
const forbidText = (text, needle, label) => {
  if (text.includes(needle)) throw new Error(`Referral/retention check failed: ${label}`);
};

const worker = read('cloudflare/app-core-worker/src/index-v6.js');
const inviteWorker = read('cloudflare/app-core-worker/src/index-v7.js');
const balanceWorker = read('cloudflare/app-core-worker/src/index-v8.js');
const secureWorker = read('cloudflare/app-core-worker/src/index-v9.js');
const entryWorker = read('cloudflare/app-core-worker/src/index-v10.js');
const wrangler = read('cloudflare/app-core-worker/wrangler.jsonc');
const survey = read('web/js/referral-survey.js');
const html = read('index.html');

requireText(worker, 'CREATE TABLE IF NOT EXISTS acquisition_sources', 'survey answers are not persisted in SQL');
requireText(worker, "'referralStatus'", 'referral status action is missing');
requireText(worker, "'referralSubmit'", 'referral submit action is missing');
requireText(worker, 'notifyReferralAdmin', 'survey answers are not delivered to the admin bot');
requireText(worker, '30 * 24 * 60 * 60 * 1000', '30-day inactivity threshold is missing');
requireText(worker, 'u.is_banned = 0', 'banned accounts are not protected from cleanup');
requireText(worker, 'u.telegram_id <> ?', 'admin account is not protected from cleanup');
requireText(worker, 'DELETE FROM support_tickets WHERE user_id = ?', 'support data is not removed with an inactive account');
requireText(worker, 'DELETE FROM android_sessions WHERE telegram_id = ?', 'Android sessions are not removed with an inactive account');
requireText(worker, 'this.ctx.storage.delete(`user:${id}`)', 'legacy KV backup record is not removed with an inactive account');
requireText(worker, 'async scheduled(', 'scheduled cleanup handler is missing');
requireText(inviteWorker, "from './index-v6.js'", 'v7 entrypoint must preserve retention runtime');
requireText(balanceWorker, "from './index-v7.js'", 'v8 entrypoint must preserve v7 runtime');
requireText(secureWorker, "from './index-v8.js'", 'v9 entrypoint must preserve v8 runtime');
requireText(entryWorker, "from './index-v9.js'", 'v10 entrypoint must preserve hardened v9 runtime');

requireText(wrangler, '"main": "src/index-v10.js"', 'v10 worker entry is not active');
requireText(wrangler, '"crons"', 'daily cleanup cron is not configured');

requireText(survey, 'Откуда вы узнали о «Библейских играх»?', 'survey question is missing');
requireText(survey, '<textarea', 'survey must use free-text input');
requireText(survey, "api('referralStatus')", 'survey does not check whether the user already answered');
requireText(survey, "api('referralSubmit'", 'survey does not submit an answer');
requireText(survey, 'Позже', 'survey has no non-blocking defer action');
forbidText(survey, '<select', 'survey must not replace free-text input with preset choices');
requireText(html, 'referral-survey.js?v=1', 'survey script is not mounted');

console.log('Referral survey and 30-day inactive account cleanup checks passed through the v10 entry chain.');
