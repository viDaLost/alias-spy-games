// app.js — лаунчер игр (полноэкранный режим для каждой игры)

// Глобальная переменная для текущего подключённого скрипта игры
let currentGameScript = null;

// --- ИНТЕГРАЦИЯ АДМИН-ПАНЕЛИ И API ---
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxs3U03XVvYzpFCHts962TKkydGEFoCPxlWthM_xKzVpmArkzZWYm01rsNRIGN7DY4/exec";
const ADMIN_ID = "1288379477";
let currentUserData = { lastGames: [] };

async function apiRequest(payload) {
  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain;charset=utf-8" } // Обход CORS
    });
    return await res.json();
  } catch (e) {
    console.error("API Error:", e);
    return null;
  }
}

async function initializeApp() {
  const tgUser = getTelegramUser();
  
  // Показываем загрузку профиля
  document.body.insertAdjacentHTML('afterbegin', '<div id="app-loader" style="position:fixed; inset:0; background:var(--bg-color); z-index:99999; display:flex; align-items:center; justify-content:center; font-weight:bold; color:var(--text-color);">Загрузка профиля...</div>');

  // Читаем текущие данные из localStorage для синхронизации
  const localWowData = JSON.parse(localStorage.getItem("bibleWowData_v5") || "{}");
  const localWsStars = parseInt(localStorage.getItem(`bible_stars_v1_${tgUser.id}`) || "0");
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
      wowStars: localWowData.coins || 20,
      wsStars: localWsStars,
      lastGames: localGamesHistory,
      forceUpdate: false 
    }
  });

  const loader = document.getElementById("app-loader");
  if (loader) loader.remove();

  if (res) {
    if (res.isBanned) {
      const menu = document.querySelector(".menu-container");
      if (menu) menu.classList.add("hidden");
      const bannedScreen = document.getElementById("banned-screen");
      if (bannedScreen) bannedScreen.classList.remove("hidden");
      return; // Останавливаем выполнение приложения
    }

    // Синхронизируем localStorage с данными из БД (в случае если админ их изменил)
    localWowData.coins = res.wowStars;
    localStorage.setItem("bibleWowData_v5", JSON.stringify(localWowData));
    localStorage.setItem(`bible_stars_v1_${tgUser.id}`, res.wsStars);
    localStorage.setItem("last_games_history", JSON.stringify(res.lastGames));
    currentUserData.lastGames = res.lastGames;
  }

  // Отрисовка кнопки админ-панели
  if (String(tgUser.id) === ADMIN_ID) {
    renderAdminButton();
  }
}

// Запуск инициализации при загрузке приложения
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
// --- КОНЕЦ ИНТЕГРАЦИИ API ---

// Получаем данные пользователя из Telegram (фикс пробела в ссылке)
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

