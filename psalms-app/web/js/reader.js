/* Экран песни — главный экран приложения: спокойное чтение текста. */

import {
  el, icon, ICONS, iconButton, textButton, toast, haptic, share, copy, keepAwake,
  openSheet, closeSheet,
} from './ui.js';
import { emptyState, skeletonList, segmented } from './components.js';
import { store } from './store.js';
import {
  typographySheet, changeFontSize, setFontFamily, setTheme, FONT_OPTIONS, THEME_OPTIONS,
} from './typography.js';
import { store as settings } from './store.js';
import * as data from './data.js';

const REPEAT_MARK = /(\/:|:\/)/g;
const AUTO_SPEEDS = [
  { label: 'Медленно', value: 22 },
  { label: 'Обычно', value: 34 },
  { label: 'Быстро', value: 52 },
];

let host = null;
let navigate = null;
let scroller = null;
let page = null;
let barTitle = null;
let favoriteButton = null;
let current = null;
let autoTimer = 0;
let autoSpeed = 34;
let toolbar = null;
let toolbarHidden = false;
let lastScrollTop = 0;

export function initReader(navigateTo) {
  navigate = navigateTo;
  host = document.getElementById('reader');

  barTitle = el('div', { class: 'reader__bar-title' });
  favoriteButton = iconButton(ICONS.heart, 'В избранное', toggleFavorite, {
    class: 'icon-button favorite-button',
    'aria-pressed': 'false',
  });

  const bar = el('header', { class: 'reader__bar' }, [
    iconButton(ICONS.back, 'Назад', () => history.back()),
    barTitle,
    textButton('Аа', 'Оформление', () => typographySheet()),
    favoriteButton,
    iconButton(ICONS.more, 'Ещё', openActions),
  ]);

  page = el('article', { class: 'reader__page' });
  scroller = el('div', { class: 'reader__scroll' }, [page]);
  toolbar = buildToolbar();
  host.append(bar, el('div', { class: 'reader__body' }, [scroller, toolbar]));

  scroller.addEventListener('scroll', () => {
    const top = scroller.scrollTop;
    host.classList.toggle('is-stuck', top > 24);
    if (top > lastScrollTop + 8 && top > 120) setToolbar(false);
    else if (top < lastScrollTop - 8) setToolbar(true);
    lastScrollTop = top;
  }, { passive: true });

  bindSwipes();
}

/* --- Панель управления чтением -------------------------------------------- */

