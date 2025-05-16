let coimaginariumThemes = [
  "Животные",
  "Еда",
  "Транспорт",
  "Фильмы",
  "Музыкальные инструменты",
  "Цвета",
  "Имена",
  "Города",
  "Профессии",
  "Эмоции"
];

let coimaginariumLetters = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯ".split("");

let currentTheme = "";
let currentLetter = "";
let coimaginariumSubmitted = false;

function startCoimaginariumGame() {
  const container = document.getElementById("game-container");

  // Случайная тема и буква
  currentTheme = coimaginariumThemes[Math.floor(Math.random() * coimaginariumThemes.length)];
  currentLetter = coimaginariumLetters[Math.floor(Math.random() * coimaginariumLetters.length)];

  coimaginariumSubmitted = false;

  container.innerHTML = `
    <h2>🧠 Соображариум</h2>
    <p><strong>Правила:</strong> Придумайте слово по заданным теме и букве быстрее других игроков.</p>

    <p>Тема: <strong>${currentTheme}</strong></p>
    <p>Буква: <strong>${currentLetter}</strong></p>

    <input type="text" id="coimaginarium-answer" placeholder="Ваш ответ" style="width:100%; padding:10px; font-size:16px;" />
    <button onclick="submitCoimaginariumAnswer()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#28a745; color:white;">✅ Отправить</button>
    <button onclick="nextCoimaginariumRound()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#4a90e2; color:white;">➡️ Следующий раунд</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
  `;
}

function submitCoimaginariumAnswer() {
  const answer = document.getElementById("coimaginarium-answer").value.trim();

  if (!answer) {
    alert("Введите ваш ответ!");
    return;
  }

  if (answer[0].toUpperCase() !== currentLetter.toUpperCase()) {
    alert(`Слово должно начинаться на "${currentLetter}"`);
    return;
  }

  coimaginariumSubmitted = true;
  alert("✅ Ваш ответ принят!");
}

function nextCoimaginariumRound() {
  if (!coimaginariumSubmitted) {
    alert("Вы не отправили ответ!");
    return;
  }

  const container = document.getElementById("game-container");

  // Сброс текущего раунда
  currentTheme = coimaginariumThemes[Math.floor(Math.random() * coimaginariumThemes.length)];
  currentLetter = coimaginariumLetters[Math.floor(Math.random() * coimaginariumLetters.length)];
  coimaginariumSubmitted = false;

  container.innerHTML = `
    <h2>🧠 Соображариум</h2>
    <p><strong>Правила:</strong> Придумайте слово по заданным теме и букве быстрее других.</p>

    <p>Тема: <strong>${currentTheme}</strong></p>
    <p>Буква: <strong>${currentLetter}</strong></p>

    <input type="text" id="coimaginarium-answer" placeholder="Ваш ответ" style="width:100%; padding:10px; font-size:16px;" />
    <button onclick="submitCoimaginariumAnswer()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#28a745; color:white;">✅ Отправить</button>
    <button onclick="nextCoimaginariumRound()" style="width:100%; padding:15px; font-size:16px; margin-top:10px;">➡️ Следующий раунд</button>
    <button onclick="goToMainMenu()" style="width:100%; padding:15px; font-size:16px; margin-top:10px; background:#6c757d; color:white;">⬅️ Главное меню</button>
  `;
}
