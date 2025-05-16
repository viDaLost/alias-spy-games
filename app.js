// Глобальные переменные для контента
let currentGameScript = null;
let characters = [];

// Функция загрузки JSON
async function loadJSON(url) {
  const res = await fetch(url);
  return await res.json();
}

// Главная функция выбора игры
function showGame(gameName) {
  const container = document.getElementById("game-container");
  container.innerHTML = "<p>Загрузка...</p>";

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
      characters = chars;
      loadGameScript("guess-character", () => startGuessCharacterGame(chars));
    });
  } else if (gameName === "describe") {
    const url = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/characters.json ";
    loadJSON(url).then(chars => {
      characters = chars;
      loadGameScript("describe-char", () => startDescribeCharacterGame(chars));
    });
  }
}

// Загрузка JS-файла игры
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

// Главное меню
function goToMainMenu() {
  const container = document.getElementById("game-container");
  container.innerHTML = `
    <h2 style="text-align:center;">🎯 Игры для компании</h2>
    <p style="text-align:center;">Выберите игру:</p>
    <nav id="main-nav">
      <button onclick="showGame('alias')">🎮 Алиас</button>
      <button onclick="showGame('spy')">🕵️‍♂️ Шпион</button>
      <button onclick="showGame('guess')">👥 Угадай персонажа</button>
      <button onclick="showGame('describe')">🗣️ Опиши, но не называй</button>
      <button onclick="goToMainMenu()">🏠 Главное меню</button>
    </nav>
  `;
}
