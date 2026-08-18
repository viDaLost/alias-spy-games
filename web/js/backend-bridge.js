(() => {
  const legacyUrl = 'https://script.google.com/macros/s/AKfycbx0o9HmRIF6vNuBUB2N4H3YuabJzYbRmAxvHCCwqnbMPn29Crv5W3FT1XGDF6VyFSn9/exec';
  const coreUrl = String(document.querySelector('meta[name="app-core-backend"]')?.content || '').replace(/\/+$/, '');
  if (!coreUrl || typeof window.fetch !== 'function') return;

  const originalFetch = window.fetch.bind(window);
  const CORE_TIMEOUT_MS = 5000;
  const FAILURE_COOLDOWN_MS = 30000;
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

  function unavailableResponse(reason = 'temporarily unavailable') {
    return jsonResponse({ success: false, error: `Cloudflare backend is ${reason}` }, 503);
  }

  async function callCore(path, body) {
    const now = Date.now();
    if (!coreHealthy && lastFailureAt && now - lastFailureAt < FAILURE_COOLDOWN_MS) {
      return unavailableResponse('cooling down after a failed request');
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeoutId = 0;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        try { controller?.abort(); } catch {}
        const error = new Error(`Core request timed out after ${CORE_TIMEOUT_MS}ms`);
        error.name = 'TimeoutError';
        reject(error);
      }, CORE_TIMEOUT_MS);
    });

    try {
      const request = originalFetch(`${coreUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        ...(controller ? { signal: controller.signal } : {}),
      });
      const response = await Promise.race([request, timeout]);
      coreHealthy = response.ok;
      if (!response.ok) lastFailureAt = Date.now();
      else lastFailureAt = 0;
      return response;
    } catch (error) {
      coreHealthy = false;
      lastFailureAt = Date.now();
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        console.warn('[AppCoreBridge] Access request timed out; continuing with local app state.');
      } else {
        console.warn('[AppCoreBridge] Core request failed; continuing with local app state.', error);
      }
      return unavailableResponse();
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  window.fetch = async function bridgedFetch(input, init = {}) {
    const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

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

    const androidId = String(window.__ANDROID_TELEGRAM_ID__ || '').trim();
    if (window.__ANDROID_APK__ === true && /^\d{5,20}$/.test(androidId)) {
      return callCore('/android/compat', { payload, androidUserId: androidId });
    }

    const telegramInitData = String(window.Telegram?.WebApp?.initData || '');
    if (!telegramInitData) return guestResponse(payload);

    return callCore('/compat', { payload, telegramInitData });
  };

  window.AppCoreBridge = {
    backend: coreUrl,
    source: 'cloudflare',
    legacyFallbackEnabled: false,
    timeoutMs: CORE_TIMEOUT_MS,
    status() {
      return { coreHealthy, lastFailureAt, legacyFallbackEnabled: false, timeoutMs: CORE_TIMEOUT_MS };
    },
  };
})();
