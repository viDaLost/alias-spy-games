(() => {
  'use strict';
  if (!window.GameDisplay) return;

  const prefix = 'bible_game_wallet_v1_';
  const memory = new Map();

  function playerId() {
    const id = String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || window.TelegramLaunchContext?.getUser?.()?.id
      || window.__ANDROID_TELEGRAM_ID__ || window.WebSession?.userId?.() || '');
    return /^\d{5,20}$/.test(id) ? id : 'anon';
  }

  function amount(value) {
    const number = Math.trunc(Number(value));
    return Number.isSafeInteger(number) ? Math.max(0, number) : 0;
  }

  function read(key) {
    if (memory.has(key)) return memory.get(key);
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function write(key, balance) {
    try {
      localStorage.setItem(key, String(balance));
      memory.delete(key);
    } catch { memory.set(key, String(balance)); }
  }

  function balance() {
    const id = playerId();
    const key = prefix + id;
    const saved = read(key);
    if (saved !== null) return amount(saved);
    const wordSearch = Math.max(amount(read('bible_stars_v1_' + id)), id === 'anon' ? amount(read('bible_stars_v1_аноним')) : 0);
    const treasures = amount(read('biblical_match_three_stars_v1_' + id));
    // The old Treasure wallet could start as a copy of Word Search. Merge
    // their largest balance once so the original stars are not counted twice.
    let wordCoins = 20;
    try {
      const value = JSON.parse(read('bibleWowData_v5'))?.coins;
      if (typeof value === 'number' && Number.isFinite(value)) wordCoins = amount(value);
    } catch {}
    const initial = amount(Math.max(wordSearch, treasures) + wordCoins);
    write(key, initial);
    return initial;
  }

  function publish(total, delta = 0, reason = '') {
    for (const node of document.querySelectorAll('[data-game-wallet], #wow-score, #ws-stars')) node.textContent = String(total);
    window.dispatchEvent(new CustomEvent('app:stars-changed', { detail: { balance: total, delta, reason, source: 'game-wallet' } }));
  }

  function set(value, reason = '') {
    const before = balance();
    const next = amount(value);
    if (next === before) return before;
    write(prefix + playerId(), next);
    publish(next, next - before, reason);
    return next;
  }

  function add(delta, reason = '') {
    const change = Math.trunc(Number(delta));
    return Number.isSafeInteger(change) ? set(Math.min(Number.MAX_SAFE_INTEGER, balance() + change), reason) : balance();
  }

  function spend(cost, reason = '') {
    const price = amount(cost);
    const current = balance();
    if (current < price) return { ok: false, balance: current, cost: price };
    return { ok: true, balance: set(current - price, reason), cost: price };
  }

  window.addEventListener('storage', (event) => {
    if (event.key === prefix + playerId() || event.key === null) publish(balance());
  });

  window.GameWallet = Object.freeze({ balance, set, add, spend, accountId: playerId });
})();
