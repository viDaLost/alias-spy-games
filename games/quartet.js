// games/quartet.js — Онлайн "Квартет" через Supabase (Realtime)
// Требования:
// 1) Старт игры только у создателя (host)
// 2) Список игроков обновляется у всех постоянно
// 3) Нельзя подключиться, если игра уже запущена (phase != lobby)

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
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  }

  function needSupabase(container) {
    if (!window.supabase || !window.supabase.createClient) {
      container.innerHTML = `
        <p style="color:red">❌ Supabase SDK не загрузился.</p>
        <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
      `;
      return null;
    }
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || window.SUPABASE_URL.includes("YOUR_")) {
      container.innerHTML = `
        <p style="color:red">❌ Не настроен Supabase.</p>
        <p>Заполни файл <b>supabase-config.js</b>.</p>
        <button class="back-button" onclick="goToMainMenu()">⬅️ В меню</button>
      `;
      return null;
    }
    return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }

  // Realtime state
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
      .select("code, phase, host_player_id, started_at, created_at")
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

    return { room, players: players || [] };
  }

  function subscribeRoom(code, onUpdate) {
    cleanupRealtime();

    channel = sb
      .channel(`room:${code}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` },
        () => onUpdate()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_code=eq.${code}` },
        () => onUpdate()
      )
      .subscribe((status) => {
        // 👇 важно: как только подписка реально активна — делаем принудительный refresh
        if (status === "SUBSCRIBED") onUpdate();
      });
  }

  // Entry point from app.js
  window.startQuartetGame = async function startQuartetGame() {
    const container = document.getElementById("game-container");
    container.innerHTML = "<p class='fade-in'>🔄 Загрузка игры...</p>";

    sb = needSupabase(container);
    if (!sb) return;

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
        for (let i = 0; i < 12; i++) {
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

        // 2) создать игрока-хоста
        const playerId = crypto.randomUUID();

        // 3) создать комнату (ВАЖНО: записываем host_player_id)
        const { error: insRoomErr } = await sb
          .from("rooms")
          .insert({ code, phase: "lobby", host_player_id: playerId });
        if (insRoomErr) throw insRoomErr;

        // 4) добавить игрока
        const { error: insPlayerErr } = await sb
          .from("players")
          .insert({ id: playerId, room_code: code, name });
        if (insPlayerErr) throw insPlayerErr;

        currentRoomCode = code;
        currentPlayerId = playerId;

        renderLobby(container);
      } catch (e) {
        console.error(e);
        setStatus(status, "❌ Не удалось создать комнату. Проверь Supabase (RLS/Realtime).", true);
      }
    };

    joinBtn.onclick = async () => {
      const name = safeName(nameInput.value);
      const code = (codeInput.value || "").trim().toUpperCase();
      if (!code) return setStatus(status, "❌ Введи код комнаты.", true);

      setStatus(status, "🔄 Подключаюсь...");

      try {
        // 1) проверяем комнату и что она в lobby
        const { data: room, error: roomErr } = await sb
          .from("rooms")
          .select("code, phase")
          .eq("code", code)
          .maybeSingle();
        if (roomErr) throw roomErr;
        if (!room) throw new Error("Комната не найдена");

        if (room.phase !== "lobby") {
          // ✅ запрет на подключение после старта
          setStatus(status, "⛔ Игра уже запущена. Подключиться нельзя.", true);
          return;
        }

        // 2) добавляем игрока
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
        setStatus(status, "❌ Не удалось подключиться (возможно игра уже началась).", true);
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
    startBtn.disabled = true;

    const leaveBtn = el("button", "back-button", "⬅️ В меню");
    leaveBtn.onclick = async () => {
      try {
        if (currentPlayerId && currentRoomCode) {
          await sb.from("players").delete().eq("id", currentPlayerId);
        }
      } catch {}
      cleanupRealtime();
      goToMainMenu();
    };

    screen.append(title, status, playersBox, startBtn, leaveBtn);
    container.appendChild(screen);

    let lastRoom = null;

    const update = async () => {
      try {
        const st = await fetchState(currentRoomCode);
        const room = st.room;
        const players = st.players;

        lastRoom = room;

        setStatus(
          status,
          `Код комнаты: <strong>${room.code}</strong><br>` +
          `Статус: <strong>${room.phase}</strong>` +
          (room.host_player_id === currentPlayerId ? "<br><span>👑 Ты создатель лобби</span>" : "")
        );

        // список игроков — у ВСЕХ
        playersBox.innerHTML = "";
        players.forEach((p) => {
          playersBox.appendChild(
            el(
              "div",
              "quartet-score-row",
              `<span>${p.id === room.host_player_id ? "👑 " : ""}${p.id === currentPlayerId ? "👉 " : ""}${p.name}</span><span></span><span></span>`
            )
          );
        });

        // ✅ “Начать игру” только у хоста, только в lobby, и минимум 2 игрока
        const isHost = room.host_player_id === currentPlayerId;
        const canStart = isHost && room.phase === "lobby" && players.length >= 2;
        startBtn.style.display = isHost ? "" : "none";
        startBtn.disabled = !canStart;

        // если игра уже началась — показываем инфо
        if (!isHost && room.phase !== "lobby") {
          // у гостей просто нет кнопки, и всё
        }
      } catch (e) {
        console.error(e);
        setStatus(status, "⚠️ Не удалось получить состояние комнаты. Проверь Realtime/Policies.", true);
      }
    };

    subscribeRoom(currentRoomCode, update);
    update();

    startBtn.onclick = async () => {
      try {
        if (!lastRoom) return;

        // двойная защита: стартовать может только host (клиентская)
        if (lastRoom.host_player_id !== currentPlayerId) return;

        await sb
          .from("rooms")
          .update({ phase: "playing", started_at: new Date().toISOString() })
          .eq("code", currentRoomCode);

        // update() придёт по realtime
      } catch (e) {
        console.error(e);
        setStatus(status, "❌ Не удалось начать игру.", true);
      }
    };
  }
})();
