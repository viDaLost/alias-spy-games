(() => {
  const STORAGE_KEY = 'home_hidden_sections_v1';
  const SECTION_KEYS = ['continue', 'recent', 'progress'];
  let observer = null;
  let scheduled = null;
  let rendering = false;

  function syncRoot(hidden) {
    const value = [...hidden].filter((key) => SECTION_KEYS.includes(key)).join(' ');
    if (value) document.documentElement.dataset.homeHidden = value;
    else delete document.documentElement.dataset.homeHidden;
  }

  function readHidden() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const hidden = new Set(Array.isArray(raw) ? raw.filter((key) => SECTION_KEYS.includes(key)) : []);
      syncRoot(hidden);
      return hidden;
    } catch {
      const hidden = new Set();
      syncRoot(hidden);
      return hidden;
    }
  }

  function writeHidden(hidden) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
    syncRoot(hidden);
  }

  function findLabel(dashboard, text) {
    return [...dashboard.querySelectorAll('.home-dashboard__label')]
      .find((node) => (node.textContent || '').trim() === text) || null;
  }

  function controlsButton(key, hidden) {
    const row = document.createElement('div');
    row.className = 'home-section-controls';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'home-section-hide';
    button.textContent = 'Скрыть';
    button.addEventListener('click', () => {
      hidden.add(key);
      writeHidden(hidden);
      apply();
    });
    row.appendChild(button);
    return row;
  }

  function setHidden(nodes, value) {
    nodes.filter(Boolean).forEach((node) => node.classList.toggle('home-user-hidden', value));
  }

  function apply() {
    if (rendering) return;
    const dashboard = document.getElementById('home-dashboard');
    if (!dashboard) return;

    rendering = true;
    observer?.disconnect();
    try {
      dashboard.querySelectorAll('.home-section-controls, .home-hidden-restore').forEach((node) => node.remove());
      const hidden = readHidden();

      const continueCard = dashboard.querySelector('.home-continue');
      const recentLabel = findLabel(dashboard, 'Недавние игры');
      const recentRow = dashboard.querySelector('.home-recent');
      const progressLabel = findLabel(dashboard, 'Ваш прогресс');
      const progressGrid = dashboard.querySelector('.home-progress');

      setHidden([continueCard], hidden.has('continue'));
      setHidden([recentLabel, recentRow], hidden.has('recent'));
      setHidden([progressLabel, progressGrid], hidden.has('progress'));

      if (continueCard && !hidden.has('continue')) continueCard.after(controlsButton('continue', hidden));
      if (recentRow && !hidden.has('recent')) recentRow.after(controlsButton('recent', hidden));
      if (progressGrid && !hidden.has('progress')) progressGrid.after(controlsButton('progress', hidden));

      if (hidden.size) {
        const restore = document.createElement('div');
        restore.className = 'home-hidden-restore';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `Показать скрытые блоки (${hidden.size})`;
        button.addEventListener('click', () => {
          localStorage.removeItem(STORAGE_KEY);
          syncRoot(new Set());
          apply();
        });
        restore.appendChild(button);
        dashboard.appendChild(restore);
      }
    } finally {
      observer?.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-mode'] });
      rendering = false;
    }
  }

  function schedule() {
    clearTimeout(scheduled);
    scheduled = setTimeout(apply, 80);
  }

  observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-mode'] });
  window.addEventListener('pageshow', schedule);
  schedule();
})();
