import { accessStore, cleanAccessId } from './app-access-auth.js';
import { getMainMiniAppUrl, telegramApi } from './index-v10.js';
import { PLAYER_GAMES } from './player-games.js';

const LEGACY_QUERY = 'favorite_games_v1';
const QUERY = 'favorite_games_v2';
const PER_PAGE = 4;
const WIDGET_RETRY_DELAY_MS = 5 * 60 * 1000;
let retryWidgetAt = 0;
const COPY = {
  ru: {
    done: 'Готово', editHint: 'Нажмите на игру, чтобы добавить её в избранное или убрать оттуда.',
    buttons: 'Игры кнопками',
    title: 'Мои игры', favorites: 'Избранное', catalog: 'Все игры', recent: 'Последняя игра',
    empty: 'В избранном пока пусто. Выберите игру в каталоге или добавьте её в избранное.',
    edit: 'Изменить избранное', open: 'Открыть приложение', pin: 'Закрепите сообщение, чтобы открывать игры из чата.',
    previous: 'Назад', next: 'Далее', refresh: 'Обновить',
    updating: 'Обновляем…', updated: 'Список обновлён', failed: 'Не удалось обновить. Попробуйте ещё раз.',
  },
  en: {
    done: 'Done', editHint: 'Tap a game to add it to your favorites or remove it.',
    buttons: 'Game buttons',
    title: 'My games', favorites: 'Favorites', catalog: 'All games', recent: 'Last played',
    empty: 'No favorites yet. Pick a game from the catalog or add it to your favorites.',
    edit: 'Edit favorites', open: 'Open app', pin: 'Pin this message to launch games from this chat.',
    previous: 'Previous', next: 'Next', refresh: 'Refresh',
    updating: 'Updating…', updated: 'List updated', failed: 'Could not refresh. Try again.',
  },
  de: {
    done: 'Fertig', editHint: 'Tippe auf ein Spiel, um es zu deinen Favoriten hinzuzufügen oder daraus zu entfernen.',
    buttons: 'Spiele als Buttons',
    title: 'Meine Spiele', favorites: 'Favoriten', catalog: 'Alle Spiele', recent: 'Zuletzt gespielt',
    empty: 'Noch keine Favoriten. Wähle ein Spiel aus der Liste oder füge es zu deinen Favoriten hinzu.',
    edit: 'Favoriten bearbeiten', open: 'App öffnen', pin: 'Hefte diese Nachricht an, um Spiele aus dem Chat zu öffnen.',
    previous: 'Zurück', next: 'Weiter', refresh: 'Aktualisieren',
    updating: 'Wird aktualisiert…', updated: 'Liste aktualisiert', failed: 'Aktualisierung fehlgeschlagen. Versuche es erneut.',
  },
  es: {
    done: 'Listo', editHint: 'Toca un juego para añadirlo a tus favoritos o quitarlo de la lista.',
    buttons: 'Botones de juego',
    title: 'Mis juegos', favorites: 'Favoritos', catalog: 'Todos los juegos', recent: 'Último juego',
    empty: 'Aún no tienes favoritos. Elige un juego del catálogo o añádelo a tus favoritos.',
    edit: 'Editar favoritos', open: 'Abrir aplicación', pin: 'Fija este mensaje para abrir juegos desde el chat.',
    previous: 'Anterior', next: 'Siguiente', refresh: 'Actualizar',
    updating: 'Actualizando…', updated: 'Lista actualizada', failed: 'No se pudo actualizar. Inténtalo de nuevo.',
  },
};
const GAME_MARKS = {
  alias: '⏳', coimaginarium: '💡', guess: '❓', describe: '💬', spy: '🕵️', quartet: '🃏',
  'bible-sketch': '🎨', 'bible-wow': '🔤', 'bible-azbuka': '🔠', 'bible-world': '🌐', 'bible-wordsearch': '🔍', 'sacred-word': '📖',
  'kids-ark-pairs': '🐾', 'biblical-match-three': '💎', 'moses-nile': '🧺', 'twelve-tribes': '⛺',
  'promised-land': '🧱', 'bible-geography': '🧭',
};

