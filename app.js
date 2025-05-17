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

  // Скрыть главное меню через класс
  document.querySelector(".menu-container").classList.add("hidden");

  // Удаляем предыдущий скрипт, если он был
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }

  // Загружаем нужную игру
  if (gameName === "alias") {
    loadGameScript("alias", () => startAliasGame());
  } else if (gameName === "coimaginarium") {
    const themesUrl = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/coimaginarium_themes.json ";
    loadGameScript("coimaginarium", () => startCoimaginariumGame(themesUrl));
  } else if (gameName === "guess") {
    const charsUrl = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/characters.json ";
    loadGameScript("guess-character", () => startGuessCharacterGame(charsUrl));
  } else if (gameName === "describe") {
    const wordsUrl = "https://raw.githubusercontent.com/vidalost/alias-spy-games/main/data/describe_words.json ";
    loadGameScript("describe-char", () => startDescribeCharacterGame(wordsUrl));
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

// Открытие формы техподдержки
function openSupport() {
  const menu = document.querySelector(".menu-container");
  const container = document.getElementById("game-container");

  // Скрываем главное меню
  menu.classList.add("hidden");

  // Показываем окно техподдержки
  container.innerHTML = `
    <h2>📞 Техподдержка</h2>
    <p><strong>Если приложение глючит или не отвечает:</strong></p>
    <p>Проверьте своё подключение к интернету, после чего нажмите на три точки с права в верхнем углу, потом нажмите на кнопку обнавить страницу.Если проблема не решилась — напишите нам.</p>

    <button onclick="goToTelegram()" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">💬 Написать в Telegram</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
  `;
}

// Переход в чат Telegram
function goToTelegram() {
  window.open("https://t.me/@D_a_n_Vi"_blank");
}

// Вернуться в главное меню
function goToMainMenu() {
  const container = document.getElementById("game-container");
  const menu = document.querySelector(".menu-container");

  // Очистка таймеров
  if (window.aliasInterval) clearInterval(window.aliasInterval);
  if (window.coimaginariumInterval) clearInterval(window.coimaginariumInterval);

  // Очистка текущего скрипта
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }

  // Очистка контейнера игр
  container.innerHTML = "";

  // Показываем главное меню
  menu.classList.remove("hidden");
}
