function startGuessCharacterGame(characters) {
  const container = document.getElementById("game-container");
  let char1 = characters[Math.floor(Math.random() * characters.length)];
  let char2 = characters[Math.floor(Math.random() * characters.length)];

  while (char1 === char2) {
    char2 = characters[Math.floor(Math.random() * characters.length)];
  }

  container.innerHTML = `
    <h2>👥 Угадай персонажа</h2>
    <p>Игрок 1: ваш персонаж — <strong>${char1}</strong></p>
    <p>Игрок 2: ваш персонаж — <strong>${char2}</strong></p>
    <p>Обсудите между собой и угадайте персонажа друг друга.</p>
    <button onclick="startGuessCharacterGame(characters)">🔄 Новая игра</button>
    <button onclick="goToMainMenu()">⬅️ Главное меню</button>
  `;
}
