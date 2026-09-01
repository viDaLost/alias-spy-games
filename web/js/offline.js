(() => {
  'use strict';

  // Игра без интернета.
  //
  // Приложение статическое, прогресс лежит в localStorage — в дороге ему не
  // хватает только файлов. Их держит sw.js. Здесь то, что видит и делает
  // страница: установка работника, аккуратное обновление, полоска «нет сети» и
  // очередь обращений к серверу.
  //
  // Очередь нужна, потому что без неё офлайн-партия просто исчезает: история
  // игр и очки рейтинга уходят на сервер по ходу дела, а в дороге этот запрос
  // умирает. Теперь он ложится в очередь и уходит, когда связь вернётся.

  const QUEUE_KEY = 'offline_queue_v1';
  const QUEUE_LIMIT = 60;
  // Действия, которые не жалко повторить: сервер принимает их как полное
  // состояние, а не как приращение. Всё остальное в очередь не кладётся —
  // повторная отправка того же билета в поддержку или того же кода входа
  // сделала бы человеку хуже, чем потерянный запрос.
  const QUEUEABLE = new Set(['updateHistory', 'ratingSync', 'ratingReset', 'starsSync']);
  // Эти держат в очереди только последнюю запись: каждая описывает состояние
  // целиком, и десять устаревших снимков подряд серверу не нужны.
  const LAST_ONLY = new Set(['ratingSync', 'ratingReset', 'starsSync']);

  let draining = false;
  let reloading = false;
  // Перезагрузка бывает только по просьбе человека. Первая установка работника
  // тоже меняет контроллер страницы — и без этого признака приложение
  // перезагружалось бы у каждого при первом же открытии, посреди игры.
  let updateRequested = false;

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }

  function write(items) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-QUEUE_LIMIT))); } catch { /* приватный режим */ }
  }

  function push(payload) {
    const action = String(payload?.action || '');
    if (!QUEUEABLE.has(action)) return false;
    const items = read().filter((item) => !(LAST_ONLY.has(action) && item.action === action));
    items.push({ ...payload, __queuedAt: Date.now() });
    write(items);
    update();
    return true;
  }

  async function drain() {
    if (draining || !navigator.onLine) return;
    const items = read();
    if (!items.length) return;
    if (typeof window.apiRequest !== 'function') return;

    draining = true;
    const left = [];
    try {
      for (const item of items) {
        const { __queuedAt, ...payload } = item;
        try {
          const result = await window.apiRequest(payload, { quiet: true });
          // Сервер ответил отказом — повторять бессмысленно, запись выбрасывается.
          // В очередь возвращается только то, что не доехало.
          if (!result) left.push(item);
        } catch { left.push(item); }
      }
    } finally {
      write(left);
      draining = false;
      update();
      if (!left.length && items.length) {
        window.dispatchEvent(new CustomEvent('app:offline-queue-sent', { detail: { count: items.length } }));
      }
    }
  }

  // --- полоска состояния ---------------------------------------------------------

  function bar() {
    let node = document.getElementById('offline-bar');
    if (node) return node;
    node = document.createElement('div');
    node.id = 'offline-bar';
    node.className = 'offline-bar';
    node.setAttribute('role', 'status');
    document.body.append(node);
    return node;
  }

  function update() {
    if (!document.body) return;
    const pending = read().length;
    const node = bar();
    if (!navigator.onLine) {
      node.textContent = pending
        ? `Нет сети — играете офлайн. ${pending} ${pending === 1 ? 'запись ждёт' : 'записей ждут'} отправки`
        : 'Нет сети — играете офлайн, прогресс сохраняется на устройстве';
      node.classList.add('is-visible');
      node.classList.remove('is-sending');
      return;
    }
    if (pending) {
      node.textContent = 'Связь вернулась — отправляем сохранённое';
      node.classList.add('is-visible', 'is-sending');
      return;
    }
    node.classList.remove('is-visible', 'is-sending');
  }

  // --- обновление приложения -------------------------------------------------------

  function offerUpdate(worker) {
    if (document.getElementById('offline-update')) return;
    const node = document.createElement('div');
    node.id = 'offline-update';
    node.className = 'offline-update';
    node.innerHTML = '<span>Готово обновление приложения</span><button type="button">Обновить</button>';
    node.querySelector('button')?.addEventListener('click', () => {
      node.remove();
      updateRequested = true;
      try { worker.postMessage({ type: 'skip-waiting' }); } catch { location.reload(); }
    });
    document.body.append(node);
  }

  function register() {
    if (!('serviceWorker' in navigator)) return;
    // Работник живёт только на защищённом соединении. На http он не встанет, а
    // попытка регистрации напечатает в консоль ошибку на каждый запуск.
    const local = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    if (location.protocol !== 'https:' && !local) return;

    navigator.serviceWorker.register('sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const next = registration.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          // Первая установка контроллера — это не обновление, а появление
          // офлайна: предлагать перезагрузку здесь незачем.
          if (next.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(next);
        });
      });
      if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
    }).catch(() => { /* приватный режим или запрет — приложение работает как раньше */ });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!updateRequested || reloading) return;
      reloading = true;
      location.reload();
    });
  }

  function start() {
    // Установка работника выкачивает десятки файлов. Если начать сразу, они
    // соревнуются за сеть с самим запуском приложения — первый экран заметно
    // задерживается. Поэтому после загрузки страницы и небольшой паузы.
    if (document.readyState === 'complete') window.setTimeout(register, 1200);
    else window.addEventListener('load', () => window.setTimeout(register, 1200), { once: true });
    update();
    drain();
    window.addEventListener('online', () => { update(); drain(); });
    window.addEventListener('offline', update);
    // Возврат из фона — частый момент, когда сеть уже вернулась, а события
    // online не было: телефон проснулся в другой сети.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) drain(); });
  }

  window.OfflineQueue = { push, drain, size: () => read().length, queueable: (action) => QUEUEABLE.has(action) };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
