/* Пользовательское состояние: настройки, избранное, история чтения и поиска. */

const KEY = 'psalms.v1';
const MAX_RECENT = 24;
const MAX_QUERIES = 12;

const DEFAULTS = {
  theme: 'auto',
  fontSize: 18,
  leading: 1.62,
  serif: false,
  keepAwake: true,
  favorites: [],
  recent: [],
  queries: [],
  lastRead: null,
};

let memory = null;

function readRaw() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writeRaw(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch (error) {
    /* приватный режим или переполнение — работаем из памяти */
  }
}

const state = Object.assign({}, DEFAULTS, readRaw() || {});
memory = state;

function persist() {
  writeRaw(state);
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
  all() {
    return state;
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

  /* --- история чтения --- */
  markRead(song) {
    state.recent = state.recent.filter((item) => !(item.c === song.c && item.n === song.n));
    state.recent.unshift({ c: song.c, n: song.n, t: song.t, ts: Date.now() });
    if (state.recent.length > MAX_RECENT) state.recent.length = MAX_RECENT;
    state.lastRead = state.recent[0];
    persist();
  },
  recent() {
    return state.recent.slice();
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

export { memory };
