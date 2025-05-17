// Глобальные переменные
let currentGameScript = null;

// Показать игру
function showGame(gameName) {
  const container = document.getElementById("game-container");
  if (!container) {
    alert("Ошибка: контейнер игры не найден!");
    return;
  }

  // Скрыть меню
  const menu = document.getElementById("menu-container");
  if (!menu) {
    alert("Ошибка: главное меню не найдено!");
    return;
  }
  menu.style.display = "none";
  container.innerHTML = "<p>Загрузка игры...</p>";

  // Удаляем старый скрипт
  if (currentGameScript) {
    currentGameScript.remove();
    currentGameScript = null;
  }

  // Загружаем новую игру
  if (gameName === "alias") {
    loadGameScript("games/alias.js", () => startAlias());
  } else if (gameName === "coimaginarium") {
    loadGameScript("games/coimaginarium.js", () => startCoimaginarium());
  } else if (gameName === "guess") {
    loadGameScript("games/guess-character.js", () => startGuessCharacter());
  } else if (gameName === "describe") {
    loadGameScript("games/describe-char.js", () => startDescribeCharacter());
  }
}

// Функция загрузки JS-файла
function loadGameScript(path, callback) {
  const script = document.createElement("script");
  script.src = path;
  script.onload = callback;
  script.onerror = () => {
    document.getElementById("game-container").innerHTML = `
      <p style="color:red;">❌ Ошибка загрузки игры.</p>
      <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white;">⬅️ Главное меню</button>
    `;
  };
  document.body.appendChild(script);
  currentGameScript = script;
}

// Показ техподдержки
function showSupport() {
  const menu = document.getElementById("menu-container");
  const container = document.getElementById("game-container");

  if (!menu || !container) {
    alert("Ошибка: элементы интерфейса не найдены.");
    return;
  }

  menu.style.display = "none";
  container.innerHTML = `
    <h2>📞 Техподдержка</h2>
    <p><strong>Если приложение глючит или не отвечает:</strong></p>
    <p>Проверьте своё подключение к интернету. Если проблема не решилась — напишите нам.</p>
    <button onclick="goToTelegram()" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">💬 Написать в Telegram</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
  `;
}

// Возврат в главное меню
function goToMainMenu() {
  const container = document.getElementById("game-container");
  const menu = document.getElementById("menu-container");

  if (!menu || !container) {
    alert("Ошибка: не найдены элементы главного меню или контейнера");
    return;
  }

  container.innerHTML = "";
  menu.style.display = "flex";
}

// Переход в чат Telegram
function goToTelegram() {
  window.open("https://t.me/@D_a_n_Vi"_blank");
}
