let coimaginariumThemes = [];
let currentTheme = "";
let currentLetter = "";

function startCoimaginariumGame(themesUrl) {
  fetch(themesUrl)
    .then(res => {
      if (!res.ok) throw new Error(`Ошибка загрузки тем: ${res.status}`);
      return res.json();
    })
    .then(themes => {
      coimaginariumThemes = themes;
      selectRandomThemeAndLetter();
      displayCoimaginariumUI();
    })
    .catch(err => {
      alert("Ошибка загрузки тем.");
      console.error(err);
    });
}

function selectRandomThemeAndLetter() {
  currentTheme = coimaginariumThemes[Math.floor(Math.random() * coimaginariumThemes.length)];
  currentLetter = getRandomLetter();
}

function getRandomLetter() {
  const letters = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ".split("");
  return letters[Math.floor(Math.random() * letters.length)];
}

function displayCoimaginariumUI() {
  const container = document.getElementById("game-container");
  container.innerHTML = `
    <h2>🧠 Соображариум</h2>
    <p><strong>Правила:</strong>Ведущийназывает рандомную категорию и букву, игроки вслух называют слово на эту букву по категории, кто первым правильно ответил — получает балл. .</p>

    <p>Тема: <strong>${currentTheme}</strong></p>
    <p>Буква: <strong>${currentLetter}</strong></p>

    <button onclick="changeCoimaginariumLetter()" style="width:100%; padding:15px; font-size:16px; background:#4a90e2; color:white;">🔁 Сменить букву</button>
    <button onclick="nextCoimaginariumRound()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#28a745; color:white;">➡️ Новый раунд</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
  `;
}

function changeCoimaginariumLetter() {
  currentLetter = getRandomLetter();
  displayCoimaginariumUI();
}

function nextCoimaginariumRound() {
  selectRandomThemeAndLetter();
  displayCoimaginariumUI();
}
