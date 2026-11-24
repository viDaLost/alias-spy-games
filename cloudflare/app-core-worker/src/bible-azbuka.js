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
