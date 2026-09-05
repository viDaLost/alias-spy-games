/* Экраны приложения: библиотека, сборник, поиск, избранное, настройки. */

import { el, icon, ICONS, toast, haptic, plural, watchStuck, openSheet, keepAwake, setNativeTheme } from './ui.js';
import { store } from './store.js';
import * as data from './data.js';

const ROW_HEIGHT = 74;

/* --- Виртуальный список ------------------------------------------------- */

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
    const start = Math.max(0, Math.floor(top / ROW_HEIGHT) - 5);
    const end = Math.min(items.length, Math.ceil((top + height) / ROW_HEIGHT) + 5);
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

function songRow(entry, onOpen) {
  const meta = data.collectionById(entry.c);
  const favorite = store.isFavorite(entry.c, entry.n);
  return el('button', {
    class: 'song',
    onclick: () => onOpen(entry),
  }, [
    el('span', { class: `song__num tint-${entry.c}`, text: String(entry.n) }),
    el('span', { class: 'song__body' }, [
      el('span', { class: 'song__title', text: entry.t }),
      el('span', { class: 'song__sub', text: entry.p || (meta ? meta.title : '') }),
    ]),
    favorite ? el('span', { class: 'song__fav', html: icon(ICONS.heart) }) : null,
  ]);
}

