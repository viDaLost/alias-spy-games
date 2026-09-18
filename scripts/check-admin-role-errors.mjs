import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { parse } from 'acorn';
const source = fs.readFileSync('web/js/admin-live-modal-safety.js', 'utf8');
const ast = parse(source, { ecmaVersion: 'latest' });
let fn;
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' && node.id.name === 'callAdmin') fn = node;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
walk(ast);
let response, sent;
const context = vm.createContext({ window: { apiRequest: async (payload, options) => {
  sent = { payload, options }; return response;
} } });
vm.runInContext(source.slice(fn.start, fn.end), context);
response = { ok: true, status: 200, data: { success: true, targetId: '12345678' } };
assert.equal((await context.callAdmin('adminRoleGrant', { targetId: '12345678' })).targetId, '12345678');
assert.equal(sent.options.raw, true);
assert.equal(sent.payload.targetId, '12345678');
for (const [status, error, expected] of [
  [400, 'Пользователь ещё не запускал приложение', /ещё не запускал/],
  [400, 'Нельзя назначить заблокированного пользователя', /заблокированного/],
  [403, 'Owner only', /Owner only/],
  [401, 'initData expired', /откройте его заново/],
  [500, '', /HTTP 500/],
]) {
  response = { ok: false, status, data: { success: false, error } };
  await assert.rejects(() => context.callAdmin('adminRoleGrant'), expected);
}
response = { ok: false, status: 0, data: null, offline: true };
await assert.rejects(() => context.callAdmin('adminRoleGrant'), /Нет связи/);
console.log('PASS: successful grants, missing/blocked users, owner denial, expired auth and network failures.');
