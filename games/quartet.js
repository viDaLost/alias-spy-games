const SERVER_URL = "https://bible-quartet.74x942q7fb.workers.dev/";

let currentPlayerId = null;
let currentRoomCode = null;
let socket = null;

function qs(id) {
  return document.getElementById(id);
}

export function startQuartetGame(container) {
  container.innerHTML = `
    <h2>🌍 Онлайн-игра</h2>

    <input id="playerName" placeholder="Ваше имя" />
    <input id="roomCode" placeholder="Код комнаты (если есть)" />

    <button id="createRoom">➕ Создать комнату</button>
    <button id="joinRoom">🔌 Подключиться</button>

    <p id="status" style="color:red;"></p>
    <div id="game"></div>
  `;

  qs("createRoom").onclick = createRoom;
  qs("joinRoom").onclick = joinRoom;
}

async function createRoom() {
  const name = qs("playerName").value.trim();
  if (!name) return showError("Введите имя");

  try {
    const res = await fetch(`${SERVER_URL}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    if (!res.ok) throw new Error("server");

    const data = await res.json();
    currentRoomCode = data.code;
    currentPlayerId = data.playerId;

    connectWS();
    qs("status").innerText = `Комната создана: ${currentRoomCode}`;
  } catch {
    showError("Не удалось создать комнату. Проверь сервер.");
  }
}

async function joinRoom() {
  const name = qs("playerName").value.trim();
  const code = qs("roomCode").value.trim().toUpperCase();
  if (!name || !code) return showError("Введите имя и код");

  try {
    const res = await fetch(`${SERVER_URL}/api/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code })
    });

    if (!res.ok) throw new Error("server");

    const data = await res.json();
    currentRoomCode = data.code;
    currentPlayerId = data.playerId;

    connectWS();
    qs("status").innerText = `Вы в комнате ${currentRoomCode}`;
  } catch {
    showError("Не удалось подключиться к комнате.");
  }
}

function connectWS() {
  socket = new WebSocket(
    `wss://bible-quartet.74x942q7fb.workers.dev/ws/${currentRoomCode}?playerId=${currentPlayerId}`
  );

  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "state") {
      renderState(msg.data);
    }
  };
}

function renderState(state) {
  const game = qs("game");
  game.innerHTML = `
    <h3>Комната ${state.code}</h3>
    <p>${state.lastAction || ""}</p>

    <h4>Игроки:</h4>
    <ul>
      ${state.players.map(p =>
        `<li>${p.name} — 🃏 ${p.handCount} | 🏆 ${p.sets}</li>`
      ).join("")}
    </ul>
  `;
}

function showError(text) {
  qs("status").innerText = text;
}
