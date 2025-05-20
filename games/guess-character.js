let guessCharacters = [];
let guessCurrentPlayer = 1;

function startGuessCharacterGame(charsUrl) {
  window.charsUrl = charsUrl; // Сохраняем URL для перезапуска

  fetch(charsUrl)
    .then(res => res.json())
    .then(chars => {
      // Берём два случайных персонажа
      const shuffled = shuffleArray([...chars]);
      guessCharacters = [shuffled[0], shuffled[1]];

      guessCurrentPlayer = 1;
      displayPlayerButton();
    })
    .catch(err => {
      document.getElementById("game-container").innerHTML = `
        <p class="fade-in" style="color:red;">⚠️ Ошибка загрузки персонажей</p>
        <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
      `;
    });
}

// Отображаем кнопку "Показать персонажа"
function displayPlayerButton() {
  const container = document.getElementById("game-container");
  container.innerHTML = "<h2>👥 Угадай персонажа</h2>";

  if (guessCurrentPlayer > guessCharacters.length) {
    container.innerHTML += "<h3>🎉 Все персонажи показаны!</h3>";
    container.innerHTML += `<button onclick="startGuessCharacterGame('${window.charsUrl}')" class="menu-button">🔄 Новая игра</button>`;
    container.innerHTML += `<button onclick="goToMainMenu()" class="back-button">⬅️ Вернуться в главное меню</button>`;
    return;
  }

  container.innerHTML += `
    <p><strong>Игрок ${guessCurrentPlayer}, нажмите ниже, чтобы увидеть свой персонаж:</strong></p>
    <button onclick="revealCharacter()" class="menu-button">👁 Показать персонажа</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

// Показываем слово только при нажатии
function revealCharacter() {
  const container = document.getElementById("game-container");

  const character = guessCharacters[guessCurrentPlayer - 1];

  container.innerHTML = "<h2>👥 Угадай персонажа</h2>";

  container.innerHTML += `
    <div class="card" style="text-align:center;">
      <strong>Игрок ${guessCurrentPlayer}</strong>, ваш персонаж:
      <h3>${character}</h3>
      <small>Опишите его, чтобы второй игрок мог угадать.</small>
    </div>

    <button onclick="nextGuessPlayer()" class="correct-button">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

// Переход к следующему игроку
function nextGuessPlayer() {
  guessCurrentPlayer++;
  displayPlayerButton();
}

// Перемешивание массива
function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}
