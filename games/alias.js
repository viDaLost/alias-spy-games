// games/alias.js — Alias (аккуратный UI, сброс прогресса, крупные яркие кнопки, mobile-first)

// === Глобальное состояние Alias ===
let aliasWords = [];        // слова текущего раунда
let aliasIndex = 0;         // индекс текущего слова
let guessedAlias = [];      // { word, correct(true/false/null), round, team }
let currentDifficulty = null;
let currentRound = 1;

let gameActive = false;     // идёт ли раунд
let inputLocked = false;    // защита от дабл-кликов
let wordsCache = new Map(); // 'easy'|'medium'|'hard' -> string[]
let abortCtrl = null;       // AbortController для fetch

// --- Команды и очки ---
let teamCount = 2;          // от 1 до 5
let currentTeam = 1;        // активная команда в раунде
let teamScores = {};        // {1:0,2:0,...}
let lastTimerSeconds = 60;  // длительность для «начать раунд заново»

// Восстановление состояния (опционально)
aliasLoadState();

/* ===================== НОВОЕ: функции «жёсткого» и «мягкого» сброса ===================== */
// Полный сброс всего прогресса и состояния (опционально очищаем кэш слов)
function aliasHardReset({ clearWordCache = false } = {}) {
  try { if (window.aliasInterval) clearInterval(window.aliasInterval); } catch {}
  window.aliasInterval = null;
  if (abortCtrl) { try { abortCtrl.abort(); } catch {} }
  gameActive = false;
  inputLocked = false;

  // Сбрасываем игровой прогресс
  aliasWords = [];
  aliasIndex = 0;
  guessedAlias = [];
  currentRound = 1;
  lastTimerSeconds = 60;

  // Сбрасываем команды/очки
  teamCount = 2;
  currentTeam = 1;
  teamScores = {};
  aliasInitTeamScores();

  // Очищаем сохранённое состояние
  try { localStorage.removeItem('alias_state'); } catch {}

  // По желанию — очищаем кеш слов (например, при новом запуске приложения не нужно)
  if (clearWordCache) wordsCache = new Map();
}

// Мягкий сброс при смене сложности: обнуляем только прогресс, оставляя визуальные настройки
function aliasSoftResetForNewDifficulty() {
  try { if (window.aliasInterval) clearInterval(window.aliasInterval); } catch {}
  window.aliasInterval = null;
  if (abortCtrl) { try { abortCtrl.abort(); } catch {} }
  gameActive = false;
  inputLocked = false;

  aliasWords = [];
  aliasIndex = 0;
  guessedAlias = [];
  currentRound = 1;

  // Команды и очки тоже считаем прогрессом → обнуляем
  teamScores = {};
  teamCount = 2;
  currentTeam = 1;
  aliasInitTeamScores();

  // Не трогаем wordsCache (пусть остаётся для повторного использования словарей)
  try { localStorage.removeItem('alias_state'); } catch {}
}
/* ======================================================================================== */

// Стартовый экран выбора сложности (меню не показываем здесь)
function startAliasGame() {
  // Начинаем с чистого листа при входе на стартовый экран
  aliasHardReset({ clearWordCache: false });

  const container = document.getElementById("game-container");
  if (!container) return;

  container.innerHTML = `
    <h2 class="alias-title">🎮 Алиас</h2>
    <p class="alias-sub">Выберите уровень сложности</p>

    <div class="alias-buttons">
      <button onclick="loadAliasWords('easy')" class="btn btn-neutral btn-lg">🟢 Лёгкий</button>
      <button onclick="loadAliasWords('medium')" class="btn btn-neutral btn-lg">🟡 Средний</button>
      <button onclick="loadAliasWords('hard')" class="btn btn-neutral btn-lg">🔴 Тяжёлый</button>
    </div>

    <button onclick="goToMainMenu()" class="btn btn-ghost btn-lg">⬅️ В главное меню</button>
  `;

  const menu = document.querySelector('.menu-container');
  if (menu) menu.classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'auto' });

  aliasSaveState();
}

