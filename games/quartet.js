// games/quartet.js — Квартет (онлайн) под Worker-сервер БЕЗ Durable Objects
// Работает с app.js (loadGameScript) и UI твоего приложения.

(function () {
  const WORKER_BASE_URL = "https://bible-quartet.74x942q7fb.workers.dev/"; // <-- ВСТАВЬ СВОЙ

  // ✅ Таймаут для fetch, чтобы не было "вечной загрузки" в WebView/Safari.
  async function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(t);
    }
  }

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  function safeName(raw) {
    const s = (raw || "").toString().trim().slice(0, 18);
    return s || "Игрок";
  }

  function setStatus(node, text, isError = false) {
    node.style.color = isError ? "red" : "";
    node.innerHTML = text || "";
  }

  function wsBase(httpBase) {
    return httpBase.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  }

  async function postJSON(path, body) {
    const res = await fetch(`${WORKER_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status} ${txt}`);
    }
    return res.json();
  }

  // --- Online state ---
  let currentRoomCode = null;
  let currentPlayerId = null;
  let socket = null;

  function closeSocket() {
    try { socket?.close(); } catch {}
    socket = null;
  }

  function connectWS(onState, onClose) {
    closeSocket();
    const url = `${wsBase(WORKER_BASE_URL)}/ws/${currentRoomCode}?playerId=${encodeURIComponent(currentPlayerId)}`;
    socket = new WebSocket(url);

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        // сервер шлёт: {type:"state", data:{...}}
        if (msg.type === "state") onState(msg.data);
      } catch {}
    };

    socket.onclose = () => onClose?.();
    socket.onerror = () => onClose?.();
  }

  // ---------------------------------------------------------
  // Entry point called from app.js: startQuartetGame(quartetsUrl)
  // ---------------------------------------------------------
  window.startQuartetGame = async function startQuartetGame(quartetsUrl) {
    const container = document.getElementById("game-container");
    container.innerHTML = "<p class='fade-in'>🔄 Загрузка игры...</p>";

    // ✅ Раньше мы блокировали запуск, пока не загрузится quartetsUrl.
    // В iOS/Telegram WebView fetch иногда "зависает" → получалась вечная загрузка.
    // Для онлайн-режима данные с сервера достаточны, поэтому делаем проверку НЕблокирующей.
    if (quartetsUrl) {
      try {
        const r = await fetchWithTimeout(quartetsUrl, { cache: "no-store" }, 4000);
        if (r.ok) {
          // просто проверка, что JSON валиден
          await r.json();
        } else {
          console.warn("quartet: quartets json not found:", quartetsUrl, r.status);
        }
      } catch (e) {
        console.warn("quartet: quartets json check failed (continuing):", e);
      }
    }

    renderOnlineSetup(container);
  };

  function renderOnlineSetup(container) {
    closeSocket();
    currentRoomCode = null;
    currentPlayerId = null;

    container.innerHTML = "";
    const screen = el("div", "quartet-screen");

    screen.appendChild(el("h2", null, "🌐 Онлайн-игра"));
    screen.appendChild(el("p", "quartet-subtitle", "Создай комнату или подключись по коду (2–8 игроков)."));

    const nameInput = el("input", "quartet-input");
    nameInput.placeholder = "Твоё имя";

    const codeInput = el("input", "quartet-input");
    codeInput.placeholder = "Код комнаты (например: AB12C)";
    codeInput.autocapitalize = "characters";

    const createBtn = el("button", "start-button", "➕ Создать комнату");
    const joinBtn = el("button", "menu-button", "🔌 Подключиться");

    const status = el("div", "quartet-status", "");
    const backBtn = el("button", "back-button", "⬅️ В меню");
    backBtn.onclick = () => { closeSocket(); goToMainMenu(); };

    screen.append(nameInput, codeInput, createBtn, joinBtn, status, backBtn);
    container.appendChild(screen);

    createBtn.onclick = async () => {
      const name = safeName(nameInput.value);
      setStatus(status, "🔄 Создаю комнату...");
      try {
        const data = await postJSON("/api/create", { name, maxPlayers: 8 });
        currentRoomCode = data.code;
        currentPlayerId = data.playerId;

        renderLobby(container, status);
      } catch (e) {
        console.error(e);
        setStatus(status, "❌ Не удалось создать комнату. Проверь сервер и WORKER_BASE_URL.", true);
      }
    };

    joinBtn.onclick = async () => {
      const name = safeName(nameInput.value);
      const code = (codeInput.value || "").trim().toUpperCase();
      if (!code) return setStatus(status, "❌ Введи код комнаты.", true);

      setStatus(status, "🔄 Подключаюсь...");
      try {
        const data = await postJSON("/api/join", { name, code });
        currentRoomCode = data.code;
        currentPlayerId = data.playerId;

        renderLobby(container, status);
      } catch (e) {
        console.error(e);
        setStatus(status, "❌ Не удалось подключиться. Проверь код и сервер.", true);
      }
    };
  }

  function renderLobby(container) {
    container.innerHTML = "";
    const screen = el("div", "quartet-screen");
    const title = el("h2", null, "🧩 Комната");
    const status = el("div", "quartet-status", "");
    const playersBox = el("div", "quartet-score", "");
    const startBtn = el("button", "start-button", "▶️ Начать игру");
    const leaveBtn = el("button", "back-button", "⬅️ В меню");

    leaveBtn.onclick = () => { closeSocket(); goToMainMenu(); };

    screen.append(title, status, playersBox, startBtn, leaveBtn);
    container.appendChild(screen);

    const onState = (st) => {
      setStatus(status, `Код комнаты: <strong>${st.code}</strong><br>Статус: <strong>${st.phase}</strong>`);
      playersBox.innerHTML = "";
      st.players.forEach((p) => {
        playersBox.appendChild(
          el("div", "quartet-score-row",
            `<span>${p.id === currentPlayerId ? "👉 " : ""}${p.name}</span><span>${p.sets} кварт.</span><span>${p.handCount} карт</span>`
          )
        );
      });

      // Начать игру может любой (на сервере это проверяется)
      startBtn.disabled = st.phase !== "lobby" || st.players.length < 2;
    };

    const onClose = () => {
      setStatus(status, "⚠️ Соединение закрыто. Обнови страницу или зайди заново.", true);
    };

    connectWS(onState, onClose);

    startBtn.onclick = async () => {
      try {
        await postJSON("/api/start", { code: currentRoomCode, playerId: currentPlayerId });
      } catch (e) {
        console.error(e);
        setStatus(status, "❌ Не удалось начать игру.", true);
      }
    };

    setStatus(status, `Подключение... Код: <strong>${currentRoomCode}</strong>`);
  }
})();
