(() => {
  'use strict';
  const core = String(document.querySelector('meta[name="app-core-backend"]')?.content || '').replace(/\/+$/, '');
  const state = { allowed: true, checked: false, checking: null, userId: '', isRoot: false, restricted: false };
  let timer;
  let sabbathProfile = null, sabbathUser = '';

  function applyAccess(data) {
    const userId = String(data.userId || '');
    const isRoot = data.isRoot === true;
    const allowed = data.isBanned !== true || data.appRestricted === true;
    const notify = allowed && (!state.checked || !state.allowed || userId !== state.userId || isRoot !== state.isRoot);
    Object.assign(state, { allowed, userId, isRoot, restricted: data.restricted === true });
    setSabbathProfile(data.sabbath || null,userId);
    if (notify) window.dispatchEvent(new CustomEvent('app-access:allowed'));
  }

  function setSabbathProfile(next, userId) {
    if (userId === sabbathUser && next && sabbathProfile && next.revision < sabbathProfile.revision) return;
    if (userId === sabbathUser && JSON.stringify(next) === JSON.stringify(sabbathProfile)) return;
    sabbathUser = userId;
    sabbathProfile = next;
    window.dispatchEvent(new Event('app-access:sabbath'));
  }

  function credentials() {
    // The native bridge exposes an availability marker, not signed Telegram data.
    const sessionMode = window.__ANDROID_APK__ === true || window.__WEB_SESSION__ === true;
    const initData = sessionMode ? '' : String(window.Telegram?.WebApp?.initData || window.TelegramLaunchContext?.getInitData?.() || '');
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

  async function post(path, payload, auth = credentials(), { timeout = 8000, signal } = {}) {
    if (!core) throw new Error('Сервер проверки доступа недоступен.');
    const deadline = AbortSignal.timeout(timeout);
    return fetch(`${core}${path}`, {
      method:'POST', headers:{'Content-Type':'application/json', ...auth.headers},
      body:JSON.stringify({...auth.body,...payload}), cache:'no-store', signal: signal ? (AbortSignal.any?.([deadline, signal]) || deadline) : deadline,
    });
  }

  async function sabbathRequest(action, payload) {
    const response = await post(`/sabbath/${action}`,payload);
    const result = await response.json();
    if (action === 'confirm' && result.sabbath) setSabbathProfile(result.sabbath,state.userId);
    if (!response.ok || result.ok !== true) throw new Error(result.error || 'Не удалось получить субботнее расписание.');
    return result;
  }

  async function verify() {
    if (state.checking) return state.checking;
    state.checking = (async () => {
      try {
        const response = await post('/app/access', {sabbathTimeZone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'});
        const data = await response.json();
        if (response.ok && data.success === true) applyAccess(data);
      } catch {
        // The access service can be unavailable while local games are playable.
      } finally {
        state.checked = true;
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
    void verify();
  }

  window.AppAccess = {
    verify, allowed: () => state.allowed, state: () => ({ ...state, checking: Boolean(state.checking) }),
    azbukaRequest: (path, payload) => post(`/azbuka/${path}`, { payload }),
    bibleWorldRequest: (scene, signal) => post(scene ? '/bible-world/panorama' : '/bible-world/access', { scene }, credentials(), { timeout: scene ? 60_000 : 8000, signal }),
    sabbathProfile: () => sabbathProfile,
    sabbathSignedIn: () => {
      const auth = credentials();
      return Boolean(auth.body.telegramInitData || auth.headers.Authorization);
    },
    sabbathRequest,
  };
  const roomOrigins = new Set(['quartet', 'bible-sketch', 'spy', 'twelve-tribes'].map((key) => {
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
  window.addEventListener('telegram:sdk-ready', () => { void verify(); });
  window.addEventListener('online', () => { void verify(); });
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pageshow', (event) => { if (event.persisted) resume(); });
  void verify();
})();
