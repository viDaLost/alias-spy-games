(() => {
  'use strict';

  // Раздел «Ещё».
  //
  // Системных пунктов набралось семь: поддержка, установка, профиль, правила,
  // рейтинг, сканер и админка. В главном меню они занимали больше места, чем
  // сами игры, и человек, открывший приложение поиграть, первым делом видел
  // список служебных кнопок.
  //
  // Поэтому в меню остаётся одна дверь, а за ней — отдельный экран. Сам
  // контейнер #system-actions не пересоздаётся, а переезжает: карточки в него
  // добавляют семь разных модулей, и подменять узел значило бы потерять их
  // обработчики. При закрытии он возвращается на место в скрытую секцию.
  //
  // Экран — это слой поверх страницы, а не содержимое #game-container. Внутри
  // контейнера он бы не выжил: карточки открывают админку, правила и рейтинг,
  // а те переписывают контейнер целиком через innerHTML — вместе с переехавшим
  // туда узлом. Карточки исчезли бы до перезагрузки приложения.

  const HOST_ID = 'system-actions';

  function menuSection() {
    return document.getElementById(HOST_ID)?.closest('.menu-section') || null;
  }

  function layer() { return document.getElementById('more-screen'); }

  function cards() { return document.getElementById(HOST_ID); }

  const CARD_ICON = 'web/assets/icons/more.webp?v=1';

  /** Возвращает карточки домой и убирает слой. */
  function close() {
    const host = cards();
    const section = document.getElementById('more-hidden-section');
    if (host && section) section.append(host);
    layer()?.remove();
    document.documentElement.classList.remove('more-screen-open');
  }

  function open() {
    const host = cards();
    if (!host || layer()) return;

    const node = document.createElement('div');
    node.id = 'more-screen';
    node.className = 'more-screen';
    node.innerHTML = `
      <section class="more-shell">
        <div class="more-topbar">
          <button type="button" class="more-back" data-more-back aria-label="Назад в меню">←</button>
          <div>
            <p class="more-kicker">Приложение</p>
            <h2 class="more-title">Ещё</h2>
          </div>
        </div>
        <div class="more-slot" data-more-slot></div>
      </section>`;
    document.body.append(node);
    document.documentElement.classList.add('more-screen-open');
    node.querySelector('[data-more-slot]')?.append(host);
    node.querySelector('[data-more-back]')?.addEventListener('click', close);
    node.scrollTop = 0;
  }

  // Карточка открыла игру, админку или рейтинг — слой больше не нужен, а
  // карточкам пора домой, иначе они уедут вместе с ним.
  const modeWatcher = new MutationObserver(() => { if (document.body.dataset.mode && layer()) close(); });
  modeWatcher.observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });

  function install() {
    const section = menuSection();
    const host = cards();
    if (!host) return false;

    // Исходная секция остаётся в разметке и служит домом для карточек, пока
    // раздел закрыт: модули продолжают дописывать их туда же, где и раньше.
    if (section && section.id !== 'more-hidden-section') {
      section.id = 'more-hidden-section';
      section.classList.add('more-hidden-section');
    }

    const menu = document.getElementById('menu-container');
    if (!menu || document.getElementById('more-entry')) return true;

    const entry = document.createElement('section');
    entry.className = 'menu-section more-entry-section';
    entry.innerHTML = `
      <button type="button" id="more-entry" class="game-card game-card--more">
        <span class="game-card__icon game-card__icon--image">
          <img class="game-card__img" src="${CARD_ICON}" alt="Иконка раздела Ещё"
               loading="eager" decoding="async" draggable="false" />
        </span>
        <span class="game-card__body">
          <span class="game-card__title">Ещё</span>
          <span class="game-card__desc">Профиль, правила, рейтинг, поддержка и установка</span>
        </span>
        <span class="game-card__chevron" aria-hidden="true">›</span>
      </button>`;
    entry.querySelector('#more-entry')?.addEventListener('click', open);
    menu.append(entry);
    return true;
  }

  window.openMoreScreen = open;

  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
