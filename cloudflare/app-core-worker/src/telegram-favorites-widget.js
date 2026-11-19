import { accessStore, cleanAccessId } from './app-access-auth.js';
import { getMainMiniAppUrl, telegramApi } from './index-v10.js';
import { PLAYER_GAMES } from './player-games.js';

const QUERY = 'favorite_games_v1';
const COPY = {
  ru: {
    title: 'Мои игры', empty: 'Добавьте игры в избранное.', edit: 'Изменить избранное',
    pin: 'Закрепите сообщение для быстрого запуска игр.', previous: 'Назад', next: 'Далее',
    refresh: 'Обновить список', updating: 'Обновляем…', updated: 'Список обновлён', failed: 'Не удалось обновить',
    open: 'Открыть избранное', widgetDenied: 'Telegram пока не разрешает этому боту отправлять HTML-виджеты.',
    widgetUnavailable: 'Telegram не принял HTML-виджет.',
  },
  en: {
    title: 'My games', empty: 'Add games to your favorites.', edit: 'Edit favorites',
    pin: 'Pin this message to launch your games quickly.', previous: 'Previous', next: 'Next',
    refresh: 'Refresh list', updating: 'Updating…', updated: 'List updated', failed: 'Could not refresh',
    open: 'Open favorites', widgetDenied: 'Telegram currently does not allow this bot to send HTML widgets.',
    widgetUnavailable: 'Telegram did not accept the HTML widget.',
  },
  de: {
    title: 'Meine Spiele', empty: 'Füge Spiele zu deinen Favoriten hinzu.', edit: 'Favoriten bearbeiten',
    pin: 'Hefte die Nachricht an, um deine Spiele schnell zu starten.', previous: 'Zurück', next: 'Weiter',
    refresh: 'Liste aktualisieren', updating: 'Wird aktualisiert…', updated: 'Liste aktualisiert', failed: 'Aktualisierung fehlgeschlagen',
    open: 'Favoriten öffnen', widgetDenied: 'Telegram erlaubt diesem Bot derzeit keine HTML-Widgets.',
    widgetUnavailable: 'Telegram hat das HTML-Widget abgelehnt.',
  },
  es: {
    title: 'Mis juegos', empty: 'Añade juegos a tus favoritos.', edit: 'Editar favoritos',
    pin: 'Fija este mensaje para abrir tus juegos rápidamente.', previous: 'Anterior', next: 'Siguiente',
    refresh: 'Actualizar lista', updating: 'Actualizando…', updated: 'Lista actualizada', failed: 'No se pudo actualizar',
    open: 'Abrir favoritos', widgetDenied: 'Telegram aún no permite que este bot envíe widgets HTML.',
    widgetUnavailable: 'Telegram no aceptó el widget HTML.',
  },
};
const GAME_MARKS = {
  alias: '⏳', coimaginarium: '💡', guess: '❓', describe: '💬', spy: '🕵️', quartet: '🃏',
  'bible-sketch': '🎨', 'bible-wow': '🔤', 'bible-wordsearch': '🔍', 'sacred-word': '📖',
  'kids-ark-pairs': '🐾', 'biblical-match-three': '💎', 'moses-nile': '🧺', 'twelve-tribes': '⛺',
  'promised-land': '🧱', 'bible-geography': '🧭',
};

export function handleFavoritesWidget(update, env, ctx) {
  const owner = cleanAccessId(env.ADMIN_TELEGRAM_ID);
  const query = update?.widget_query;
  const message = query || update?.message;
  if (!owner || message?.from?.is_bot || String(message?.from?.id) !== owner
    || message?.chat?.type !== 'private' || String(message.chat.id) !== owner) return false;

  let task;
  if (query) {
    if (query.data !== QUERY || !/^\d{1,24}$/.test(String(query.id || ''))) return false;
    task = answerFavorites(env, owner, String(query.id));
  } else {
    const text = String(message.text || '').trim();
    const start = /^\/start(?:@[\w]+)?\s+favorites(?:_(ru|en|de|es))?$/i.exec(text);
    if (!start && !/^\/favorites(?:@[\w]+)?$/i.test(text)) return false;
    const locale = (start?.[1] || String(message.from.language_code || '')).toLowerCase().split(/[-_]/)[0];
    task = sendFavorites(env, owner, Object.hasOwn(COPY, locale) ? locale : 'ru');
  }
  ctx.waitUntil(task.catch((error) => console.warn('Telegram favorites widget failed', error?.status || 'unknown')));
  return true;
}

