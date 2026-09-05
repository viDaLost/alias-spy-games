/* Оформление чтения: тема, размер, шрифт и межстрочный интервал.
   Изменения применяются сразу и сохраняются в store. */

import { el, icon, ICONS, openSheet, haptic, setNativeTheme } from './ui.js';
import { segmented } from './components.js';
import { store, FONT_SIZE_MIN, FONT_SIZE_MAX } from './store.js';

const FONTS = {
  system: 'var(--font-system)',
  serif: 'var(--font-serif)',
  sans: 'var(--font-sans)',
};

const SIZE_PRESETS = [
  { label: 'Маленький', value: 16 },
  { label: 'Обычный', value: 18 },
  { label: 'Большой', value: 21 },
  { label: 'Очень большой', value: 24 },
];

const THEMES = [
  { label: 'Лаванда', value: 'lavender' },
  { label: 'Олива', value: 'olive' },
  { label: 'Море', value: 'ocean' },
  { label: 'Шоколад', value: 'chocolate' },
  { label: 'Тёмная', value: 'dark' },
  { label: 'Система', value: 'auto' },
];

const THEME_BAR_COLOR = {
  lavender: '#f6f4fa',
  olive: '#f8faf4',
  ocean: '#f4f9fa',
  chocolate: '#191410',
  dark: '#101119',
};

const LINE_PRESETS = [
  { label: 'Плотный', value: 1.5 },
  { label: 'Обычный', value: 1.7 },
  { label: 'Свободный', value: 1.9 },
];

export const FONT_OPTIONS = [
  { label: 'Система', short: 'Аа', value: 'system' },
  { label: 'С засечками', short: 'Аа', value: 'serif' },
  { label: 'Без засечек', short: 'Аа', value: 'sans' },
];

export const THEME_OPTIONS = THEMES;

/** Меняет размер текста на шаг и возвращает получившееся значение. */
export function changeFontSize(delta) {
  const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, store.get('fontSize') + delta));
  store.set('fontSize', next);
  applyTypography();
  return next;
}

export function setFontFamily(value) {
  store.set('fontFamily', value);
  applyTypography();
}

export function setTheme(value) {
  store.set('theme', value);
  applyTheme();
}

export function isDarkTheme() {
  const theme = store.get('theme');
  if (theme === 'dark' || theme === 'chocolate') return true;
  if (theme === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches;
  return false;
}

export function applyTheme() {
  const theme = store.get('theme');
  document.documentElement.dataset.theme = theme;
  const dark = isDarkTheme();
  const tag = document.querySelector('meta[name="theme-color"]');
  if (tag) {
    tag.setAttribute('content', THEME_BAR_COLOR[theme] || (dark ? '#101119' : '#f6f4fa'));
  }
  setNativeTheme(dark);
}

export function applyTypography() {
  const root = document.documentElement;
  root.style.setProperty('--reader-size', `${store.get('fontSize')}px`);
  root.style.setProperty('--reader-leading', String(store.get('lineHeight')));
  root.style.setProperty('--reader-font', FONTS[store.get('fontFamily')] || FONTS.serif);
}

export function fontLabel() {
  const map = { system: 'Системный', serif: 'С засечками', sans: 'Без засечек' };
  return map[store.get('fontFamily')] || 'С засечками';
}

export function themeLabel() {
  const found = THEMES.find((item) => item.value === store.get('theme'));
  return found ? found.label : 'Лаванда';
}

/** Панель «Оформление»: всё, что влияет на чтение, в одном месте. */
export function typographySheet() {
  const preview = el('p', {
    class: 'preview',
    text: 'Великий Бог, Твои мы дети,\nКогда-то Сам Ты так сказал.',
  });

  const sizeValue = el('span', {
    class: 'size-control__value',
    'aria-live': 'polite',
    text: `${store.get('fontSize')} pt`,
  });

  let sizePresets = null;

  const setSize = (next) => {
    const value = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, next));
    store.set('fontSize', value);
    sizeValue.textContent = `${value} pt`;
    minus.disabled = value <= FONT_SIZE_MIN;
    plus.disabled = value >= FONT_SIZE_MAX;
    if (sizePresets) {
      for (const button of sizePresets.querySelectorAll('button')) {
        const preset = SIZE_PRESETS.find((item) => item.label === button.textContent);
        button.setAttribute('aria-pressed', preset && preset.value === value ? 'true' : 'false');
      }
    }
    applyTypography();
    haptic(4);
  };

  const minus = el('button', {
    type: 'button',
    class: 'size-control__button',
    'aria-label': 'Уменьшить текст',
    html: icon(ICONS.minus),
    onclick: () => setSize(store.get('fontSize') - 1),
  });

  const plus = el('button', {
    type: 'button',
    class: 'size-control__button',
    'aria-label': 'Увеличить текст',
    html: icon(ICONS.plus),
    onclick: () => setSize(store.get('fontSize') + 1),
  });

  sizePresets = segmented(
    SIZE_PRESETS.map((item) => ({ label: item.label, value: item.value })),
    store.get('fontSize'),
    setSize,
    'Размер текста',
  );

  const content = el('div', {}, [
    preview,
    el('div', { class: 'sheet__group' }, [
      el('span', { class: 'sheet__label', text: 'Размер' }),
      el('div', { class: 'size-control' }, [minus, sizeValue, plus]),
      el('div', { style: 'height:12px' }),
      sizePresets,
    ]),
    el('div', { class: 'sheet__group' }, [
      el('span', { class: 'sheet__label', text: 'Шрифт' }),
      segmented([
        { label: 'Система', value: 'system' },
        { label: 'С засечками', value: 'serif' },
        { label: 'Без засечек', value: 'sans' },
      ], store.get('fontFamily'), (value) => {
        store.set('fontFamily', value);
        applyTypography();
        haptic(4);
      }, 'Шрифт'),
    ]),
    el('div', { class: 'sheet__group' }, [
      el('span', { class: 'sheet__label', text: 'Межстрочный интервал' }),
      segmented(LINE_PRESETS, store.get('lineHeight'), (value) => {
        store.set('lineHeight', value);
        applyTypography();
        haptic(4);
      }, 'Межстрочный интервал'),
    ]),
    el('div', { class: 'sheet__group' }, [
      el('span', { class: 'sheet__label', text: 'Тема' }),
      segmented(THEMES, store.get('theme'), (value) => {
        store.set('theme', value);
        applyTheme();
        haptic(4);
      }, 'Тема оформления'),
    ]),
  ]);

  minus.disabled = store.get('fontSize') <= FONT_SIZE_MIN;
  plus.disabled = store.get('fontSize') >= FONT_SIZE_MAX;
  return openSheet('Оформление', content);
}
