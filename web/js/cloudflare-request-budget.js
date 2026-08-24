(() => {
  if (window.__CLOUDFLARE_REQUEST_BUDGET__) return;
  if (typeof window.fetch !== 'function') return;

  const upstreamFetch = window.fetch.bind(window);
  const cache = new Map();
  const inFlight = new Map();
  const roomJoinAt = new Map();
  let lastUserIntentAt = 0;

  const POLICY = Object.freeze({
    adminLive: { freshMs: 15_000, backgroundMs: 120_000 },
    adminStats: { freshMs: 300_000, backgroundMs: 900_000 },
    observerChanged: { freshMs: 8_000, backgroundMs: 120_000 },
    observerUnchanged: { freshMs: 20_000, backgroundMs: 120_000 },
    roomJoinMinMs: 30_000,
    manualIntentMs: 2_500,
  });

  function requestMeta(input, init = {}) {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
    let url;
    try { url = new URL(raw, location.href); } catch { return null; }
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    return { url, method };
  }

  function classify(meta) {
    if (!meta || !/\.workers\.dev$/i.test(meta.url.hostname)) return null;
    if (meta.method === 'GET' && meta.url.pathname === '/admin/live') return { kind: 'adminLive', key: `live:${meta.url.origin}${meta.url.pathname}` };
    if (meta.method === 'GET' && meta.url.pathname === '/admin/stats') return { kind: 'adminStats', key: `stats:${meta.url.origin}${meta.url.pathname}` };
    if (meta.method === 'GET' && /^\/admin\/rooms\/[A-Z0-9]{4,10}\/state$/i.test(meta.url.pathname)) {
      return { kind: 'observer', key: `observer:${meta.url.origin}${meta.url.pathname}` };
    }
    if (meta.method === 'POST' && /^\/rooms\/[A-Z0-9]{4,10}\/join$/i.test(meta.url.pathname)) {
      return { kind: 'roomJoin', key: `roomJoin:${meta.url.origin}${meta.url.pathname}` };
    }
    return null;
  }

  function responseFrom(entry) {
    const body = [204, 205, 304].includes(Number(entry.status)) ? null : entry.body;
    return new Response(body, {
      status: entry.status,
      statusText: entry.statusText,
      headers: new Headers(entry.headers),
    });
  }

  function localBackoffResponse(reason = 'CLIENT_RECONNECT_BACKOFF') {
    return new Response(JSON.stringify({ ok: false, error: reason }), {
      status: 429,
      statusText: 'Client reconnect backoff',
      headers: { 'Content-Type': 'application/json', 'X-Client-Backoff': '1' },
    });
  }

  function usable(entry, policy) {
    if (!entry) return false;
    const age = Date.now() - entry.at;
    if (document.hidden) return age <= policy.backgroundMs;
    return age <= policy.freshMs;
  }

  async function captureResponse(response, kind) {
    const body = await response.clone().text().catch(() => '');
    return {
      at: Date.now(),
      policyKey: kind === 'observer'
        ? (response.status === 304 ? 'observerUnchanged' : 'observerChanged')
        : kind,
      cacheable: response.ok || response.status === 304,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      body,
    };
  }

  async function budgetRoomJoin(input, init, target) {
    const now = Date.now();
    const manual = now - lastUserIntentAt <= POLICY.manualIntentMs;
    if (document.hidden) return localBackoffResponse('CLIENT_BACKGROUND_PAUSE');

    const last = Number(roomJoinAt.get(target.key) || 0);
    if (!manual && last && now - last < POLICY.roomJoinMinMs) {
      return localBackoffResponse();
    }

    let pending = inFlight.get(target.key);
    if (!pending) {
      roomJoinAt.set(target.key, now);
      pending = (async () => {
        try {
          const response = await upstreamFetch(input, init);
          return captureResponse(response, 'roomJoin');
        } finally {
          inFlight.delete(target.key);
        }
      })();
      inFlight.set(target.key, pending);
    }
    return responseFrom(await pending);
  }

  async function budgetedFetch(input, init = {}) {
    const meta = requestMeta(input, init);
    const target = classify(meta);
    if (!target) return upstreamFetch(input, init);
    if (target.kind === 'roomJoin') return budgetRoomJoin(input, init, target);

    const existing = cache.get(target.key);
    const policyKey = existing?.policyKey || (target.kind === 'observer' ? 'observerChanged' : target.kind);
    const policy = POLICY[policyKey];
    if (policy && usable(existing, policy)) return responseFrom(existing);

    if (document.hidden && existing) return responseFrom(existing);

    let pending = inFlight.get(target.key);
    if (!pending) {
      pending = (async () => {
        try {
          const response = await upstreamFetch(input, init);
          const captured = await captureResponse(response, target.kind);
          if (captured.cacheable) cache.set(target.key, captured);
          return captured;
        } finally {
          inFlight.delete(target.key);
        }
      })();
      inFlight.set(target.key, pending);
    }

    return responseFrom(await pending);
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
      return [
        ...[...cache.entries()].map(([key, value]) => ({ key, ageMs: Date.now() - value.at, status: value.status })),
        ...[...roomJoinAt.entries()].map(([key, at]) => ({ key, ageMs: Date.now() - at, status: 'join-budget' })),
      ];
    },
  });

  const markIntent = () => { lastUserIntentAt = Date.now(); };
  document.addEventListener('pointerdown', markIntent, true);
  document.addEventListener('keydown', markIntent, true);

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
