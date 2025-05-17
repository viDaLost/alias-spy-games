let describePlayers = [];
let describeIndex = 0;

function startDescribeCharacterGame(charsUrl) {
  fetch(charsUrl)
    .then(res => {
      if (!res.ok) throw new Error(`Сетевой ответ: ${res.status}`);
      return res.json();
    })
    .then(chars => {
      describePlayers = shuffleArray([...chars]).slice(0, 4); // 4 игрока
      describeIndex = 0;
      nextDescribePlayer();
    })
    .catch(err => {
      alert("Ошибка загрузки персонажей.");
      console.error(err);
    });
}

function nextDescribePlayer() {
  const card = document.getElementById("describe-card");

  if (describeIndex >= describePlayers.length) {
    card.innerHTML = "<h3>🎉 Все персонажи описаны!</h3>";
    return;
  }

  card.innerHTML = `
    <div class="card" style="text-align:center;">
      <strong>Игрок ${describeIndex + 1}</strong>, ваш персонаж:
      <h3 style="color:#4a90e2; margin:10px 0;">${describePlayers[describeIndex]}</h3>
      <small>Опишите его, чтобы другие догадались.</small>
    </div>
  `;

  describeIndex++;
}
