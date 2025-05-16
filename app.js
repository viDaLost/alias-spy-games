// Глобальная переменная для текущего скрипта
let currentGameScript = null;

// Функция загрузки JSON
async function loadJSON(url) {
  const res = await fetch(url);
  return await res.json();
}

// Показать игру
function showGame(gameName) {
  const container = document.getElementById("game-container");
  container.innerHTML = "<p>Загрузка...</p>";

  // Скрыть главное меню
  document.querySelector(".menu").style.display = "none";

  // Удаляем старый скрипт
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }

  if (gameName === "alias") {
    const url = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/alias_words.json ";
    loadJSON(url).then(words => {
      loadGameScript("alias", () => startAliasGame(words));
    });
  } else if (gameName === "spy") {
    const url = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/spy_locations.json ";
    loadJSON(url).then(locations => {
      loadGameScript("spy", () => startSpyGame(locations));
    });
  } else if (gameName === "guess") {
    const url = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/characters.json ";
    loadJSON(url).then(chars => {
      loadGameScript("guess-character", () => startGuessCharacterGame(chars));
    });
  } else if (gameName === "describe") {
    const url = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/characters.json ";
    loadJSON(url).then(chars => {
      loadGameScript("describe-char", () => startDescribeCharacterGame(chars));
    });
  }
}

// Подключение JS-файла
function loadGameScript(fileName, callback) {
  const script = document.createElement("script");
  script.src = `games/${fileName}.js`;
  script.onload = callback;
  script.onerror = () => {
    alert(`Ошибка: файл ${fileName}.js не найден!`);
  };
  document.body.appendChild(script);
  currentGameScript = script;
}

// Вернуться в главное меню
function goToMainMenu() {
  const container = document.getElementById("game-container");
  container.innerHTML = "";
  document.querySelector(".menu").style.display = "block";

  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }
}
