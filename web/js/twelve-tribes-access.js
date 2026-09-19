/*
  Кому открыты «Двенадцать колен».

  Игра ещё на обкатке: в общем списке её нет, карточка спрятана, а вход
  закрыт и по прямому вызову — см. showGame в app.js. До сих пор ключ был
  один, у главного администратора; теперь к нему добавлен короткий список
  тех, кого позвали играть первыми.

  Замок этот по-прежнему не от злоумышленника. Файлы игры раздаются статикой
  всем, у кого есть адрес, и списком в коде браузера ничего не запереть:
  человек, знающий, что такое консоль, откроет игру и без приглашения. Список
  нужен ровно затем, чтобы игра не появилась у людей раньше времени — и в
  этом он честен.

  Отсюда и место: признак ставится классом на <html>, как и роль
  администратора. Карточка в меню прячется таблицей стилей и появляется сама,
  когда класс встал, — пересобирать меню не приходится.
*/
(function () {
  'use strict';

  /*
    Позванные на обкатку. Числа — Telegram id, те самые, что показывает IDBot.
    Имён здесь нет нарочно: id приходят списком, и подписать каждое именем
    значило бы гадать, а ошибка в подписи хуже её отсутствия.
  */
  const INVITED = new Set([
    '7523844455',
    '8855766423',
    '7101682106',
    '8184249020',
    '42506115',
    '7037932652',
    '17617578',
  ]);

  const MARK = 'tribes-open';

  /*
    Чей это телефон. Спрашивается по очереди у трёх источников, и порядок
    важен: сначала тот id, который подтвердил сервер при проверке роли, потом
    Telegram, потом вход по коду вне Telegram. Первый — самый надёжный, но
    приходит позже всех, а до него игру должно быть видно тому, кто её ждёт.
  */
  function currentId() {
    const confirmed = window.AdminRBAC?.state?.userId;
    if (confirmed) return String(confirmed);
    const telegram = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (telegram) return String(telegram);
    const web = window.WebSession?.userId?.();
    return web ? String(web) : '';
  }

  const isOwner = () => document.documentElement.classList.contains('admin-rbac-root');

  /** Открыта ли игра этому человеку: главному администратору или позванному. */
  function allowed() {
    return isOwner() || INVITED.has(currentId());
  }

  function apply() {
    document.documentElement.classList.toggle(MARK, allowed());
  }

  /*
    Id узнаётся не сразу: Telegram отдаёт его после готовности, вход по коду —
    после чтения хранилища, роль — после ответа сервера. Поэтому признак не
    ставится один раз, а перепроверяется несколько секунд после запуска и
    затем при каждом возвращении в приложение. Дешевле опроса тут ничего нет:
    ни одно из трёх мест о своём появлении не сообщает.
  */
  const TRIES = [0, 200, 600, 1200, 2500, 5000, 9000];
  for (const wait of TRIES) setTimeout(apply, wait);
  window.addEventListener('pageshow', apply);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  }

  window.TwelveTribesAccess = Object.freeze({
    allowed,
    apply,
    invited: () => [...INVITED],
  });
})();
