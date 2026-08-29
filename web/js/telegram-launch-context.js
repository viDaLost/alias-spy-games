(() => {
  'use strict';

  const STORAGE_KEY = 'telegram_launch_init_data_v1';
  const JSON_FIELDS = new Set(['user', 'receiver', 'chat']);
  const PROFILE_BETA_ADMIN_ID = '1288379477';

  function safeSessionGet(key) {
    try { return sessionStorage.getItem(key) || ''; } catch { return ''; }
  }

  function safeSessionSet(key, value) {
    if (!value) return;
    try { sessionStorage.setItem(key, value); } catch {}
  }

  function paramsFromFragment(fragment) {
    const raw = String(fragment || '').replace(/^[?#]/, '');
    if (!raw) return [];

    const candidates = [raw];
    const queryIndex = raw.indexOf('?');
    if (queryIndex >= 0 && queryIndex + 1 < raw.length) {
      candidates.unshift(raw.slice(queryIndex + 1));
    }

    return candidates.map((value) => {
      try { return new URLSearchParams(value); } catch { return null; }
    }).filter(Boolean);
  }

  function readLaunchParam(name) {
    const sources = [
      ...paramsFromFragment(window.location.search),
      ...paramsFromFragment(window.location.hash),
    ];

    for (const params of sources) {
      const value = params.get(name);
      if (value) return value;
    }
    return '';
  }

  function parseInitData(raw) {
    const result = {};
    if (!raw) return result;

    let params;
    try { params = new URLSearchParams(raw); } catch { return result; }

    params.forEach((value, key) => {
      if (JSON_FIELDS.has(key)) {
        try {
          result[key] = JSON.parse(value);
          return;
        } catch {}
      }
      result[key] = value;
    });

    return result;
  }

  function currentSdkInitData() {
    try { return String(window.Telegram?.WebApp?.initData || ''); } catch { return ''; }
  }

  function captureInitData() {
    const sdkValue = currentSdkInitData();
    if (sdkValue) {
      safeSessionSet(STORAGE_KEY, sdkValue);
      return { value: sdkValue, source: 'sdk' };
    }

    const urlValue = readLaunchParam('tgWebAppData');
    if (urlValue) {
      safeSessionSet(STORAGE_KEY, urlValue);
      return { value: urlValue, source: window.location.hash.includes('tgWebAppData=') ? 'hash' : 'search' };
    }

    const storedValue = safeSessionGet(STORAGE_KEY);
    return { value: storedValue, source: storedValue ? 'session' : 'none' };
  }

  function mergeUnsafeData(currentUnsafe, parsed) {
    return {
      ...(currentUnsafe && typeof currentUnsafe === 'object' ? currentUnsafe : {}),
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
    };
  }

  function createCompatWebApp(current, launch) {
    if (!launch.value) return current || null;
    if (current && String(current.initData || '')) return current;

    const parsed = parseInitData(launch.value);
    const compat = current ? Object.create(current) : {};
    const unsafe = mergeUnsafeData(current?.initDataUnsafe, parsed);
    const version = String(current?.version || readLaunchParam('tgWebAppVersion') || '0.0');
    const platform = String(current?.platform || readLaunchParam('tgWebAppPlatform') || 'unknown');

    Object.defineProperties(compat, {
      initData: { configurable: true, enumerable: true, get: () => launch.value },
      initDataUnsafe: { configurable: true, enumerable: true, get: () => unsafe },
      version: { configurable: true, enumerable: true, get: () => version },
      platform: { configurable: true, enumerable: true, get: () => platform },
    });

    if (typeof compat.ready !== 'function') compat.ready = () => {};
    if (typeof compat.expand !== 'function') compat.expand = () => {};
    if (typeof compat.setHeaderColor !== 'function') compat.setHeaderColor = () => {};
    if (typeof compat.setBackgroundColor !== 'function') compat.setBackgroundColor = () => {};
    if (typeof compat.openTelegramLink !== 'function') {
      compat.openTelegramLink = (url) => window.open(url, '_blank', 'noopener');
    }

    window.Telegram = window.Telegram || {};
    window.Telegram.WebApp = compat;
    return compat;
  }

  function maybeLoadProfileBeta(user) {
    // Browser QA intentionally disables auxiliary telemetry/features so request
    // budget and startup checks only measure the production core path under test.
    if (window.__APP_TELEMETRY_DISABLED__ === true) return;
    if (String(user?.id || '') !== PROFILE_BETA_ADMIN_ID) return;

    if (!document.getElementById('player-profile-beta-runtime-style')) {
      const style = document.createElement('style');
      style.id = 'player-profile-beta-runtime-style';
      style.textContent = 'body[data-mode] .player-profile-launcher{display:none!important}';
      document.head.appendChild(style);
    }

    if (!document.querySelector('link[data-player-profile-beta]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'web/styles/player-profile.css?v=1';
      link.dataset.playerProfileBeta = '1';
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[data-player-profile-beta]')) {
      const script = document.createElement('script');
      script.src = 'web/js/player-profile.js?v=1';
      script.async = false;
      script.dataset.playerProfileBeta = '1';
      document.head.appendChild(script);
    }
  }

  function hydrate() {
    const launch = captureInitData();
    const webApp = createCompatWebApp(window.Telegram?.WebApp, launch);
    const user = webApp?.initDataUnsafe?.user || parseInitData(launch.value).user || null;

    window.TelegramLaunchContext = {
      getInitData: () => String(window.Telegram?.WebApp?.initData || captureInitData().value || ''),
      getUser: () => window.Telegram?.WebApp?.initDataUnsafe?.user || user || null,
      source: launch.source,
      hasInitData: Boolean(launch.value),
    };

    if (launch.value) {
      document.documentElement.dataset.telegramLaunchData = launch.source;
    }

    maybeLoadProfileBeta(user);
    return webApp;
  }

  hydrate();

  const sdkScript = document.getElementById('telegram-web-app-sdk');
  sdkScript?.addEventListener('load', () => {
    hydrate();
    try {
      const tg = window.Telegram?.WebApp;
      tg?.ready?.();
      tg?.expand?.();
      maybeLoadProfileBeta(tg?.initDataUnsafe?.user || null);
      window.dispatchEvent(new CustomEvent('telegram:sdk-ready'));
    } catch {}
  }, { once: true });
})();