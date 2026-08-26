(() => {
  'use strict';

  const scene = document.getElementById('scene');
  const stage = document.getElementById('gameStage');
  const toast = document.getElementById('toast');
  const completeDialog = document.getElementById('completeDialog');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!scene || !stage) return;

  const timers = new Map();
  const durations = {
    'is-word-awake': 920,
    'is-word-error': 520,
    'is-level-awake': 1420,
  };

  function replayScene(className) {
    if (reducedMotion) return;
    const oldTimer = timers.get(className);
    if (oldTimer) clearTimeout(oldTimer);

    scene.classList.remove(className);
    void scene.offsetWidth;
    scene.classList.add(className);

    const timer = setTimeout(() => {
      scene.classList.remove(className);
      timers.delete(className);
    }, durations[className] || 900);
    timers.set(className, timer);
  }

  function markNewCells() {
    const freshCells = [...stage.querySelectorAll('.crossword-cell.is-new:not([data-v3-seen])')];
    if (!freshCells.length) return;
    freshCells.forEach((cell) => {
      cell.dataset.v3Seen = 'true';
    });
    replayScene('is-word-awake');
  }

  let lastToast = '';
  function inspectToast() {
    if (!toast) return;
    const message = toast.textContent.trim();
    if (!message || message === lastToast) return;
    lastToast = message;

    if (/нет на свитке|уже найдено|уже есть в бонусах/i.test(message)) {
      replayScene('is-word-error');
    }
  }

  function inspectCompletion() {
    if (!completeDialog?.open) return;
    if (completeDialog.dataset.v3Open === 'true') return;
    completeDialog.dataset.v3Open = 'true';
    replayScene('is-level-awake');
  }

  const stageObserver = new MutationObserver(markNewCells);
  stageObserver.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  if (toast) {
    const toastObserver = new MutationObserver(inspectToast);
    toastObserver.observe(toast, { childList: true, characterData: true, subtree: true });
  }

  if (completeDialog) {
    const completionObserver = new MutationObserver(() => {
      if (completeDialog.open) {
        inspectCompletion();
      } else {
        delete completeDialog.dataset.v3Open;
      }
    });
    completionObserver.observe(completeDialog, { attributes: true, attributeFilter: ['open'] });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    scene.classList.remove('is-word-awake', 'is-word-error', 'is-level-awake');
  });

  markNewCells();
  inspectToast();
  inspectCompletion();
})();
