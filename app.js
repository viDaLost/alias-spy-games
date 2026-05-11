// app.js — Telegram-friendly launcher, access cache, SVG menu and compact admin panel

const GAS_API_URL = "https://script.google.com/macros/s/AKfycbx0o9HmRIF6vNuBUB2N4H3YuabJzYbRmAxvHCCwqnbMPn29Crv5W3FT1XGDF6VyFSn9/exec";
const ADMIN_ID = "1288379477";
const SUPPORT_LINK = "https://t.me/D_a_n_Vi";
const ADMIN_PAGE_SIZE = 10;

let currentGameScript = null;
let currentUserData = { lastGames: [] };
let accessState = {
  checked: false,
  isBanned: false,
  lastSyncAt: 0,
  promise: null,
};

const adminState = {
  users: [],
  filteredUsers: [],
  page: 1,
  query: "",
};

const GAME_GROUPS = [
  {
    id: "company-games",
    items: [
      { key: "alias", title: "Алиас", desc: "Объясняй слова на скорость", icon: "alias" },
      { key: "coimaginarium", title: "Соображариум", desc: "Ассоциации и быстрые идеи", icon: "idea" },
      { key: "guess", title: "Угадай персонажа", desc: "Вопросы, версии, логика", icon: "character" },
      { key: "describe", title: "Опиши, но не называй", desc: "Подсказки без прямого ответа", icon: "describe" },
      { key: "spy", title: "Шпион", desc: "Секретная роль и локация", icon: "spy" },
      { key: "quartet", title: "Квартет", desc: "Собери четыре карты", icon: "quartet" },
    ],
  },
  {
    id: "word-games",
    items: [
      { key: "bible-wow", title: "Библейские слова", desc: "Собери слова из букв", icon: "words" },
      { key: "bible-wordsearch", title: "Поиск библейских слов", desc: "Найди скрытые слова", icon: "search" },
      { key: "sacred-word", title: "Священное слово", desc: "Открой слово по подсказкам", icon: "sacred" },
    ],
  },
  {
    id: "kids-games",
    items: [
      { key: "kids-ark-pairs", title: "Найди пару", desc: "Память, пары и ковчег", icon: "ark" },
    ],
  },
];

const GAME_TITLES = Object.fromEntries(
  GAME_GROUPS.flatMap((group) => group.items.map((item) => [item.key, item.title]))
);

