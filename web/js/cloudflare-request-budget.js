(() => {
  if (window.__CLOUDFLARE_REQUEST_BUDGET__) return;
  if (typeof window.fetch !== 'function') return;

  const upstreamFetch = window.fetch.bind(window);
  const cache = new Map();
  const inFlight = new Map();

  const POLICY = Object.freeze({
    adminLive: { freshMs: 15_000, backgroundMs: 120_000 },
    adminStats: { freshMs: 300_000, backgroundMs: 900_000 },
    observerChanged: { freshMs: 8_000, backgroundMs: 120_000 },
    observerUnchanged: { freshMs: 20_000, backgroundMs: 120_000 },
  });

  function requestMeta(input, init = {}) {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
    let url;
    try { url = new URL(raw, location.href); } catch { return null; }
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    return { url, method };
  }

  function classify(meta) {
    if (!meta || meta.method !== 'GET' || !/\.workers\.dev$/i.test(meta.url.hostname)) return null;
    if (meta.url.pathname === '/admin/live') return { kind: 'adminLive', key: `live:${meta.url.origin}${meta.url.pathname}` };
    if (meta.url.pathname === '/admin/stats') return { kind: 'adminStats', key: `stats:${meta.url.origin}${meta.url.pathname}` };
    if (/^\/admin\/rooms\/[A-Z0-9]{4,10}\/state$/i.test(meta.url.pathname)) {
      return { kind: 'observer', key: `observer:${meta.url.origin}${meta.url.pathname}` };
    }
    return null;
  }

  function responseFrom(entry) {
    return new Response(entry.body, {
      status: entry.status,
      statusText: entry.statusText,
      headers: new Headers(entry.headers),
    });
  }

  function usable(entry, policy) {
    if (!entry) return false;
    const age = Date.now() - entry.at;
    if (document.hidden) return age <= policy.backgroundMs;
    return age <= policy.freshMs;
  }

  async function storeResponse(key, kind, response) {
    if (!(response.ok || response.status === 304)) return response;
    const clone = response.clone();
    const body = await clone.text().catch(() => '');
    const policyKey = kind === 'observer'
      ? (response.status === 304 ? 'observerUnchanged' : 'observerChanged')
      : kind;
    cache.set(key, {
      at: Date.now(),
      policyKey,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      body,
    });
    return response;
  }

  async function budgetedFetch(input, init = {}) {
    const meta = requestMeta(input, init);
    const target = classify(meta);
    if (!target) return upstreamFetch(input, init);

    const existing = cache.get(target.key);
    const policyKey = existing?.policyKey || (target.kind === 'observer' ? 'observerChanged' : target.kind);
    const policy = POLICY[policyKey];
    if (policy && usable(existing, policy)) return responseFrom(existing);

    // A hidden Telegram WebView should not keep polling Cloudflare. If it has
    // already fetched this resource once, keep serving the last local snapshot
    // until the page becomes visible again.
    if (document.hidden && existing) return responseFrom(existing);

    if (inFlight.has(target.key)) {
      const entry = await inFlight.get(target.key);
      if (entry) return responseFrom(entry);
      return upstreamFetch(input, init);
    }

    const request = (async () => {
      try {
        const response = await upstreamFetch(input, init);
        await storeResponse(target.key, target.kind, response);
        return cache.get(target.key) || null;
      } finally {
        inFlight.delete(target.key);
      }
    })();
    inFlight.set(target.key, request);

    const entry = await request;
    if (entry) return responseFrom(entry);
    return upstreamFetch(input, init);
  }

  function invalidate(kind = '') {
    for (const key of cache.keys()) {
      if (!kind || key.startsWith(`${kind}:`) || (kind === 'observer' && key.startsWith('observer:'))) cache.delete(key);
    }
  }

  window.fetch = budgetedFetch;
  window.__CLOUDFLARE_REQUEST_BUDGET__ = true;
  window.CloudflareRequestBudget = Object.freeze({
    invalidate,
    snapshot() {
      return [...cache.entries()].map(([key, value]) => ({ key, ageMs: Date.now() - value.at, status: value.status }));
    },
  });

  // Manual administrator refresh must bypass the local budget cache.
  document.addEventListener('click', (event) => {
    if (event.target?.closest?.('[data-live-refresh]')) invalidate('live');
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      invalidate('live');
      invalidate('observer');
    }
  });
  window.addEventListener('online', () => {
    invalidate('live');
    invalidate('observer');
  });
})();
