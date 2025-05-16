let coimaginariumThemes = [];
let currentTheme = "";
let currentLetter = "";

// Загрузка тем из JSON
async function loadCoimaginariumThemes(url) {
  const res = await fetch(url);
  coimaginariumThemes = await res.json();
  selectRandomThemeAndLetter();
  showCoimaginariumGame();
}

function selectRandomThemeAndLetter() {
  currentTheme = coimaginariumThemes[Math.floor(Math.random() * coimaginariumThemes.length)];
  currentLetter = getRandomLetter();
}

function getRandomLetter() {
  const letters = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ".split("");
  return letters[Math.floor(Math.random() * letters.length)];
}

function showCoimaginariumGame() {
  const container = document.getElementById("game-container");

  container.innerHTML = `
    <h2>🧠 Соображариум</h2>
    <p><strong>Правила:</strong> Придумайте слово по теме и букве, но не говорите его вслух. Остальные должны догадаться сами.</p>

    <p>Тема: <strong>${currentTheme}</strong></p>
    <p>Буква: <strong>${currentLetter}</strong></p>

    <button onclick="changeCoimaginariumLetter()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#4a90e2; color:white;">🔁 Сменить букву</button>
    <button onclick="nextCoimaginariumRound()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#28a745; color:white;">➡️ Следующий раунд</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
  `;
}

function changeCoimaginariumLetter() {
  currentLetter = getRandomLetter();
  showCoimaginariumGame();
}

function nextCoimaginariumRound() {
  selectRandomThemeAndLetter();
  showCoimaginariumGame();
}
