/* Экраны приложения: главная, поиск, избранное, сборник, настройки. */

import { el, icon, ICONS, iconButton, toast, haptic, watchStuck, songsWord } from './ui.js';
import {
  sectionHeader, songListItem, emptyState, skeletonList, virtualList, toggleRow,
  bookCard, songCard, resumeCard,
} from './components.js';
import { store } from './store.js';
import { typographySheet, applyTheme, fontLabel, themeLabel } from './typography.js';
import * as data from './data.js';

const HOME_PREVIEW = 5;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function collectionTitle(id) {
  const meta = data.collectionById(id);
  return meta ? meta.title : '';
}

/* --- Главная -------------------------------------------------------------- */

export function homeScreen(nav) {
  const screen = el('section', { class: 'screen', 'data-screen': 'home', tabindex: '-1' });

  const openSong = (entry) => nav(`#/s/${entry.c}/${entry.n}`);

  const render = () => {
    const recent = store.recent();
    const favorites = store.favorites();

    const bar = el('header', { class: 'appbar' }, [
      el('div', { class: 'appbar__title' }, [
        el('div', { text: 'Песенник' }),
        el('div', { class: 'appbar__sub', text: greeting() }),
      ]),
      iconButton(ICONS.settings, 'Настройки', () => nav('#/settings')),
    ]);

    const search = el('button', {
      type: 'button',
      class: 'searchfield',
      onclick: () => nav('#/search'),
    }, [
      el('span', { html: icon(ICONS.search), style: 'display:flex' }),
      el('span', { text: 'Найти песню…' }),
    ]);

    const parts = [bar, search];

    if (recent.length) {
      parts.push(el('div', { class: 'section' }, [
        resumeCard(recent[0], collectionTitle(recent[0].c), openSong, icon(ICONS.chevron)),
      ]));
    }

    parts.push(el('section', { class: 'section' }, [
      sectionHeader('Сборники'),
      el('div', { class: 'card-grid' }, data.collections().map((meta, index, list) => (
        bookCard(meta, (item) => nav(`#/c/${item.id}`), list.length % 2 === 1 && index === list.length - 1)
      ))),
    ]));

    if (recent.length > 1) {
      parts.push(el('section', { class: 'section' }, [
        sectionHeader('Недавние', recent.length > HOME_PREVIEW ? {
          label: 'Все',
          onClick: () => nav('#/recent'),
        } : null),
        el('div', { class: 'rail' }, recent.slice(1, HOME_PREVIEW + 1)
          .map((item) => songCard(item, collectionTitle(item.c), openSong))),
      ]));
    }

    parts.push(el('section', { class: 'section' }, [
      sectionHeader('Избранное', favorites.length > HOME_PREVIEW ? {
        label: 'Все',
        onClick: () => nav('#/favorites'),
      } : null),
      favorites.length
        ? el('div', { class: 'rail' }, favorites.slice(0, HOME_PREVIEW)
          .map((item) => songCard(item, collectionTitle(item.c), openSong)))
        : emptyState({
          inline: true,
          icon: ICONS.heart,
          title: 'Здесь появятся ваши любимые песни',
          text: 'Добавляйте песни в избранное, чтобы быстро находить их.',
        }),
    ]));

    screen.replaceChildren(...parts);
    watchStuck(screen, bar);
  };

  render();
  screen.refresh = render;
  return screen;
}

/* --- Недавние (полный список) -------------------------------------------- */

export function recentScreen(nav) {
  const screen = el('section', { class: 'screen', 'data-screen': 'recent', tabindex: '-1' });

  const render = () => {
    const items = store.recent();
    const bar = el('header', { class: 'appbar' }, [
      iconButton(ICONS.back, 'Назад', () => history.back()),
      el('div', { class: 'appbar__title appbar__title--compact', text: 'Недавние' }),
      items.length ? iconButton(ICONS.trash, 'Очистить историю', () => {
        store.forgetRecent();
        toast('История очищена');
        render();
      }) : null,
    ]);

    screen.replaceChildren(
      bar,
      items.length
        ? el('div', { class: 'list' }, items.map((item) => songListItem(item, {
          onOpen: (entry) => nav(`#/s/${entry.c}/${entry.n}`),
          meta: collectionTitle(item.c),
        })))
        : emptyState({
          icon: ICONS.clock,
          title: 'Вы ещё ничего не открывали',
          text: 'Открытые песни появятся здесь, чтобы к ним было легко вернуться.',
        }),
    );
    watchStuck(screen, bar);
  };

  render();
  screen.refresh = render;
  return screen;
}