export function handleFavoritesWidget(update, env, ctx) {
  const query = update?.widget_query;
  const callback = update?.callback_query;
  const message = query || callback?.message || update?.message;
  const sender = callback?.from || message?.from;
  const userId = cleanAccessId(sender?.id);
  if (!userId || sender.is_bot || message?.chat?.type !== 'private'
    || String(message.chat.id) !== userId) return false;

  let task;
  if (query) {
    if (![LEGACY_QUERY, QUERY].includes(query.data) || !/^\d{1,24}$/.test(String(query.id))) return false;
    task = answerFavorites(env, userId, query);
  } else if (callback) {
    const match = /^favorite_menu:(ru|en|de|es):(buttons|favorites|catalog|edit):(\d{1,2})(?::([01]):([a-z0-9-]{1,32}))?$/.exec(callback.data);
    if (!match || !Number.isSafeInteger(message.message_id) || message.message_id < 1) return false;
    const [, lang, tab, page, selected, game] = match;
    if (game && (tab !== 'edit' || !PLAYER_GAMES.has(game))) return false;
    const change = game ? { game, selected: selected === '1' } : undefined;
    task = updateFallback(env, userId, callback, { lang, tab, page: Number(page) }, change);
  } else {
    const text = String(message.text || '').trim();
    const start = /^\/start(?:@[\w]+)?\s+favorites(?:_(ru|en|de|es))?$/i.exec(text);
    if (!start && !/^\/favorites(?:@[\w]+)?$/i.test(text)) return false;
    const locale = (start?.[1] || String(sender.language_code || '')).toLowerCase().split(/[-_]/)[0];
    const lang = Object.hasOwn(COPY, locale) ? locale : 'ru';
    const threadId = message.is_topic_message ? message.message_thread_id : undefined;
    task = sendFavorites(env, userId, lang, threadId);
  }
  ctx.waitUntil(task.catch((error) => console.warn('Telegram favorites widget failed', error?.status || 'unknown')));
  return true;
}

async function getFavorites(env, userId, change) {
  const { favorites, lastGame } = await accessStore(env, '/app-access/widget-favorites', { userId, ...change });
  return { favorites, lastGame };
}

async function answerFavorites(env, userId, query) {
  const state = await getFavorites(env, userId).catch(() => null);
  await telegramApi(env, 'answerWidgetQuery', {
    widget_query_id: String(query.id),
    data: state ? JSON.stringify(query.data === LEGACY_QUERY ? state.favorites : state) : undefined,
  });
}

async function getMenu(env, userId, lang, change) {
  const [state, url] = await Promise.all([getFavorites(env, userId, change), getMainMiniAppUrl(env)]);
  const index = Object.keys(COPY).indexOf(lang);
  const games = Object.fromEntries([...PLAYER_GAMES]
    .map(([id, names]) => [id, [names[index], GAME_MARKS[id]]]));
  return { state, games, lang, copy: COPY[lang], url };
}

async function sendFavorites(env, userId, lang, threadId) {
  const menu = await getMenu(env, userId, lang);
  const { state, copy, url } = menu;
  const recipient = { chat_id: userId, message_thread_id: threadId, protect_content: true };
  if (Date.now() < retryWidgetAt) return telegramApi(env, 'sendMessage', { ...recipient, ...renderFallback(menu) });

  try {
    await telegramApi(env, 'sendWidget', {
      ...recipient,
      html: renderFavoritesHtml(menu),
      chat_data: JSON.stringify(state),
      caption: `★ ${copy.title} · ${copy.pin}`,
      reply_markup: { inline_keyboard: [[
        { text: copy.open, url: `${url}=lang_${lang}` },
        { text: copy.buttons, callback_data: `favorite_menu:${lang}:buttons:0` },
      ]] },
      allow_queries: true,
    });
  } catch (error) {
    // A transport error has an unknown delivery outcome. Only fall back on an explicit refusal.
    if (![400, 403, 404, 501].includes(error.status)) throw error;
    if (error.status === 400 && error.message.includes('INPUT_MEDIA_WIDGET_NOT_ALLOWED')) {
      retryWidgetAt = Date.now() + WIDGET_RETRY_DELAY_MS;
    }
    console.warn('Telegram sendWidget declined', { status: error.status, description: error.message.slice(0, 180) });
    await telegramApi(env, 'sendMessage', { ...recipient, ...renderFallback(menu) });
  }
}

async function updateFallback(env, userId, callback, view, change) {
  let notice;
  try {
    const menu = await getMenu(env, userId, view.lang, change);
    if (view.tab === 'buttons') {
      const message = callback.message;
      await telegramApi(env, 'sendMessage', {
        chat_id: userId,
        protect_content: true,
        message_thread_id: message.is_topic_message ? message.message_thread_id : undefined,
        ...renderFallback(menu),
      });
    } else {
      await telegramApi(env, 'editMessageText', {
        chat_id: userId,
        message_id: callback.message.message_id,
        ...renderFallback(menu, view),
      });
    }
  } catch (error) {
    if (error.status !== 400 || !error.message.includes('message is not modified')) {
      notice = COPY[view.lang].failed;
      console.warn('Telegram favorites menu update failed', error?.status || 'unknown');
    }
  }
  await telegramApi(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: notice });
}

