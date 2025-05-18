// Глобальная переменная для текущего скрипта
let currentGameScript = null;

// Получаем данные пользователя из Telegram
function getTelegramUser() {
  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe) {
    const user = window.Telegram.WebApp.initDataUnsafe.user;
    return {
      username: user.username || "без_ника",
      id: user.id,
      link: user.username ? `https://t.me/ ${user.username}` : "неизвестно"
    };
  }
  return {
    username: "аноним",
    id: "аноним",
    link: "аноним"
  };
}

// Логирование действий игрока
async function logPlayerAction(gameName, action, playerId = "аноним") {
  const LOG_URL = "https://script.google.com/macros/s/ ВАШ_СКРИПТ_ID/exec";

  const payload = {
    game: gameName,
    action: action,
    player: playerId,
    timestamp: new Date().toISOString()
  };

  try {
    await fetch(LOG_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error("Ошибка логирования", e);
  }
}

// Функция загрузки JSON
async function loadJSON(url) {
  const res = await fetch(url);
  return await res.json();
}

// Перемешивание массива
function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

// Показать игру
function showGame(gameName) {
  const container = document.getElementById("game-container");
  container.innerHTML = "<p class='fade-in'>🔄 Загрузка игры...</p>";

  // Скрыть главное меню
  document.querySelector(".menu-container").classList.add("hidden");

  // Удаляем предыдущий скрипт
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }

  if (gameName === "alias") {
    loadGameScript("games/alias.js", () => startAliasGame());
  } else if (gameName === "coimaginarium") {
    const themesUrl = "https://raw.githubusercontent.com/viDaLost/alias-spy-games/main/data/coimaginarium_themes.json ";
    loadGameScript("games/coimaginarium.js", () => startCoimaginariumGame(themesUrl));
  } else if (gameName === "guess") {
    const charsUrl = "https://raw.githubusercontent.com/viDaLost/alias-spy-games/main/data/characters.json ";
    loadGameScript("games/guess-character.js", () => startGuessCharacterGame(charsUrl));
  } else if (gameName === "describe") {
    const wordsUrl = "https://raw.githubusercontent.com/viDaLost/alias-spy-games/main/data/describe_words.json ";
    loadGameScript("games/describe-char.js", () => startDescribeCharacterGame(wordsUrl));
  } else if (gameName === "spy") {
    const locationsUrl = "https://raw.githubusercontent.com/viDaLost/alias-spy-games/main/data/spy_locations.json ";
    loadGameScript("games/spy.js", () => startSpyGame(locationsUrl));
  }
}

// Подключение JS-файла игры
function loadGameScript(fileName, callback) {
  const script = document.createElement("script");
  script.src = fileName;
  script.onload = callback;
  script.onerror = () => {
    alert(`❌ Файл ${fileName} не найден`);
  };
  document.body.appendChild(script);
  currentGameScript = script;
}

// Вернуться в главное меню
function goToMainMenu() {
  const container = document.getElementById("game-container");
  const menu = document.querySelector(".menu-container");

  container.innerHTML = "";
  menu.classList.remove("hidden");

  if (window.aliasInterval) clearInterval(window.aliasInterval);
  if (window.coimaginariumInterval) clearInterval(window.coimaginariumInterval);

  // Очистка текущего скрипта
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }
}
