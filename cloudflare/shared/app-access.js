// Call only after the room has verified its Telegram proof/session signature.
export async function requireAppAccess(env, playerId) {
  if (!env.APP_ACCESS) throw Object.assign(new Error('Проверка доступа временно недоступна'), { status: 503, code: 'APP_ACCESS_UNAVAILABLE' });
  const userId = String(playerId || '').match(/^tg:([1-9]\d{4,19})$/)?.[1] || '';
  const result = await env.APP_ACCESS.check(userId);
  if (result?.allowed !== true) throw Object.assign(new Error('Библейские игры временно заблокированы. Ваши данные и достижения на месте.'), { status: 403, code: 'APP_RESTRICTED' });
}

export async function allowAppSocket(env, socket, playerId) {
  try { await requireAppAccess(env, playerId); return true; }
  catch (error) {
    try { socket.send(JSON.stringify({ type: 'error', code: error.code || 'APP_ACCESS_UNAVAILABLE', error: error.message })); } catch { /* already closed */ }
    try { socket.close(1008, 'Application access restricted'); } catch { /* already closed */ }
    return false;
  }
}
