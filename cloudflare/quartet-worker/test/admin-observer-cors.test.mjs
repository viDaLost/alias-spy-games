import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index-admin-observer-v2.js';

const ORIGIN = 'https://vidalost.github.io';

function preflight(origin = ORIGIN) {
  return new Request('https://quartet.test/admin/rooms/73CYVA/state', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,if-none-match',
    },
  });
}

test('admin observer preflight succeeds without Authorization header', async () => {
  const response = await worker.fetch(preflight(), { ALLOWED_ORIGINS: ORIGIN }, {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(response.headers.get('Access-Control-Allow-Headers') || '', /Authorization/i);
  assert.match(response.headers.get('Access-Control-Allow-Headers') || '', /If-None-Match/i);
  assert.match(response.headers.get('Access-Control-Allow-Methods') || '', /GET/i);
});

test('admin observer preflight rejects an untrusted origin', async () => {
  const response = await worker.fetch(preflight('https://evil.example'), { ALLOWED_ORIGINS: ORIGIN }, {});
  assert.equal(response.status, 403);
});