function svgIcon(type) {
  const common = 'viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"';
  const shell = (body) => `<svg class="game-card__svg" ${common}>${body}</svg>`;
  const defs = (id, a = "#6366f1", b = "#38bdf8") => `
    <defs>
      <linearGradient id="${id}" x1="10" y1="8" x2="56" y2="58" gradientUnits="userSpaceOnUse">
        <stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
      </linearGradient>
    </defs>`;

  const map = {
    alias: shell(`${defs("gi_alias")}
      <rect x="7" y="10" width="50" height="42" rx="17" fill="url(#gi_alias)"/>
      <path d="M21 28h22M21 37h14" stroke="white" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M24 51l-8 7 2.5-10" fill="#7dd3fc" opacity=".95"/>`),
    idea: shell(`${defs("gi_idea", "#7c3aed", "#f59e0b")}
      <rect x="7" y="8" width="50" height="48" rx="18" fill="url(#gi_idea)"/>
      <path d="M32 15c-8 0-14 6.2-14 13.5 0 4.6 2.4 8.3 6 10.7 1.3.9 2 2.3 2 3.8h12c0-1.5.7-2.9 2-3.8 3.6-2.4 6-6.1 6-10.7C46 21.2 40 15 32 15Z" fill="#fff7cc"/>
      <path d="M27 48h10M28 53h8" stroke="white" stroke-width="4" stroke-linecap="round"/>`),
    character: shell(`${defs("gi_char", "#4f46e5", "#ec4899")}
      <rect x="7" y="8" width="50" height="48" rx="18" fill="url(#gi_char)"/>
      <path d="M23 21c5.5 0 10 4.5 10 10v2c0 5.5-4.5 10-10 10S13 38.5 13 33v-2c0-5.5 4.5-10 10-10Z" fill="white" opacity=".92"/>
      <path d="M41 18c5.5 0 10 4.5 10 10v3c0 5.5-4.5 10-10 10s-10-4.5-10-10v-3c0-5.5 4.5-10 10-10Z" fill="#e0e7ff"/>
      <path d="M19 33c2 2 6 2 8 0M37 31c2 2 6 2 8 0" stroke="#312e81" stroke-width="3" stroke-linecap="round"/>`),
    describe: shell(`${defs("gi_desc", "#2563eb", "#14b8a6")}
      <rect x="7" y="8" width="50" height="48" rx="18" fill="url(#gi_desc)"/>
      <circle cx="25" cy="27" r="9" fill="white" opacity=".95"/>
      <path d="M21 40c2.6-3.3 9.4-3.3 12 0" stroke="white" stroke-width="5" stroke-linecap="round"/>
      <path d="M39 23h8M39 32h11M39 41h7" stroke="#dbeafe" stroke-width="4" stroke-linecap="round"/>`),
    spy: shell(`${defs("gi_spy", "#0f172a", "#2563eb")}
      <rect x="7" y="8" width="50" height="48" rx="18" fill="url(#gi_spy)"/>
      <path d="M18 28h28" stroke="white" stroke-width="5" stroke-linecap="round"/>
      <path d="M23 26l4-8h10l4 8" fill="#c7d2fe"/>
      <circle cx="25" cy="36" r="5" stroke="white" stroke-width="3"/>
      <circle cx="39" cy="36" r="5" stroke="white" stroke-width="3"/>
      <path d="M30 36h4" stroke="white" stroke-width="3" stroke-linecap="round"/>`),
    quartet: shell(`${defs("gi_quartet", "#4338ca", "#60a5fa")}
      <rect x="7" y="8" width="50" height="48" rx="18" fill="url(#gi_quartet)"/>
      <rect x="18" y="15" width="21" height="30" rx="5" fill="white" transform="rotate(-8 18 15)"/>
      <rect x="28" y="18" width="21" height="30" rx="5" fill="#dbeafe" transform="rotate(8 28 18)"/>
      <path d="M28 31c4-6 12-1 6 5l-6 5-6-5c-6-6 2-11 6-5Z" fill="#4f46e5"/>`),
    words: shell(`${defs("gi_words", "#0284c7", "#22c55e")}
      <rect x="7" y="8" width="50" height="48" rx="18" fill="url(#gi_words)"/>
      ${[18,28,38].map((y) => [18,28,38].map((x) => `<rect x="${x}" y="${y}" width="8" height="8" rx="2" fill="white" opacity=".92"/>`).join("")).join("")}
      <path d="M18 50h28" stroke="#dcfce7" stroke-width="4" stroke-linecap="round"/>`),
    search: shell(`${defs("gi_search", "#4f46e5", "#06b6d4")}
      <rect x="7" y="8" width="50" height="48" rx="18" fill="url(#gi_search)"/>
      <circle cx="29" cy="29" r="12" stroke="white" stroke-width="5"/>
      <path d="M38 38l9 9" stroke="white" stroke-width="5" stroke-linecap="round"/>
      <path d="M24 29h10M29 24v10" stroke="#bfdbfe" stroke-width="3" stroke-linecap="round"/>`),
    sacred: shell(`${defs("gi_sacred", "#ea580c", "#facc15")}
      <rect x="7" y="8" width="50" height="48" rx="18" fill="url(#gi_sacred)"/>
      <path d="M31 47c-8 0-13-5-13-12 0-6 5-10 8-14 1 5 4 7 7 10 1-5 4-8 8-11 0 7 6 10 6 17 0 6-6 10-16 10Z" fill="white" opacity=".95"/>
      <path d="M32 44c-4 0-7-3-7-7 0-4 4-6 6-9 1 3 4 5 5 8 1-2 2-3 4-5 0 5 2 6 2 9 0 3-4 4-10 4Z" fill="#fb923c"/>`),
    ark: shell(`${defs("gi_ark", "#0ea5e9", "#8b5cf6")}
      <rect x="7" y="8" width="50" height="48" rx="18" fill="url(#gi_ark)"/>
      <path d="M16 37h32l-4 8H20l-4-8Z" fill="white"/>
      <path d="M22 37V25h20v12" stroke="white" stroke-width="5" stroke-linejoin="round"/>
      <path d="M26 24c3-6 9-6 12 0" stroke="#dbeafe" stroke-width="4" stroke-linecap="round"/>
      <path d="M18 48c4 2 8 2 12 0 4-2 8-2 16 0" stroke="#bfdbfe" stroke-width="4" stroke-linecap="round"/>`),
    support: shell(`${defs("gi_support", "#64748b", "#0ea5e9")}
      <rect x="7" y="8" width="50" height="48" rx="18" fill="url(#gi_support)"/>
      <path d="M24 20l20 20M40 18l6 6-8 8-6-6 8-8Z" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M20 45l10-10" stroke="#dbeafe" stroke-width="5" stroke-linecap="round"/>`),
    admin: shell(`${defs("gi_admin", "#111827", "#6366f1")}
      <rect x="7" y="8" width="50" height="48" rx="18" fill="url(#gi_admin)"/>
      <path d="M20 29l8 7 16-16" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M18 45h28" stroke="#c7d2fe" stroke-width="4" stroke-linecap="round"/>`),
  };

  return map[type] || map.alias;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isTrue(value) {
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function apiRequest(payload) {
  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain;charset=utf-8" },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("API Error:", error);
    return null;
  }
}

function prepareTelegramWebApp() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  try { tg.ready(); } catch {}
  try { tg.expand(); } catch {}
  try { tg.setHeaderColor("#eaf3ff"); } catch {}
  try { tg.setBackgroundColor("#eaf3ff"); } catch {}

  document.documentElement.classList.add("is-telegram");
}

