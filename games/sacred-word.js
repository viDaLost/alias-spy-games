/* global loadJSON, goToMainMenu */

function startSacredWordGame(wordsUrl) {
  const container = document.getElementById("game-container");
  if (!container) return;

  const tgUser = (typeof getTelegramUser === "function") ? getTelegramUser() : { id: "anon" };
  const STORAGE_KEY = `sacred_word_levels_v3_${tgUser.id}`;
  // У Меноры 7 свечей, поэтому логично сделать максимум 7 ошибок, чтобы каждая гасила 1 пламя.
  const MAX_ERRORS = 7; 
  const KEYBOARD_ROWS = [
    ["Й","Ц","У","К","Е","Н","Г","Ш","Щ","З","Х","Ъ"],
    ["Ф","Ы","В","А","П","Р","О","Л","Д","Ж","Э"],
    ["Я","Ч","С","М","И","Т","Ь","Б","Ю","Ё"]
  ];

  let words = [];
  let state = null; 

  function injectStyles() {
    const old = document.getElementById("sacred-word-style");
    if (old) old.remove();
    const style = document.createElement("style");
    style.id = "sacred-word-style";
    style.textContent = `
      .sw-wrap {
        width: min(100%, 860px);
        margin: 0 auto;
        display: grid;
        gap: 14px;
        padding: 6px 0 24px;
      }
      .sw-topbar, .sw-card, .sw-keyboard, .sw-statusbar {
        background: var(--card-bg, #fff);
        border-radius: 18px;
        box-shadow: 0 6px 18px rgba(0,0,0,.08);
        border: 1px solid rgba(79,70,229,.08);
      }
      .sw-topbar {
        padding: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .sw-titlebox { text-align: center; flex: 1; display: flex; flex-direction: column; align-items: center; }
      .sw-title { font-size: 1.3rem; font-weight: 800; color: var(--accent-active); }
      .sw-subtitle { font-size: .92rem; opacity: .8; margin-top: 4px; display: flex; align-items: center; gap: 6px; }
      
      .sw-level-select {
        background: rgba(79,70,229,.08);
        border: 1px solid rgba(79,70,229,.2);
        border-radius: 6px;
        padding: 2px 6px;
        font-family: inherit;
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--accent-active);
        cursor: pointer;
        outline: none;
      }

      .sw-card { padding: 16px; }
      .sw-grid {
        display: grid;
        grid-template-columns: minmax(280px, 360px) 1fr;
        gap: 16px;
        align-items: center;
      }
      .sw-lamp-card {
        background: linear-gradient(180deg, rgba(15,23,42,.9), rgba(30,41,59,.98));
        border-radius: 20px;
        padding: 10px;
        min-height: 290px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .sw-info { display: grid; gap: 12px; }
      .sw-pillrow {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .sw-pill {
        background: #dbeafe;
        color: #1e293b;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: .94rem;
        font-weight: 700;
      }
      .sw-hintbox {
        background: rgba(253,250,244,.95);
        border: 1px solid rgba(79,70,229,.10);
        border-radius: 16px;
        padding: 12px 14px;
        line-height: 1.45;
        font-size: 1rem;
        font-style: italic;
      }
      .sw-word {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        min-height: 66px;
      }
      .sw-letter {
        width: 44px;
        height: 52px;
        border-radius: 14px;
        background: #fff;
        border: 2px solid rgba(79,70,229,.12);
        box-shadow: 0 4px 10px rgba(0,0,0,.05);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.35rem;
        font-weight: 800;
        color: #374151;
        transition: transform .2s ease, background-color .2s ease;
      }
      .sw-letter.revealed {
        background: #dbeafe;
        border-color: rgba(79,70,229,.28);
        transform: translateY(-2px);
      }
      .sw-letter.space {
        width: 18px;
        background: transparent;
        border: none;
        box-shadow: none;
      }
      .sw-statusbar {
        padding: 14px 16px;
        display: grid;
        gap: 10px;
      }
      .sw-statusrow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .sw-errors { font-weight: 800; color: #b91c1c; }
      .sw-message { min-height: 24px; font-weight: 700; color: var(--accent-active); }
      .sw-progress {
        height: 10px;
        background: rgba(0,0,0,.06);
        border-radius: 999px;
        overflow: hidden;
      }
      .sw-progress-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #ef4444, #f97316);
        transition: width .35s ease;
      }
      .sw-actions { display: flex; gap: 10px; flex-wrap: wrap; }
      .sw-actions button { flex: 1; min-width: 168px; margin: 0; }
      
      .sw-keyboard { padding: 14px 8px; box-sizing: border-box; }
      .sw-kb-row {
        display: flex;
        justify-content: center;
        gap: 5px;
        margin-bottom: 6px;
        width: 100%;
      }
      .sw-kb-key {
        flex: 1 1 auto;
        max-width: 44px;
        height: 48px;
        border-radius: 10px;
        border: none;
        background: #e2e8f0;
        color: #1e293b;
        box-shadow: 0 4px 6px rgba(0,0,0,.06);
        font-weight: 800;
        font-size: 1.1rem;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: manipulation;
        transition: transform .1s ease, opacity .2s ease, background-color .2s ease;
      }
      .sw-kb-key.good { background: #dcfce7; color: #166534; }
      .sw-kb-key.bad { background: #fee2e2; color: #991b1b; }
      .sw-kb-key.used { opacity: .6; }
      .sw-kb-key:disabled { cursor: not-allowed; }
      .sw-kb-key:active:not(:disabled) { transform: scale(.92); }
      
      .sw-lamp { width: min(100%, 260px); aspect-ratio: 1 / 1; position: relative; }
      .sw-lamp-svg { width: 100%; height: auto; display: block; overflow: visible; }
      
      .sw-flame { transition: opacity 0.5s ease, transform 0.5s ease; transform-origin: center bottom; }
      .sw-flame.off { opacity: 0 !important; transform: scale(0.3) !important; }
      
      .flame-outer { animation: swFlickerOuter 1.8s ease-in-out infinite; transform-origin: inherit; }
      .flame-inner { animation: swFlickerInner 1.4s ease-in-out infinite; transform-origin: inherit; }
      .flame-core  { animation: swFlickerCore 1s ease-in-out infinite; transform-origin: inherit; }
      .flame-glow  { animation: swGlowPulse 2s ease-in-out infinite alternate; transform-origin: inherit; transition: opacity 0.5s ease; }
      
      @keyframes swFlickerOuter {
        0%, 100% { transform: scale(1) rotate(0deg); }
        25% { transform: scale(1.05, 0.95) rotate(-2deg); }
        50% { transform: scale(0.95, 1.05) rotate(1deg); }
        75% { transform: scale(1.02, 0.98) rotate(2deg); }
      }
      @keyframes swFlickerInner {
        0%, 100% { transform: scale(1); }
        33% { transform: scale(0.9, 1.1) translateY(-1px); }
        66% { transform: scale(1.1, 0.9) translateY(1px); }
      }
      @keyframes swFlickerCore {
        0%, 100% { transform: scale(1); opacity: 0.9; }
        50% { transform: scale(0.95); opacity: 1; }
      }
      @keyframes swGlowPulse {
        0% { transform: scale(0.95); opacity: 0.7; }
        100% { transform: scale(1.05); opacity: 1; }
      }

      @media (max-width: 500px) {
        .sw-grid { grid-template-columns: 1fr; }
        .sw-lamp-card { min-height: 220px; }
        .sw-title { font-size: 1.12rem; }
        .sw-topbar { padding: 10px; }
        .sw-kb-key { height: 42px; font-size: 1rem; max-width: 36px; }
        .sw-kb-row { gap: 3px; }
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeLetter(letter) {
    return (letter || "").toUpperCase().replace(/\s+/g, "");
  }

  function sanitizeWord(word) {
    return normalizeLetter(word).replace(/[^А-ЯЁ-]/g, "");
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function createRound(targetLevel) {
    let lvl = targetLevel !== undefined ? targetLevel : (state ? state.level : 0);
    const safeIndex = lvl % words.length; 
    
    const wordObj = words[safeIndex];
    state = {
      level: safeIndex, // Сохраняем реальный индекс
      word: sanitizeWord(wordObj.word),
      category: wordObj.category,
      hint: wordObj.hint,
      errors: 0,
      used: [],
      revealed: [],
      finished: false,
      won: false
    };
    saveState();
    render();
  }

  function ensureStateValid() {
    const saved = loadSavedState();
    if (!saved || saved.level === undefined || !saved.word) return createRound(0);
    state = saved;
    render();
  }

  function revealAllByLetter(letter) {
    [...state.word].forEach((ch, idx) => {
      if (ch === letter && !state.revealed.includes(idx)) state.revealed.push(idx);
    });
  }

  function getSolved() {
    return [...state.word].every((ch, idx) => ch === "-" || ch === " " || state.revealed.includes(idx));
  }

  function pressLetter(letter) {
    if (!letter || state.finished) return;
    letter = normalizeLetter(letter);
    if (state.used.includes(letter)) return;
    
    state.used.push(letter);
    
    if (state.word.includes(letter)) {
      revealAllByLetter(letter);
      if (getSolved()) {
        state.finished = true;
        state.won = true;
      }
    } else {
      state.errors += 1;
      if (state.errors >= MAX_ERRORS) {
        state.errors = MAX_ERRORS;
        state.finished = true;
        state.won = false;
      }
    }
    saveState();
    render();
  }

  function getMessage() {
    if (!state.finished) return "Открывай буквы и береги пламя меноры.";
    if (state.won) return "Победа! Свет сохранён.";
    return `Светильник угас. Загаданное слово: ${state.word}.`;
  }

  function renderWord() {
    return [...state.word].map((ch, idx) => {
      if (ch === " " || ch === "-") {
        return `<div class="sw-letter ${ch === " " ? "space" : "revealed"}">${ch === "-" ? "–" : ""}</div>`;
      }
      const visible = state.revealed.includes(idx) || (!state.won && state.finished);
      return `<div class="sw-letter ${visible ? "revealed" : ""}">${visible ? ch : "_"}</div>`;
    }).join("");
  }

  function renderKeyboard() {
    return KEYBOARD_ROWS.map(row => `
      <div class="sw-kb-row">
        ${row.map(letter => {
          const used = state.used.includes(letter);
          const hit = used && state.word.includes(letter);
          const miss = used && !state.word.includes(letter);
          return `<button class="sw-kb-key ${used ? "used" : ""} ${hit ? "good" : ""} ${miss ? "bad" : ""}" data-letter="${letter}" ${used || state.finished ? "disabled" : ""}>${letter}</button>`;
        }).join("")}
      </div>
    `).join("");
  }

  function renderLamp() {
    // Порядок гашения свечей (от краев к центру)
    const extinctOrder = [0, 6, 1, 5, 2, 4, 3];
    let flamesHtml = '';
    
    for (let idx = 0; idx < 7; idx++) {
      const extinguishErrorLevel = extinctOrder.indexOf(idx) + 1; 
      const isOff = state.errors >= extinguishErrorLevel;
      const x = 45 + idx * 35;
      
      flamesHtml += `
        <g class="sw-flame ${isOff ? 'off' : ''}" style="transform-origin: ${x}px 90px;">
          <circle cx="${x}" cy="75" r="22" fill="url(#swSmallGlow)" class="flame-glow" />
          <path class="flame-outer" d="M${x},92 Q${x-7},75 ${x},55 Q${x+7},75 ${x},92 Z" fill="#ea580c"/>
          <path class="flame-inner" d="M${x},90 Q${x-4.5},78 ${x},65 Q${x+4.5},78 ${x},90 Z" fill="#fbbf24"/>
          <path class="flame-core"  d="M${x},88 Q${x-2.5},80 ${x},72 Q${x+2.5},80 ${x},88 Z" fill="#fef08a"/>
        </g>
      `;
    }

    return `
      <div class="sw-lamp" aria-label="Менора">
        <svg class="sw-lamp-svg" viewBox="0 0 300 300" role="img">
          <defs>
            <radialGradient id="swSmallGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.8"/>
              <stop offset="60%" stop-color="#d97706" stop-opacity="0.2"/>
              <stop offset="100%" stop-color="#78350f" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="swBigGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="#78350f" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="swGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#FDE047"/>
              <stop offset="30%" stop-color="#D97706"/>
              <stop offset="70%" stop-color="#B45309"/>
              <stop offset="100%" stop-color="#78350F"/>
            </linearGradient>
            <filter id="swBlur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="12"/>
            </filter>
          </defs>
          
          <circle cx="150" cy="140" r="140" fill="url(#swBigGlow)" opacity="${(MAX_ERRORS - state.errors) / MAX_ERRORS}" style="transition: opacity 0.5s" filter="url(#swBlur)"/>
          
          <g stroke="url(#swGold)" stroke-width="8" stroke-linecap="round" fill="none">
            <path d="M45,110 C45,230 255,230 255,110" />
            <path d="M80,110 C80,195 220,195 220,110" />
            <path d="M115,110 C115,160 185,160 185,110" />
            <line x1="150" y1="110" x2="150" y2="250" stroke-width="12" />
          </g>

          <g fill="url(#swGold)">
            <ellipse cx="150" cy="180" rx="12" ry="8" />
            <ellipse cx="150" cy="220" rx="14" ry="9" />
            <path d="M135,250 L165,250 L175,280 L125,280 Z" />
            <path d="M140,240 L160,240 L160,250 L140,250 Z" />
          </g>

          <g fill="url(#swGold)">
            <path d="M38,95 L52,95 L49,115 L41,115 Z" />
            <path d="M73,95 L87,95 L84,115 L76,115 Z" />
            <path d="M108,95 L122,95 L119,115 L111,115 Z" />
            <path d="M143,95 L157,95 L154,115 L146,115 Z" />
            <path d="M178,95 L192,95 L189,115 L181,115 Z" />
            <path d="M213,95 L227,95 L224,115 L216,115 Z" />
            <path d="M248,95 L262,95 L259,115 L251,115 Z" />
          </g>

          ${flamesHtml}
        </svg>
      </div>
    `;
  }

  function render() {
    const progress = (state.errors / MAX_ERRORS) * 100;
    
    let actionButtons = '';
    if (state.finished && state.won) {
      actionButtons = `<button class="start-button" id="sw-next-level">➡️ Следующий уровень</button>`;
    } else {
      actionButtons = `<button class="start-button" id="sw-reset-btn" style="background:#f1f5f9; color:#334155;">🔄 Сбросить уровень</button>`;
    }

    // Выпадающий список для выбора уровня
    const levelSelectHtml = `
      <select id="sw-level-select" class="sw-level-select">
        ${words.map((w, i) => `<option value="${i}" ${i === state.level ? "selected" : ""}>Уровень ${i + 1}</option>`).join("")}
      </select>
    `;

    // Убрали класс "fade-in", чтобы экран больше не "моргал" при каждом вводе буквы
    container.innerHTML = `
      <div class="sw-wrap">
        <div class="sw-topbar">
          <button class="back-button" style="width:auto; padding:10px 14px; margin:0;" onclick="goToMainMenu()">⬅️ Назад</button>
          <div class="sw-titlebox">
            <div class="sw-title">Священное слово</div>
            <div class="sw-subtitle">${levelSelectHtml}</div>
          </div>
          <div style="width:96px"></div>
        </div>

        <div class="sw-card">
          <div class="sw-grid">
            <div class="sw-lamp-card">${renderLamp()}</div>
            <div class="sw-info">
              <div class="sw-pillrow">
                <div class="sw-pill">Категория: ${state.category}</div>
                <div class="sw-pill">Угасание: ${state.errors} / ${MAX_ERRORS}</div>
              </div>
              <div class="sw-hintbox">${state.hint}</div>
              <div>
                <div class="sw-subtitle" style="margin-bottom:8px; text-align:left;">Скрытое слово</div>
                <div class="sw-word">${renderWord()}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="sw-statusbar">
          <div class="sw-statusrow">
            <div class="sw-errors">Ошибки забирают свет</div>
            <div class="sw-message">${getMessage()}</div>
          </div>
          <div class="sw-progress"><div class="sw-progress-bar" style="width:${progress}%"></div></div>
          <div class="sw-actions">
            ${actionButtons}
          </div>
        </div>

        <div class="sw-keyboard">
          ${renderKeyboard()}
        </div>

        <div class="sw-footnote">«Слово Твое — светильник ноге моей» — Псалом 118:105</div>
      </div>
    `;

    container.querySelectorAll(".sw-kb-key").forEach(btn => {
      btn.addEventListener("click", () => pressLetter(btn.dataset.letter));
    });

    container.querySelector("#sw-next-level")?.addEventListener("click", () => {
      createRound(state.level + 1);
    });

    container.querySelector("#sw-reset-btn")?.addEventListener("click", () => {
      createRound(state.level);
    });

    // Обработка смены уровня в выпадающем списке
    container.querySelector("#sw-level-select")?.addEventListener("change", (e) => {
      createRound(parseInt(e.target.value, 10));
    });
  }

  function handlePhysicalKeyboard(event) {
    if (!state || state.finished) return;
    const letter = normalizeLetter(event.key);
    if (/^[А-ЯЁ]$/.test(letter)) {
      event.preventDefault();
      pressLetter(letter);
    }
  }

  injectStyles();
  loadJSON(wordsUrl)
    .then(data => {
      words = Array.isArray(data) ? data.filter(item => item && item.word && item.category && item.hint) : [];
      if (!words.length) throw new Error("Не удалось загрузить слова для игры.");
      document.removeEventListener("keydown", handlePhysicalKeyboard);
      document.addEventListener("keydown", handlePhysicalKeyboard);
      window.__sacredWordCleanup = () => document.removeEventListener("keydown", handlePhysicalKeyboard);
      ensureStateValid();
    })
    .catch(err => {
      console.error(err);
      container.innerHTML = `
        <div class="card" style="max-width:640px; margin: 1rem auto;">
          <p style="margin-bottom:12px; color:#991b1b; font-weight:700;">❌ Не удалось загрузить игру «Священное слово».</p>
          <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
        </div>
      `;
    });
}