// Универсальная загрузка JSON (может пригодиться другим играм)
async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ошибка: ${res.status} при загрузке ${url}`);
  return await res.json();
}

// Простая перетасовка (если нужна в лаунчере)
function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

// Показать игру по имени (полноэкранно)
function showGame(gameName) {
  // --- ТРЕКИНГ ПОСЛЕДНИХ ИГР ---
  const gameTitles = {
    "alias": "Алиас", "coimaginarium": "Соображариум", "guess": "Угадай персонажа",
    "describe": "Опиши, но не называй", "spy": "Шпион", "quartet": "Квартет",
    "bible-wow": "Библейские слова", "bible-wordsearch": "Поиск библейских слов", "sacred-word": "Священное слово",
    "kids-ark-pairs": "Найди пару"
  };

  if (gameTitles[gameName]) {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem("last_games_history") || "[]");
      if (!Array.isArray(history)) history = [];
    } catch (e) { history = []; }
    
    history = history.filter(g => g !== gameTitles[gameName]); // Удаляем дубликат
    history.unshift(gameTitles[gameName]); // Добавляем в начало
    if (history.length > 3) history.pop(); // Оставляем только 3
    
    localStorage.setItem("last_games_history", JSON.stringify(history));
    currentUserData.lastGames = history;
    
    // Отправляем тихий апдейт в БД
    const tgUser = getTelegramUser();
    apiRequest({
      action: "syncUser",
      user: { 
        id: tgUser.id, 
        forceUpdate: true, 
        lastGames: history, 
        wowStars: JSON.parse(localStorage.getItem("bibleWowData_v5")||"{}").coins || 20,
        wsStars: parseInt(localStorage.getItem(`bible_stars_v1_${tgUser.id}`) || "0") 
      }
    });
  }
  // --- КОНЕЦ ТРЕКИНГА ---

  const container = document.getElementById("game-container");
  const menu = document.querySelector(".menu-container");

  if (container) container.innerHTML = "<p class='fade-in'>🔄 Загрузка игры...</p>";
  if (menu) menu.classList.add("hidden");              // прячем меню
  document.body.dataset.mode = "game";                 // флаг режима игры (для стилей при желании)
  window.scrollTo({ top: 0, behavior: "auto" });       // скроллим к началу

  // Очистить предыдущий скрипт
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }

  // Запуск нужной игры
  if (gameName === "alias") {
    loadGameScript("games/alias.js", () => startAliasGame());
  } else if (gameName === "coimaginarium") {
    const themesUrl = "data/coimaginarium_themes.json";
    loadGameScript("games/coimaginarium.js", () => startCoimaginariumGame(themesUrl));
  } else if (gameName === "guess") {
    const charsUrl = "data/characters.json";
    loadGameScript("games/guess-character.js", () => startGuessCharacterGame(charsUrl));
  } else if (gameName === "describe") {
    const wordsUrl = "data/describe_words.json";
    loadGameScript("games/describe-char.js", () => startDescribeCharacterGame(wordsUrl));
  } else if (gameName === "spy") {
    const locationsUrl = "data/spy_locations.json";
    loadGameScript("games/spy.js", () => startSpyGame(locationsUrl));
  } else if (gameName === "kids-ark-pairs") {
    loadGameScript("games/kids-ark-pairs.js", () => startKidsArkPairsGame());
  } else if (gameName === "quartet") {
    const quartetsUrl = "data/quartet_bible.json";
    loadGameScript("games/quartet.js", () => startQuartetGame(quartetsUrl));
  } else if (gameName === "bible-wow") {
    const levelsUrl = "data/bible_wow_levels.json";
    loadGameScript("games/bible-wow.js", () => startBibleWowGame(levelsUrl));
  } else if (gameName === "bible-wordsearch") {
    const levelsUrl = "data/bible_wordsearch_levels.json";
    loadGameScript("games/bible-wordsearch.js", () => startBibleWordSearchGame(levelsUrl));
  } else if (gameName === "sacred-word") {
    const wordsUrl = "data/sacred_words.json";
    loadGameScript("games/sacred-word.js", () => startSacredWordGame(wordsUrl));
  } else {
    if (container) container.innerHTML = "<p>❌ Неизвестная игра.</p>";
  }
}

// Подключение JS-файла игры
function loadGameScript(fileName, callback) {
  const script = document.createElement("script");
  script.src = fileName;

  script.onload = () => {
    try {
      callback();
    } catch (e) {
      console.error("Ошибка запуска игры:", e);
      const container = document.getElementById("game-container");
      if (container) {
        container.innerHTML = `
          <p style="color:red">❌ Ошибка запуска игры. Проверь консоль.</p>
          <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
        `;
      }
    }
  };

  script.onerror = () => {
    console.error(`Файл ${fileName} не загружается`);
    const container = document.getElementById("game-container");
    if (container) {
      container.innerHTML = `
        <p style="color:red">❌ Ошибка: файл <b>${fileName}</b> не найден или не загрузился.</p>
        <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
      `;
    }
    try { alert(`❌ Ошибка: файл ${fileName} не найден`); } catch {}
  };

  document.body.appendChild(script);
  currentGameScript = script;
}

// Вернуться в главное меню (единая функция для всех игр)
function goToMainMenu() {
  const container = document.getElementById("game-container");
  const menu = document.querySelector(".menu-container");

  if (container) container.innerHTML = "";
  if (menu) menu.classList.remove("hidden");
  delete document.body.dataset.mode;

  // Чистим любые интервалы, которые могли оставить игры
  if (window.aliasInterval) clearInterval(window.aliasInterval);
  if (window.coimaginariumInterval) clearInterval(window.coimaginariumInterval);

  // Чистим глобальные слушатели/ресурсы игр (если игра их оставила)
  try { window.__wsCleanup?.(); } catch {}
  try { window.__wsCleanup = null; } catch {}
  try { window.__sacredWordCleanup?.(); } catch {}
  try { window.__sacredWordCleanup = null; } catch {}

  // Удаляем подключённый скрипт игры
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }
}

// ✅ Модальное окно техподдержки
function showSupportModal() {
  if (document.getElementById("support-modal-overlay")) return;

  if (!document.getElementById("support-modal-style")) {
    const style = document.createElement("style");
    style.id = "support-modal-style";
    style.textContent = `
      .support-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.6);
        backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999;
        opacity: 0; animation: swFadeIn 0.2s forwards ease-out;
      }
      .support-box {
        background: #ffffff;
        border-radius: 20px;
        padding: 24px;
        width: min(90%, 400px);
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
        transform: translateY(20px) scale(0.95);
        animation: swSlideUp 0.3s forwards cubic-bezier(0.16, 1, 0.3, 1);
        text-align: center;
      }
      .support-title {
        font-size: 1.3rem; font-weight: 800; color: #312e81; margin: 0 0 12px 0;
      }
      .support-text {
        font-size: 0.95rem; color: #475569; line-height: 1.5; margin: 0 0 20px 0;
      }
      .support-actions {
        display: grid; gap: 10px;
      }
      .support-btn-primary {
        background: linear-gradient(135deg, #4f46e5, #3b82f6);
        color: #fff; border: none; padding: 12px; border-radius: 12px;
        font-size: 1rem; font-weight: 700; cursor: pointer;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
      }
      .support-btn-secondary {
        background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;
        padding: 10px; border-radius: 12px; font-size: 0.95rem; font-weight: 600; cursor: pointer;
      }
      @keyframes swFadeIn { to { opacity: 1; } }
      @keyframes swSlideUp { to { transform: translateY(0) scale(1); } }
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement("div");
  overlay.id = "support-modal-overlay";
  overlay.className = "support-overlay";

  overlay.innerHTML = `
    <div class="support-box" onclick="event.stopPropagation()">
      <h3 class="support-title">🛠 Тех-поддержка</h3>
      <p class="support-text">
        Если вы заметили какие-то недочёты или ошибки в приложении или у вас есть предложения по улучшению или добавлению новых функций, обращайтесь по кнопке ниже.
      </p>
      <div class="support-actions">
        <button class="support-btn-primary" id="support-write-btn">Написать</button>
        <button class="support-btn-secondary" id="support-close-btn">Закрыть</button>
      </div>
    </div>
  `;

  overlay.addEventListener("click", closeModal);
  document.body.appendChild(overlay);

  document.getElementById("support-close-btn").addEventListener("click", closeModal);
  
  document.getElementById("support-write-btn").addEventListener("click", () => {
    const tgUrl = "https://t.me/D_a_n_Vi";
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(tgUrl);
    } else {
      window.open(tgUrl, "_blank");
    }
  });

  function closeModal() {
    overlay.style.animation = "none";
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 0.2s ease";
    setTimeout(() => overlay.remove(), 200);
  }
}

