(() => {
  const holder = document.getElementById('three-js');
  const threeSrc = String(holder?.dataset.src || 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
  let loadPromise = null;
  let sacredLoadPromise = null;

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

  function loadSacredWordReview() {
    if (window.__sacredWordReviewFallbackV1 && typeof window.startSacredWordGame === 'function') return Promise.resolve(true);
    if (sacredLoadPromise) return sacredLoadPromise;
    sacredLoadPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'web/games/sacred-word.js?v=22';
      script.dataset.gameScript = 'web/games/sacred-word.js';
      script.addEventListener('load', () => resolve(Boolean(window.__sacredWordReviewFallbackV1 && window.startSacredWordGame)), { once: true });
      script.addEventListener('error', () => resolve(false), { once: true });
      document.body.appendChild(script);
    });
    return sacredLoadPromise;
  }

  async function waitWithTimeout(ms) {
    return Promise.race([
      loadThree(),
      new Promise((resolve) => setTimeout(() => resolve(Boolean(window.THREE)), ms)),
    ]);
  }

  window.showGame = async function gatedShowGame(gameName) {
    if (gameName !== 'sacred-word') return originalShowGame(gameName);

    window.rememberGameOpen?.(gameName);

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
    const gameReady = ok && window.THREE ? await loadSacredWordReview() : false;
    if (!gameReady) {
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

    document.body.dataset.currentGame = 'sacred-word';
    if (container) container.innerHTML = '';
    try {
      window.startSacredWordGame('web/data/sacred_words.json');
    } catch (error) {
      console.error('Ошибка запуска «Священного слова»:', error);
      if (container) {
        container.innerHTML = `
          <section class="app-error-card app-motion-enter">
            <h2>Не удалось запустить игру</h2>
            <p>Вернитесь в меню и попробуйте открыть «Священное слово» ещё раз.</p>
            <button class="back-button" type="button" onclick="goToMainMenu()">В главное меню</button>
          </section>`;
      }
    }
  };
})();