/* --- Библиотека --------------------------------------------------------- */

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function homeScreen(nav) {
  const screen = el('section', { class: 'screen', 'data-screen': 'home' });

  const render = () => {
    const favorites = store.favorites();
    const recent = store.recent();
    const last = store.get('lastRead');
    const total = data.totalCount();

    const parts = [
      el('header', { class: 'hero' }, [
        el('div', { class: 'hero__row' }, [
          el('div', {}, [
            el('div', { class: 'hero__kicker', text: greeting() }),
            el('h1', { class: 'hero__title', text: 'Псалмы' }),
          ]),
          el('button', {
            class: 'icon-btn',
            'aria-label': 'Сменить тему',
            html: icon(document.documentElement.dataset.theme === 'dark' ? ICONS.sun : ICONS.moon),
            onclick: (event) => {
              const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
              store.set('theme', next);
              applyTheme();
              event.currentTarget.innerHTML = icon(next === 'dark' ? ICONS.sun : ICONS.moon);
              haptic(10);
            },
          }),
        ]),
      ]),

      el('button', { class: 'search-cta', onclick: () => nav('#/search') }, [
        el('span', { class: 'search-cta__icon', html: icon(ICONS.search) }),
        el('span', { text: 'Искать во всех сборниках' }),
        el('span', { class: 'search-cta__hint', text: `${total}` }),
      ]),
    ];

    const daily = songOfTheDay();
    if (daily) {
      parts.push(el('div', { class: 'section' }, [
        el('button', { class: 'daily', onclick: () => nav(`#/s/${daily.c}/${daily.n}`) }, [
          el('div', { class: 'daily__kicker', text: 'Псалом дня' }),
          el('div', { class: 'daily__title', text: daily.t }),
          daily.p ? el('div', { class: 'daily__line', text: daily.p }) : null,
          el('div', { class: 'daily__foot' }, [
            el('span', { class: `chip-badge tint-${daily.c}`, text: `${(data.collectionById(daily.c) || {}).title || ''} · №${daily.n}` }),
          ]),
        ]),
      ]));
    }

    if (last) {
      parts.push(el('div', { class: 'section' }, [
        el('div', { class: 'section__head' }, [el('div', { class: 'section__title', text: 'Продолжить' })]),
        el('button', {
          class: 'resume',
          onclick: () => nav(`#/s/${last.c}/${last.n}`),
        }, [
          el('span', { class: 'resume__play', html: icon(ICONS.play, 'fill="currentColor" stroke="none"') }),
          el('span', { class: 'resume__body' }, [
            el('span', { class: 'resume__title', text: last.t }),
            el('span', {
              class: 'resume__meta',
              text: `${(data.collectionById(last.c) || {}).title || ''} · №${last.n}`,
            }),
          ]),
          el('span', { class: 'icon-btn', html: icon(ICONS.chevron) }),
        ]),
      ]));
    }

    parts.push(el('div', { class: 'section' }, [
      el('div', { class: 'section__head' }, [
        el('div', { class: 'section__title', text: 'Сборники' }),
        el('div', { class: 'section__link', text: `${total} песен` }),
      ]),
      el('div', { class: 'grid stagger' }, data.collections().map((meta) => (
        el('button', {
          class: `book book--${meta.id}`,
          onclick: () => nav(`#/c/${meta.id}`),
        }, [
          el('span', { class: 'book__glyph', text: meta.prefix }),
          el('span', { class: 'book__title', text: meta.title }),
          el('span', {
            class: 'book__meta',
            text: `${meta.count} ${plural(meta.count, 'песня', 'песни', 'песен')} · ${meta.subtitle}`,
          }),
        ])
      ))),
    ]));

    if (favorites.length) {
      parts.push(el('div', { class: 'section' }, [
        el('div', { class: 'section__head' }, [
          el('div', { class: 'section__title', text: 'Избранное' }),
          el('button', { class: 'section__link', text: 'Все', onclick: () => nav('#/favorites') }),
        ]),
        el('div', { class: 'rail' }, favorites.slice(0, 10).map((item) => railCard(item, nav))),
      ]));
    }

    if (recent.length > 1) {
      parts.push(el('div', { class: 'section' }, [
        el('div', { class: 'section__head' }, [el('div', { class: 'section__title', text: 'Недавние' })]),
        el('div', { class: 'rail' }, recent.slice(0, 12).map((item) => railCard(item, nav))),
      ]));
    }

    parts.push(el('div', { class: 'section' }, [
      el('div', { class: 'tiles' }, [
        el('button', {
          class: 'tile',
          onclick: () => {
            const pick = data.randomSong();
            if (pick) { haptic(12); nav(`#/s/${pick.c}/${pick.n}`); }
          },
        }, [
          el('span', { class: 'tile__icon', html: icon(ICONS.shuffle) }),
          el('span', { class: 'tile__body' }, [
            el('span', { class: 'tile__title', text: 'Случайная' }),
            el('span', { class: 'tile__meta', text: 'Открыть наугад' }),
          ]),
        ]),
        el('button', {
          class: 'tile',
          onclick: () => nav('#/settings'),
        }, [
          el('span', { class: 'tile__icon', html: icon(ICONS.text) }),
          el('span', { class: 'tile__body' }, [
            el('span', { class: 'tile__title', text: 'Вид текста' }),
            el('span', { class: 'tile__meta', text: `${store.get('fontSize')} pt` }),
          ]),
        ]),
      ]),
    ]));

    screen.replaceChildren(...parts);
  };

  render();
  screen.refresh = render;
  return screen;
}

/* Одна и та же песня в течение суток — «псалом дня». */
function songOfTheDay() {
  const all = data.collections();
  if (!all.length) return null;
  const now = new Date();
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  let seed = (day * 2654435761) % 2147483647;
  if (seed < 0) seed += 2147483647;
  const total = data.totalCount();
  let offset = seed % total;
  for (const meta of all) {
    const items = data.titlesOf(meta.id);
    if (offset < items.length) {
      const row = items[offset];
      return { c: meta.id, n: row[0], t: row[1], p: row[2] };
    }
    offset -= items.length;
  }
  return null;
}

function railCard(item, nav) {
  const meta = data.collectionById(item.c);
  return el('button', {
    class: 'rail__card',
    onclick: () => nav(`#/s/${item.c}/${item.n}`),
  }, [
    el('span', { class: `chip-badge tint-${item.c}`, text: `${meta ? meta.title : ''} · ${item.n}` }),
    el('span', { class: 'rail__title', text: item.t }),
  ]);
}

/* --- Сборник ------------------------------------------------------------ */

