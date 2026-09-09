export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, preview: 'bible-find9', assets: 'png', version: 'art-2' }, { headers: { 'cache-control': 'no-store' } });
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'no-cache');
    return new Response(response.body, { status: response.status, headers });
  }
};