// Загрузка слов по уровню с кэшем
async function loadAliasWords(difficulty) {
  // Требование: при выборе новой сложности — сбрасываем любой прогресс
  aliasSoftResetForNewDifficulty();

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

// Экран настройки времени и команд (выбор команды здесь!)
function aliasShowSetup(words, difficulty) {
  const container = document.getElementById("game-container");
  if (!container) return;

  const difficultyName = aliasGetDifficultyName(difficulty);

  // Корректируем teamCount и текущую команду
  if (!Number.isInteger(teamCount) || teamCount < 1 || teamCount > 5) teamCount = 2;
  if (!Number.isInteger(currentTeam) || currentTeam < 1 || currentTeam > teamCount) currentTeam = 1;

  container.innerHTML = `
    <h2 class="alias-title">🎮 Алиас — ${difficultyName}</h2>

    <div class="setup-grid">
      <div class="setup-block">
        <p class="setup-label">Время раунда</p>
        <div class="row-wrap">
          <input type="number" id="timerValue" min="1" max="180" value="${lastTimerSeconds}" class="input input-lg">
          <div class="chips">
            <button class="chip chip-lg" onclick="aliasPreset(30)">30 сек</button>
            <button class="chip chip-lg" onclick="aliasPreset(60)">60 сек</button>
            <button class="chip chip-lg" onclick="aliasPreset(90)">1 мин 30 сек</button>
          </div>
        </div>
        <p class="hint">Допустимо от 1 до 180 секунд</p>
      </div>

      <div class="setup-block">
        <p class="setup-label">Количество команд</p>
        <select id="teamCountSelect" class="input select input-lg">
          ${[1,2,3,4,5].map(n=>`<option value="${n}" ${n===teamCount?"selected":""}>${n}</option>`).join("")}
        </select>
        <p class="hint">Измените при необходимости</p>
      </div>

      <div class="setup-block">
        <p class="setup-label">Какая команда играет сейчас?</p>
        <select id="currentTeamSelect" class="input select input-lg">
          ${Array.from({length:teamCount},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===currentTeam?"selected":""}>Команда ${n}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="row-center">
      <button onclick="startAliasTimer('${difficulty}')" class="btn btn-primary btn-xl">▶️ Начать раунд</button>
      <button onclick="goToMainMenu()" class="btn btn-ghost btn-lg">⬅️ В главное меню</button>
    </div>
  `;
}

function aliasPreset(sec){
  const el = document.getElementById('timerValue');
  if (el){ el.value = sec; lastTimerSeconds = sec; aliasSaveState(); }
}

function aliasGetDifficultyName(difficulty) {
  return { easy: 'Лёгкий', medium: 'Средний', hard: 'Тяжёлый' }[difficulty] || 'Неизвестный';
}

// Нормализация (для «без повторов»)
function aliasNormalize(s) { return String(s || '').trim().toLowerCase(); }

function aliasGetUnusedWords(allWords, guessedList) {
  const guessedSet = new Set(guessedList.map(item => aliasNormalize(item.word)));
  return allWords.filter(word => !guessedSet.has(aliasNormalize(word)));
}

function aliasInitTeamScores(){
  teamScores = {};
  for (let i=1;i<=Math.max(1,Math.min(5,teamCount));i++) teamScores[i] = teamScores[i] || 0;
}

function aliasScoreboardHTML(){
  return `<div id="alias-scoreboard" class="scoreboard">${Object.keys(teamScores).map(k=>`<span class="badge">Команда ${k}: <strong>${teamScores[k]}</strong></span>`).join('')}</div>`;
}

// Старт таймера и раунда (экран раунда — МИНИМАЛЬНЫЙ)
async function startAliasTimer(difficulty) {
  if (gameActive) return;

  // Считываем настройки
  const timeInput = document.getElementById('timerValue');
  const teamSelect = document.getElementById('teamCountSelect');
  const currentTeamSelect = document.getElementById('currentTeamSelect');

  if (teamSelect) {
    const tc = parseInt(teamSelect.value,10);
    teamCount = (!isNaN(tc) ? Math.min(5, Math.max(1, tc)) : 2);
  }
  aliasInitTeamScores();

  if (currentTeamSelect) {
    const ct = parseInt(currentTeamSelect.value,10);
    if (!isNaN(ct) && ct>=1 && ct<=teamCount) currentTeam = ct; else currentTeam = 1;
  }

  let seconds = timeInput ? parseInt(timeInput.value, 10) : lastTimerSeconds;
  if (isNaN(seconds) || seconds < 1 || seconds > 180) {
    alert('Введите число от 1 до 180.');
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

    if (unusedWords.length === 0) return aliasShowAllWordsMessage();

    aliasWords = aliasShuffle(unusedWords);
    aliasIndex = 0;

    const container = document.getElementById('game-container');
    if (!container) return;

    // ВО ВРЕМЯ РАУНДА — ТОЛЬКО ТАЙМЕР, СЛОВО И КНОПКИ
    container.innerHTML = `
      <div class="round-head">
        <div id="alias-timer" class="timer">${seconds} секунд</div>
        <div class="round-meta">Раунд #${currentRound} • Команда ${currentTeam}</div>
      </div>

      <div id="alias-word" class="card word-card" aria-live="polite"></div>

      <div class="actions">
        <button onclick="markGuessed(true)" class="btn btn-good btn-xl">✅ Отгадано (Enter)</button>
        <button onclick="markGuessed(false)" class="btn btn-bad btn-xl">❌ Не отгадано (Backspace)</button>
        <button onclick="aliasSkipWord()" class="btn btn-skip btn-xl">⏭️ Пропустить (Space)</button>
      </div>

      <div class="row-center">
        <button onclick="aliasRestartRoundSameSettings()" class="btn btn-ghost btn-lg">⟲ Начать этот раунд заново</button>
        <button onclick="goToMainMenu()" class="btn btn-ghost btn-lg">⬅️ В главное меню</button>
      </div>
    `;

    aliasShowNextWord();

    gameActive = true;
    inputLocked = false;

    const timerEl = document.getElementById('alias-timer');

    window.aliasInterval = setInterval(() => {
      if (!gameActive) return;
      seconds--;
      aliasUpdateTimerUI(timerEl, seconds);
      if (seconds <= 0) aliasEndRound(timerEl);
    }, 1000);

    aliasAddKeyHandlers();
    aliasSaveState();
  } catch (e) {
    alert('Ошибка при начале игры.');
    console.error(e);
  }
}

// Перезапуск текущего раунда с теми же настройками
function aliasRestartRoundSameSettings(){
  if (!currentDifficulty) return;
  // Удаляем ответы этого раунда
  guessedAlias = guessedAlias.filter(x => x.round !== currentRound);
  aliasSaveState();
  clearInterval(window.aliasInterval);
  window.aliasInterval = null;
  gameActive = false;

  // Восстанавливаем таймер из lastTimerSeconds
  const container = document.getElementById('game-container');
  if (container){
    const tmp = document.createElement('input');
    tmp.type = 'number'; tmp.id = 'timerValue'; tmp.value = String(lastTimerSeconds);
    tmp.style.display = 'none';
    container.appendChild(tmp);
  }
  startAliasTimer(currentDifficulty);
}

// UI таймера
function aliasUpdateTimerUI(timerEl, seconds) {
  if (!timerEl) return;
  timerEl.textContent = `${seconds} секунд`;
  timerEl.style.color = seconds <= 10 ? '#ef4444' : ''; // ярче предупреждение
}

// Завершение раунда
function aliasEndRound(timerEl) {
  clearInterval(window.aliasInterval);
  window.aliasInterval = null;
  gameActive = false;
  aliasDisableAnswerButtons(true);
  if (timerEl) timerEl.textContent = '⏰ Время вышло!';
  setTimeout(aliasShowResults, 250);
}

// Следующее слово (безопасно через textContent)
function aliasShowNextWord() {
  const wordEl = document.getElementById('alias-word');
  if (!wordEl) return;

  if (aliasIndex >= aliasWords.length) {
    gameActive = false;
    aliasDisableAnswerButtons(true);
    return aliasShowResults();
  }

  wordEl.textContent = aliasWords[aliasIndex];
  aliasIndex++;

  inputLocked = false;
  aliasDisableAnswerButtons(false);
}

// Пометка результата
function markGuessed(correct) {
  if (!gameActive || inputLocked || aliasIndex <= 0) return;
  inputLocked = true;
  const word = aliasWords[aliasIndex - 1];
  guessedAlias.push({ word, correct, round: currentRound, team: currentTeam });
  if (correct === true) teamScores[currentTeam] = (teamScores[currentTeam]||0) + 1;
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
  document.querySelectorAll('.btn-good, .btn-bad, .btn-skip').forEach(btn => { if (btn) btn.disabled = disabled; });
}

// Пересчёт очков
function aliasRecomputeTeamScores(){
  const savedTeamCount = teamCount;
  aliasInitTeamScores();
  for (const item of guessedAlias){
    if (item && item.team && item.correct === true){
      teamScores[item.team] = (teamScores[item.team]||0) + 1;
    }
  }
  // Восстанавливаем верхнюю границу, если teamCount могли изменить ранее
  teamCount = savedTeamCount;
}

// Результаты
function aliasShowResults() {
  const container = document.getElementById('game-container');
  if (!container) return;

  aliasRemoveKeyHandlers();
  aliasRecomputeTeamScores();

  // Группировка по раундам
  const roundsMap = {};
  guessedAlias.forEach((item, idx) => {
    if (!roundsMap[item.round]) roundsMap[item.round] = [];
    roundsMap[item.round].push({...item, _idx: idx});
  });

  const rounds = Object.keys(roundsMap).map(Number).sort((a, b) => a - b);

  let totalYes = 0, totalNo = 0;

  container.innerHTML = `
    <h2 class="alias-title">🏁 Результаты</h2>
    ${aliasScoreboardHTML()}
  `;

  if (guessedAlias.length === 0) {
    container.innerHTML += `
      <p class="hint">Нет результатов. Начните игру снова.</p>
      <div class="row-center">
        <button onclick="startAliasGame()" class="btn btn-neutral btn-lg">🔄 Новая игра</button>
        <button onclick="goToMainMenu()" class="btn btn-ghost btn-lg">⬅️ В главное меню</button>
      </div>`;
    return;
  }

  rounds.forEach(round => {
    const items = roundsMap[round];
    const yes = items.filter(x => x.correct === true).length;
    const no  = items.filter(x => x.correct === false).length;
    const skipped = items.filter(x => x.correct === null).length;

    totalYes += yes; totalNo += no;

    const head = document.createElement('h3');
    head.className = 'round-title';
    head.textContent = `Раунд #${round} — ✅ ${yes} / ❌ ${no}${skipped ? ` / ⏭️ ${skipped}` : ''}`;
    container.appendChild(head);

    const table = document.createElement('table');
    table.className = 'results-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Слово</th>
          <th>Команда</th>
          <th>Статус</th>
          <th>Изменить</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');
    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${aliasEscapeHTML(item.word)}</td>
        <td class="center">${item.team || '-'}</td>
        <td class="center">${aliasStatusBadge(item.correct)}</td>
        <td class="center">
          <div class="row-wrap center">
            <button class="chip chip-lg" title="Отгадано" onclick="aliasEditResult(${item._idx}, true)">✅</button>
            <button class="chip chip-lg" title="Не отгадано" onclick="aliasEditResult(${item._idx}, false)">❌</button>
            <button class="chip chip-lg" title="Пропущено" onclick="aliasEditResult(${item._idx}, null)">⏭️</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    container.appendChild(table);
  });

  const totals = document.createElement('p');
  totals.className = 'totals';
  const skippedTotal = guessedAlias.length - (totalYes + totalNo);
  totals.innerHTML = `<strong>Итого:</strong> ✅ ${totalYes} / ❌ ${totalNo}${skippedTotal?` (⏭️ пропущено: ${skippedTotal})`:''}`;
  container.appendChild(totals);

  // Блок выбора следующей команды и кнопки действий
  const nextBlock = document.createElement('div');
  nextBlock.className = 'next-block';
  nextBlock.innerHTML = `
    <div class="row-wrap">
      <label for="nextTeamSelect" class="setup-label" style="margin:0">Кто играет в следующем раунде?</label>
      <select id="nextTeamSelect" class="input select input-lg" style="min-width:180px;">
        ${Array.from({length:teamCount},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===((currentTeam % teamCount)||teamCount)?'selected':''}>Команда ${n}</option>`).join('')}
      </select>
    </div>

    <div class="row-center actions-bottom">
      <button onclick="aliasStartNextRound()" class="btn btn-primary btn-xl">▶️ Начать следующий раунд</button>
      <button onclick="startAliasGame()" class="btn btn-neutral btn-lg">🔘 Выбрать уровень</button>
      <button onclick="goToMainMenu()" class="btn btn-ghost btn-lg">⬅️ В главное меню</button>
    </div>
  `;
  container.appendChild(nextBlock);

  aliasSaveState();
}

function aliasStatusBadge(correct){
  if (correct === true) return '<span class="badge badge-good">Отгадано</span>';
  if (correct === false) return '<span class="badge badge-bad">Не отгадано</span>';
  return '<span class="badge badge-skip">Пропущено</span>';
}

// Изменение результата постфактум с пересчётом очков
function aliasEditResult(globalIdx, newStatus){
  if (globalIdx < 0 || globalIdx >= guessedAlias.length) return;
  guessedAlias[globalIdx].correct = newStatus;
  aliasRecomputeTeamScores();
  aliasSaveState();
  aliasShowResults();
}

// Запуск следующего раунда с выбранной командой и тем же уровнем/временем
function aliasStartNextRound(){
  const sel = document.getElementById('nextTeamSelect');
  const val = sel ? parseInt(sel.value,10) : NaN;
  if (!isNaN(val)) currentTeam = val;
  currentRound++;
  aliasShowSetupWithNewTime(currentDifficulty);
}

// Новый раунд — тот же уровень
function aliasShowSetupWithNewTime(difficulty) {
  if (!difficulty) return startAliasGame();
  const container = document.getElementById('game-container');
  if (!container) return;

  const difficultyName = aliasGetDifficultyName(difficulty);

  container.innerHTML = `
    <h2 class="alias-title">🎮 Алиас — ${difficultyName}</h2>
    <div class="setup-grid">
      <div class="setup-block">
        <p class="setup-label">Время раунда</p>
        <div class="row-wrap">
          <input type="number" id="timerValue" min="1" max="180" value="${lastTimerSeconds}" class="input input-lg">
          <div class="chips">
            <button class="chip chip-lg" onclick="aliasPreset(30)">30 сек</button>
            <button class="chip chip-lg" onclick="aliasPreset(60)">60 сек</button>
            <button class="chip chip-lg" onclick="aliasPreset(90)">1 мин 30 сек</button>
          </div>
        </div>
      </div>
      <div class="setup-block">
        <p class="setup-label">Активная команда</p>
        <select id="currentTeamSelect" class="input select input-lg">
          ${Array.from({length:teamCount},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===currentTeam?"selected":""}>Команда ${n}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="row-center">
      <button onclick="startAliasTimer('${difficulty}')" class="btn btn-primary btn-xl">▶️ Начать раунд</button>
      <button onclick="goToMainMenu()" class="btn btn-ghost btn-lg">⬅️ В главное меню</button>
    </div>
  `;
}

// Когда все слова исчерпаны
function aliasShowAllWordsMessage() {
  const container = document.getElementById('game-container');
  if (!container) return;

  container.innerHTML = `
    <h2 class="alias-title">⚠️ Все слова показаны</h2>
    <p class="hint">Можно начать заново или сбросить использованные слова.</p>
    <div class="row-center">
      <button onclick="startAliasGame()" class="btn btn-neutral btn-lg">🔄 Новая игра</button>
      <button onclick="aliasResetGuessedAndContinue()" class="btn btn-primary btn-xl">🧹 Сбросить использованные</button>
      <button onclick="goToMainMenu()" class="btn btn-ghost btn-lg">⬅️ В главное меню</button>
    </div>
  `;
}

function aliasResetGuessedAndContinue() {
  guessedAlias = [];
  currentRound = 1;
  aliasInitTeamScores();
  aliasSaveState();
  if (currentDifficulty) aliasShowSetupWithNewTime(currentDifficulty); else startAliasGame();
}

// URL словарей
function aliasUrlForDifficulty(difficulty) {
  return {
    easy: 'data/easy_bible_words.json',
    medium: 'data/medium_bible_words.json',
    hard: 'data/hard_bible_words.json'
  }[difficulty] || '';
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
  if (!url) throw new Error('Пустой URL словаря');
  const res = await fetch(url, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`HTTP ошибка: ${res.status}`);
  return await res.json();
}

// Экранирование для безопасной вставки в innerHTML
function aliasEscapeHTML(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Сохранение/загрузка состояния Alias
function aliasSaveState() {
  try {
    localStorage.setItem('alias_state', JSON.stringify({
      guessedAlias, currentRound, currentDifficulty, teamCount, teamScores, lastTimerSeconds, currentTeam
    }));
  } catch {}
}

function aliasLoadState() {
  try {
    const s = JSON.parse(localStorage.getItem('alias_state'));
    if (s) {
      guessedAlias = Array.isArray(s.guessedAlias) ? s.guessedAlias : [];
      currentRound = Number.isInteger(s.currentRound) ? s.currentRound : 1;
      currentDifficulty = s.currentDifficulty || null;
      teamCount = (Number.isInteger(s.teamCount) ? Math.min(5, Math.max(1, s.teamCount)) : 2);
      teamScores = (s.teamScores && typeof s.teamScores === 'object') ? s.teamScores : {};
      lastTimerSeconds = Number.isInteger(s.lastTimerSeconds) ? s.lastTimerSeconds : 60;
      currentTeam = Number.isInteger(s.currentTeam) ? s.currentTeam : 1;
      if (!Object.keys(teamScores).length) aliasInitTeamScores();
    }
  } catch {}
}

// Клавиатурные шорткаты: Enter, Backspace, Space
function aliasKeydownHandler(e) {
  if (!gameActive) return;
  if (e.code === 'Space') e.preventDefault();
  switch (e.code) {
    case 'Enter':     markGuessed(true); break;
    case 'Backspace': markGuessed(false); break;
    case 'Space':     aliasSkipWord(); break;
  }
}

function aliasAddKeyHandlers() {
  aliasRemoveKeyHandlers();
  window.addEventListener('keydown', aliasKeydownHandler, { passive: false });
}

function aliasRemoveKeyHandlers() {
  window.removeEventListener('keydown', aliasKeydownHandler, { passive: false });
}

// ===== Минималистичные стили (самодостаточно) — ОБНОВЛЁННЫЕ ДЛЯ МОБИЛЬНЫХ И ЯРКИХ КНОПОК =====
(function injectAliasStyles(){
  if (document.getElementById('alias-inline-styles')) return;
  const css = `
    :root{
      --bg:#ffffff; --ink:#0f172a; --muted:#6b7280; --border:#e5e7eb;
      --good:#d1fae5; --bad:#fee2e2; --skip:#e5edff;
      --brand:#2563eb; --brand-ink:#ffffff;
      --good-ink:#065f46; --bad-ink:#7f1d1d; --skip-ink:#1e3a8a;
    }
    * { -webkit-tap-highlight-color: transparent; }
    #game-container{ max-width:720px; margin:0 auto; padding:16px; color:var(--ink); }
    .alias-title{ margin:0 0 8px; font-size:26px; font-weight:800; letter-spacing:.2px; }
    .alias-sub{ margin:0 0 12px; color:var(--muted); }

    .setup-grid{ display:grid; gap:16px; grid-template-columns:1fr; max-width:640px; }
    .setup-block{ background:#fff; border:1px solid var(--border); border-radius:14px; padding:14px; }
    .setup-label{ font-weight:700; margin:0 0 8px; }
    .hint{ margin:6px 0 0; color:var(--muted); font-size:13px; }

    .row-wrap{ display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
    .row-center{ display:flex; gap:12px; justify-content:center; align-items:center; flex-wrap:wrap; margin-top:14px; }
    .chips{ display:flex; gap:10px; flex-wrap:wrap; }

    .input{ padding:12px 14px; border:1px solid var(--border); border-radius:12px; font-size:16px; }
    .input-lg{ padding:14px 16px; font-size:17px; }
    .select{ min-width:140px; }

    .btn{ cursor:pointer; border:none; border-radius:14px; padding:14px 18px; font-size:16px; font-weight:700;
          box-shadow:0 4px 10px rgba(37,99,235,0.08); transition:transform .06s ease, box-shadow .2s ease; }
    .btn:active{ transform:translateY(1px); }
    .btn:disabled{ opacity:.6; cursor:not-allowed; }
    .btn-lg{ padding:16px 20px; font-size:17px; }
    .btn-xl{ padding:18px 22px; font-size:18px; }

    .btn-primary{ background:linear-gradient(180deg,#3b82f6,#2563eb); color:var(--brand-ink); }
    .btn-neutral{ background:#f5f7fb; }
    .btn-ghost{ background:#f8fafc; }
    .btn-good{ background:#34d399; color:#064e3b; }
    .btn-bad{ background:#fca5a5; color:#7f1d1d; }
    .btn-skip{ background:#c7d2fe; color:#1e3a8a; }

    .alias-buttons{ display:flex; gap:12px; flex-wrap:wrap; margin:12px 0 18px; }

    .word-card{ background:#fff; border:1px solid var(--border); border-radius:16px; padding:24px;
                min-height:100px; display:flex; align-items:center; justify-content:center;
                font-size:32px; font-weight:800; text-align:center; }

    .round-head{ display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; }
    .timer{ font-weight:900; font-size:18px; }
    .round-meta{ color:var(--muted); font-size:14px; }

    .actions{ display:flex; gap:12px; justify-content:center; margin-top:18px; flex-wrap:wrap; }
    .actions-bottom{ margin-top:12px; }

    .scoreboard{ display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-start; margin:8px 0 16px; }
    .badge{ display:inline-block; padding:8px 12px; border-radius:999px; background:#eef2f7; font-size:14px; font-weight:700; }

    .badge-good{ background:var(--good); color:var(--good-ink); }
    .badge-bad{ background:var(--bad); color:var(--bad-ink); }
    .badge-skip{ background:var(--skip); color:var(--skip-ink); }

    .results-table{ width:100%; border-collapse:collapse; margin:10px 0 16px; font-size:16px; }
    .results-table th, .results-table td{ padding:10px 12px; border-bottom:1px solid var(--border); }
    .results-table th{ text-align:left; background:#f9fafb; }
    .results-table td.center{ text-align:center; }
    .round-title{ margin:12px 0 10px; font-size:20px; font-weight:800; }
    .totals{ margin:8px 0 14px; font-weight:700; }
    .next-block{ display:flex; flex-direction:column; gap:12px; }

    .chip{ padding:10px 12px; border-radius:999px; background:#f3f4f6; border:1px solid var(--border); font-weight:700; }
    .chip-lg{ padding:12px 14px; }

    /* Мобильные улучшения */
    @media (max-width:560px){
      .btn, .btn-lg, .btn-xl { width:100%; min-height:48px; }
      .input, .input-lg, .select{ width:100%; }
      .word-card{ font-size:28px; min-height:110px; padding:22px; }
      .alias-buttons{ gap:10px; }
      .timer{ font-size:20px; }
    }
  `;
  const style = document.createElement('style');
  style.id = 'alias-inline-styles';
  style.textContent = css;
  document.head.appendChild(style);
})();

// Переопределите в своём коде
function goToMainMenu(){
  // Требование: при выходе в главное меню — сбрасываем ЛЮБОЙ прогресс
  aliasHardReset({ clearWordCache: false });

  const menu = document.querySelector('.menu-container');
  if (menu) menu.classList.remove('hidden');
  const container = document.getElementById('game-container');
  if (container) container.innerHTML = '<p class="hint"></p>';
}
