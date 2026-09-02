let guessCharacters = [];
let guessCurrentPlayer = 1;

function startGuessCharacterGame(charsUrl) {
  fetch(charsUrl)
    .then(res => res.json())
    .then(chars => {
      // Берём два случайных персонажа
      const shuffled = shuffleArray([...chars]);
      guessCharacters = [shuffled[0], shuffled[1]];

      guessCurrentPlayer = 1;
      nextGuessPlayer();
    })
    .catch(err => {
      document.getElementById("game-container").innerHTML = `
        <p class="fade-in" style="color:red;">⚠️ Ошибка загрузки персонажей: ${err.message}</p>
        <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
      `;
    });
}

// Показываем следующего игрока
function nextGuessPlayer() {
  const container = document.getElementById("game-container");
  container.innerHTML = "<h2>👥 Угадай персонажа</h2>";

  if (guessCurrentPlayer > guessCharacters.length) {
    container.innerHTML += "<h3>🎉 Все персонажи показаны!</h3>";
    container.innerHTML += `<button onclick="startGuessCharacterGame('${window.charsUrl}')" class="menu-button">🔄 Новая игра</button>`;
    container.innerHTML += `<button onclick="goToMainMenu()" class="back-button">⬅️ Вернуться в главное меню</button>`;
    return;
  }

  const character = guessCharacters[guessCurrentPlayer - 1];

  container.innerHTML += `
    <p><strong>Двум игрокам по очереди показываются разные персонажи. Задача — угадать персонажа другого.</strong></p>
    
    <div class="card" style="text-align:center;">
      <strong>Игрок ${guessCurrentPlayer}</strong>, ваш персонаж:
      <h3 style="color:#4a90e2; margin:10px 0;">${character}</h3>
      <small>Опишите его, чтобы второй игрок мог угадать.</small>
    </div>

    <button onclick="nextGuessPlayer()" class="correct-button">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;

  guessCurrentPlayer++;
}
