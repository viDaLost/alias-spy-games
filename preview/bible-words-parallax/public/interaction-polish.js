(() => {
  'use strict';

  const COACH_KEY = 'bibleWordsParallaxGestureCoachSeenV2';
  const stage = document.getElementById('gameStage');
  if (!stage) return;

  function clearWheelVisuals(wheel) {
    wheel.querySelectorAll('.letter-button.is-active').forEach((button) => {
      button.classList.remove('is-active');
    });

    const preview = document.getElementById('wordPreview');
    if (preview) preview.textContent = '';

    const canvas = document.getElementById('wheelCanvas');
    if (canvas) {
      const context = canvas.getContext('2d');
      context?.clearRect(0, 0, canvas.width, canvas.height);
    }

    wheel.closest('.control-panel')?.classList.remove('is-selecting');
  }

  function markCoachSeen(coach) {
    coach?.classList.add('is-hidden');
    try {
      localStorage.setItem(COACH_KEY, '1');
    } catch {
      // The coach is optional; storage failures must not affect gameplay.
    }
  }

  function installOnWheel(wheel) {
    if (!wheel || wheel.dataset.polishInstalled === 'true') return;
    wheel.dataset.polishInstalled = 'true';
    wheel.tabIndex = 0;

    const wordArea = wheel.closest('.word-area');
    let coach = wordArea?.querySelector('.gesture-coach');
    if (wordArea && !coach) {
      coach = document.createElement('div');
      coach.className = 'gesture-coach';
      coach.setAttribute('aria-hidden', 'true');
      coach.textContent = 'Проведите пальцем по буквам';
      wordArea.insertBefore(coach, wheel);

      try {
        if (localStorage.getItem(COACH_KEY) === '1') coach.classList.add('is-hidden');
      } catch {
        // Keep the coach visible when storage is unavailable.
      }
    }

    wheel.addEventListener('pointerdown', () => {
      wheel.closest('.control-panel')?.classList.add('is-selecting');
      markCoachSeen(coach);
    }, { capture: true, passive: true });

    wheel.addEventListener('pointerup', () => {
      wheel.closest('.control-panel')?.classList.remove('is-selecting');
    }, { capture: true, passive: true });

    /*
      V1 routes pointercancel through the same completion handler as pointerup.
      On iOS a system gesture or interrupted touch can therefore submit a partial
      word. Stop that cancellation before the V1 bubble listener sees it and
      clear only presentation state. The next pointerdown resets the internal
      selection state in the gameplay module.
    */
    wheel.addEventListener('pointercancel', (event) => {
      event.stopImmediatePropagation();
      clearWheelVisuals(wheel);
    }, { capture: true, passive: true });

    wheel.addEventListener('lostpointercapture', () => {
      wheel.closest('.control-panel')?.classList.remove('is-selecting');
    }, { passive: true });
  }

  function installCurrentShell() {
    installOnWheel(stage.querySelector('.word-wheel'));
  }

  const observer = new MutationObserver(installCurrentShell);
  observer.observe(stage, { childList: true, subtree: true });
  installCurrentShell();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    const wheel = stage.querySelector('.word-wheel');
    if (wheel) clearWheelVisuals(wheel);
  });
})();
