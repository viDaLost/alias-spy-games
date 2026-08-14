// Progressive gameplay + motion upgrades for the two word games.
// Keeps the existing game implementations intact and layers richer mechanics on top.

(() => {
  'use strict';

  const WS_MODE_KEY = 'bible_wordsearch_mode_v1';
  const WS_DEFAULT_URL = 'data/bible_wordsearch_levels.json';
  const state = {
    lastWordSearchUrl: WS_DEFAULT_URL,
    wordSearchMeta: [],
    originalLoadJSON: null,
  };

  const qs = (selector, root = document) => root?.querySelector?.(selector) || null;
  const qsa = (selector, root = document) => Array.from(root?.querySelectorAll?.(selector) || []);
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function wordSearchMode() {
    const saved = localStorage.getItem(WS_MODE_KEY);
    return saved === 'snake' ? 'snake' : 'classic';
  }

  function stripCacheBuster(url) {
    try {
      const u = new URL(String(url || ''), location.href);
      u.searchParams.delete('_cb');
      return u.pathname.replace(/^\//, '') + (u.search ? u.search : '');
    } catch {
      return String(url || WS_DEFAULT_URL).split('?')[0] || WS_DEFAULT_URL;
    }
  }

  function isWordSearchLevelsUrl(url) {
    return String(url || '').includes('bible_wordsearch_levels.json');
  }

  function seededRandom(seedText) {
    let h = 2166136261 >>> 0;
    const text = String(seedText || 'bible-games');
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h += 0x6D2B79F5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleWith(list, random) {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function generateClassicLevel(rawLevel) {
    const words = (rawLevel.wordsList || rawLevel.words || [])
      .map((item) => typeof item === 'string' ? item : item?.text)
      .map((word) => String(word || '').toUpperCase().replace(/Ё/g, 'Е').replace(/[^А-Я]/g, ''))
      .filter((word) => word.length >= 2);

    const maxWord = Math.max(4, ...words.map((word) => word.length));
    const totalLetters = words.reduce((sum, word) => sum + word.length, 0);
    let size = Math.max(
      Number(rawLevel.rows) || 0,
      Number(rawLevel.cols) || 0,
      maxWord,
      Math.ceil(Math.sqrt(Math.max(totalLetters * 1.9, 36))),
    );
    size = Math.min(Math.max(size, 7), 16);

    const baseSeed = `${rawLevel.id}|${rawLevel.theme}|${words.join('|')}`;

    for (let expansion = 0; expansion < 4; expansion++) {
      const boardSize = Math.min(18, size + expansion);
      for (let attempt = 0; attempt < 80; attempt++) {
        const random = seededRandom(`${baseSeed}|${boardSize}|${attempt}`);
        const grid = Array.from({ length: boardSize }, () => Array(boardSize).fill(''));
        const placements = [];
        let failed = false;

        for (const word of [...words].sort((a, b) => b.length - a.length)) {
          const candidates = [];
          const directions = shuffleWith([
            [0, 1], [0, -1], [1, 0], [-1, 0],
          ], random);

          for (const [dr, dc] of directions) {
            for (let r = 0; r < boardSize; r++) {
              for (let c = 0; c < boardSize; c++) {
                const endR = r + dr * (word.length - 1);
                const endC = c + dc * (word.length - 1);
                if (endR < 0 || endR >= boardSize || endC < 0 || endC >= boardSize) continue;

                let clear = true;
                const path = [];
                for (let i = 0; i < word.length; i++) {
                  const rr = r + dr * i;
                  const cc = c + dc * i;
                  if (grid[rr][cc]) { clear = false; break; }
                  path.push([rr, cc]);
                }
                if (!clear) continue;

                let neighbourPenalty = 0;
                for (const [rr, cc] of path) {
                  for (const [nr, nc] of [[rr - 1, cc], [rr + 1, cc], [rr, cc - 1], [rr, cc + 1]]) {
                    if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize && grid[nr][nc]) neighbourPenalty++;
                  }
                }
                candidates.push({ path, penalty: neighbourPenalty + random() });
              }
            }
          }

          if (!candidates.length) {
            failed = true;
            break;
          }
          candidates.sort((a, b) => a.penalty - b.penalty);
          const chosen = candidates[Math.min(candidates.length - 1, Math.floor(random() * Math.min(10, candidates.length)))];
          chosen.path.forEach(([r, c], index) => { grid[r][c] = word[index]; });
          placements.push({ text: word, path: chosen.path });
        }

        if (!failed && placements.length === words.length) {
          const alphabet = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';
          for (let r = 0; r < boardSize; r++) {
            for (let c = 0; c < boardSize; c++) {
              if (!grid[r][c]) grid[r][c] = alphabet[Math.floor(random() * alphabet.length)];
            }
          }
          const upgraded = {
            ...rawLevel,
            rows: boardSize,
            cols: boardSize,
            grid: grid.map((row) => row.join('')),
            words: placements,
          };
          delete upgraded.wordsList;
          return upgraded;
        }
      }
    }

    return rawLevel;
  }

  function installLoadJSONUpgrade() {
    if (state.originalLoadJSON || typeof window.loadJSON !== 'function') return false;
    state.originalLoadJSON = window.loadJSON.bind(window);
    window.loadJSON = async function upgradedLoadJSON(url, ...rest) {
      const data = await state.originalLoadJSON(url, ...rest);
      if (!isWordSearchLevelsUrl(url) || !data || !Array.isArray(data.levels)) return data;

      state.lastWordSearchUrl = stripCacheBuster(url) || WS_DEFAULT_URL;
      state.wordSearchMeta = data.levels.map((level) => ({ id: level.id, theme: level.theme || 'Библия' }));

      if (wordSearchMode() !== 'classic') return data;
      return {
        ...data,
        levels: data.levels.map(generateClassicLevel),
      };
    };
    return true;
  }

  function haptic(kind = 'light') {
    try {
      const feedback = window.Telegram?.WebApp?.HapticFeedback;
      if (feedback) {
        if (kind === 'success' || kind === 'error') feedback.notificationOccurred?.(kind);
        else feedback.impactOccurred?.(kind);
        return;
      }
      if (navigator.vibrate) navigator.vibrate(kind === 'success' ? [14, 35, 18] : 12);
    } catch {}
  }

  function burst(container, className, count = 10) {
    if (!container) return;
    const layer = document.createElement('div');
    layer.className = className;
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('i');
      dot.style.setProperty('--i', String(i));
      dot.style.setProperty('--x', `${(Math.random() * 2 - 1).toFixed(2)}`);
      dot.style.setProperty('--y', `${(Math.random() * 1.2 + .35).toFixed(2)}`);
      layer.appendChild(dot);
    }
    container.appendChild(layer);
    setTimeout(() => layer.remove(), 1100);
  }

  function parseFound(progressEl) {
    const text = progressEl?.textContent || '';
    const match = text.match(/Найдено:\s*(\d+)\s*\/\s*(\d+)/i);
    return match ? { found: Number(match[1]), total: Number(match[2]) } : null;
  }

  function createWsUpgradeUi(wrap) {
    const panel = qs('.ws-panel', wrap);
    if (!panel || qs('.ws-upgrade-strip', panel)) return;

    const strip = document.createElement('div');
    strip.className = 'ws-upgrade-strip';
    strip.innerHTML = `
      <div class="ws-mode-switch" role="group" aria-label="Режим поля">
        <button type="button" data-ws-mode="classic">▦ Классика</button>
        <button type="button" data-ws-mode="snake">〰 Змейка</button>
      </div>
      <div class="ws-live-word" aria-live="polite">Проведите по буквам</div>
      <div class="ws-combo-pill" aria-live="polite">Комбо ×1</div>
      <div class="ws-progress-track"><span></span></div>
    `;
    panel.appendChild(strip);

    const refreshButtons = () => {
      qsa('[data-ws-mode]', strip).forEach((button) => {
        button.classList.toggle('active', button.dataset.wsMode === wordSearchMode());
      });
    };
    refreshButtons();

    qsa('[data-ws-mode]', strip).forEach((button) => {
      button.addEventListener('click', async () => {
        const next = button.dataset.wsMode === 'snake' ? 'snake' : 'classic';
        if (next === wordSearchMode()) return;
        localStorage.setItem(WS_MODE_KEY, next);
        refreshButtons();
        haptic('light');
        try { window.__wsCleanup?.(); } catch {}
        await delay(30);
        if (typeof window.startBibleWordSearchGame === 'function') {
          window.startBibleWordSearchGame(state.lastWordSearchUrl || WS_DEFAULT_URL);
        }
      });
    });
  }

  function upgradeWsLevelMap(wrap) {
    const grid = qs('#ws-levels-grid', wrap);
    if (!grid) return;
    const directButtons = Array.from(grid.children).filter((el) => el.classList?.contains('ws-level-item'));
    if (!directButtons.length) return;

    const chapters = [
      ['Глава 1 · Основы', 0, 10],
      ['Глава 2 · Мир Библии', 10, 20],
      ['Глава 3 · Люди и места', 20, 30],
      ['Глава 4 · Истории и вера', 30, 40],
    ];
    grid.innerHTML = '';
    grid.classList.add('ws-level-map');

    for (const [title, start, end] of chapters) {
      const buttons = directButtons.slice(start, end);
      if (!buttons.length) continue;
      const section = document.createElement('section');
      section.className = 'ws-map-chapter';
      const done = buttons.filter((button) => button.classList.contains('completed')).length;
      section.innerHTML = `<div class="ws-map-chapter__head"><b>${title}</b><span>${done}/${buttons.length}</span></div><div class="ws-map-levels"></div>`;
      const body = qs('.ws-map-levels', section);
      buttons.forEach((button, localIndex) => {
        const absoluteIndex = start + localIndex;
        const theme = state.wordSearchMeta[absoluteIndex]?.theme;
        button.title = theme ? `Уровень ${absoluteIndex + 1}: ${theme}` : `Уровень ${absoluteIndex + 1}`;
        button.innerHTML = `<span>${absoluteIndex + 1}</span>${button.classList.contains('completed') ? '<small>★</small>' : '<small>•</small>'}`;
        body.appendChild(button);
      });
      grid.appendChild(section);
    }
  }

  function upgradeWsBoardSizing(wrap) {
    const board = qs('#ws-board', wrap);
    if (!board) return;
    const cols = Number.parseInt(getComputedStyle(board).getPropertyValue('--ws-cols'), 10) || 8;
    board.dataset.wsDensity = cols >= 13 ? 'dense' : cols >= 11 ? 'compact' : 'normal';
  }

  function enhanceWordSearch(wrap) {
    if (!wrap || wrap.dataset.wordUpgrade === '1') return;
    wrap.dataset.wordUpgrade = '1';
    createWsUpgradeUi(wrap);

    let previous = null;
    let previousLevel = null;
    let combo = 0;
    let lastFindAt = 0;
    let suppressCombo = false;
    let lastSolvedKeys = new Set();
    let winCelebrated = false;

    const comboEl = () => qs('.ws-combo-pill', wrap);
    const liveEl = () => qs('.ws-live-word', wrap);
    const progressBar = () => qs('.ws-progress-track > span', wrap);

    const resetCombo = () => {
      combo = 0;
      const el = comboEl();
      if (el) { el.textContent = 'Комбо ×1'; el.classList.remove('hot'); }
    };

    wrap.addEventListener('pointerdown', (event) => {
      if (event.target.closest('#ws-hint')) { suppressCombo = true; resetCombo(); }
      if (event.target.closest('#ws-reset')) { suppressCombo = true; resetCombo(); }
    }, true);

    const update = () => {
      createWsUpgradeUi(wrap);
      upgradeWsLevelMap(wrap);
      upgradeWsBoardSizing(wrap);

      const levelText = qs('#ws-lvl-label', wrap)?.textContent || '';
      const progress = parseFound(qs('#ws-progress', wrap));
      if (progress) {
        const bar = progressBar();
        if (bar) bar.style.width = `${progress.total ? (progress.found / progress.total) * 100 : 0}%`;

        if (previousLevel !== levelText) {
          previousLevel = levelText;
          previous = progress.found;
          lastFindAt = 0;
          resetCombo();
          winCelebrated = false;
        } else if (previous != null && progress.found > previous) {
          const now = performance.now();
          const manual = !suppressCombo;
          suppressCombo = false;
          if (manual) {
            combo = now - lastFindAt < 5200 ? Math.max(2, combo + 1) : 1;
            lastFindAt = now;
            const el = comboEl();
            if (el) {
              el.textContent = `Комбо ×${combo}`;
              el.classList.toggle('hot', combo >= 3);
              el.animate?.([
                { transform: 'scale(.92)' },
                { transform: 'scale(1.12)' },
                { transform: 'scale(1)' },
              ], { duration: 320, easing: 'cubic-bezier(.2,.9,.2,1)' });
            }
            if (combo >= 2) {
              const bubble = document.createElement('div');
              bubble.className = 'ws-combo-burst-label';
              bubble.textContent = `Комбо ×${combo}`;
              wrap.appendChild(bubble);
              setTimeout(() => bubble.remove(), 850);
            }
            haptic(combo >= 3 ? 'medium' : 'light');
          }
        } else if (previous != null && progress.found < previous) {
          resetCombo();
        }
        previous = progress.found;
      }

      const selectedText = qsa('.ws-cell--sel', wrap).map((cell) => cell.textContent || '').join('');
      const live = liveEl();
      if (live) live.textContent = selectedText || 'Проведите по буквам';

      const solved = new Set(qsa('.ws-cell--solved', wrap).map((cell) => `${cell.dataset.r},${cell.dataset.c}`));
      if (solved.size > lastSolvedKeys.size) {
        qsa('.ws-cell--solved', wrap).forEach((cell) => {
          const key = `${cell.dataset.r},${cell.dataset.c}`;
          if (!lastSolvedKeys.has(key)) {
            cell.classList.add('ws-found-pop');
            setTimeout(() => cell.classList.remove('ws-found-pop'), 620);
          }
        });
      }
      lastSolvedKeys = solved;

      const win = qs('.ws-win', wrap);
      if (win && !winCelebrated) {
        winCelebrated = true;
        haptic('success');
        burst(win, 'word-celebration', 18);
      }
    };

    const observer = new MutationObserver(update);
    observer.observe(wrap, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    wrap._wordUpgradeObserver = observer;
    update();
  }

  function enhanceWow(wrap) {
    if (!wrap || wrap.dataset.wordUpgrade === '1') return;
    wrap.dataset.wordUpgrade = '1';

    const wheel = qs('#wow-wheel', wrap);
    const preview = qs('#wow-preview', wrap);
    const grid = qs('#wow-grid', wrap);
    const message = qs('#wow-bonus-msg', wrap);
    const bonusButton = qs('#wow-bonus-open', wrap);

    if (wheel && !qs('.wow-live-center', wheel)) {
      const center = document.createElement('div');
      center.className = 'wow-live-center';
      center.innerHTML = '<b></b><small>Проведите по буквам</small>';
      wheel.appendChild(center);
    }

    if (bonusButton && !qs('.wow-scroll-meter', wrap)) {
      const meter = document.createElement('div');
      meter.className = 'wow-scroll-meter';
      meter.innerHTML = '<span>📜 Свиток бонусов</span><div><i></i></div><b>0/5</b>';
      bonusButton.parentElement?.insertBefore(meter, bonusButton.nextSibling);
    }

    let liveWord = '';
    let lastSubmittedWord = '';
    let previousSolvedCount = qsa('.wow-cell.solved', grid).length;
    let previousBonusCount = Number(qs('#wow-bonus-count', wrap)?.textContent || 0) || 0;
    let lastMessage = '';

    const updatePreview = () => {
      const next = qsa('.wow-preview-let', preview).map((el) => el.textContent || '').join('');
      if (!next && liveWord) lastSubmittedWord = liveWord;
      liveWord = next;
      const center = qs('.wow-live-center', wheel);
      if (center) {
        const label = qs('b', center);
        const hint = qs('small', center);
        if (label) label.textContent = next;
        if (hint) hint.textContent = next ? 'Отпустите, чтобы проверить' : 'Проведите по буквам';
        center.classList.toggle('active', !!next);
      }
    };

    const animateWordToGrid = (word) => {
      if (!word || !wheel || !grid) return;
      const from = wheel.getBoundingClientRect();
      const solvedCells = qsa('.wow-cell.solved', grid);
      const target = solvedCells.length ? solvedCells[solvedCells.length - 1].getBoundingClientRect() : null;
      if (!target) return;
      const chip = document.createElement('div');
      chip.className = 'wow-word-flight';
      chip.textContent = word;
      chip.style.left = `${from.left + from.width / 2}px`;
      chip.style.top = `${from.top + from.height / 2}px`;
      document.body.appendChild(chip);
      requestAnimationFrame(() => {
        chip.style.setProperty('--dx', `${target.left + target.width / 2 - (from.left + from.width / 2)}px`);
        chip.style.setProperty('--dy', `${target.top + target.height / 2 - (from.top + from.height / 2)}px`);
        chip.classList.add('go');
      });
      setTimeout(() => chip.remove(), 720);
    };

    const updateSolved = () => {
      const solved = qsa('.wow-cell.solved', grid);
      if (solved.length > previousSolvedCount) {
        const delta = solved.length - previousSolvedCount;
        solved.slice(Math.max(0, solved.length - delta)).forEach((cell, index) => {
          cell.classList.add('wow-cell-reveal');
          cell.style.animationDelay = `${Math.min(index * 34, 260)}ms`;
        });
        animateWordToGrid(lastSubmittedWord);
        haptic('light');
      }
      previousSolvedCount = solved.length;
    };

    const updateBonusMeter = () => {
      const count = Number(qs('#wow-bonus-count', wrap)?.textContent || 0) || 0;
      const cycle = count % 5;
      const shown = count > 0 && cycle === 0 ? 5 : cycle;
      const meter = qs('.wow-scroll-meter', wrap);
      if (meter) {
        qs('b', meter).textContent = `${shown}/5`;
        qs('i', meter).style.width = `${(shown / 5) * 100}%`;
      }
      if (count > previousBonusCount && count > 0 && count % 5 === 0) {
        meter?.classList.add('complete');
        burst(meter, 'word-celebration', 12);
        setTimeout(() => meter?.classList.remove('complete'), 900);
      }
      previousBonusCount = count;
    };

    const updateMessage = () => {
      const text = message?.textContent?.trim() || '';
      if (!text || text === lastMessage || !message?.classList.contains('show')) return;
      lastMessage = text;
      if (/уровень пройден/i.test(text)) {
        haptic('success');
        burst(qs('#wow-board-area', wrap), 'word-celebration', 16);
      } else if (/нет такого/i.test(text)) {
        haptic('error');
        wheel?.classList.remove('wow-wheel-wrong');
        void wheel?.offsetWidth;
        wheel?.classList.add('wow-wheel-wrong');
      } else if (/бонус/i.test(text)) {
        haptic('light');
        qs('.wow-scroll-meter', wrap)?.classList.add('pulse');
        setTimeout(() => qs('.wow-scroll-meter', wrap)?.classList.remove('pulse'), 500);
      } else if (/отлично/i.test(text)) {
        haptic('light');
      }
    };

    const decorateLevels = () => {
      const list = qs('#wow-levels-list', wrap);
      if (!list) return;
      list.classList.add('wow-level-map');
      qsa('.wow-item', list).forEach((item, index) => {
        item.style.setProperty('--level-index', String(index));
      });
    };

    const observer = new MutationObserver(() => {
      updatePreview();
      updateSolved();
      updateBonusMeter();
      updateMessage();
      decorateLevels();
    });
    observer.observe(wrap, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    wrap._wordUpgradeObserver = observer;

    updatePreview();
    updateSolved();
    updateBonusMeter();
    decorateLevels();
  }

  function discoverGames() {
    const ws = qs('.ws-wrap');
    if (ws) enhanceWordSearch(ws);
    const wow = qs('.wow-wrap');
    if (wow) enhanceWow(wow);
  }

  function boot() {
    installLoadJSONUpgrade();
    const rootObserver = new MutationObserver(() => {
      if (!state.originalLoadJSON) installLoadJSONUpgrade();
      discoverGames();
    });
    rootObserver.observe(document.documentElement, { childList: true, subtree: true });
    discoverGames();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
