(() => {
  'use strict';

  /*
    Диалог с ботом: одноразовый баннер в меню.

    Мини-приложение открывается и без того, чтобы человек хоть раз написал
    боту, — по прямой ссылке, через друга, из вложений. У бота это отнимает
    ровно то, для чего он и нужен: Telegram не даёт написать первым тому, кто
    ни разу не начинал с ним диалог, — важные рассылки, ответ из поддержки и
    оповещения до такого человека просто не доходят, и со стороны это выглядит
    так, будто их никто не отправлял.

    Кто из открывших уже писал боту, а кто нет, отсюда не видно и надёжно не
    определить — сервер знает это, только когда уже пробует что-то доставить.
    Поэтому баннер, как и приглашение в канал рядом с ним, показывается всем
    один раз: тому, кто уже начинал, лишняя ссылка ничего не стоит, а тому, кто
    не начинал, — единственный способ узнать, что стоит.
  */

  const BOT_USERNAME = 'bibleiskie_bot';
  const BOT_URL = `https://t.me/${BOT_USERNAME}`;
  const SEEN_KEY = 'bot_start_promo_seen_v1';
  const ICON = 'web/assets/icons/support.webp?v=1';

  const seen = () => {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
  };
  const remember = () => {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* приватный режим */ }
  };

  function open() {
    const webApp = window.Telegram?.WebApp;
    if (typeof webApp?.openTelegramLink === 'function') webApp.openTelegramLink(BOT_URL);
    else window.open(BOT_URL, '_blank', 'noopener,noreferrer');
  }

  function dismiss(banner) {
    remember();
    banner.classList.remove('is-visible');
    window.setTimeout(() => banner.remove(), 260);
  }

  function mountBanner() {
    if (seen() || document.getElementById('bot-start-promo')) return true;
    const menu = document.getElementById('menu-container');
    if (!menu || menu.classList.contains('hidden')) return false;

    const banner = document.createElement('section');
    banner.id = 'bot-start-promo';
    // Своих стилей у баннера нет: карточка того же покроя, что и приглашение в
    // канал рядом, — тот же класс, только своя картинка и свой текст.
    banner.className = 'channel-promo';
    banner.innerHTML = `
      <img class="channel-promo__art" src="${ICON}" alt="" width="76" height="76"
           loading="eager" decoding="async" draggable="false" />
      <div class="channel-promo__body">
        <strong class="channel-promo__title">Начните диалог с ботом</strong>
        <p class="channel-promo__text">Он присылает важные рассылки, ответы техподдержки и важные оповещения — без
          этого шага они до вас не дойдут: Telegram не даёт боту написать первым.</p>
        <div class="channel-promo__actions">
          <button type="button" class="channel-promo__join" data-bot-start-open>Открыть бота</button>
          <button type="button" class="channel-promo__later" data-bot-start-later>Не сейчас</button>
        </div>
      </div>`;

    banner.querySelector('[data-bot-start-open]').addEventListener('click', () => { open(); dismiss(banner); });
    banner.querySelector('[data-bot-start-later]').addEventListener('click', () => dismiss(banner));

    // Тем же местом, что и приглашение в канал: сразу под панелью прогресса,
    // а не выше карточек игр, ради которых человек открыл меню.
    const existingPromo = document.getElementById('channel-promo');
    const dashboard = menu.querySelector('.home-dashboard');
    if (existingPromo) existingPromo.after(banner);
    else if (dashboard) dashboard.after(banner);
    else menu.prepend(banner);
    requestAnimationFrame(() => banner.classList.add('is-visible'));
    return true;
  }

  window.BotStartPromo = { open, url: BOT_URL };

  window.addEventListener('app:home-dashboard-ready', mountBanner);
  if (!mountBanner()) {
    const observer = new MutationObserver(() => { if (mountBanner()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 12_000);
  }
})();
