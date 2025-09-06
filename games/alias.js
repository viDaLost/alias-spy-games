// games/alias.js — Alias (улучшенный, безопасный, «полноэкранный»)

// === Глобальное состояние Alias ===
let aliasWords = [];        // слова текущего раунда
let aliasIndex = 0;         // индекс текущего слова
let guessedAlias = [];      // { word, correct(true/false|null), round }
let currentDifficulty = null;
let currentRound = 1;

let gameActive = false;     // идёт ли раунд
let inputLocked = false;    // защита от дабл-кликов
let wordsCache = new Map(); // 'easy'|'medium'|'hard' -> string[]
let abortCtrl = null;       // AbortController для fetch

// Восстановление состояния (опционально)
aliasLoadState();

// Стартовый экран выбора сложности (не показываем меню тут!)
function startAliasGame() {
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

  // ВАЖНО: меню НЕ показываем, игра — отдельный экран.
  const menu = document.querySelector(".menu-container");
  if (menu) menu.classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "auto" });

  aliasSaveState();
}

// Загрузка слов по уровню с кэшем
async function loadAliasWords(difficulty) {
  currentDifficulty = difficulty;
  const url = aliasUrlForDifficulty(difficulty);

  try {
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();

    if (!wordsCache.has(difficulty)) {
      const words = await aliasLoadJSON(url, abortCtrl.signal);
      wordsCache.set(difficulty, Array.isArray(words) ? words : []);
    }

    aliasShowSetup(wordsCache.get(difficulty), difficulty);
    aliasSaveState();
  } catch (e) {
    alert(`Ошибка загрузки слов: ${e.message}`);
    console.error(e);
  }
}

// Экран настройки времени
function aliasShowSetup(words, difficulty) {
  const container = document.getElementById("game-container");
  if (!container) return;

  const difficultyName = aliasGetDifficultyName(difficulty);

  container.innerHTML = `
    <h2>🎮 Алиас — ${difficultyName} уровень</h2>
    <p><strong>Выберите время (1–60 секунд):</strong></p>
    <input type="number" id="timerValue" min="1" max="60" value="60" class="timer-input">

    <br><br>
    <button onclick="startAliasTimer('${difficulty}')" class="start-button">▶️ Начать игру</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

function aliasGetDifficultyName(difficulty) {
  return {
    easy: "Лёгкий",
    medium: "Средний",
    hard: "Тяжёлый"
  }[difficulty] || "Неизвестный";
}

// Нормализация (для «без повторов»)
function aliasNormalize(s) { return String(s || "").trim().toLowerCase(); }

function aliasGetUnusedWords(allWords, guessedList) {
  const guessedSet = new Set(guessedList.map(item => aliasNormalize(item.word)));
  return allWords.filter(word => !guessedSet.has(aliasNormalize(word)));
}

// Старт таймера и раунда
async function startAliasTimer(difficulty) {
  if (gameActive) return;

  const inputEl = document.getElementById("timerValue");
  if (!inputEl) return;

  let seconds = parseInt(inputEl.value, 10);
  if (isNaN(seconds) || seconds < 1 || seconds > 60) {
    alert("Введите число от 1 до 60.");
    return;
  }

  if (window.aliasInterval) clearInterval(window.aliasInterval);

  try {
    if (!wordsCache.has(difficulty)) {
      const url = aliasUrlForDifficulty(difficulty);
      if (abortCtrl) abortCtrl.abort();
      abortCtrl = new AbortController();
      const words = await aliasLoadJSON(url, abortCtrl.signal);
      wordsCache.set(difficulty, Array.isArray(words) ? words : []);
    }

    const allWords = wordsCache.get(difficulty);
    const unusedWords = aliasGetUnusedWords(allWords, guessedAlias);

    if (unusedWords.length === 0) {
      aliasShowAllWordsMessage();
      return;
    }

    aliasWords = aliasShuffle(unusedWords);
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
        <button onclick="aliasSkipWord()" class="skip-button">⏭️ Пропустить (Space)</button>
      </div>

      <button onclick="goToMainMenu()" class="back-button" style="margin-top:16px;">⬅️ Главное меню</button>
    `;

    aliasShowNextWord();
    aliasUpdateLeftCounter();

    gameActive = true;
    inputLocked = false;

    const timerEl = document.getElementById("alias-timer");

    window.aliasInterval = setInterval(() => {
      if (!gameActive) return;

      seconds--;
      aliasUpdateTimerUI(timerEl, seconds);

      if (seconds <= 0) {
        aliasEndRound(timerEl);
      }
    }, 1000);

    aliasAddKeyHandlers();
    aliasSaveState();
  } catch (e) {
    alert("Ошибка при начале игры.");
    console.error(e);
  }
}