/* --- Сборник -------------------------------------------------------------- */

export function collectionScreen(collectionId, nav) {
  const meta = data.collectionById(collectionId);
  const all = data.titlesOf(collectionId)
    .map((row) => ({ c: collectionId, n: row[0], t: row[1], p: row[2] }));

  const screen = el('section', {
    class: 'screen',
    'data-screen': `collection:${collectionId}`,
    tabindex: '-1',
  });

  const bar = el('header', { class: 'appbar' }, [
    iconButton(ICONS.back, 'Назад', () => history.back()),
    el('div', { class: 'appbar__title' }, [
      el('div', { class: 'appbar__title--compact', text: meta ? meta.title : 'Сборник' }),
      el('div', { class: 'appbar__sub', text: songsWord(all.length) }),
    ]),
  ]);

  const input = el('input', {
    type: 'search',
    inputmode: 'search',
    autocomplete: 'off',
    placeholder: 'Номер или название',
    'aria-label': `Поиск в сборнике ${meta ? meta.title : ''}`,
  });

  const field = el('div', { class: 'searchfield' }, [
    el('span', { html: icon(ICONS.search), style: 'display:flex' }),
    input,
  ]);

  const listHost = el('div', { class: 'vlist' });

  const draw = (items) => {
    listHost.replaceChildren(
      items.length
        ? virtualList(screen, items, (entry) => songListItem(entry, {
          onOpen: (song) => nav(`#/s/${song.c}/${song.n}`),
          meta: entry.p,
        }))
        : emptyState({
          icon: ICONS.search,
          title: 'Ничего не найдено',
          text: 'Попробуйте другой номер или слово из названия.',
        }),
    );
  };

  input.addEventListener('input', () => {
    const value = data.fold(input.value.trim());
    if (!value) { draw(all); return; }
    draw(all.filter((entry) => (
      String(entry.n).startsWith(value)
      || data.fold(entry.t).includes(value)
      || data.fold(entry.p || '').includes(value)
    )));
  });

  screen.append(bar, field, el('div', { style: 'height:12px' }), listHost);
  draw(all);
  watchStuck(screen, bar);
  screen.refresh = () => {
    const runway = listHost.querySelector('.vlist__runway');
    if (runway && runway.refresh) runway.refresh();
  };
  return screen;
}

/* --- Поиск ---------------------------------------------------------------- */

const PAGE_SIZE = 25;

