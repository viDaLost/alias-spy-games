import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const requireText = (source, text, label) => {
  if (!source.includes(text)) throw new Error(`Admin RBAC check failed: ${label}`);
};
const forbidText = (source, text, label) => {
  if (source.includes(text)) throw new Error(`Admin RBAC check failed: ${label}`);
};

const rbac = read('cloudflare/app-core-worker/src/index-v13.js');
const session = read('cloudflare/app-core-worker/src/index-v14.js');
const wrangler = read('cloudflare/app-core-worker/wrangler.jsonc');
const client = read('web/js/admin-live-modal-safety.js');
const css = read('web/styles/admin-live-compact.css');

// The production entrypoint moves forward as layers are added, so resolve the import
// chain from wrangler.jsonc instead of pinning one version number here.
const coreEntry = wrangler.match(/"main"\s*:\s*"src\/([^"]+)"/)?.[1];
if (!coreEntry) throw new Error('Admin RBAC check failed: Core worker entrypoint is not declared in wrangler.jsonc');
const coreChain = [];
for (let file = coreEntry; file && !coreChain.includes(file); ) {
  coreChain.push(file);
  const src = read(`cloudflare/app-core-worker/src/${file}`);
  file = src.match(/^import\s+[^;]*from\s+'\.\/(index-v\d+\.js)'/m)?.[1];
}
requireText(coreChain.join(' '), 'index-v14.js', 'production Core entrypoint does not reach the RBAC session facade');
requireText(coreChain.join(' '), 'index-v13.js', 'production Core entrypoint does not reach the RBAC layer');
requireText(rbac, 'CREATE TABLE IF NOT EXISTS admin_roles', 'delegated roles are not persisted server-side');
requireText(rbac, 'CREATE TABLE IF NOT EXISTS admin_role_audit', 'role grants/revokes are not audited');
requireText(rbac, 'CREATE TABLE IF NOT EXISTS admin_action_audit', 'privileged actions are not audited');
requireText(rbac, "actorId !== ownerId", 'role mutation is not owner-only inside the Durable Object');
requireText(rbac, "targetId === ownerId", 'immutable owner protection is missing');
requireText(rbac, "targetRole.isRoot === true && type === 'ban'", 'root ban protection is missing');
requireText(rbac, "role.isRoot !== true && targetRole.isAdmin === true", 'delegated admins can mutate privileged accounts');
requireText(rbac, 'verifyAdminInitData', 'privileged compat actions do not verify signed Telegram initData');
requireText(rbac, 'ADMIN_AUTH_MAX_AGE_SECONDS = 30 * 60', 'fresh admin-auth window is missing');
requireText(rbac, "'/admin-role/check'", 'server role lookup is missing');
requireText(rbac, "'/admin-role/grant'", 'server role grant route is missing');
requireText(rbac, "'/admin-role/revoke'", 'server role revoke route is missing');
forbidText(rbac, 'payload.adminId', 'client-supplied adminId is trusted by RBAC');
forbidText(rbac, 'body.adminId', 'client-supplied adminId is trusted by RBAC');

requireText(session, "url.pathname === '/web/session'", 'admin session issuance is not intercepted');
requireText(session, "url.pathname === '/web/session/verify'", 'admin session verification is not intercepted');
requireText(session, 'requireAdminRole(store, session.userId)', 'existing admin tokens are not rechecked against current role');
requireText(session, 'verifyFreshAdminInitData', 'admin session creation does not require fresh Telegram proof');
requireText(session, 'ADMIN_INIT_DATA_MAX_AGE_SECONDS = 30 * 60', 'admin session Telegram proof is too long-lived');
requireText(session, "url.pathname === '/admin/verify'", 'legacy direct admin verification does not use RBAC');
requireText(session, "action === 'getAdminUsersByIds'", 'live admin user lookup parity is missing');
requireText(session, "action === 'adminMessageUser'", 'live admin messaging parity is missing');
requireText(session, "type === 'stars_bmt'", 'BMT admin balance parity is missing');
forbidText(session, 'payload.adminId', 'client-supplied adminId is trusted by session facade');
forbidText(session, 'body.adminId', 'client-supplied adminId is trusted by session facade');

requireText(client, "callAdmin('adminRoleStatus')", 'admin button is not gated by a server role check');
requireText(client, "callAdmin('adminRoleList')", 'root role manager cannot list administrators');
requireText(client, "callAdmin('adminRoleGrant'", 'root role manager cannot grant administrators');
requireText(client, "callAdmin('adminRoleRevoke'", 'root role manager cannot revoke administrators');
requireText(client, "event.stopImmediatePropagation()", 'admin button can bypass the verification click gate');
requireText(client, "refreshRole({ force: true })", 'privileged UI actions do not refresh role before use');
requireText(client, "if (!role.isRoot)", 'client role manager is not root-only');
requireText(client, "if (isStandaloneAndroid()) return clearRole()", 'Android must not accidentally expose the web admin panel');
requireText(css, 'html:not(.admin-rbac-authorized) #admin-btn', 'admin button is not hidden before server authorization');
requireText(css, '.admin-rbac-manager', 'root administrator manager UI is not styled/mounted');

console.log('Admin RBAC checks passed: immutable root, server-only delegated roles, fresh Telegram proof, revocable sessions, privileged-target isolation and server-gated UI.');
