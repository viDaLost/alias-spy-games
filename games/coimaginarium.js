let coimaginariumThemes = [];
let currentTheme = "";
let currentLetter = "";

let shownThemes = []; // Уже показанные темы
let themesUrlGlobal = ""; // Сохраняем URL для перезапуска

// ✅ Память букв: последние 6 показанных
let recentLetters = [];
const LETTER_COOLDOWN = 6;

function startCoimaginariumGame(themesUrl) {
  themesUrlGlobal = themesUrl;

  fetch(themesUrl)
    .then(res => {
      if (!res.ok) throw new Error(`Ошибка загрузки тем: ${res.status}`);
      return res.json();
    })
    .then(data => {
      coimaginariumThemes = [...data];
      shownThemes = [];
      recentLetters = []; // ✅ сбрасываем при старте заново
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

  // ✅ буква с защитой от повторов
  currentLetter = getRandomLetter();

  coimaginariumThemes.splice(randomIndex, 1);
  shownThemes.push(currentTheme);
}

// ✅ заменяем getRandomLetter на версию с “кулдауном” 6 букв
function getRandomLetter() {
  const letters = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ".split("");

  // Разрешённые буквы: те, которых нет в последних 6
  let available = letters.filter(l => !recentLetters.includes(l));

  // На всякий случай (если вдруг LETTER_COOLDOWN станет слишком большим)
  if (available.length === 0) {
    available = [...letters];
    recentLetters = [];
  }

  const picked = available[Math.floor(Math.random() * available.length)];

  // Запоминаем выбранную букву
  recentLetters.push(picked);
  if (recentLetters.length > LETTER_COOLDOWN) recentLetters.shift();

  return picked;
}

function displayCoimaginariumUI() {
  const container = document.getElementById("game-container");
  container.innerHTML = "<h2>🧠 Соображариум</h2>";

  if (!currentTheme) {
    container.innerHTML += `<div class="card">⚠️ Темы закончились!</div>`;
    container.innerHTML += `<button onclick="goToMainMenu()" class="back-button">⬅️ Вернуться в главное меню</button>`;
    container.innerHTML += `<button onclick="startCoimaginariumGame('${themesUrlGlobal}')" class="menu-button">🔄 Начать заново</button>`;
    return;
  }

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
  // ✅ тоже соблюдаем правило “не повторять в пределах 6”
  currentLetter = getRandomLetter();
  displayCoimaginariumUI();
}

function nextCoimaginariumRound() {
  selectRandomThemeAndLetter();
  displayCoimaginariumUI();
}