export function collectionScreen(collectionId, nav) {
  const meta = data.collectionById(collectionId);
  const all = data.titlesOf(collectionId).map((row) => ({ c: collectionId, n: row[0], t: row[1], p: row[2] }));
  const screen = el('section', { class: 'screen', 'data-screen': `collection:${collectionId}` });

  const bar = el('div', { class: 'appbar' }, [
    el('button', { class: 'icon-btn', html: icon(ICONS.back), 'aria-label': 'Назад', onclick: () => history.back() }),
    el('div', { class: 'appbar__title' }, [
      el('div', { text: meta ? meta.title : 'Сборник' }),
      el('div', { class: 'appbar__sub', text: `${all.length} ${plural(all.length, 'песня', 'песни', 'песен')}` }),
    ]),
    el('button', {
      class: 'icon-btn',
      html: icon(ICONS.shuffle),
      'aria-label': 'Случайная песня',
      onclick: () => {
        const pick = all[Math.floor(Math.random() * all.length)];
        haptic(12);
        nav(`#/s/${pick.c}/${pick.n}`);
      },
    }),
  ]);

  const listHost = el('div', { class: 'vlist' });
  const field = el('input', {
    type: 'search',
    inputmode: 'search',
    placeholder: 'Номер или название',
    autocomplete: 'off',
  });

  const filterRow = el('div', { class: 'jump' }, [
    el('div', { class: 'jump__field' }, [el('span', { html: icon(ICONS.search) }), field]),
  ]);

  const openSong = (entry) => nav(`#/s/${entry.c}/${entry.n}`);

  const draw = (items) => {
    listHost.replaceChildren(
      items.length
        ? virtualList(screen, items, (entry) => songRow(entry, openSong))
        : el('div', { class: 'empty' }, [
          el('div', { class: 'empty__icon', html: icon(ICONS.search) }),
          el('div', { class: 'empty__title', text: 'Ничего не нашлось' }),
          el('div', { class: 'empty__text', text: 'Попробуйте другой номер или слово из названия' }),
        ]),
    );
  };

  field.addEventListener('input', () => {
    const value = data.fold(field.value.trim());
    if (!value) { draw(all); return; }
    const asNumber = /^\d+$/.test(value) ? Number(value) : null;
    draw(all.filter((entry) => (
      (asNumber != null && String(entry.n).startsWith(value))
      || data.fold(entry.t).includes(value)
      || data.fold(entry.p || '').includes(value)
    )));
  });

  const head = el('div', { class: 'stickyhead' }, [bar, filterRow]);
  screen.append(head, listHost);
  draw(all);
  watchStuck(screen, head, 2);
  screen.refresh = () => {
    const runway = listHost.querySelector('.vlist__runway');
    if (runway && runway.refresh) runway.refresh();
  };
  return screen;
}

/* --- Поиск -------------------------------------------------------------- */

const PAGE = 30;