/** Размер, шрифт и палитра меняются прямо на экране песни, без захода в настройки. */
function buildToolbar() {
  const sizeValue = el('span', {
    class: 'toolbar__value',
    'aria-live': 'polite',
    text: `${settings.get('fontSize')} pt`,
  });

  const minus = el('button', {
    type: 'button', class: 'toolbar__button', 'aria-label': 'Уменьшить текст',
    html: icon(ICONS.minus),
  });
  const plus = el('button', {
    type: 'button', class: 'toolbar__button', 'aria-label': 'Увеличить текст',
    html: icon(ICONS.plus),
  });

  const applySize = (delta) => {
    const value = changeFontSize(delta);
    sizeValue.textContent = `${value} pt`;
    minus.disabled = value <= 15;
    plus.disabled = value >= 28;
    haptic(4);
  };
  minus.addEventListener('click', () => applySize(-1));
  plus.addEventListener('click', () => applySize(1));
  minus.disabled = settings.get('fontSize') <= 15;
  plus.disabled = settings.get('fontSize') >= 28;

  const fontPanel = el('div', { class: 'toolbar__panel', hidden: true });
  const themePanel = el('div', { class: 'toolbar__panel', hidden: true });

  const fontButton = el('button', {
    type: 'button', class: 'toolbar__button', 'aria-expanded': 'false',
    'aria-label': 'Выбрать шрифт',
  }, [el('span', { text: 'Аа' })]);

  const themeButton = el('button', {
    type: 'button', class: 'toolbar__button', 'aria-expanded': 'false',
    'aria-label': 'Выбрать палитру',
  }, [el('span', { class: 'swatch__dot swatch__dot--auto', 'aria-hidden': 'true' })]);

  const togglePanel = (panel, button, other, otherButton) => {
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    other.hidden = true;
    otherButton.setAttribute('aria-expanded', 'false');
    haptic(4);
  };
  fontButton.addEventListener('click', () => togglePanel(fontPanel, fontButton, themePanel, themeButton));
  themeButton.addEventListener('click', () => togglePanel(themePanel, themeButton, fontPanel, fontButton));

  const fontButtons = FONT_OPTIONS.map((option) => el('button', {
    type: 'button',
    class: `toolbar__option toolbar__option--${option.value}`,
    text: option.label,
    'aria-pressed': settings.get('fontFamily') === option.value ? 'true' : 'false',
    onclick: () => {
      setFontFamily(option.value);
      for (const item of fontButtons) item.setAttribute('aria-pressed', 'false');
      fontButtons[FONT_OPTIONS.indexOf(option)].setAttribute('aria-pressed', 'true');
      haptic(4);
      toast(`Шрифт: ${option.label.toLowerCase()}`);
    },
  }));
  fontPanel.append(...fontButtons);

  const themeButtons = THEME_OPTIONS.map((option) => el('button', {
    type: 'button',
    class: 'swatch',
    'aria-pressed': settings.get('theme') === option.value ? 'true' : 'false',
    'aria-label': `Палитра: ${option.label}`,
    title: option.label,
  }, [el('span', { class: `swatch__dot swatch__dot--${option.value}`, 'aria-hidden': 'true' })]));
  themeButtons.forEach((button, index) => button.addEventListener('click', () => {
    setTheme(THEME_OPTIONS[index].value);
    for (const item of themeButtons) item.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-pressed', 'true');
    haptic(4);
    toast(`Палитра: ${THEME_OPTIONS[index].label.toLowerCase()}`);
  }));
  themePanel.append(...themeButtons);

  return el('div', { class: 'reader__toolbar' }, [
    el('div', { class: 'toolbar__row' }, [
      minus,
      sizeValue,
      plus,
      el('span', { class: 'toolbar__divider', 'aria-hidden': 'true' }),
      fontButton,
      themeButton,
    ]),
    fontPanel,
    themePanel,
  ]);
}

function setToolbar(visible) {
  if (!toolbar || toolbarHidden === !visible) return;
  toolbarHidden = !visible;
  toolbar.classList.toggle('is-hidden', toolbarHidden);
  if (toolbarHidden) {
    for (const panel of toolbar.querySelectorAll('.toolbar__panel')) panel.hidden = true;
    for (const button of toolbar.querySelectorAll('[aria-expanded]')) {
      button.setAttribute('aria-expanded', 'false');
    }
  }
}

/* --- Содержимое ----------------------------------------------------------- */

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (ch) => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;'
  ));
}

function renderVerses(song) {
  return song.b.map((block) => {
    const label = block.k === 'chorus'
      ? 'Припев'
      : block.k === 'verse' && block.n ? block.n : '';
    const lines = block.l
      .map((line) => escapeHtml(line).replace(REPEAT_MARK, '<span class="repeat-mark">$1</span>'))
      .join('\n');
    return el('section', { class: `verse${block.k === 'chorus' ? ' verse--chorus' : ''}` }, [
      label ? el('span', { class: 'verse__label', text: label }) : null,
      el('div', { class: 'verse__lines', html: lines }),
    ]);
  });
}

function plainText(entry) {
  const collection = data.collectionById(entry.collectionId);
  const head = `${entry.song.t} — ${collection ? collection.title : ''} №${entry.song.n}`;
  const body = entry.song.b.map((block) => {
    const label = block.k === 'chorus' ? 'Припев:' : block.k === 'verse' && block.n ? `${block.n}.` : '';
    return (label ? `${label}\n` : '') + block.l.join('\n');
  }).join('\n\n');
  return `${head}\n\n${body}`;
}

