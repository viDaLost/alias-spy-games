export async function forwardAzbuka(path, payload, userId, env, cors) {
  const target = new URL('https://azbuka.internal');
  target.pathname = path.slice('/azbuka'.length);
  const result = await env.AZBUKA.fetch(target.href, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Azbuka-Account': userId },
    body: JSON.stringify(payload || {}),
  });
  const headers = new Headers(result.headers);
  for (const [name, value] of Object.entries(cors)) headers.set(name, value);
  return new Response(result.body, { status: result.status, headers });
}

export async function forwardAzbukaObserver(path, request, env, cors, verifySession) {
  const reply = (error, status) => Response.json({ok:false,error}, {status,headers:cors});
  const verification = await verifySession(new Request('https://core.internal/web/session/verify', {
    headers: {Authorization: request.headers.get('Authorization') || ''},
  }));
  const session = await verification.json();
  if (!verification.ok || session.ok !== true) return reply('Требуется сессия администратора', verification.status >= 400 ? verification.status : 401);
  if (session.scope !== 'admin' || !/^[1-9]\d{4,19}$/.test(session.userId || '')) return reply('Только администратор',403);
  const sweep=path==='/azbuka/admin/rooms/sweep'&&request.method==='POST';
  if(sweep&&session.userId!==String(env.ADMIN_TELEGRAM_ID||''))return reply('Только главный администратор',403);
  const target = new URL('https://azbuka.internal');
  target.pathname = path.slice('/azbuka'.length);
  const result = await env.AZBUKA.fetch(target.href,{
    method:sweep?'POST':'GET',headers:{'X-Azbuka-Account':session.userId,'Content-Type':'application/json',...(sweep?{'X-Azbuka-Sweep':'1'}:{})},
    ...(sweep?{body:await request.text()}:{}),
  });
  const headers = new Headers(result.headers);
  for (const [name,value] of Object.entries(cors)) headers.set(name,value);
  return new Response(result.body,{status:result.status,headers});
}