export function searchScreen(nav) {
  const screen = el('section', { class: 'screen', 'data-screen': 'search' });

  const input = el('input', {
    type: 'search',
    inputmode: 'search',
    autocomplete: 'off',
    placeholder: 'Слово, строка или номер',
    'aria-label': 'Поиск по всем сборникам',
  });

  const clear = el('button', {
    class: 'searchbar__clear',
    html: icon(ICONS.close),
    'aria-label': 'Очистить',
    hidden: true,
    onclick: () => { input.value = ''; clear.hidden = true; run(''); input.focus(); },
  });

  const bar = el('div', { class: 'searchbar' }, [
    el('div', { class: 'searchbar__field' }, [
      el('span', { html: icon(ICONS.search) }),
      input,
      clear,
    ]),
  ]);

  const chipRow = el('div', { class: 'chips' });
  const meta = el('div', { class: 'result-meta' });
  const list = el('div', { class: 'results' });

  let filter = 'all';
  let current = { items: [], counts: {}, total: 0 };
  let shown = 0;
  let query = '';

  const openSong = (entry) => {
    store.rememberQuery(query);
    nav(`#/s/${entry.c}/${entry.n}`);
  };

  const filtered = () => (filter === 'all' ? current.items : current.items.filter((item) => item.c === filter));

  const renderChips = () => {
    const options = [{ id: 'all', title: 'Все', count: current.total }].concat(
      data.collections().map((collection) => ({
        id: collection.id,
        title: collection.title,
        count: current.counts[collection.id] || 0,
      })),
    );
    chipRow.replaceChildren(...options.map((option) => el('button', {
      class: `chip${filter === option.id ? ' is-on' : ''}`,
      onclick: () => { filter = option.id; haptic(6); renderChips(); renderList(); },
    }, [
      el('span', { text: option.title }),
      current.total ? el('span', { class: 'chip__count', text: String(option.count) }) : null,
    ])));
  };

  const appendRows = () => {
    const rows = filtered();
    const slice = rows.slice(shown, shown + PAGE);
    const fragment = document.createDocumentFragment();
    slice.forEach((item, position) => {
      const collection = data.collectionById(item.c);
      const node = el('button', { class: 'result', onclick: () => openSong(item) }, [
        el('div', { class: 'result__top' }, [
          el('span', { class: `chip-badge tint-${item.c}`, text: `${collection ? collection.title : ''} · №${item.n}` }),
        ]),
        el('div', { class: 'result__title', html: item.titleHtml }),
        el('div', { class: 'result__snippet', html: item.snippet }),
      ]);
      node.style.animationDelay = `${Math.min(position * 22, 260)}ms`;
      fragment.append(node);
    });
    shown += slice.length;
    list.append(fragment);
    if (shown < rows.length) list.append(sentinel());
  };

  const sentinel = () => {
    const node = el('div', { style: 'height:1px' });
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        node.remove();
        appendRows();
      }
    }, { root: screen, rootMargin: '400px' });
    observer.observe(node);
    return node;
  };

  const renderList = () => {
    shown = 0;
    list.replaceChildren();
    const rows = filtered();
    if (!query) {
      meta.textContent = '';
      list.append(idleState());
      return;
    }
    if (!rows.length) {
      meta.textContent = '';
      list.append(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', html: icon(ICONS.search) }),
        el('div', { class: 'empty__title', text: 'Ничего не найдено' }),
        el('div', { class: 'empty__text', text: 'Проверьте написание или попробуйте одно слово вместо фразы' }),
      ]));
      return;
    }
    const hint = current.usedVariant ? ` · показано для «${current.usedVariant}»` : '';
    meta.textContent = `${rows.length} ${plural(rows.length, 'совпадение', 'совпадения', 'совпадений')}${hint}`;
    appendRows();
  };

  const idleState = () => {
    const recentQueries = store.queries();
    const tips = ['Господь', 'благодать', 'хвала', 'радость', 'молитва', 'спаситель'];
    const box = el('div', {});
    if (recentQueries.length) {
      box.append(
        el('div', { class: 'section__head', style: 'padding-top:14px' }, [
          el('div', { class: 'section__title', text: 'Недавние запросы' }),
          el('button', {
            class: 'section__link',
            text: 'Очистить',
            onclick: () => { store.forgetQueries(); renderList(); },
          }),
        ]),
        el('div', { class: 'suggests' }, recentQueries.map((value) => el('button', {
          class: 'suggest suggest--recent',
          text: value,
          onclick: () => { input.value = value; clear.hidden = false; run(value); },
        }))),
      );
    }
    box.append(
      el('div', { class: 'section__head', style: 'padding-top:18px' }, [
        el('div', { class: 'section__title', text: 'Попробуйте' }),
      ]),
      el('div', { class: 'suggests' }, tips.map((value) => el('button', {
        class: 'suggest',
        text: value,
        onclick: () => { input.value = value; clear.hidden = false; run(value); },
      }))),
      el('div', { class: 'empty', style: 'padding:34px 34px 10px' }, [
        el('div', { class: 'empty__icon', html: icon(ICONS.book) }),
        el('div', { class: 'empty__title', text: 'Один поиск — все сборники' }),
        el('div', {
          class: 'empty__text',
          text: `Юность, Горлица, Сион и Мои стихи — ${data.totalCount()} песен ищутся одновременно. Введите слово из текста или номер песни.`,
        }),
      ]),
    );
    return box;
  };

  let timer = 0;
  const run = (value) => {
    query = value.trim();
    if (!query) {
      current = { items: [], counts: {}, total: 0 };
      renderChips();
      renderList();
      return;
    }
    if (!data.corpusReady()) {
      meta.textContent = 'Готовим сборники…';
      list.replaceChildren(el('div', { class: 'empty' }, [
        el('div', { class: 'empty__title', text: 'Секунду' }),
        el('div', { class: 'empty__text', text: 'Загружаем тексты песен' }),
      ]));
      data.loadCorpus().then(() => run(query));
      return;
    }
    current = data.search(query);
    renderChips();
    renderList();
    screen.scrollTop = 0;
  };

  input.addEventListener('input', () => {
    clear.hidden = !input.value;
    clearTimeout(timer);
    timer = setTimeout(() => run(input.value), 110);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      input.blur();
      store.rememberQuery(input.value);
    }
  });

  screen.append(bar, chipRow, meta, list);
  renderChips();
  renderList();
  watchStuck(screen, bar, 2);
  // Клавиатуру поднимаем только на пустом поиске, а не при возврате к результатам.
  screen.focusInput = () => { if (!input.value) setTimeout(() => input.focus(), 220); };
  screen.refresh = () => { if (!query) renderList(); };
  screen.setQuery = (value) => { input.value = value; clear.hidden = !value; run(value); };
  return screen;
}

