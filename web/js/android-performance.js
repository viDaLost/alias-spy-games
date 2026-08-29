(() => {
  if (window.__ANDROID_APK__ !== true) return;
  document.documentElement.classList.add('android-apk');

  // app.js exposes svgIcon before DOMContentLoaded. Replacing the global
  // renderer here means the standalone APK never starts ten large PNG
  // downloads just to reveal the main menu.
  if (typeof window.svgIcon === 'function') {
    window.menuIconHTML = (type) => window.svgIcon(type);
  }

  window.__ANDROID_FAST_UI__ = true;

  // Android WebView has slightly different dynamic-viewport/compositor
  // behaviour than Telegram's in-app browser. Keep sheets inside the visible
  // viewport and make Bible Sketch its own foreground compositor surface.
  const style = document.createElement('style');
  style.id = 'android-standalone-ui-fixes';
  style.textContent = `
    html.android-apk-runtime .social-sheet-overlay {
      place-items: center;
      padding: max(66px, env(safe-area-inset-top)) 12px max(18px, env(safe-area-inset-bottom));
    }
    html.android-apk-runtime .social-sheet {
      width: min(720px, 100%);
      min-height: 280px;
      max-height: calc(100vh - 92px);
      border-bottom: 1px solid rgba(255,255,255,.76);
      border-radius: 28px;
    }
    @supports (height: 100dvh) {
      html.android-apk-runtime .social-sheet { max-height: calc(100dvh - 92px); }
    }
    html.android-apk-runtime .social-sheet-content { min-height: 190px; }

    /* A transformed parallax PNG can become a separate hardware layer in some
       Android System WebView builds. The sticky Bible Sketch topbar was also a
       composited layer, so it stayed visible while ordinary game content could
       be painted underneath the old menu background. Once this game is active,
       remove that background from composition and promote the whole game. */
    html.android-apk-runtime body[data-current-game="bible-sketch"] .home-gamehub-parallax__scene {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
    }
    html.android-apk-runtime body[data-current-game="bible-sketch"] #gamehub-boot-scene,
    html.android-apk-runtime body[data-current-game="bible-sketch"] #main-loader {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    html.android-apk-runtime body[data-current-game="bible-sketch"] #game-container {
      position: relative !important;
      z-index: 100 !important;
      isolation: isolate;
      overflow: visible !important;
      visibility: visible !important;
      opacity: 1 !important;
      transform: translateZ(0);
      -webkit-transform: translateZ(0);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }
    html.android-apk-runtime body[data-current-game="bible-sketch"] .bsk-root {
      position: relative !important;
      z-index: 2 !important;
      isolation: isolate;
      visibility: visible !important;
      opacity: 1 !important;
      transform: translateZ(0);
      -webkit-transform: translateZ(0);
    }
    html.android-apk-runtime body[data-current-game="bible-sketch"] .bsk-content {
      position: relative !important;
      z-index: 2 !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      transform: translateZ(0);
      -webkit-transform: translateZ(0);
    }
    html.android-apk-runtime body[data-current-game="bible-sketch"] .bsk-topbar {
      z-index: 4 !important;
    }
  `;
  document.head.appendChild(style);

  let recoveryTimer = 0;
  let recoveryAttempted = false;

  function forceBibleSketchSurface() {
    if (document.body?.dataset?.currentGame !== 'bible-sketch') return;

    const scene = document.querySelector('.home-gamehub-parallax__scene');
    if (scene) {
      scene.hidden = true;
      scene.setAttribute('aria-hidden', 'true');
      scene.classList.remove('is-ready');
      scene.style.display = 'none';
    }
    document.documentElement.classList.remove('home-gamehub-parallax-active');

    const container = document.getElementById('game-container');
    if (container) {
      container.style.visibility = 'visible';
      container.style.opacity = '1';
    }
  }

  function contentLooksPainted(content) {
    if (!content) return false;
    const hasContent = Boolean(content.childElementCount) || Boolean(String(content.textContent || '').trim());
    if (!hasContent) return false;
    const computed = getComputedStyle(content);
    const rect = content.getBoundingClientRect();
    return computed.display !== 'none'
      && computed.visibility !== 'hidden'
      && Number.parseFloat(computed.opacity || '1') > 0.01
      && rect.width > 1
      && rect.height > 1;
  }

  // Bible Sketch is bundled in the APK. If a WebView lifecycle/compositor race
  // leaves only its sticky header visible, retry the local bootstrap once. The
  // check now validates painted geometry as well as mere DOM child presence.
  function scheduleBibleSketchRecovery() {
    if (recoveryTimer) window.clearTimeout(recoveryTimer);
    recoveryTimer = 0;

    if (document.body?.dataset?.currentGame !== 'bible-sketch') {
      recoveryAttempted = false;
      return;
    }

    forceBibleSketchSurface();

    recoveryTimer = window.setTimeout(() => {
      recoveryTimer = 0;
      if (document.body?.dataset?.currentGame !== 'bible-sketch') return;
      forceBibleSketchSurface();

      const content = document.getElementById('bsk-content');
      if (contentLooksPainted(content) || recoveryAttempted) return;
      recoveryAttempted = true;

      console.warn('[Android] Recovering unpainted Bible Sketch view from bundled assets.');
      try { localStorage.removeItem('bible_sketch_room_id_v1'); } catch {}
      try { window.__bibleSketchCleanup?.(); } catch {}

      if (typeof window.startBibleSketchGame === 'function') {
        try {
          window.startBibleSketchGame();
          forceBibleSketchSurface();
        } catch (error) {
          console.error('[Android] Bible Sketch recovery failed', error);
        }
      }

      window.setTimeout(() => {
        if (document.body?.dataset?.currentGame !== 'bible-sketch') return;
        forceBibleSketchSurface();
        const retryContent = document.getElementById('bsk-content');
        if (contentLooksPainted(retryContent) || !retryContent) return;
        retryContent.innerHTML = `
          <section class="bsk-result">
            <div class="bsk-result-icon">↻</div>
            <h2>Перезапускаем игру</h2>
            <p>Интерфейс игры находится внутри APK. Нажмите кнопку, чтобы повторно открыть локальную копию.</p>
            <div class="bsk-actions"><button class="bsk-primary" type="button" data-android-bsk-retry>Повторить</button></div>
          </section>`;
        retryContent.querySelector('[data-android-bsk-retry]')?.addEventListener('click', () => {
          recoveryAttempted = false;
          try { window.__bibleSketchCleanup?.(); } catch {}
          try { window.startBibleSketchGame?.(); } catch (error) { console.error(error); }
          forceBibleSketchSurface();
          scheduleBibleSketchRecovery();
        });
      }, 800);
    }, 650);
  }

  const gameObserver = new MutationObserver(scheduleBibleSketchRecovery);
  gameObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-current-game', 'data-mode'],
  });
  scheduleBibleSketchRecovery();

  window.addEventListener('beforeunload', () => {
    gameObserver.disconnect();
    if (recoveryTimer) window.clearTimeout(recoveryTimer);
  }, { once: true });
})();
