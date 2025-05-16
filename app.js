// Глобальная переменная для хранения текущего скрипта
let currentGameScript = null;

// Функция загрузки JSON
async function loadJSON(url) {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (e) {
    alert("Ошибка загрузки данных: " + e.message);
  }
}

// Показать игру
function showGame(gameName) {
  const container = document.getElementById("game-container");
  container.innerHTML = "<p>Загрузка игры...</p>";

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
    <h2 style="text-align:center;">Добро пожаловать!</h2>
    <p style="text-align:center;">Выберите игру из меню выше.</p>
  `;
}

// Мобильное меню
document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.getElementById("menu-toggle");
  const nav = document.getElementById("main-nav");

  menuToggle.addEventListener("click", () => {
    nav.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target) && !menuToggle.contains(e.target)) {
      nav.classList.remove("open");
    }
  });
});
