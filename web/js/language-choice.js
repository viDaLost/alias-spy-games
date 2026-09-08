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
  // Language previews are restricted to the server-verified principal administrator.
  // URL parameters and storage are preferences, never authorization.
  const preferred=requested||stored||'ru';
  let lang='ru';
  let authorized=false;
  document.documentElement.lang=lang;
  const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const normalizeWord = value => String(value||'').normalize('NFD').replace(/\p{M}/gu,'').replace(/ß/g,'ss').toUpperCase().replace(/Ё/g,'Е').replace(/[^\p{L}]/gu,'');
  window.AppLanguage = {
    get lang() { return lang; },
    get authorized() { return authorized; },
    preferred, supported, normalize, normalizeWord, escape,
    applyRole(role) {
      authorized=role?.success===true && role?.isRoot===true && role?.isAdmin===true;
      window.dispatchEvent(new CustomEvent('app-language-access', {detail:{authorized}}));
      if (!authorized && lang!=='ru') {
        lang='ru'; document.documentElement.lang='ru';
        const url=new URL(location.href);url.searchParams.set('lang','ru');location.replace(url.href);
      }
    },
    async prepare() {
      if(preferred==='ru')return 'ru';
      const initData=String(window.Telegram?.WebApp?.initData || params.get('tgWebAppData') || hash.get('tgWebAppData') || '');
      const core=String(document.querySelector('meta[name="app-core-backend"]')?.content||'').replace(/\/+$/,'');
      if(!initData||!core)return 'ru';
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),5000);
      try {
        const response=await fetch(`${core}/compat`,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({payload:{action:'adminRoleStatus'},telegramInitData:initData}),
          cache:'no-store',signal:controller.signal});
        const role=response.ok ? await response.json() : null;
        if(role?.success===true && role?.isRoot===true && role?.isAdmin===true) {
          authorized=true;lang=preferred;document.documentElement.lang=lang;
        }
      } catch {} finally {clearTimeout(timeout);}
      return lang;
    },
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
      if(!authorized || !supported.includes(next))return;
      try {localStorage.setItem('app_language_v1',next);}catch{}
      const url=new URL(location.href); url.searchParams.set('lang',next);
      location.assign(url.href);
    }
  };
})();
