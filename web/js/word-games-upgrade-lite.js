// Lightweight gameplay and motion layer for «Поиск библейских слов» and «Библейские слова».
// Uses a small timer instead of broad DOM MutationObservers, so Telegram WebView stays responsive.

(() => {
  'use strict';

  const MODE_KEY = 'bible_wordsearch_mode_v1';
  const WS_URL = 'web/data/bible_wordsearch_levels.json';
  const $ = (s, root = document) => root?.querySelector?.(s) || null;
  const $$ = (s, root = document) => Array.from(root?.querySelectorAll?.(s) || []);

  const runtime = {
    ws: null,
    wow: null,
    wsState: null,
    wowState: null,
  };

  function setText(el, value) {
    if (!el) return;
    const next = String(value ?? '');
    if (el.textContent !== next) el.textContent = next;
  }

  function haptic(kind = 'light') {
    try {
      const feedback = window.Telegram?.WebApp?.HapticFeedback;
      if (feedback) {
        if (kind === 'success' || kind === 'error') feedback.notificationOccurred?.(kind);
        else feedback.impactOccurred?.(kind);
      } else if (navigator.vibrate) {
        navigator.vibrate(kind === 'success' ? [12, 28, 16] : 10);
      }
    } catch {}
  }

  function particleBurst(host, count = 14) {
    if (!host || host.querySelector(':scope > .word-celebration')) return;
    const layer = document.createElement('div');
    layer.className = 'word-celebration';
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('i');
      dot.style.setProperty('--i', String(i));
      dot.style.setProperty('--x', (Math.random() * 2 - 1).toFixed(2));
      dot.style.setProperty('--y', (Math.random() * 1.2 + .35).toFixed(2));
      layer.appendChild(dot);
    }
    host.appendChild(layer);
    setTimeout(() => layer.remove(), 1100);
  }

  function mode() {
    return localStorage.getItem(MODE_KEY) === 'snake' ? 'snake' : 'classic';
  }

  function parseWsProgress(wrap) {
    const match = ($('#ws-progress', wrap)?.textContent || '').match(/Найдено:\s*(\d+)\s*\/\s*(\d+)/i);
    return match ? { found: Number(match[1]), total: Number(match[2]) } : null;
  }

  function installWsUi(wrap) {
    const panel = $('.ws-panel', wrap);
    if (!panel || $('.ws-upgrade-strip', panel)) return;

    const ui = document.createElement('div');
    ui.className = 'ws-upgrade-strip';
    ui.innerHTML = `
      <div class="ws-mode-switch" role="group" aria-label="Режим поля">
        <button type="button" data-ws-mode="classic">Классика</button>
        <button type="button" data-ws-mode="snake">Змейка</button>
      </div>
      <div class="ws-live-word" aria-live="polite">Проведите по буквам</div>
      <div class="ws-combo-pill" aria-live="polite">Комбо ×1</div>
      <div class="ws-progress-track"><span></span></div>
    `;
    panel.appendChild(ui);

    $$('[data-ws-mode]', ui).forEach((button) => {
      button.addEventListener('click', () => {
        const next = button.dataset.wsMode === 'snake' ? 'snake' : 'classic';
        if (next === mode()) return;
        localStorage.setItem(MODE_KEY, next);
        haptic('light');
        try { window.__wsCleanup?.(); } catch {}
        setTimeout(() => window.startBibleWordSearchGame?.(WS_URL), 20);
      });
    });
  }

  function updateWsModeButtons(wrap) {
    $$('[data-ws-mode]', wrap).forEach((button) => {
      const active = button.dataset.wsMode === mode();
      if (button.classList.contains('active') !== active) button.classList.toggle('active', active);
    });
  }

  function decorateWsLevelMap(wrap) {
    const grid = $('#ws-levels-grid', wrap);
    if (!grid) return;
    const buttons = Array.from(grid.children).filter((el) => el.classList?.contains('ws-level-item'));
    if (!buttons.length) return;

    const chapters = [
      ['Глава 1 · Основы', 0, 10],
      ['Глава 2 · Мир Библии', 10, 20],
      ['Глава 3 · Люди и места', 20, 30],
      ['Глава 4 · Истории и вера', 30, 40],
    ];
    grid.innerHTML = '';
    grid.classList.add('ws-level-map');

    chapters.forEach(([title, start, end]) => {
      const part = buttons.slice(start, end);
      if (!part.length) return;
      const section = document.createElement('section');
      section.className = 'ws-map-chapter';
      const done = part.filter((button) => button.classList.contains('completed')).length;
      section.innerHTML = `<div class="ws-map-chapter__head"><b>${title}</b><span>${done}/${part.length}</span></div><div class="ws-map-levels"></div>`;
      const body = $('.ws-map-levels', section);
      part.forEach((button, index) => {
        const level = start + index + 1;
        button.innerHTML = `<span>${level}</span>${button.classList.contains('completed') ? '<small>★</small>' : '<small>•</small>'}`;
        body.appendChild(button);
      });
      grid.appendChild(section);
    });
  }

  function setupWordSearch(wrap) {
    installWsUi(wrap);
    runtime.ws = wrap;
    runtime.wsState = {
      level: '',
      found: null,
      combo: 0,
      lastFoundAt: 0,
      solved: new Set(),
      winSeen: false,
      ignoreNextFound: false,
    };

    wrap.addEventListener('pointerdown', (event) => {
      if (event.target.closest('#ws-hint') || event.target.closest('#ws-reset')) {
        runtime.wsState.ignoreNextFound = true;
        runtime.wsState.combo = 0;
      }
    }, true);
  }

  function tickWordSearch() {
    const wrap = $('.ws-wrap');
    if (!wrap) {
      runtime.ws = null;
      runtime.wsState = null;
      return;
    }
    if (runtime.ws !== wrap || !runtime.wsState) setupWordSearch(wrap);
    installWsUi(wrap);
    updateWsModeButtons(wrap);
    decorateWsLevelMap(wrap);

    const state = runtime.wsState;
    const level = $('#ws-lvl-label', wrap)?.textContent || '';
    const progress = parseWsProgress(wrap);
    const selected = $$('.ws-cell--sel', wrap).map((cell) => cell.textContent || '').join('');
    setText($('.ws-live-word', wrap), selected || 'Проведите по буквам');

    const board = $('#ws-board', wrap);
    if (board) {
      const cols = Number.parseInt(getComputedStyle(board).getPropertyValue('--ws-cols'), 10) || 8;
      const density = cols >= 13 ? 'dense' : cols >= 11 ? 'compact' : 'normal';
      if (board.dataset.wsDensity !== density) board.dataset.wsDensity = density;
    }

    if (progress) {
      const bar = $('.ws-progress-track > span', wrap);
      const width = `${progress.total ? (progress.found / progress.total) * 100 : 0}%`;
      if (bar && bar.style.width !== width) bar.style.width = width;

      if (state.level !== level) {
        state.level = level;
        state.found = progress.found;
        state.combo = 0;
        state.lastFoundAt = 0;
        state.winSeen = false;
      } else if (state.found != null && progress.found > state.found) {
        if (!state.ignoreNextFound) {
          const now = performance.now();
          state.combo = now - state.lastFoundAt < 5200 ? Math.max(2, state.combo + 1) : 1;
          state.lastFoundAt = now;
          haptic(state.combo >= 3 ? 'medium' : 'light');
          if (state.combo >= 2) {
            const badge = document.createElement('div');
            badge.className = 'ws-combo-burst-label';
            badge.textContent = `Комбо ×${state.combo}`;
            wrap.appendChild(badge);
            setTimeout(() => badge.remove(), 850);
          }
        } else {
          state.combo = 0;
        }
        state.ignoreNextFound = false;
      } else if (state.found != null && progress.found < state.found) {
        state.combo = 0;
      }
      state.found = progress.found;
    }

    const combo = $('.ws-combo-pill', wrap);
    setText(combo, `Комбо ×${Math.max(1, state.combo)}`);
    if (combo) combo.classList.toggle('hot', state.combo >= 3);

    const solvedNow = new Set($$('.ws-cell--solved', wrap).map((cell) => `${cell.dataset.r},${cell.dataset.c}`));
    if (solvedNow.size > state.solved.size) {
      $$('.ws-cell--solved', wrap).forEach((cell) => {
        const key = `${cell.dataset.r},${cell.dataset.c}`;
        if (!state.solved.has(key)) {
          cell.classList.add('ws-found-pop');
          setTimeout(() => cell.classList.remove('ws-found-pop'), 620);
        }
      });
    }
    state.solved = solvedNow;

    const win = $('.ws-win', wrap);
    if (win && !state.winSeen) {
      state.winSeen = true;
      haptic('success');
      particleBurst(win, 18);
    } else if (!win) {
      state.winSeen = false;
    }
  }

  function installWowUi(wrap) {
    const wheel = $('#wow-wheel', wrap);
    if (wheel && !$('.wow-live-center', wheel)) {
      const center = document.createElement('div');
      center.className = 'wow-live-center';
      center.innerHTML = '<b></b><small>Проведите по буквам</small>';
      wheel.appendChild(center);
    }

    const bonusButton = $('#wow-bonus-open', wrap);
    if (bonusButton && !$('.wow-scroll-meter', wrap)) {
      const meter = document.createElement('div');
      meter.className = 'wow-scroll-meter';
      meter.innerHTML = '<span>📜 Свиток бонусов</span><div><i></i></div><b>0/5</b>';
      bonusButton.parentElement?.insertBefore(meter, bonusButton.nextSibling);
    }
  }

  function setupWow(wrap) {
    runtime.wow = wrap;
    runtime.wowState = {
      liveWord: '',
      submittedWord: '',
      solvedCount: $$('.wow-cell.solved', wrap).length,
      bonusCount: Number($('#wow-bonus-count', wrap)?.textContent || 0) || 0,
      message: '',
    };
    installWowUi(wrap);
  }

  function animateWordFlight(wrap, word) {
    if (!word) return;
    const wheel = $('#wow-wheel', wrap);
    const cells = $$('.wow-cell.solved', wrap);
    const target = cells[cells.length - 1];
    if (!wheel || !target) return;
    const from = wheel.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const chip = document.createElement('div');
    chip.className = 'wow-word-flight';
    chip.textContent = word;
    chip.style.left = `${from.left + from.width / 2}px`;
    chip.style.top = `${from.top + from.height / 2}px`;
    chip.style.setProperty('--dx', `${to.left + to.width / 2 - (from.left + from.width / 2)}px`);
    chip.style.setProperty('--dy', `${to.top + to.height / 2 - (from.top + from.height / 2)}px`);
    document.body.appendChild(chip);
    requestAnimationFrame(() => chip.classList.add('go'));
    setTimeout(() => chip.remove(), 720);
  }

  function tickWow() {
    const wrap = $('.wow-wrap');
    if (!wrap) {
      runtime.wow = null;
      runtime.wowState = null;
      return;
    }
    if (runtime.wow !== wrap || !runtime.wowState) setupWow(wrap);
    installWowUi(wrap);
    const state = runtime.wowState;

    const current = $$('.wow-preview-let', wrap).map((el) => el.textContent || '').join('');
    if (!current && state.liveWord) state.submittedWord = state.liveWord;
    state.liveWord = current;
    const center = $('.wow-live-center', wrap);
    setText($('b', center), current);
    setText($('small', center), current ? 'Отпустите, чтобы проверить' : 'Проведите по буквам');
    if (center) center.classList.toggle('active', Boolean(current));

    const solved = $$('.wow-cell.solved', wrap);
    if (solved.length > state.solvedCount) {
      solved.slice(state.solvedCount).forEach((cell, index) => {
        cell.classList.add('wow-cell-reveal');
        cell.style.animationDelay = `${Math.min(index * 34, 260)}ms`;
      });
      animateWordFlight(wrap, state.submittedWord);
      haptic('light');
    }
    state.solvedCount = solved.length;

    const bonusCount = Number($('#wow-bonus-count', wrap)?.textContent || 0) || 0;
    const shown = bonusCount > 0 && bonusCount % 5 === 0 ? 5 : bonusCount % 5;
    const meter = $('.wow-scroll-meter', wrap);
    setText($('b', meter), `${shown}/5`);
    const fill = $('i', meter);
    const width = `${(shown / 5) * 100}%`;
    if (fill && fill.style.width !== width) fill.style.width = width;
    if (bonusCount > state.bonusCount && bonusCount % 5 === 0) {
      meter?.classList.add('complete');
      particleBurst(meter, 12);
      setTimeout(() => meter?.classList.remove('complete'), 900);
    }
    state.bonusCount = bonusCount;

    const messageEl = $('#wow-bonus-msg', wrap);
    const message = messageEl?.classList.contains('show') ? (messageEl.textContent || '').trim() : '';
    if (message && message !== state.message) {
      state.message = message;
      if (/уровень пройден/i.test(message)) {
        haptic('success');
        particleBurst($('#wow-board-area', wrap), 18);
      } else if (/нет такого/i.test(message)) {
        haptic('error');
        const wheel = $('#wow-wheel', wrap);
        wheel?.classList.remove('wow-wheel-wrong');
        void wheel?.offsetWidth;
        wheel?.classList.add('wow-wheel-wrong');
      } else if (/бонус/i.test(message)) {
        haptic('light');
        meter?.classList.add('pulse');
        setTimeout(() => meter?.classList.remove('pulse'), 500);
      }
    } else if (!message) {
      state.message = '';
    }

    const levelList = $('#wow-levels-list', wrap);
    if (levelList && !levelList.classList.contains('wow-level-map')) levelList.classList.add('wow-level-map');
  }

  function tick() {
    try { tickWordSearch(); } catch (error) { console.warn('word-search upgrade tick failed', error); }
    try { tickWow(); } catch (error) { console.warn('bible-wow upgrade tick failed', error); }
  }

  const timer = setInterval(tick, 120);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick, { once: true });
  else tick();
})();
