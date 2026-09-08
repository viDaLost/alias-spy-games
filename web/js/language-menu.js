(() => {
  'use strict';

  /*
    Переключатель языка в шапке главного меню.

    Компактный и рядом с переключателем темы: язык выбирают один раз, и
    отдельная карточка во весь экран под заголовком забирала место у игр.
    Показывается только главному администратору — языки пока превью, и решает
    это сервер, а не разметка.

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
    if (!language.authorized) {
      control()?.remove();
      notice()?.remove();
      return;
    }
    if (!header || control()) return;

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
  }

  window.addEventListener('app-language-access', install);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
