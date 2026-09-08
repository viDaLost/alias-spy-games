(() => {
  'use strict';

  /*
    Переключатель языка в шапке главного меню.

    Компактный и рядом с переключателем темы: язык выбирают один раз, и
    отдельная карточка во весь экран под заголовком забирала место у игр.
    Виден всем: переводы больше не превью для одного администратора.

    Внутри пилюли лежит настоящий <select>, растянутый на неё и прозрачный:
    нажатие открывает системный список телефона, а видимыми остаются флаг и
    название. Своё выпадающее меню на мобильном вело бы себя хуже родного и
    ничего не добавляло.
  */

  const language = window.AppLanguage;
  if (!language) return;

  /*
    Названия языков — самоназвания, и переводить их нельзя: «Deutsch» в
    английском списке остаётся «Deutsch». В словарь они не внесены намеренно.
    Флаг — страны, по которой язык назван.
  */
  const LANGUAGES = [
    { code: 'ru', flag: '🇷🇺', name: 'Русский' },
    { code: 'en', flag: '🇬🇧', name: 'English' },
    { code: 'de', flag: '🇩🇪', name: 'Deutsch' },
    { code: 'es', flag: '🇪🇸', name: 'Español' },
  ];

  // Оговорка честная и нужная: словари игр и весь интерфейс переведены
  // машиной. В русской сборке этой строки нет — там переводить нечего.
  const NOTICE = 'Перевод сделан нейросетью и местами может быть неточным.';

  const control = () => document.getElementById('app-language-control');
  const notice = () => document.getElementById('app-language-notice');

  function install() {
    const header = document.querySelector('.app-header');
    if (!header) return false;
    if (control()) return true;

    const current = LANGUAGES.find((item) => item.code === language.lang) || LANGUAGES[0];
    const pill = document.createElement('span');
    pill.className = 'language-pill';
    pill.id = 'app-language-control';
    pill.innerHTML = `<span class="language-pill__flag" aria-hidden="true">${current.flag}</span>`
      + `<span class="language-pill__name">${current.name}</span>`
      + '<select class="language-pill__select" id="app-language" aria-label="Язык приложения">'
      + LANGUAGES.map((item) => `<option value="${item.code}" lang="${item.code}">${item.flag} ${item.name}</option>`).join('')
      + '</select>';

    const select = pill.querySelector('select');
    select.value = language.lang;
    select.addEventListener('change', () => language.choose(select.value));
    header.append(pill);

    if (language.lang !== 'ru' && !notice()) {
      const note = document.createElement('p');
      note.className = 'language-note';
      note.id = 'app-language-notice';
      note.textContent = NOTICE;
      header.append(note);
    }
    return true;
  }

  // Шапка появляется вместе с меню, а меню собирается уже после загрузки.
  if (!install()) {
    const observer = new MutationObserver(() => { if (control()) observer.disconnect(); else install(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 12_000);
  }
})();
