/*
  Отступы для игры, открытой во фрейме.

  Внутри фрейма env(safe-area-inset-*) всегда ноль: вырез экрана принадлежит
  внешнему документу, и оттуда его не видно. Кнопки Telegram — «Закрыть» слева
  и «⋯» справа — рисуются поверх веб-вида и в раскладке не участвуют вовсе.
  Поэтому HUD «Моисея на Ниле» вставал под ними: счётчик пройденного пути и
  счётчик собранных лотосов пропадали за кнопками целиком.

  Снизу мешает уже сама оболочка: кнопка «Главное меню» лежит по центру ровно
  на «Нырке», а круглая «?» — на правой кнопке поворота.

  Здесь всё это измеряется и уходит во фрейм сообщением. Ничего не
  зашивается: высоту своих кнопок оболочка спрашивает у них самих, так что
  она не разъедется с их стилями.
*/
(() => {
  'use strict';

  const FRAME = '.game-frame';
  // Кнопки Telegram на клиентах без contentSafeAreaInset (Bot API до 8.0).
  // Столько же отводит себе «Библейские сокровища» — там это подобрано на
  // живых телефонах, и второй раз подбирать незачем.
  const TELEGRAM_HEADER_FALLBACK = 46;

  /*
    Вырез экрана: JS его не знает, а CSS знает — спрашиваем пробником.

    Замер запоминается, и вот почему это важно. Пробник вставляется в документ
    и тут же убирается, то есть меняет DOM. Наблюдатель ниже следит за DOM и на
    каждое изменение зовёт замер заново — незапомненный пробник поднимал бы сам
    себя по кругу и вешал страницу насмерть. Вырез меняется только при повороте
    и смене размера окна, там кеш и сбрасывается.
  */
  let cachedDevice = null;
  function deviceInsets() {
    if (cachedDevice) return cachedDevice;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;'
      + 'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    cachedDevice = {
      top: parseFloat(style.paddingTop) || 0,
      bottom: parseFloat(style.paddingBottom) || 0,
    };
    probe.remove();
    return cachedDevice;
  }

  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

  function telegramTop() {
    const tg = window.Telegram?.WebApp;
    if (!tg?.initData && !document.documentElement.classList.contains('is-telegram')) return 0;
    // safeAreaInset — тот же вырез, contentSafeAreaInset — полоса под кнопками
    // клиента. Вырез уже посчитан пробником, поэтому берётся большее из двух,
    // а не сумма: иначе на клиентах, где заполнено и то и другое, HUD уехал бы
    // на высоту выреза дважды.
    return num(tg?.contentSafeAreaInset?.top) || TELEGRAM_HEADER_FALLBACK;
  }

  const SHELL_BUTTONS = ['.game-frame-exit', '.rules-help'];

  /*
    Плашки оболочки. Считается не «где они лежат по замыслу», а где они лежат
    на самом деле: выход и «?» переехали наверх, но правило должно работать и
    после следующего переезда, иначе игра однажды снова окажется под ними.

    Верхние отодвигают HUD игры вниз, нижние поднимают её управление. Чужой
    считается та плашка, что стоит в своей половине экрана.
  */
  function shellChrome(topBand) {
    let top = 0;
    let bottom = 0;
    const middle = window.innerHeight / 2;
    for (const selector of SHELL_BUTTONS) {
      const node = document.querySelector(selector);
      if (!node || node.offsetParent === null) continue;
      const box = node.getBoundingClientRect();
      if (!box.height) continue;
      if (box.top < middle) top = Math.max(top, box.bottom - topBand);
      else bottom = Math.max(bottom, window.innerHeight - box.top);
    }
    // Зазор, чтобы кнопки не соприкасались краями с чужими.
    return { top: top > 0 ? Math.round(top + 8) : 0, bottom: bottom > 0 ? Math.round(bottom + 8) : 0 };
  }

  /*
    Сколько отвести сверху, пока мерить нечего. Адрес фрейма собирается до
    того, как кнопка выхода попадёт в документ: она создаётся той же вставкой,
    что и сам фрейм. Без запаса первый кадр игры нарисовал бы HUD под ней, и
    он бы съехал на глазах у игрока — сообщение с настоящими числами приходит
    следующим шагом. Столько занимает кнопка со своим отступом.
  */
  const SHELL_TOP_FALLBACK = 52;

  function measure() {
    const device = deviceInsets();
    // Полоса сверху, занятая телефоном и клиентом Telegram. Ниже неё начинается
    // свободное место — там оболочка и ставит свои кнопки.
    const band = Math.round(Math.max(device.top, num(window.Telegram?.WebApp?.safeAreaInset?.top)) + telegramTop());
    document.documentElement.style.setProperty('--game-chrome-top', `${band}px`);
    const chrome = shellChrome(band);
    return {
      // Нижний вырез фрейм добавит сам через свой env(): он равен нулю только
      // потому, что фрейм его не видит, — поэтому шлём и его.
      band,
      top: band + chrome.top,
      bottom: Math.round(device.bottom + chrome.bottom),
    };
  }

  let last = '';
  function push(force) {
    const frame = document.querySelector(FRAME);
    if (!frame?.contentWindow) { last = ''; return; }
    const { top, bottom } = measure();
    const key = `${top}:${bottom}`;
    if (!force && key === last) return;
    last = key;
    try {
      frame.contentWindow.postMessage({ type: 'game-frame:insets', top, bottom }, '*');
    } catch { /* фрейм ещё не поднялся — придёт со следующим замером */ }
  }

  /*
    Первый кадр игра должна нарисовать уже правильно, поэтому оболочка
    дописывает те же числа в адрес фрейма — до того, как он попадёт в
    документ. Менять src уже открытому фрейму нельзя: это перезагрузка игры.
  */
  function seedUrl(src) {
    try {
      const url = new URL(String(src), location.href);
      const insets = measure();
      const top = insets.top > insets.band ? insets.top : insets.band + SHELL_TOP_FALLBACK;
      url.searchParams.set('chromeTop', String(top));
      url.searchParams.set('chromeBottom', String(insets.bottom));
      return url.href;
    } catch { return String(src); }
  }

  function sync() {
    if (!document.querySelector(FRAME)) { last = ''; return; }
    push(true);
  }

  // Следим за появлением фрейма, а не за всем документом: игра во фрейме сама
  // меняет DOM на каждом кадре, и общий наблюдатель работал бы вхолостую.
  const host = document.getElementById('game-container') || document.body;
  const observer = new MutationObserver(sync);
  observer.observe(host, { childList: true, subtree: true });
  const remeasure = (force) => { cachedDevice = null; push(force); };
  window.addEventListener('resize', () => remeasure(false));
  window.addEventListener('orientationchange', () => remeasure(true));
  document.addEventListener('DOMContentLoaded', sync);
  // Кнопки Telegram появляются не мгновенно, а размеры плашек оболочки зависят
  // от уже применённых стилей: один поздний замер снимает обе гонки.
  setTimeout(sync, 600);

  const tg = window.Telegram?.WebApp;
  for (const event of ['safeAreaChanged', 'contentSafeAreaChanged', 'viewportChanged']) {
    try { tg?.onEvent?.(event, () => remeasure(true)); } catch { /* старый клиент */ }
  }

  window.__gameFrameInsets = { measure, seedUrl, sync };
})();