/* --- Избранное ---------------------------------------------------------- */

export function favoritesScreen(nav) {
  const screen = el('section', { class: 'screen', 'data-screen': 'favorites' });

  const render = () => {
    const items = store.favorites();
    const bar = el('div', { class: 'appbar' }, [
      el('div', { class: 'appbar__title' }, [
        el('div', { text: 'Избранное' }),
        el('div', {
          class: 'appbar__sub',
          text: items.length
            ? `${items.length} ${plural(items.length, 'песня', 'песни', 'песен')}`
            : 'пока пусто',
        }),
      ]),
    ]);

    const body = items.length
      ? el('div', { class: 'stagger' }, items.map((item) => {
        const collection = data.collectionById(item.c);
        return el('div', { class: 'song', onclick: () => nav(`#/s/${item.c}/${item.n}`) }, [
          el('span', { class: `song__num tint-${item.c}`, text: String(item.n) }),
          el('span', { class: 'song__body' }, [
            el('span', { class: 'song__title', text: item.t }),
            el('span', { class: 'song__sub', text: collection ? collection.title : '' }),
          ]),
          el('button', {
            class: 'song__fav',
            html: icon(ICONS.heart),
            'aria-label': 'Убрать из избранного',
            onclick: (event) => {
              event.stopPropagation();
              store.toggleFavorite(item);
              haptic(10);
              toast('Убрано из избранного');
              render();
            },
          }),
        ]);
      }))
      : el('div', { class: 'empty' }, [
        el('div', { class: 'empty__icon', html: icon(ICONS.heart) }),
        el('div', { class: 'empty__title', text: 'Здесь будут ваши песни' }),
        el('div', { class: 'empty__text', text: 'Откройте песню и нажмите сердце — она появится тут и будет доступна без интернета.' }),
        el('button', {
          class: 'suggest',
          style: 'margin-top:18px',
          text: 'Открыть библиотеку',
          onclick: () => nav('#/home'),
        }),
      ]);

    screen.replaceChildren(bar, body);
    watchStuck(screen, bar, 2);
  };

  render();
  screen.refresh = render;
  return screen;
}

/* --- Настройки ---------------------------------------------------------- */

