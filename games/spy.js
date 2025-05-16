function startSpyGame(locations) {
  const container = document.getElementById("game-container");

  container.innerHTML = `
    <h2>🕵️‍♂️ Игра: Шпион</h2>
    
    <label for="playerCount">Количество игроков (2–25):</label><br>
    <input type="number" id="playerCount" min="2" max="25" value="4"><br><br>

    <label for="spyCount">Количество шпионов (1–N-1):</label><br>
    <input type="number" id="spyCount" min="1" max="24" value="1"><br><br>

    <button onclick="startNewSpyGame(locations)">▶️ Начать игру</button>
    <div id="spy-result"></div>
    <button onclick="goToMainMenu()" style="margin-left:10px;">🏠 Главное меню</button>
  `;
}

function startNewSpyGame(locations) {
  const container = document.getElementById("spy-result");
  const playerCount = parseInt(document.getElementById("playerCount").value);
  const spyCountInput = parseInt(document.getElementById("spyCount").value);

  if (isNaN(playerCount) || playerCount < 2 || playerCount > 25) {
    alert("Введите количество игроков от 2 до 25.");
    return;
  }

  if (isNaN(spyCountInput) || spyCountInput < 1 || spyCountInput >= playerCount) {
    alert(`Количество шпионов должно быть от 1 до ${playerCount - 1}.`);
    return;
  }

  const location = locations[Math.floor(Math.random() * locations.length)];

  // Создаём список игроков
  const players = [];
  for (let i = 0; i < playerCount; i++) {
    players.push({ id: i + 1, role: "мирный" });
  }

  // Перемешиваем
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Назначаем шпионов
  for (let i = 0; i < spyCountInput; i++) {
    shuffled[i].role = "шпион";
  }

  // Показываем карточки всем игрокам
  let resultHTML = `<h3>📍 Локация: ${location}</h3>`;
  resultHTML += "<p>Карточки игроков:</p>";
  resultHTML += "<div class='cards'>";

  shuffled.forEach(player => {
    const content = player.role === "шпион"
      ? "🕵️‍♂️ Вы — шпион"
      : `📍 Локация: ${location}`;

    resultHTML += `
      <div class="card">
        <strong>Игрок ${player.id}</strong><br>
        <small>${content}</small>
      </div>
    `;
  });

  resultHTML += "</div>";
  resultHTML += `<button onclick="startNewSpyGame(locations)">🔄 Новая игра</button>`;
  resultHTML += `<button onclick="goToMainMenu()" style="margin-left:10px;">🏠 Главное меню</button>`;

  container.innerHTML = resultHTML;
}
