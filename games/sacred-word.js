/* global loadJSON, goToMainMenu */

function startSacredWordGame(wordsUrl) {
  const container = document.getElementById("game-container");
  if (!container) return;

  const tgUser = (typeof getTelegramUser === "function") ? getTelegramUser() : { id: "anon" };
  const STORAGE_KEY = `sacred_word_levels_v2_${tgUser.id}`;
  const MAX_ERRORS = 6;
  const KEYBOARD_ROWS = [
    ["Й","Ц","У","К","Е","Н","Г","Ш","Щ","З","Х","Ъ"],
    ["Ф","Ы","В","А","П","Р","О","Л","Д","Ж","Э"],
    ["Я","Ч","С","М","И","Т","Ь","Б","Ю","Ё"]
  ];

  let words = [];
  let state = null; // { level: int, word: string, errors: int, used: [], revealed: [], finished: bool, won: bool }

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
      .sw-titlebox { text-align: center; flex: 1; }
      .sw-title { font-size: 1.3rem; font-weight: 800; color: var(--accent-active); }
      .sw-subtitle { font-size: .92rem; opacity: .74; margin-top: 2px; }
      .sw-card { padding: 16px; }
      .sw-grid {
        display: grid;
        grid-template-columns: minmax(280px, 360px) 1fr;
        gap: 16px;
        align-items: center;
      }
      .sw-lamp-card {
        background: linear-gradient(180deg, rgba(15,23,42,.85), rgba(30,41,59,.95));
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
        transition: transform .2s ease, background-color .2s ease, border-color .2s ease, opacity .2s ease;
      }
      .sw-letter.revealed {
        background: #dbeafe;
        border-color: rgba(79,70,229,.28);
        transform: translateY(-2px);
        animation: swPop .28s ease;
      }
      .sw-letter.space {
        width: 18px;
        background: transparent;
        border: none;
        box-shadow: none;
      }
      @keyframes swPop {
        0% { transform: scale(.7); opacity: .45; }
        100% { transform: scale(1); opacity: 1; }
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
      .sw-errors {
        font-weight: 800;
        color: #b91c1c;
      }
      .sw-message {
        min-height: 24px;
        font-weight: 700;
        color: var(--accent-active);
      }
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
      .sw-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .sw-actions button {
        flex: 1;
        min-width: 168px;
        margin: 0;
      }
      
      /* KEYBOARD STYLES - FLEX LAYOUT FOR MOBILE */
      .sw-keyboard { 
        padding: 14px 8px; 
        box-sizing: border-box;
      }
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
      
      .sw-footnote {
        text-align: center;
        font-size: .86rem;
        opacity: .7;
        padding-bottom: 8px;
      }

      /* LAMP VISUALS */
      .sw-lamp {
        width: min(100%, 260px);
        aspect-ratio: 1 / 1;
        position: relative;
      }
      .sw-lamp-svg { width: 100%; height: auto; display: block; overflow: visible; }
      
      .sw-lamp.stage-0 { --flame-scale: 1; --glow-opacity: 1; }
      .sw-lamp.stage-1 { --flame-scale: 0.85; --glow-opacity: 0.8; }
      .sw-lamp.stage-2 { --flame-scale: 0.7; --glow-opacity: 0.6; }
      .sw-lamp.stage-3 { --flame-scale: 0.55; --glow-opacity: 0.4; }
      .sw-lamp.stage-4 { --flame-scale: 0.4; --glow-opacity: 0.25; }
      .sw-lamp.stage-5 { --flame-scale: 0.25; --glow-opacity: 0.1; }
      .sw-lamp.stage-6 { --flame-scale: 0; --glow-opacity: 0; }
      
      .sw-lamp .flame-group {
        transform-origin: 150px 140px;
        transform: scale(var(--flame-scale, 1));
        transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .sw-lamp .glow {
        opacity: var(--glow-opacity, 1);
        animation: swGlow 2.5s ease-in-out infinite alternate;
        transition: opacity 0.4s ease;
      }
      .sw-lamp .flame-outer { animation: swFlickerOuter 1.8s ease-in-out infinite; transform-origin: 150px 140px; }
      .sw-lamp .flame-inner { animation: swFlickerInner 1.4s ease-in-out infinite; transform-origin: 150px 140px; }
      .sw-lamp .flame-core  { animation: swFlickerCore 1s ease-in-out infinite; transform-origin: 150px 140px; }
      
      .sw-lamp .smoke {
        opacity: 0;
        transform: translateY(0);
      }
      .sw-lamp.stage-6 .smoke {
        opacity: 0.6;
        animation: swSmokeFade 3s ease-in-out infinite;
      }
      .sw-lamp.win .glow { opacity: 1 !important; animation: swWinGlow 1s ease-in-out infinite alternate; }
      .sw-lamp.win .flame-group { transform: scale(1.2); }
      
      @keyframes swFlickerOuter {
        0%, 100% { transform: scale(1) rotate(0deg); }
        25% { transform: scale(1.04, 0.96) rotate(-2deg); }
        50% { transform: scale(0.96, 1.04) rotate(1deg); }
        75% { transform: scale(1.02, 0.98) rotate(2deg); }
      }
      @keyframes swFlickerInner {
        0%, 100% { transform: scale(1); }
        33% { transform: scale(0.9, 1.1) translateY(-2px); }
        66% { transform: scale(1.1, 0.9) translateY(1px); }
      }
      @keyframes swFlickerCore {
        0%, 100% { transform: scale(1); opacity: 0.9; }
        50% { transform: scale(0.95); opacity: 1; }
      }
      @keyframes swGlow {
        0% { transform: scale(0.95); opacity: calc(var(--glow-opacity, 1) * 0.8); }
        100% { transform: scale(1.05); opacity: var(--glow-opacity, 1); }
      }
      @keyframes swSmokeFade {
        0% { transform: translateY(10px) scale(0.9); opacity: 0; }
        30% { opacity: 0.6; }
        100% { transform: translateY(-40px) scale(1.3); opacity: 0; }
      }
      @keyframes swWinGlow {
        0% { transform: scale(1); filter: drop-shadow(0 0 10px rgba(251,191,36,.5)); }
        100% { transform: scale(1.15); filter: drop-shadow(0 0 25px rgba(251,191,36,.9)); }
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
    } catch {
      return null;
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  // Создание или сброс раунда по индексу
  function createRound(targetLevel) {
    let lvl = targetLevel !== undefined ? targetLevel : (state ? state.level : 0);
    const safeIndex = lvl % words.length; // Закольцовываем уровни, если они закончились
    
    const wordObj = words[safeIndex];
    state = {
      level: lvl,
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
    if (!state.finished) return "Открывай буквы и береги пламя светильника.";
    if (state.won) return "Победа! Пламя сияет ярко.";
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
    const stage = Math.min(MAX_ERRORS, state.errors);
    const winClass = state.won ? "win" : "";
    
    return `
      <div class="sw-lamp stage-${stage} ${winClass}" aria-label="Светильник">
        <svg class="sw-lamp-svg" viewBox="0 0 300 300" role="img">
          <defs>
            <radialGradient id="swGlowGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.9"/>
              <stop offset="60%" stop-color="#d97706" stop-opacity="0.3"/>
              <stop offset="100%" stop-color="#78350f" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="swGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#FCD34D"/>
              <stop offset="50%" stop-color="#B45309"/>
              <stop offset="100%" stop-color="#78350F"/>
            </linearGradient>
            <filter id="swBlur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="12"/>
            </filter>
          </defs>
          
          <circle cx="150" cy="110" r="100" fill="url(#swGlowGrad)" class="glow" filter="url(#swBlur)"/>
          
          <g class="flame-group">
            <path class="flame-outer" d="M150,140 Q110,80 150,20 Q190,80 150,140 Z" fill="#EA580C"/>
            <path class="flame-inner" d="M150,135 Q125,90 150,45 Q175,90 150,135 Z" fill="#FBBF24"/>
            <path class="flame-core"  d="M150,130 Q138,100 150,70 Q162,100 150,130 Z" fill="#FEF08A"/>
          </g>

          <g class="smoke">
            <path d="M150,120 Q130,90 160,60 T140,20" fill="none" stroke="#94a3b8" stroke-width="8" stroke-linecap="round" filter="url(#swBlur)"/>
          </g>
          
          <path d="M110,270 L190,270 L170,230 L130,230 Z" fill="url(#swGold)"/>
          <path d="M140,230 L160,230 L155,160 L145,160 Z" fill="url(#swGold)"/>
          <path d="M60,160 C60,230 240,230 240,160 C240,145 60,145 60,160 Z" fill="url(#swGold)"/>
          <ellipse cx="150" cy="155" rx="90" ry="14" fill="#92400E"/>
          <ellipse cx="150" cy="155" rx="70" ry="9" fill="#451A03"/>
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

    container.innerHTML = `
      <div class="sw-wrap fade-in">
        <div class="sw-topbar">
          <button class="back-button" style="width:auto; padding:10px 14px; margin:0;" onclick="goToMainMenu()">⬅️ Назад</button>
          <div class="sw-titlebox">
            <div class="sw-title">Священное слово</div>
            <div class="sw-subtitle">Уровень ${state.level + 1}</div>
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

    // Кнопка следующего уровня
    container.querySelector("#sw-next-level")?.addEventListener("click", () => {
      createRound(state.level + 1);
    });

    // Кнопка сброса текущего уровня (очистка ошибок и введенных букв)
    container.querySelector("#sw-reset-btn")?.addEventListener("click", () => {
      createRound(state.level);
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
