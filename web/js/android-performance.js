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

  // Android WebView has slightly different dynamic-viewport behaviour than
  // Telegram's in-app browser. Keep the social sheet fully inside the visible
  // application viewport instead of allowing a backdrop-only state.
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
  `;
  document.head.appendChild(style);

  // Bible Sketch is bundled in the APK. If a WebView lifecycle race leaves the
  // root mounted but its content empty, retry the local game bootstrap once.
  // This specifically prevents the header-only blank screen without adding any
  // network or GitHub fallback.
  let recoveryTimer = 0;
  let recoveryAttempted = false;

  function scheduleBibleSketchRecovery() {
    if (recoveryTimer) window.clearTimeout(recoveryTimer);
    recoveryTimer = 0;

    if (document.body?.dataset?.currentGame !== 'bible-sketch') {
      recoveryAttempted = false;
      return;
    }

    recoveryTimer = window.setTimeout(() => {
      recoveryTimer = 0;
      if (document.body?.dataset?.currentGame !== 'bible-sketch') return;

      const content = document.getElementById('bsk-content');
      const hasContent = Boolean(content?.childElementCount) || Boolean(String(content?.textContent || '').trim());
      if (!content || hasContent || recoveryAttempted) return;
      recoveryAttempted = true;

      console.warn('[Android] Recovering empty Bible Sketch view from bundled assets.');
      try { localStorage.removeItem('bible_sketch_room_id_v1'); } catch {}
      try { window.__bibleSketchCleanup?.(); } catch {}

      if (typeof window.startBibleSketchGame === 'function') {
        try {
          window.startBibleSketchGame();
        } catch (error) {
          console.error('[Android] Bible Sketch recovery failed', error);
        }
      }

      window.setTimeout(() => {
        if (document.body?.dataset?.currentGame !== 'bible-sketch') return;
        const retryContent = document.getElementById('bsk-content');
        const recovered = Boolean(retryContent?.childElementCount) || Boolean(String(retryContent?.textContent || '').trim());
        if (recovered || !retryContent) return;
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
