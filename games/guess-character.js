let guessCharacters = [];
let guessCurrentPlayer = 1;

function startGuessCharacterGame(charsUrl) {
  fetch(charsUrl)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ошибка: ${res.status}`);
      return res.json();
    })
    .then(chars => {
      guessCharacters = shuffleArray([...chars]);
      guessCurrentPlayer = 1;
      nextGuessPlayer();
    })
    .catch(err => {
      document.getElementById("game-container").innerHTML = `
        <p style="color:red;">⚠️ Ошибка загрузки персонажей: ${err.message}</p>
        <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>
      `;
    });
}

function nextGuessPlayer() {
  const container = document.getElementById("game-container");

  // Очищаем контейнер перед показом нового игрока
  container.innerHTML = `
    <h2>👥 Угадай персонажа</h2>
    <p><strong>Правила:</strong> Один игрок получает имя персонажа. Другой должен угадать его.</p>
  `;

  if (guessCurrentPlayer > guessCharacters.length) {
    container.innerHTML += "<h3>🎉 Все персонажи описаны!</h3>";
    container.innerHTML += `<button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>`;
    return;
  }

  container.innerHTML += `
    <div class="card" style="text-align:center;">
      <strong>Игрок ${guessCurrentPlayer}</strong>, ваш персонаж:
      <h3 style="color:#4a90e2; margin:10px 0;">${guessCharacters[guessCurrentPlayer - 1]}</h3>
      <small>Опишите его, чтобы второй игрок мог угадать.</small>
    </div>
    <button onclick="nextGuessPlayer()" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white; margin-top:10px;">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>
  `;

  guessCurrentPlayer++;
}