function renderFallback({ state, games, lang, copy, url }, { tab = state.favorites.length ? 'favorites' : 'catalog', page = 0 } = {}) {
  const ids = tab === 'favorites' ? state.favorites : Object.keys(games);
  const pages = Math.max(1, Math.ceil(ids.length / PER_PAGE));
  page = Math.min(page, pages - 1);
  const button = (text, view, index) => ({ text, callback_data: `favorite_menu:${lang}:${view}:${index}` });
  const gameButton = (id, text) => ({ text: text || `${games[id][1]} ${games[id][0]}`, url: `${url}=game_${id}` });
  const editing = tab === 'edit';
  const keyboard = [];
  if (!editing) {
    if (state.lastGame) keyboard.push([gameButton(state.lastGame, `${copy.recent} · ${games[state.lastGame][0]}`)]);
    keyboard.push([button(`★ ${copy.favorites}`, 'favorites', 0), button(copy.catalog, 'catalog', 0)]);
  }
  for (const id of ids.slice(page * PER_PAGE, (page + 1) * PER_PAGE)) {
    if (!editing) {
      keyboard.push([gameButton(id)]);
      continue;
    }
    const selected = state.favorites.includes(id);
    keyboard.push([{
      text: `${selected ? '★' : '☆'} ${games[id][0]}`,
      callback_data: `favorite_menu:${lang}:edit:${page}:${selected ? 0 : 1}:${id}`,
    }]);
  }
  const paging = [];
  if (page > 0) paging.push(button(`‹ ${copy.previous}`, tab, page - 1));
  if (page + 1 < pages) paging.push(button(`${copy.next} ›`, tab, page + 1));
  if (paging.length) keyboard.push(paging);
  keyboard.push([
    editing ? button(copy.done, 'favorites', 0) : button(copy.edit, 'edit', 0),
    button(`↻ ${copy.refresh}`, tab, page),
  ]);
  const heading = pages > 1 ? `${copy[tab]} · ${page + 1}/${pages}` : copy[tab];
  const description = editing ? copy.editHint : (ids.length ? copy.pin : copy.empty);
  return {
    text: `★ ${copy.title}\n${heading}\n\n${description}`,
    reply_markup: { inline_keyboard: keyboard },
  };
}

