// games/quartet.js — Квартет (онлайн) через Supabase (Realtime) для GitHub Pages
// Никаких Workers / WebSocket сервера — Supabase сам даёт realtime обновления.

(function () {
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

  function makeCode(len = 5) {
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // без похожих символов
    let s = "";
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  }

  function needSupabase(container) {
    if (!window.supabase || !window.supabase.createClient) {
      container.innerHTML = `
        <p style="color:red">❌ Supabase не загрузился. Проверь, что в index.html подключён supabase-js.</p>
        <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
      `;
      return null;
    }
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || window.SUPABASE_URL.includes("YOUR_")) {
      container.innerHTML = `
        <p style="color:red">❌ Не настроен Supabase.</p>
        <p>Открой файл <b>supabase-config.js</b> и вставь SUPABASE_URL и SUPABASE_ANON_KEY.</p>
        <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
      `;
      return null;
    }
    return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }

  // --- Realtime state ---
  let sb = null;
  let currentRoomCode = null;
  let currentPlayerId = null;
  let channel = null;

  function cleanupRealtime() {
    try {
      if (channel && sb) sb.removeChannel(channel);
    } catch {}
    channel = null;
  }

  async function fetchState(code) {
    const { data: room, error: roomErr } = await sb
      .from("rooms")
      .select("code, phase, created_at")
      .eq("code", code)
      .maybeSingle();

    if (roomErr) throw roomErr;
    if (!room) throw new Error("Комната не найдена");

    const { data: players, error: pErr } = await sb
      .from("players")
      .select("id, name, created_at")
      .eq("room_code", code)
      .order("created_at", { ascending: true });

    if (pErr) throw pErr;

    return {
      code: room.code,
      phase: room.phase,
      players: players || [],
      lastAction: null
    };
  }

  function subscribeRoom(code, onUpdate) {
    cleanupRealtime();

    // Подписка на изменения в rooms и players по конкретной комнате
    channel = sb
      .channel(`room:${code}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` },
        async () => onUpdate()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_code=eq.${code}` },
        async () => onUpdate()
      )
      .subscribe();
  }

  // ---------------------------------------------------------
  // Entry point called from app.js: startQuartetGame(quartetsUrl)
  // ---------------------------------------------------------
  window.startQuartetGame = async function startQuartetGame(_quartetsUrl) {
    const container = document.getElementById("game-container");
    container.innerHTML = "<p class='fade-in'>🔄 Загрузка игры...</p>";

    sb = needSupabase(container);
    if (!sb) return;

    // ✅ Никаких блокирующих fetch() к JSON → больше нет вечной загрузки
    renderOnlineSetup(container);
  };

  function renderOnlineSetup(container) {
    cleanupRealtime();
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
    backBtn.onclick = () => { cleanupRealtime(); goToMainMenu(); };

    screen.append(nameInput, codeInput, createBtn, joinBtn, status, backBtn);
    container.appendChild(screen);

    createBtn.onclick = async () => {
      const name = safeName(nameInput.value);
      setStatus(status, "🔄 Создаю комнату...");

      try {
        // 1) подобрать свободный код
        let code = null;
        for (let i = 0; i < 8; i++) {
          const candidate = makeCode(5);
          const { data: exists, error } = await sb
            .from("rooms")
            .select("code")
            .eq("code", candidate)
            .maybeSingle();
          if (error) throw error;
          if (!exists) { code = candidate; break; }
        }
        if (!code) throw new Error("Не удалось подобрать код, попробуй ещё раз.");

        // 2) создать комнату
        const { error: insRoomErr } = await sb
          .from("rooms")
          .insert({ code, phase: "lobby" });
        if (insRoomErr) throw insRoomErr;

        // 3) добавить игрока
        const playerId = crypto.randomUUID();
        const { error: insPlayerErr } = await sb
          .from("players")
          .insert({ id: playerId, room_code: code, name });
        if (insPlayerErr) throw insPlayerErr;

        currentRoomCode = code;
        currentPlayerId = playerId;

        renderLobby(container);
      } catch (e) {
        console.error(e);
        setStatus(status, "❌ Не удалось создать комнату. Проверь Supabase (таблицы/Realtime).", true);
      }
    };

    joinBtn.onclick = async () => {
      const name = safeName(nameInput.value);
      const code = (codeInput.value || "").trim().toUpperCase();
      if (!code) return setStatus(status, "❌ Введи код комнаты.", true);

      setStatus(status, "🔄 Подключаюсь...");

      try {
        const { data: room, error: roomErr } = await sb
          .from("rooms")
          .select("code")
          .eq("code", code)
          .maybeSingle();
        if (roomErr) throw roomErr;
        if (!room) throw new Error("Комната не найдена");

        const playerId = crypto.randomUUID();
        const { error: insPlayerErr } = await sb
          .from("players")
          .insert({ id: playerId, room_code: code, name });
        if (insPlayerErr) throw insPlayerErr;

        currentRoomCode = code;
        currentPlayerId = playerId;

        renderLobby(container);
      } catch (e) {
        console.error(e);
        setStatus(status, "❌ Не удалось подключиться. Проверь код/таблицы Supabase.", true);
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

    leaveBtn.onclick = async () => {
      try {
        // попытка удалить игрока при выходе
        if (currentPlayerId && currentRoomCode) {
          await sb.from("players").delete().eq("id", currentPlayerId);
        }
      } catch {}
      cleanupRealtime();
      goToMainMenu();
    };

    screen.append(title, status, playersBox, startBtn, leaveBtn);
    container.appendChild(screen);

    const update = async () => {
      try {
        const st = await fetchState(currentRoomCode);
        setStatus(status, `Код комнаты: <strong>${st.code}</strong><br>Статус: <strong>${st.phase}</strong>`);

        playersBox.innerHTML = "";
        st.players.forEach((p) => {
          playersBox.appendChild(
            el("div", "quartet-score-row",
              `<span>${p.id === currentPlayerId ? "👉 " : ""}${p.name}</span><span></span><span></span>`
            )
          );
        });

        // “Начать игру” доступно, когда хотя бы 2 игрока
        startBtn.disabled = st.phase !== "lobby" || st.players.length < 2;
      } catch (e) {
        console.error(e);
        setStatus(status, "⚠️ Не удалось получить состояние комнаты. Проверь Supabase/Realtime.", true);
      }
    };

    subscribeRoom(currentRoomCode, update);
    update();

    startBtn.onclick = async () => {
      try {
        await sb.from("rooms").update({ phase: "playing" }).eq("code", currentRoomCode);
      } catch (e) {
        console.error(e);
        setStatus(status, "❌ Не удалось начать игру.", true);
      }
    };
  }
})();
