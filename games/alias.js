// === Alias (improved) ===
// Глобальное состояние
let aliasWords = [];        // Слова текущего раунда (перемешанная пачка)
let aliasIndex = 0;         // Индекс текущего слова в aliasWords
let guessedAlias = [];      // Все использованные слова: { word, correct(true/false|null), round }
let currentDifficulty = null;
let currentRound = 1;

let gameActive = false;     // Идёт ли сейчас раунд
let inputLocked = false;    // Защита от дабл-кликов по одному слову
let wordsCache = new Map(); // Кэш слов по сложностям: 'easy'|'medium'|'hard' -> string[]
let abortCtrl = null;       // Для отмены fetch при быстрых переходах

// Восстановление состояния (опционально)
loadState();

// Старт экрана выбора сложности
function startAliasGame() {
  // Полный сброс игры (визуальная «новая партия»)
  if (window.aliasInterval) clearInterval(window.aliasInterval);
  gameActive = false;
  inputLocked = false;

  aliasWords = [];
  aliasIndex = 0;
  guessedAlias = [];
  currentRound = 1;
  currentDifficulty = null;

  const container = document.getElementById("game-container");
  if (!container) return;

  container.innerHTML = `
    <h2>🎮 Алиас</h2>
    <p><strong>Выберите уровень:</strong></p>

    <div style="margin-bottom:15px;">
      <button onclick="loadAliasWords('easy')" class="menu-button">🟢 Лёгкий</button><br>
      <button onclick="loadAliasWords('medium')" class="menu-button">🟡 Средний</button><br>
      <button onclick="loadAliasWords('hard')" class="menu-button">🔴 Тяжёлый</button><br>
    </div>

    <button onclick="goToMainMenu()" class="back-button">⬅️ Вернуться в главное меню</button>
  `;

  // Показать главное меню, если оно есть
  const menu = document.querySelector(".menu-container");
  if (menu) menu.classList.remove("hidden");

  saveState();
}

// Загрузка слов из JSON по уровню с кэшем
async function loadAliasWords(difficulty) {
  currentDifficulty = difficulty;
  const url = urlForDifficulty(difficulty);

  try {
    // Отмена предыдущего запроса, если есть
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();

    if (!wordsCache.has(difficulty)) {
      const words = await loadJSON(url, abortCtrl.signal);
      wordsCache.set(difficulty, Array.isArray(words) ? words : []);
    }

    showAliasSetup(wordsCache.get(difficulty), difficulty);
    saveState();
  } catch (e) {
    alert(`Ошибка загрузки слов: ${e.message}`);
    console.error(e);
  }
}

