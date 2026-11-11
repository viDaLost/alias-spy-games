import { accessStore, cleanAccessId } from './app-access-auth.js';
import { getMainMiniAppUrl, telegramApi } from './index-v10.js';
import { PLAYER_GAMES } from './player-games.js';

const QUERY = 'favorite_games_v1';
const COPY = {
  ru: { title: 'Мои игры', empty: 'Выберите любимые игры в приложении.', edit: 'Изменить избранное', pin: 'Закрепите сообщение для быстрого запуска игр.', previous: 'Назад', next: 'Далее' },
  en: { title: 'My games', empty: 'Choose your favorite games in the app.', edit: 'Edit favorites', pin: 'Pin this message for quick access to your games.', previous: 'Previous', next: 'Next' },
  de: { title: 'Meine Spiele', empty: 'Wähle deine Lieblingsspiele in der App aus.', edit: 'Favoriten bearbeiten', pin: 'Hefte diese Nachricht für schnellen Zugriff auf deine Spiele an.', previous: 'Zurück', next: 'Weiter' },
  es: { title: 'Mis juegos', empty: 'Elige tus juegos favoritos en la aplicación.', edit: 'Editar favoritos', pin: 'Fija este mensaje para acceder rápido a tus juegos.', previous: 'Anterior', next: 'Siguiente' },
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
  const edit = { text: copy.edit, url: `${appUrl}=favorites` };
  try {
    await telegramApi(env, 'sendWidget', {
      chat_id: owner,
      html: renderFavoritesHtml({ copy, titles, launchUrl, lang }),
      chat_data: JSON.stringify(favorites),
      caption: copy.pin,
      allow_queries: true,
      protect_content: true,
      reply_markup: { inline_keyboard: [[edit]] },
    });
  } catch (error) {
    // Retry as a standard message only when Telegram explicitly refused the widget.
    if (![400, 404, 501].includes(error.status)) throw error;
    const games = favorites.map((id) => [{ text: titles[id], url: launchUrl + id }]);
    await telegramApi(env, 'sendMessage', {
      chat_id: owner,
      text: `${copy.title}\n${favorites.length ? copy.pin : copy.empty}`,
      protect_content: true,
      reply_markup: { inline_keyboard: [...games, [edit]] },
    });
  }
}

function renderFavoritesHtml({ copy, titles, launchUrl, lang }) {
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><style>
  body{margin:0;color:var(--tg-theme-text-color,#182531);font-family:system-ui,sans-serif}
  main{padding:12px} h3{margin:0 0 8px;font-size:17px}
  #games{display:grid;gap:5px}
  a,button{background:var(--tg-theme-secondary-bg-color,#edf3f8);color:var(--tg-theme-link-color,#225a91);border:0;border-radius:8px}
  a{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:42px;padding:0 10px;text-decoration:none;font-weight:600}
  a span{flex-shrink:0} p{margin:0;color:var(--tg-theme-hint-color,#546776)}
  nav{display:none;align-items:center;justify-content:space-between;gap:6px;margin-top:8px}
  button{min-height:36px;padding:0 10px;font:inherit} button:disabled{color:var(--tg-theme-hint-color,#546776)}
</style></head><body><main>
  <h3>${copy.title}</h3><div id="games"></div>
  <nav id="pages"><button id="prev" type="button">${copy.previous}</button><span id="page"></span><button id="next" type="button">${copy.next}</button></nav>
</main><script>
  const widget = window.TelegramWidget;
  const titles = ${JSON.stringify(titles)};
  const list = document.getElementById('games');
  const pages = document.getElementById('pages');
  const previous = document.getElementById('prev');
  const next = document.getElementById('next');
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
      link.href = ${JSON.stringify(launchUrl)} + id;
      link.textContent = titles[id];
      const arrow = document.createElement('span');
      arrow.textContent = '›';
      link.appendChild(arrow);
      list.appendChild(link);
    }
    if (!games.length) {
      const empty = document.createElement('p');
      empty.textContent = ${JSON.stringify(copy.empty)};
      list.appendChild(empty);
    }
    pages.style.display = total > 1 ? 'flex' : 'none';
    previous.disabled = page === 0;
    next.disabled = page === total - 1;
    document.getElementById('page').textContent = (page + 1) + ' / ' + total;
  }

  function apply(data) {
    try {
      const value = JSON.parse(data);
      if (Array.isArray(value)) games = value.filter(id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(titles, id));
    } catch {}
    render();
  }

  async function refresh() {
    if (refreshing || !widget) return;
    refreshing = true;
    try {
      const answer = await widget.request(${JSON.stringify(QUERY)});
      if (answer.result) apply(answer.result);
    } catch {} finally { refreshing = false; }
  }

  previous.addEventListener('click', () => { page -= 1; render(); });
  next.addEventListener('click', () => { page += 1; render(); });
  apply(widget && widget.chatData);
  if (widget) {
    widget.onEvent('activated', refresh);
    widget.ready();
    refresh();
  }
</script></body></html>`;
}
