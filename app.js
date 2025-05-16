async function loadJSON(url) {
  const res = await fetch(url);
  return await res.json();
}

function showGame(gameName) {
  const container = document.getElementById("game-container");
  container.innerHTML = "<p>Загрузка игры...</p>";

  if (gameName === "alias") {
    const url = "https://raw.githubusercontent.com/viDaLost/alias-spy-games/main/data/alias_words.json";
    loadJSON(url).then(words => {
      container.innerHTML = "";
      startAliasGame(words);
    });
  } else if (gameName === "spy") {
    const url = "https://raw.githubusercontent.com/viDaLost/alias-spy-games/main/data/spy_locations.json";
    loadJSON(url).then(locations => {
      container.innerHTML = "";
      startSpyGame(locations);
    });
  } else if (gameName === "guess") {
    const url = "https://raw.githubusercontent.com/viDaLost/alias-spy-games/main/data/characters.json";
    loadJSON(url).then(chars => {
      container.innerHTML = "";
      startGuessCharacterGame(chars);
    });
  } else if (gameName === "describe") {
    const url = "https://raw.githubusercontent.com/viDaLost/alias-spy-games/main/data/characters.json";
    loadJSON(url).then(chars => {
      container.innerHTML = "";
      startDescribeCharacterGame(chars);
    });
  }
}

function goToMainMenu() {
  const container = document.getElementById("game-container");
  container.innerHTML = `
    <h2 style="text-align:center;">Добро пожаловать!</h2>
    <p style="text-align:center;">Выберите игру из меню выше.</p>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.getElementById("menu-toggle");
  const nav = document.getElementById("main-nav");

  menuToggle.addEventListener("click", () => {
    nav.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target) && !menuToggle.contains(e.target)) {
      nav.classList.remove("open");
    }
  });
});
