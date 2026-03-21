// app.js — лаунчер игр (полноэкранный режим для каждой игры)

let currentGameScript = null;

// --- ИНТЕГРАЦИЯ АДМИН-ПАНЕЛИ И API ---
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwQ78q27vPmLxD0mOTE4PCFVWtdoUEOQNhZBn2LaEAIwc_hvjQ5YRZHRrZsjox-GuYUiA/exec";
const ADMIN_ID = "1288379477";
let currentUserData = { lastGames: [] };

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

async function initializeApp() {
  // Говорим Telegram, что приложение готово
  if (window.Telegram && window.Telegram.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }

  document.body.insertAdjacentHTML('afterbegin', '<div id="app-loader" style="position:fixed; inset:0; background:var(--bg-color); z-index:99999; display:flex; align-items:center; justify-content:center; font-weight:bold; color:var(--text-color);">Загрузка профиля...</div>');

  try {
    const tgUser = getTelegramUser();
    
    // БЕЗОПАСНОЕ чтение данных из кэша (чтобы избежать зависания)
    let localWowData = { coins: 20 };
    try { localWowData = JSON.parse(localStorage.getItem("bibleWowData_v5") || "{}"); } catch(e) {}
    
    let localWsStars = 0;
    try { localWsStars = parseInt(localStorage.getItem(`bible_stars_v1_${tgUser.id}`) || "0"); } catch(e) {}
    
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
        lastGames: localGamesHistory,
        forceUpdate: false 
      }
    });

    if (res) {
      if (res.isBanned) {
        const menu = document.querySelector(".menu-container");
        if (menu) menu.classList.add("hidden");
        const bannedScreen = document.getElementById("banned-screen");
        if (bannedScreen) bannedScreen.classList.remove("hidden");
        return; // Стоп, пользователь забанен
      }

      // Синхронизация
      localWowData.coins = res.wowStars;
      localStorage.setItem("bibleWowData_v5", JSON.stringify(localWowData));
      localStorage.setItem(`bible_stars_v1_${tgUser.id}`, res.wsStars);
      localStorage.setItem("last_games_history", JSON.stringify(res.lastGames));
      currentUserData.lastGames = res.lastGames;
    }

    // Если это ТЫ - рисуем админку
    if (String(tgUser.id) === ADMIN_ID) {
      renderAdminButton();
    }

  } catch (err) {
    console.error("Critical Init Error:", err);
  } finally {
    // В ЛЮБОМ СЛУЧАЕ убираем экран загрузки
    const loader = document.getElementById("app-loader");
    if (loader) loader.remove();
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
  // Трекинг последних игр
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
    
    history = history.filter(g => g !== gameTitles[gameName]); 
    history.unshift(gameTitles[gameName]); 
    if (history.length > 3) history.pop(); 
    
    localStorage.setItem("last_games_history", JSON.stringify(history));
    currentUserData.lastGames = history;
    
    const tgUser = getTelegramUser();
    let localWowCoins = 20;
    try { localWowCoins = JSON.parse(localStorage.getItem("bibleWowData_v5")||"{}").coins || 20; } catch(e){}
    
    let localWsCoins = 0;
    try { localWsCoins = parseInt(localStorage.getItem(`bible_stars_v1_${tgUser.id}`) || "0"); } catch(e){}

    apiRequest({
      action: "syncUser",
      user: { 
        id: tgUser.id, 
        forceUpdate: true, 
        lastGames: history, 
        wowStars: localWowCoins,
        wsStars: isNaN(localWsCoins) ? 0 : localWsCoins 
      }
    });
  }

  const container = document.getElementById("game-container");
  const menu = document.querySelector(".menu-container");

  if (container) container.innerHTML = "<p class='fade-in'>🔄 Загрузка игры...</p>";
  if (menu) menu.classList.add("hidden");              
  document.body.dataset.mode = "game";                 
  window.scrollTo({ top: 0, behavior: "auto" });       

  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }

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

function goToMainMenu() {
  const container = document.getElementById("game-container");
  const menu = document.querySelector(".menu-container");

  if (container) container.innerHTML = "";
  if (menu) menu.classList.remove("hidden");
  delete document.body.dataset.mode;

  if (window.aliasInterval) clearInterval(window.aliasInterval);
  if (window.coimaginariumInterval) clearInterval(window.coimaginariumInterval);

  try { window.__wsCleanup?.(); } catch {}
  try { window.__wsCleanup = null; } catch {}
  try { window.__sacredWordCleanup?.(); } catch {}
  try { window.__sacredWordCleanup = null; } catch {}

  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }
}

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
  container.innerHTML = "<p class='fade-in' style='padding: 2rem; text-align: center; font-weight: 600;'>⏳ Загрузка базы пользователей...</p>";
  window.scrollTo({ top: 0, behavior: "auto" });

  const res = await apiRequest({ action: "getAdminData", adminId: ADMIN_ID });
  
  if (!res || !res.users) {
    container.innerHTML = "<div style='text-align: center; padding: 2rem;'><p style='color: red; margin-bottom: 1rem;'>❌ Ошибка загрузки админ-панели.</p><button class='back-button' onclick='goToMainMenu()'>Назад</button></div>";
    return;
  }

  let html = `
    <div class="fade-in" style="width:100%; max-width: 500px; text-align:left; padding: 0 10px; margin: 0 auto;">
      <button class="back-button" onclick="goToMainMenu()" style="margin-bottom:1rem; width: auto; padding: 10px 14px;">⬅️ Назад в меню</button>
      <h2 style="color:var(--accent-active); margin-bottom:1.5rem; text-align:center;">Пользователи</h2>
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

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.8rem; margin-bottom:15px;">
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
  
  const toast = document.createElement("div");
  toast.textContent = "Звезды успешно обновлены!";
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
