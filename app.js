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
  container.innerHTML = "<p>Загрузка игры...</p>";

  // Скрыть главное меню
  document.querySelector(".menu-container").classList.add("hidden");

  // Удаляем предыдущий скрипт
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }

  if (gameName === "alias") {
    loadGameScript("alias", () => startAliasGame());
  } else if (gameName === "coimaginarium") {
    const themesUrl = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/coimaginarium_themes.json ";
    loadGameScript("coimaginarium", () => startCoimaginariumGame(themesUrl));
  } else if (gameName === "guess" || gameName === "describe") {
    const charsUrl = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/characters.json ";

    if (gameName === "guess") {
      loadGameScript("guess-character", () => startGuessCharacterGame(charsUrl));
    } else if (gameName === "describe") {
      loadGameScript("describe-char", () => startDescribeCharacterGame(charsUrl));
    }
  }
}

// Подключение JS-файла игры
function loadGameScript(fileName, callback) {
  const script = document.createElement("script");
  script.src = `games/${fileName}.js`;
  script.onload = callback;
  script.onerror = () => {
    alert(`Ошибка: файл ${fileName}.js не найден`);
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
