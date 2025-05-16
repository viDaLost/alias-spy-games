function startDescribeCharacterGame(characters) {
  const container = document.getElementById("game-container");

  const players = [
    { name: "Игрок 1", character: getRandomChar(characters) },
    { name: "Игрок 2", character: getRandomChar(characters) },
    { name: "Игрок 3", character: getRandomChar(characters) },
    { name: "Игрок 4", character: getRandomChar(characters) }
  ];

  function getRandomChar(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  container.innerHTML = "<h2>🗣️ Опиши, но не называй</h2>";

  players.forEach(p => {
    container.innerHTML += `
      <div class="card">
        <strong>${p.name}</strong>: ваш персонаж — <em>${p.character}</em><br>
        <small>Опишите его, не называя имени.</small>
      </div>
    `;
  });

  container.innerHTML += `<button onclick="startDescribeCharacterGame(characters)">🔄 Новая игра</button>`;
  container.innerHTML += `<button onclick="goToMainMenu()">⬅️ Главное меню</button>`;
}
