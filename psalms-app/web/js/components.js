/* Переиспользуемые блоки интерфейса. */

import { el, icon, ICONS } from './ui.js';

export const ROW_HEIGHT = 68;

/** Заголовок секции с необязательным действием справа. */
export function sectionHeader(title, action) {
  return el('div', { class: 'section__header' }, [
    el('h2', { class: 'section__title', text: title }),
    action ? el('button', {
      type: 'button',
      class: 'section__action',
      text: action.label,
      onclick: action.onClick,
    }) : null,
  ]);
}

/** Строка списка песен: номер, название, пояснение и признак избранного. */
export function songListItem(entry, options) {
  const settings = options || {};
  const trailing = settings.favorite
    ? el('button', {
      type: 'button',
      class: `list-item__trailing${settings.favorite.active ? ' is-on' : ''}`,
      'aria-label': settings.favorite.active ? 'Убрать из избранного' : 'В избранное',
      'aria-pressed': settings.favorite.active ? 'true' : 'false',
      html: icon(ICONS.heart),
      onclick: (event) => {
        event.stopPropagation();
        settings.favorite.onToggle(entry);
      },
    })
    : null;

  return el('button', {
    type: 'button',
    class: 'list-item',
    onclick: () => settings.onOpen(entry),
  }, [
    settings.hideIndex ? null : el('span', { class: 'list-item__index', text: String(entry.n) }),
    el('span', { class: 'list-item__body' }, [
      el('span', { class: 'list-item__title', text: entry.t }),
      settings.meta ? el('span', { class: 'list-item__meta', text: settings.meta }) : null,
    ]),
    trailing,
  ]);
}

/** Карточка сборника: буква-обложка, название и число песен. */
export function bookCard(meta, onOpen, wide) {
  return el('button', {
    type: 'button',
    class: `book-card tint-${meta.id}${wide ? ' book-card--wide' : ''}`,
    onclick: () => onOpen(meta),
  }, [
    el('span', { class: 'book-card__cover', 'aria-hidden': 'true', text: meta.prefix }),
    el('span', { class: 'book-card__body' }, [
      el('span', { class: 'book-card__title', text: meta.title }),
      el('span', { class: 'book-card__meta', text: `${meta.count} · ${meta.subtitle}` }),
    ]),
  ]);
}

/** Карточка песни для горизонтальной ленты. */
export function songCard(entry, collectionTitle, onOpen) {
  return el('button', {
    type: 'button',
    class: `song-card tint-${entry.c}`,
    onclick: () => onOpen(entry),
  }, [
    el('span', { class: 'song-card__badge', text: `№${entry.n}` }),
    el('span', { class: 'song-card__title', text: entry.t }),
    el('span', { class: 'song-card__meta', text: collectionTitle }),
  ]);
}

/** Крупная карточка «продолжить чтение». */
export function resumeCard(entry, collectionTitle, onOpen, arrow) {
  return el('button', {
    type: 'button',
    class: `resume-card tint-${entry.c}`,
    onclick: () => onOpen(entry),
  }, [
    el('span', { class: 'resume-card__body' }, [
      el('span', { class: 'resume-card__label', text: 'Продолжить' }),
      el('span', { class: 'resume-card__title', text: entry.t }),
      el('span', { class: 'resume-card__meta', text: `${collectionTitle} · №${entry.n}` }),
    ]),
    el('span', { class: 'resume-card__go', 'aria-hidden': 'true', html: arrow }),
  ]);
}

/** Пустое состояние: иконка, заголовок, пояснение и одно действие. */
export function emptyState(options) {
  return el('div', { class: `empty${options.inline ? ' empty--inline' : ''}` }, [
    options.icon ? el('div', { class: 'empty__icon', html: icon(options.icon) }) : null,
    el('p', { class: 'empty__title', text: options.title }),
    options.text ? el('p', { class: 'empty__text', text: options.text }) : null,
    options.action ? el('button', {
      type: 'button',
      class: 'empty__action',
      text: options.action.label,
      onclick: options.action.onClick,
    }) : null,
  ]);
}

/** Заглушка на время загрузки. */
export function skeletonList(rows) {
  const count = rows || 5;
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push(el('div', { class: 'skeleton-row' }, [
      el('div', { class: 'skeleton', style: 'width:62%' }),
      el('div', { class: 'skeleton', style: 'width:38%;height:10px' }),
    ]));
  }
  return el('div', { 'aria-hidden': 'true' }, items);
}

/** Переключатель из нескольких равных вариантов. */
export function segmented(options, value, onChange, label) {
  const group = el('div', {
    class: `segmented${options.length >= 4 ? ' segmented--compact' : ''}`,
    role: 'group',
    'aria-label': label || '',
  });
  const buttons = options.map((option) => el('button', {
    type: 'button',
    text: option.label,
    'aria-pressed': option.value === value ? 'true' : 'false',
    onclick: () => {
      for (const button of buttons) button.setAttribute('aria-pressed', 'false');
      const index = options.indexOf(option);
      buttons[index].setAttribute('aria-pressed', 'true');
      onChange(option.value);
    },
  }));
  group.append(...buttons);
  return group;
}

/** Переключатель «включено / выключено». */
export function toggleRow(options) {
  const control = el('button', {
    type: 'button',
    class: 'switch',
    'aria-pressed': options.value ? 'true' : 'false',
    'aria-label': options.title,
  });
  const row = el('div', { class: 'row' }, [
    el('span', { class: 'row__body' }, [
      el('span', { class: 'row__title', text: options.title }),
      options.meta ? el('span', { class: 'row__meta', text: options.meta }) : null,
    ]),
    control,
  ]);
  control.addEventListener('click', () => {
    const next = control.getAttribute('aria-pressed') !== 'true';
    control.setAttribute('aria-pressed', next ? 'true' : 'false');
    options.onChange(next);
  });
  return row;
}

/**
 * Длинные списки рисуем окном: в DOM живут только видимые строки,
 * поэтому тысяча песен прокручивается без задержек.
 */
export function virtualList(scroller, items, renderRow) {
  const runway = el('div', { class: 'vlist__runway' });
  const view = el('div', { class: 'vlist__window' });
  runway.append(view);
  runway.style.height = `${items.length * ROW_HEIGHT}px`;

  let first = -1;
  let last = -1;

  const update = () => {
    if (!runway.isConnected) return;
    const top = scroller.scrollTop - runway.offsetTop;
    const height = scroller.clientHeight || 640;
    const start = Math.max(0, Math.floor(top / ROW_HEIGHT) - 4);
    const end = Math.min(items.length, Math.ceil((top + height) / ROW_HEIGHT) + 4);
    if (start === first && end === last) return;
    first = start;
    last = end;
    view.style.transform = `translateY(${start * ROW_HEIGHT}px)`;
    const fragment = document.createDocumentFragment();
    for (let i = start; i < end; i += 1) fragment.append(renderRow(items[i], i));
    view.replaceChildren(fragment);
  };

  scroller.addEventListener('scroll', update, { passive: true });
  requestAnimationFrame(update);
  runway.refresh = () => { first = -1; update(); };
  return runway;
}