// UI таймера
function aliasUpdateTimerUI(timerEl, seconds) {
  if (!timerEl) return;
  timerEl.textContent = `${seconds} секунд`;
  if (seconds <= 10) timerEl.style.color = "red";
}

// Завершение раунда
function aliasEndRound(timerEl) {
  clearInterval(window.aliasInterval);
  window.aliasInterval = null;
  gameActive = false;
  aliasDisableAnswerButtons(true);
  if (timerEl) timerEl.textContent = "⏰ Время вышло!";
  setTimeout(aliasShowResults, 300);
}

// Следующее слово (безопасно через textContent)
function aliasShowNextWord() {
  const wordEl = document.getElementById("alias-word");
  if (!wordEl) return;

  if (aliasIndex >= aliasWords.length) {
    gameActive = false;
    aliasDisableAnswerButtons(true);
    aliasShowResults();
    return;
  }

  wordEl.textContent = aliasWords[aliasIndex];
  aliasIndex++;

  inputLocked = false;
  aliasDisableAnswerButtons(false);
  aliasUpdateLeftCounter();
}

// Пометка результата
function markGuessed(correct) {
  if (!gameActive || inputLocked || aliasIndex <= 0) return;

  inputLocked = true;
  const word = aliasWords[aliasIndex - 1];
  guessedAlias.push({ word, correct, round: currentRound });
  aliasSaveState();

  requestAnimationFrame(() => aliasShowNextWord());
}

// Пропуск
function aliasSkipWord() {
  if (!gameActive || inputLocked || aliasIndex <= 0) return;

  inputLocked = true;
  const word = aliasWords[aliasIndex - 1];
  guessedAlias.push({ word, correct: null, round: currentRound });
  aliasSaveState();

  requestAnimationFrame(() => aliasShowNextWord());
}

// Блокировка кнопок
function aliasDisableAnswerButtons(disabled) {
  document.querySelectorAll('.correct-button, .wrong-button, .skip-button')
    .forEach(btn => { if (btn) btn.disabled = disabled; });
}

// Осталось слов
function aliasUpdateLeftCounter() {
  const leftEl = document.getElementById("alias-left");
  if (!leftEl) return;
  const left = aliasWords.length - aliasIndex;
  leftEl.textContent = `Осталось слов: ${left}`;
}

// Результаты
function aliasShowResults() {
  const container = document.getElementById("game-container");
  if (!container) return;

  aliasRemoveKeyHandlers();

  container.innerHTML = "<h2>🏁 Результаты:</h2>";

  if (guessedAlias.length === 0) {
    container.innerHTML += "<p>Нет результатов. Начните игру снова.</p>";
    container.innerHTML += `<button onclick="startAliasGame()" class="menu-button">🔄 Новая игра</button>`;
    container.innerHTML += `<button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>`;
    return;
  }

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
      const color = item.correct === true ? "green" : (item.correct === false ? "red" : "gray");
      container.innerHTML += `<li style="color:${color};">${aliasEscapeHTML(item.word)}</li>`;
    });
    container.innerHTML += "</ul>";
  });

  container.innerHTML += `<p><strong>Итого: ✅ ${totalYes} / ❌ ${totalNo}</strong>${totalYes+totalNo < guessedAlias.length ? ` (⏭️ пропущено: ${guessedAlias.length - (totalYes+totalNo)})` : ""}</p>`;

  container.innerHTML += `<button onclick="currentRound++; aliasShowSetupWithNewTime(currentDifficulty)" class="menu-button">🔄 Новый раунд</button>`;
  container.innerHTML += `<button onclick="startAliasGame()" class="menu-button">🔘 Выбрать уровень сложности</button>`;
  container.innerHTML += `<button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>`;

  aliasSaveState();
}