// Экран настройки времени перед стартом раунда
function showAliasSetup(words, difficulty) {
  const container = document.getElementById("game-container");
  if (!container) return;

  const difficultyName = getDifficultyName(difficulty);

  container.innerHTML = `
    <h2>🎮 Алиас — ${difficultyName} уровень</h2>
    <p><strong>Выберите время (1–60 секунд):</strong></p>
    <input type="number" id="timerValue" min="1" max="60" value="60" class="timer-input">

    <br><br>
    <button onclick="startAliasTimer('${difficulty}')" class="start-button">▶️ Начать игру</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

// Красивое имя сложности
function getDifficultyName(difficulty) {
  return {
    easy: "Лёгкий",
    medium: "Средний",
    hard: "Тяжёлый"
  }[difficulty] || "Неизвестный";
}

// Нормализация строк (для «без повторов»)
function normalize(s) { return String(s || "").trim().toLowerCase(); }

// Отфильтровать уже показанные слова (по нормализованной форме)
function getUnusedWords(allWords, guessedList) {
  const guessedSet = new Set(guessedList.map(item => normalize(item.word)));
  return allWords.filter(word => !guessedSet.has(normalize(word)));
}

// Старт таймера и игрового раунда
async function startAliasTimer(difficulty) {
  if (gameActive) return; // защитимся от повторного старта

  const inputEl = document.getElementById("timerValue");
  if (!inputEl) return;

  let seconds = parseInt(inputEl.value, 10);
  if (isNaN(seconds) || seconds < 1 || seconds > 60) {
    alert("Введите число от 1 до 60.");
    return;
  }

  // Чистим предыдущий интервал если вдруг остался
  if (window.aliasInterval) clearInterval(window.aliasInterval);

  try {
    if (!wordsCache.has(difficulty)) {
      const url = urlForDifficulty(difficulty);
      if (abortCtrl) abortCtrl.abort();
      abortCtrl = new AbortController();
      const words = await loadJSON(url, abortCtrl.signal);
      wordsCache.set(difficulty, Array.isArray(words) ? words : []);
    }

    const allWords = wordsCache.get(difficulty);
    const unusedWords = getUnusedWords(allWords, guessedAlias);

    if (unusedWords.length === 0) {
      showAllWordsShownMessage();
      return;
    }

    aliasWords = shuffleArray(unusedWords);
    aliasIndex = 0;

    const container = document.getElementById("game-container");
    if (!container) return;

    container.innerHTML = `
      <p id="alias-timer">${seconds} секунд</p>
      <div id="alias-left" style="margin-bottom:8px; font-size:0.95rem; opacity:.8;"></div>
      <div id="alias-word" class="card"></div>

      <div style="display:flex; gap:10px; justify-content:center; margin-top:20px;">
        <button onclick="markGuessed(true)" class="correct-button">✅ Отгадано (Enter)</button>
        <button onclick="markGuessed(false)" class="wrong-button">❌ Не отгадано (Backspace)</button>
        <button onclick="skipWord()" class="skip-button">⏭️ Пропустить (Space)</button>
      </div>

      <button onclick="goToMainMenu()" class="back-button" style="margin-top:16px;">⬅️ Главное меню</button>
    `;

    // Первое слово
    showNextAliasWord();
    updateLeftCounter();

    // Состояние игры
    gameActive = true;
    inputLocked = false;

    const timerEl = document.getElementById("alias-timer");

    window.aliasInterval = setInterval(() => {
      if (!gameActive) return;

      seconds--;
      updateTimerUI(timerEl, seconds);

      if (seconds <= 0) {
        endRound(timerEl);
      }
    }, 1000);

    // Шорткаты
    addKeyHandlers();

    saveState();
  } catch (e) {
    alert("Ошибка при начале игры.");
    console.error(e);
  }
}

// Обновление UI таймера
function updateTimerUI(timerEl, seconds) {
  if (!timerEl) return;
  timerEl.textContent = `${seconds} секунд`;
  if (seconds <= 10) timerEl.style.color = "red";
}

// Завершение раунда по времени
function endRound(timerEl) {
  clearInterval(window.aliasInterval);
  window.aliasInterval = null;
  gameActive = false;
  disableAnswerButtons(true);
  if (timerEl) timerEl.textContent = "⏰ Время вышло!";
  // небольшая пауза для UX
  setTimeout(showAliasResults, 300);
}

// Показать следующее слово
function showNextAliasWord() {
  const wordEl = document.getElementById("alias-word");
  if (!wordEl) return;

  if (aliasIndex >= aliasWords.length) {
    // Нет слов — показываем результаты
    gameActive = false;
    disableAnswerButtons(true);
    showAliasResults();
    return;
  }

  // Важно: безопасность. Не вставляем innerHTML с чужими данными.
  wordEl.textContent = aliasWords[aliasIndex];
  aliasIndex++;

  // После показа нового слова можно снова принимать клик
  inputLocked = false;
  disableAnswerButtons(false);
  updateLeftCounter();
}

// Отметить как угаданное / не угаданное
function markGuessed(correct) {
  if (!gameActive || inputLocked || aliasIndex <= 0) return;

  inputLocked = true;
  const word = aliasWords[aliasIndex - 1];
  guessedAlias.push({ word, correct, round: currentRound });
  saveState();

  // Небольшая пауза-анимация (через кадр) — защитит от дабл-клика
  requestAnimationFrame(() => showNextAliasWord());
}

// Пропустить слово (фиксируется как попытка без штрафа)
function skipWord() {
  if (!gameActive || inputLocked || aliasIndex <= 0) return;

  inputLocked = true;
  const word = aliasWords[aliasIndex - 1];
  guessedAlias.push({ word, correct: null, round: currentRound });
  saveState();

  requestAnimationFrame(() => showNextAliasWord());
}

// Вспомогательное: отключить/включить кнопки ответов
function disableAnswerButtons(disabled) {
  document.querySelectorAll('.correct-button, .wrong-button, .skip-button')
    .forEach(btn => { if (btn) btn.disabled = disabled; });
}

// Показ остатков слов
function updateLeftCounter() {
  const leftEl = document.getElementById("alias-left");
  if (!leftEl) return;
  const left = aliasWords.length - aliasIndex;
  leftEl.textContent = `Осталось слов: ${left}`;
}

// Результаты — разбивка по раундам + итого
function showAliasResults() {
  const container = document.getElementById("game-container");
  if (!container) return;

  removeKeyHandlers();

  container.innerHTML = "<h2>🏁 Результаты:</h2>";

  if (guessedAlias.length === 0) {
    container.innerHTML += "<p>Нет результатов. Начните игру снова.</p>";
    container.innerHTML += `<button onclick="startAliasGame()" class="menu-button">🔄 Новая игра</button>`;
    container.innerHTML += `<button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>`;
    return;
  }

  // Группировка по раундам
  const roundsMap = {};
  guessedAlias.forEach(item => {
    if (!roundsMap[item.round]) roundsMap[item.round] = [];
    roundsMap[item.round].push(item);
  });

  const rounds = Object.keys(roundsMap).map(Number).sort((a, b) => a - b);

  let totalYes = 0, totalNo = 0;

  rounds.forEach(round => {
    const items = roundsMap[round];
    const yes = items.filter(x => x.correct === true).length;
    const no  = items.filter(x => x.correct === false).length;
    const skipped = items.filter(x => x.correct === null).length;

    totalYes += yes;
    totalNo  += no;

    container.innerHTML += `<h3>Раунд #${round} — ✅ ${yes} / ❌ ${no}${skipped ? ` / ⏭️ ${skipped}` : ""}</h3><ul>`;
    items.forEach(item => {
      let color = item.correct === true ? "green" : (item.correct === false ? "red" : "gray");
      container.innerHTML += `<li style="color:${color};">${escapeHTML(item.word)}</li>`;
    });
    container.innerHTML += "</ul>";
  });

  container.innerHTML += `<p><strong>Итого: ✅ ${totalYes} / ❌ ${totalNo}</strong>${totalYes+totalNo < guessedAlias.length ? ` (⏭️ пропущено: ${guessedAlias.length - (totalYes+totalNo)})` : ""}</p>`;

  // Кнопки результата
  container.innerHTML += `<button onclick="currentRound++; showAliasSetupWithNewTime(currentDifficulty)" class="menu-button">🔄 Новый раунд</button>`;
  container.innerHTML += `<button onclick="startAliasGame()" class="menu-button">🔘 Выбрать уровень сложности</button>`;
  container.innerHTML += `<button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>`;

  saveState();
}

