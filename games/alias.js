// games/alias.js — Alias (улучшенный, безопасный, «полноэкранный»)

// === Глобальное состояние Alias ===
let aliasWords = [];        // слова текущего раунда
let aliasIndex = 0;         // индекс текущего слова
let guessedAlias = [];      // { word, correct(true/false|null), round, team }
let currentDifficulty = null;
let currentRound = 1;

let gameActive = false;     // идёт ли раунд
let inputLocked = false;    // защита от дабл-кликов
let wordsCache = new Map(); // 'easy'|'medium'|'hard' -> string[]
let abortCtrl = null;       // AbortController для fetch

// --- Новое: команды и очки ---
let teamCount = 2;          // от 1 до 5
let currentTeam = 1;        // активная команда в раунде
let teamScores = {};        // {1:0,2:0,...}
let lastTimerSeconds = 60;  // запоминаем длительность для «начать раунд заново»

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

  // Сброс команд по умолчанию
  if (!Number.isInteger(teamCount) || teamCount < 1 || teamCount > 5) teamCount = 2;
  currentTeam = 1;
  aliasInitTeamScores();

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

// Экран настройки времени и команд
function aliasShowSetup(words, difficulty) {
  const container = document.getElementById("game-container");
  if (!container) return;

  const difficultyName = aliasGetDifficultyName(difficulty);

  container.innerHTML = `
    <h2>🎮 Алиас — ${difficultyName} уровень</h2>

    <div class="setup-grid" style="display:grid; gap:12px; grid-template-columns:1fr; max-width:520px;">
      <div>
        <p><strong>Выберите время (1–180 сек):</strong></p>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input type="number" id="timerValue" min="1" max="180" value="${lastTimerSeconds}" class="timer-input" style="width:120px;">
          <button class="chip" onclick="aliasPreset(30)">30 сек</button>
          <button class="chip" onclick="aliasPreset(60)">60 сек</button>
          <button class="chip" onclick="aliasPreset(90)">1 мин 30 сек</button>
        </div>
      </div>

      <div>
        <p><strong>Количество команд:</strong></p>
        <select id="teamCountSelect" class="timer-input" style="width:160px;">
          ${[1,2,3,4,5].map(n=>`<option value="${n}" ${n===teamCount?"selected":""}>${n}</option>`).join("")}
        </select>
      </div>
    </div>

    <br>
    <button onclick="startAliasTimer('${difficulty}')" class="start-button">▶️ Начать игру</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
}

function aliasPreset(sec){
  const el = document.getElementById('timerValue');
  if (el){ el.value = sec; lastTimerSeconds = sec; aliasSaveState(); }
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

function aliasInitTeamScores(){
  teamScores = {};
  for (let i=1;i<=Math.max(1,Math.min(5,teamCount));i++) teamScores[i] = 0;
}

function aliasScoreboardHTML(){
  return `<div id="alias-scoreboard" class="scoreboard" style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin:6px 0 10px;">
    ${Object.keys(teamScores).map(k=>`<span class="badge">Команда ${k}: <strong>${teamScores[k]}</strong></span>`).join("")}
  </div>`;
}

function aliasRenderActiveTeamControls(){
  return `<div style="display:flex; gap:8px; justify-content:center; align-items:center; margin:8px 0 6px;">
    <span class="badge" id="alias-active-team">Текущая команда: <strong>${currentTeam}</strong></span>
    ${teamCount>1?`<button class="chip" onclick="aliasNextTeam()">⏭️ Следующая команда</button>`:""}
    ${teamCount>1?`<select id="alias-team-select" class="timer-input" style="width:120px;" onchange="aliasChangeTeamBySelect(this.value)">
      ${Array.from({length:teamCount},(_,i)=>i+1).map(n=>`<option ${n===currentTeam?"selected":""} value="${n}">${n}</option>`).join("")}
    </select>`:""}
  </div>`;
}

function aliasNextTeam(){
  currentTeam = ((currentTeam % teamCount) || 0) + 1;
  const el = document.getElementById('alias-active-team');
  if (el) el.innerHTML = `Текущая команда: <strong>${currentTeam}</strong>`;
  const sel = document.getElementById('alias-team-select');
  if (sel) sel.value = String(currentTeam);
}
function aliasChangeTeamBySelect(val){
  const n = parseInt(val,10);
  if (!isNaN(n) && n>=1 && n<=teamCount){ currentTeam = n; const el=document.getElementById('alias-active-team'); if (el) el.innerHTML = `Текущая команда: <strong>${currentTeam}</strong>`; }
}

// Старт таймера и раунда
async function startAliasTimer(difficulty) {
  if (gameActive) return;

  const inputEl = document.getElementById("timerValue");
  if (!inputEl) return;

  // Кол-во команд
  const teamSelect = document.getElementById('teamCountSelect');
  if (teamSelect) {
    const tc = parseInt(teamSelect.value,10);
    teamCount = (!isNaN(tc) ? Math.min(5, Math.max(1, tc)) : 2);
  }
  aliasInitTeamScores();
  currentTeam = 1;

  let seconds = parseInt(inputEl.value, 10);
  if (isNaN(seconds) || seconds < 1 || seconds > 180) {
    alert("Введите число от 1 до 180.");
    return;
  }
  lastTimerSeconds = seconds;

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
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <p id="alias-timer" style="margin:0;">${seconds} секунд</p>
        <button onclick="aliasRestartRoundSameSettings()" class="chip">⏮️ Начать раунд заново</button>
      </div>
      ${aliasRenderActiveTeamControls()}
      ${aliasScoreboardHTML()}
      <div id="alias-left" style="margin-bottom:8px; font-size:0.95rem; opacity:.8;"></div>
      <div id="alias-word" class="card" style="min-height:68px; display:flex; align-items:center; justify-content:center; font-size:1.5rem;"></div>

      <div style="display:flex; gap:10px; justify-content:center; margin-top:20px; flex-wrap:wrap;">
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

// Перезапуск текущего раунда с теми же настройками
function aliasRestartRoundSameSettings(){
  if (!currentDifficulty) return;
  // Удаляем все ответы текущего раунда перед перезапуском
  guessedAlias = guessedAlias.filter(x => x.round !== currentRound);
  aliasSaveState();
  // Останавливаем таймер, если был
  clearInterval(window.aliasInterval);
  window.aliasInterval = null;
  gameActive = false;
  // Запускаем заново
  const fakeInput = document.getElementById('timerValue');
  // Если на экране нет инпута (мы в раунде), используем lastTimerSeconds
  if (!fakeInput) {
    const container = document.getElementById('game-container');
    if (container){
      // Небольшой хак: создаём временный инпут невидимый, чтобы переиспользовать startAliasTimer
      const tmp = document.createElement('input');
      tmp.type = 'number'; tmp.id = 'timerValue'; tmp.value = String(lastTimerSeconds);
      tmp.style.display = 'none';
      container.appendChild(tmp);
    }
  } else {
    fakeInput.value = String(lastTimerSeconds);
  }
  startAliasTimer(currentDifficulty);
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
  guessedAlias.push({ word, correct, round: currentRound, team: currentTeam });
  if (correct === true) teamScores[currentTeam] = (teamScores[currentTeam]||0) + 1;
  aliasUpdateScoreboardUI();
  aliasSaveState();

  requestAnimationFrame(() => aliasShowNextWord());
}

// Пропуск
function aliasSkipWord() {
  if (!gameActive || inputLocked || aliasIndex <= 0) return;

  inputLocked = true;
  const word = aliasWords[aliasIndex - 1];
  guessedAlias.push({ word, correct: null, round: currentRound, team: currentTeam });
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

function aliasUpdateScoreboardUI(){
  const sb = document.getElementById('alias-scoreboard');
  if (!sb) return;
  sb.innerHTML = Object.keys(teamScores).map(k=>`<span class="badge">Команда ${k}: <strong>${teamScores[k]}</strong></span>`).join("");
}

// Результаты
function aliasShowResults() {
  const container = document.getElementById("game-container");
  if (!container) return;

  aliasRemoveKeyHandlers();

  // Итог по командам (пересчитываем на всякий случай)
  aliasRecomputeTeamScores();

  container.innerHTML = `<h2>🏁 Результаты</h2>
    <div class="scoreboard" style="display:flex; gap:8px; flex-wrap:wrap;">
      ${Object.keys(teamScores).map(k=>`<span class=\"badge\">Команда ${k}: <strong>${teamScores[k]}</strong></span>`).join("")}
    </div>
  `;

  if (guessedAlias.length === 0) {
    container.innerHTML += "<p>Нет результатов. Начните игру снова.</p>";
    container.innerHTML += `<button onclick="startAliasGame()" class="menu-button">🔄 Новая игра</button>`;
    container.innerHTML += `<button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>`;
    return;
  }

  // Группировка по раундам
  const roundsMap = {};
  guessedAlias.forEach((item, idx) => {
    if (!roundsMap[item.round]) roundsMap[item.round] = [];
    roundsMap[item.round].push({...item, _idx: idx});
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

    const head = document.createElement('h3');
    head.textContent = `Раунд #${round} — ✅ ${yes} / ❌ ${no}${skipped ? ` / ⏭️ ${skipped}` : ""}`;
    container.appendChild(head);

    // Улучшенный список: таблица с управлением статуса и отображением команды
    const table = document.createElement('table');
    table.className = 'results-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.innerHTML = `
      <thead>
        <tr>
          <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #ddd;">Слово</th>
          <th style="padding:6px 8px; border-bottom:1px solid #ddd;">Команда</th>
          <th style="padding:6px 8px; border-bottom:1px solid #ddd;">Статус</th>
          <th style="padding:6px 8px; border-bottom:1px solid #ddd;">Изменить</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:6px 8px; border-bottom:1px solid #eee;">${aliasEscapeHTML(item.word)}</td>
        <td style="text-align:center; padding:6px 8px; border-bottom:1px solid #eee;">${item.team || '-'}</td>
        <td style="text-align:center; padding:6px 8px; border-bottom:1px solid #eee;">${aliasStatusBadge(item.correct)}</td>
        <td style="text-align:center; padding:6px 8px; border-bottom:1px solid #eee;">
          <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">
            <button class="chip" title="Отгадано" onclick="aliasEditResult(${item._idx}, true)">✅</button>
            <button class="chip" title="Не отгадано" onclick="aliasEditResult(${item._idx}, false)">❌</button>
            <button class="chip" title="Пропущено" onclick="aliasEditResult(${item._idx}, null)">⏭️</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    container.appendChild(table);
  });

  container.innerHTML += `<p style="margin-top:10px;"><strong>Итого: ✅ ${totalYes} / ❌ ${totalNo}</strong>${totalYes+totalNo < guessedAlias.length ? ` (⏭️ пропущено: ${guessedAlias.length - (totalYes+totalNo)})` : ""}</p>`;

  // Кнопки управления
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '10px';
  actions.style.flexWrap = 'wrap';
  actions.innerHTML = `
    <button onclick="currentRound++; aliasShowSetupWithNewTime(currentDifficulty)" class="menu-button">🔄 Новый раунд</button>
    <button onclick="startAliasGame()" class="menu-button">🔘 Выбрать уровень сложности</button>
    <button onclick="goToMainMenu()" class="back-button">⬅️ Главное меню</button>
  `;
  container.appendChild(actions);

  aliasSaveState();
}

