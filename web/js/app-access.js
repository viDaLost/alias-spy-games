(() => {
  'use strict';
  const root = document.documentElement;
  const core = String(document.querySelector('meta[name="app-core-backend"]')?.content || '').replace(/\/+$/, '');
  const state = { allowed: false, checked: false, checking: null, userId: '', restricted: true };
  let timer;
  let wasAllowed = false;
  const screen = () => document.getElementById('app-access-screen');

  function block(message = '') {
    state.allowed = false;
    root.classList.add('app-access-locked');
    root.classList.remove('app-access-pending');
    screen()?.removeAttribute('hidden');
    const hint = screen()?.querySelector('[data-access-status]');
    if (hint) hint.textContent = message;
    // Stop iframe games and release their render loops when permission is withdrawn.
    if (wasAllowed) {
      try { window.goToMainMenu?.(); } catch { /* blocking must still finish */ }
      document.querySelectorAll('#game-container iframe').forEach((frame) => frame.remove());
      wasAllowed = false;
    }
    document.querySelectorAll('body > *').forEach((node) => {
      if (!['app-access-screen', 'web-session-overlay'].includes(node.id) && !['SCRIPT', 'STYLE'].includes(node.tagName)) {
        node.inert = true;
        node.dataset.appAccessInert = '1';
      }
    });
  }

  function allow(data) {
    state.allowed = true;
    state.checked = true;
    state.userId = String(data.userId || '');
    state.restricted = data.restricted === true;
    root.classList.remove('app-access-locked', 'app-access-pending');
    screen()?.setAttribute('hidden', '');
    document.querySelectorAll('[data-app-access-inert]').forEach((node) => {
      node.inert = false;
      delete node.dataset.appAccessInert;
    });
    if (!wasAllowed) {
      wasAllowed = true;
      window.dispatchEvent(new CustomEvent('app-access:allowed'));
    }
  }

  function credentials() {
    const initData = String(window.Telegram?.WebApp?.initData || window.TelegramLaunchContext?.getInitData?.() || '');
    if (initData) return { body: { telegramInitData: initData }, headers: {} };
    let token = '';
    try {
      token = window.__ANDROID_APK__ ? window.AndroidApp?.getSessionToken?.() : window.WebSession?.token?.();
      if (!token) {
        const session = JSON.parse(localStorage.getItem('web_session_v1') || 'null');
        if (session?.expiresAt > Date.now()) token = session.token;
      }
    } catch { /* no saved session */ }
    return { body: {}, headers: token ? { Authorization: `Bearer ${token}` } : {} };
  }

  async function verify() {
    if (state.checking) return state.checking;
    state.checking = (async () => {
      try {
        if (!core) throw new Error('Сервер проверки доступа недоступен.');
        const auth = credentials();
        const response = await fetch(`${core}/app/access`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...auth.headers },
          body: JSON.stringify(auth.body), cache: 'no-store', signal: AbortSignal.timeout(8000),
        });
        const data = await response.json();
        state.checked = true;
        if (response.ok && data.allowed === true && data.success === true) allow(data);
        else block(response.status === 401 ? 'Откройте приложение заново из Telegram или войдите в подтверждённый профиль.' : 'Доступ откроется после снятия ограничения администратором.');
      } catch {
        block('Для проверки доступа нужен интернет. Ваш прогресс сохранён на месте.');
      } finally {
        state.checking = null;
        clearTimeout(timer);
        if (!document.hidden) timer = setTimeout(verify, 30_000);
      }
      return state.allowed;
    })();
    return state.checking;
  }

  function resume() {
    if (document.hidden) { clearTimeout(timer); return; }
    // An old successful response never authorizes a new foreground session offline.
    block('Проверяем доступ…');
    void verify();
  }

  window.AppAccess = { verify, allowed: () => state.allowed, state: () => ({ ...state, checking: Boolean(state.checking) }) };
  const roomOrigins = new Set(['quartet', 'bible-sketch', 'spy', 'twelve-tribes', 'kingdoms'].map((key) => {
    try { return new URL(document.querySelector(`meta[name="${key}-backend"]`)?.content).origin; } catch { return ''; }
  }));
  const baseFetch = window.fetch.bind(window);
  window.fetch = function accessRoomFetch(input, init = {}) {
    let url;
    try { url = new URL(typeof input === 'string' ? input : input.url, location.href); } catch { return baseFetch(input, init); }
    const token = credentials().headers.Authorization?.replace(/^Bearer /, '');
    if (token && roomOrigins.has(url.origin) && /\/rooms(?:\/[A-Za-z0-9]+\/join)?$/.test(url.pathname) && typeof init.body === 'string') {
      try { init = { ...init, body: JSON.stringify({ ...JSON.parse(init.body), appSessionToken: token }) }; } catch { /* original request reports malformed JSON */ }
    }
    return baseFetch(input, init);
  };
  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'app-access:proof-request' || !state.allowed) return;
    const frame = [...document.querySelectorAll('#game-container iframe')].find((node) => node.contentWindow === event.source);
    if (!frame) return;
    let origin;
    try { origin = new URL(frame.src, location.href).origin; } catch { return; }
    if (event.origin !== origin) return;
    const auth = credentials();
    event.source.postMessage({ type: 'app-access:proof', nonce: event.data.nonce, proof: {
      ...auth.body, token: auth.headers.Authorization?.replace(/^Bearer /, '') || '',
    } }, origin);
  });
  window.addEventListener('app-access:allowed', () => {
    if (typeof window.initializeApp === 'function') void window.initializeApp();
  });
  window.addEventListener('telegram:sdk-ready', () => { void verify(); });
  window.addEventListener('online', () => { void verify(); });
  window.addEventListener('offline', () => block('Для проверки доступа нужен интернет. Ваш прогресс сохранён на месте.'));
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pageshow', (event) => { if (event.persisted) resume(); });
  screen()?.querySelector('[data-access-retry]')?.addEventListener('click', () => { void verify(); });
  screen()?.querySelector('[data-access-login]')?.addEventListener('click', () => window.WebSession?.open?.());
  // Wait only for the launch-data bridge, not for progress synchronization.
  block('Проверяем доступ…');
  void verify();
})();