/* --- Действия ------------------------------------------------------------- */

function toggleFavorite() {
  if (!current) return;
  const active = store.toggleFavorite({
    c: current.collectionId,
    n: current.song.n,
    t: current.song.t,
  });
  favoriteButton.setAttribute('aria-pressed', active ? 'true' : 'false');
  favoriteButton.setAttribute('aria-label', active ? 'Убрать из избранного' : 'В избранное');
  favoriteButton.classList.add('is-bumped');
  setTimeout(() => favoriteButton.classList.remove('is-bumped'), 200);
  haptic(active ? 10 : 6);
  toast(active ? 'Добавлено в избранное' : 'Убрано из избранного');
}

function openActions() {
  if (!current) return;
  const collection = data.collectionById(current.collectionId);
  const autoRow = el('button', {
    type: 'button',
    class: 'row',
    onclick: () => {
      if (autoTimer) { stopAuto(); toast('Автопрокрутка выключена'); }
      else { startAuto(autoSpeed); toast('Автопрокрутка включена'); }
      closeSheet();
    },
  }, [
    el('span', { html: icon(ICONS.scroll), style: 'display:flex' }),
    el('span', { class: 'row__body' }, [
      el('span', { class: 'row__title', text: autoTimer ? 'Остановить прокрутку' : 'Автопрокрутка' }),
      el('span', { class: 'row__meta', text: 'Текст плавно едет во время пения' }),
    ]),
  ]);

  openSheet('Песня', el('div', {}, [
    el('div', { class: 'panel', style: 'margin-top:0' }, [
      autoRow,
      el('div', { class: 'row row--stacked' }, [
        el('span', { class: 'row__body' }, [
          el('span', { class: 'row__title', text: 'Скорость прокрутки' }),
        ]),
        segmented(AUTO_SPEEDS, autoSpeed, (value) => {
          autoSpeed = value;
          if (autoTimer) startAuto(value);
        }, 'Скорость прокрутки'),
      ]),
    ]),
    el('div', { class: 'panel' }, [
      el('button', {
        type: 'button',
        class: 'row',
        onclick: () => { copy(plainText(current)); closeSheet(); },
      }, [
        el('span', { html: icon(ICONS.copy), style: 'display:flex' }),
        el('span', { class: 'row__body' }, [el('span', { class: 'row__title', text: 'Копировать текст' })]),
      ]),
      el('button', {
        type: 'button',
        class: 'row',
        onclick: () => { share(current.song.t, plainText(current)); closeSheet(); },
      }, [
        el('span', { html: icon(ICONS.share), style: 'display:flex' }),
        el('span', { class: 'row__body' }, [el('span', { class: 'row__title', text: 'Поделиться' })]),
      ]),
      el('button', {
        type: 'button',
        class: 'row',
        onclick: () => { closeSheet(); navigate(`#/c/${current.collectionId}`); },
      }, [
        el('span', { html: icon(ICONS.list), style: 'display:flex' }),
        el('span', { class: 'row__body' }, [
          el('span', { class: 'row__title', text: 'Открыть сборник' }),
          el('span', { class: 'row__meta', text: collection ? collection.title : '' }),
        ]),
      ]),
    ]),
  ]));
}

function startAuto(speed) {
  stopAuto();
  let carry = 0;
  autoTimer = setInterval(() => {
    carry += speed / 60;
    const step = Math.floor(carry);
    if (step >= 1) {
      carry -= step;
      scroller.scrollTop += step;
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) stopAuto();
    }
  }, 1000 / 60);
}

function stopAuto() {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = 0;
}

/* --- Жесты ---------------------------------------------------------------- */