async function getFavorites(env, owner) {
  const { favorites } = await accessStore(env, '/app-access/widget-favorites', { userId: owner });
  return favorites;
}

async function answerFavorites(env, owner, queryId) {
  const favorites = await getFavorites(env, owner);
  await telegramApi(env, 'answerWidgetQuery', {
    widget_query_id: queryId,
    data: JSON.stringify(favorites),
  });
}

async function sendFavorites(env, owner, lang) {
  const [favorites, appUrl] = await Promise.all([getFavorites(env, owner), getMainMiniAppUrl(env)]);
  const languageIndex = Object.keys(COPY).indexOf(lang);
  const titles = Object.fromEntries([...PLAYER_GAMES].map(([id, names]) => [id, names[languageIndex]]));
  const copy = COPY[lang];
  const launchUrl = `${appUrl}=game_`;
  const editUrl = `${appUrl}=favorites`;
  try {
    await telegramApi(env, 'sendWidget', {
      chat_id: Number(owner),
      html: renderFavoritesHtml({ copy, titles, launchUrl, editUrl, lang }),
      chat_data: JSON.stringify(favorites),
      caption: `${copy.title} · ${favorites.length ? copy.pin : copy.empty}`,
      allow_queries: true,
    });
  } catch (error) {
    // Retry as a standard message only when Telegram explicitly refused the widget.
    if (![400, 404, 501].includes(error.status)) throw error;
    console.warn('Telegram sendWidget declined', { status: error.status, description: error.message.slice(0, 180) });
    const notice = error.message.includes('INPUT_MEDIA_WIDGET_NOT_ALLOWED') ? copy.widgetDenied : copy.widgetUnavailable;
    const games = favorites.map((id) => [{ text: `${GAME_MARKS[id] || '▶'} ${titles[id]}`, url: launchUrl + id }]);
    await telegramApi(env, 'sendMessage', {
      chat_id: owner,
      text: `${copy.title}\n${notice}\n\n${favorites.length ? copy.pin : copy.empty}`,
      protect_content: true,
      reply_markup: { inline_keyboard: [[{ text: copy.open, url: editUrl }], ...games] },
    });
  }
}

