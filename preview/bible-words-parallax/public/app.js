(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const stage = byId('gameStage');
  const scene = byId('scene');
  const toast = byId('toast');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STORAGE_KEY = 'bibleWordsParallaxReviewV1';
  const HINT_COST = 6;
  const REVEAL_COST = 20;

  const parallaxLayers = {
    base: byId('templeBase'),
    sanctuary: byId('distantSanctuary'),
    beams: byId('moonbeams'),
    dust: byId('dustMotes'),
    left: byId('leftArch'),
    right: byId('rightArch'),
    ledge: byId('scriptoriumLedge'),
  };

  const layerDepths = {
    base: [2, 2],
    sanctuary: [7, 5],
    beams: [13, 9],
    dust: [21, 13],
    left: [38, 22],
    right: [42, 24],
    ledge: [49, 29],
  };

  const parallaxTarget = { x: 0, progress: 0 };
  const parallaxCurrent = { x: 0, progress: 0 };
  const parallaxDrag = { id: null, startX: 0, startY: 0, lastX: 0, axis: null };
  let parallaxFrame = 0;

  const state = {
    levels: [],
    levelIndex: 0,
    current: null,
    layout: { placed: [] },
    stars: 20,
    completed: new Set(),
    foundByLevel: {},
    hintsByLevel: {},
    bonusByLevel: {},
    foundWords: new Set(),
    hintedCells: new Set(),
    bonusFound: new Set(),
    wheelLetters: [],
    inputPath: [],
    inputWord: '',
    wheelHandlers: null,
    toastTimer: 0,
    resizeTimer: 0,
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function normaliseWord(value) {
    return String(value || '')
      .toLocaleUpperCase('ru')
      .replaceAll('Ё', 'Е')
      .replace(/[^А-Я]/g, '');
  }

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

  function shuffled(values) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = randomInt(index + 1);
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  function readScrollPosition() {
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    parallaxTarget.progress = clamp(scrollY / maxScroll, 0, 1);
    scheduleParallax();
  }

  function renderParallax() {
    parallaxFrame = 0;
    if (reducedMotion) {
      scene.classList.remove('is-moving');
      return;
    }

    parallaxCurrent.x += (parallaxTarget.x - parallaxCurrent.x) * 0.14;
    parallaxCurrent.progress += (parallaxTarget.progress - parallaxCurrent.progress) * 0.12;

    Object.entries(parallaxLayers).forEach(([name, element]) => {
      const [horizontalDepth, verticalDepth] = layerDepths[name];
      const x = parallaxCurrent.x * horizontalDepth;
      const y = -parallaxCurrent.progress * verticalDepth;
      element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(1.08)`;
    });

    const moving = Math.abs(parallaxTarget.x - parallaxCurrent.x) > 0.05
      || Math.abs(parallaxTarget.progress - parallaxCurrent.progress) > 0.0005;

    if (moving) scheduleParallax();
    else scene.classList.remove('is-moving');
  }

  function scheduleParallax() {
    if (reducedMotion || parallaxFrame) return;
    scene.classList.add('is-moving');
    parallaxFrame = requestAnimationFrame(renderParallax);
  }

  function isGameplayTarget(target) {
    return target instanceof Element
      && Boolean(target.closest('button, dialog, .word-wheel, .crossword, .level-list, .bonus-list'));
  }

  function beginParallaxDrag(event) {
    if (isGameplayTarget(event.target)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    parallaxDrag.id = event.pointerId;
    parallaxDrag.startX = parallaxDrag.lastX = event.clientX;
    parallaxDrag.startY = event.clientY;
    parallaxDrag.axis = null;
  }

  function moveParallaxDrag(event) {
    if (event.pointerId !== parallaxDrag.id) return;
    const totalX = event.clientX - parallaxDrag.startX;
    const totalY = event.clientY - parallaxDrag.startY;
    if (!parallaxDrag.axis && Math.hypot(totalX, totalY) >= 8) {
      parallaxDrag.axis = Math.abs(totalX) > Math.abs(totalY) * 1.15 ? 'horizontal' : 'vertical';
    }
    if (parallaxDrag.axis !== 'horizontal') return;
    event.preventDefault();
    const delta = event.clientX - parallaxDrag.lastX;
    parallaxDrag.lastX = event.clientX;
    parallaxTarget.x = clamp(parallaxTarget.x + delta / 155, -1, 1);
    scheduleParallax();
  }

  function endParallaxDrag(event) {
    if (event.pointerId !== parallaxDrag.id) return;
    parallaxDrag.id = null;
    parallaxDrag.axis = null;
  }

  function resetParallax() {
    parallaxTarget.x = 0;
    parallaxTarget.progress = 0;
    scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    scheduleParallax();
  }

  async function ensureAsset(element) {
    if (!element) return;
    if (!element.getAttribute('src') && element.dataset.src) element.src = element.dataset.src;
    try {
      await element.decode();
    } catch {
      // A cached image can be ready even if decode() rejects.
    }
  }

  function replayClass(element, className) {
    if (!element || reducedMotion) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    element.addEventListener('animationend', () => element.classList.remove(className), { once: true });
  }

  async function playSceneEvent(id, className = 'is-playing') {
    const element = byId(id);
    await ensureAsset(element);
    replayClass(element, className);
  }

  function showToast(message) {
    clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.remove('is-visible');
    void toast.offsetWidth;
    toast.classList.add('is-visible');
    state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1500);
  }

  function loadPersisted() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.levelIndex = Number.isInteger(parsed.levelIndex) ? Math.max(0, parsed.levelIndex) : 0;
      state.stars = Number.isFinite(parsed.stars) ? Math.max(0, Math.floor(parsed.stars)) : 20;
      state.completed = new Set(Array.isArray(parsed.completed) ? parsed.completed.map(Number).filter(Number.isFinite) : []);
      state.foundByLevel = parsed.foundByLevel && typeof parsed.foundByLevel === 'object' ? parsed.foundByLevel : {};
      state.hintsByLevel = parsed.hintsByLevel && typeof parsed.hintsByLevel === 'object' ? parsed.hintsByLevel : {};
      state.bonusByLevel = parsed.bonusByLevel && typeof parsed.bonusByLevel === 'object' ? parsed.bonusByLevel : {};
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function savePersisted() {
    if (state.current) {
      const key = String(state.current.id);
      state.foundByLevel[key] = [...state.foundWords];
      state.hintsByLevel[key] = [...state.hintedCells];
      state.bonusByLevel[key] = [...state.bonusFound];
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        levelIndex: state.levelIndex,
        stars: state.stars,
        completed: [...state.completed],
        foundByLevel: state.foundByLevel,
        hintsByLevel: state.hintsByLevel,
        bonusByLevel: state.bonusByLevel,
      }));
    } catch {
      // The review remains playable if storage is unavailable.
    }
  }

  function gridKey(row, column) {
    return `${row},${column}`;
  }

  function gridBounds(placed) {
    let minRow = Infinity;
    let maxRow = -Infinity;
    let minColumn = Infinity;
    let maxColumn = -Infinity;
    placed.forEach((item) => {
      const endRow = item.row + item.rowStep * (item.word.length - 1);
      const endColumn = item.column + item.columnStep * (item.word.length - 1);
      minRow = Math.min(minRow, item.row, endRow);
      maxRow = Math.max(maxRow, item.row, endRow);
      minColumn = Math.min(minColumn, item.column, endColumn);
      maxColumn = Math.max(maxColumn, item.column, endColumn);
    });
    return { minRow, maxRow, minColumn, maxColumn };
  }

  function canPlaceWord(grid, word, row, column, rowStep, columnStep, requireIntersection) {
    const before = gridKey(row - rowStep, column - columnStep);
    const after = gridKey(row + rowStep * word.length, column + columnStep * word.length);
    if (grid.has(before) || grid.has(after)) return false;

    let intersections = 0;
    for (let index = 0; index < word.length; index += 1) {
      const cellRow = row + rowStep * index;
      const cellColumn = column + columnStep * index;
      const key = gridKey(cellRow, cellColumn);
      const existing = grid.get(key);
      if (existing && existing !== word[index]) return false;
      if (existing === word[index]) {
        intersections += 1;
        continue;
      }

      const sideA = gridKey(cellRow + columnStep, cellColumn + rowStep);
      const sideB = gridKey(cellRow - columnStep, cellColumn - rowStep);
      if (grid.has(sideA) || grid.has(sideB)) return false;
    }
    return !requireIntersection || intersections > 0;
  }

  function placeWord(grid, placed, word, row, column, rowStep, columnStep) {
    for (let index = 0; index < word.length; index += 1) {
      grid.set(gridKey(row + rowStep * index, column + columnStep * index), word[index]);
    }
    placed.push({ word, row, column, rowStep, columnStep });
  }

  function placementScore(placed, word, row, column, rowStep, columnStep) {
    const preview = [...placed, { word, row, column, rowStep, columnStep }];
    const bounds = gridBounds(preview);
    const width = bounds.maxColumn - bounds.minColumn + 1;
    const height = bounds.maxRow - bounds.minRow + 1;
    return width * height * 10 + Math.abs(row) + Math.abs(column) + Math.abs(width - height) * 2;
  }

  function generateLayout(words) {
    const remaining = [...new Set(words)].sort((left, right) => right.length - left.length || left.localeCompare(right, 'ru'));
    const grid = new Map();
    const placed = [];
    if (!remaining.length) return { placed, grid };

    const first = remaining.shift();
    placeWord(grid, placed, first, 0, -Math.floor(first.length / 2), 0, 1);

    while (remaining.length) {
      let best = null;
      remaining.forEach((word, wordIndex) => {
        placed.forEach((anchor) => {
          for (let anchorIndex = 0; anchorIndex < anchor.word.length; anchorIndex += 1) {
            for (let wordLetter = 0; wordLetter < word.length; wordLetter += 1) {
              if (anchor.word[anchorIndex] !== word[wordLetter]) continue;
              const crossRow = anchor.row + anchor.rowStep * anchorIndex;
              const crossColumn = anchor.column + anchor.columnStep * anchorIndex;
              const rowStep = anchor.columnStep;
              const columnStep = anchor.rowStep;
              const row = crossRow - rowStep * wordLetter;
              const column = crossColumn - columnStep * wordLetter;
              if (!canPlaceWord(grid, word, row, column, rowStep, columnStep, true)) continue;
              const score = placementScore(placed, word, row, column, rowStep, columnStep);
              if (!best || score < best.score) {
                best = { word, wordIndex, row, column, rowStep, columnStep, score };
              }
            }
          }
        });
      });

      if (!best) break;
      placeWord(grid, placed, best.word, best.row, best.column, best.rowStep, best.columnStep);
      remaining.splice(best.wordIndex, 1);
    }

    remaining.forEach((word) => {
      const bounds = gridBounds(placed);
      let row = bounds.maxRow + 2;
      const column = -Math.floor(word.length / 2);
      while (!canPlaceWord(grid, word, row, column, 0, 1, false)) row += 2;
      placeWord(grid, placed, word, row, column, 0, 1);
    });

    return { placed, grid };
  }

  function renderShell() {
    const level = state.current;
    stage.innerHTML = `
      <article class="game-layout" data-level="${level.id}">
        <header class="game-toolbar">
          <div class="level-control">
            <button class="tiny-button" id="previousLevel" type="button" aria-label="Предыдущий уровень" ${state.levelIndex === 0 ? 'disabled' : ''}>‹</button>
            <button class="level-button" id="openLevels" type="button">
              <span>Свиток</span>
              <strong>Уровень ${level.id}</strong>
            </button>
            <button class="tiny-button" id="followingLevel" type="button" aria-label="Следующий уровень" ${state.levelIndex === state.levels.length - 1 ? 'disabled' : ''}>›</button>
          </div>
          <div class="progress-summary">
            <strong id="progressTitle">${state.foundWords.size} из ${level.words.length}</strong>
            <span id="progressText">Слова в храме</span>
          </div>
          <div class="stars-chip" aria-label="Звёзды"><span aria-hidden="true">✦</span><b id="starsValue">${state.stars}</b></div>
        </header>

        <section class="board-panel" id="boardPanel" aria-label="Кроссворд уровня ${level.id}">
          <span class="board-empty-note">ЗОЛОТЫЕ ЯЧЕЙКИ · НАЙДЕННЫЕ СЛОВА</span>
          <div class="crossword" id="crossword"></div>
        </section>

        <section class="control-panel">
          <div class="word-area">
            <div class="word-preview" id="wordPreview" aria-live="polite"></div>
            <div class="word-wheel" id="wordWheel" aria-label="Колесо букв">
              <canvas class="wheel-canvas" id="wheelCanvas"></canvas>
              <button class="shuffle-button" id="shuffleLetters" type="button" aria-label="Перемешать буквы">⟳</button>
            </div>
          </div>

          <div class="action-stack">
            <button class="action-button" id="hintButton" type="button">Подсказка<span>${HINT_COST} ✦</span></button>
            <button class="action-button" id="revealButton" type="button">Открыть слово<span>${REVEAL_COST} ✦</span></button>
            <button class="action-button bonus-button" id="openBonus" type="button">Бонусы<span id="bonusCount">${state.bonusFound.size}</span></button>
            <button class="action-button reset-level-button" id="resetLevel" type="button">Начать заново</button>
          </div>
        </section>
      </article>
    `;

    byId('previousLevel').addEventListener('click', () => goToLevel(state.levelIndex - 1));
    byId('followingLevel').addEventListener('click', () => goToLevel(state.levelIndex + 1));
    byId('openLevels').addEventListener('click', openLevelsDialog);
    byId('hintButton').addEventListener('click', giveHint);
    byId('revealButton').addEventListener('click', revealWord);
    byId('openBonus').addEventListener('click', openBonusDialog);
    byId('resetLevel').addEventListener('click', resetCurrentLevel);
    byId('shuffleLetters').addEventListener('click', shuffleWheel);

    renderGrid();
    renderWheel();
    updateStatus();
  }

  function updateStatus() {
    const stars = byId('starsValue');
    const title = byId('progressTitle');
    const text = byId('progressText');
    const bonus = byId('bonusCount');
    const hint = byId('hintButton');
    const reveal = byId('revealButton');
    if (stars) stars.textContent = String(state.stars);
    if (title) title.textContent = `${state.foundWords.size} из ${state.current.words.length}`;
    if (text) text.textContent = state.foundWords.size === state.current.words.length ? 'Письмена пробуждены' : 'Слова в храме';
    if (bonus) bonus.textContent = String(state.bonusFound.size);
    if (hint) hint.disabled = state.stars < HINT_COST || state.foundWords.size === state.current.words.length;
    if (reveal) reveal.disabled = state.stars < REVEAL_COST || state.foundWords.size === state.current.words.length;
  }

  function renderGrid(newWord = '') {
    const gridElement = byId('crossword');
    const board = byId('boardPanel');
    if (!gridElement || !board) return;
    gridElement.replaceChildren();

    const placed = state.layout.placed;
    const bounds = gridBounds(placed);
    const rows = bounds.maxRow - bounds.minRow + 1;
    const columns = bounds.maxColumn - bounds.minColumn + 1;
    const availableWidth = Math.max(240, board.clientWidth - 28);
    const availableHeight = Math.max(180, board.clientHeight - 42);
    const cellSize = clamp(Math.floor(Math.min(availableWidth / columns, availableHeight / rows)), 24, 38);
    gridElement.style.setProperty('--rows', rows);
    gridElement.style.setProperty('--cols', columns);
    gridElement.style.setProperty('--cell', `${cellSize}px`);

    const cells = new Map();
    placed.forEach((item) => {
      const solved = state.foundWords.has(item.word);
      for (let index = 0; index < item.word.length; index += 1) {
        const row = item.row + item.rowStep * index;
        const column = item.column + item.columnStep * index;
        const key = gridKey(row, column);
        const value = cells.get(key) || { letter: item.word[index], solved: false, newOrder: null };
        value.solved ||= solved;
        if (item.word === newWord) value.newOrder = index;
        cells.set(key, value);
      }
    });

    cells.forEach((value, key) => {
      const [row, column] = key.split(',').map(Number);
      const cell = document.createElement('span');
      cell.className = 'crossword-cell';
      cell.style.gridRow = String(row - bounds.minRow + 1);
      cell.style.gridColumn = String(column - bounds.minColumn + 1);
      if (value.solved) {
        cell.textContent = value.letter;
        cell.classList.add('is-solved');
      } else if (state.hintedCells.has(key)) {
        cell.textContent = value.letter;
        cell.classList.add('is-hinted');
      } else {
        cell.setAttribute('aria-label', 'Скрытая буква');
      }
      if (value.newOrder !== null) {
        cell.classList.add('is-new');
        cell.style.setProperty('--order', value.newOrder);
      }
      gridElement.appendChild(cell);
    });
  }

  function detachWheelHandlers() {
    const wheel = byId('wordWheel');
    const handlers = state.wheelHandlers;
    if (!wheel || !handlers) return;
    wheel.removeEventListener('pointerdown', handlers.pointerDown);
    wheel.removeEventListener('pointermove', handlers.pointerMove);
    wheel.removeEventListener('pointerup', handlers.pointerUp);
    wheel.removeEventListener('pointercancel', handlers.pointerCancel);
    state.wheelHandlers = null;
  }

  function renderWheel() {
    const wheel = byId('wordWheel');
    if (!wheel) return;
    detachWheelHandlers();
    wheel.querySelectorAll('.letter-button').forEach((button) => button.remove());
    const count = state.wheelLetters.length;
    state.wheelLetters.forEach((letter, index) => {
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
      const radius = count >= 10 ? 39 : 36;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `letter-button${count >= 10 ? ' is-dense' : ''}`;
      button.textContent = letter;
      button.dataset.index = String(index);
      button.dataset.letter = letter;
      button.style.left = `${50 + Math.cos(angle) * radius}%`;
      button.style.top = `${50 + Math.sin(angle) * radius}%`;
      button.setAttribute('aria-label', `Буква ${letter}`);
      wheel.appendChild(button);
    });
    attachWheelHandlers();
    clearWheelCanvas();
  }

  function updateWordPreview() {
    const preview = byId('wordPreview');
    if (preview) preview.textContent = state.inputWord;
  }

  function prepareCanvas() {
    const canvas = byId('wheelCanvas');
    const wheel = byId('wordWheel');
    if (!canvas || !wheel) return null;
    const rect = wheel.getBoundingClientRect();
    const ratio = Math.min(2, devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    return { canvas, wheel, context, rect };
  }

  function clearWheelCanvas() {
    prepareCanvas();
  }

  function drawSelection(extraPoint) {
    const prepared = prepareCanvas();
    if (!prepared || !state.inputPath.length) return;
    const { context, rect } = prepared;
    const buttons = [...document.querySelectorAll('.letter-button')];
    const positions = [];
    buttons.forEach((button) => {
      const buttonRect = button.getBoundingClientRect();
      positions[Number(button.dataset.index)] = {
        x: buttonRect.left - rect.left + buttonRect.width / 2,
        y: buttonRect.top - rect.top + buttonRect.height / 2,
      };
    });
    const points = state.inputPath.map((index) => positions[index]).filter(Boolean);
    if (extraPoint) points.push(extraPoint);
    if (points.length < 2) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.lineWidth = 9;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = 'rgba(245, 207, 111, 0.68)';
    context.shadowColor = 'rgba(92, 151, 255, 0.58)';
    context.shadowBlur = 12;
    context.stroke();
  }

  function attachWheelHandlers() {
    const wheel = byId('wordWheel');
    if (!wheel) return;
    const buttons = [...wheel.querySelectorAll('.letter-button')];
    let activePointer = null;

    function buttonAt(clientX, clientY) {
      const direct = document.elementFromPoint(clientX, clientY)?.closest?.('.letter-button');
      if (direct && wheel.contains(direct)) return direct;
      let closest = null;
      let distance = Infinity;
      buttons.forEach((button) => {
        const bounds = button.getBoundingClientRect();
        const x = bounds.left + bounds.width / 2;
        const y = bounds.top + bounds.height / 2;
        const nextDistance = Math.hypot(clientX - x, clientY - y);
        if (nextDistance < distance && nextDistance < bounds.width * 0.78) {
          closest = button;
          distance = nextDistance;
        }
      });
      return closest;
    }

    function selectButton(button) {
      if (!button) return;
      const index = Number(button.dataset.index);
      if (state.inputPath.includes(index)) return;
      state.inputPath.push(index);
      state.inputWord += button.dataset.letter;
      button.classList.add('is-active');
      updateWordPreview();
      if (navigator.vibrate) navigator.vibrate(8);
    }

    function clearSelection() {
      state.inputPath = [];
      state.inputWord = '';
      buttons.forEach((button) => button.classList.remove('is-active'));
      updateWordPreview();
      clearWheelCanvas();
    }

    function pointerDown(event) {
      if (event.target.closest('#shuffleLetters')) return;
      const button = buttonAt(event.clientX, event.clientY);
      if (!button || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      activePointer = event.pointerId;
      wheel.setPointerCapture?.(event.pointerId);
      clearSelection();
      selectButton(button);
    }

    function pointerMove(event) {
      if (event.pointerId !== activePointer) return;
      event.preventDefault();
      selectButton(buttonAt(event.clientX, event.clientY));
      const rect = wheel.getBoundingClientRect();
      drawSelection({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    }

    function finishPointer(event) {
      if (event.pointerId !== activePointer) return;
      event.preventDefault();
      const word = state.inputWord;
      activePointer = null;
      clearSelection();
      checkWord(word);
    }

    const handlers = {
      pointerDown,
      pointerMove,
      pointerUp: finishPointer,
      pointerCancel: finishPointer,
    };
    wheel.addEventListener('pointerdown', handlers.pointerDown, { passive: false });
    wheel.addEventListener('pointermove', handlers.pointerMove, { passive: false });
    wheel.addEventListener('pointerup', handlers.pointerUp, { passive: false });
    wheel.addEventListener('pointercancel', handlers.pointerCancel, { passive: false });
    state.wheelHandlers = handlers;
  }

  function shuffleWheel() {
    state.wheelLetters = shuffled(state.wheelLetters);
    renderWheel();
    showToast('Буквы перемешаны');
  }

  function completeLevelIfNeeded() {
    if (state.foundWords.size !== state.current.words.length) return;
    const levelId = Number(state.current.id);
    const firstCompletion = !state.completed.has(levelId);
    if (firstCompletion) {
      state.completed.add(levelId);
      state.stars += 10;
    }
    savePersisted();
    updateStatus();
    playSceneEvent('completeEffect');
    setTimeout(() => {
      const dialog = byId('completeDialog');
      const reward = dialog.querySelector('.complete-reward');
      reward.hidden = !firstCompletion;
      const nextButton = byId('nextLevelButton');
      nextButton.textContent = state.levelIndex < state.levels.length - 1 ? 'Следующий уровень' : 'Карта уровней';
      if (!dialog.open) dialog.showModal();
    }, reducedMotion ? 30 : 760);
  }

  function solveTargetWord(word, message) {
    state.foundWords.add(word);
    savePersisted();
    renderGrid(word);
    updateStatus();
    showToast(message || `Найдено: ${word}`);
    playSceneEvent('correctEffect');
    completeLevelIfNeeded();
  }

  function checkWord(rawWord) {
    const word = normaliseWord(rawWord);
    if (word.length < 2) return;
    if (state.current.words.includes(word)) {
      if (state.foundWords.has(word)) {
        showToast('Это слово уже найдено');
        return;
      }
      solveTargetWord(word, `Письмена открыли слово «${word}»`);
      return;
    }

    if (state.current.bonus.includes(word)) {
      if (state.bonusFound.has(word)) {
        showToast('Это слово уже есть в бонусах');
        return;
      }
      state.bonusFound.add(word);
      state.stars += 2;
      savePersisted();
      updateStatus();
      showToast(`Бонус «${word}» · +2 ✦`);
      replayClass(byId('openBonus'), 'is-lit');
      replayClass(byId('rightArch'), 'is-bonus-lit');
      return;
    }

    showToast('Такого слова нет на свитке');
    playSceneEvent('errorEffect');
  }

  function hiddenCandidates() {
    const candidates = [];
    const visibleCells = new Set();
    state.layout.placed.forEach((item) => {
      if (!state.foundWords.has(item.word)) return;
      for (let index = 0; index < item.word.length; index += 1) {
        visibleCells.add(gridKey(item.row + item.rowStep * index, item.column + item.columnStep * index));
      }
    });
    state.layout.placed.forEach((item) => {
      if (state.foundWords.has(item.word)) return;
      for (let index = 0; index < item.word.length; index += 1) {
        const key = gridKey(item.row + item.rowStep * index, item.column + item.columnStep * index);
        if (!visibleCells.has(key) && !state.hintedCells.has(key)) candidates.push({ key, letter: item.word[index] });
      }
    });
    return candidates;
  }

  function giveHint() {
    if (state.stars < HINT_COST) {
      showToast(`Для подсказки нужно ${HINT_COST} ✦`);
      return;
    }
    const candidates = hiddenCandidates();
    if (!candidates.length) {
      showToast('Все доступные буквы уже открыты');
      return;
    }
    const pick = candidates[randomInt(candidates.length)];
    state.stars -= HINT_COST;
    state.hintedCells.add(pick.key);
    savePersisted();
    renderGrid();
    updateStatus();
    showToast(`Подсказка открыла букву «${pick.letter}»`);
  }

  function revealWord() {
    if (state.stars < REVEAL_COST) {
      showToast(`Чтобы открыть слово, нужно ${REVEAL_COST} ✦`);
      return;
    }
    const remaining = state.current.words.filter((word) => !state.foundWords.has(word));
    if (!remaining.length) return;
    const word = remaining[randomInt(remaining.length)];
    state.stars -= REVEAL_COST;
    solveTargetWord(word, `Открыто слово «${word}»`);
  }

  function resetCurrentLevel() {
    if (!confirm(`Начать уровень ${state.current.id} заново? Потраченные на подсказки звёзды не возвращаются.`)) return;
    const key = String(state.current.id);
    if (state.completed.delete(Number(state.current.id))) state.stars = Math.max(0, state.stars - 10);
    state.stars = Math.max(0, state.stars - state.bonusFound.size * 2);
    delete state.foundByLevel[key];
    delete state.hintsByLevel[key];
    delete state.bonusByLevel[key];
    state.foundWords = new Set();
    state.hintedCells = new Set();
    state.bonusFound = new Set();
    savePersisted();
    startLevel();
    showToast('Уровень начат заново');
  }

  function renderLevelsDialog() {
    const list = byId('levelList');
    list.replaceChildren();
    state.levels.forEach((level, index) => {
      const button = document.createElement('button');
      const complete = state.completed.has(Number(level.id));
      const foundCount = Array.isArray(state.foundByLevel[String(level.id)]) ? state.foundByLevel[String(level.id)].length : 0;
      button.type = 'button';
      button.className = `level-tile${complete ? ' is-complete' : ''}${index === state.levelIndex ? ' is-current' : ''}`;
      button.innerHTML = `<b>${complete ? '✓ ' : ''}${level.id}</b><small>${complete ? 'пройден' : `${foundCount}/${level.words.length}`}</small>`;
      button.addEventListener('click', () => {
        byId('levelsDialog').close();
        goToLevel(index);
      });
      list.appendChild(button);
    });
  }

  function openLevelsDialog() {
    renderLevelsDialog();
    const dialog = byId('levelsDialog');
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => dialog.querySelector('.is-current')?.scrollIntoView({ block: 'center' }));
  }

  function openBonusDialog() {
    const list = byId('bonusList');
    const words = [...state.bonusFound].sort((left, right) => left.localeCompare(right, 'ru'));
    if (!words.length) {
      list.innerHTML = `<div class="bonus-empty">Соединяйте дополнительные слова из тех же букв — найденные надписи появятся здесь.</div>`;
    } else {
      list.innerHTML = words.map((word) => `<div class="bonus-item"><b>${escapeHTML(word)}</b><span>+2 ✦</span></div>`).join('');
    }
    const dialog = byId('bonusDialog');
    if (!dialog.open) dialog.showModal();
  }

  function goToLevel(index) {
    if (index < 0 || index >= state.levels.length) return;
    savePersisted();
    state.levelIndex = index;
    startLevel();
    scrollTo({ top: 0, behavior: 'auto' });
  }

  function startLevel() {
    detachWheelHandlers();
    state.levelIndex = clamp(state.levelIndex, 0, state.levels.length - 1);
    const raw = state.levels[state.levelIndex];
    const words = [...new Set((raw.words || []).map(normaliseWord).filter((word) => word.length >= 2))];
    const bonus = [...new Set((raw.bonus || raw.bonusWords || []).map(normaliseWord).filter((word) => word.length >= 3 && !words.includes(word)))];
    state.current = {
      id: Number(raw.id),
      letters: normaliseWord(raw.letters),
      words,
      bonus,
    };
    state.layout = generateLayout(words);
    const key = String(state.current.id);
    state.foundWords = new Set((state.foundByLevel[key] || []).map(normaliseWord).filter((word) => words.includes(word)));
    state.hintedCells = new Set((state.hintsByLevel[key] || []).map(String));
    state.bonusFound = new Set((state.bonusByLevel[key] || []).map(normaliseWord).filter((word) => bonus.includes(word)));
    if (state.completed.has(state.current.id)) state.foundWords = new Set(words);
    state.wheelLetters = state.current.letters.split('');
    state.inputPath = [];
    state.inputWord = '';
    savePersisted();
    renderShell();
  }

  function renderLoadError(error) {
    console.error(error);
    stage.innerHTML = `
      <div class="error-card">
        <span class="loading-seal">!</span>
        <strong>Не удалось открыть список уровней</strong>
        <span>Проверьте соединение и попробуйте снова.</span>
        <button class="primary-button" id="retryLoad" type="button">Повторить</button>
      </div>
    `;
    byId('retryLoad').addEventListener('click', initialise);
  }

  async function initialise() {
    stage.innerHTML = `<div class="loading-card" role="status"><span class="loading-seal">✦</span><strong>Открываем свиток…</strong></div>`;
    try {
      const response = await fetch('/data/bible_wow_levels.json', { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Level data HTTP ${response.status}`);
      const data = await response.json();
      if (!data || !Array.isArray(data.levels) || data.levels.length !== 100) throw new Error('Expected 100 levels');
      state.levels = data.levels;
      loadPersisted();
      startLevel();
    } catch (error) {
      renderLoadError(error);
    }
  }

  byId('resetParallax').addEventListener('click', resetParallax);
  byId('nextLevelButton').addEventListener('click', () => {
    byId('completeDialog').close();
    if (state.levelIndex < state.levels.length - 1) goToLevel(state.levelIndex + 1);
    else openLevelsDialog();
  });

  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => byId(button.dataset.closeDialog)?.close());
  });

  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('pointerdown', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  addEventListener('scroll', readScrollPosition, { passive: true });
  addEventListener('pointerdown', beginParallaxDrag, { passive: true });
  addEventListener('pointermove', moveParallaxDrag, { passive: false });
  addEventListener('pointerup', endParallaxDrag, { passive: true });
  addEventListener('pointercancel', endParallaxDrag, { passive: true });
  addEventListener('resize', () => {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => {
      if (state.current) {
        renderGrid();
        clearWheelCanvas();
      }
    }, 120);
  }, { passive: true });

  initialise();
})();
