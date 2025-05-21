let coimaginariumThemes = [];
let currentTheme = "";
let currentLetter = "";

let shownThemes = []; // Уже показанные темы
let themesUrlGlobal = ""; // Сохраняем URL для перезапуска

function startCoimaginariumGame(themesUrl) {
  themesUrlGlobal = themesUrl;

  fetch(themesUrl)
    .then(res => {
      if (!res.ok) throw new Error(`Ошибка загрузки тем: ${res.status}`);
      return res.json();
    })
    .then(data => {
      coimaginariumThemes = [...data]; // Копируем список тем
      shownThemes = []; // Очищаем предыдущие
      selectRandomThemeAndLetter();
      displayCoimaginariumUI();
    })
    .catch(err => {
      alert("Ошибка загрузки тем.");
      console.error(err);
    });
}

function selectRandomThemeAndLetter() {
  if (coimaginariumThemes.length === 0) {
    currentTheme = null;
    return;
  }

  const randomIndex = Math.floor(Math.random() * coimaginariumThemes.length);
  currentTheme = coimaginariumThemes[randomIndex];
  currentLetter = getRandomLetter();

  // Убираем текущую тему из списка, чтобы не повторялась
  coimaginariumThemes.splice(randomIndex, 1);
  shownThemes.push(currentTheme);
}

function getRandomLetter() {
  const letters = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ".split("");
  return letters[Math.floor(Math.random() * letters.length)];
}

function displayCoimaginariumUI() {
  const container = document.getElementById("game-container");
  container.innerHTML = "<h2>🧠 Соображариум</h2>";

  if (!currentTheme) {
    // Все темы показаны
    container.innerHTML += `<div class="card">⚠️ Темы закончились!</div>`;
    container.innerHTML += `<button onclick="goToMainMenu()" class="back-button">⬅️ Вернуться в главное меню</button>`;
    container.innerHTML += `<button onclick="startCoimaginariumGame('${themesUrlGlobal}')" class="menu-button">🔄 Начать заново</button>`;
    return;
  }

  // Отображаем раунд с выделением темы и буквы
  container.innerHTML += `
    <p><strong>Правила:</strong> Ведущий называет рандомную категорию и букву. Игроки вслух называют слово на эту букву по категории. Кто первым правильно ответил — получает бал.</p>

    <div class="theme-letter">
      <strong>Тема:</strong> ${currentTheme}<br>
      <strong>Буква:</strong> ${currentLetter}
    </div>

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
