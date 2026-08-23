(() => {
  const GAME_KEY = 'biblical-match-three';
  const SAFETY_SYNC_INTERVAL_MS = 90_000;
  const MAX_QUEUE = 250;
  let timer = 0;
  let syncPromise = null;
  let applyingServer = false;

  function userId() {
    const values = [window.Telegram?.WebApp?.initDataUnsafe?.user?.id, window.__ANDROID_TELEGRAM_ID__];
    for (const value of values) {
      const id = String(value ?? '').trim();
      if (/^\d{5,20}$/.test(id)) return id;
    }
    return '';
  }

  function gameActive() { return document.body?.dataset?.currentGame === GAME_KEY; }
  function key(id) { return `biblical_match_three_stars_v1_${id}`; }
  function legacyKey(id) { return `bible_stars_v1_${id}`; }
  function shadowKey(id) { return `biblical_match_three_cloud_v2_${id}`; }
  function queueKey(id) { return `biblical_match_three_mutations_v2_${id}`; }

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

  function readShadow(id) {
    try {
      const value = JSON.parse(localStorage.getItem(shadowKey(id)) || 'null');
      if (!value || !Number.isFinite(Number(value.balance)) || !Number.isFinite(Number(value.revision))) return null;
      return { balance: Math.max(0, Math.floor(Number(value.balance))), revision: Math.max(0, Math.floor(Number(value.revision))) };
    } catch { return null; }
  }

  function writeShadow(id, balance, revision) {
    try { localStorage.setItem(shadowKey(id), JSON.stringify({ balance, revision, at: Date.now() })); } catch {}
  }

  function readQueue(id) {
    try {
      const value = JSON.parse(localStorage.getItem(queueKey(id)) || '[]');
      return Array.isArray(value) ? value.filter(validMutation).slice(-MAX_QUEUE) : [];
    } catch { return []; }
  }

  function writeQueue(id, queue) {
    try { localStorage.setItem(queueKey(id), JSON.stringify(queue.slice(-MAX_QUEUE))); } catch {}
  }

  function validMutation(item) {
    return item && /^bmt_[A-Za-z0-9_-]{12,80}$/.test(String(item.id || ''))
      && Number.isFinite(Number(item.delta)) && Number(item.delta) !== 0;
  }

  function mutationId() {
    const bytes = new Uint8Array(10);
    try { crypto.getRandomValues(bytes); } catch { for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256); }
    const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `bmt_${Date.now().toString(36)}_${suffix}`;
  }

  function queueMutation(id, delta, reason) {
    const amount = Math.trunc(Number(delta || 0));
    if (!id || !amount) return;
    const queue = readQueue(id);
    queue.push({ id: mutationId(), delta: amount, reason: String(reason || '').slice(0, 96), at: Date.now() });
    writeQueue(id, queue);
  }

  function applyBalance(id, value) {
    const balance = Math.max(0, Math.floor(Number(value || 0)));
    applyingServer = true;
    try {
      const progress = window.BiblicalMatchThreeProgress;
      if (progress?.setStars && progress.getStars?.() !== balance) progress.setStars(balance, 'cloudflare-admin-sync');
      else {
        localStorage.setItem(key(id), String(balance));
        document.querySelectorAll('[data-bmt-wallet]').forEach((node) => { node.textContent = String(balance); });
      }
    } catch {
      try { localStorage.setItem(key(id), String(balance)); } catch {}
    } finally {
      queueMicrotask(() => { applyingServer = false; });
    }
  }

  async function api(payload) {
    const response = await window.apiRequest(payload);
    if (response?.success === false || response?.ok === false) throw new Error(response?.error || 'BMT cloud sync failed');
    return response || {};
  }

  async function replayMutation(id, item, balance, revision) {
    let currentBalance = balance;
    let currentRevision = revision;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await api({
        action: 'mutateBmtStars',
        id,
        mutationId: item.id,
        delta: Math.trunc(Number(item.delta || 0)),
        expectedRevision: currentRevision,
        reason: item.reason || '',
      });
      currentBalance = Math.max(0, Math.floor(Number(result.bmtStars ?? currentBalance)));
      currentRevision = Math.max(0, Math.floor(Number(result.revision ?? currentRevision)));
      if (!result.conflict && !result.needsSync) return { ok: true, balance: currentBalance, revision: currentRevision };
    }
    return { ok: false, balance: currentBalance, revision: currentRevision };
  }

  async function syncNow() {
    const id = userId();
    if (!id || typeof window.apiRequest !== 'function') return null;
    if (syncPromise) return syncPromise;

    syncPromise = (async () => {
      const shadow = readShadow(id);
      let queue = readQueue(id);
      const sync = await api({
        action: 'syncBmtStars',
        id,
        balance: localBalance(id),
        revision: shadow?.revision || 0,
      });

      let balance = Math.max(0, Math.floor(Number(sync.bmtStars || 0)));
      let revision = Math.max(0, Math.floor(Number(sync.revision || 0)));

      if (sync.seeded) {
        queue = [];
        writeQueue(id, queue);
      } else {
        while (queue.length) {
          const item = queue[0];
          const applied = await replayMutation(id, item, balance, revision);
          balance = applied.balance;
          revision = applied.revision;
          if (!applied.ok) break;
          queue.shift();
          writeQueue(id, queue);
        }
      }

      writeShadow(id, balance, revision);
      applyBalance(id, balance);
      return { ...sync, bmtStars: balance, revision, pendingMutations: queue.length };
    })().catch((error) => {
      console.warn('Biblical Treasures stars sync:', error);
      return null;
    }).finally(() => { syncPromise = null; });

    return syncPromise;
  }

  function schedule(delay = 250, force = false) {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if ((force || gameActive()) && !document.hidden && navigator.onLine) syncNow();
    }, delay);
  }

  window.addEventListener('app:stars-changed', (event) => {
    if (applyingServer || event?.detail?.source !== 'biblical-match-three') return;
    if (event?.detail?.reason === 'cloudflare-admin-sync') return;
    const id = userId();
    const delta = Math.trunc(Number(event?.detail?.delta || 0));
    if (id && delta) queueMutation(id, delta, event?.detail?.reason || 'match3-local-change');
    // Mutations still sync immediately. The long interval below is only a
    // safety reconciliation for admin-side balance changes and missed events.
    schedule(180, true);
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden && gameActive()) schedule(120); });
  window.addEventListener('online', () => { if (gameActive()) schedule(100); });
  window.setInterval(() => {
    if (gameActive() && !document.hidden && navigator.onLine) syncNow();
  }, SAFETY_SYNC_INTERVAL_MS);

  const gameObserver = new MutationObserver(() => {
    if (gameActive()) schedule(80);
    else clearTimeout(timer);
  });
  if (document.body) gameObserver.observe(document.body, { attributes: true, attributeFilter: ['data-current-game'] });

  window.addEventListener('pagehide', () => gameObserver.disconnect(), { once: true });
  window.__syncBiblicalTreasuresStars = syncNow;
  if (gameActive()) schedule(900);
})();
