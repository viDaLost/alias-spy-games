// Cloudflare Worker + Durable Object для онлайн‑комнат «Квартета»
// Деплой: вставь этот файл в Cloudflare Worker, добавь Durable Object binding:
//   Binding name: ROOMS
//   Class name:   Room

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS для GitHub Pages
    if (request.method === "OPTIONS") {
      return new Response("", { headers: corsHeaders() });
    }

    // --- API create ---
    if (url.pathname === "/api/create" && request.method === "POST") {
      const { name, maxPlayers } = await request.json().catch(() => ({}));
      const code = makeCode();
      // создаём DO инстанс заранее
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      await stub.fetch("https://room/init", {
        method: "POST",
        body: JSON.stringify({ code, hostName: safeName(name), maxPlayers: clamp(maxPlayers, 4, 8) }),
        headers: { "Content-Type": "application/json" }
      });
      return json({ code }, 200);
    }

    // --- WebSocket connect ---
    const m = url.pathname.match(/^\/ws\/([A-Z0-9]{4,8})$/i);
    if (m) {
      const code = m[1].toUpperCase();
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      // проксируем запрос в DO
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}

function makeCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function clamp(v, a, b) {
  const n = Number(v);
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function safeName(raw) {
  const s = (raw || "").toString().trim().slice(0, 18);
  return s || "Игрок";
}

// ----------------------------
// Durable Object: Room
// ----------------------------
export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sockets = new Map(); // socket -> playerId
    this.data = {
      code: null,
      maxPlayers: 8,
      phase: "lobby", // lobby|game|done
      players: [], // {id,name,hand:[cardId],sets:[theme] }
      turn: 0,
      lastAction: "",
      // колода/карты
      deck: [],
      cards: {}, // id -> {id,theme,name}
      quartetsCount: 0
    };

    this.ready = this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get("data");
      if (stored) this.data = stored;
    });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/init" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (!this.data.code) {
        this.data.code = (body.code || "").toUpperCase();
        this.data.maxPlayers = clamp(body.maxPlayers, 4, 8);
        this.data.phase = "lobby";
        this.data.players = [];
        this.data.turn = 0;
        this.data.lastAction = "Комната создана. Ждём игроков…";
        await this.persist();
      }
      return json({ ok: true }, 200);
    }

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  }

  async handleWebSocket(request) {
    const url = new URL(request.url);
    const name = safeName(url.searchParams.get("name"));

    if (!this.data.code) {
      // если кто-то пытается зайти в неинициализированную комнату
      return json({ error: "Room not initialized" }, 400);
    }

    if (this.data.players.length >= this.data.maxPlayers && this.data.phase === "lobby") {
      return json({ error: "Room is full" }, 400);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const playerId = crypto.randomUUID();

    // регаем игрока
    if (this.data.phase === "lobby") {
      this.data.players.push({ id: playerId, name, hand: [], sets: [] });
      this.data.lastAction = `👋 ${name} подключился(ась)`;
      await this.persist();
    } else {
      // во время игры — не пускаем новых
      server.send(JSON.stringify({ type: "error", payload: { message: "Игра уже началась" } }));
      server.close(1011, "game started");
      return new Response(null, { status: 101, webSocket: client });
    }

    this.sockets.set(server, playerId);
    server.send(JSON.stringify({ type: "welcome", payload: { playerId } }));
    this.broadcastState();

    server.addEventListener("message", async (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      try {
        await this.onMessage(playerId, server, msg);
      } catch (e) {
        server.send(JSON.stringify({ type: "error", payload: { message: e?.message || "Ошибка" } }));
      }
    });

    server.addEventListener("close", async () => {
      this.sockets.delete(server);
      // Упрощение: если кто-то вышел в лобби — удаляем из списка
      if (this.data.phase === "lobby") {
        const idx = this.data.players.findIndex((p) => p.id === playerId);
        if (idx !== -1) {
          const left = this.data.players[idx].name;
          this.data.players.splice(idx, 1);
          this.data.lastAction = `🚪 ${left} вышел(а)`;
          await this.persist();
          this.broadcastState();
        }
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async onMessage(playerId, socket, msg) {
    const type = msg?.type;
    const payload = msg?.payload || {};

    const meIdx = this.data.players.findIndex((p) => p.id === playerId);
    if (meIdx === -1) throw new Error("Игрок не найден");

    if (type === "start") {
      if (this.data.phase !== "lobby") return;
      if (this.data.players.length < 4) throw new Error("Нужно минимум 4 игрока");
      await this.startGame();
      return;
    }

    if (type === "ask") {
      if (this.data.phase !== "game") throw new Error("Игра ещё не началась");
      if (this.data.turn !== meIdx) throw new Error("Сейчас не твой ход");

      const toId = payload.toId;
      const cardId = payload.cardId;
      const toIdx = this.data.players.findIndex((p) => p.id === toId);
      if (toIdx === -1) throw new Error("Соперник не найден");
      if (!this.data.cards[cardId]) throw new Error("Карты не существует");

      // можно просить, только если у тебя есть хотя бы одна карта этого квартета
      const want = this.data.cards[cardId];
      const myHand = this.data.players[meIdx].hand;
      const hasTheme = myHand.some((id) => this.data.cards[id]?.theme === want.theme);
      if (!hasTheme) throw new Error("Можно просить карту только из квартета, который ты уже начал собирать");

      const opponentHand = this.data.players[toIdx].hand;
      const pos = opponentHand.indexOf(cardId);
      if (pos !== -1) {
        opponentHand.splice(pos, 1);
        myHand.push(cardId);
        this.data.lastAction = `🤝 ${this.data.players[meIdx].name} забрал(а) у ${this.data.players[toIdx].name} «${want.name}» (${want.theme}).`;
        await this.tryLayDown(meIdx);
        await this.persist();
        this.broadcastState();
        return;
      }

      this.data.lastAction = `❌ У ${this.data.players[toIdx].name} нет этой карты. Ход переходит к нему/ней.`;
      this.data.turn = toIdx;
      await this.persist();
      this.broadcastState();
      return;
    }

    if (type === "laydown") {
      if (this.data.phase !== "game") return;
      // позволяем положить квартет даже вне хода — но на практике кнопка будет у текущего игрока
      await this.tryLayDown(meIdx);
      await this.persist();
      this.broadcastState();
      return;
    }
  }

  async startGame() {
    // фиксированный набор квартетов как в клиенте (без внешнего хранилища)
    const def = defaultQuartets();
    const deck = [];
    def.quartets.forEach((q, qi) => {
      q.cards.forEach((name, ci) => {
        const id = `${qi}:${ci}`;
        this.data.cards[id] = { id, theme: q.theme, name };
        deck.push(id);
      });
    });
    this.data.quartetsCount = def.quartets.length;
    this.data.deck = shuffle(deck);

    // раздача по кругу
    this.data.players.forEach((p) => {
      p.hand = [];
      p.sets = [];
    });
    let p = 0;
    while (this.data.deck.length) {
      this.data.players[p].hand.push(this.data.deck.pop());
      p = (p + 1) % this.data.players.length;
    }
    this.data.turn = 0;
    this.data.phase = "game";
    this.data.lastAction = "🎬 Игра началась! Ход первого игрока.";
    await this.persist();
    this.broadcastState();
  }

  async tryLayDown(playerIndex) {
    const pl = this.data.players[playerIndex];
    const byTheme = new Map();
    for (const id of pl.hand) {
      const c = this.data.cards[id];
      if (!c) continue;
      if (!byTheme.has(c.theme)) byTheme.set(c.theme, []);
      byTheme.get(c.theme).push(id);
    }
    for (const [theme, ids] of byTheme.entries()) {
      if (ids.length === 4) {
        pl.hand = pl.hand.filter((x) => this.data.cards[x]?.theme !== theme);
        pl.sets.push(theme);
        this.data.lastAction = `✅ ${pl.name} собрал(а) квартет «${theme}»!`;
        // конец?
        const totalSets = this.data.players.reduce((s, p) => s + p.sets.length, 0);
        if (totalSets === this.data.quartetsCount) {
          this.data.phase = "done";
          this.data.lastAction += " 🏁 Игра завершена.";
        }
        return true;
      }
    }
    return false;
  }

  broadcastState() {
    const payload = {
      code: this.data.code,
      maxPlayers: this.data.maxPlayers,
      phase: this.data.phase,
      players: this.data.players.map((p, idx) => ({
        id: p.id,
        name: p.name,
        handCount: p.hand.length,
        sets: p.sets
      })),
      turnPlayerId: this.data.players[this.data.turn]?.id || null,
      lastAction: this.data.lastAction,
      // для каждого сокета отправляем персональный hand
      cards: this.data.cards
    };

    for (const [ws, pid] of this.sockets.entries()) {
      const me = this.data.players.find((p) => p.id === pid);
      const per = {
        ...payload,
        you: {
          id: pid,
          hand: (me?.hand || []).map((id) => this.data.cards[id])
        }
      };
      try {
        ws.send(JSON.stringify({ type: "state", payload: per }));
      } catch {}
    }
  }

  async persist() {
    await this.state.storage.put("data", this.data);
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ВАЖНО: этот набор должен совпадать по смыслу с data/quartet_bible.json (клиент).
function defaultQuartets() {
  return {
    quartets: [
      { theme: "Евангелия", cards: ["Матфей", "Марк", "Лука", "Иоанн"] },
      { theme: "Патриархи", cards: ["Авраам", "Исаак", "Иаков", "Иосиф"] },
      { theme: "Судьи", cards: ["Гедеон", "Самсон", "Девора", "Самуил"] },
      { theme: "Цари", cards: ["Саул", "Давид", "Соломон", "Езекия"] },
      { theme: "Апостолы", cards: ["Пётр", "Иоанн", "Иаков", "Андрей"] },
      { theme: "Чудеса Иисуса", cards: ["Насыщение пяти тысяч", "Хождение по воде", "Исцеление слепого", "Воскрешение Лазаря"] },
      { theme: "Плоды Духа", cards: ["Любовь", "Радость", "Мир", "Долготерпение"] },
      { theme: "Доспехи Божьи", cards: ["Пояс истины", "Броня праведности", "Щит веры", "Меч Духа"] }
    ]
  };
}
