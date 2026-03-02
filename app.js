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

  // Удаляем подключённый скрипт игры
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }
}
