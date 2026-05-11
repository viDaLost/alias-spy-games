// app.js — лаунчер игр (полноэкранный режим для каждой игры)

let currentGameScript = null;

// --- ИНТЕГРАЦИЯ АДМИН-ПАНЕЛИ И API ---
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbx0o9HmRIF6vNuBUB2N4H3YuabJzYbRmAxvHCCwqnbMPn29Crv5W3FT1XGDF6VyFSn9/exec";
const ADMIN_ID = "1288379477";
let currentUserData = { lastGames: [] };


const loadedGameScripts = new Map();
let activeGameObserver = null;
let appInitRunId = 0;
let appCurrentMode = "menu";
let activeGameRunId = 0;

const GAME_META = {
  "alias": { title: "Алиас", script: "games/alias.js", startFn: "startAliasGame", args: [] },
  "coimaginarium": { title: "Соображариум", script: "games/coimaginarium.js", startFn: "startCoimaginariumGame", args: ["data/coimaginarium_themes.json"] },
  "guess": { title: "Угадай персонажа", script: "games/guess-character.js", startFn: "startGuessCharacterGame", args: ["data/characters.json"] },
  "describe": { title: "Опиши, но не называй", script: "games/describe-char.js", startFn: "startDescribeCharacterGame", args: ["data/describe_words.json"] },
  "spy": { title: "Шпион", script: "games/spy.js", startFn: "startSpyGame", args: ["data/spy_locations.json"] },
  "quartet": { title: "Квартет", script: "games/quartet.js", startFn: "startQuartetGame", args: ["data/quartet_bible.json"] },
  "bible-wow": { title: "Библейские слова", script: "games/bible-wow.js", startFn: "startBibleWowGame", args: ["data/bible_wow_levels.json"] },
  "bible-wordsearch": { title: "Поиск библейских слов", script: "games/bible-wordsearch.js", startFn: "startBibleWordSearchGame", args: ["data/bible_wordsearch_levels.json"] },
  "sacred-word": { title: "Священное слово", script: "games/sacred-word.js", startFn: "startSacredWordGame", args: ["data/sacred_words.json"] },
  "kids-ark-pairs": { title: "Найди пару", script: "games/kids-ark-pairs.js", startFn: "startKidsArkPairsGame", args: [] }
};

function appIcon(name, size = 24) {
  const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  const icons = {
    "alias": `<svg ${common}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8"/><path d="M8 13h5"/></svg>`,
    "coimaginarium": `<svg ${common}><path d="M9 18h6"/><path d="M10 22h4"/><path d="M2 10a10 10 0 1 1 20 0c0 3.2-1.7 5.2-3.4 6.8-1 .9-1.6 2-1.6 3.2H7c0-1.2-.6-2.3-1.6-3.2C3.7 15.2 2 13.2 2 10z"/></svg>`,
    "guess": `<svg ${common}><path d="M4 12c2-4 5-6 8-6s6 2 8 6c-2 4-5 6-8 6s-6-2-8-6z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0z"/><path d="M4 4l4 4"/><path d="M20 4l-4 4"/></svg>`,
    "describe": `<svg ${common}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 8h8"/><path d="M8 12h6"/><path d="M8 16h3"/></svg>`,
    "spy": `<svg ${common}><path d="M2 12s3.5-7 10-7s10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
    "quartet": `<svg ${common}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h3"/></svg>`,
    "bible-wow": `<svg ${common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
    "bible-wordsearch": `<svg ${common}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/><path d="M11 8v6"/></svg>`,
    "sacred-word": `<svg ${common}><path d="M8.5 14.5A4 4 0 0 0 12 21a4 4 0 0 0 3.5-6.5c-.9-1.4-2.4-2.3-2.4-4.6-1.7 1.1-4.2 3-4.6 4.6z"/><path d="M12 3c1.2 2.4 4 4.4 4 8"/></svg>`,
    "kids-ark-pairs": `<svg ${common}><path d="M12 3c2 2 2 4.5 0 6.5C10 7.5 10 5 12 3z"/><path d="M7 12c-2 0-4 1.7-4 4v2h18v-2c0-2.3-2-4-4-4"/><path d="M7 12h10"/><path d="M7 12c.7 3 2.4 5 5 5s4.3-2 5-5"/><path d="M4 18c2 2 14 2 16 0"/></svg>`,
    "support": `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 5.8 1c-.7 1.3-2.2 1.7-2.7 2.8"/><path d="M12 17h.01"/></svg>`,
    "admin": `<svg ${common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>`,
    "arrow-left": `<svg ${common}><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`,
    "ban": `<svg ${common}><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>`,
    "settings": `<svg ${common}><path d="M12 15.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3a1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6a1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1a1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/></svg>`,
    "external": `<svg ${common}><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>`,
    "close": `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`
  };
  return icons[name] || icons.support;
}

