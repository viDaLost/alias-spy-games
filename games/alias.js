// games/alias.js — Alias (аккуратный UI, выбор команды до/после раунда, минимальный экран раунда)

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

// Стартовый экран выбора сложности (меню не показываем здесь)
function startAliasGame() {
  if (window.aliasInterval) clearInterval(window.aliasInterval);
  gameActive = false;
  inputLocked = false;

  aliasWords = [];
  aliasIndex = 0;
  guessedAlias = guessedAlias || [];
  currentRound = currentRound || 1;
  currentDifficulty = null;

  if (!Number.isInteger(teamCount) || teamCount < 1 || teamCount > 5) teamCount = 2;
  if (!Number.isInteger(currentTeam) || currentTeam < 1 || currentTeam > teamCount) currentTeam = 1;
  aliasInitTeamScores();

  const container = document.getElementById("game-container");
  if (!container) return;

  container.innerHTML = `
    <h2 class="alias-title">🎮 Алиас</h2>
    <p class="alias-sub">Выберите уровень сложности</p>

    <div class="alias-buttons">
      <button onclick="loadAliasWords('easy')" class="btn btn-neutral">🟢 Лёгкий</button>
      <button onclick="loadAliasWords('medium')" class="btn btn-neutral">🟡 Средний</button>
      <button onclick="loadAliasWords('hard')" class="btn btn-neutral">🔴 Тяжёлый</button>
    </div>

    <button onclick="goToMainMenu()" class="btn btn-ghost">⬅️ В главное меню</button>
  `;

  const menu = document.querySelector('.menu-container');
  if (menu) menu.classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'auto' });

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
          <input type="number" id="timerValue" min="1" max="180" value="${lastTimerSeconds}" class="input">
          <div class="chips">
            <button class="chip" onclick="aliasPreset(30)">30 сек</button>
            <button class="chip" onclick="aliasPreset(60)">60 сек</button>
            <button class="chip" onclick="aliasPreset(90)">1 мин 30 сек</button>
          </div>
        </div>
        <p class="hint">Допустимо от 1 до 180 секунд</p>
      </div>

      <div class="setup-block">
        <p class="setup-label">Количество команд</p>
        <select id="teamCountSelect" class="input select">
          ${[1,2,3,4,5].map(n=>`<option value="${n}" ${n===teamCount?"selected":""}>${n}</option>`).join("")}
        </select>
        <p class="hint">Измените при необходимости</p>
      </div>

      <div class="setup-block">
        <p class="setup-label">Какая команда играет сейчас?</p>
        <select id="currentTeamSelect" class="input select">
          ${Array.from({length:teamCount},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===currentTeam?"selected":""}>Команда ${n}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="row-center">
      <button onclick="startAliasTimer('${difficulty}')" class="btn btn-primary">▶️ Начать раунд</button>
      <button onclick="goToMainMenu()" class="btn btn-ghost">⬅️ В главное меню</button>
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
        <button onclick="markGuessed(true)" class="btn btn-good">✅ Отгадано (Enter)</button>
        <button onclick="markGuessed(false)" class="btn btn-bad">❌ Не отгадано (Backspace)</button>
        <button onclick="aliasSkipWord()" class="btn btn-skip">⏭️ Пропустить (Space)</button>
      </div>

      <div class="row-center">
        <button onclick="aliasRestartRoundSameSettings()" class="btn btn-ghost">⟲ Начать этот раунд заново</button>
        <button onclick="goToMainMenu()" class="btn btn-ghost">⬅️ В главное меню</button>
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
  timerEl.style.color = seconds <= 10 ? '#d92d20' : '';
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
        <button onclick="startAliasGame()" class="btn btn-neutral">🔄 Новая игра</button>
        <button onclick="goToMainMenu()" class="btn btn-ghost">⬅️ В главное меню</button>
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
      <select id="nextTeamSelect" class="input select" style="min-width:160px;">
        ${Array.from({length:teamCount},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===((currentTeam % teamCount)||teamCount)?'selected':''}>Команда ${n}</option>`).join('')}
      </select>
    </div>

    <div class="row-center actions-bottom">
      <button onclick="aliasStartNextRound()" class="btn btn-primary">▶️ Начать следующий раунд</button>
      <button onclick="startAliasGame()" class="btn btn-neutral">🔘 Выбрать уровень</button>
      <button onclick="goToMainMenu()" class="btn btn-ghost">⬅️ В главное меню</button>
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
          <input type="number" id="timerValue" min="1" max="180" value="${lastTimerSeconds}" class="input">
          <div class="chips">
            <button class="chip" onclick="aliasPreset(30)">30 сек</button>
            <button class="chip" onclick="aliasPreset(60)">60 сек</button>
            <button class="chip" onclick="aliasPreset(90)">1 мин 30 сек</button>
          </div>
        </div>
      </div>
      <div class="setup-block">
        <p class="setup-label">Активная команда</p>
        <select id="currentTeamSelect" class="input select">
          ${Array.from({length:teamCount},(_,i)=>i+1).map(n=>`<option value="${n}" ${n===currentTeam?"selected":""}>Команда ${n}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="row-center">
      <button onclick="startAliasTimer('${difficulty}')" class="btn btn-primary">▶️ Начать раунд</button>
      <button onclick="goToMainMenu()" class="btn btn-ghost">⬅️ В главное меню</button>
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
      <button onclick="startAliasGame()" class="btn btn-neutral">🔄 Новая игра</button>
      <button onclick="aliasResetGuessedAndContinue()" class="btn btn-primary">🧹 Сбросить использованные</button>
      <button onclick="goToMainMenu()" class="btn btn-ghost">⬅️ В главное меню</button>
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

// ===== Минималистичные стили (самодостаточно) =====
(function injectAliasStyles(){
  if (document.getElementById('alias-inline-styles')) return;
  const css = `
    :root{
      --bg:#ffffff; --ink:#0f172a; --muted:#6b7280; --border:#e5e7eb;
      --good:#e7f7ea; --bad:#fdecea; --skip:#eef2f7; --brand:#2563eb; --brand-ink:#ffffff;
    }
    #game-container{ max-width:720px; margin:0 auto; padding:16px; color:var(--ink); }
    .alias-title{ margin:0 0 8px; font-size:24px; font-weight:700; }
    .alias-sub{ margin:0 0 12px; color:var(--muted); }

    .setup-grid{ display:grid; gap:16px; grid-template-columns:1fr; max-width:560px; }
    .setup-block{ background:#fff; border:1px solid var(--border); border-radius:12px; padding:12px; }
    .setup-label{ font-weight:600; margin:0 0 8px; }
    .hint{ margin:6px 0 0; color:var(--muted); font-size:12px; }

    .row-wrap{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    .row-center{ display:flex; gap:10px; justify-content:center; align-items:center; flex-wrap:wrap; margin-top:12px; }
    .chips{ display:flex; gap:8px; flex-wrap:wrap; }

    .input{ padding:8px 10px; border:1px solid var(--border); border-radius:10px; font-size:14px; }
    .select{ min-width:120px; }

    .btn{ cursor:pointer; border:none; border-radius:10px; padding:10px 14px; font-size:14px; box-shadow:0 1px 2px rgba(0,0,0,.06); transition:transform .06s ease; }
    .btn:active{ transform:translateY(1px); }
    .btn-primary{ background:var(--brand); color:var(--brand-ink); }
    .btn-neutral{ background:#f5f6f8; }
    .btn-ghost{ background:#f8fafc; }
    .btn-good{ background:var(--good); }
    .btn-bad{ background:var(--bad); }
    .btn-skip{ background:var(--skip); }

    .alias-buttons{ display:flex; gap:10px; flex-wrap:wrap; margin:10px 0 16px; }

    .word-card{ background:#fff; border:1px solid var(--border); border-radius:14px; padding:20px; min-height:88px; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:700; text-align:center; }

    .round-head{ display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px; }
    .timer{ font-weight:700; }
    .round-meta{ color:var(--muted); font-size:13px; }

    .actions{ display:flex; gap:10px; justify-content:center; margin-top:16px; flex-wrap:wrap; }
    .actions-bottom{ margin-top:10px; }

    .scoreboard{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-start; margin:6px 0 14px; }
    .badge{ display:inline-block; padding:6px 10px; border-radius:999px; background:#f2f4f7; font-size:13px; }
    .badge-good{ background:var(--good); }
    .badge-bad{ background:var(--bad); }
    .badge-skip{ background:var(--skip); }

    .results-table{ width:100%; border-collapse:collapse; margin:8px 0 14px; font-size:14px; }
    .results-table th, .results-table td{ padding:8px 10px; border-bottom:1px solid var(--border); }
    .results-table th{ text-align:left; background:#f9fafb; }
    .results-table td.center{ text-align:center; }
    .round-title{ margin:10px 0 8px; font-size:18px; }
    .totals{ margin:6px 0 12px; }
    .next-block{ display:flex; flex-direction:column; gap:10px; }

    @media (max-width:520px){
      .word-card{ font-size:22px; }
      .results-table th:nth-child(4), .results-table td:nth-child(4){ width:120px; }
    }
  `;
  const style = document.createElement('style');
  style.id = 'alias-inline-styles';
  style.textContent = css;
  document.head.appendChild(style);
})();

// Переопределите в своём коде
function goToMainMenu(){
  // Заглушка: вернуться к вашему общему меню приложения
  const menu = document.querySelector('.menu-container');
  if (menu) menu.classList.remove('hidden');
  const container = document.getElementById('game-container');
  if (container) container.innerHTML = '<p class="hint">Главное меню скрывается/показывается в вашем приложении.</p>';
}
