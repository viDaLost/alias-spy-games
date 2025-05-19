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
    <p><strong>Правила:</strong> Ведущий называет рандомную категорию и букву. Игроки вслух называют слово на эту букву по категории. Кто первым правильно ответил — получает бал.</p>

    <p>Тема: <strong>${currentTheme}</strong></p>
    <p>Буква: <strong>${currentLetter}</strong></p>

    <button onclick="changeCoimaginariumLetter()" class="menu-button">🔁 Сменить букву</button>
    <button onclick="nextCoimaginariumRound()" class="correct-button">➡️ Новый раунд</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
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
