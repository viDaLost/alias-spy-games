export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, preview: 'bible-find9', assets: 'png', version: 'png-1' }, { headers: { 'cache-control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  }
};
