(() => {
  "use strict";

  const ADMIN_ID = "1288379477";
  const GAS_API_URL = "https://script.google.com/macros/s/AKfycbx0o9HmRIF6vNuBUB2N4H3YuabJzYbRmAxvHCCwqnbMPn29Crv5W3FT1XGDF6VyFSn9/exec";

  const CATEGORIES = [
    { id: "company", label: "Игры для компании" },
    { id: "words", label: "Словесные" },
    { id: "kids", label: "Для детей" }
  ];

  const GAMES = [
    { id: "alias", category: "company", title: "Алиас", icon: "💬", script: "games/alias.js", startFn: "startAliasGame" },
    { id: "coimaginarium", category: "company", title: "Соображариум", icon: "💡", script: "games/coimaginarium.js", startFn: "startCoimaginariumGame", args: ["data/coimaginarium_themes.json"] },
    { id: "guess", category: "company", title: "Угадай персонажа", icon: "🎭", script: "games/guess-character.js", startFn: "startGuessCharacterGame", args: ["data/characters.json"] },
    { id: "describe", category: "company", title: "Опиши, но не называй", icon: "🗣️", script: "games/describe-char.js", startFn: "startDescribeCharacterGame", args: ["data/describe_words.json"] },
    { id: "spy", category: "company", title: "Шпион", icon: "👁️", script: "games/spy.js", startFn: "startSpyGame", args: ["data/spy_locations.json"] },
    { id: "quartet", category: "company", title: "Квартет", icon: "🃏", script: "games/quartet.js", startFn: "startQuartetGame", args: ["data/quartet_bible.json"] },
    { id: "bible-wow", category: "words", title: "Библейские слова", icon: "▦", script: "games/bible-wow.js", startFn: "startBibleWowGame", args: ["data/bible_wow_levels.json"] },
    { id: "bible-wordsearch", category: "words", title: "Поиск библейских слов", icon: "🔎", script: "games/bible-wordsearch.js", startFn: "startBibleWordSearchGame", args: ["data/bible_wordsearch_levels.json"] },
    { id: "sacred-word", category: "words", title: "Священное слово", icon: "🔥", script: "games/sacred-word.js", startFn: "startSacredWordGame", args: ["data/sacred_words.json"] },
    { id: "kids-ark-pairs", category: "kids", title: "Найди пару", icon: "🐦", script: "games/kids-ark-pairs.js", startFn: "startKidsArkPairsGame" }
  ];

  const state = {
    status: "loading",
    activeGame: null,
    supportOpen: false,
    users: [],
    adminLoading: false,
    broadcastText: "",
    broadcastLoading: false
  };

  const root = document.getElementById("root");
  const scriptRegistry = new Map();

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const asInt = (value, fallback = 0) => {
    const num = Number.parseInt(value, 10);
    return Number.isFinite(num) ? num : fallback;
  };

  async function apiRequest(payload) {
    try {
      const res = await fetch(GAS_API_URL, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "text/plain" }
      });
      return await res.json();
    } catch (error) {
      console.error("API Error:", error);
      return null;
    }
  }

  function getTelegramUser() {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user || {};
    return {
      username: tgUser.username || "без_ника",
      id: tgUser.id || "аноним",
      link: tgUser.username ? `https://t.me/${tgUser.username}` : "неизвестно"
    };
  }

  function initTelegram() {
    const wa = window.Telegram?.WebApp;
    if (!wa) return;
    try {
      wa.ready();
      wa.expand();
    } catch (error) {
      console.warn("Telegram WebApp init skipped:", error);
    }
  }

  function openTelegramLink(url) {
    const wa = window.Telegram?.WebApp;
    if (wa?.openTelegramLink) wa.openTelegramLink(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  }

  function getLocalSnapshot(userId) {
    let localWowData = { coins: 20 };
    let localGamesHistory = [];
    let localSwLevel = 0;

    try {
      localWowData = JSON.parse(localStorage.getItem("bibleWowData_v5") || "{}");
      if (typeof localWowData !== "object" || !localWowData) localWowData = { coins: 20 };
    } catch (_) {}

    let localWsStars = asInt(localStorage.getItem(`bible_stars_v1_${userId}`), 0);

    try {
      const swState = JSON.parse(localStorage.getItem(`sacred_word_levels_v4_${userId}`) || "{}");
      localSwLevel = asInt(swState.level, 0);
    } catch (_) {}

    try {
      const parsed = JSON.parse(localStorage.getItem("last_games_history") || "[]");
      localGamesHistory = Array.isArray(parsed) ? parsed : [];
    } catch (_) {}

    return {
      localWowData,
      localWsStars,
      localSwLevel,
      localGamesHistory
    };
  }

  async function checkAccess() {
    state.status = "loading";
    render();

    try {
      const user = getTelegramUser();
      const local = getLocalSnapshot(user.id);
      const res = await apiRequest({
        action: "syncUser",
        user: {
          id: user.id,
          username: user.username,
          link: user.link,
          wowStars: typeof local.localWowData.coins === "number" ? local.localWowData.coins : 20,
          wsStars: local.localWsStars,
          swLevel: local.localSwLevel,
          lastGames: local.localGamesHistory,
          forceUpdate: false
        }
      });

      if (res?.isBanned) {
        state.status = "banned";
        render();
        return;
      }

      if (res) {
        const nextWowData = local.localWowData;
        if (typeof res.wowStars === "number") nextWowData.coins = res.wowStars;
        localStorage.setItem("bibleWowData_v5", JSON.stringify(nextWowData));
        if (res.wsStars !== undefined) localStorage.setItem(`bible_stars_v1_${user.id}`, String(res.wsStars));

        if (res.swLevel !== undefined) {
          try {
            const swState = JSON.parse(localStorage.getItem(`sacred_word_levels_v4_${user.id}`) || "{}");
            swState.level = res.swLevel;
            localStorage.setItem(`sacred_word_levels_v4_${user.id}`, JSON.stringify(swState));
          } catch (_) {}
        }

        if (res.lastGames) localStorage.setItem("last_games_history", JSON.stringify(res.lastGames));
      }
    } catch (error) {
      console.error(error);
    }

    state.status = "menu";
    render();
  }

  function getLastGamesHistory() {
    try {
      const history = JSON.parse(localStorage.getItem("last_games_history") || "[]");
      return Array.isArray(history) ? history.slice(0, 3) : [];
    } catch (_) {
      return [];
    }
  }

  function saveGameHistory(gameTitle) {
    let nextHistory = [];
    try {
      let history = JSON.parse(localStorage.getItem("last_games_history") || "[]");
      if (!Array.isArray(history)) history = [];
      history = history.filter((title) => title !== gameTitle);
      history.unshift(gameTitle);
      nextHistory = history.slice(0, 3);
      localStorage.setItem("last_games_history", JSON.stringify(nextHistory));
    } catch (_) {}
    return nextHistory;
  }

  function cleanupGame() {
    try { window.aliasHardReset?.({ clearWordCache: false }); } catch (_) {}
    try { window.aliasRemoveKeyHandlers?.(); } catch (_) {}
    if (window.aliasInterval) clearInterval(window.aliasInterval);
    if (window.coimaginariumInterval) clearInterval(window.coimaginariumInterval);
    try { window.__wsCleanup?.(); } catch (_) {}
    try { window.__wsCleanup = null; } catch (_) {}
    try { window.__sacredWordCleanup?.(); } catch (_) {}
    try { window.__sacredWordCleanup = null; } catch (_) {}
    try { window.__quartetCleanup?.(); } catch (_) {}
    try { window.__quartetCleanup = null; } catch (_) {}
    delete window.goToMainMenu;
  }

  function gotoMenu(sync = true) {
    cleanupGame();
    state.activeGame = null;
    state.status = "menu";
    render();
    if (sync) checkAccess();
  }

  function selectGame(gameId) {
    const game = GAMES.find((item) => item.id === gameId);
    if (!game) return;
    cleanupGame();
    state.activeGame = game;
    state.status = "game";
    const history = saveGameHistory(game.title);
    const user = getTelegramUser();
    apiRequest({ action: "updateHistory", id: user.id, history }).catch(() => {});
    render();
    loadGameScript(game);
  }

  function loadGameScript(game) {
    window.appGoToMainMenu = () => gotoMenu(true);
    window.goToMainMenu = window.appGoToMainMenu;
    const container = document.getElementById("game-container");
    if (!container) return;

    const startGame = () => {
      if (state.status !== "game" || state.activeGame?.id !== game.id) return;
      try {
        const starter = window[game.startFn];
        if (typeof starter !== "function") {
          showGameError(game, `Стартовая функция ${game.startFn} не найдена.`);
          return;
        }
        starter(...(game.args || []));
      } catch (error) {
        console.error(error);
        showGameError(game, "Скрипт найден, но игра не запустилась из-за ошибки.");
      }
    };

    if (scriptRegistry.get(game.script) === "loaded") {
      startGame();
      return;
    }

    if (scriptRegistry.get(game.script) === "loading") {
      const timer = window.setInterval(() => {
        if (scriptRegistry.get(game.script) === "loaded") {
          window.clearInterval(timer);
          startGame();
        }
      }, 80);
      return;
    }

    scriptRegistry.set(game.script, "loading");
    const scriptEl = document.createElement("script");
    scriptEl.src = game.script;
    scriptEl.async = true;
    scriptEl.onload = () => {
      scriptRegistry.set(game.script, "loaded");
      startGame();
    };
    scriptEl.onerror = () => {
      scriptRegistry.delete(game.script);
      showGameError(game, `Файл ${game.script} не найден в архиве или на сервере.`);
    };
    document.body.appendChild(scriptEl);
  }

  function showGameError(game, details) {
    const container = document.getElementById("game-container");
    if (!container) return;
    container.innerHTML = `
      <div class="game-error">
        <div class="state-icon" style="width:64px;height:64px;margin:0;font-size:30px;">⚠️</div>
        <div class="game-error-title">Игра находится в разработке</div>
        <div class="game-error-text">${escapeHtml(details || `Файлы для игры ${game.title} не найдены.`)}</div>
        <button class="primary-button" style="max-width:260px" data-action="menu">Вернуться в меню</button>
      </div>
    `;
  }

  function render() {
    root.innerHTML = `
      <main class="app-shell">
        <div class="bg-orbs" aria-hidden="true"><div class="orb orb-a"></div><div class="orb orb-b"></div><div class="orb orb-c"></div></div>
        ${renderContent()}
        ${state.supportOpen ? renderSupportModal() : ""}
      </main>
    `;
  }

  function renderContent() {
    if (state.status === "loading") return renderLoading();
    if (state.status === "banned") return renderBanned();
    if (state.status === "admin") return renderAdminPanel();
    if (state.status === "game" && state.activeGame) return renderGameRunner(state.activeGame);
    return renderMenu();
  }

  function renderLoading() {
    return `
      <section class="fullscreen-state">
        <div class="state-card">
          <div class="spinner"></div>
          <div class="loading-label">Проверка доступа...</div>
        </div>
      </section>
    `;
  }

  function renderBanned() {
    return `
      <section class="fullscreen-state" style="background:#DBEAFE">
        <div class="state-card">
          <div class="state-icon">!</div>
          <h1 class="state-title">Доступ к приложению ограничен</h1>
          <p class="state-text">Обжаловать блокировку можно через техническую поддержку.</p>
          <button class="danger-button" data-action="support-link">Написать в поддержку</button>
        </div>
      </section>
    `;
  }

  function renderMenu() {
    const user = getTelegramUser();
    const isAdmin = String(user.id) === ADMIN_ID;
    const categories = CATEGORIES.map((cat) => {
      const games = GAMES.filter((game) => game.category === cat.id);
      if (!games.length) return "";
      return `
        <section class="category">
          <h2 class="category-title">${escapeHtml(cat.label)}</h2>
          <div class="game-grid ${games.length === 1 ? "single" : ""}">
            ${games.map((game) => `
              <button class="game-card" data-game-id="${escapeHtml(game.id)}">
                <span class="game-icon">${escapeHtml(game.icon)}</span>
                <span class="game-title">${escapeHtml(game.title)}</span>
              </button>
            `).join("")}
          </div>
        </section>
      `;
    }).join("");

    return `
      <section class="view">
        <header class="header">
          <h1 class="title">Библейские игры</h1>
          <p class="subtitle">Во что будем играть?</p>
        </header>
        ${categories}
        <div class="menu-actions">
          <button class="soft-button" data-action="support">🛟 Тех-поддержка</button>
          ${isAdmin ? `<button class="primary-button" data-action="admin">🛡️ Админ Панель</button>` : ""}
        </div>
      </section>
    `;
  }

  function renderGameRunner(game) {
    return `
      <section class="view">
        <div class="topbar">
          <button class="back-icon" data-action="menu" aria-label="Назад">←</button>
          <h1 class="game-name">${escapeHtml(game.title)}</h1>
          <div class="icon-chip">${escapeHtml(game.icon)}</div>
        </div>
        <div id="game-container">
          <div class="game-loading">
            <div class="spinner" style="width:40px;height:40px"></div>
            <div>Загрузка игры...</div>
          </div>
        </div>
      </section>
    `;
  }

  function renderSupportModal() {
    return `
      <div class="modal-backdrop" data-action="support-close"></div>
      <section class="modal-shell" role="dialog" aria-modal="true" aria-label="Тех-поддержка">
        <div class="support-card">
          <button class="close-button" data-action="support-close" aria-label="Закрыть">×</button>
          <div class="support-icon">⚙️</div>
          <h2 class="support-title">Тех-поддержка</h2>
          <p class="support-text">Заметили недочёты, ошибки в работе приложения или есть идеи для новых функций? Напишите нам напрямую.</p>
          <div class="modal-actions">
            <button class="primary-button" data-action="support-link">Написать ↗</button>
            <button class="plain-button" data-action="support-close">Закрыть</button>
          </div>
        </div>
      </section>
    `;
  }

  function parseLastGames(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return typeof value === "string" ? [value] : [];
    }
  }

  function renderAdminPanel() {
    const users = state.users || [];
    return `
      <section class="view admin-wrap">
        <div class="topbar left">
          <button class="back-icon" data-action="menu-no-sync" aria-label="Назад">←</button>
          <h1 class="topbar-title">Админ Панель</h1>
        </div>

        <div class="section-card">
          <h2 class="section-heading">✉️ Рассылка</h2>
          <textarea class="textarea" data-field="broadcast" placeholder="Введите текст сообщения... (поддерживает HTML: &lt;b&gt;, &lt;i&gt;)" ${state.broadcastLoading ? "disabled" : ""}>${escapeHtml(state.broadcastText)}</textarea>
          <button class="primary-button" data-action="broadcast" style="margin-top:12px" ${state.broadcastLoading ? "disabled" : ""}>${state.broadcastLoading ? "Отправка..." : "Отправить всем"}</button>
        </div>

        <h2 class="users-heading">Пользователи (${users.length})</h2>
        ${state.adminLoading ? `
          <div class="game-loading"><div class="spinner"></div></div>
        ` : `
          <div class="users-list">
            ${users.length ? users.map(renderUserCard).join("") : `<div class="section-card empty">Пользователи не найдены</div>`}
          </div>
        `}
      </section>
    `;
  }

  function renderUserCard(user) {
    const id = String(user.id ?? "");
    const username = user.username && user.username !== "без_ника" ? `@${user.username}` : `ID: ${id}`;
    const lastGames = parseLastGames(user.lastGames);
    const stats = [
      { label: "Bible Words", key: "wowStars", type: "stars_wow", val: user.wowStars || 0 },
      { label: "Word Search", key: "wsStars", type: "stars_ws", val: user.wsStars || 0 },
      { label: "Sacred Word", key: "swLevel", type: "stars_sw", val: user.swLevel || 0 }
    ];

    return `
      <article class="user-card">
        <div class="user-head">
          <div style="min-width:0">
            <div class="user-name">${escapeHtml(username)}</div>
            <div class="user-id">ID: ${escapeHtml(id)}</div>
          </div>
          ${user.link && user.link !== "неизвестно" ? `<a class="chat-link" href="${escapeHtml(user.link)}" target="_blank" rel="noopener noreferrer">Чат</a>` : ""}
        </div>

        <div class="last-games">
          <div class="last-games-label">🎮 Последние игры:</div>
          <div class="last-games-text">${escapeHtml(lastGames.length ? lastGames.join(", ") : "Нет данных")}</div>
        </div>

        <div class="stat-grid">
          ${stats.map((stat) => `
            <div class="stat-card">
              <div class="stat-label">${escapeHtml(stat.label)}</div>
              <input class="stat-input" type="number" value="${escapeHtml(stat.val)}" data-stat-input="${escapeHtml(id)}:${escapeHtml(stat.type)}" />
              <button class="save-stat" data-action="save-stat" data-user-id="${escapeHtml(id)}" data-stat-type="${escapeHtml(stat.type)}">✓</button>
            </div>
          `).join("")}
        </div>

        <button class="ban-button ${user.isBanned ? "unblock" : "block"}" data-action="toggle-ban" data-user-id="${escapeHtml(id)}">
          ${user.isBanned ? "✓ Разблокировать" : "⊘ Заблокировать"}
        </button>
      </article>
    `;
  }

  async function loadAdminData() {
    state.status = "admin";
    state.adminLoading = true;
    render();

    const res = await apiRequest({ action: "getAdminData", adminId: ADMIN_ID });
    state.users = Array.isArray(res?.users) ? res.users : [];
    state.adminLoading = false;
    render();
  }

  function findAdminUser(userId) {
    return (state.users || []).find((user) => String(user.id) === String(userId));
  }

  async function handleBroadcast() {
    const textarea = document.querySelector('[data-field="broadcast"]');
    state.broadcastText = textarea?.value || state.broadcastText;
    if (!state.broadcastText.trim()) {
      alert("Введите текст");
      return;
    }
    if (!confirm("Отправить сообщение всем?")) return;

    state.broadcastLoading = true;
    render();

    const res = await apiRequest({ action: "broadcast", adminId: ADMIN_ID, text: state.broadcastText });
    state.broadcastLoading = false;

    if (res?.success) {
      const delivered = res.delivered ?? 0;
      const failed = res.failed ?? 0;
      state.broadcastText = "";
      alert(`✅ Успешно!\nДоставлено: ${delivered}\nОшибок: ${failed}`);
    } else {
      alert("❌ Ошибка отправки");
    }
    render();
  }

  async function updateUserStars(userId, type, value) {
    await apiRequest({ action: "updateUser", adminId: ADMIN_ID, updateData: { targetId: userId, type, value } });
    await loadAdminData();
  }

  async function toggleBan(userId) {
    const user = findAdminUser(userId);
    if (!user) return;
    const isBanning = !user.isBanned;
    if (!confirm(`Вы уверены, что хотите ${isBanning ? "заблокировать" : "разблокировать"}?`)) return;
    await apiRequest({ action: "updateUser", adminId: ADMIN_ID, updateData: { targetId: user.id, type: "ban", value: isBanning } });
    await loadAdminData();
  }

  function bindEvents() {
    document.addEventListener("click", async (event) => {
      const gameButton = event.target.closest("[data-game-id]");
      if (gameButton) {
        selectGame(gameButton.dataset.gameId);
        return;
      }

      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) return;
      const action = actionEl.dataset.action;

      if (action === "support") {
        state.supportOpen = true;
        render();
      }

      if (action === "support-close") {
        state.supportOpen = false;
        render();
      }

      if (action === "support-link") {
        openTelegramLink("https://t.me/D_a_n_Vi");
      }

      if (action === "admin") {
        await loadAdminData();
      }

      if (action === "menu") {
        gotoMenu(true);
      }

      if (action === "menu-no-sync") {
        gotoMenu(false);
      }

      if (action === "broadcast") {
        await handleBroadcast();
      }

      if (action === "save-stat") {
        const userId = actionEl.dataset.userId;
        const type = actionEl.dataset.statType;
        const input = document.querySelector(`[data-stat-input="${CSS.escape(`${userId}:${type}`)}"]`);
        await updateUserStars(userId, type, asInt(input?.value, 0));
      }

      if (action === "toggle-ban") {
        await toggleBan(actionEl.dataset.userId);
      }
    });

    document.addEventListener("input", (event) => {
      if (event.target.matches('[data-field="broadcast"]')) {
        state.broadcastText = event.target.value;
      }
    });
  }

  async function loadJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ошибка: ${res.status} при загрузке ${url}`);
    return await res.json();
  }

  function shuffleArray(arr) {
    const next = Array.isArray(arr) ? [...arr] : [];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  // Совместимость со всеми vanilla-играми из старого архива.
  window.getTelegramUser = getTelegramUser;
  window.loadJSON = loadJSON;
  window.shuffleArray = shuffleArray;
  window.escapeHTML = escapeHtml;
  window.appGoToMainMenu = () => gotoMenu(true);

  bindEvents();
  initTelegram();
  checkAccess();
})();
