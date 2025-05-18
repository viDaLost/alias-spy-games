// Глобальная переменная для текущего скрипта
let currentGameScript = null;

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
  container.innerHTML = "<p>🔄 Загрузка игры...</p>";

  // Скрыть главное меню
  document.querySelector(".menu-container").classList.add("hidden");

  // Удаляем предыдущий скрипт
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }

  if (gameName === "alias") {
    loadGameScript("games/alias.js", () => {
      if (typeof startAliasGame === 'function') {
        startAliasGame();
      } else {
        alert("Функция startAliasGame не найдена!");
        console.error("Функция startAliasGame не определена");
      }
    });
  } else if (gameName === "coimaginarium") {
    const themesUrl = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/coimaginarium_themes.json ";
    loadGameScript("games/coimaginarium.js", () => startCoimaginariumGame(themesUrl));
  } else if (gameName === "guess") {
    const charsUrl = "https://raw.githubusercontent.com/vid алост/alias-spy-games/main/data/characters.json";
    loadGameScript("games/guess-character.js", () => startGuessCharacterGame(charsUrl));
  } else if (gameName === "describe") {
    const wordsUrl = "https://raw.githubusercontent.com/vid алост/alias-spy-games/main/data/describe_words.json";
    loadGameScript("games/describe-char.js", () => startDescribeCharacterGame(wordsUrl));
  } else if (gameName === "spy") {
    const locationsUrl = "https://raw.githubusercontent.com/vid алост/alias-spy-games/main/data/spy_locations.json";
    loadGameScript("games/spy.js", () => startSpyGame(locationsUrl));
  }
}

// Подключение JS-файла игры
function loadGameScript(fileName, callback) {
  const script = document.createElement("script");
  script.src = fileName;
  script.onload = callback;
  script.onerror = () => {
    alert(`Ошибка: файл ${fileName} не найден`);
  };
  document.body.appendChild(script);
  currentGameScript = script;
}

// Вернуться в главное меню
function goToMainMenu() {
  const container = document.getElementById("game-container");
  container.innerHTML = "";

  // Показываем главное меню снова
  document.querySelector(".menu-container").classList.remove("hidden");

  // Очистка таймеров
  if (window.aliasInterval) clearInterval(window.aliasInterval);
  if (window.coimaginariumInterval) clearInterval(window.coimaginariumInterval);

  // Очистка текущего скрипта
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }
}