function getTelegramUser() {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user || {};
  return {
    username: tgUser.username || "без_ника",
    id: tgUser.id || "аноним",
    link: tgUser.username ? `https://t.me/${tgUser.username}` : "неизвестно",
  };
}

async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ошибка: ${res.status} при загрузке ${url}`);
  return await res.json();
}

function shuffleArray(arr) {
  const copy = Array.isArray(arr) ? [...arr] : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function openSupportChat() {
  if (window.Telegram?.WebApp?.openTelegramLink) {
    window.Telegram.WebApp.openTelegramLink(SUPPORT_LINK);
  } else {
    window.open(SUPPORT_LINK, "_blank", "noopener");
  }
}

function renderGameButton(item) {
  return `
    <button type="button" class="game-card" onclick="showGame('${item.key}')" aria-label="Открыть игру ${escapeHTML(item.title)}">
      <span class="game-card__icon">${svgIcon(item.icon)}</span>
      <span class="game-card__body">
        <span class="game-card__title">${escapeHTML(item.title)}</span>
        <span class="game-card__desc">${escapeHTML(item.desc)}</span>
      </span>
    </button>
  `;
}

function renderMainMenu() {
  GAME_GROUPS.forEach((group) => {
    const root = document.getElementById(group.id);
    if (!root || root.dataset.ready === "1") return;
    root.innerHTML = group.items.map(renderGameButton).join("");
    root.dataset.ready = "1";
  });

  const systemRoot = document.getElementById("system-actions");
  if (systemRoot && systemRoot.dataset.ready !== "1") {
    systemRoot.innerHTML = `
      <button type="button" class="game-card game-card--system" onclick="showSupportModal()">
        <span class="game-card__icon">${svgIcon("support")}</span>
        <span class="game-card__body">
          <span class="game-card__title">Тех-поддержка</span>
          <span class="game-card__desc">Сообщить об ошибке или предложить идею</span>
        </span>
      </button>
    `;
    systemRoot.dataset.ready = "1";
  }
}

function renderAdminButton() {
  const systemRoot = document.getElementById("system-actions");
  if (!systemRoot || document.getElementById("admin-btn")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "admin-btn";
  btn.className = "game-card game-card--admin";
  btn.innerHTML = `
    <span class="game-card__icon">${svgIcon("admin")}</span>
    <span class="game-card__body">
      <span class="game-card__title">Админ-панель</span>
      <span class="game-card__desc">Пользователи, баллы и рассылка</span>
    </span>
  `;
  btn.addEventListener("click", openAdminPanel);
  systemRoot.appendChild(btn);
}

function showMenu() {
  const menu = document.getElementById("menu-container");
  const banned = document.getElementById("banned-screen");
  const loader = document.getElementById("main-loader");
  if (loader) loader.remove();
  if (banned) banned.classList.add("hidden");
  if (menu) menu.classList.remove("hidden");
}

function showBannedScreen() {
  const menu = document.getElementById("menu-container");
  const banned = document.getElementById("banned-screen");
  const loader = document.getElementById("main-loader");
  if (loader) loader.remove();
  if (menu) menu.classList.add("hidden");
  if (banned) banned.classList.remove("hidden");
}

function getLocalProgressForSync(userId) {
  let localWowData = { coins: 20 };
  try { localWowData = JSON.parse(localStorage.getItem("bibleWowData_v5") || "{}"); } catch {}

  let localWsStars = 0;
  try { localWsStars = parseInt(localStorage.getItem(`bible_stars_v1_${userId}`) || "0", 10); } catch {}

  let localSwLevel = 0;
  try {
    const swState = JSON.parse(localStorage.getItem(`sacred_word_levels_v4_${userId}`) || "{}");
    localSwLevel = Number(swState.level || 0);
  } catch {}

  let localGamesHistory = [];
  try {
    localGamesHistory = JSON.parse(localStorage.getItem("last_games_history") || "[]");
    if (!Array.isArray(localGamesHistory)) localGamesHistory = [];
  } catch { localGamesHistory = []; }

  return { localWowData, localWsStars, localSwLevel, localGamesHistory };
}

function applyServerProgress(res, userId, localWowData) {
  if (!res) return;

  if (res.wowStars !== undefined) {
    localWowData.coins = safeNumber(res.wowStars, localWowData.coins ?? 20);
    localStorage.setItem("bibleWowData_v5", JSON.stringify(localWowData));
  }

  if (res.wsStars !== undefined) {
    localStorage.setItem(`bible_stars_v1_${userId}`, String(safeNumber(res.wsStars, 0)));
  }

  if (res.swLevel !== undefined) {
    try {
      const swState = JSON.parse(localStorage.getItem(`sacred_word_levels_v4_${userId}`) || "{}");
      swState.level = safeNumber(res.swLevel, swState.level || 0);
      localStorage.setItem(`sacred_word_levels_v4_${userId}`, JSON.stringify(swState));
    } catch {}
  }

  if (Array.isArray(res.lastGames)) {
    localStorage.setItem("last_games_history", JSON.stringify(res.lastGames));
    currentUserData.lastGames = res.lastGames;
  }
}

async function syncCurrentUser({ force = false } = {}) {
  const now = Date.now();
  if (!force && accessState.checked) return accessState;
  if (accessState.promise) return accessState.promise;

  accessState.promise = (async () => {
    const tgUser = getTelegramUser();
    const { localWowData, localWsStars, localSwLevel, localGamesHistory } = getLocalProgressForSync(tgUser.id);

    const res = await apiRequest({
      action: "syncUser",
      user: {
        id: tgUser.id,
        username: tgUser.username,
        link: tgUser.link,
        wowStars: typeof localWowData.coins === "number" ? localWowData.coins : 20,
        wsStars: Number.isNaN(localWsStars) ? 0 : localWsStars,
        swLevel: localSwLevel,
        lastGames: localGamesHistory,
        forceUpdate: false,
      },
    });

    if (res) {
      accessState.checked = true;
      accessState.lastSyncAt = now;
      accessState.isBanned = isTrue(res.isBanned);
      applyServerProgress(res, tgUser.id, localWowData);
    } else {
      // Если сервер недоступен, не блокируем запуск приложения.
      accessState.checked = true;
      accessState.lastSyncAt = now;
      accessState.isBanned = false;
    }

    accessState.promise = null;
    return accessState;
  })();

  return accessState.promise;
}

async function initializeApp() {
  prepareTelegramWebApp();
  renderMainMenu();

  const tgUser = getTelegramUser();
  if (String(tgUser.id) === ADMIN_ID) renderAdminButton();

  try {
    const state = await syncCurrentUser();
    if (state.isBanned) showBannedScreen();
    else showMenu();
  } catch (error) {
    console.error("Init Error:", error);
    showMenu();
  }
}

function rememberGameOpen(gameName) {
  const title = GAME_TITLES[gameName];
  if (!title) return;

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem("last_games_history") || "[]");
    if (!Array.isArray(history)) history = [];
  } catch { history = []; }

  history = history.filter((item) => item !== title);
  history.unshift(title);
  history = history.slice(0, 3);

  localStorage.setItem("last_games_history", JSON.stringify(history));
  currentUserData.lastGames = history;

  apiRequest({ action: "updateHistory", id: getTelegramUser().id, history });
}

function showGame(gameName) {
  rememberGameOpen(gameName);

  const container = document.getElementById("game-container");
  const menu = document.getElementById("menu-container");

  if (container) container.innerHTML = `<div class="app-game-loading"><div class="app-loader__ring"></div><p>Загрузка игры...</p></div>`;
  if (menu) menu.classList.add("hidden");

  document.body.dataset.mode = "game";
  window.scrollTo({ top: 0, behavior: "auto" });

  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }

  const routes = {
    alias: ["games/alias.js", () => window.startAliasGame?.()],
    coimaginarium: ["games/coimaginarium.js", () => window.startCoimaginariumGame?.("data/coimaginarium_themes.json")],
    guess: ["games/guess-character.js", () => window.startGuessCharacterGame?.("data/characters.json")],
    describe: ["games/describe-char.js", () => window.startDescribeCharacterGame?.("data/describe_words.json")],
    spy: ["games/spy.js", () => window.startSpyGame?.("data/spy_locations.json")],
    "kids-ark-pairs": ["games/kids-ark-pairs.js", () => window.startKidsArkPairsGame?.()],
    quartet: ["games/quartet.js", () => window.startQuartetGame?.("data/quartet_bible.json")],
    "bible-wow": ["games/bible-wow.js", () => window.startBibleWowGame?.("data/bible_wow_levels.json")],
    "bible-wordsearch": ["games/bible-wordsearch.js", () => window.startBibleWordSearchGame?.("data/bible_wordsearch_levels.json")],
    "sacred-word": ["games/sacred-word.js", () => window.startSacredWordGame?.("data/sacred_words.json")],
  };

  const route = routes[gameName];
  if (!route) {
    if (container) container.innerHTML = `<div class="app-error-card"><h2>Игра не найдена</h2><button class="back-button" onclick="goToMainMenu()">В меню</button></div>`;
    return;
  }

  loadGameScript(route[0], route[1]);
}

function loadGameScript(fileName, callback) {
  const script = document.createElement("script");
  script.src = `${fileName}?v=12`;

  script.onload = () => {
    try {
      const result = callback();
      if (result === undefined && typeof callback !== "function") throw new Error("Не найдена функция запуска игры");
    } catch (error) {
      console.error("Ошибка запуска игры:", error);
      const container = document.getElementById("game-container");
      if (container) {
        container.innerHTML = `
          <section class="app-error-card fade-in">
            <h2>Ошибка запуска</h2>
            <p>Игра загрузилась, но не смогла стартовать. Проверьте консоль браузера.</p>
            <button class="back-button" onclick="goToMainMenu()">В главное меню</button>
          </section>
        `;
      }
    }
  };

  script.onerror = () => {
    console.error(`Файл ${fileName} не загружается`);
    const container = document.getElementById("game-container");
    if (container) {
      container.innerHTML = `
        <section class="app-error-card fade-in">
          <h2>Файл игры не найден</h2>
          <p>Не удалось загрузить <b>${escapeHTML(fileName)}</b>.</p>
          <button class="back-button" onclick="goToMainMenu()">В главное меню</button>
        </section>
      `;
    }
  };

  document.body.appendChild(script);
  currentGameScript = script;
}

function cleanupActiveGame() {
  try { if (window.aliasInterval) clearInterval(window.aliasInterval); } catch {}
  try { if (window.coimaginariumInterval) clearInterval(window.coimaginariumInterval); } catch {}
  try { window.__aliasCleanup?.(); } catch {}
  try { window.__wsCleanup?.(); } catch {}
  try { window.__sacredWordCleanup?.(); } catch {}
  try { window.__quartetCleanup?.(); } catch {}
  try { document.getElementById("alias-inline-styles")?.remove(); } catch {}

  try { window.__aliasCleanup = null; } catch {}
  try { window.__wsCleanup = null; } catch {}
  try { window.__sacredWordCleanup = null; } catch {}
  try { window.__quartetCleanup = null; } catch {}
}

function goToMainMenu() {
  const container = document.getElementById("game-container");
  const menu = document.getElementById("menu-container");

  cleanupActiveGame();

  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }

  if (container) container.innerHTML = "";
  delete document.body.dataset.mode;

  // Важно: не запускаем initializeApp() повторно при каждом выходе из игры.
  // Проверка доступа выполняется один раз при открытии приложения, а история игр обновляется отдельно.
  window.goToMainMenu = window.appGoToMainMenu;

  if (accessState.isBanned) showBannedScreen();
  else if (menu) menu.classList.remove("hidden");

  window.scrollTo({ top: 0, behavior: "auto" });
}

function showSupportModal() {
  if (document.getElementById("support-modal-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "support-modal-overlay";
  overlay.className = "support-overlay";
  overlay.innerHTML = `
    <div class="support-box" onclick="event.stopPropagation()">
      <div class="support-icon">${svgIcon("support")}</div>
      <h3 class="support-title">Тех-поддержка</h3>
      <p class="support-text">Напишите, если заметили ошибку, неудобство в игре или хотите предложить новую функцию.</p>
      <div class="support-actions">
        <button class="support-btn-primary" id="support-write-btn">Написать</button>
        <button class="support-btn-secondary" id="support-close-btn">Закрыть</button>
      </div>
    </div>
  `;

  function closeModal() {
    overlay.classList.add("support-overlay--closing");
    setTimeout(() => overlay.remove(), 180);
  }

  overlay.addEventListener("click", closeModal);
  document.body.appendChild(overlay);
  document.getElementById("support-close-btn")?.addEventListener("click", closeModal);
  document.getElementById("support-write-btn")?.addEventListener("click", openSupportChat);
}

async function openAdminPanel() {
  const container = document.getElementById("game-container");
  const menu = document.getElementById("menu-container");
  if (!container) return;

  if (menu) menu.classList.add("hidden");
  document.body.dataset.mode = "admin";
  window.scrollTo({ top: 0, behavior: "auto" });

  container.innerHTML = `
    <section class="admin-page admin-loading fade-in">
      <div class="app-loader__ring"></div>
      <p>Загрузка базы пользователей...</p>
    </section>
  `;

  const res = await apiRequest({ action: "getAdminData", adminId: ADMIN_ID });
  if (!res || !Array.isArray(res.users)) {
    container.innerHTML = `
      <section class="app-error-card fade-in">
        <h2>Не удалось загрузить базу</h2>
        <p>Проверьте интернет или Apps Script.</p>
        <button class="back-button" onclick="goToMainMenu()">Назад</button>
      </section>
    `;
    return;
  }

  adminState.users = res.users.map(normalizeAdminUser);
  adminState.filteredUsers = [...adminState.users];
  adminState.page = 1;
  adminState.query = "";

  container.innerHTML = renderAdminShell(adminState.users.length);
  bindAdminEvents();
  renderAdminUsers();
}

function normalizeAdminUser(user) {
  return {
    id: String(user.id ?? ""),
    username: String(user.username || "без_ника"),
    link: String(user.link || "неизвестно"),
    lastGames: user.lastGames || "[]",
    wowStars: safeNumber(user.wowStars, 0),
    wsStars: safeNumber(user.wsStars, 0),
    swLevel: safeNumber(user.swLevel, 0),
    isBanned: isTrue(user.isBanned),
  };
}

function renderAdminShell(total) {
  const bannedCount = adminState.users.filter((u) => u.isBanned).length;
  const activeCount = total - bannedCount;

  return `
    <section class="admin-page fade-in">
      <div class="admin-topbar">
        <button type="button" class="admin-back" onclick="goToMainMenu()" aria-label="Назад в меню">←</button>
        <div>
          <h2>Админ-панель</h2>
          <p>${total} пользователей • ${activeCount} активных • ${bannedCount} заблокировано</p>
        </div>
      </div>

      <details class="admin-broadcast">
        <summary>
          <span>Рассылка</span>
          <small>Открыть форму сообщения</small>
        </summary>
        <div class="admin-broadcast__body">
          <textarea id="broadcast-text" rows="4" placeholder="Введите сообщение. Поддерживаются HTML-теги: <b>, <i>"></textarea>
          <button id="broadcast-btn" type="button" onclick="sendBroadcast()">Отправить всем</button>
        </div>
      </details>

      <div class="admin-tools">
        <label class="admin-search">
          <span>Поиск</span>
          <input id="admin-search-input" type="search" placeholder="Ник, ID или последняя игра" autocomplete="off" />
        </label>
        <div class="admin-pager" aria-live="polite">
          <button type="button" id="admin-prev">←</button>
          <span id="admin-page-label">1 / 1</span>
          <button type="button" id="admin-next">→</button>
        </div>
      </div>

      <div class="admin-list" id="admin-user-list"></div>
    </section>
  `;
}

function bindAdminEvents() {
  const search = document.getElementById("admin-search-input");
  search?.addEventListener("input", () => {
    adminState.query = search.value.trim().toLowerCase();
    adminState.page = 1;
    renderAdminUsers();
  });

  document.getElementById("admin-prev")?.addEventListener("click", () => {
    adminState.page = Math.max(1, adminState.page - 1);
    renderAdminUsers();
  });

  document.getElementById("admin-next")?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(adminState.filteredUsers.length / ADMIN_PAGE_SIZE));
    adminState.page = Math.min(totalPages, adminState.page + 1);
    renderAdminUsers();
  });
}

function parseHistory(user) {
  try {
    const parsed = typeof user.lastGames === "string" ? JSON.parse(user.lastGames) : user.lastGames;
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function filterAdminUsers() {
  const q = adminState.query;
  if (!q) return [...adminState.users];

  return adminState.users.filter((user) => {
    const history = parseHistory(user).join(" ").toLowerCase();
    return String(user.id).toLowerCase().includes(q)
      || user.username.toLowerCase().includes(q)
      || history.includes(q);
  });
}

function renderAdminUsers() {
  const list = document.getElementById("admin-user-list");
  const pageLabel = document.getElementById("admin-page-label");
  const prev = document.getElementById("admin-prev");
  const next = document.getElementById("admin-next");
  if (!list) return;

  adminState.filteredUsers = filterAdminUsers();
  const totalPages = Math.max(1, Math.ceil(adminState.filteredUsers.length / ADMIN_PAGE_SIZE));
  adminState.page = Math.min(Math.max(1, adminState.page), totalPages);
  const start = (adminState.page - 1) * ADMIN_PAGE_SIZE;
  const users = adminState.filteredUsers.slice(start, start + ADMIN_PAGE_SIZE);

  if (pageLabel) pageLabel.textContent = `${adminState.page} / ${totalPages}`;
  if (prev) prev.disabled = adminState.page <= 1;
  if (next) next.disabled = adminState.page >= totalPages;

  if (users.length === 0) {
    list.innerHTML = `<div class="admin-empty">Ничего не найдено</div>`;
    return;
  }

  list.innerHTML = users.map(renderAdminUserCard).join("");
}

function renderAdminUserCard(user) {
  const name = user.username && user.username !== "без_ника" ? `@${user.username}` : `ID: ${user.id}`;
  const history = parseHistory(user);
  const historyText = history.length ? history.join(", ") : "Нет данных";
  const statusClass = user.isBanned ? "is-banned" : "is-active";
  const statusText = user.isBanned ? "Заблокирован" : "Активен";
  const chatLink = user.link !== "неизвестно"
    ? `<a href="${escapeHTML(user.link)}" target="_blank" rel="noopener" class="admin-chat">Чат</a>`
    : `<span class="admin-chat admin-chat--disabled">Нет чата</span>`;

  return `
    <details class="admin-user ${statusClass}">
      <summary>
        <span class="admin-user__main">
          <b>${escapeHTML(name)}</b>
          <small>ID: ${escapeHTML(user.id)} • ${escapeHTML(historyText)}</small>
        </span>
        <span class="admin-user__status">${statusText}</span>
      </summary>

      <div class="admin-user__body">
        <div class="admin-user__topline">
          ${chatLink}
          <button type="button" class="admin-ban ${user.isBanned ? "admin-ban--restore" : ""}" onclick="toggleBan('${escapeHTML(user.id)}', ${!user.isBanned})">
            ${user.isBanned ? "Разблокировать" : "Заблокировать"}
          </button>
        </div>

        <div class="admin-score-grid">
          ${renderAdminScoreControl(user.id, "wow", "stars_wow", "Bible Words", user.wowStars)}
          ${renderAdminScoreControl(user.id, "ws", "stars_ws", "Word Search", user.wsStars)}
          ${renderAdminScoreControl(user.id, "sw", "stars_sw", "Sacred Word", user.swLevel)}
        </div>
      </div>
    </details>
  `;
}

function renderAdminScoreControl(userId, prefix, type, label, value) {
  const inputId = `${prefix}_${userId}`;
  return `
    <label class="admin-score">
      <span>${escapeHTML(label)}</span>
      <div>
        <input type="number" id="${escapeHTML(inputId)}" value="${escapeHTML(value)}" inputmode="numeric" />
        <button type="button" onclick="updateUserStars('${escapeHTML(userId)}', '${type}', '${escapeHTML(inputId)}')">✓</button>
      </div>
    </label>
  `;
}

async function updateUserStars(targetId, type, inputId) {
  const input = document.getElementById(inputId);
  const raw = input?.value ?? "0";
  const value = safeNumber(raw, 0);

  const res = await apiRequest({ action: "updateUser", adminId: ADMIN_ID, updateData: { targetId, type, value } });
  if (!res) {
    showToast("Не удалось обновить", "error");
    return;
  }

  const user = adminState.users.find((u) => String(u.id) === String(targetId));
  if (user) {
    if (type === "stars_wow") user.wowStars = value;
    if (type === "stars_ws") user.wsStars = value;
    if (type === "stars_sw") user.swLevel = value;
  }

  const tgUser = getTelegramUser();
  if (String(tgUser.id) === String(targetId)) {
    if (type === "stars_wow") {
      let data = {};
      try { data = JSON.parse(localStorage.getItem("bibleWowData_v5") || "{}"); } catch {}
      data.coins = value;
      localStorage.setItem("bibleWowData_v5", JSON.stringify(data));
    } else if (type === "stars_ws") {
      localStorage.setItem(`bible_stars_v1_${tgUser.id}`, String(value));
    } else if (type === "stars_sw") {
      let data = {};
      try { data = JSON.parse(localStorage.getItem(`sacred_word_levels_v4_${tgUser.id}`) || "{}"); } catch {}
      data.level = value;
      localStorage.setItem(`sacred_word_levels_v4_${tgUser.id}`, JSON.stringify(data));
    }
  }

  showToast("Обновлено");
}

async function toggleBan(targetId, banStatus) {
  const action = banStatus ? "заблокировать" : "разблокировать";
  if (!confirm(`Вы уверены, что хотите ${action} пользователя?`)) return;

  const res = await apiRequest({ action: "updateUser", adminId: ADMIN_ID, updateData: { targetId, type: "ban", value: banStatus } });
  if (!res) {
    showToast("Не удалось изменить блокировку", "error");
    return;
  }

  const user = adminState.users.find((u) => String(u.id) === String(targetId));
  if (user) user.isBanned = Boolean(banStatus);
  renderAdminUsers();
  showToast(banStatus ? "Пользователь заблокирован" : "Пользователь разблокирован");
}

async function sendBroadcast() {
  const textEl = document.getElementById("broadcast-text");
  const btn = document.getElementById("broadcast-btn");
  const text = textEl?.value.trim() || "";

  if (!text) {
    alert("Введите текст сообщения.");
    return;
  }

  if (!confirm("Отправить это сообщение всем пользователям?")) return;

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Отправка...";
  }

  const res = await apiRequest({ action: "broadcast", adminId: ADMIN_ID, text });

  if (btn) {
    btn.disabled = false;
    btn.textContent = "Отправить всем";
  }

  if (res && res.success) {
    if (textEl) textEl.value = "";
    alert(`Рассылка завершена.\n\nДоставлено: ${res.delivered}\nОшибок: ${res.failed}`);
  } else {
    alert("Не удалось отправить рассылку.");
  }
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `app-toast app-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("app-toast--visible"));
  setTimeout(() => {
    toast.classList.remove("app-toast--visible");
    setTimeout(() => toast.remove(), 220);
  }, 1800);
}

// Экспортируем функции для старых игровых файлов и inline-обработчиков.
window.apiRequest = apiRequest;
window.getTelegramUser = getTelegramUser;
window.loadJSON = loadJSON;
window.shuffleArray = shuffleArray;
window.escapeHTML = escapeHTML;
window.showGame = showGame;
window.openSupportChat = openSupportChat;
window.showSupportModal = showSupportModal;
window.openAdminPanel = openAdminPanel;
window.updateUserStars = updateUserStars;
window.toggleBan = toggleBan;
window.sendBroadcast = sendBroadcast;
window.appGoToMainMenu = goToMainMenu;
window.goToMainMenu = goToMainMenu;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}