export function applyTheme() {
  const theme = store.get('theme');
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark'
    || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const color = dark ? '#0c0e13' : '#faf7f2';
  const tag = document.querySelector('meta[name="theme-color"]');
  if (tag) tag.setAttribute('content', color);
  setNativeTheme(dark);
}

export function applyTypography() {
  const root = document.documentElement;
  root.style.setProperty('--reader-size', `${store.get('fontSize')}px`);
  root.style.setProperty('--reader-leading', String(store.get('leading')));
  root.style.setProperty('--reader-family', store.get('serif')
    ? 'Georgia, "Times New Roman", "Noto Serif", serif'
    : "'Onest', system-ui, sans-serif");
}

export function typographySheet() {
  const preview = el('div', {
    class: 'block__lines',
    style: 'padding:0 20px 6px;color:var(--text-2)',
    text: 'Великий Бог, Твои мы дети,\nКогда-то Сам Ты так сказал.',
  });

  const sizeValue = el('span', { class: 'stepper__value', text: `${store.get('fontSize')} pt` });
  const leadValue = el('span', { class: 'stepper__value', text: store.get('leading').toFixed(2) });

  const bump = (key, delta, min, max, node, format) => {
    const next = Math.min(max, Math.max(min, Number((store.get(key) + delta).toFixed(2))));
    store.set(key, next);
    node.textContent = format(next);
    applyTypography();
    haptic(6);
  };

  const serifSwitch = el('span', { class: `switch${store.get('serif') ? ' is-on' : ''}` });

  const content = el('div', {}, [
    preview,
    el('div', { class: 'card', style: 'margin-top:8px' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'row__icon', html: icon(ICONS.text) }),
        el('span', { class: 'row__body' }, [el('span', { class: 'row__title', text: 'Размер' })]),
        el('span', { class: 'stepper' }, [
          el('button', { text: '−', onclick: () => bump('fontSize', -1, 14, 30, sizeValue, (v) => `${v} pt`) }),
          sizeValue,
          el('button', { text: '+', onclick: () => bump('fontSize', 1, 14, 30, sizeValue, (v) => `${v} pt`) }),
        ]),
      ]),
      el('div', { class: 'row' }, [
        el('span', { class: 'row__icon', html: icon(ICONS.scroll) }),
        el('span', { class: 'row__body' }, [el('span', { class: 'row__title', text: 'Межстрочный интервал' })]),
        el('span', { class: 'stepper' }, [
          el('button', { text: '−', onclick: () => bump('leading', -0.08, 1.25, 2.2, leadValue, (v) => v.toFixed(2)) }),
          leadValue,
          el('button', { text: '+', onclick: () => bump('leading', 0.08, 1.25, 2.2, leadValue, (v) => v.toFixed(2)) }),
        ]),
      ]),
      el('div', {
        class: 'row',
        onclick: () => {
          const next = !store.get('serif');
          store.set('serif', next);
          serifSwitch.classList.toggle('is-on', next);
          applyTypography();
          haptic(8);
        },
      }, [
        el('span', { class: 'row__icon', html: icon(ICONS.book) }),
        el('span', { class: 'row__body' }, [
          el('span', { class: 'row__title', text: 'Шрифт с засечками' }),
          el('span', { class: 'row__sub', text: 'Классический вид для длинных текстов' }),
        ]),
        serifSwitch,
      ]),
    ]),
  ]);

  return openSheet('Вид текста', content);
}

