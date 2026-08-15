(() => {
  const holder = document.getElementById('three-js');
  const threeSrc = String(holder?.dataset.src || 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
  let loadPromise = null;

  function loadThree() {
    if (window.THREE) return Promise.resolve(true);
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = threeSrc;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.addEventListener('load', () => resolve(Boolean(window.THREE)), { once: true });
      script.addEventListener('error', () => resolve(false), { once: true });
      document.head.appendChild(script);
    });
    return loadPromise;
  }

  window.__loadThree = loadThree;
  const originalShowGame = window.showGame;
  if (typeof originalShowGame !== 'function') return;

  async function waitWithTimeout(ms) {
    return Promise.race([
      loadThree(),
      new Promise((resolve) => setTimeout(() => resolve(Boolean(window.THREE)), ms)),
    ]);
  }

  window.showGame = async function gatedShowGame(gameName) {
    if (gameName !== 'sacred-word' || window.THREE) return originalShowGame(gameName);

    const menu = document.getElementById('menu-container');
    const container = document.getElementById('game-container');
    if (menu) menu.classList.add('hidden');
    document.body.dataset.mode = 'game';
    document.body.dataset.currentGame = 'sacred-word-loading';
    if (container) {
      container.innerHTML = `
        <div class="app-game-loading app-motion-enter">
          <div class="app-loader__ring"></div>
          <p>Подготовка «Священного слова»...</p>
          <button type="button" class="back-button" onclick="goToMainMenu()">В меню</button>
        </div>`;
    }

    const ok = await waitWithTimeout(8000);
    if (!ok || !window.THREE) {
      if (container) {
        container.innerHTML = `
          <section class="app-error-card app-motion-enter">
            <h2>Не удалось подготовить игру</h2>
            <p>Проверьте соединение и попробуйте открыть «Священное слово» ещё раз.</p>
            <button class="back-button" type="button" onclick="goToMainMenu()">В главное меню</button>
          </section>`;
      }
      document.body.dataset.currentGame = 'sacred-word';
      return;
    }

    return originalShowGame(gameName);
  };
})();