function aliasStatusBadge(correct){
  if (correct === true) return '<span class="badge" style="background:#e7f7ea;">✅ Отгадано</span>';
  if (correct === false) return '<span class="badge" style="background:#fdecea;">❌ Не отгадано</span>';
  return '<span class="badge" style="background:#eef2f7;">⏭️ Пропущено</span>';
}

// Изменение результата постфактум с пересчётом очков
function aliasEditResult(globalIdx, newStatus){
  if (globalIdx < 0 || globalIdx >= guessedAlias.length) return;
  guessedAlias[globalIdx].correct = newStatus;
  aliasRecomputeTeamScores();
  aliasSaveState();
  aliasShowResults(); // перерисовываем удобнее всего
}

function aliasRecomputeTeamScores(){
  aliasInitTeamScores();
  for (const item of guessedAlias){
    if (item && item.team && item.correct === true){
      teamScores[item.team] = (teamScores[item.team]||0) + 1;
    }
  }
}

// Новый раунд с тем же уровнем
function aliasShowSetupWithNewTime(difficulty) {
  if (!difficulty) { startAliasGame(); return; }
  const container = document.getElementById("game-container");
  if (!container) return;

  const difficultyName = aliasGetDifficultyName(difficulty);

  container.innerHTML = `
    <h2>🎮 Алиас — ${difficultyName} уровень</h2>
    <div class="setup-grid" style="display:grid; gap:12px; grid-template-columns:1fr; max-width:520px;">
      <div>
        <p><strong>Выберите время (1–180 сек):</strong></p>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input type="number" id="timerValue" min="1" max="180" value="${lastTimerSeconds}" class="timer-input" style="width:120px;">
          <button class="chip" onclick="aliasPreset(30)">30 сек</button>
          <button class="chip" onclick="aliasPreset(60)">60 сек</button>
          <button class="chip" onclick="aliasPreset(90)">1 мин 30 сек</button>
        </div>
      </div>
      <div>
        <p><strong>Количество команд:</strong></p>
        <select id="teamCountSelect" class="timer-input" style="width:160px;">
          ${[1,2,3,4,5].map(n=>`<option value="${n}" ${n===teamCount?"selected":""}>${n}</option>`).join("")}
        </select>
      </div>
    </div>

    <br>
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
  aliasInitTeamScores();
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
      guessedAlias, currentRound, currentDifficulty, teamCount, teamScores, lastTimerSeconds
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
      teamCount = (Number.isInteger(s.teamCount) ? Math.min(5, Math.max(1, s.teamCount)) : 2);
      teamScores = (s.teamScores && typeof s.teamScores === 'object') ? s.teamScores : {};
      lastTimerSeconds = Number.isInteger(s.lastTimerSeconds) ? s.lastTimerSeconds : 60;
      if (!Object.keys(teamScores).length) aliasInitTeamScores();
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

// ===== Мелкие стили (по желанию, если нет общего CSS) =====
// Можно вынести в CSS-файл. Оставлено тут для самодостаточности.
(function injectAliasStyles(){
  if (document.getElementById('alias-inline-styles')) return;
  const css = `
    .menu-button, .start-button, .back-button, .correct-button, .wrong-button, .skip-button, .chip {
      cursor:pointer; border:none; border-radius:10px; padding:10px 14px; font-size:14px;
      box-shadow: 0 1px 2px rgba(0,0,0,.08);
    }
    .menu-button{ background:#f5f6f8; }
    .start-button{ background:#2ecc71; color:#fff; }
    .back-button{ background:#e0e3e7; }
    .correct-button{ background:#e7f7ea; }
    .wrong-button{ background:#fdecea; }
    .skip-button{ background:#eef2f7; }
    .timer-input{ padding:8px 10px; border:1px solid #d6dbe1; border-radius:8px; }
    .card{ background:#fff; border:1px solid #e7ebf0; border-radius:12px; padding:16px; }
    .badge{ display:inline-block; padding:6px 10px; border-radius:999px; background:#f2f4f7; }
    .chip{ background:#f7f8fa; }
    .results-table th, .results-table td { font-size:14px; }
  `;
  const style = document.createElement('style');
  style.id = 'alias-inline-styles';
  style.textContent = css;
  document.head.appendChild(style);
})();
