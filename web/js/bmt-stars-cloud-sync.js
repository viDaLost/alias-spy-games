(() => {
  const GAME_KEY = 'biblical-match-three';
  const SYNC_INTERVAL_MS = 12_000;
  let timer = 0;
  let syncPromise = null;
  let applyingServer = false;

  function userId() {
    const values = [
      window.Telegram?.WebApp?.initDataUnsafe?.user?.id,
      window.__ANDROID_TELEGRAM_ID__,
    ];
    for (const value of values) {
      const id = String(value ?? '').trim();
      if (/^\d{5,20}$/.test(id)) return id;
    }
    return '';
  }

  function key(id) { return `biblical_match_three_stars_v1_${id}`; }
  function legacyKey(id) { return `bible_stars_v1_${id}`; }

  function localBalance(id) {
    if (!id) return 0;
    try {
      let raw = localStorage.getItem(key(id));
      if (raw == null) {
        raw = localStorage.getItem(legacyKey(id));
        if (raw != null && Number.isFinite(Number(raw))) localStorage.setItem(key(id), String(Math.max(0, Math.floor(Number(raw)))));
      }
      const value = Number(raw);
      return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    } catch { return 0; }
  }

  function applyBalance(id, value) {
    const balance = Math.max(0, Math.floor(Number(value || 0)));
    applyingServer = true;
    try {
      const progress = window.BiblicalMatchThreeProgress;
      if (progress?.setStars && progress.getStars?.() !== balance) {
        progress.setStars(balance, 'cloudflare-admin-sync');
      } else {
        localStorage.setItem(key(id), String(balance));
        document.querySelectorAll('[data-bmt-wallet]').forEach((node) => { node.textContent = String(balance); });
      }
    } catch {
      try { localStorage.setItem(key(id), String(balance)); } catch {}
    } finally {
      queueMicrotask(() => { applyingServer = false; });
    }
  }

  async function syncNow() {
    const id = userId();
    if (!id || typeof window.apiRequest !== 'function') return null;
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      const response = await window.apiRequest({
        action: 'syncBmtStars',
        id,
        balance: localBalance(id),
      });
      if (response?.success === false || response?.ok === false) throw new Error(response?.error || 'BMT sync failed');
      if (response?.bmtStars !== undefined) applyBalance(id, response.bmtStars);
      return response;
    })().catch((error) => {
      console.warn('Biblical Treasures stars sync:', error);
      return null;
    }).finally(() => { syncPromise = null; });
    return syncPromise;
  }

  function schedule(delay = 250) {
    clearTimeout(timer);
    timer = window.setTimeout(syncNow, delay);
  }

  window.addEventListener('app:stars-changed', (event) => {
    if (applyingServer) return;
    if (event?.detail?.source !== 'biblical-match-three') return;
    if (event?.detail?.reason === 'cloudflare-admin-sync') return;
    schedule(180);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule(120);
  });

  window.setInterval(() => {
    if (document.body?.dataset?.currentGame === GAME_KEY) syncNow();
  }, SYNC_INTERVAL_MS);

  window.__syncBiblicalTreasuresStars = syncNow;
  schedule(900);
})();