// --- ФУНКЦИИ АДМИН ПАНЕЛИ ---
function renderAdminButton() {
  const menu = document.querySelector(".menu-container");
  if (!menu || document.getElementById("admin-btn")) return;
  
  const divider = document.createElement("div");
  divider.className = "menu-divider";
  divider.style.display = "block";
  
  const btn = document.createElement("button");
  btn.id = "admin-btn";
  btn.className = "game-button game-button--wide";
  btn.style.background = "#0f172a";
  btn.style.color = "#fff";
  btn.innerHTML = "👑 Админ Панель";
  btn.onclick = openAdminPanel;
  
  menu.appendChild(divider);
  menu.appendChild(btn);
}

async function openAdminPanel() {
  const container = document.getElementById("game-container");
  const menu = document.querySelector(".menu-container");
  
  menu.classList.add("hidden");
  container.innerHTML = "<p class='fade-in'>⏳ Загрузка базы пользователей...</p>";
  window.scrollTo({ top: 0, behavior: "auto" });

  const res = await apiRequest({ action: "getAdminData", adminId: ADMIN_ID });
  
  if (!res || !res.users) {
    container.innerHTML = "<p>❌ Ошибка загрузки админ-панели.</p><button class='back-button' onclick='goToMainMenu()'>Назад</button>";
    return;
  }

  let html = `
    <div class="fade-in" style="width:100%; max-width: 500px; text-align:left; padding: 0 10px;">
      <button class="back-button" onclick="goToMainMenu()" style="margin-bottom:1rem;">⬅️ Назад в меню</button>
      <h2 style="color:var(--accent-active); margin-bottom:1rem; text-align:center;">Управление пользователями</h2>
      <div style="display:flex; flex-direction:column; gap:1rem; padding-bottom:2rem;">
  `;

  res.users.forEach(u => {
    let historyStr = "Нет данных";
    try {
      const h = JSON.parse(u.lastGames);
      if (Array.isArray(h) && h.length > 0) historyStr = h.join(", ");
    } catch(e) {}

    html += `
      <div class="card" style="padding:1rem; text-align:left; font-size:1rem; font-weight:normal; margin: 0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
          <b style="font-size:1.1rem; word-break: break-all;">${u.username !== "без_ника" ? `@${u.username}` : `ID: ${u.id}`}</b>
          ${u.link !== "неизвестно" ? `<a href="${u.link}" target="_blank" style="color:#3b82f6; text-decoration:none; font-weight:bold; flex-shrink: 0;">💬 Чат</a>` : `<span style="color:#9ca3af; font-size:0.8rem;">Нет ссылки</span>`}
        </div>
        
        <div style="font-size:0.9rem; color:#475569; margin-bottom:10px;">
          🎮 Последние игры: <b style="color:var(--text-color);">${historyStr}</b>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; margin-bottom:10px;">
          <div style="background:#f1f5f9; padding:8px; border-radius:8px;">
            <div style="font-size:0.8rem; color:#64748b; font-weight: 600;">⭐ Bible Words</div>
            <div style="display:flex; gap:5px; margin-top:5px;">
              <input type="number" id="wow_${u.id}" value="${u.wowStars}" style="width:100%; padding:4px 8px; font-size:0.9rem; border: 1px solid #cbd5e1; border-radius: 6px;">
              <button onclick="updateUserStars('${u.id}', 'stars_wow', 'wow_${u.id}')" style="background:#22c55e; color:#fff; border:none; border-radius:6px; padding:0 12px; cursor:pointer;">✓</button>
            </div>
          </div>
          <div style="background:#f1f5f9; padding:8px; border-radius:8px;">
            <div style="font-size:0.8rem; color:#64748b; font-weight: 600;">⭐ Word Search</div>
            <div style="display:flex; gap:5px; margin-top:5px;">
              <input type="number" id="ws_${u.id}" value="${u.wsStars}" style="width:100%; padding:4px 8px; font-size:0.9rem; border: 1px solid #cbd5e1; border-radius: 6px;">
              <button onclick="updateUserStars('${u.id}', 'stars_ws', 'ws_${u.id}')" style="background:#22c55e; color:#fff; border:none; border-radius:6px; padding:0 12px; cursor:pointer;">✓</button>
            </div>
          </div>
        </div>

        <button onclick="toggleBan('${u.id}', ${!u.isBanned})" style="width:100%; padding:10px; border:none; border-radius:8px; font-weight:bold; cursor:pointer; background:${u.isBanned ? '#22c55e' : '#ef4444'}; color:#fff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: transform 0.1s;" onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'">
          ${u.isBanned ? '🟢 Разблокировать пользователя' : '🔴 Заблокировать пользователя'}
        </button>
      </div>
    `;
  });

  html += `</div></div>`;
  container.innerHTML = html;
}

// Функции для работы из админки, привязанные к объекту window
window.updateUserStars = async function(targetId, type, inputId) {
  const val = document.getElementById(inputId).value;
  await apiRequest({ action: "updateUser", adminId: ADMIN_ID, updateData: { targetId, type, value: parseInt(val) } });
  
  // Создаем всплывающее уведомление (toast) вместо alert
  const toast = document.createElement("div");
  toast.textContent = "Звезды успешно обновлены!";
  toast.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(34,197,94,0.9); color:#fff; padding:10px 20px; border-radius:20px; z-index:99999; font-weight:bold; box-shadow:0 4px 10px rgba(0,0,0,0.2);";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

window.toggleBan = async function(targetId, banStatus) {
  if(!confirm(`Вы уверены, что хотите ${banStatus ? 'заблокировать' : 'разблокировать'} пользователя?`)) return;
  await apiRequest({ action: "updateUser", adminId: ADMIN_ID, updateData: { targetId, type: "ban", value: banStatus } });
  openAdminPanel(); // Перерисовываем панель, чтобы обновить кнопки
}