function renderFavoritesHtml({ games, lang, copy, url }) {
  return `<!doctype html>
<html lang="${lang}"><style>
  *{box-sizing:border-box}
  body{margin:0;padding:0;color:var(--tg-theme-text-color,#222346);font:14px system-ui,sans-serif}
  main{padding:10px}
  header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-radius:14px;color:#fff;background:linear-gradient(120deg,#32266b,#5243ad)}
  h3{margin:0;font-size:18px}
  header span{padding:3px 7px;border-radius:7px;background:#fff0c9;color:#5b401a;font-weight:700}
  button,a{font:inherit;border:0;border-radius:9px;color:inherit}
  button{min-height:42px;background:var(--tg-theme-secondary-bg-color,#eef0fa)}
  button:disabled{color:var(--tg-theme-hint-color,#526174)}
  nav,footer{display:flex;align-items:center;gap:6px;margin-top:7px}
  nav button,footer a{flex:1}
  nav button[aria-pressed="true"],footer a{background:var(--tg-theme-button-color,#5144ad);color:var(--tg-theme-button-text-color,#fff);font-weight:700}
  #games{display:grid;gap:4px;margin-top:7px}
  .game,#recent{display:flex;align-items:center;gap:8px;min-height:43px;padding:4px 9px;background:var(--tg-theme-secondary-bg-color,#eef0fa);text-decoration:none;font-weight:650;line-height:1.15}
  .game span{flex:1;overflow-wrap:break-word}
  .game b{color:var(--tg-theme-link-color,#5144ad)}
  .game i{width:20px;text-align:center;font-style:normal}
  #recent{margin-top:7px;min-height:46px;border:1px solid var(--tg-theme-link-color,#6556b1)}
  #recent small{display:block;font-size:11px;color:var(--tg-theme-hint-color,#526174)}
  #pages{justify-content:space-between}
  #pages button,#refresh{padding:4px 8px;min-width:42px}
  footer a{display:flex;align-items:center;justify-content:center;text-align:center;min-height:42px;padding:4px;text-decoration:none}
  a:active,button:active{outline:1px solid var(--tg-theme-link-color,#5144ad)}
  p{margin:0;padding:6px 2px;color:var(--tg-theme-hint-color,#526174)}
  #status{font-size:12px}
  [hidden]{display:none!important}
</style><body><main>
  <header><h3>${copy.title}</h3><span id="count"></span></header>
  <a id="recent" hidden><span>↻</span><div><small>${copy.recent}</small><span id="lastGame"></span></div></a>
  <nav><button id="favorites" type="button">${copy.favorites}</button><button id="catalog" type="button">${copy.catalog}</button></nav>
  <div id="games"></div>
  <nav id="pages" hidden><button id="prev" type="button">‹ ${copy.previous}</button><span id="page"></span><button id="next" type="button">${copy.next} ›</button></nav>
  <footer><a id="edit" href="${url}=favorites">${copy.edit}</a><button id="refresh" type="button" title="${copy.refresh}" aria-label="${copy.refresh}" hidden>↻</button></footer>
  <p id="status" role="status" hidden></p>
</main><script>
  const widget = window.TelegramWidget;
  const games = ${JSON.stringify(games)};
  const launch = ${JSON.stringify(url + '=game_')};
  const perPage = ${PER_PAGE};
  const get = id => document.getElementById(id);
  const list = get('games');
  const refresh = get('refresh');
  const known = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(games, id);
  let favorites = [];
  let lastGame = '';
  let tab = '';
  let page = 0;

  function render() {
    const ids = tab === 'catalog' ? Object.keys(games) : favorites;
    const pages = Math.max(1, Math.ceil(ids.length / perPage));
    page = Math.max(0, Math.min(page, pages - 1));
    list.textContent = '';
    for (const id of ids.slice(page * perPage, (page + 1) * perPage)) {
      const link = document.createElement('a');
      link.className = 'game';
      link.href = launch + id;
      for (const [tag, text] of [['i', games[id][1]], ['span', games[id][0]], ['b', '›']]) {
        const part = document.createElement(tag);
        part.textContent = text;
        link.appendChild(part);
      }
      link.addEventListener('click', openLink);
      list.appendChild(link);
    }
    if (!ids.length) {
      const empty = document.createElement('p');
      empty.textContent = ${JSON.stringify(copy.empty)};
      list.appendChild(empty);
    }
    get('count').textContent = '★ ' + favorites.length;
    get('favorites').setAttribute('aria-pressed', String(tab === 'favorites'));
    get('catalog').setAttribute('aria-pressed', String(tab === 'catalog'));
    get('recent').hidden = !lastGame;
    if (lastGame) {
      get('recent').href = launch + lastGame;
      get('lastGame').textContent = games[lastGame][0];
    }
    get('pages').hidden = pages === 1;
    get('prev').disabled = page === 0;
    get('next').disabled = page === pages - 1;
    get('page').textContent = (page + 1) + ' / ' + pages;
  }

  function apply(data) {
    try {
      const state = JSON.parse(data);
      if (!Array.isArray(state?.favorites)) return false;
      favorites = [...new Set(state.favorites.filter(known))];
      lastGame = known(state.lastGame) ? state.lastGame : '';
    } catch { return false; }
    return true;
  }

  function openLink(event) {
    if (!widget?.openTelegramLink) return;
    event.preventDefault();
    widget.openTelegramLink(this.href);
  }

  function status(text) {
    get('status').textContent = text;
    get('status').hidden = !text;
  }

  get('recent').addEventListener('click', openLink);
  get('edit').addEventListener('click', openLink);
  get('prev').addEventListener('click', () => { page -= 1; render(); });
  get('next').addEventListener('click', () => { page += 1; render(); });
  for (const name of ['favorites', 'catalog']) {
    get(name).addEventListener('click', () => { tab = name; page = 0; render(); });
  }
  apply(widget?.chatData);
  try { apply(localStorage.getItem('games-state')); } catch {}
  tab = favorites.length ? 'favorites' : 'catalog';
  render();
  if (widget && !widget.isPreview && !widget.isForward && typeof widget.request === 'function') {
    refresh.hidden = false;
    refresh.addEventListener('click', async () => {
      if (refresh.disabled) return;
      refresh.disabled = true;
      status(${JSON.stringify(copy.updating)});
      try {
        const answer = await widget.request(${JSON.stringify(QUERY)});
        if (!apply(answer.result)) throw new Error('Invalid favorites');
        try { localStorage.setItem('games-state', answer.result); } catch {}
        render();
        status(${JSON.stringify(copy.updated)});
      } catch {
        status(${JSON.stringify(copy.failed)});
      } finally {
        refresh.disabled = false;
      }
    });
  }
  widget?.ready?.();
</script></body></html>`;
}
