import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

const { outputFiles: [bundle] } = await build({
  entryPoints: ['cloudflare/app-core-worker/src/index-v4.js'],
  bundle: true,
  write: false,
  format: 'esm',
  plugins: [{
    name: 'mock-durable-object-base',
    setup(builder) {
      builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'workers', namespace: 'test' }));
      builder.onLoad({ filter: /^workers$/, namespace: 'test' }, () => ({ contents: 'export class DurableObject {}' }));
    },
  }],
});
const { default: worker, UserStore } = await import(`data:text/javascript;base64,${Buffer.from(bundle.contents).toString('base64')}`);
const database = new DatabaseSync(':memory:');
const pendingTasks = [];
const messages = [];
const player = '555555555';
const admin = '999999999';
const env = {
  TELEGRAM_BOT_TOKEN: 'test-token',
  ADMIN_TELEGRAM_ID: admin,
  ADMIN_AUTH_CODE_COPY_ENABLED: 'true',
  USERS: {
    idFromName: (name) => name,
    get: () => ({ fetch: (url, options) => store.fetch(new Request(url, options)) }),
  },
};
const ctx = { waitUntil: (task) => pendingTasks.push(task) };
const objectCtx = {
  storage: {
    sql: {
      exec(query, ...params) {
        if (!/^\s*(SELECT|PRAGMA)\b/i.test(query)) {
          if (params.length) database.prepare(query).run(...params);
          else database.exec(query);
          return { toArray: () => [] };
        }
        const rows = database.prepare(query).all(...params);
        return { toArray: () => rows };
      },
    },
    list: async () => new Map(),
    transactionSync: (run) => run(),
  },
};
// Start with the schema from a deployed worker to exercise the migration too.
database.exec(`
  CREATE TABLE android_auth_challenges (
    id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, code_hash TEXT NOT NULL,
    request_key TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );
`);
const store = new UserStore(objectCtx, env);

function auth(path, payload) {
  return worker.fetch(new Request(`https://core.example/android/auth/${path}`, {
    method: 'POST',
    headers: { Origin: 'https://vidalost.github.io', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }), env, ctx);
}

const ok = () => Response.json({ ok: true });
const originalFetch = globalThis.fetch;
let releaseUser;
let releaseAdmin;
const userReply = new Promise((resolve) => { releaseUser = resolve; });
const adminReply = new Promise((resolve) => { releaseAdmin = resolve; });
let signalUserRequest;
const userRequestStarted = new Promise((resolve) => { signalUserRequest = resolve; });
globalThis.fetch = async (url, options) => {
  assert.match(String(url), /\/sendMessage$/);
  const message = JSON.parse(options.body);
  messages.push(message);
  if (message.chat_id === admin) return adminReply;
  signalUserRequest();
  return userReply;
};

try {
  const challengeId = 'ach_12345678901234567890123456789012';
  const payload = { telegramId: player, challengeId };
  const request = auth('request', payload);
  await userRequestStarted;

  const pendingRetry = await (await auth('request', payload)).json();
  assert.equal(pendingRetry.deliveryConfirmed, false, 'a concurrent retry cannot confirm pending delivery');
  assert.equal(messages.length, 1, 'a retry cannot send another code');

  releaseUser(ok());
  const response = await request;
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deliveryConfirmed, true);
  assert.equal(pendingTasks.length, 1);
  assert.equal(messages[1].chat_id, admin);
  assert.match(messages[1].text, new RegExp(player));

  const retry = await (await auth('request', payload)).json();
  assert.equal(retry.deliveryConfirmed, true);
  assert.equal(messages.length, 2);

  const code = messages[0].text.match(/Код подтверждения: (\d{6})/)[1];
  assert.ok(messages[1].text.includes(code));
  const verification = await auth('verify', { ...payload, code });
  assert.equal(verification.status, 200);
  assert.equal((await verification.json()).userId, player);
  assert.equal(pendingTasks.length, 2);
  assert.match(messages[2].text, new RegExp(player));
  releaseAdmin(ok());
  await Promise.all(pendingTasks);

  const failedId = 'ach_abcdefghijabcdefghijabcdefghij12';
  globalThis.fetch = async () => Response.json({ ok: false, description: 'Bad Request: chat not found' }, { status: 400 });
  const noBot = await auth('request', { telegramId: player, challengeId: failedId });
  assert.equal(noBot.status, 409);
  assert.equal((await noBot.json()).requiresBotStart, true);
  assert.equal(pendingTasks.length, 2, 'definitive failures must not send a copy to the administrator');

  globalThis.fetch = async () => { throw new Error('response lost'); };
  const unknown = await auth('request', { telegramId: player, challengeId: failedId });
  assert.equal(unknown.status, 200);
  assert.equal((await unknown.json()).deliveryConfirmed, false);
  assert.equal(database.prepare('SELECT delivery_confirmed FROM android_auth_challenges WHERE id = ?').get(failedId).delivery_confirmed, 0);
} finally {
  globalThis.fetch = originalFetch;
  database.close();
}

console.log('Android code delivery, retries, and background registration notifications passed.');