function renderAppIcons() {
  document.querySelectorAll("[data-app-icon]").forEach((node) => {
    const name = node.getAttribute("data-app-icon");
    if (!node.dataset.renderedIcon) {
      node.innerHTML = appIcon(name, node.classList.contains("runner-icon") ? 22 : 24);
      node.dataset.renderedIcon = "1";
    }
  });
}

function setTelegramTheme() {
  if (!window.Telegram?.WebApp) return;
  try {
    const wa = window.Telegram.WebApp;
    wa.backgroundColor = "#DBEAFE";
    wa.headerColor = "#DBEAFE";
    wa.setBackgroundColor?.("#DBEAFE");
    wa.setHeaderColor?.("#DBEAFE");
  } catch (e) {}
}

function safeStartGame(meta) {
  const fn = window[meta.startFn];
  if (typeof fn !== "function") {
    throw new Error(`Стартовая функция не найдена: ${meta.startFn}`);
  }
  fn(...(meta.args || []));
}

function openSupportLink() {
  const tgUrl = "https://t.me/D_a_n_Vi";
  if (window.Telegram?.WebApp?.openTelegramLink) {
    window.Telegram.WebApp.openTelegramLink(tgUrl);
  } else {
    window.open(tgUrl, "_blank");
  }
}


function cleanupActiveGame() {
  if (activeGameObserver) {
    try { activeGameObserver.disconnect(); } catch(e) {}
    activeGameObserver = null;
  }

  try { window.__aliasCleanup?.(); } catch(e) {}
  try { window.__aliasCleanup = null; } catch(e) {}
  if (window.aliasInterval) {
    clearInterval(window.aliasInterval);
    window.aliasInterval = null;
  }
  if (window.coimaginariumInterval) {
    clearInterval(window.coimaginariumInterval);
    window.coimaginariumInterval = null;
  }

  try { window.__wsCleanup?.(); } catch(e) {}
  try { window.__wsCleanup = null; } catch(e) {}
  try { window.__sacredWordCleanup?.(); } catch(e) {}
  try { window.__sacredWordCleanup = null; } catch(e) {}
  try { window.__quartetCleanup?.(); } catch(e) {}
  try { window.__quartetCleanup = null; } catch(e) {}
  try { window.__kidsArkCleanup?.(); } catch(e) {}
  try { window.__kidsArkCleanup = null; } catch(e) {}
  try { window.__bibleWowCleanup?.(); } catch(e) {}
  try { window.__bibleWowCleanup = null; } catch(e) {}
  window.__activeGameName = "";
}

function enhanceGameDom(gameName) {
  const container = document.getElementById("game-container");
  if (!container) return;

  container.classList.add("game-content", `game-content--${String(gameName).replace(/[^a-z0-9-]/gi, "")}`);

  container.querySelectorAll(":scope > h2, .alias-title, .game-title, .quartet-title, .kids-screen > h2, .sw-title, .wow-title").forEach((node) => {
    node.classList.add("unified-game-title");
  });

  container.querySelectorAll(".card, .setup-block, .premium-theme-card, .secret-card, .app-error-card, .kids-screen, .ws-panel, .sw-card, .sw-lamp-card, .wow-modal-card, .kids-modal-card, .quartet-card, .mini-card, .content-wrap, .action-empty, .action-big, .rules-section").forEach((node) => {
    node.classList.add("unified-surface");
  });

  container.querySelectorAll("button").forEach((btn) => {
    btn.classList.add("unified-button");
    if (!btn.dataset.enhancedButton) {
      btn.dataset.enhancedButton = "1";
      if (!btn.getAttribute("type")) btn.setAttribute("type", "button");
    }
  });

  container.querySelectorAll("input, textarea, select").forEach((field) => {
    field.classList.add("unified-field");
  });

  renderAppIcons();
}

