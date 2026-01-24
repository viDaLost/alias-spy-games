// games/quartet.js — Библейский «Квартет» (локально + онлайн через WebSocket)
// ВАЖНО: для онлайн-режима нужно указать WORKER_BASE_URL (см. README.server.md)

(function () {
  const WORKER_BASE_URL = "https://REPLACE_ME.workers.dev"; // <-- замени на свой домен воркера

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function safeName(raw) {
    const s = (raw || "").trim().slice(0, 18);
    return s || "Игрок";
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // -----------------------
  // Локальная игра (на одном телефоне)
  // -----------------------
  function createLocalEngine(def, playerNames) {
    const deck = [];
    def.quartets.forEach((q, qi) => {
      q.cards.forEach((name, ci) => {
        deck.push({ id: `${qi}:${ci}`, theme: q.theme, name });
      });
    });
    const shuffled = shuffle(deck);

    const players = playerNames.map((name) => ({
      id: uid(),
      name,
      hand: [],
      sets: [] // [{theme, cards:[...] }]
    }));

    // раздача по кругу
    let p = 0;
    while (shuffled.length) {
      players[p].hand.push(shuffled.pop());
      p = (p + 1) % players.length;
    }

    const state = {
      mode: "local",
      players,
      turn: 0,
      lastAction: ""
    };

    function hasThemeCard(player, theme) {
      return player.hand.some((c) => c.theme === theme);
    }

    function findCardInHand(player, cardId) {
      const idx = player.hand.findIndex((c) => c.id === cardId);
      if (idx === -1) return null;
      const card = player.hand[idx];
      return { idx, card };
    }

    function tryLayDown(playerIndex) {
      const pl = state.players[playerIndex];
      const byTheme = new Map();
      for (const c of pl.hand) {
        if (!byTheme.has(c.theme)) byTheme.set(c.theme, []);
        byTheme.get(c.theme).push(c);
      }
      for (const [theme, cards] of byTheme.entries()) {
        if (cards.length === 4) {
          // убрать из руки
          pl.hand = pl.hand.filter((c) => c.theme !== theme);
          pl.sets.push({ theme, cards: cards.map((c) => c.name) });
          state.lastAction = `✅ ${pl.name} собрал(а) квартет «${theme}»!`;
          return true;
        }
      }
      return false;
    }

    function isGameOver() {
      const totalSets = state.players.reduce((s, p) => s + p.sets.length, 0);
      return totalSets === def.quartets.length;
    }

    function ask(fromIndex, toIndex, cardId) {
      const from = state.players[fromIndex];
      const to = state.players[toIndex];
      const refCard = from.hand.find((c) => c.id === cardId);

      if (!refCard) {
        return { ok: false, msg: "Можно просить только карту из квартета, который у тебя уже есть (хотя бы одна карта)." };
      }
      const theme = refCard.theme;
      if (!hasThemeCard(from, theme)) {
        return { ok: false, msg: "Сначала нужно иметь хотя бы одну карту из этого квартета." };
      }
      const found = findCardInHand(to, cardId);
      if (found) {
        to.hand.splice(found.idx, 1);
        from.hand.push(found.card);
        state.lastAction = `🤝 ${from.name} забрал(а) у ${to.name} карту «${found.card.name}» (${theme}).`;
        // ход продолжается
        tryLayDown(fromIndex);
        return { ok: true, keepTurn: true };
      }
      // нет карты — ход переходит к тому, у кого просили
      state.lastAction = `❌ У ${to.name} нет этой карты. Ход переходит к ${to.name}.`;
      state.turn = toIndex;
      return { ok: true, keepTurn: false };
    }

    return { state, ask, tryLayDown, isGameOver };
  }

  // -----------------------
  // Онлайн-движок (тонкий клиент) — вся логика на сервере
  // -----------------------
  function createOnlineClient() {
    let ws = null;
    let me = { id: null, name: null };
    let roomCode = null;
    let lastState = null;
    const listeners = new Set();

    function notify() {
      for (const fn of listeners) fn(lastState, me, roomCode);
    }

    function onState(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }

    function send(type, payload) {
      if (!ws || ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type, payload }));
    }

    async function createRoom(name, maxPlayers) {
      const res = await fetch(`${WORKER_BASE_URL}/api/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, maxPlayers })
      });
      if (!res.ok) throw new Error("Не удалось создать комнату");
      const data = await res.json();
      roomCode = data.code;
      await connect(roomCode, name);
      return roomCode;
    }

    async function connect(code, name) {
      roomCode = (code || "").trim().toUpperCase();
      me.name = safeName(name);
      const url = `${WORKER_BASE_URL.replace(/^http/, "ws")}/ws/${roomCode}?name=${encodeURIComponent(me.name)}`;
      ws = new WebSocket(url);

      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === "welcome") {
          me.id = msg.payload.playerId;
        }
        if (msg.type === "state") {
          lastState = msg.payload;
          notify();
        }
        if (msg.type === "error") {
          alert(msg.payload?.message || "Ошибка");
        }
      };

      ws.onclose = () => {
        // не спамим алертами — просто обновим UI
        notify();
      };

      ws.onerror = () => {
        notify();
      };
    }

    function startGame() {
      send("start", {});
    }

    function ask(targetPlayerId, cardId) {
      send("ask", { targetPlayerId, cardId });
    }

    function leave() {
      try { ws?.close(); } catch {}
      ws = null;
    }

    return { onState, createRoom, connect, startGame, ask, leave };
  }

  // -----------------------
  // UI
  // -----------------------
  window.startQuartetGame = async function startQuartetGame(quartetsUrl) {
    const container = document.getElementById("game-container");
    container.innerHTML = "";

    const def = await loadJSON(quartetsUrl);

    const screen = el("div", "quartet-screen");
    const title = el("h2", null, "🃏 Библейский Квартет");
    const subtitle = el(
      "p",
      "quartet-subtitle",
      "Собирайте наборы из 4 карт одной темы. Можно играть на одном телефоне или онлайн (комната)."
    );

    const btnLocal = el("button", "menu-button", "📱 Играть на одном телефоне");
    const btnOnline = el("button", "menu-button", "🌐 Играть онлайн (комната)");
    const btnBack = el("button", "back-button", "⬅️ В меню");
    btnBack.onclick = () => {
      try { onlineClient?.leave?.(); } catch {}
      goToMainMenu();
    };

    screen.append(title, subtitle, btnLocal, btnOnline, btnBack);
    container.appendChild(screen);

    // ---- локально ----
    btnLocal.onclick = () => renderLocalSetup(def, container);

    // ---- онлайн ----
    let onlineClient = null;
    btnOnline.onclick = () => renderOnlineSetup(def, container, () => (onlineClient = createOnlineClient()));
  };

  function renderLocalSetup(def, container) {
    container.innerHTML = "";
    const screen = el("div", "quartet-screen");
    screen.appendChild(el("h2", null, "📱 Локальная игра"));
    screen.appendChild(el("p", "quartet-subtitle", "Введите имена 4–8 игроков (через запятую)."));

    const input = el("input", "quartet-input");
    input.placeholder = "Например: Анна, Пётр, Мария, Иван";
    input.value = "";

    const startBtn = el("button", "start-button", "▶️ Начать");
    const backBtn = el("button", "back-button", "⬅️ Назад");
    backBtn.onclick = () => window.startQuartetGame("data/quartet_bible.json");

    screen.append(input, startBtn, backBtn);
    container.appendChild(screen);

    startBtn.onclick = () => {
      const names = input.value
        .split(",")
        .map((s) => safeName(s))
        .filter(Boolean);

      if (names.length < 4 || names.length > 8) {
        alert("Нужно 4–8 игроков.");
        return;
      }
      const engine = createLocalEngine(def, names);
      renderLocalGame(def, container, engine);
    };
  }

  function renderLocalGame(def, container, engine) {
    const state = engine.state;
    container.innerHTML = "";
    const screen = el("div", "quartet-screen");

    const top = el("div", "quartet-topbar");
    const info = el("div", "quartet-info");
    const btnMenu = el("button", "back-button", "⬅️ В меню");
    btnMenu.onclick = () => goToMainMenu();
    top.append(info, btnMenu);

    const action = el("div", "quartet-action");
    const yourHand = el("div", "quartet-hand");
    const askPanel = el("div", "quartet-panel");
    const scoreboard = el("div", "quartet-score");

    screen.append(top, action, yourHand, askPanel, scoreboard);
    container.appendChild(screen);

    function render() {
      const current = state.players[state.turn];
      info.innerHTML = `<strong>Ход:</strong> ${current.name} · <strong>Квартетов:</strong> ${state.players.reduce((s,p)=>s+p.sets.length,0)}/${def.quartets.length}`;
      action.textContent = state.lastAction || "";

      // рука текущего игрока
      const hand = [...current.hand].sort((a, b) => (a.theme + a.name).localeCompare(b.theme + b.name));
      yourHand.innerHTML = `<div class="quartet-section-title">Карты игрока: <strong>${current.name}</strong></div>`;
      const list = el("div", "quartet-cards");
      hand.forEach((c) => {
        const chip = el("button", "quartet-card", `${c.name}<span class="quartet-card-sub">${c.theme}</span>`);
        chip.onclick = () => selectCard(c.id);
        list.appendChild(chip);
      });
      yourHand.appendChild(list);

      // панель запроса
      askPanel.innerHTML = "";
      askPanel.appendChild(el("div", "quartet-section-title", "Спросить карту"));
      const hint = el("p", "quartet-subtitle", "Выбери карту из своей руки, затем выбери игрока, у кого спросить.");
      askPanel.appendChild(hint);

      const picked = state.__pickedCardId;
      const pickedCard = current.hand.find((c) => c.id === picked);
      const pickedLine = el("div", "quartet-picked", pickedCard ? `Выбрано: <strong>${pickedCard.name}</strong> (${pickedCard.theme})` : "Выбрано: —");
      askPanel.appendChild(pickedLine);

      const others = state.players
        .map((p, idx) => ({ p, idx }))
        .filter((x) => x.idx !== state.turn);
      others.forEach(({ p, idx }) => {
        const b = el("button", "menu-button", `Попросить у: ${p.name}`);
        b.disabled = !picked;
        b.onclick = () => {
          const r = engine.ask(state.turn, idx, picked);
          if (!r.ok) {
            alert(r.msg);
            return;
          }
          state.__pickedCardId = null;
          // после каждого действия проверяем конец
          if (engine.isGameOver()) {
            renderGameOver(container, state.players);
            return;
          }
          // если игрок без карт — выбывает (пропускаем его ходы)
          skipEmptyHands();
          render();
        };
        askPanel.appendChild(b);
      });

      // таблица счёта
      scoreboard.innerHTML = "";
      scoreboard.appendChild(el("div", "quartet-section-title", "Счёт"));
      state.players.forEach((p, idx) => {
        const row = el(
          "div",
          "quartet-score-row",
          `<span>${idx === state.turn ? "👉 " : ""}${p.name}</span><span>${p.sets.length} кварт.</span><span>${p.hand.length} карт</span>`
        );
        scoreboard.appendChild(row);
        if (p.sets.length) {
          const sets = el("div", "quartet-sets");
          p.sets.forEach((s) => {
            sets.appendChild(el("div", "quartet-set", `✅ <strong>${s.theme}</strong>: ${s.cards.join(", ")}`));
          });
          scoreboard.appendChild(sets);
        }
      });
    }

    function selectCard(cardId) {
      state.__pickedCardId = cardId;
      render();
    }

    function skipEmptyHands() {
      let guard = 0;
      while (guard++ < 20) {
        const cur = state.players[state.turn];
        if (cur.hand.length > 0) return;
        // пропускаем игрока
        state.turn = (state.turn + 1) % state.players.length;
      }
    }

    // в начале — попробуем автоматически выложить квартеты (если вдруг)
    state.players.forEach((_, i) => engine.tryLayDown(i));
    render();
  }

  function renderGameOver(container, players) {
    container.innerHTML = "";
    const screen = el("div", "quartet-screen");
    screen.appendChild(el("h2", null, "🏁 Игра окончена"));

    const sorted = [...players].sort((a, b) => b.sets.length - a.sets.length);
    const winner = sorted[0];
    screen.appendChild(el("p", "quartet-subtitle", `Победитель: <strong>${winner.name}</strong> (${winner.sets.length} кварт.)`));

    const list = el("div", "quartet-score");
    sorted.forEach((p) => {
      list.appendChild(el("div", "quartet-score-row", `<span>${p.name}</span><span>${p.sets.length} кварт.</span>`));
    });
    screen.appendChild(list);

    const btnMenu = el("button", "back-button", "⬅️ В меню");
    btnMenu.onclick = () => goToMainMenu();
    screen.appendChild(btnMenu);

    container.appendChild(screen);
  }

  function renderOnlineSetup(def, container, clientFactory) {
    container.innerHTML = "";
    const client = clientFactory();

    const screen = el("div", "quartet-screen");
    screen.appendChild(el("h2", null, "🌐 Онлайн-игра"));
    screen.appendChild(el("p", "quartet-subtitle", "Создай комнату или подключись по коду (4–8 игроков)."));

    const nameInput = el("input", "quartet-input");
    nameInput.placeholder = "Твоё имя";

    const codeInput = el("input", "quartet-input");
    codeInput.placeholder = "Код комнаты (например: AB12CD)";
    codeInput.autocapitalize = "characters";

    const createBtn = el("button", "start-button", "➕ Создать комнату");
    const joinBtn = el("button", "menu-button", "🔌 Подключиться");
    const backBtn = el("button", "back-button", "⬅️ Назад");
    backBtn.onclick = () => window.startQuartetGame("data/quartet_bible.json");

    const status = el("div", "quartet-status", "");
    screen.append(nameInput, codeInput, createBtn, joinBtn, status, backBtn);
    container.appendChild(screen);

    function setStatus(text) {
      status.innerHTML = text;
    }

    async function ensureWorkerSet() {
      if (WORKER_BASE_URL.includes("REPLACE_ME")) {
        alert("Для онлайн-игры нужно настроить бесплатный сервер (Cloudflare Worker) и вставить его адрес в games/quartet.js (WORKER_BASE_URL).\n\nОффлайн режим работает без сервера.");
        return false;
      }
      return true;
    }

    createBtn.onclick = async () => {
      if (!(await ensureWorkerSet())) return;
      const name = safeName(nameInput.value);
      setStatus("🔄 Создаю комнату...");
      try {
        const code = await client.createRoom(name, 8);
        setStatus(`✅ Комната создана. Код: <strong>${code}</strong><br>Поделись кодом с друзьями.`);
        renderOnlineLobby(def, container, client);
      } catch (e) {
        console.error(e);
        setStatus("❌ Не удалось создать комнату. Проверь сервер.");
      }
    };

    joinBtn.onclick = async () => {
      if (!(await ensureWorkerSet())) return;
      const name = safeName(nameInput.value);
      const code = (codeInput.value || "").trim().toUpperCase();
      if (!code) {
        alert("Введи код комнаты");
        return;
      }
      setStatus("🔄 Подключаюсь...");
      try {
        await client.connect(code, name);
        renderOnlineLobby(def, container, client);
      } catch (e) {
        console.error(e);
        setStatus("❌ Не удалось подключиться. Проверь код и сервер.");
      }
    };
  }

  function renderOnlineLobby(def, container, client) {
    container.innerHTML = "";
    const screen = el("div", "quartet-screen");
    const title = el("h2", null, "🧩 Комната");
    const status = el("div", "quartet-status", "");
    const playersBox = el("div", "quartet-score", "");
    const startBtn = el("button", "start-button", "▶️ Начать игру");
    const leaveBtn = el("button", "back-button", "⬅️ В меню");
    leaveBtn.onclick = () => {
      client.leave();
      goToMainMenu();
    };

    screen.append(title, status, playersBox, startBtn, leaveBtn);
    container.appendChild(screen);

    let unsubscribe = client.onState((st, me, roomCode) => {
      if (!st) {
        status.innerHTML = "⚠️ Нет соединения.";
        return;
      }
      const mePlayer = st.players.find((p) => p.id === me.id);
      status.innerHTML = `Код комнаты: <strong>${roomCode}</strong><br>Игроков: ${st.players.length}/${st.maxPlayers} · Статус: <strong>${st.phase}</strong>`;

      playersBox.innerHTML = "";
      st.players.forEach((p) => {
        const row = el("div", "quartet-score-row", `<span>${p.id === me.id ? "👉 " : ""}${p.name}</span><span>${p.sets || 0} кварт.</span><span>${p.hand || 0} карт</span>`);
        playersBox.appendChild(row);
      });

      // старт доступен только хосту
      startBtn.disabled = !(st.hostId === me.id) || st.phase !== "lobby" || st.players.length < 4;
      startBtn.onclick = () => client.startGame();

      if (st.phase === "playing") {
        unsubscribe?.();
        renderOnlineGame(def, container, client);
      }
    });
  }

  function renderOnlineGame(def, container, client) {
    container.innerHTML = "";
    const screen = el("div", "quartet-screen");
    const top = el("div", "quartet-topbar");
    const info = el("div", "quartet-info", "");
    const btnMenu = el("button", "back-button", "⬅️ В меню");
    btnMenu.onclick = () => {
      client.leave();
      goToMainMenu();
    };
    top.append(info, btnMenu);

    const action = el("div", "quartet-action", "");
    const handBox = el("div", "quartet-hand", "");
    const askPanel = el("div", "quartet-panel", "");
    const scoreboard = el("div", "quartet-score", "");

    screen.append(top, action, handBox, askPanel, scoreboard);
    container.appendChild(screen);

    let pickedCardId = null;

    client.onState((st, me, roomCode) => {
      if (!st) {
        info.textContent = "⚠️ Нет соединения";
        return;
      }

      const meP = st.players.find((p) => p.id === me.id);
      const current = st.players.find((p) => p.id === st.turnPlayerId);
      info.innerHTML = `Код: <strong>${roomCode}</strong> · Ход: <strong>${current?.name || "—"}</strong> · Квартетов: ${st.totalSets}/${def.quartets.length}`;
      action.textContent = st.lastAction || "";

      // рука
      handBox.innerHTML = `<div class="quartet-section-title">Твои карты (${meP?.name || me.name})</div>`;
      const list = el("div", "quartet-cards");
      (meP?.handCards || []).forEach((c) => {
        const b = el("button", "quartet-card", `${c.name}<span class="quartet-card-sub">${c.theme}</span>`);
        b.onclick = () => {
          pickedCardId = c.id;
          renderAskPanel();
        };
        list.appendChild(b);
      });
      handBox.appendChild(list);

      // счёт
      scoreboard.innerHTML = "";
      scoreboard.appendChild(el("div", "quartet-section-title", "Счёт"));
      st.players.forEach((p) => {
        const row = el("div", "quartet-score-row", `<span>${p.id === st.turnPlayerId ? "👉 " : ""}${p.name}</span><span>${p.sets || 0} кварт.</span><span>${p.hand || 0} карт</span>`);
        scoreboard.appendChild(row);
      });

      // конец
      if (st.phase === "finished") {
        const winner = st.winnerName || "—";
        alert(`Игра окончена! Победитель: ${winner}`);
      }

      renderAskPanel();

      function renderAskPanel() {
        askPanel.innerHTML = "";
        askPanel.appendChild(el("div", "quartet-section-title", "Спросить карту"));
        const canMove = st.turnPlayerId === me.id;
        askPanel.appendChild(el("p", "quartet-subtitle", canMove ? "Выбери карту и игрока." : "Сейчас ход другого игрока."));
        const picked = (meP?.handCards || []).find((c) => c.id === pickedCardId);
        askPanel.appendChild(el("div", "quartet-picked", picked ? `Выбрано: <strong>${picked.name}</strong> (${picked.theme})` : "Выбрано: —"));

        st.players
          .filter((p) => p.id !== me.id)
          .forEach((p) => {
            const b = el("button", "menu-button", `Попросить у: ${p.name}`);
            b.disabled = !canMove || !pickedCardId;
            b.onclick = () => client.ask(p.id, pickedCardId);
            askPanel.appendChild(b);
          });
      }
    });
  }
})();
