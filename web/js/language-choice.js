(() => {
  'use strict';
  const supported = ['ru','en','de','es'];
  const normalize = value => { const lang=String(value||'').toLowerCase().split(/[-_]/)[0]; return supported.includes(lang)?lang:''; };
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/,''));
  let stored='';
  try { stored=normalize(localStorage.getItem('app_language_v1')); } catch {}
  let start = params.get('tgWebAppStartParam') || hash.get('tgWebAppStartParam') || '';
  try { start ||= new URLSearchParams(params.get('tgWebAppData') || hash.get('tgWebAppData') || '').get('start_param') || ''; } catch {}
  const requested=normalize(params.get('lang')) || (/^lang_(ru|en|de|es)$/.exec(start)?.[1] || '');
  /*
    Язык выбирает сам человек. Раньше переводы были превью для главного
    администратора, и приложение спрашивало у сервера роль, прежде чем взять
    выбранный язык: до ответа оно оставалось русским, а на чужой роли к
    русскому и возвращалось.

    Спрашивать больше нечего. Заодно и быстрее: запуск на любом языке больше
    не ждёт сетевого ответа, а вне сети язык остаётся тем, который выбрали.
  */
  let lang=requested||stored||'ru';
  const preferred=lang;
  document.documentElement.lang=lang;
  const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const normalizeWord = value => String(value||'').normalize('NFD').replace(/\p{M}/gu,'').replace(/ß/g,'ss').toUpperCase().replace(/Ё/g,'Е').replace(/[^\p{L}]/gu,'');
  window.AppLanguage = {
    get lang() { return lang; },
    preferred, supported, normalize, normalizeWord, escape,
    // Готовить нечего: язык известен из адреса или из памяти ещё до запроса
    // к сети. Функция осталась, потому что запуск приложения её ждёт.
    async prepare() { return lang; },
    keyboard: () => lang==='ru' ? ['ЙЦУКЕНГШЩЗХЪ','ФЫВАПРОЛДЖЭ','ЯЧСМИТЬБЮЁ'] : ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'],
    /*
      Путь к переведённой копии файла. Основной бандл подменяется целиком, но
      часть скриптов подключается уже на ходу — нижняя панель, приглашения
      друзей, «Художник», сетевой «Соглядатай». Они грузились по своему
      исходному адресу, то есть всегда по-русски: приложение говорило на
      выбранном языке, а панель под ним оставалась русской.
    */
    asset(path) {
      const source=String(path||'');
      // Часть файлов сборка переписывает сама, и адрес приходит уже готовым.
      // Возвращаем его как есть: иначе к пути припишется второй такой же.
      if(lang==='ru' || !source.startsWith('web/') || source.startsWith('web/locales/'))return source;
      return `web/locales/${lang}/${source.slice(4)}`;
    },
    // Templates are trusted application strings, not user messages or HTML.
    text: value => {
      const source=String(value??'');
      const dictionary=window.AppI18nDictionary||{};
      return dictionary[source] || source.replace(/[А-ЯЁа-яё][А-ЯЁа-яё0-9 \t.,!?…—–«»():;×%+−/‑-]*[А-ЯЁа-яё0-9.!?…»)]|[А-ЯЁа-яё]/g, part=>dictionary[part]||part);
    },
    choose(next) {
      if(!supported.includes(next))return;
      try {localStorage.setItem('app_language_v1',next);}catch{}
      const url=new URL(location.href); url.searchParams.set('lang',next);
      location.assign(url.href);
    }
  };
})();
