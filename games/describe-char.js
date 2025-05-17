let describePlayers = [];
let describeIndex = 0;

function startDescribeCharacterGame(charsUrl) {
  fetch(charsUrl)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ошибка: ${res.status}`);
      return res.json();
    })
    .then(chars => {
      describePlayers = shuffleArray([...chars]).slice(0, 4); // только 4 игрока
      describeIndex = 0;
      nextDescribePlayer();
    })
    .catch(err => {
      document.getElementById("game-container").innerHTML = `
        <p style="color:red;">⚠️ Ошибка загрузки персонажей: ${err.message}</p>
        <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>
      `;
    });
}

function nextDescribePlayer() {
  const container = document.getElementById("game-container");
  container.innerHTML = `<h2>🗣️ Опиши, но не называй</h2><p><strong>Правила:</strong> Опишите слово, не называя его.</p>`;

  if (describeIndex >= describePlayers.length) {
    container.innerHTML += "<h3>🎉 Все персонажи описаны!</h3>";
    container.innerHTML += `<button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>`;
    return;
  }

  container.innerHTML += `
    <div class="card" style="text-align:center;">
      <strong>Игрок ${describeIndex + 1}</strong>, ваш персонаж:
      <h3 style="color:#4a90e2; margin:10px 0;">${describePlayers[describeIndex]}</h3>
      <small>Опишите его, чтобы другие догадались.</small>
    </div>
    <button onclick="nextDescribePlayer()" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white; margin-top:10px;">➡️ Следующий игрок</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; background:#6c757d; color:white; margin-top:10px;">⬅️ Главное меню</button>
  `;

  describeIndex++;
}