function renderFavoritesHtml({ copy, titles, launchUrl, editUrl, lang }) {
  return `<!doctype html>
<html lang="${lang}"><style>
  *{box-sizing:border-box}
  body{margin:0;padding:0;color:var(--tg-theme-text-color,#202a4a);font:14px system-ui,sans-serif}
  main{padding:12px}
  header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  h3{flex:1;margin:0;font-size:17px;line-height:1.15}
  .star,.count{flex-shrink:0;padding:4px 7px;border-radius:8px;font-weight:700;background:#fff0c8;color:#694b19}
  .star{font-size:17px}
  .count{font-size:12px}
  #games{display:grid;gap:4px}
  a,button{font:inherit;border:0;border-radius:10px}
  .game{display:grid;grid-template-columns:26px minmax(0,1fr) 18px;align-items:center;gap:6px;min-height:44px;padding:4px 8px;background:var(--tg-theme-secondary-bg-color,#edf0fc);color:inherit;text-decoration:none;font-weight:650;line-height:1.2}
  .game:active,button:active{outline:1px solid var(--tg-theme-link-color,#4741a8)}
  .game i{font-style:normal;text-align:center}
  .game b{color:var(--tg-theme-link-color,#5347ba);font-size:12px;text-align:center}
  .game span{overflow-wrap:break-word}
  p{margin:0;padding:9px 2px;color:var(--tg-theme-hint-color,#546776)}
  nav,footer{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-top:7px}
  [hidden]{display:none}
  button,.edit{min-height:38px;padding:6px 9px;background:var(--tg-theme-secondary-bg-color,#edf0fc);color:inherit}
  button:disabled{color:var(--tg-theme-hint-color,#546776)}
  .edit{display:flex;flex:1;align-items:center;justify-content:center;min-height:42px;text-align:center;background:var(--tg-theme-button-color,#4f46b5);color:var(--tg-theme-button-text-color,#fff);text-decoration:none;font-weight:680}
  #refresh{min-width:42px;min-height:42px;font-size:20px}
  #status{padding:5px 2px 0;font-size:12px}
</style><body><main>
  <header><span class="star" aria-hidden="true">★</span><h3>${copy.title}</h3><span class="count" id="count" hidden></span></header>
  <div id="games"></div>
  <nav id="pages" hidden><button id="prev" type="button">${copy.previous}</button><span id="page"></span><button id="next" type="button">${copy.next}</button></nav>
  <footer><a class="edit" href="${editUrl}">${copy.edit}</a><button id="refresh" type="button" aria-label="${copy.refresh}" title="${copy.refresh}" hidden>↻</button></footer>
  <p id="status" role="status" hidden></p>
</main><script>
  const widget = window.TelegramWidget;
  const titles = ${JSON.stringify(titles)};
  const marks = ${JSON.stringify(GAME_MARKS)};
  const get = id => document.getElementById(id);
  const list = get('games');
  const previous = get('prev');
  const next = get('next');
  const refreshButton = get('refresh');
  const status = get('status');
  const perPage = 4;
  let games = [];
  let page = 0;
  let refreshing = false;

  function render() {
    const total = Math.max(1, Math.ceil(games.length / perPage));
    page = Math.max(0, Math.min(page, total - 1));
    list.textContent = '';
    for (const id of games.slice(page * perPage, (page + 1) * perPage)) {
      const link = document.createElement('a');
      link.className = 'game';
      link.href = ${JSON.stringify(launchUrl)} + id;
      const mark = document.createElement('i');
      mark.textContent = marks[id] || '★';
      const title = document.createElement('span');
      title.textContent = titles[id];
      const arrow = document.createElement('b');
      arrow.textContent = '▶';
      link.appendChild(mark);
      link.appendChild(title);
      link.appendChild(arrow);
      list.appendChild(link);
    }
    if (!games.length) {
      const empty = document.createElement('p');
      empty.textContent = ${JSON.stringify(copy.empty)};
      list.appendChild(empty);
    }
    get('count').textContent = String(games.length);
    get('count').hidden = !games.length;
    get('pages').hidden = total === 1;
    previous.disabled = page === 0;
    next.disabled = page === total - 1;
    get('page').textContent = (page + 1) + ' / ' + total;
  }

  function apply(data) {
    try {
      const value = JSON.parse(data);
      if (!Array.isArray(value)) return false;
      games = [...new Set(value.filter(id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(titles, id)))];
    } catch { return false; }
    render();
    return true;
  }

  function showStatus(text) {
    status.textContent = text;
    status.hidden = !text;
  }

  async function refresh(manual) {
    if (refreshing || !widget || widget.isPreview) return;
    refreshing = true;
    refreshButton.disabled = true;
    if (manual) showStatus(${JSON.stringify(copy.updating)});
    try {
      const answer = await widget.request(${JSON.stringify(QUERY)});
      if (!apply(answer.result)) throw new Error('Invalid favorites');
      if (manual) showStatus(${JSON.stringify(copy.updated)});
    } catch {
      if (manual) showStatus(${JSON.stringify(copy.failed)});
    } finally {
      refreshing = false;
      refreshButton.disabled = false;
    }
  }

  previous.addEventListener('click', () => { page -= 1; render(); });
  next.addEventListener('click', () => { page += 1; render(); });
  refreshButton.addEventListener('click', () => refresh(true));
  if (!apply(widget?.chatData)) render();
  if (widget) {
    refreshButton.hidden = !!widget.isPreview;
    widget.onEvent('activated', () => refresh(false));
    widget.onEvent('chatDataChanged', () => apply(widget.chatData));
    widget.ready();
    refresh(false);
  }
</script></body></html>`;
}
