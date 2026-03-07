// app.js — лаунчер игр (полноэкранный режим для каждой игры)

// Глобальная переменная для текущего подключённого скрипта игры
let currentGameScript = null;

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

  // ✅ ВОТ ЭТО ДОБАВЛЕНО
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

  // ✅ Теперь отлавливаем ошибки запуска игры, чтобы не было “вечной загрузки”
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

  // ✅ Если файл не загрузился — показываем ошибку на экране (alert в WebView может не работать)
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
