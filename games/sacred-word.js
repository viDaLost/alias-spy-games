/* global loadJSON, goToMainMenu */

function startSacredWordGame(wordsUrl) {
  const container = document.getElementById("game-container");
  if (!container) return;

  const tgUser = (typeof getTelegramUser === "function") ? getTelegramUser() : { id: "anon" };
  const STORAGE_KEY = `sacred_word_state_v1_${tgUser.id}`;
  const MAX_ERRORS = 6;
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
        background: linear-gradient(180deg, rgba(219,234,254,.65), rgba(253,250,244,.95));
        border: 1px solid rgba(79,70,229,.10);
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
      }
      .sw-hintbox b { color: var(--accent-active); }
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
        color: #7c2d12;
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
        background: linear-gradient(90deg, #f59e0b, #fcd34d);
        transition: width .35s ease;
      }
      .sw-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .sw-actions .start-button,
      .sw-actions .skip-button {
        width: auto;
        min-width: 168px;
        margin: 0;
      }
      .sw-keyboard { padding: 14px; }
      .sw-keyboard-title {
        font-size: .95rem;
        font-weight: 800;
        color: var(--accent-active);
        margin-bottom: 10px;
      }
      .sw-kb-row {
        display: flex;
        justify-content: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .sw-kb-key {
        width: 42px;
        height: 46px;
        border-radius: 13px;
        border: none;
        background: #dbeafe;
        color: #1f2937;
        box-shadow: 0 4px 10px rgba(0,0,0,.08);
        font-weight: 800;
        font-size: 1rem;
        transition: transform .14s ease, opacity .2s ease, background-color .2s ease;
      }
      .sw-kb-key.good { background: #dcfce7; color: #166534; }
      .sw-kb-key.bad { background: #fee2e2; color: #991b1b; }
      .sw-kb-key.used { opacity: .75; }
      .sw-kb-key:disabled { opacity: .72; }
      .sw-kb-key:active { transform: scale(.97); }
      .sw-footnote {
        text-align: center;
        font-size: .86rem;
        opacity: .7;
        padding-bottom: 8px;
      }
      .sw-lamp {
        width: min(100%, 290px);
        aspect-ratio: 1 / 1;
      }
      .sw-lamp-svg { width: 100%; height: auto; display: block; overflow: visible; }
      .sw-lamp.stage-0 { --flame-scale: 1; --flame-opacity: 1; --glow-opacity: .9; }
      .sw-lamp.stage-1 { --flame-scale: .9; --flame-opacity: .96; --glow-opacity: .82; }
      .sw-lamp.stage-2 { --flame-scale: .74; --flame-opacity: .88; --glow-opacity: .62; }
      .sw-lamp.stage-3 { --flame-scale: .55; --flame-opacity: .8; --glow-opacity: .45; }
      .sw-lamp.stage-4 { --flame-scale: .36; --flame-opacity: .65; --glow-opacity: .26; }
      .sw-lamp.stage-5 { --flame-scale: .18; --flame-opacity: .38; --glow-opacity: .1; }
      .sw-lamp.stage-6 { --flame-scale: 0; --flame-opacity: 0; --glow-opacity: 0; }
      .sw-lamp .flame-group {
        transform-box: fill-box;
        transform-origin: center bottom;
        transform: scale(var(--flame-scale,1));
        opacity: var(--flame-opacity,1);
        transition: transform .35s ease, opacity .35s ease;
      }
      .sw-lamp .glow {
        opacity: var(--glow-opacity,.9);
        animation: swGlow 2.2s ease-in-out infinite;
        transition: opacity .35s ease;
      }
      .sw-lamp .flame-outer { animation: swFlicker 1.6s ease-in-out infinite; }
      .sw-lamp .flame-inner { animation: swFlicker2 1.2s ease-in-out infinite; }
      .sw-lamp .smoke {
        opacity: 0;
        transform: translateY(4px);
      }
      .sw-lamp.stage-6 .smoke {
        opacity: .55;
        animation: swSmoke 2.5s ease-in-out infinite;
      }
      .sw-lamp.win .glow { opacity: 1 !important; animation: swWinGlow .9s ease-in-out 3; }
      .sw-lamp.win .flame-group { transform: scale(1.18); opacity: 1; }
      @keyframes swFlicker {
        0%,100% { transform: scale(var(--flame-scale,1)) rotate(-1deg); }
        25% { transform: scale(calc(var(--flame-scale,1) * 1.05), calc(var(--flame-scale,1) * .94)) rotate(1.5deg); }
        50% { transform: scale(calc(var(--flame-scale,1) * .96), calc(var(--flame-scale,1) * 1.06)) rotate(-1.5deg); }
        75% { transform: scale(calc(var(--flame-scale,1) * 1.08), calc(var(--flame-scale,1) * .92)) rotate(.5deg); }
      }
      @keyframes swFlicker2 {
        0%,100% { transform: scale(var(--flame-scale,1)) translateY(0); }
        40% { transform: scale(calc(var(--flame-scale,1) * .95), calc(var(--flame-scale,1) * 1.07)) translateY(-1px); }
        70% { transform: scale(calc(var(--flame-scale,1) * 1.04), calc(var(--flame-scale,1) * .93)) translateY(.5px); }
      }
      @keyframes swGlow {
        0%,100% { transform: scale(1); opacity: var(--glow-opacity,.9); }
        50% { transform: scale(1.06); opacity: min(1, calc(var(--glow-opacity,.9) + .1)); }
      }
      @keyframes swSmoke {
        0% { transform: translateY(8px) scale(.9); opacity: 0; }
        25% { opacity: .45; }
        100% { transform: translateY(-26px) scale(1.12); opacity: 0; }
      }
      @keyframes swWinGlow {
        0%,100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(251,191,36,.3)); }
        50% { transform: scale(1.12); filter: drop-shadow(0 0 18px rgba(251,191,36,.8)); }
      }
      @media (max-width: 760px) {
        .sw-grid { grid-template-columns: 1fr; }
        .sw-lamp-card { min-height: 220px; }
        .sw-title { font-size: 1.12rem; }
        .sw-topbar { padding: 10px; }
        .sw-actions .start-button,
        .sw-actions .skip-button { width: 100%; min-width: 0; }
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

  function createRound(nextWord) {
    const wordObj = nextWord || words[Math.floor(Math.random() * words.length)];
    state = {
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
    if (!saved || !saved.word) return createRound();
    state = saved;
    render();
  }

  function getHiddenIndices() {
    const hidden = [];
    [...state.word].forEach((ch, idx) => {
      if (ch === "-" || ch === " ") return;
      if (!state.revealed.includes(idx)) hidden.push(idx);
    });
    return hidden;
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

  function revealHint() {
    if (state.finished) return;
    const hidden = getHiddenIndices();
    if (!hidden.length) return;
    const index = hidden[Math.floor(Math.random() * hidden.length)];
    const letter = state.word[index];
    if (!state.used.includes(letter)) state.used.push(letter);
    revealAllByLetter(letter);
    if (getSolved()) {
      state.finished = true;
      state.won = true;
    }
    saveState();
    render();
  }

  function getMessage() {
    if (!state.finished) return "Открывай буквы и береги пламя светильника.";
    if (state.won) return "Победа! Светильник вспыхнул ярче — слово раскрыто.";
    return `Раунд проигран. Загаданное слово: ${state.word}.`;
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
      <div class="sw-lamp stage-${stage} ${winClass}" aria-label="Светильник ошибок">
        <svg class="sw-lamp-svg" viewBox="0 0 260 260" role="img">
          <defs>
            <radialGradient id="swGlowGrad" cx="50%" cy="38%" r="42%">
              <stop offset="0%" stop-color="#fde68a" stop-opacity=".95"/>
              <stop offset="55%" stop-color="#fbbf24" stop-opacity=".45"/>
              <stop offset="100%" stop-color="#fbbf24" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="swLampBody" x1="0" x2="1">
              <stop offset="0%" stop-color="#a16207"/>
              <stop offset="50%" stop-color="#d4a652"/>
              <stop offset="100%" stop-color="#8b5e34"/>
            </linearGradient>
            <linearGradient id="swLampTop" x1="0" x2="1">
              <stop offset="0%" stop-color="#f4d08d"/>
              <stop offset="100%" stop-color="#a16207"/>
            </linearGradient>
            <filter id="swSoft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5"/>
            </filter>
          </defs>
          <ellipse cx="130" cy="78" rx="60" ry="48" fill="url(#swGlowGrad)" class="glow" filter="url(#swSoft)"/>
          <g class="flame-group">
            <path class="flame-outer" d="M130 112 C112 98, 115 73, 128 58 C130 67, 141 75, 144 89 C148 104, 141 116, 130 124 C119 117, 114 114, 130 112 Z" fill="#fb923c"/>
            <path class="flame-inner" d="M130 111 C122 101, 124 87, 130 76 C133 84, 138 89, 139 98 C140 106, 136 113, 130 118 C125 114, 123 113, 130 111 Z" fill="#fde68a"/>
          </g>
          <g class="smoke">
            <circle cx="123" cy="92" r="10" fill="#9ca3af" opacity=".35"/>
            <circle cx="136" cy="80" r="13" fill="#9ca3af" opacity=".26"/>
            <circle cx="128" cy="66" r="9" fill="#d1d5db" opacity=".2"/>
          </g>
          <ellipse cx="130" cy="213" rx="84" ry="18" fill="#cbd5e1" opacity=".18"/>
          <path d="M58 163 C76 136, 109 127, 156 132 C193 136, 213 155, 206 176 C201 190, 177 198, 135 199 C96 200, 69 194, 58 181 C51 173, 51 170, 58 163 Z" fill="url(#swLampBody)"/>
          <path d="M72 164 C82 150, 108 144, 147 147 C176 150, 191 158, 190 169 C189 179, 167 184, 135 185 C102 186, 79 181, 72 173 C69 170, 69 167, 72 164 Z" fill="#7c4a23" opacity=".28"/>
          <path d="M84 138 C110 131, 147 131, 174 139 C171 146, 164 150, 154 151 L111 151 C98 150, 89 146, 84 138 Z" fill="url(#swLampTop)"/>
          <path d="M162 135 C176 125, 194 118, 207 122 C215 124, 219 133, 215 141 C210 150, 196 151, 182 146" fill="none" stroke="#9a6b3f" stroke-width="12" stroke-linecap="round"/>
          <circle cx="87" cy="167" r="4.2" fill="#f8e7b1" opacity=".65"/>
          <circle cx="170" cy="159" r="3.4" fill="#fff7d6" opacity=".45"/>
          <path d="M116 133 C122 124, 138 124, 144 133" fill="none" stroke="#5b371b" stroke-width="5" stroke-linecap="round"/>
        </svg>
      </div>
    `;
  }

  function render() {
    const progress = (state.errors / MAX_ERRORS) * 100;
    container.innerHTML = `
      <div class="sw-wrap fade-in">
        <div class="sw-topbar">
          <button class="back-button" style="width:auto; padding:10px 14px; margin:0;" onclick="goToMainMenu()">⬅️ Назад</button>
          <div class="sw-titlebox">
            <div class="sw-title">Священное слово</div>
            <div class="sw-subtitle">Угадай библейское слово, сохранив огонь светильника</div>
          </div>
          <div style="width:96px"></div>
        </div>

        <div class="sw-card">
          <div class="sw-grid">
            <div class="sw-lamp-card">${renderLamp()}</div>
            <div class="sw-info">
              <div class="sw-pillrow">
                <div class="sw-pill">Категория: ${state.category}</div>
                <div class="sw-pill">Ошибки: ${state.errors} / ${MAX_ERRORS}</div>
              </div>
              <div class="sw-hintbox"><b>Подсказка:</b> ${state.hint}</div>
              <div>
                <div class="sw-subtitle" style="margin-bottom:8px; text-align:left;">Скрытое слово</div>
                <div class="sw-word">${renderWord()}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="sw-statusbar">
          <div class="sw-statusrow">
            <div class="sw-errors">Пламя угасает с каждой ошибкой</div>
            <div class="sw-message">${getMessage()}</div>
          </div>
          <div class="sw-progress"><div class="sw-progress-bar" style="width:${progress}%"></div></div>
          <div class="sw-actions">
            <button class="start-button" id="sw-new-round">🔄 Новый раунд</button>
            <button class="skip-button" id="sw-hint-btn" ${state.finished ? "disabled" : ""}>💡 Открыть букву</button>
          </div>
        </div>

        <div class="sw-keyboard">
          <div class="sw-keyboard-title">Клавиатура</div>
          ${renderKeyboard()}
        </div>

        <div class="sw-footnote">«Слово Твое — светильник ноге моей» — Псалом 118:105</div>
      </div>
    `;

    container.querySelectorAll(".sw-kb-key").forEach(btn => {
      btn.addEventListener("click", () => pressLetter(btn.dataset.letter));
    });
    container.querySelector("#sw-new-round")?.addEventListener("click", () => createRound());
    container.querySelector("#sw-hint-btn")?.addEventListener("click", revealHint);
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
