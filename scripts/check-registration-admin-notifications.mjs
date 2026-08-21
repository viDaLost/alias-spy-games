import fs from 'node:fs';
import { deliverRegistrationCode, notifyRegistrationConfirmed } from '../cloudflare/app-core-worker/src/auth-notifications.js';

const core = fs.readFileSync('cloudflare/app-core-worker/src/index-v4.js', 'utf8');
const wrangler = fs.readFileSync('cloudflare/app-core-worker/wrangler.jsonc', 'utf8');
const workflow = fs.readFileSync('.github/workflows/deploy-core-cloudflare.yml', 'utf8');
const requireText = (text, token, label) => {
  if (!text.includes(token)) throw new Error(`Registration notification check failed: ${label}`);
};

requireText(core, 'deliverRegistrationCode(env, { telegramId, code, challengeId })', 'code delivery helper is not used');
requireText(core, 'notifyRegistrationConfirmed(env, { telegramId, challengeId })', 'confirmation notification is not used');
requireText(core, 'adminCopyDelivered', 'auth request does not report administrative delivery');
requireText(core, 'adminConfirmationDelivered', 'auth verification does not report administrative confirmation');
requireText(wrangler, '"ADMIN_TELEGRAM_ID": "1288379477"', 'administrator Telegram ID is not configured');
requireText(wrangler, '"ADMIN_AUTH_CODE_COPY_ENABLED": "true"', 'administrator code copy is not explicitly enabled');
requireText(workflow, 'Verify registration code delivery to administrator', 'deployed registration delivery is not checked');

const originalFetch = globalThis.fetch;
const deliveries = [];
globalThis.fetch = async (_url, options = {}) => {
  deliveries.push(JSON.parse(String(options.body || '{}')));
  return new Response(JSON.stringify({ ok: true, result: { message_id: deliveries.length } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

try {
  const env = {
    TELEGRAM_BOT_TOKEN: 'test-token',
    ADMIN_TELEGRAM_ID: '1288379477',
    ADMIN_AUTH_CODE_COPY_ENABLED: 'true',
  };
  const challengeId = 'ach_12345678901234567890123456789012';
  const delivery = await deliverRegistrationCode(env, {
    telegramId: '555555555',
    code: '314159',
    challengeId,
  });
  if (!delivery.ok || delivery.adminDelivery.ok !== true || deliveries.length !== 2) {
    throw new Error('user and administrator code messages were not both delivered');
  }
  if (String(deliveries[0].chat_id) !== '555555555' || !deliveries[0].text.includes('314159')) {
    throw new Error('the player did not receive the expected code');
  }
  if (String(deliveries[1].chat_id) !== '1288379477'
      || !deliveries[1].text.includes('314159')
      || !deliveries[1].text.includes('555555555')) {
    throw new Error('the administrator copy lacks the code or source Telegram ID');
  }

  const confirmation = await notifyRegistrationConfirmed(env, {
    telegramId: '555555555',
    challengeId,
  });
  if (!confirmation.ok || deliveries.length !== 3
      || String(deliveries[2].chat_id) !== '1288379477'
      || !deliveries[2].text.includes('555555555')) {
    throw new Error('the administrator confirmation lacks the verified Telegram ID');
  }

  let failedCalls = 0;
  globalThis.fetch = async () => {
    failedCalls += 1;
    return new Response(JSON.stringify({ ok: false, description: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const failed = await deliverRegistrationCode(env, {
    telegramId: '666666666',
    code: '271828',
    challengeId: 'ach_abcdefghijabcdefghijabcdefghij12',
  });
  if (failed.ok || failedCalls !== 1) {
    throw new Error('administrator copy must not be sent when player delivery failed');
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Registration code delivery and administrator ID notifications passed');
