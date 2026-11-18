(() => {
  'use strict';
  if (!window.GameDisplay) return;

  const preview = document.documentElement.hasAttribute('data-full-preview');
  const systemRoot = 'web/assets/icons/menu-system/';
  const production = 'https://alias-spy-games-app.vitaledanilov.workers.dev';
  const bot = 'https://t.me/bibleiskie_bot';
  const preferenceKey = 'home_hidden_sections_v1';
  const quick = document.getElementById('catalog-system-quick');
  const accountActions = document.getElementById('catalog-account-actions');
  const more = document.getElementById('more-dialog');
  const join = document.getElementById('join-dialog');
  const cityName = () => window.SabbathAccess?.status()?.city?.name || '';
  const rooms = new Set(['quartet', 'bible-sketch', 'spy', 'twelve-tribes', 'promised-land', 'kingdoms']);
  const icon = (key) => `<img class="catalog-system-icon" src="${systemRoot}${key}.webp" alt="" draggable="false">`;
  const help = { art: 'support', title: 'Техподдержка', action: 'support' };
  const joinAction = { art: 'share', title: 'Подключиться к комнате', action: 'join' };
  const friends = { art: 'admin', title: 'Друзья', ...(preview ? { href: `${production}/?account=friends` } : { action: 'friends' }) };
  const donate = { art: 'donate', title: 'Поддержать проект', action: 'donate' };
  const channel = { art: 'channel', title: 'Канал обновлений', href: 'https://t.me/+WEBlCGtAywEyZmNi' };
  const rows = [
    { art: 'rules', title: 'Правила игр', caption: 'Правила и разбор механик', action: 'rules' },
    { art: 'theme', title: 'Город для расписания', caption: '', action: 'city' },
    { art: 'progress', title: 'Сбросить прогресс', caption: 'Выбор игры с подтверждением', action: 'reset' },
    donate, channel,
    { art: 'support', title: 'Открыть бота', href: bot },
    { art: 'share', title: 'Установить на iPhone', href: `${production}/install.html` },
    { art: 'share', title: 'Скачать приложение для Android', href: 'https://github.com/viDaLost/alias-spy-games/releases/download/android-latest/BibleGames-Android-latest.apk' },
  ];

  function row({ art, title, caption, href, action }) {
    const copy = `${icon(art)}<span><strong>${title}</strong>${caption ? `<small>${caption}</small>` : ''}</span><b aria-hidden="true">›</b>`;
    return href
      ? `<a class="catalog-system-action" href="${href}" target="_blank" rel="noopener noreferrer">${copy}</a>`
      : `<button class="catalog-system-action" type="button" data-service="${action}" aria-haspopup="dialog">${copy}</button>`;
  }
  quick.innerHTML = [donate, preview ? channel : { ...channel, href: '', action: 'channel' }, help].map(row).join('');
  accountActions.innerHTML = [joinAction, friends].map(row).join('');
  accountActions.hidden = false;
  if (preview) document.getElementById('catalog-system-list').innerHTML = rows.map(row).join('') +
    `<nav class="catalog-system-languages" aria-label="Язык рабочего приложения">
      <span>Язык рабочего приложения</span>${Object.entries({ ru: 'Русский', en: 'English', de: 'Deutsch', es: 'Español' }).map(([code, label]) => `<a href="${bot}?startapp=lang_${code}" target="_blank" rel="noopener noreferrer" lang="${code}">${label}</a>`).join('')}
    </nav>`;
  if (preview) document.getElementById('support-dialog-links').innerHTML = [
    { art: 'support', title: 'Написать в поддержку', href: 'https://t.me/D_a_n_Vi' },
    { art: 'channel', title: 'Открыть поддержку в боте', href: `${bot}?text=%2Fsupport` },
  ].map(row).join('');
  document.getElementById('donate-dialog-links').innerHTML = [
    { art: 'stars', title: 'Поддержать звёздами Telegram', href: `${bot}?start=donate` },
    { art: 'donate', title: 'Поддержать через Tribute', href: 'https://t.me/tribute/app?startapp=dPzg' },
  ].map(row).join('');

  const hiddenSections = () => {
    try { const saved = JSON.parse(localStorage.getItem(preferenceKey) || '[]'); return new Set(Array.isArray(saved) ? saved : []); }
    catch { return new Set(); }
  };

  function refresh() {
    const hide = hiddenSections();
    for (const box of document.querySelectorAll('[data-home-section]')) box.checked = !hide.has(box.dataset.homeSection);
    document.getElementById('catalog-progress').hidden = hide.has('progress');
    const theme = document.getElementById('catalog-theme');
    theme.setAttribute('aria-pressed', String(window.AppTheme?.isDark() === true));
    const cleared = Object.keys(window.BiblicalMatchThreeProgress?.load().levelRatings || {}).length;
    let sacred = 0;
    try {
      const id = window.BiblicalMatchThreeProgress?.userId() || 'anon';
      sacred = Math.max(0, Number(JSON.parse(localStorage.getItem('sacred_word_levels_v4_' + id))?.level) || 0);
    } catch {}
    document.getElementById('catalog-progress-summary').textContent = `Сокровища · ${cleared} уровней · Священное слово · ${sacred}`;
  }

  document.getElementById('open-more').addEventListener('click', () => {
    if (!preview) { window.openMoreScreen(); return; }
    const city = more.querySelector('[data-service="city"] span');
    const current = cityName();
    if (current) {
      const detail = city.querySelector('small') || city.appendChild(document.createElement('small'));
      detail.textContent = current;
    }
    more.showModal();
  });

  document.getElementById('catalog-theme').addEventListener('click', () => { window.AppTheme?.toggle(); refresh(); });
  document.getElementById('catalog-home-settings').addEventListener('change', (event) => {
    const key = event.target.dataset.homeSection;
    if (!key) return;
    const hide = hiddenSections();
    if (event.target.checked) hide.delete(key);
    else hide.add(key);
    try { localStorage.setItem(preferenceKey, JSON.stringify([...hide])); } catch {}
    refresh();
  });

  const selection = document.getElementById('catalog-join-game');

  function setRoomGames(games) {
    const previous = selection.value;
    selection.replaceChildren(...games.filter(({ key }) => rooms.has(key))
      .map(({ key, title }) => new Option(title, key)));
    if ([...selection.options].some((option) => option.value === previous)) selection.value = previous;
  }

  function roomURL(value, game) {
    const code = value.trim().toUpperCase();
    if (/^[A-Z0-9]{4,10}$/.test(code) && rooms.has(game)) return `?${new URLSearchParams({ game, room: code })}`;
    let url;
    try { url = new URL(value); } catch { return ''; }
    if (url.origin === location.origin) {
      const code = url.searchParams.get('room')?.toUpperCase();
      const key = url.searchParams.get('game') || game;
      return code ? roomURL(code, key) : '';
    }
    const launch = url.searchParams.get('startapp') || url.searchParams.get('start') || '';
    if (url.origin === 'https://t.me' && url.pathname === '/bibleiskie_bot' && /^join_[a-z0-9_-]+_[A-Z0-9]{4,10}$/i.test(launch)) return url.href;
    return '';
  }

  function joinRoom(url) {
    if (!url) return false;
    if (url.startsWith('?')) {
      join.close();
      window.GameCatalog.navigate(url);
    } else window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }

  document.getElementById('catalog-join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = document.getElementById('catalog-join-code').value;
    if (!preview && window.RoomInvite?.acceptScanned(value)) {
      join.close();
      document.getElementById('catalog-join-error').textContent = '';
      return;
    }
    const url = roomURL(value, selection.value);
    document.getElementById('catalog-join-error').textContent = joinRoom(url) ? '' : 'Проверьте код комнаты или вставьте ссылку из приглашения.';
  });
  const camera = document.getElementById('catalog-scan');
  camera.addEventListener('click', () => {
    join.close();
    window.RoomQrScanner?.open();
  });

  const actions = {
    channel: () => window.ChannelPromo?.open(),
    rules: () => window.openGameRules(),
    reset: () => window.openProgressReset(),
    city: () => window.SabbathAccess.openCityPicker(),
    join: () => {
      camera.hidden = !window.RoomQrScanner?.isAvailable();
      join.showModal();
    },
    friends: () => openAccount('friends'),
    support: () => preview ? document.getElementById('support-dialog').showModal() : window.openSupportChat(),
    donate: () => document.getElementById('donate-dialog').showModal(),
  };
  function openService(event) {
    const action = event.target.closest('[data-service]')?.dataset.service;
    if (!action) return;
    if (more?.open) more.close();
    actions[action]?.();
  }
  more?.addEventListener('click', openService);
  quick.addEventListener('click', openService);
  accountActions.addEventListener('click', openService);

  function hasAccountSession() {
    return Boolean(window.Telegram?.WebApp?.initData || window.TelegramLaunchContext?.getInitData?.() || window.WebSession?.active?.());
  }

  const profile = document.getElementById('open-profile');
  async function openAccount(tab = 'profile') {
    if (profile.hasAttribute('aria-busy')) return;
    if (!hasAccountSession()) return window.WebSession?.open();
    profile.setAttribute('aria-busy', 'true');
    try {
      const social = await window.TelegramLaunchContext.loadPlayerSocial();
      if (window.AppAccess?.allowed()) await social.open(tab);
    } catch {
      window.showToast?.('Не удалось загрузить профиль. Попробуйте ещё раз.', 'error');
    } finally {
      profile.removeAttribute('aria-busy');
    }
  }

  if (!preview) {
    profile.setAttribute('role', 'button');
    profile.setAttribute('aria-haspopup', 'dialog');
    function openProfile(event) {
      event.preventDefault();
      void openAccount();
    }
    profile.addEventListener('click', openProfile);
    profile.addEventListener('keydown', (event) => {
      if (event.key === ' ') openProfile(event);
    });
    let openedFromLink = false;
    function openRequestedAccount() {
      if (openedFromLink || !document.documentElement.classList.contains('app-ui-ready') || !window.AppAccess?.allowed()) return;
      const requested = new URLSearchParams(location.search).get('account');
      const tab = requested === 'friends' ? 'friends'
        : window.TelegramLaunchContext?.getStartParam?.() === 'profile' && hasAccountSession() ? 'profile' : '';
      if (!tab) return;
      openedFromLink = true;
      void openAccount(tab);
    }
    window.addEventListener('app:menu-ready', () => {
      if (window.WebSession?.active?.()) window.TelegramLaunchContext.loadPlayerSocial().catch(() => {});
      openRequestedAccount();
    });
    window.addEventListener('telegram:sdk-ready', openRequestedAccount, { once: true });
  }

  window.CatalogSystem = Object.freeze({ icon, refresh, setRoomGames, acceptInvite(value) {
    const url = roomURL(value, selection.value);
    return joinRoom(url) ? { url } : null;
  } });
})();
