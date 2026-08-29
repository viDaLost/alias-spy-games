(() => {
  const legacyUrl = 'https://script.google.com/macros/s/AKfycbx0o9HmRIF6vNuBUB2N4H3YuabJzYbRmAxvHCCwqnbMPn29Crv5W3FT1XGDF6VyFSn9/exec';
  const coreUrl = String(document.querySelector('meta[name="app-core-backend"]')?.content || '').replace(/\/+$/, '');
  if (!coreUrl || typeof window.fetch !== 'function') return;

  const coreCompatUrl = `${coreUrl}/compat`;
  const originalFetch = window.fetch.bind(window);
  const ACCESS_TIMEOUT_MS = 5000;
  const DEFAULT_TIMEOUT_MS = 20000;
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

  function androidSessionToken() {
    if (window.__ANDROID_APK__ !== true) return '';
    try {
      return String(window.AndroidApp?.getSessionToken?.() || '').trim();
    } catch {
      return '';
    }
  }

  function requestPolicy(body) {
    const action = String(body?.payload?.action || '');
    const isAccessCheck = action === 'syncUser';
    return {
      action,
      timeoutMs: isAccessCheck ? ACCESS_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
      useFailureCooldown: isAccessCheck,
    };
  }

  async function callCore(path, body, authToken = '') {
    const policy = requestPolicy(body);
    const now = Date.now();
    if (policy.useFailureCooldown && !coreHealthy && lastFailureAt && now - lastFailureAt < FAILURE_COOLDOWN_MS) {
      return unavailableResponse('cooling down after a failed request');
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timeoutId = 0;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        try { controller?.abort(); } catch {}
        const error = new Error(`Core request timed out after ${policy.timeoutMs}ms`);
        error.name = 'TimeoutError';
        reject(error);
      }, policy.timeoutMs);
    });

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      const request = originalFetch(`${coreUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        cache: 'no-store',
        ...(controller ? { signal: controller.signal } : {}),
      });
      const response = await Promise.race([request, timeout]);
      const serverFailure = response.status >= 500 || response.status === 429;
      coreHealthy = !serverFailure;
      if (serverFailure) lastFailureAt = Date.now();
      else lastFailureAt = 0;
      return response;
    } catch (error) {
      coreHealthy = false;
      lastFailureAt = Date.now();
      const label = policy.action || path;
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        console.warn(`[AppCoreBridge] ${label} request timed out after ${policy.timeoutMs}ms; continuing with local app state.`);
      } else {
        console.warn(`[AppCoreBridge] ${label} request failed; continuing with local app state.`, error);
      }
      return unavailableResponse();
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  window.fetch = async function bridgedFetch(input, init = {}) {
    const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const isLegacyRequest = requestUrl === legacyUrl;
    const isCoreCompatRequest = requestUrl === coreCompatUrl;

    if (method !== 'POST' || (!isLegacyRequest && !isCoreCompatRequest)) {
      return originalFetch(input, init);
    }

    let parsedBody;
    try {
      const rawBody = init?.body !== undefined ? init.body : (input instanceof Request ? await input.clone().text() : '');
      parsedBody = typeof rawBody === 'string' ? JSON.parse(rawBody || '{}') : rawBody;
    } catch {
      return jsonResponse({ success: false, error: 'Invalid API payload' }, 400);
    }

    const payload = isCoreCompatRequest
      ? (parsedBody?.payload && typeof parsedBody.payload === 'object' ? parsedBody.payload : {})
      : parsedBody;

    if (!payload || typeof payload !== 'object' || !payload.action) {
      return jsonResponse({ success: false, error: 'API action required' }, 400);
    }

    const androidId = String(window.__ANDROID_TELEGRAM_ID__ || '').trim();
    if (window.__ANDROID_APK__ === true && /^\d{5,20}$/.test(androidId)) {
      const token = androidSessionToken();
      if (!token) return jsonResponse({ success: false, ok: false, error: 'Android session unavailable' }, 401);
      return callCore('/android/compat', { payload, androidUserId: androidId }, token);
    }

    // Native web callers already target /compat and should keep their original
    // Telegram-authenticated request untouched.
    if (isCoreCompatRequest) return originalFetch(input, init);

    const telegramInitData = String(window.Telegram?.WebApp?.initData || '');
    if (!telegramInitData) return guestResponse(payload);

    return callCore('/compat', { payload, telegramInitData });
  };

  window.AppCoreBridge = {
    backend: coreUrl,
    source: 'cloudflare',
    legacyFallbackEnabled: false,
    androidAuthenticated: window.__ANDROID_APK__ === true,
    timeoutMs: ACCESS_TIMEOUT_MS,
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    status() {
      return {
        coreHealthy,
        lastFailureAt,
        legacyFallbackEnabled: false,
        androidAuthenticated: window.__ANDROID_APK__ === true && Boolean(androidSessionToken()),
        timeoutMs: ACCESS_TIMEOUT_MS,
        defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
      };
    },
  };
})();