function bindSwipes() {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  scroller.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    tracking = true;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  }, { passive: true });

  scroller.addEventListener('touchmove', (event) => {
    if (!tracking) return;
    const dx = event.touches[0].clientX - startX;
    const dy = event.touches[0].clientY - startY;
    if (Math.abs(dx) > 72 && Math.abs(dy) < 42) {
      tracking = false;
      stopAuto();
      step(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  scroller.addEventListener('touchend', () => { tracking = false; });

  scroller.addEventListener('click', (event) => {
    if (event.target.closest('button, a')) return;
    setToolbar(toolbarHidden);
  });
}

function step(direction) {
  if (!current) return;
  const { prev, next } = data.neighboursOf(current.collectionId, current.song.n);
  const target = direction > 0 ? next : prev;
  if (!target) {
    toast(direction > 0 ? 'Это последняя песня сборника' : 'Это первая песня сборника');
    return;
  }
  haptic();
  navigate(`#/s/${current.collectionId}/${target.n}`, { replace: true });
}

/* --- Открытие и закрытие -------------------------------------------------- */

export async function openReader(collectionId, number) {
  const collection = data.collectionById(collectionId);
  host.hidden = false;
  requestAnimationFrame(() => host.classList.add('is-open'));
  stopAuto();

  if (!data.corpusReady()) {
    page.replaceChildren(skeletonList(6));
    try {
      await data.loadCorpus();
    } catch (error) {
      page.replaceChildren(emptyState({
        icon: ICONS.alert,
        title: 'Не удалось открыть текст',
        text: 'Попробуйте перезапустить приложение.',
      }));
      return;
    }
  }

  const song = data.songOf(collectionId, number);
  if (!song) {
    page.replaceChildren(emptyState({
      icon: ICONS.alert,
      title: 'Песня не найдена',
      text: 'Возможно, номер указан неверно.',
    }));
    return;
  }

  current = { collectionId, song };
  barTitle.textContent = song.t;

  const isFavorite = store.isFavorite(collectionId, song.n);
  favoriteButton.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
  favoriteButton.setAttribute('aria-label', isFavorite ? 'Убрать из избранного' : 'В избранное');

  const { prev, next } = data.neighboursOf(collectionId, song.n);
  const meta = [collection ? collection.title : '', `№${song.n}`]
    .concat(song.a ? [`в «Песнях юности» №${song.a}`] : [])
    .join(' · ');

  page.replaceChildren(
    el('header', { class: 'song-header' }, [
      el('h1', { class: 'song-header__title', text: song.t }),
      el('p', { class: 'song-header__meta', text: meta }),
      el('div', { class: 'song-header__rule' }),
    ]),
    ...renderVerses(song),
    el('nav', { class: 'reader__pager', 'aria-label': 'Соседние песни' }, [
      prev ? el('button', {
        type: 'button',
        class: 'pager-button',
        onclick: () => step(-1),
      }, [
        el('span', { html: icon(ICONS.back), style: 'display:flex' }),
        el('span', { class: 'pager-button__body' }, [
          el('span', { class: 'pager-button__label', text: `№${prev.n}` }),
          el('span', { class: 'pager-button__title', text: prev.t }),
        ]),
      ]) : null,
      next ? el('button', {
        type: 'button',
        class: 'pager-button pager-button--next',
        onclick: () => step(1),
      }, [
        el('span', { html: icon(ICONS.chevron), style: 'display:flex' }),
        el('span', { class: 'pager-button__body' }, [
          el('span', { class: 'pager-button__label', text: `№${next.n}` }),
          el('span', { class: 'pager-button__title', text: next.t }),
        ]),
      ]) : null,
    ]),
  );

  scroller.scrollTop = 0;
  lastScrollTop = 0;
  host.classList.remove('is-stuck');
  setToolbar(true);
  store.markRead({ c: collectionId, n: song.n, t: song.t });
  if (store.get('keepAwake')) keepAwake(true);
}

export function closeReader() {
  if (host.hidden) return false;
  stopAuto();
  keepAwake(false);
  host.classList.remove('is-open');
  setTimeout(() => { host.hidden = true; }, 200);
  current = null;
  return true;
}

export function readerIsOpen() {
  return host && !host.hidden;
}
