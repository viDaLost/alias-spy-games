let guessCharacters = [];
let guessCurrentPlayer = 1;
let currentCharsUrl = null; // Сохраняем URL для перезапуска

function startGuessCharacterGame(charsUrl) {
  currentCharsUrl = charsUrl; // Сохраняем URL для перезапуска

  fetch(charsUrl)
    .then(res => res.json())
    .then(chars => {
      // Берём все персонажи и перемешиваем их
      const shuffled = shuffleArray([...chars]);
      guessCharacters = shuffled;

      guessCurrentPlayer = 1;
      displayPlayerButton();
    })
    .catch(err => {
      document.getElementById("game-container").innerHTML = `
        <p class="fade-in" style="color:red;">⚠️ Ошибка загрузки персонажей</p>
        <button onclick="goToMainMenu()" class="back-button">⬅️ Вернуться в главное меню</button>
      `;
    });
}

// Отображаем кнопку "Показать персонажа"
function displayPlayerButton() {
  const container = document.getElementById("game-container");
  container.innerHTML = "<h2>👥 Угадай персонажа</h2>";

  if (guessCurrentPlayer > guessCharacters.length) {
    container.innerHTML += `
      <h3>⚠️ Все персонажи показаны!</h3>
      <p>Перейдите в главное меню, чтобы начать заново.</p>
      <button onclick="goToMainMenu()" class="menu-button">⬅️ Главное меню</button>
    `;
    return;
  }

  container.innerHTML += `
    <p><strong>Игрок ${guessCurrentPlayer}, нажмите ниже, чтобы увидеть своего персонажа:</strong></p>
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
      <small>Опишите его, чтобы другой игрок мог угадать.</small>
    </div>

    <button onclick="nextGuessPlayer()" class="correct-button">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;

  guessCurrentPlayer++;
}

// Переход к следующему игроку
function nextGuessPlayer() {
  displayPlayerButton();
}

// Перемешивание массива
function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}
