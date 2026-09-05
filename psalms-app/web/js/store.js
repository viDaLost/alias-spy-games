/* Пользовательское состояние: настройки чтения, избранное, история.
   Всё лежит в localStorage под одним ключом и переживает перезапуск. */

const KEY = 'psalms.v1';
const MAX_RECENT = 12;
const MAX_QUERIES = 8;

export const FONT_SIZE_MIN = 15;
export const FONT_SIZE_MAX = 28;

const DEFAULTS = {
  theme: 'light',            // light | sepia | dark | auto
  fontFamily: 'serif',       // system | serif | sans
  fontSize: 18,
  lineHeight: 1.7,
  keepAwake: true,
  favorites: [],
  recent: [],
  queries: [],
};

function readRaw() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

/* Настройки прошлых версий переносим, чтобы ничего не сбросилось. */
function migrate(saved) {
  if (!saved) return {};
  const next = Object.assign({}, saved);
  if (typeof saved.serif === 'boolean' && !saved.fontFamily) {
    next.fontFamily = saved.serif ? 'serif' : 'sans';
  }
  if (typeof saved.leading === 'number' && !saved.lineHeight) {
    next.lineHeight = saved.leading;
  }
  if (saved.theme === 'auto' || saved.theme === 'light'
    || saved.theme === 'dark' || saved.theme === 'sepia') {
    next.theme = saved.theme;
  }
  delete next.serif;
  delete next.leading;
  delete next.lastRead;
  delete next.autoSpeed;
  return next;
}

const state = Object.assign({}, DEFAULTS, migrate(readRaw()));

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (error) {
    /* приватный режим или переполнение — работаем из памяти */
  }
}

export const store = {
  get(key) {
    return state[key];
  },
  set(key, value) {
    state[key] = value;
    persist();
    return value;
  },

  /* --- избранное --- */
  isFavorite(collection, number) {
    return state.favorites.some((item) => item.c === collection && item.n === number);
  },
  toggleFavorite(song) {
    const at = state.favorites.findIndex((item) => item.c === song.c && item.n === song.n);
    if (at >= 0) {
      state.favorites.splice(at, 1);
      persist();
      return false;
    }
    state.favorites.unshift({ c: song.c, n: song.n, t: song.t, ts: Date.now() });
    persist();
    return true;
  },
  favorites() {
    return state.favorites.slice();
  },

  /* --- недавно открытые --- */
  markRead(song) {
    state.recent = state.recent.filter((item) => !(item.c === song.c && item.n === song.n));
    state.recent.unshift({ c: song.c, n: song.n, t: song.t, ts: Date.now() });
    if (state.recent.length > MAX_RECENT) state.recent.length = MAX_RECENT;
    persist();
  },
  recent() {
    return state.recent.slice();
  },
  forgetRecent() {
    state.recent = [];
    persist();
  },

  /* --- история поиска --- */
  rememberQuery(query) {
    const value = query.trim();
    if (value.length < 2) return;
    state.queries = state.queries.filter((item) => item.toLowerCase() !== value.toLowerCase());
    state.queries.unshift(value);
    if (state.queries.length > MAX_QUERIES) state.queries.length = MAX_QUERIES;
    persist();
  },
  queries() {
    return state.queries.slice();
  },
  forgetQueries() {
    state.queries = [];
    persist();
  },
};