function installGameDomObserver(gameName) {
  if (activeGameObserver) {
    try { activeGameObserver.disconnect(); } catch(e) {}
    activeGameObserver = null;
  }

  const container = document.getElementById("game-container");
  if (!container) return;

  let scheduled = false;
  const runEnhance = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceGameDom(gameName);
    });
  };

  activeGameObserver = new MutationObserver(runEnhance);
  activeGameObserver.observe(container, { childList: true, subtree: true });
  runEnhance();
}



async function apiRequest(payload) {
  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain;charset=utf-8" }
    });
    return await res.json();
  } catch (e) {
    console.error("API Error:", e);
    return null;
  }
}

async function initializeApp({ keepCurrentView = false } = {}) {
  const runId = ++appInitRunId;
  renderAppIcons();

  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
    setTelegramTheme();
  }

  const tgUser = getTelegramUser();

  if (String(tgUser.id) === ADMIN_ID) {
    renderAdminButton();
  }

  const menu = document.querySelector(".menu-container");
  const bannedScreen = document.getElementById("banned-screen");
  const gameScreen = document.getElementById("game-screen");
  const mainLoader = document.getElementById("main-loader");

  const showMenuSafely = () => {
    if (keepCurrentView || document.body.dataset.mode === "game") return;
    if (menu) menu.classList.remove("hidden");
    if (gameScreen) gameScreen.classList.add("hidden");
    if (bannedScreen) bannedScreen.classList.add("hidden");
    appCurrentMode = "menu";
    renderAppIcons();
  };

  try {
    let localWowData = { coins: 20 };
    try { localWowData = JSON.parse(localStorage.getItem("bibleWowData_v5") || "{}"); } catch(e) {}

    let localWsStars = 0;
    try { localWsStars = parseInt(localStorage.getItem(`bible_stars_v1_${tgUser.id}`) || "0"); } catch(e) {}

    let localSwLevel = 0;
    try { 
      const swState = JSON.parse(localStorage.getItem(`sacred_word_levels_v4_${tgUser.id}`) || "{}"); 
      localSwLevel = swState.level || 0;
    } catch(e) {}

    let localGamesHistory = [];
    try {
      localGamesHistory = JSON.parse(localStorage.getItem("last_games_history") || "[]");
      if (!Array.isArray(localGamesHistory)) localGamesHistory = [];
    } catch (e) { localGamesHistory = []; }

    const res = await apiRequest({
      action: "syncUser",
      user: {
        id: tgUser.id,
        username: tgUser.username,
        link: tgUser.link,
        wowStars: typeof localWowData.coins === 'number' ? localWowData.coins : 20,
        wsStars: isNaN(localWsStars) ? 0 : localWsStars,
        swLevel: localSwLevel,
        lastGames: localGamesHistory,
        forceUpdate: false 
      }
    });

    if (runId !== appInitRunId) return;
    if (mainLoader) mainLoader.remove();

    if (res) {
      if (res.isBanned) {
        if (keepCurrentView || document.body.dataset.mode === "game") return;
        if (menu) menu.classList.add("hidden");
        if (gameScreen) gameScreen.classList.add("hidden");
        if (bannedScreen) bannedScreen.classList.remove("hidden");
        appCurrentMode = "banned";
        renderAppIcons();
        return; 
      }

      localWowData.coins = res.wowStars;
      localStorage.setItem("bibleWowData_v5", JSON.stringify(localWowData));
      localStorage.setItem(`bible_stars_v1_${tgUser.id}`, res.wsStars);

      if (res.swLevel !== undefined) {
        try {
          const swState = JSON.parse(localStorage.getItem(`sacred_word_levels_v4_${tgUser.id}`) || "{}");
          swState.level = res.swLevel;
          localStorage.setItem(`sacred_word_levels_v4_${tgUser.id}`, JSON.stringify(swState));
        } catch(e) {}
      }

      if (Array.isArray(res.lastGames)) {
        localStorage.setItem("last_games_history", JSON.stringify(res.lastGames));
        currentUserData.lastGames = res.lastGames;
      }
      showMenuSafely();
    } else {
      showMenuSafely();
    }
  } catch (err) {
    console.error("Init Error:", err);
    if (mainLoader) mainLoader.remove();
    showMenuSafely();
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
// --- КОНЕЦ ИНТЕГРАЦИИ API ---

function getTelegramUser() {
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe) {
    const user = window.Telegram.WebApp.initDataUnsafe.user || {};
    return {
      username: user.username || "без_ника",
      id: user.id || "аноним",
      link: user.username ? `https://t.me/${user.username}` : "неизвестно"
    };
  }
  return { username: "аноним", id: "аноним", link: "аноним" };
}

