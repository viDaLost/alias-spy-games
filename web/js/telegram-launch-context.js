(() => {
  'use strict';

  const STORAGE_KEY = 'telegram_launch_init_data_v1';
  const JSON_FIELDS = new Set(['user', 'receiver', 'chat']);
  let playerSocialPromise;

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

  function ensureStyle(id, href) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function ensureScript(id, src) {
    if (document.getElementById(id)) return;
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = false;
    document.head.appendChild(script);
  }

  function loadSocialAsset(id, url, stylesheet = false) {
    if (document.getElementById(id)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const node = document.createElement(stylesheet ? 'link' : 'script');
      node.id = id;
      if (stylesheet) {
        node.rel = 'stylesheet';
        node.href = url;
      } else node.src = url;
      const timer = setTimeout(fail, 8000);
      function fail() {
        clearTimeout(timer);
        node.remove();
        reject(new Error('Profile resource did not load'));
      }
      node.addEventListener('error', fail, { once: true });
      node.addEventListener('load', () => {
        clearTimeout(timer);
        if (stylesheet || window.PlayerSocial) resolve();
        else fail();
      }, { once: true });
      document.head.appendChild(node);
    });
  }

  function loadPlayerSocial() {
    if (!playerSocialPromise) {
      const path = 'web/js/social-dock-v2.js';
      const localized = window.AppLanguage?.asset?.(path) || path;
      playerSocialPromise = Promise.allSettled([
        loadSocialAsset('social-dock-v2-css', 'web/styles/social-dock-v2.css?v=1', true),
        window.PlayerSocial || loadSocialAsset('social-dock-v2-js', `${localized}?v=6`),
      ]).then((results) => {
        const failure = results.find((result) => result.status === 'rejected');
        if (!failure) return window.PlayerSocial;
        playerSocialPromise = null;
        throw failure.reason;
      });
    }
    return playerSocialPromise;
  }

  function maybeLoadSocialFeatures(user) {
    // Browser QA intentionally disables auxiliary network/features so request
    // budget and startup checks only measure the production core path under test.
    if (window.__APP_TELEMETRY_DISABLED__ === true) return;
    if (!/^\d{5,20}$/.test(String(user?.id || ''))) return;

    ensureStyle('game-friend-invites-css', 'web/styles/game-friend-invites.css?v=1');

    /*
      Нижняя панель и приглашения подключаются на ходу, и переведённая копия у
      них своя. Но язык к этому моменту ещё не обязательно известен: его
      подтверждает сервер, а этот файл намеренно не локализуется — он должен
      отработать одинаково до того, как язык выбран.

      Поэтому дожидаемся отметки о готовности языка и только потом берём адрес.
      Раньше панель грузилась сразу и всегда по русскому адресу: приложение
      говорило по-английски, а «Избранное» и «Профиль» под ним — по-русски.

      Ожидание со сроком: если отметка почему-то не появится, панель всё равно
      подключится — пусть на русском, но подключится. Пропасть она не должна.
    */
    const mount = () => {
      const localized = (path) => window.AppLanguage?.asset?.(path) || path;
      loadPlayerSocial().catch(() => {});
      ensureScript('game-friend-invites-js', `${localized('web/js/game-friend-invites.js')}?v=1`);
    };
    const ready = () => Boolean(document.documentElement.dataset.languageReady);
    if (ready()) { mount(); return; }
    let done = false;
    const finish = () => { if (done) return; done = true; observer.disconnect(); clearTimeout(timer); mount(); };
    const observer = new MutationObserver(() => { if (ready()) finish(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-language-ready'] });
    const timer = setTimeout(finish, 4000);
  }

  function hydrate() {
    const launch = captureInitData();
    const webApp = createCompatWebApp(window.Telegram?.WebApp, launch);
    const user = webApp?.initDataUnsafe?.user || parseInitData(launch.value).user || null;

    window.TelegramLaunchContext = {
      getInitData: () => String(window.Telegram?.WebApp?.initData || captureInitData().value || ''),
      getUser: () => window.Telegram?.WebApp?.initDataUnsafe?.user || user || null,
      getStartParam: () => String(window.Telegram?.WebApp?.initDataUnsafe?.start_param || readLaunchParam('tgWebAppStartParam') || readLaunchParam('startapp') || ''),
      loadPlayerSocial,
      source: launch.source,
      hasInitData: Boolean(launch.value),
    };

    if (launch.value) {
      document.documentElement.dataset.telegramLaunchData = launch.source;
    }

    maybeLoadSocialFeatures(user);
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
      maybeLoadSocialFeatures(tg?.initDataUnsafe?.user || null);
    } catch {}
    window.dispatchEvent(new CustomEvent('telegram:sdk-ready'));
  }, { once: true });
})();
