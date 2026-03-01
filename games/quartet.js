// games/quartet.js
// Онлайн-игра «Квартет» для Telegram WebApp
// Хранение состояния: Google Sheets + Apps Script (WebApp)

function startQuartetGame(quartetsUrl) {
  const container = document.getElementById("game-container");
  if (!container) return;

  const tg = window.Telegram?.WebApp;
  try { tg?.expand?.(); } catch {}

  const tgUser = (typeof getTelegramUser === "function") ? getTelegramUser() : { id: "аноним", username: "аноним" };
  const playerId = String(tgUser.id ?? "аноним");
  const defaultName = (tgUser.username && tgUser.username !== "аноним") ? tgUser.username : "Игрок";

  const LS = {
    gasUrl: "quartet_gas_url",
    roomId: "quartet_room_id",
    name: "quartet_player_name",
  };

  // ✅ Вмонтированный GAS_URL (пользователю не нужно вставлять ссылку)
  // Если ты сделаешь новый Deploy в Apps Script и URL изменится — обнови эту константу.
  const EMBEDDED_GAS_URL = "https://script.google.com/macros/s/AKfycbwO0GkaYUxBEK2JqnQjUbriX3NlfDT7u57N6VsKRadYiC7j40lNXmvJGvvJMuC4bZc/exec";

  let gameData = null;
  let state = null;
  let pollTimer = null;
  let lastVersion = -1;
  let myName = localStorage.getItem(LS.name) || defaultName;
  let roomId = localStorage.getItem(LS.roomId) || "";
  // Всегда используем встроенный URL
  let GAS_URL = EMBEDDED_GAS_URL;

  // На всякий — сохраним в localStorage (чтобы в логах/отладке было видно)
  try { localStorage.setItem(LS.gasUrl, GAS_URL); } catch {}

  const ui = {
    root: null,
    gasInput: null,
    nameInput: null,
    roomInput: null,
    status: null,
    main: null,
    lobby: null,
    game: null,
    players: null,
    log: null,
    hand: null,
    askPanel: null,
    pendingModal: null,
  };

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function setStatus(text, kind = "info") {
    if (!ui.status) return;
    ui.status.textContent = text;
    ui.status.dataset.kind = kind;
  }

  async function api(action, payload = {}) {
    if (!GAS_URL) throw new Error("Не указан GAS_URL (Apps Script WebApp)");

    const body = {
      action,
      roomId: payload.roomId ?? roomId,
      playerId,
      name: myName,
      ...payload,
    };

    // IMPORTANT for Telegram iOS WebView:
    // Use Content-Type: text/plain to avoid CORS preflight (OPTIONS),
    // because Google Apps Script WebApp may not answer OPTIONS.
    const res = await fetch(GAS_URL, {
      method: "POST",
      // critical: simple content-type => no preflight
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      // GAS часто отвечает редиректом на script.googleusercontent.com
      redirect: "follow",
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const msg = (data && data.error) ? data.error : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function renderShell() {
    container.innerHTML = `
      <div class="quartet-wrap fade-in">
        <div class="quartet-header">
          <div class="quartet-title">🃏 Квартет (онлайн)</div>
          <div class="quartet-subtitle">Telegram WebApp • Google Sheets + Apps Script</div>
        </div>

        <div class="quartet-card">
          <!-- GAS_URL вмонтирован в код. Поле скрыто, чтобы пользователю не нужно было ничего вставлять. -->
          <input id="q_gas" type="hidden" value="${EMBEDDED_GAS_URL}" />

          <div class="quartet-grid2">
            <div class="quartet-field">
              <label>Твоё имя</label>
              <input id="q_name" class="q-input" placeholder="Имя" />
            </div>
            <div class="quartet-field">
              <label>Комната</label>
              <input id="q_room" class="q-input" placeholder="Код комнаты" />
            </div>
          </div>

          <div class="quartet-grid2">
            <button id="q_create" class="start-button">Создать комнату</button>
            <button id="q_join" class="menu-button">Войти</button>
          </div>

          <div id="q_status" class="quartet-status" data-kind="info"></div>
        </div>

        <div id="q_main" class="quartet-main hidden">
          <div class="quartet-topbar">
            <div class="quartet-room">Комната: <b id="q_room_label"></b></div>
            <button id="q_leave" class="back-button">⬅️ В меню</button>
          </div>

          <div id="q_lobby" class="quartet-card">
            <div class="quartet-section-title">Лобби</div>
            <div class="quartet-row">
              <div class="quartet-muted">Игроки (4–8):</div>
            </div>
            <div id="q_players" class="quartet-players"></div>
            <button id="q_start" class="start-button">Начать игру (раздать карты)</button>
          </div>

          <div id="q_game" class="quartet-card hidden">
            <div class="quartet-section-title">Игра</div>
            <div id="q_game_info" class="quartet-info"></div>

            <div class="quartet-split">
              <div>
                <div class="quartet-subsection">Моя рука</div>
                <div id="q_hand" class="quartet-hand"></div>
              </div>
              <div>
                <div class="quartet-subsection">Спросить карту</div>
                <div id="q_ask" class="quartet-ask"></div>
              </div>
            </div>

            <div class="quartet-subsection">Лог</div>
            <div id="q_log" class="quartet-log"></div>
          </div>
        </div>

        <div id="q_pending" class="quartet-modal hidden" role="dialog" aria-modal="true">
          <div class="quartet-modal-card">
            <div class="quartet-modal-title">Запрос карты</div>
            <div id="q_pending_text" class="quartet-modal-text"></div>
            <button id="q_give" class="start-button">Отдать карту</button>
            <button id="q_close_pending" class="menu-button">Понятно</button>
          </div>
        </div>
      </div>
    `;

    ui.root = container.querySelector(".quartet-wrap");
    ui.gasInput = document.getElementById("q_gas");
    ui.nameInput = document.getElementById("q_name");
    ui.roomInput = document.getElementById("q_room");
    ui.status = document.getElementById("q_status");
    ui.main = document.getElementById("q_main");
    ui.lobby = document.getElementById("q_lobby");
    ui.game = document.getElementById("q_game");
    ui.players = document.getElementById("q_players");
    ui.log = document.getElementById("q_log");
    ui.hand = document.getElementById("q_hand");
    ui.askPanel = document.getElementById("q_ask");
    ui.pendingModal = document.getElementById("q_pending");

    ui.gasInput.value = GAS_URL;
    ui.nameInput.value = myName;
    ui.roomInput.value = roomId;

    document.getElementById("q_room_label").textContent = roomId || "—";

    document.getElementById("q_create").addEventListener("click", onCreateRoom);
    document.getElementById("q_join").addEventListener("click", onJoinRoom);
    document.getElementById("q_leave").addEventListener("click", () => {
      stopPolling();
      try { api("leave", {}); } catch {}
      localStorage.removeItem(LS.roomId);
      goToMainMenu();
    });
    document.getElementById("q_start").addEventListener("click", onStartGame);

    document.getElementById("q_close_pending").addEventListener("click", () => hidePending());
    document.getElementById("q_give").addEventListener("click", onGiveCard);
  }

  function saveInputs() {
    GAS_URL = (ui.gasInput.value || "").trim();
    myName = (ui.nameInput.value || "").trim() || defaultName;
    roomId = (ui.roomInput.value || "").trim().toUpperCase();
    localStorage.setItem(LS.gasUrl, GAS_URL);
    localStorage.setItem(LS.name, myName);
    if (roomId) localStorage.setItem(LS.roomId, roomId);
  }

  async function onCreateRoom() {
    try {
      saveInputs();
      setStatus("Создаю комнату…");
      const res = await api("createRoom", {});
      roomId = res.roomId;
      localStorage.setItem(LS.roomId, roomId);
      ui.roomInput.value = roomId;
      document.getElementById("q_room_label").textContent = roomId;
      ui.main.classList.remove("hidden");
      setStatus(`Комната создана: ${roomId}. Пригласи друзей и нажми «Начать игру».`, "ok");
      startPolling();
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "err");
    }
  }

  async function onJoinRoom() {
    try {
      saveInputs();
      if (!roomId) throw new Error("Укажи код комнаты");
      setStatus("Вхожу в комнату…");
      await api("joinRoom", { roomId });
      document.getElementById("q_room_label").textContent = roomId;
      ui.main.classList.remove("hidden");
      setStatus(`Вы в комнате: ${roomId}`, "ok");
      startPolling();
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "err");
    }
  }

  async function onStartGame() {
    try {
      setStatus("Раздаю карты…");
      await api("startGame", {});
      setStatus("Игра началась!", "ok");
      await refreshState(true);
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "err");
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      refreshState(false);
    }, 1000);
    refreshState(true);
  }

  async function refreshState(force) {
    if (!roomId || !GAS_URL) return;
    try {
      const res = await api("getState", {});
      state = res.state;
      if (!state) return;

      // Показываем нужный экран
      const isPlaying = state.status === "playing";
      ui.lobby.classList.toggle("hidden", isPlaying);
      ui.game.classList.toggle("hidden", !isPlaying);

      // Перерисовка только если изменилась версия
      if (!force && typeof state.version === "number" && state.version === lastVersion) {
        // Но модалку pending нужно обновлять каждую секунду (таймер)
        updatePendingModal(state);
        return;
      }

      lastVersion = (typeof state.version === "number") ? state.version : lastVersion;
      renderPlayers(state);
      renderLog(state);
      renderGame(state);
      updatePendingModal(state);
    } catch (e) {
      console.warn("getState error", e);
      setStatus("Проблема связи с сервером. Проверь GAS_URL.", "err");
    }
  }

  function renderPlayers(st) {
    if (!ui.players) return;
    const ps = st.players || [];
    ui.players.innerHTML = ps
      .map(p => {
        const you = String(p.playerId) === playerId;
        const turn = String(st.turnPlayerId) === String(p.playerId);
        const badge = [
          you ? "<span class='q-badge'>ты</span>" : "",
          turn ? "<span class='q-badge q-badge--turn'>ход</span>" : "",
          p.isHost ? "<span class='q-badge q-badge--host'>хост</span>" : "",
        ].filter(Boolean).join(" ");
        return `
          <div class="q-player">
            <div class="q-player-name">${escapeHtml(p.name || "Игрок")} ${badge}</div>
            <div class="q-player-meta">🂠 ${p.cardsCount ?? 0} • 🏆 ${p.quartetsCount ?? 0}${p.isActive === false ? " • выбыл" : ""}</div>
          </div>
        `;
      })
      .join("");

    const startBtn = document.getElementById("q_start");
    if (startBtn) {
      startBtn.disabled = !(st.me?.isHost) || st.status !== "lobby";
    }
  }

  function renderLog(st) {
    if (!ui.log) return;
    const items = (st.log || []).slice(-40);
    ui.log.innerHTML = items.map(x => `<div class="q-log-item">${escapeHtml(x)}</div>`).join("");
  }

  function renderGame(st) {
    if (st.status !== "playing") return;
    const info = document.getElementById("q_game_info");
    if (info) {
      const meTurn = String(st.turnPlayerId) === playerId;
      info.innerHTML = `
        <div><b>${meTurn ? "Твой ход" : "Ход другого игрока"}</b></div>
        <div class="quartet-muted">Текущий ход: ${escapeHtml(st.turnPlayerName || "—")}</div>
        <div class="quartet-muted">Твои квартеты: <b>${(st.me?.quartetsCount ?? 0)}</b></div>
      `;
    }

    renderHand(st);
    renderAskPanel(st);
  }

  function renderHand(st) {
    if (!ui.hand) return;
    const hand = st.me?.hand || [];
    if (!gameData) return;
    if (!hand.length) {
      ui.hand.innerHTML = `<div class="quartet-muted">У тебя нет карт. Ты наблюдаешь до конца игры.</div>`;
      return;
    }

    // Группируем по квартетам
    const byQuartet = new Map();
    for (const cid of hand) {
      const meta = findCardMeta(cid);
      if (!meta) continue;
      const key = meta.quartet.id;
      if (!byQuartet.has(key)) byQuartet.set(key, { quartet: meta.quartet, cards: [] });
      byQuartet.get(key).cards.push(meta.card);
    }

    const blocks = [...byQuartet.values()]
      .sort((a,b) => a.quartet.name.localeCompare(b.quartet.name, "ru"))
      .map(group => {
        const cardChips = group.cards
          .sort((a,b) => a.title.localeCompare(b.title, "ru"))
          .map(c => `<span class="q-chip">${escapeHtml(c.title)}</span>`)
          .join("");
        return `
          <div class="q-qblock">
            <div class="q-qname">${escapeHtml(group.quartet.name)}</div>
            <div class="q-chips">${cardChips}</div>
          </div>
        `;
      })
      .join("");

    ui.hand.innerHTML = blocks;
  }

  function renderAskPanel(st) {
    if (!ui.askPanel) return;
    const meTurn = String(st.turnPlayerId) === playerId;
    const pending = st.pending;

    if (!meTurn) {
      ui.askPanel.innerHTML = `<div class="quartet-muted">Сейчас не твой ход.</div>`;
      return;
    }
    if (pending && pending.status === "waiting") {
      ui.askPanel.innerHTML = `<div class="quartet-muted">Ожидаем ответа на запрос…</div>`;
      return;
    }

    const hand = st.me?.hand || [];
    if (!hand.length) {
      ui.askPanel.innerHTML = `<div class="quartet-muted">У тебя нет карт — ходить нельзя.</div>`;
      return;
    }
    if (!gameData) return;

    // Список целей
    const targets = (st.players || []).filter(p => String(p.playerId) !== playerId && p.isActive !== false);
    if (!targets.length) {
      ui.askPanel.innerHTML = `<div class="quartet-muted">Нет доступных игроков.</div>`;
      return;
    }

    // Список доступных для запроса карт: все карты в квартетах, где у меня есть хотя бы 1 карта, но которых у меня нет.
    const myCards = new Set(hand);
    const eligible = [];
    for (const q of gameData.quartets) {
      const haveAny = q.cards.some(c => myCards.has(c.id));
      if (!haveAny) continue;
      const missing = q.cards.filter(c => !myCards.has(c.id));
      for (const c of missing) {
        eligible.push({ quartet: q, card: c });
      }
    }

    if (!eligible.length) {
      ui.askPanel.innerHTML = `<div class="quartet-muted">У тебя уже полные квартеты по всем темам в руке или не хватает карт для запроса.</div>`;
      return;
    }

    ui.askPanel.innerHTML = `
      <div class="quartet-field">
        <label>Кого спросить</label>
        <select id="q_target" class="q-input">
          ${targets.map(p => `<option value="${escapeHtml(String(p.playerId))}">${escapeHtml(p.name)} (🂠 ${p.cardsCount ?? 0})</option>`).join("")}
        </select>
      </div>

      <div class="quartet-field">
        <label>Какую карту спросить (только из квартета, часть которого у тебя уже есть)</label>
        <select id="q_card" class="q-input">
          ${eligible.map(x => `<option value="${escapeHtml(x.card.id)}">${escapeHtml(x.quartet.name)} — ${escapeHtml(x.card.title)}</option>`).join("")}
        </select>
      </div>

      <button id="q_ask_btn" class="start-button">Спросить карту</button>
      <div class="quartet-hint">Если у игрока есть карта — у него будет 10 секунд нажать «Отдать». Потом отдача произойдёт автоматически.</div>
    `;

    const askBtn = document.getElementById("q_ask_btn");
    askBtn?.addEventListener("click", async () => {
      try {
        const targetId = document.getElementById("q_target")?.value;
        const cardId = document.getElementById("q_card")?.value;
        if (!targetId || !cardId) return;
        setStatus("Отправляю запрос…");
        await api("askCard", { targetId, cardId });
        setStatus("Запрос отправлен.", "ok");
        await refreshState(true);
      } catch (e) {
        console.error(e);
        setStatus(String(e.message || e), "err");
      }
    });
  }

  function updatePendingModal(st) {
    const pending = st.pending;
    if (!pending || pending.status !== "waiting") {
      hidePending();
      return;
    }

    // Показать модалку только если я — цель
    if (String(pending.targetId) !== playerId) {
      hidePending();
      return;
    }

    const haveCard = !!pending.targetHasCard;
    const secsLeft = Math.max(0, Math.ceil((pending.expiresAtMs - Date.now()) / 1000));

    const text = document.getElementById("q_pending_text");
    const giveBtn = document.getElementById("q_give");
    if (text) {
      text.innerHTML = `Игрок <b>${escapeHtml(pending.askerName || "")}</b> просит карту: <b>${escapeHtml(pending.cardTitle || pending.cardId)}</b><br>
        <span class="quartet-muted">Осталось: ${secsLeft} сек.</span>`;
    }
    if (giveBtn) {
      giveBtn.disabled = !haveCard;
      giveBtn.textContent = haveCard ? "Отдать карту" : "Карты нет";
    }
    ui.pendingModal?.classList.remove("hidden");
  }

  function hidePending() {
    ui.pendingModal?.classList.add("hidden");
  }

  async function onGiveCard() {
    try {
      if (!state?.pending?.pendingId) return;
      await api("giveCard", { pendingId: state.pending.pendingId });
      hidePending();
      await refreshState(true);
    } catch (e) {
      console.error(e);
      setStatus(String(e.message || e), "err");
    }
  }

  function findCardMeta(cardId) {
    if (!gameData) return null;
    for (const q of gameData.quartets) {
      const c = q.cards.find(x => x.id === cardId);
      if (c) return { quartet: q, card: c };
    }
    return null;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  // ===== init =====
  (async () => {
    renderShell();
    try {
      gameData = await loadJSON(quartetsUrl);
      setStatus("Готово. Вставь GAS_URL, задай имя и создай/войдите в комнату.", "info");
      if (roomId && GAS_URL) {
        ui.main.classList.remove("hidden");
        document.getElementById("q_room_label").textContent = roomId;
        startPolling();
      }
    } catch (e) {
      console.error(e);
      setStatus("Не удалось загрузить данные колоды (quartet_bible.json)", "err");
    }
  })();
}