// Новый раунд с тем же уровнем
function aliasShowSetupWithNewTime(difficulty) {
  if (!difficulty) { startAliasGame(); return; }
  const container = document.getElementById("game-container");
  if (!container) return;

  const difficultyName = aliasGetDifficultyName(difficulty);

  container.innerHTML = `
    <h2>🎮 Алиас — ${difficultyName} уровень</h2>
    <p><strong>Выберите время (1–60 секунд):</strong></p>
    <input type="number" id="timerValue" min="1" max="60" value="60" class="timer-input">

    <br><br>
    <button onclick="startAliasTimer('${difficulty}')" class="start-button">▶️ Начать новый раунд</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

// Когда все слова исчерпаны
function aliasShowAllWordsMessage() {
  const container = document.getElementById("game-container");
  if (!container) return;

  container.innerHTML = `
    <h2>⚠️ Все слова показаны!</h2>
    <p>Можно начать заново или сбросить использованные.</p>
    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <button onclick="startAliasGame()" class="menu-button">🔄 Новая игра</button>
      <button onclick="aliasResetGuessedAndContinue()" class="menu-button">🧹 Сбросить использованные</button>
      <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
    </div>
  `;
}

function aliasResetGuessedAndContinue() {
  guessedAlias = [];
  currentRound = 1;
  aliasSaveState();
  if (currentDifficulty) {
    aliasShowSetupWithNewTime(currentDifficulty);
  } else {
    startAliasGame();
  }
}

// URL словарей
function aliasUrlForDifficulty(difficulty) {
  return {
    easy: "data/easy_bible_words.json",
    medium: "data/medium_bible_words.json",
    hard: "data/hard_bible_words.json"
  }[difficulty] || "";
}

// Перетасовка Фишера–Йетса
function aliasShuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Загрузка JSON (с AbortController)
async function aliasLoadJSON(url, signal) {
  if (!url) throw new Error("Пустой URL словаря");
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`HTTP ошибка: ${res.status}`);
  return await res.json();
}

// Экранирование для безопасной вставки в innerHTML (список результатов)
function aliasEscapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Сохранение/загрузка состояния Alias
function aliasSaveState() {
  try {
    localStorage.setItem("alias_state", JSON.stringify({
      guessedAlias, currentRound, currentDifficulty
    }));
  } catch {}
}

function aliasLoadState() {
  try {
    const s = JSON.parse(localStorage.getItem("alias_state"));
    if (s) {
      guessedAlias = Array.isArray(s.guessedAlias) ? s.guessedAlias : [];
      currentRound = Number.isInteger(s.currentRound) ? s.currentRound : 1;
      currentDifficulty = s.currentDifficulty || null;
    }
  } catch {}
}

// Клавиатурные шорткаты: Enter, Backspace, Space
function aliasKeydownHandler(e) {
  if (!gameActive) return;
  if (e.code === "Space") e.preventDefault();
  switch (e.code) {
    case "Enter":     markGuessed(true); break;
    case "Backspace": markGuessed(false); break;
    case "Space":     aliasSkipWord(); break;
  }
}

function aliasAddKeyHandlers() {
  aliasRemoveKeyHandlers();
  window.addEventListener("keydown", aliasKeydownHandler, { passive: false });
}

function aliasRemoveKeyHandlers() {
  window.removeEventListener("keydown", aliasKeydownHandler, { passive: false });
}
