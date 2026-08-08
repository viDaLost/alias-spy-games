(() => {
  const legacyUrl = 'https://script.google.com/macros/s/AKfycbx0o9HmRIF6vNuBUB2N4H3YuabJzYbRmAxvHCCwqnbMPn29Crv5W3FT1XGDF6VyFSn9/exec';
  const coreUrl = String(document.querySelector('meta[name="app-core-backend"]')?.content || '').replace(/\/+$/, '');
  if (!coreUrl || typeof window.fetch !== 'function') return;

  const originalFetch = window.fetch.bind(window);
  let coreHealthy = true;
  let retryAfter = 0;

  window.fetch = async function bridgedFetch(input, init = {}) {
    const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    if (requestUrl !== legacyUrl || method !== 'POST') return originalFetch(input, init);

    const telegramInitData = String(window.Telegram?.WebApp?.initData || '');
    if (!telegramInitData || (Date.now() < retryAfter && !coreHealthy)) return originalFetch(input, init);

    let payload;
    try {
      const rawBody = init?.body !== undefined ? init.body : (input instanceof Request ? await input.clone().text() : '');
      payload = typeof rawBody === 'string' ? JSON.parse(rawBody || '{}') : rawBody;
    } catch {
      return originalFetch(input, init);
    }

    if (!payload || typeof payload !== 'object' || !payload.action) return originalFetch(input, init);

    try {
      const response = await originalFetch(`${coreUrl}/compat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, telegramInitData }),
        cache: 'no-store',
      });

      if (response.ok) {
        coreHealthy = true;
        retryAfter = 0;
        return response;
      }

      coreHealthy = false;
      retryAfter = Date.now() + 20_000;
    } catch {
      coreHealthy = false;
      retryAfter = Date.now() + 20_000;
    }

    // Переходный режим: если новый backend недоступен, приложение продолжает
    // работать через прежний Apps Script без действий со стороны пользователя.
    return originalFetch(input, init);
  };

  window.AppCoreBridge = {
    backend: coreUrl,
    legacyFallbackEnabled: true,
    status() {
      return { coreHealthy, retryAfter };
    },
  };
})();
