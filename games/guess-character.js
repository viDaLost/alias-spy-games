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
      const container = document.getElementById("game-container");
      container.innerHTML = `<p style="color:red;">⚠️ Ошибка загрузки персонажей: ${err.message}</p>`;
      container.innerHTML += `<button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>`;
    });
}

function nextGuessPlayer() {
  const card = document.getElementById("guess-player-card");

  if (guessCurrentPlayer > guessCharacters.length) {
    card.innerHTML = "<h3>🎉 Все персонажи описаны!</h3>";
    return;
  }

  card.innerHTML = `
    <div class="card" style="text-align:center;">
      <strong>Игрок ${guessCurrentPlayer}</strong>, ваш персонаж:
      <h3 style="color:#4a90e2; margin:10px 0;">${guessCharacters[guessCurrentPlayer - 1]}</h3>
      <small>Опишите его, чтобы второй игрок мог угадать.</small>
    </div>
  `;

  guessCurrentPlayer++;
}