export function searchScreen(nav) {
  const screen = el('section', { class: 'screen', 'data-screen': 'search', tabindex: '-1' });

  const input = el('input', {
    type: 'search',
    inputmode: 'search',
    autocomplete: 'off',
    placeholder: 'Найти песню…',
    'aria-label': 'Поиск по всем сборникам',
  });

  const clear = el('button', {
    type: 'button',
    class: 'searchfield__clear',
    'aria-label': 'Очистить поле',
    html: icon(ICONS.close),
    hidden: true,
    onclick: () => { input.value = ''; clear.hidden = true; run(''); input.focus(); },
  });

  const bar = el('header', { class: 'appbar' }, [
    el('div', { class: 'searchfield', style: 'margin:0;width:100%' }, [
      el('span', { html: icon(ICONS.search), style: 'display:flex' }),
      input,
      clear,
    ]),
  ]);

  const filters = el('div', { class: 'filters', hidden: true });
  const count = el('p', { class: 'result-count', hidden: true });
  const body = el('div', {});

  let query = '';
  let result = { items: [], counts: {}, total: 0 };
  let filter = 'all';
  let shown = 0;

  const openSong = (entry) => {
    store.rememberQuery(query);
    nav(`#/s/${entry.c}/${entry.n}`);
  };

  const visible = () => (filter === 'all'
    ? result.items
    : result.items.filter((item) => item.c === filter));

  const renderFilters = () => {
    const options = [{ id: 'all', title: 'Все', count: result.total }].concat(
      data.collections()
        .map((collection) => ({
          id: collection.id,
          title: collection.title,
          count: result.counts[collection.id] || 0,
        }))
        .filter((option) => option.count > 0),
    );
    filters.hidden = !query || !result.total;
    filters.replaceChildren(...options.map((option) => el('button', {
      type: 'button',
      class: 'filter',
      'aria-pressed': filter === option.id ? 'true' : 'false',
      onclick: () => { filter = option.id; haptic(); renderFilters(); renderResults(); },
    }, [
      el('span', { text: option.title }),
      el('span', { class: 'filter__count', text: String(option.count) }),
    ])));
  };

  const appendResults = () => {
    const rows = visible();
    const slice = rows.slice(shown, shown + PAGE_SIZE);
    const fragment = document.createDocumentFragment();
    for (const item of slice) {
      fragment.append(el('button', {
        type: 'button',
        class: 'result',
        onclick: () => openSong(item),
      }, [
        el('div', { class: 'result__title', html: item.titleHtml }),
        el('div', { class: 'result__meta', text: `${collectionTitle(item.c)} · №${item.n}` }),
        el('div', { class: 'result__snippet', html: item.snippet }),
      ]));
    }
    shown += slice.length;
    body.append(fragment);
    if (shown < rows.length) body.append(moreSentinel());
  };

  const moreSentinel = () => {
    const node = el('div', { style: 'height:1px' });
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        node.remove();
        appendResults();
      }
    }, { root: screen, rootMargin: '320px' });
    observer.observe(node);
    return node;
  };

  const renderIdle = () => {
    const queries = store.queries();
    const recent = store.recent().slice(0, 4);
    const box = el('div', {});

    if (queries.length) {
      box.append(
        el('section', { class: 'section' }, [
          sectionHeader('Недавние запросы', {
            label: 'Очистить',
            onClick: () => { store.forgetQueries(); renderResults(); },
          }),
          el('div', { class: 'chips' }, queries.map((value) => el('button', {
            type: 'button',
            class: 'chip',
            text: value,
            onclick: () => { input.value = value; clear.hidden = false; run(value); },
          }))),
        ]),
      );
    }

    if (recent.length) {
      box.append(el('section', { class: 'section' }, [
        sectionHeader('Недавно открытые'),
        el('div', { class: 'list' }, recent.map((item) => songListItem(item, {
          onOpen: (entry) => nav(`#/s/${entry.c}/${entry.n}`),
          meta: collectionTitle(item.c),
        }))),
      ]));
    }

    box.append(el('section', { class: 'section' }, [
      sectionHeader('Сборники'),
      el('div', { class: 'chips' }, data.collections().map((meta) => el('button', {
        type: 'button',
        class: 'chip',
        text: meta.title,
        onclick: () => nav(`#/c/${meta.id}`),
      }))),
    ]));

    if (!queries.length && !recent.length) {
      box.append(emptyState({
        icon: ICONS.search,
        title: 'Поиск по всем сборникам сразу',
        text: `Ищем по названию, тексту и номеру — ${data.totalCount()} песен в ${data.collections().length} сборниках.`,
      }));
    }
    return box;
  };

  const renderResults = () => {
    shown = 0;
    body.replaceChildren();

    if (!query) {
      count.hidden = true;
      filters.hidden = true;
      body.append(renderIdle());
      return;
    }

    const rows = visible();
    if (!rows.length) {
      count.hidden = true;
      body.append(emptyState({
        icon: ICONS.search,
        title: 'Ничего не найдено',
        text: 'Попробуйте изменить запрос — одно слово вместо фразы или номер песни.',
      }));
      return;
    }

    count.hidden = false;
    count.textContent = result.usedVariant
      ? `${rows.length} ${plural(rows.length)} · показано для «${result.usedVariant}»`
      : `${rows.length} ${plural(rows.length)}`;
    appendResults();
  };

  const plural = (value) => {
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) return 'совпадение';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'совпадения';
    return 'совпадений';
  };

  const showLoading = () => {
    count.hidden = true;
    filters.hidden = true;
    body.replaceChildren(skeletonList(4));
  };

  const run = (value) => {
    query = value.trim();
    filter = 'all';
    if (!query) {
      result = { items: [], counts: {}, total: 0 };
      renderFilters();
      renderResults();
      return;
    }
    if (!data.corpusReady()) {
      showLoading();
      data.loadCorpus().then(() => run(query)).catch(() => {
        body.replaceChildren(emptyState({
          icon: ICONS.alert,
          title: 'Не удалось открыть сборники',
          text: 'Попробуйте перезапустить приложение.',
        }));
      });
      return;
    }
    result = data.search(query);
    renderFilters();
    renderResults();
    screen.scrollTop = 0;
  };

  let timer = 0;
  input.addEventListener('input', () => {
    clear.hidden = !input.value;
    clearTimeout(timer);
    timer = setTimeout(() => run(input.value), 120);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      input.blur();
      store.rememberQuery(input.value);
    }
  });

  screen.append(bar, filters, count, body);
  renderResults();
  watchStuck(screen, bar);

  screen.focusInput = () => { if (!input.value) setTimeout(() => input.focus(), 150); };
  screen.refresh = () => { if (!query) renderResults(); };
  return screen;
}

