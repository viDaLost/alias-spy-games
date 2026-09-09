(() => {
  'use strict';

  /*
    Канал обновлений: одноразовый баннер в меню и постоянная кнопка рядом с
    «Поддержать проект».

    Баннер показывается один раз. Не потому, что так проще, а потому, что
    реклама собственного канала на каждом запуске — это то, из-за чего
    приложение начинают закрывать. Человек либо подписался, либо сказал «не
    сейчас», и второй раз спрашивать незачем: кнопка в меню остаётся на месте
    и никуда не денется.

    Ссылка на канал приватная, вида t.me/+код. Внутри Telegram её открывает
    сам мессенджер через openTelegramLink — иначе он уводит человека в браузер,
    где приглашение просит войти заново. Вне Telegram открывается обычной
    вкладкой.
  */

  const CHANNEL_URL = 'https://t.me/+WEBlCGtAywEyZmNi';
  const SEEN_KEY = 'channel_promo_seen_v1';
  const ART = 'web/assets/channel-promo.webp?v=1';

  const seen = () => {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
  };
  const remember = () => {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* приватный режим */ }
  };

  function open() {
    const webApp = window.Telegram?.WebApp;
    if (typeof webApp?.openTelegramLink === 'function') webApp.openTelegramLink(CHANNEL_URL);
    else window.open(CHANNEL_URL, '_blank', 'noopener,noreferrer');
  }

  function dismiss(banner) {
    remember();
    banner.classList.remove('is-visible');
    // Убираем после доигравшего исчезновения, иначе баннер прыгает.
    window.setTimeout(() => banner.remove(), 260);
  }

  function mountBanner() {
    if (seen() || document.getElementById('channel-promo')) return true;
    const menu = document.getElementById('menu-container');
    if (!menu || menu.classList.contains('hidden')) return false;

    const banner = document.createElement('section');
    banner.id = 'channel-promo';
    banner.className = 'channel-promo';
    banner.innerHTML = `
      <img class="channel-promo__art" src="${ART}" alt="" width="120" height="117"
           loading="eager" decoding="async" draggable="false" />
      <div class="channel-promo__body">
        <strong class="channel-promo__title">Канал обновлений</strong>
        <p class="channel-promo__text">Что нового, что починили и что впереди — коротко и по делу.</p>
        <div class="channel-promo__actions">
          <button type="button" class="channel-promo__join" data-channel-join>Подписаться</button>
          <button type="button" class="channel-promo__later" data-channel-later>Не сейчас</button>
        </div>
      </div>`;

    banner.querySelector('[data-channel-join]').addEventListener('click', () => { open(); dismiss(banner); });
    banner.querySelector('[data-channel-later]').addEventListener('click', () => dismiss(banner));

    // Под панелью прогресса: сверху человек ищет игры, а не объявления.
    const dashboard = menu.querySelector('.home-dashboard');
    if (dashboard) dashboard.after(banner);
    else menu.prepend(banner);
    requestAnimationFrame(() => banner.classList.add('is-visible'));
    return true;
  }

  window.ChannelPromo = { open, url: CHANNEL_URL };

  // Меню собирается после загрузки, а панель прогресса — ещё позже.
  window.addEventListener('app:home-dashboard-ready', mountBanner);
  if (!mountBanner()) {
    const observer = new MutationObserver(() => { if (mountBanner()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 12_000);
  }
})();
