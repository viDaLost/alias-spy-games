// Only signed Telegram launch data or an existing server-issued session proves identity.
const encoder = new TextEncoder();
export const cleanAccessId = (value) => /^[1-9]\d{4,19}$/.test(String(value || '')) ? String(value) : '';
export const accessError = (status, message, code = 'APP_ACCESS_ERROR') => Object.assign(new Error(message), { status, code });

export async function accessStore(env, path, body) {
  const store = env.USERS.get(env.USERS.idFromName('global'));
  const response = await store.fetch(`https://users.internal${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw accessError(response.status >= 400 ? response.status : 403, data.error || 'Access check failed');
  return data;
}

export async function accessIdentity(request, body, env, { fresh = false, optional = false } = {}) {
  const initData = String(body?.telegramInitData || '');
  if (initData) {
    const params = new URLSearchParams(initData);
    if ([...new Set(params.keys())].some((key) => params.getAll(key).length !== 1)) throw accessError(401, 'Telegram data invalid');
    const hash = params.get('hash') || '';
    if (!/^[0-9a-f]{64}$/i.test(hash)) throw accessError(401, 'Telegram signature missing');
    const age = Math.floor(Date.now() / 1000) - Number(params.get('auth_date') || 0);
    if (age < -60 || age > (fresh ? 1800 : 86400)) throw accessError(401, 'Telegram session expired. Reopen the Mini App.');
    if (!env.TELEGRAM_BOT_TOKEN) throw accessError(503, 'Telegram verification unavailable');
    params.delete('hash');
    const signed = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = await hmac(encoder.encode('WebAppData'), encoder.encode(env.TELEGRAM_BOT_TOKEN));
    const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signature = Uint8Array.from(hash.match(/../g), (part) => parseInt(part, 16));
    if (!await crypto.subtle.verify('HMAC', key, signature, encoder.encode(signed))) throw accessError(401, 'Telegram signature invalid');
    let user;
    try { user = JSON.parse(params.get('user') || '{}'); } catch { /* rejected below */ }
    const userId = cleanAccessId(user?.id);
    if (!userId) throw accessError(401, 'Telegram user missing');
    return userId;
  }
  const token = String(request.headers.get('Authorization') || '').match(/^Bearer (bgs_[A-Za-z0-9_-]{40,80})$/i)?.[1];
  if (token && !fresh) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
    const tokenHash = Array.from(hash, (v) => v.toString(16).padStart(2, '0')).join('');
    const session = await accessStore(env, '/android-auth/session', { tokenHash });
    const userId = cleanAccessId(session.userId);
    if (!userId) throw accessError(401, 'Session invalid');
    return userId;
  }
  if (optional && !request.headers.has('Authorization')) return '';
  throw accessError(401, 'Требуется подтверждённый вход в Telegram');
}

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}
