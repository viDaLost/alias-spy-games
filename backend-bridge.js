(() => {
  const legacyUrl = 'https://script.google.com/macros/s/AKfycbx0o9HmRIF6vNuBUB2N4H3YuabJzYbRmAxvHCCwqnbMPn29Crv5W3FT1XGDF6VyFSn9/exec';
  const coreUrl = String(document.querySelector('meta[name="app-core-backend"]')?.content || '').replace(/\/+$/, '');
  if (!coreUrl || typeof window.fetch !== 'function') return;

  const originalFetch = window.fetch.bind(window);
  let coreHealthy = true;
  let lastFailureAt = 0;

  function jsonResponse(value, status = 200) {
    return new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  function guestResponse(payload) {
    const action = String(payload?.action || '');
    if (action === 'syncUser') {
      const user = payload?.user || {};
      return jsonResponse({
        success: true,
        isBanned: false,
        wowStars: Number.isFinite(Number(user.wowStars)) ? Number(user.wowStars) : 20,
        wsStars: Number.isFinite(Number(user.wsStars)) ? Number(user.wsStars) : 0,
        swLevel: Number.isFinite(Number(user.swLevel)) ? Number(user.swLevel) : 0,
        lastGames: Array.isArray(user.lastGames) ? user.lastGames.slice(0, 3) : [],
        source: 'guest-local',
      });
    }
    if (action === 'updateHistory') return jsonResponse({ success: true, source: 'guest-local' });
    return jsonResponse({ success: false, error: 'Telegram authorization required' }, 401);
  }

  window.fetch = async function bridgedFetch(input, init = {}) {
    const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    // app.js still calls the historical compatibility URL. We intercept every
    // such request here, so user/admin data never reaches Apps Script anymore.
    if (requestUrl !== legacyUrl || method !== 'POST') return originalFetch(input, init);

    let payload;
    try {
      const rawBody = init?.body !== undefined ? init.body : (input instanceof Request ? await input.clone().text() : '');
      payload = typeof rawBody === 'string' ? JSON.parse(rawBody || '{}') : rawBody;
    } catch {
      return jsonResponse({ success: false, error: 'Invalid API payload' }, 400);
    }

    if (!payload || typeof payload !== 'object' || !payload.action) {
      return jsonResponse({ success: false, error: 'API action required' }, 400);
    }

    const telegramInitData = String(window.Telegram?.WebApp?.initData || '');
    if (!telegramInitData) return guestResponse(payload);

    try {
      const response = await originalFetch(`${coreUrl}/compat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, telegramInitData }),
        cache: 'no-store',
      });
      coreHealthy = response.ok;
      if (!response.ok) lastFailureAt = Date.now();
      return response;
    } catch (error) {
      coreHealthy = false;
      lastFailureAt = Date.now();
      return jsonResponse({
        success: false,
        error: 'Cloudflare backend is temporarily unavailable',
      }, 503);
    }
  };

  window.AppCoreBridge = {
    backend: coreUrl,
    source: 'cloudflare',
    legacyFallbackEnabled: false,
    status() {
      return { coreHealthy, lastFailureAt, legacyFallbackEnabled: false };
    },
  };
})();