export function settingsScreen() {
  const screen = el('section', { class: 'screen', 'data-screen': 'settings' });

  const render = () => {
    const themeSegment = el('div', { class: 'segment' }, [
      ['auto', 'Система'], ['light', 'Светлая'], ['dark', 'Тёмная'],
    ].map(([value, label]) => el('button', {
      class: store.get('theme') === value ? 'is-on' : '',
      text: label,
      onclick: () => { store.set('theme', value); applyTheme(); haptic(8); render(); },
    })));

    const awakeSwitch = el('span', { class: `switch${store.get('keepAwake') ? ' is-on' : ''}` });

    screen.replaceChildren(
      el('div', { class: 'appbar' }, [
        el('div', { class: 'appbar__title' }, [
          el('div', { text: 'Настройки' }),
          el('div', { class: 'appbar__sub', text: 'Оформление и чтение' }),
        ]),
      ]),

      el('div', { class: 'card stagger', style: 'margin-top:8px' }, [
        el('div', { class: 'row', style: 'flex-direction:column;align-items:stretch;gap:10px' }, [
          el('div', { style: 'display:flex;align-items:center;gap:13px' }, [
            el('span', { class: 'row__icon', html: icon(ICONS.moon) }),
            el('span', { class: 'row__body' }, [
              el('span', { class: 'row__title', text: 'Тема' }),
              el('span', { class: 'row__sub', text: 'Светлая, тёмная или как в системе' }),
            ]),
          ]),
          themeSegment,
        ]),
        el('button', { class: 'row', onclick: () => typographySheet() }, [
          el('span', { class: 'row__icon', html: icon(ICONS.text) }),
          el('span', { class: 'row__body' }, [
            el('span', { class: 'row__title', text: 'Вид текста' }),
            el('span', {
              class: 'row__sub',
              text: `${store.get('fontSize')} pt · интервал ${store.get('leading').toFixed(2)}`
                + (store.get('serif') ? ' · с засечками' : ''),
            }),
          ]),
          el('span', { class: 'icon-btn', html: icon(ICONS.chevron) }),
        ]),
        el('div', {
          class: 'row',
          onclick: () => {
            const next = !store.get('keepAwake');
            store.set('keepAwake', next);
            awakeSwitch.classList.toggle('is-on', next);
            keepAwake(next);
            haptic(8);
          },
        }, [
          el('span', { class: 'row__icon', html: icon(ICONS.eye) }),
          el('span', { class: 'row__body' }, [
            el('span', { class: 'row__title', text: 'Не гасить экран' }),
            el('span', { class: 'row__sub', text: 'Пока открыт текст песни' }),
          ]),
          awakeSwitch,
        ]),
      ]),

      el('div', { class: 'card' }, [
        el('button', {
          class: 'row',
          onclick: () => { store.forgetQueries(); toast('История поиска очищена'); haptic(10); },
        }, [
          el('span', { class: 'row__icon', html: icon(ICONS.clock) }),
          el('span', { class: 'row__body' }, [
            el('span', { class: 'row__title', text: 'Очистить историю поиска' }),
            el('span', { class: 'row__sub', text: `${store.queries().length} сохранённых запросов` }),
          ]),
        ]),
        el('button', {
          class: 'row',
          onclick: () => {
            if (!store.favorites().length) { toast('Избранное и так пусто'); return; }
            store.set('favorites', []);
            toast('Избранное очищено');
            haptic(12);
            render();
          },
        }, [
          el('span', { class: 'row__icon', html: icon(ICONS.trash) }),
          el('span', { class: 'row__body' }, [
            el('span', { class: 'row__title', text: 'Очистить избранное' }),
            el('span', { class: 'row__sub', text: `${store.favorites().length} ${plural(store.favorites().length, 'песня', 'песни', 'песен')}` }),
          ]),
        ]),
      ]),

      el('div', { class: 'card' }, data.collections().map((meta) => el('div', { class: 'row' }, [
        el('span', { class: `song__num tint-${meta.id}`, style: 'width:36px;height:36px;border-radius:12px', text: meta.prefix }),
        el('span', { class: 'row__body' }, [
          el('span', { class: 'row__title', text: meta.title }),
          el('span', { class: 'row__sub', text: meta.subtitle }),
        ]),
        el('span', { class: 'row__sub', text: `${meta.count}` }),
      ]))),

      el('div', { class: 'about' }, [
        el('div', { text: 'Псалмы · офлайн-сборники духовных песен' }),
        el('div', { text: `${data.totalCount()} песен из четырёх сборников. Работает без интернета.` }),
      ]),
    );
  };

  render();
  screen.refresh = render;
  return screen;
}