async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ошибка: ${res.status} при загрузке ${url}`);
  return await res.json();
}

function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function showGame(gameName) {
  cleanupActiveGame();
  appInitRunId++;
  const gameRunId = ++activeGameRunId;
  const meta = GAME_META[gameName];
  if (!meta) {
    const container = document.getElementById("game-container");
    if (container) container.innerHTML = `<div class="app-error-card"><h2>Игра не найдена</h2><button class="back-button" onclick="goToMainMenu()">Вернуться в меню</button></div>`;
    return;
  }

  try {
    let history = JSON.parse(localStorage.getItem("last_games_history") || "[]");
    if (!Array.isArray(history)) history = [];
    history = history.filter(g => g !== meta.title);
    history.unshift(meta.title);
    if (history.length > 3) history.pop();
    localStorage.setItem("last_games_history", JSON.stringify(history));
    currentUserData.lastGames = history;
    apiRequest({ action: "updateHistory", id: getTelegramUser().id, history });
  } catch (e) {}

  const container = document.getElementById("game-container");
  const menu = document.querySelector(".menu-container");
  const gameScreen = document.getElementById("game-screen");
  const bannedScreen = document.getElementById("banned-screen");
  window.__activeGameName = gameName;
  const runnerTitle = document.getElementById("runner-title");
  const runnerIcon = document.getElementById("runner-icon");

  if (runnerTitle) runnerTitle.textContent = meta.title;
  if (runnerIcon) runnerIcon.innerHTML = appIcon(gameName, 22);
  if (bannedScreen) bannedScreen.classList.add("hidden");
  if (menu) menu.classList.add("hidden");
  if (gameScreen) gameScreen.classList.remove("hidden");

  if (container) {
    container.innerHTML = `
      <div class="game-loading-card fade-in">
        <div class="loader-ring"></div>
        <p>Загрузка игры...</p>
      </div>
    `;
  }

  document.body.dataset.mode = "game";
  appCurrentMode = "game";
  installGameDomObserver(gameName);
  window.scrollTo({ top: 0, behavior: "auto" });

  loadGameScript(meta.script, () => {
    if (gameRunId !== activeGameRunId || document.body.dataset.mode !== "game") return;
    try {
      safeStartGame(meta);
      enhanceGameDom(gameName);
      setTimeout(() => enhanceGameDom(gameName), 120);
      setTimeout(() => enhanceGameDom(gameName), 600);
      renderAppIcons();
    } catch (e) {
      console.error("Ошибка запуска игры:", e);
      if (container) {
        container.innerHTML = `
          <section class="app-error-card fade-in">
            <div class="app-error-icon">!</div>
            <h2>Не удалось запустить игру</h2>
            <p>Проверьте файл ${meta.script} и стартовую функцию ${meta.startFn}.</p>
            <button class="back-button" onclick="goToMainMenu()">Вернуться в меню</button>
          </section>
        `;
      }
    }
  });
}

function loadGameScript(fileName, callback) {
  const cached = loadedGameScripts.get(fileName);

  if (cached === "loaded") {
    setTimeout(callback, 0);
    return;
  }

  if (cached === "loading") {
    const existing = document.querySelector(`script[data-game-script="${fileName}"]`);
    if (existing) existing.addEventListener("load", callback, { once: true });
    return;
  }

  const existingLoaded = document.querySelector(`script[data-game-script="${fileName}"]`);
  if (existingLoaded) {
    loadedGameScripts.set(fileName, "loaded");
    setTimeout(callback, 0);
    return;
  }

  loadedGameScripts.set(fileName, "loading");
  const script = document.createElement("script");
  script.src = fileName;
  script.dataset.gameScript = fileName;

  script.onload = () => {
    loadedGameScripts.set(fileName, "loaded");
    currentGameScript = script;
    callback();
  };

  script.onerror = () => {
    loadedGameScripts.delete(fileName);
    console.error(`Файл ${fileName} не загружается`);
    const container = document.getElementById("game-container");
    if (container) {
      container.innerHTML = `
        <section class="app-error-card fade-in">
          <div class="app-error-icon">!</div>
          <h2>Файл игры не найден</h2>
          <p>${fileName}</p>
          <button class="back-button" onclick="goToMainMenu()">Вернуться в меню</button>
        </section>
      `;
    }
  };

  document.body.appendChild(script);
}

function goToMainMenu() {
  const container = document.getElementById("game-container");
  const menu = document.querySelector(".menu-container");
  const gameScreen = document.getElementById("game-screen");
  const bannedScreen = document.getElementById("banned-screen");

  cleanupActiveGame();

  if (container) {
    container.className = "";
    container.innerHTML = "";
  }
  if (gameScreen) gameScreen.classList.add("hidden");
  if (bannedScreen) bannedScreen.classList.add("hidden");
  if (menu) menu.classList.remove("hidden");

  delete document.body.dataset.mode;
  appCurrentMode = "menu";
  appInitRunId++;
  activeGameRunId++;
  renderAppIcons();
  window.scrollTo({ top: 0, behavior: "auto" });
}
function showSupportModal() {
  if (document.getElementById("support-modal-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "support-modal-overlay";
  overlay.className = "support-overlay";

  overlay.innerHTML = `
    <div class="support-box" onclick="event.stopPropagation()">
      <button class="support-close-btn" id="support-close-x" aria-label="Закрыть">${appIcon("close", 18)}</button>
      <div class="support-decor"></div>
      <div class="support-icon">${appIcon("settings", 28)}</div>
      <h3 class="support-title">Тех-поддержка</h3>
      <p class="support-text">
        Заметили недочёты, ошибки в работе приложения или есть идеи для новых функций? Напишите нам напрямую.
      </p>
      <div class="support-actions">
        <button class="support-btn-primary" id="support-write-btn">
          <span>Написать</span>${appIcon("external", 18)}
        </button>
        <button class="support-btn-secondary" id="support-close-btn">Закрыть</button>
      </div>
    </div>
  `;

  const closeModal = () => {
    overlay.classList.add("is-closing");
    setTimeout(() => overlay.remove(), 180);
  };

  overlay.addEventListener("click", closeModal);
  document.body.appendChild(overlay);
  document.getElementById("support-close-btn")?.addEventListener("click", closeModal);
  document.getElementById("support-close-x")?.addEventListener("click", closeModal);
  document.getElementById("support-write-btn")?.addEventListener("click", openSupportLink);
}

// --- ФУНКЦИИ АДМИН ПАНЕЛИ ---
function renderAdminButton() {
  const actions = document.getElementById("menu-actions") || document.querySelector(".menu-container");
  if (!actions || document.getElementById("admin-btn")) return;

  const btn = document.createElement("button");
  btn.id = "admin-btn";
  btn.className = "support-menu-btn admin-menu-btn";
  btn.type = "button";
  btn.innerHTML = `<span class="support-menu-btn__icon">${appIcon("admin", 20)}</span><span>Админ Панель</span>`;
  btn.onclick = openAdminPanel;

  actions.appendChild(btn);
}

async function openAdminPanel() {
  const container = document.getElementById("game-container");
  const menu = document.querySelector(".menu-container");
  const gameScreen = document.getElementById("game-screen");
  const runnerTitle = document.getElementById("runner-title");
  const runnerIcon = document.getElementById("runner-icon");

  if (menu) menu.classList.add("hidden");
  if (gameScreen) gameScreen.classList.remove("hidden");
  if (runnerTitle) runnerTitle.textContent = "Админ Панель";
  if (runnerIcon) runnerIcon.innerHTML = appIcon("admin", 22);
  document.body.dataset.mode = "game";

  container.innerHTML = `
    <div style='padding: 3rem 1rem; text-align: center;'>
      <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #e2e8f0; border-top-color: var(--accent-active); border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <p style='margin-top: 1rem; font-weight: 600; color: #475569;'>Синхронизация с базой данных...</p>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    </div>
  `;
  window.scrollTo({ top: 0, behavior: "auto" });

  const res = await apiRequest({ action: "getAdminData", adminId: ADMIN_ID });
  
  if (!res || !res.users) {
    container.innerHTML = "<div style='text-align: center; padding: 2rem;'><p style='color: red; margin-bottom: 1rem;'>❌ Ошибка загрузки базы.</p><button class='back-button' onclick='goToMainMenu()'>Назад</button></div>";
    return;
  }

  let html = `
    <div class="fade-in" style="width:100%; max-width: 500px; text-align:left; padding: 0 10px; margin: 0 auto;">
      <button class="back-button" onclick="goToMainMenu()" style="margin-bottom:1rem; width: auto; padding: 10px 14px;">⬅️ Назад в меню</button>
      
      <div class="card" style="padding:1.2rem; margin: 0 0 1.5rem 0; border: 2px solid var(--accent-color);">
        <h3 style="color:var(--accent-active); margin: 0 0 0.8rem 0; font-size: 1.15rem;">📣 Рассылка игрокам</h3>
        <textarea id="broadcast-text" rows="3" placeholder="Введите текст сообщения... (поддерживает HTML теги: <b>жирный</b>, <i>курсив</i>)" style="width:100%; padding:10px; border-radius:10px; border:1px solid #cbd5e1; margin-bottom:10px; font-family:inherit; resize:vertical; font-size: 0.95rem;"></textarea>
        <button id="broadcast-btn" onclick="sendBroadcast()" style="width:100%; padding:12px; background:linear-gradient(135deg, #4f46e5, #3b82f6); color:#fff; font-weight:bold; border:none; border-radius:10px; cursor:pointer; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">Отправить всем</button>
      </div>

      <h2 style="color:var(--accent-active); margin-bottom:1.5rem; text-align:center;">Пользователи (${res.users.length})</h2>
      <div style="display:flex; flex-direction:column; gap:1.2rem; padding-bottom:2rem;">
  `;

  if(res.users.length === 0) {
     html += `<div style="text-align: center; color: #64748b;">Пока никого нет в базе</div>`;
  }

  res.users.forEach(u => {
    let historyStr = "Нет данных";
    try {
      const h = JSON.parse(u.lastGames);
      if (Array.isArray(h) && h.length > 0) historyStr = h.join(", ");
    } catch(e) {}

    html += `
      <div class="card" style="padding:1.2rem; text-align:left; font-size:1rem; font-weight:normal; margin: 0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem;">
          <b style="font-size:1.15rem; word-break: break-all;">${u.username !== "без_ника" ? `@${u.username}` : `ID: ${u.id}`}</b>
          ${u.link !== "неизвестно" ? `<a href="${u.link}" target="_blank" style="color:#3b82f6; text-decoration:none; font-weight:bold; flex-shrink: 0; padding: 4px 8px; background: #eff6ff; border-radius: 8px;">💬 Чат</a>` : `<span style="color:#9ca3af; font-size:0.85rem;">Нет ссылки</span>`}
        </div>
        
        <div style="font-size:0.9rem; color:#475569; margin-bottom:15px; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="margin-bottom: 4px; font-weight: 600; color: #64748b;">🎮 Последние игры:</div>
          <div style="color:var(--text-color);">${historyStr}</div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap:0.8rem; margin-bottom:15px;">
          <div style="background:#f1f5f9; padding:10px; border-radius:10px;">
            <div style="font-size:0.8rem; color:#64748b; font-weight: 700; text-align: center; margin-bottom: 6px;">⭐ Bible Words</div>
            <div style="display:flex; gap:6px;">
              <input type="number" id="wow_${u.id}" value="${u.wowStars}" style="width:100%; padding:6px 8px; font-size:0.95rem; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
              <button onclick="updateUserStars('${u.id}', 'stars_wow', 'wow_${u.id}')" style="background:#22c55e; color:#fff; border:none; border-radius:6px; padding:0 14px; cursor:pointer; font-weight: bold;">✓</button>
            </div>
          </div>
          
          <div style="background:#f1f5f9; padding:10px; border-radius:10px;">
            <div style="font-size:0.8rem; color:#64748b; font-weight: 700; text-align: center; margin-bottom: 6px;">⭐ Word Search</div>
            <div style="display:flex; gap:6px;">
              <input type="number" id="ws_${u.id}" value="${u.wsStars}" style="width:100%; padding:6px 8px; font-size:0.95rem; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
              <button onclick="updateUserStars('${u.id}', 'stars_ws', 'ws_${u.id}')" style="background:#22c55e; color:#fff; border:none; border-radius:6px; padding:0 14px; cursor:pointer; font-weight: bold;">✓</button>
            </div>
          </div>

          <div style="background:#f1f5f9; padding:10px; border-radius:10px;">
            <div style="font-size:0.8rem; color:#64748b; font-weight: 700; text-align: center; margin-bottom: 6px;">🪔 Sacred Word (Ур)</div>
            <div style="display:flex; gap:6px;">
              <input type="number" id="sw_${u.id}" value="${u.swLevel || 0}" style="width:100%; padding:6px 8px; font-size:0.95rem; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
              <button onclick="updateUserStars('${u.id}', 'stars_sw', 'sw_${u.id}')" style="background:#22c55e; color:#fff; border:none; border-radius:6px; padding:0 14px; cursor:pointer; font-weight: bold;">✓</button>
            </div>
          </div>
        </div>

        <button onclick="toggleBan('${u.id}', ${!u.isBanned})" style="width:100%; padding:12px; border:none; border-radius:10px; font-weight:bold; cursor:pointer; background:${u.isBanned ? '#22c55e' : '#ef4444'}; color:#fff; box-shadow: 0 2px 6px rgba(0,0,0,0.1); transition: transform 0.1s;" onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'">
          ${u.isBanned ? '🟢 Разблокировать пользователя' : '🔴 Заблокировать пользователя'}
        </button>
      </div>
    `;
  });

  html += `</div></div>`;
  container.innerHTML = html;
}

window.updateUserStars = async function(targetId, type, inputId) {
  const val = document.getElementById(inputId).value;
  await apiRequest({ action: "updateUser", adminId: ADMIN_ID, updateData: { targetId, type, value: parseInt(val) } });
  
  const tgUser = getTelegramUser();
  if (String(tgUser.id) === String(targetId)) {
    if (type === 'stars_wow') {
      let d = JSON.parse(localStorage.getItem("bibleWowData_v5") || "{}");
      d.coins = parseInt(val);
      localStorage.setItem("bibleWowData_v5", JSON.stringify(d));
    } else if (type === 'stars_ws') {
      localStorage.setItem(`bible_stars_v1_${tgUser.id}`, val);
    } else if (type === 'stars_sw') {
      let d = JSON.parse(localStorage.getItem(`sacred_word_levels_v4_${tgUser.id}`) || "{}");
      d.level = parseInt(val);
      localStorage.setItem(`sacred_word_levels_v4_${tgUser.id}`, JSON.stringify(d));
    }
  }

  const toast = document.createElement("div");
  toast.textContent = "Успешно обновлено!";
  toast.style.cssText = "position:fixed; bottom:40px; left:50%; transform:translateX(-50%); background:rgba(34,197,94,0.95); color:#fff; padding:12px 24px; border-radius:999px; z-index:99999; font-weight:600; font-size: 0.95rem; box-shadow:0 8px 16px rgba(0,0,0,0.15); animation: swFadeIn 0.2s ease-out;";
  document.body.appendChild(toast);
  setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
  }, 2000);
}

window.toggleBan = async function(targetId, banStatus) {
  if(!confirm(`Вы уверены, что хотите ${banStatus ? 'заблокировать' : 'разблокировать'} пользователя?`)) return;
  await apiRequest({ action: "updateUser", adminId: ADMIN_ID, updateData: { targetId, type: "ban", value: banStatus } });
  openAdminPanel(); 
}

window.sendBroadcast = async function() {
  const textEl = document.getElementById('broadcast-text');
  const btn = document.getElementById('broadcast-btn');
  const text = textEl.value.trim();

  if (!text) {
    alert("Пожалуйста, введите текст сообщения.");
    return;
  }

  if (!confirm("Вы уверены, что хотите отправить это сообщение всем пользователям?")) {
    return;
  }

  btn.disabled = true;
  btn.innerHTML = "⏳ Отправка...";
  btn.style.opacity = "0.7";

  const res = await apiRequest({ action: "broadcast", adminId: ADMIN_ID, text: text });

  btn.disabled = false;
  btn.innerHTML = "Отправить всем";
  btn.style.opacity = "1";

  if (res && res.success) {
    textEl.value = ""; 
    alert(`✅ Рассылка успешно завершена!\n\nДоставлено: ${res.delivered}\nОшибок (удалили бота): ${res.failed}`);
  } else {
    alert("❌ Произошла ошибка при отправке рассылки.");
  }
}