// Экран нового раунда с тем же уровнем
function showAliasSetupWithNewTime(difficulty) {
  if (!difficulty) {
    startAliasGame();
    return;
  }
  const container = document.getElementById("game-container");
  if (!container) return;

  const difficultyName = getDifficultyName(difficulty);

  container.innerHTML = `
    <h2>🎮 Алиас — ${difficultyName} уровень</h2>
    <p><strong>Выберите время (1–60 секунд):</strong></p>
    <input type="number" id="timerValue" min="1" max="60" value="60" class="timer-input">

    <br><br>
    <button onclick="startAliasTimer('${difficulty}')" class="start-button">▶️ Начать новый раунд</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

// Если все слова были показаны
function showAllWordsShownMessage() {
  const container = document.getElementById("game-container");
  if (!container) return;

  container.innerHTML = `
    <h2>⚠️ Все слова показаны!</h2>
    <p>Можно начать заново или сбросить использованные.</p>
    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <button onclick="startAliasGame()" class="menu-button">🔄 Новая игра</button>
      <button onclick="resetGuessedAndContinue()" class="menu-button">🧹 Сбросить использованные</button>
      <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
    </div>
  `;
}

function resetGuessedAndContinue() {
  guessedAlias = [];
  currentRound = 1;
  saveState();
  if (currentDifficulty) {
    showAliasSetupWithNewTime(currentDifficulty);
  } else {
    startAliasGame();
  }
}

// URL словаря по сложности
function urlForDifficulty(difficulty) {
  return {
    easy: "data/easy_bible_words.json",
    medium: "data/medium_bible_words.json",
    hard: "data/hard_bible_words.json"
  }[difficulty] || "";
}

// Честная перетасовка Фишера–Йетса
function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Безопасная загрузка JSON
async function loadJSON(url, signal) {
  if (!url) throw new Error("Пустой URL словаря");
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`HTTP ошибка: ${res.status}`);
  return await res.json();
}

// Выход в главное меню
function goToMainMenu() {
  if (window.aliasInterval) clearInterval(window.aliasInterval);
  window.aliasInterval = null;
  gameActive = false;
  inputLocked = false;

  aliasWords = [];
  aliasIndex = 0;
  guessedAlias = [];
  currentRound = 1;
  currentDifficulty = null;

  const container = document.getElementById("game-container");
  if (container) container.innerHTML = "";

  const menu = document.querySelector(".menu-container");
  if (menu) menu.classList.remove("hidden");

  saveState();
}

// === Вспомогательные вещи ===

// Экранируем строку для вставки в innerHTML (в результатах)
function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Локальное сохранение прогресса (опционально)
function saveState() {
  try {
    localStorage.setItem("alias_state", JSON.stringify({
      guessedAlias, currentRound, currentDifficulty
    }));
  } catch {}
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem("alias_state"));
    if (s) {
      guessedAlias = Array.isArray(s.guessedAlias) ? s.guessedAlias : [];
      currentRound = Number.isInteger(s.currentRound) ? s.currentRound : 1;
      currentDifficulty = s.currentDifficulty || null;
    }
  } catch {}
}

// Клавиатурные шорткаты: Enter=верно, Backspace=неверно, Space=пропуск
function onKeyDownHandler(e) {
  if (!gameActive) return;
  // Чтобы Space не скроллил страницу
  if (e.code === "Space") e.preventDefault();

  switch (e.code) {
    case "Enter":
      markGuessed(true);
      break;
    case "Backspace":
      markGuessed(false);
      break;
    case "Space":
      skipWord();
      break;
  }
}

function addKeyHandlers() {
  removeKeyHandlers();
  window.addEventListener("keydown", onKeyDownHandler, { passive: false });
}

function removeKeyHandlers() {
  window.removeEventListener("keydown", onKeyDownHandler, { passive: false });
}
