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
  } else {
    if (container) container.innerHTML = "<p>❌ Неизвестная игра.</p>";
  }
}

// Подключение JS-файла игры
function loadGameScript(fileName, callback) {
  const script = document.createElement("script");
  script.src = fileName;
  script.onload = callback;
  script.onerror = () => {
    alert(`❌ Ошибка: файл ${fileName} не найден`);
    console.error(`Файл ${fileName} не загружается`);
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

  // Удаляем подключённый скрипт игры
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }
}
