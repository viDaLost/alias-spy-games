// Глобальная переменная для текущего скрипта
let currentGameScript = null;

// Функция загрузки JSON
async function loadJSON(url) {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (e) {
    alert("Ошибка загрузки данных: " + e.message);
    console.error(e);
  }
}

// Перемешивание массива
function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

// Показать игру
function showGame(gameName) {
  const container = document.getElementById("game-container");
  const menu = document.getElementById("menu-container");

  if (!container || !menu) {
    alert("Ошибка: контейнер игр или меню не найден.");
    return;
  }

  // Скрыть главное меню
  menu.style.display = "none";
  container.innerHTML = "<p>🔄 Загрузка игры...</p>";

  // Удаляем предыдущий скрипт, если он был
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }

  // Загружаем нужную игру
  if (gameName === "alias") {
    loadGameScript("games/alias.js", () => startAliasGame());
  } else if (gameName === "coimaginarium") {
    const themesUrl = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/coimaginarium_themes.json ";
    loadGameScript("games/coimaginarium.js", () => startCoimaginariumGame(themesUrl));
  } else if (gameName === "guess") {
    const charsUrl = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/characters.json ";
    loadGameScript("games/guess-character.js", () => startGuessCharacterGame(charsUrl));
  } else if (gameName === "describe") {
    const wordsUrl = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/describe_words.json ";
    loadGameScript("games/describe-char.js", () => startDescribeCharacterGame(wordsUrl));
  }
}

// Подключение JS-файла игры
function loadGameScript(fileName, callback) {
  const script = document.createElement("script");
  script.src = fileName;
  script.onload = callback;
  script.onerror = () => {
    const container = document.getElementById("game-container");
    container.innerHTML = `
      <p style="color:red;">❌ Ошибка: файл ${fileName} не найден</p>
      <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white;">⬅️ Главное меню</button>
    `;
  };
  document.body.appendChild(script);
  currentGameScript = script;
}

// Кнопка техподдержки — сразу открывает чат в Telegram
function openTelegram() {
  window.open("https://t.me/@D_a_n_Vi, "_blank");
}

// Вернуться в главное меню
function goToMainMenu() {
  const container = document.getElementById("game-container");
  const menu = document.getElementById("menu-container");

  if (!container || !menu) {
    alert("Ошибка: элементы интерфейса не найдены.");
    return;
  }

  // Очистка таймеров
  if (window.aliasInterval) clearInterval(window.aliasInterval);
  if (window.coimaginariumInterval) clearInterval(window.coimaginariumInterval);

  // Очистка текущего скрипта
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }

  // Очистка контейнера и показ главного меню
  container.innerHTML = "";
  menu.style.display = "flex";
}