/* --- Избранное ------------------------------------------------------------ */

export function favoritesScreen(nav) {
  const screen = el('section', { class: 'screen', 'data-screen': 'favorites', tabindex: '-1' });

  const render = () => {
    const items = store.favorites();
    const bar = el('header', { class: 'appbar' }, [
      el('div', { class: 'appbar__title' }, [
        el('div', { text: 'Избранное' }),
        el('div', { class: 'appbar__sub', text: items.length ? songsWord(items.length) : 'пока пусто' }),
      ]),
    ]);

    screen.replaceChildren(
      bar,
      items.length
        ? el('div', { class: 'list' }, items.map((item) => songListItem(item, {
          onOpen: (entry) => nav(`#/s/${entry.c}/${entry.n}`),
          meta: collectionTitle(item.c),
          favorite: {
            active: true,
            onToggle: (entry) => {
              store.toggleFavorite(entry);
              haptic();
              toast('Убрано из избранного');
              render();
            },
          },
        })))
        : emptyState({
          icon: ICONS.heart,
          title: 'Пока нет избранных песен',
          text: 'Откройте песню и нажмите ♥, чтобы сохранить её здесь.',
          action: { label: 'Найти песню', onClick: () => nav('#/search') },
        }),
    );
    watchStuck(screen, bar);
  };

  render();
  screen.refresh = render;
  return screen;
}

/* --- Настройки ------------------------------------------------------------ */

export function settingsScreen(nav) {
  const screen = el('section', { class: 'screen', 'data-screen': 'settings', tabindex: '-1' });

  const render = () => {
    const bar = el('header', { class: 'appbar' }, [
      iconButton(ICONS.back, 'Назад', () => history.back()),
      el('div', { class: 'appbar__title appbar__title--compact', text: 'Настройки' }),
    ]);

    screen.replaceChildren(
      bar,
      el('div', { class: 'panel' }, [
        el('button', {
          type: 'button',
          class: 'row',
          onclick: () => typographySheet(),
        }, [
          el('span', { class: 'row__glyph', text: 'Аа' }),
          el('span', { class: 'row__body' }, [
            el('span', { class: 'row__title', text: 'Оформление' }),
            el('span', {
              class: 'row__meta',
              text: `${store.get('fontSize')} pt · ${fontLabel()} · ${themeLabel()}`,
            }),
          ]),
          el('span', { html: icon(ICONS.chevron), style: 'display:flex', 'aria-hidden': 'true' }),
        ]),
        toggleRow({
          title: 'Не гасить экран',
          meta: 'Пока открыт текст песни',
          value: store.get('keepAwake'),
          onChange: (value) => { store.set('keepAwake', value); haptic(); },
        }),
      ]),

      el('div', { class: 'panel' }, [
        el('button', {
          type: 'button',
          class: 'row',
          onclick: () => { store.forgetQueries(); toast('История поиска очищена'); render(); },
        }, [
          el('span', { html: icon(ICONS.clock), style: 'display:flex' }),
          el('span', { class: 'row__body' }, [
            el('span', { class: 'row__title', text: 'Очистить историю поиска' }),
            el('span', { class: 'row__meta', text: `Сохранено запросов: ${store.queries().length}` }),
          ]),
        ]),
        el('button', {
          type: 'button',
          class: 'row',
          onclick: () => {
            if (!store.favorites().length) { toast('Избранное и так пусто'); return; }
            store.set('favorites', []);
            toast('Избранное очищено');
            render();
          },
        }, [
          el('span', { html: icon(ICONS.trash), style: 'display:flex' }),
          el('span', { class: 'row__body' }, [
            el('span', { class: 'row__title', text: 'Очистить избранное' }),
            el('span', { class: 'row__meta', text: songsWord(store.favorites().length) }),
          ]),
        ]),
      ]),

      el('div', { class: 'panel' }, data.collections().map((meta) => el('div', { class: 'row' }, [
        el('span', { class: 'row__body' }, [
          el('span', { class: 'row__title', text: meta.title }),
          el('span', { class: 'row__meta', text: meta.subtitle }),
        ]),
        el('span', { class: 'row__value', text: String(meta.count) }),
      ]))),

      el('p', {
        class: 'about',
        text: `Песенник · ${data.totalCount()} песен в ${data.collections().length} сборниках. Работает без интернета.`,
      }),
    );
    watchStuck(screen, bar);
  };

  render();
  screen.refresh = render;
  return screen;
}

export { applyTheme };
