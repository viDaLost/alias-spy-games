(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const scene = byId('scene');
  const stage = byId('gameStage');
  const scoreStrip = byId('scoreStrip');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const layers = {
    sky: byId('sky'),
    mountains: byId('mountains'),
    city: byId('city'),
    market: byId('market'),
    haze: byId('haze'),
    left: byId('leftForeground'),
    right: byId('rightForeground'),
    props: byId('props'),
    hourglass: byId('hourglass'),
  };

  const depths = {
    sky: [3, 2],
    mountains: [6, 4],
    city: [10, 7],
    market: [17, 11],
    haze: [23, 16],
    left: [40, 24],
    right: [42, 24],
    props: [47, 27],
    hourglass: [53, 30],
  };

  const target = { x: 0, progress: 0 };
  const current = { x: 0, progress: 0 };
  const drag = { id: null, startX: 0, startY: 0, lastX: 0, axis: null };
  let rafId = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function readScroll() {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    target.progress = clamp(scrollY / maxScroll, 0, 1);
    scheduleRender();
  }

  function renderParallax() {
    rafId = 0;
    if (reducedMotion) {
      scene.classList.remove('is-moving');
      return;
    }

    current.x += (target.x - current.x) * 0.14;
    current.progress += (target.progress - current.progress) * 0.12;

    for (const [name, element] of Object.entries(layers)) {
      const [horizontalDepth, verticalDepth] = depths[name];
      const x = current.x * horizontalDepth;
      const y = -current.progress * verticalDepth;
      element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(1.08)`;
    }

    const moving = Math.abs(target.x - current.x) > 0.05
      || Math.abs(target.progress - current.progress) > 0.0005;

    if (moving) scheduleRender();
    else scene.classList.remove('is-moving');
  }

  function scheduleRender() {
    if (reducedMotion || rafId) return;
    scene.classList.add('is-moving');
    rafId = requestAnimationFrame(renderParallax);
  }

  function isGameControl(targetNode) {
    return targetNode instanceof Element
      && Boolean(targetNode.closest('button, input, select, .word-card, .result-list'));
  }

  function startParallaxDrag(event) {
    if (isGameControl(event.target)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag.id = event.pointerId;
    drag.startX = drag.lastX = event.clientX;
    drag.startY = event.clientY;
    drag.axis = null;
  }

  function moveParallaxDrag(event) {
    if (drag.id !== event.pointerId) return;
    const totalX = event.clientX - drag.startX;
    const totalY = event.clientY - drag.startY;

    if (!drag.axis && Math.hypot(totalX, totalY) >= 8) {
      drag.axis = Math.abs(totalX) > Math.abs(totalY) * 1.15 ? 'horizontal' : 'vertical';
    }
    if (drag.axis !== 'horizontal') return;

    event.preventDefault();
    const delta = event.clientX - drag.lastX;
    drag.lastX = event.clientX;
    target.x = clamp(target.x + delta / 155, -1, 1);
    scheduleRender();
  }

  function endParallaxDrag(event) {
    if (event.pointerId !== drag.id) return;
    drag.id = null;
    drag.axis = null;
  }

  async function ensureAsset(element) {
    if (!element) return;
    if (!element.getAttribute('src') && element.dataset.src) element.src = element.dataset.src;
    try {
      await element.decode();
    } catch {
      // Cached images can still be ready when decode() rejects.
    }
  }

  function replayClass(element, className) {
    if (!element || reducedMotion) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    element.addEventListener('animationend', () => element.classList.remove(className), { once: true });
  }

  async function playSceneEvent(id, className) {
    const element = byId(id);
    await ensureAsset(element);
    replayClass(element, className);
  }

  const difficultyMeta = {
    easy: { title: 'Лёгкий', description: 'Знакомые персонажи, места и предметы', path: '/data/easy.json' },
    medium: { title: 'Средний', description: 'Термины, события и образы Писания', path: '/data/medium.json' },
    hard: { title: 'Тяжёлый', description: 'Редкие понятия и сложные имена', path: '/data/hard.json' },
  };

  const state = {
    screen: 'difficulty',
    difficulty: null,
    duration: 30,
    teamCount: 2,
    currentTeam: 1,
    round: 1,
    scores: [0, 0],
    wordsByDifficulty: new Map(),
    usedWords: new Set(),
    deck: [],
    deckIndex: 0,
    roundItems: [],
  };

  let timerHandle = 0;
  let deadline = 0;
  let lastTimerValue = null;
  let actionLocked = false;
  const cardSwipe = { id: null, startX: 0, startY: 0 };

  function escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function randomInt(max) {
    if (max <= 1) return 0;
    const limit = Math.floor(0x100000000 / max) * max;
    const values = new Uint32Array(1);
    do crypto.getRandomValues(values); while (values[0] >= limit);
    return values[0] % max;
  }

  function shuffle(values) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = randomInt(index + 1);
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  function normaliseWord(word) {
    return String(word || '').trim().toLocaleLowerCase('ru');
  }

  function resetScores() {
    state.scores = Array.from({ length: state.teamCount }, () => 0);
    state.currentTeam = 1;
    state.round = 1;
    state.usedWords.clear();
  }

  function renderScores() {
    if (state.screen === 'difficulty') {
      scoreStrip.replaceChildren();
      return;
    }
    scoreStrip.innerHTML = state.scores.map((score, index) => `
      <span class="score-pill ${index + 1 === state.currentTeam ? 'is-active' : ''}">
        Команда ${index + 1} · <b>${score}</b>
      </span>
    `).join('');
  }

  function renderDifficulty() {
    clearTimer();
    state.screen = 'difficulty';
    scene.classList.remove('is-urgent');
    renderScores();
    stage.innerHTML = `
      <article class="game-panel">
        <p class="kicker">Игра на объяснение слов</p>
        <h1>Соберите команду</h1>
        <p class="lead">Объясняйте слова, не называя их напрямую. Чем быстрее команда угадывает, тем ярче оживает рыночная площадь.</p>
        <div class="choice-grid">
          ${Object.entries(difficultyMeta).map(([key, meta]) => `
            <button class="choice-button" type="button" data-difficulty="${key}">
              <span class="difficulty-dot ${key}"></span>
              <span><b>${meta.title}</b><small>${meta.description}</small></span>
            </button>
          `).join('')}
        </div>
      </article>
    `;

    stage.querySelectorAll('[data-difficulty]').forEach((button) => {
      button.addEventListener('click', () => chooseDifficulty(button.dataset.difficulty));
    });
  }

  async function chooseDifficulty(difficulty) {
    if (!difficultyMeta[difficulty]) return;
    const buttons = [...stage.querySelectorAll('[data-difficulty]')];
    buttons.forEach((button) => { button.disabled = true; });

    try {
      if (!state.wordsByDifficulty.has(difficulty)) {
        const response = await fetch(difficultyMeta[difficulty].path, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const words = await response.json();
        if (!Array.isArray(words) || words.length < 20) throw new Error('Недостаточно слов');
        const uniqueWords = [];
        const seenWords = new Set();
        words.forEach((word) => {
          const cleaned = String(word).trim();
          const key = normaliseWord(cleaned);
          if (!key || seenWords.has(key)) return;
          seenWords.add(key);
          uniqueWords.push(cleaned);
        });
        if (uniqueWords.length < 20) throw new Error('Недостаточно уникальных слов');
        state.wordsByDifficulty.set(difficulty, uniqueWords);
      }
      state.difficulty = difficulty;
      resetScores();
      renderSetup();
      playSceneEvent('lanternGlow', 'pulse');
    } catch (error) {
      console.error('Alias dictionary load failed', error);
      buttons.forEach((button) => { button.disabled = false; });
      stage.querySelector('.lead').textContent = 'Не удалось загрузить словарь. Проверьте соединение и попробуйте снова.';
    }
  }

  function teamOptions(count, selected) {
    return Array.from({ length: count }, (_, index) => index + 1)
      .map((team) => `<option value="${team}" ${team === selected ? 'selected' : ''}>Команда ${team}</option>`)
      .join('');
  }

  function renderSetup() {
    clearTimer();
    state.screen = 'setup';
    renderScores();
    const meta = difficultyMeta[state.difficulty];
    stage.innerHTML = `
      <article class="game-panel">
        <p class="kicker">Раунд ${state.round} · ${meta.title} уровень</p>
        <h2>Настройте раунд</h2>
        <p class="lead">Передайте телефон ведущему команды. Во время раунда можно использовать кнопки или горячие клавиши.</p>
        <div class="form-grid">
          <label class="field">
            <span>Время раунда, секунд</span>
            <input id="durationInput" type="number" inputmode="numeric" min="5" max="180" value="${state.duration}">
          </label>
          <label class="field">
            <span>Количество команд</span>
            <select id="teamCountSelect">
              ${[1, 2, 3, 4, 5].map((count) => `<option value="${count}" ${count === state.teamCount ? 'selected' : ''}>${count}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>Кто играет сейчас</span>
            <select id="currentTeamSelect">${teamOptions(state.teamCount, state.currentTeam)}</select>
          </label>
        </div>
        <div class="button-stack">
          <button class="primary-button" id="startRound" type="button">Начать раунд</button>
          <button class="secondary-button" id="changeDifficulty" type="button">Выбрать другую сложность</button>
        </div>
      </article>
    `;

    const countSelect = byId('teamCountSelect');
    const currentSelect = byId('currentTeamSelect');
    countSelect.addEventListener('change', () => {
      const nextCount = clamp(Number(countSelect.value) || 2, 1, 5);
      state.teamCount = nextCount;
      state.scores = Array.from({ length: nextCount }, (_, index) => state.scores[index] || 0);
      state.currentTeam = clamp(state.currentTeam, 1, nextCount);
      currentSelect.innerHTML = teamOptions(nextCount, state.currentTeam);
      renderScores();
    });
    currentSelect.addEventListener('change', () => {
      state.currentTeam = clamp(Number(currentSelect.value) || 1, 1, state.teamCount);
      renderScores();
    });
    byId('startRound').addEventListener('click', startRound);
    byId('changeDifficulty').addEventListener('click', renderDifficulty);
  }

  function buildDeck() {
    const allWords = state.wordsByDifficulty.get(state.difficulty) || [];
    let unused = allWords.filter((word) => !state.usedWords.has(normaliseWord(word)));
    if (!unused.length) {
      state.usedWords.clear();
      unused = [...allWords];
    }
    state.deck = shuffle(unused);
    state.deckIndex = 0;
  }

  function startRound() {
    const duration = clamp(Number(byId('durationInput')?.value) || state.duration, 5, 180);
    state.duration = duration;
    state.teamCount = clamp(Number(byId('teamCountSelect')?.value) || state.teamCount, 1, 5);
    state.currentTeam = clamp(Number(byId('currentTeamSelect')?.value) || state.currentTeam, 1, state.teamCount);
    state.scores = Array.from({ length: state.teamCount }, (_, index) => state.scores[index] || 0);
    state.roundItems = [];
    buildDeck();
    state.screen = 'round';
    actionLocked = false;
    deadline = Date.now() + duration * 1000;
    renderRound();
    updateTimer();
    playSceneEvent('lanternGlow', 'pulse');
    navigator.vibrate?.(18);
  }

  function renderRound() {
    renderScores();
    stage.innerHTML = `
      <article class="game-panel game-panel--round">
        <div class="round-top">
          <div class="round-label">Раунд ${state.round}<strong>Команда ${state.currentTeam}</strong></div>
          <div class="timer" id="timer" aria-live="polite">${state.duration}</div>
        </div>
        <div class="word-card" id="wordCard" tabindex="0" aria-live="polite"><strong id="wordValue"></strong></div>
        <div class="answer-grid">
          <button class="answer-button good" type="button" data-answer="correct">Отгадано</button>
          <button class="answer-button bad" type="button" data-answer="wrong">Не отгадано</button>
          <button class="answer-button skip" type="button" data-answer="skip">Пропустить</button>
        </div>
        <p class="round-help">Enter — отгадано · Backspace — не отгадано · Space — пропуск<br>Свайп карточки вправо — отгадано, влево — пропуск</p>
      </article>
    `;

    showCurrentWord();
    stage.querySelectorAll('[data-answer]').forEach((button) => {
      button.addEventListener('click', () => recordAnswer(button.dataset.answer));
    });

    const card = byId('wordCard');
    card.addEventListener('pointerdown', startCardSwipe, { passive: true });
    card.addEventListener('pointerup', endCardSwipe, { passive: true });
    card.addEventListener('pointercancel', cancelCardSwipe, { passive: true });
  }

  function currentWord() {
    return state.deck[state.deckIndex] || '';
  }

  function showCurrentWord() {
    const value = byId('wordValue');
    const card = byId('wordCard');
    if (!value || !card) return;
    value.textContent = currentWord();
    card.classList.remove('is-correct', 'is-wrong', 'is-skip', 'is-changing');
    void card.offsetWidth;
    card.classList.add('is-changing');
  }

  function startCardSwipe(event) {
    if (state.screen !== 'round') return;
    cardSwipe.id = event.pointerId;
    cardSwipe.startX = event.clientX;
    cardSwipe.startY = event.clientY;
  }

  function endCardSwipe(event) {
    if (event.pointerId !== cardSwipe.id) return;
    const deltaX = event.clientX - cardSwipe.startX;
    const deltaY = event.clientY - cardSwipe.startY;
    cancelCardSwipe();
    if (Math.abs(deltaX) < 65 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
    recordAnswer(deltaX > 0 ? 'correct' : 'skip');
  }

  function cancelCardSwipe() {
    cardSwipe.id = null;
  }

  function statusValue(status) {
    if (status === 'correct') return true;
    if (status === 'wrong') return false;
    return null;
  }

  function recordAnswer(status) {
    if (state.screen !== 'round' || actionLocked || !currentWord()) return;
    actionLocked = true;
    const value = statusValue(status);
    const word = currentWord();
    state.roundItems.push({ word, value });
    state.usedWords.add(normaliseWord(word));
    if (value === true) state.scores[state.currentTeam - 1] += 1;
    renderScores();

    const card = byId('wordCard');
    card?.classList.remove('is-changing');
    card?.classList.add(status === 'correct' ? 'is-correct' : status === 'wrong' ? 'is-wrong' : 'is-skip');

    if (status === 'correct') {
      playSceneEvent('correctSparks', 'play');
      playSceneEvent('lanternGlow', 'pulse');
      navigator.vibrate?.(20);
    } else if (status === 'skip') {
      playSceneEvent('skipDust', 'play');
      navigator.vibrate?.(8);
    } else {
      navigator.vibrate?.([10, 30, 10]);
    }

    setTimeout(() => {
      if (state.screen !== 'round') return;
      state.deckIndex += 1;
      if (state.deckIndex >= state.deck.length) {
        endRound();
        return;
      }
      actionLocked = false;
      showCurrentWord();
    }, reducedMotion ? 0 : 290);
  }

  function updateTimer() {
    if (state.screen !== 'round') return;
    const remainingMs = Math.max(0, deadline - Date.now());
    const seconds = Math.ceil(remainingMs / 1000);
    const timer = byId('timer');

    if (seconds !== lastTimerValue) {
      lastTimerValue = seconds;
      if (timer) {
        timer.textContent = seconds;
        timer.classList.toggle('is-urgent', seconds <= 10);
      }
      if (seconds === 10) scene.classList.add('is-urgent');
    }

    if (remainingMs <= 0) {
      endRound();
      return;
    }

    const untilNextSecond = remainingMs - Math.max(0, seconds - 1) * 1000;
    timerHandle = setTimeout(updateTimer, clamp(untilNextSecond + 24, 120, 1024));
  }

  function clearTimer() {
    clearTimeout(timerHandle);
    timerHandle = 0;
    lastTimerValue = null;
  }

  function endRound() {
    if (state.screen !== 'round') return;
    clearTimer();
    state.screen = 'results';
    actionLocked = false;
    scene.classList.remove('is-urgent');
    renderResults();
    playSceneEvent('roundFinish', 'play');
    navigator.vibrate?.([22, 35, 22]);
  }

  function resultCounts() {
    return {
      correct: state.roundItems.filter((item) => item.value === true).length,
      wrong: state.roundItems.filter((item) => item.value === false).length,
      skipped: state.roundItems.filter((item) => item.value === null).length,
    };
  }

  function resultRow(item, index) {
    return `
      <div class="result-row">
        <span class="result-word" title="${escapeHTML(item.word)}">${escapeHTML(item.word)}</span>
        <button class="edit-button good ${item.value === true ? 'is-selected' : ''}" type="button" data-edit="${index}" data-value="correct" aria-label="Засчитать">✓</button>
        <button class="edit-button bad ${item.value === false ? 'is-selected' : ''}" type="button" data-edit="${index}" data-value="wrong" aria-label="Не засчитать">×</button>
        <button class="edit-button skip ${item.value === null ? 'is-selected' : ''}" type="button" data-edit="${index}" data-value="skip" aria-label="Пропустить">→</button>
      </div>
    `;
  }

  function renderResults() {
    renderScores();
    const counts = resultCounts();
    stage.innerHTML = `
      <article class="game-panel game-panel--results">
        <p class="kicker">Раунд ${state.round} завершён</p>
        <h2>Команда ${state.currentTeam}: +${counts.correct}</h2>
        <p class="lead">Проверьте результаты. Любой ответ можно исправить до следующего раунда.</p>
        <div class="results-summary">
          <div class="summary-cell"><b>${counts.correct}</b><span>ОТГАДАНО</span></div>
          <div class="summary-cell"><b>${counts.wrong}</b><span>НЕ ОТГАДАНО</span></div>
          <div class="summary-cell"><b>${counts.skipped}</b><span>ПРОПУЩЕНО</span></div>
        </div>
        <div class="result-list">
          ${state.roundItems.length ? state.roundItems.map(resultRow).join('') : '<p class="hint">В этом раунде не было отмеченных слов.</p>'}
        </div>
        <div class="button-stack">
          <button class="primary-button" id="nextRound" type="button">Передать следующей команде</button>
          <button class="secondary-button" id="restartGame" type="button">Новая игра</button>
        </div>
      </article>
    `;

    stage.querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', () => editResult(Number(button.dataset.edit), button.dataset.value));
    });
    byId('nextRound').addEventListener('click', prepareNextRound);
    byId('restartGame').addEventListener('click', renderDifficulty);
  }

  function editResult(index, status) {
    const item = state.roundItems[index];
    if (!item) return;
    const previous = item.value;
    const next = statusValue(status);
    if (previous === next) return;
    if (previous === true) state.scores[state.currentTeam - 1] = Math.max(0, state.scores[state.currentTeam - 1] - 1);
    if (next === true) state.scores[state.currentTeam - 1] += 1;
    item.value = next;
    renderResults();
  }

  function prepareNextRound() {
    state.currentTeam = state.currentTeam % state.teamCount + 1;
    state.round += 1;
    renderSetup();
    playSceneEvent('lanternGlow', 'pulse');
  }

  function onKeydown(event) {
    if (state.screen !== 'round') return;
    if (event.target instanceof Element && event.target.closest('input, select, textarea, button')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      recordAnswer('correct');
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      recordAnswer('wrong');
    } else if (event.code === 'Space') {
      event.preventDefault();
      recordAnswer('skip');
    }
  }

  addEventListener('scroll', readScroll, { passive: true });
  addEventListener('resize', readScroll, { passive: true });
  addEventListener('pointerdown', startParallaxDrag, { passive: true });
  addEventListener('pointermove', moveParallaxDrag, { passive: false });
  addEventListener('pointerup', endParallaxDrag, { passive: true });
  addEventListener('pointercancel', endParallaxDrag, { passive: true });
  addEventListener('keydown', onKeydown);
  addEventListener('pagehide', clearTimer);

  byId('resetView').addEventListener('click', () => {
    target.x = 0;
    scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    scheduleRender();
  });

  readScroll();
  renderDifficulty();
})();
