(() => {
  'use strict';

  // Переключатель светлой и тёмной темы.
  //
  // Сама тема включается классом theme-dark на html — его ставит короткий
  // скрипт в <head> ещё до первой отрисовки, иначе тёмное приложение мелькнуло
  // бы светлым. Здесь только выбор человека и кнопка.
  //
  // Состояний у кнопки два, светлая и тёмная, а не три. «Авто» — не состояние,
  // а отсутствие выбора: пока человек не нажимал, приложение идёт за настройкой
  // телефона и следит за её изменением. Первое же нажатие фиксирует выбор.

  const KEY = 'theme_choice_v1';
  const DARK = 'dark';
  const LIGHT = 'light';

  const root = document.documentElement;
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');

  function stored() {
    try {
      const value = localStorage.getItem(KEY);
      return value === DARK || value === LIGHT ? value : '';
    } catch { return ''; }
  }

  function systemPrefersDark() {
    return Boolean(media?.matches);
  }

  function isDark() {
    const choice = stored();
    return choice ? choice === DARK : systemPrefersDark();
  }

  /**
   * Telegram красит свою шапку сам, и в тёмной теме светлая полоса над
   * приложением видна не меньше, чем сам экран.
   */
  function paintChrome(dark) {
    const color = dark ? '#12151c' : '#eaf3ff';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    const webApp = window.Telegram?.WebApp;
    try { webApp?.setHeaderColor?.(color); } catch { /* старая версия клиента */ }
    try { webApp?.setBackgroundColor?.(color); } catch { /* старая версия клиента */ }
  }

  function apply(dark) {
    root.classList.toggle('theme-dark', dark);
    root.style.colorScheme = dark ? 'dark' : 'light';
    paintChrome(dark);
    render();
  }

  function set(choice) {
    try { localStorage.setItem(KEY, choice); } catch { /* приватный режим */ }
    apply(choice === DARK);
  }

  function toggle() {
    const next = isDark() ? LIGHT : DARK;
    set(next);
    try { window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(); } catch { /* нет вибрации */ }
    return next;
  }

  // Пока человек не выбирал — идём за телефоном и дальше: он может переключить
  // тему на ночь, и приложение должно переключиться вместе с ним.
  media?.addEventListener?.('change', () => { if (!stored()) apply(systemPrefersDark()); });

  // --- кнопка ---------------------------------------------------------------------

  const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<circle cx="12" cy="12" r="4.6" fill="currentColor"/>'
    + '<g stroke="currentColor" stroke-width="2" stroke-linecap="round">'
    + '<path d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4"/>'
    + '<path d="M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7"/>'
    + '</g></svg>';
  const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<path fill="currentColor" d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.7 8.7 0 1 0 11 11z"/>'
    + '</svg>';

  function button() { return document.getElementById('theme-switch'); }

  function render() {
    const node = button();
    if (!node) return;
    const dark = isDark();
    // Кнопка называет то, что случится по нажатию, а не то, что сейчас: иначе
    // непонятно, это состояние или действие.
    node.innerHTML = `<span class="theme-switch__icon">${dark ? SUN : MOON}</span>`
      + `<span class="theme-switch__label">${dark ? 'Светлая' : 'Тёмная'}</span>`;
    node.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
    node.setAttribute('aria-pressed', String(dark));
  }

  function mount() {
    const header = document.querySelector('.app-header');
    if (!header || button()) return Boolean(header);
    const node = document.createElement('button');
    node.type = 'button';
    node.id = 'theme-switch';
    node.className = 'theme-switch';
    node.addEventListener('click', toggle);
    header.append(node);
    render();
    return true;
  }

  if (!mount()) {
    // Шапка появляется вместе с меню, а меню собирается уже после загрузки.
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Первая покраска шапки мессенджера: класс уже стоит, а Telegram о нём не знает.
  paintChrome(isDark());
  window.addEventListener('telegram:sdk-ready', () => paintChrome(isDark()));

  window.AppTheme = { isDark, choice: stored, set, toggle };
})();
