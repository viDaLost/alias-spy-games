(() => {
  if (window.__ANDROID_APK__ !== true) return;

  let started = false;
  function warm() {
    if (started) return;
    started = true;

    const endpoints = [
      document.querySelector('meta[name="app-core-backend"]')?.content,
      document.querySelector('meta[name="quartet-backend"]')?.content,
      document.querySelector('meta[name="bible-sketch-backend"]')?.content,
      document.querySelector('meta[name="app-observability"]')?.content,
    ].map((value) => String(value || '').replace(/\/+$/, '')).filter(Boolean);

    for (const base of endpoints) {
      fetch(`${base}/health`, { method: 'GET', cache: 'no-store', mode: 'cors' }).catch(() => {});
    }

    const assets = [
      ['script', 'web/games/quartet.js?v=4'],
      ['style', 'web/games/quartet-v2.css?v=3'],
      ['script', 'web/games/bible-sketch.js?v=1'],
      ['style', 'web/games/bible-sketch.css?v=1'],
      ['fetch', 'web/data/quartet_bible.json'],
    ];
    for (const [as, href] of assets) {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      if (as !== 'fetch') link.as = as;
      document.head.appendChild(link);
    }
  }

  function schedule() {
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 1200 });
    else setTimeout(warm, 250);
  }

  window.addEventListener('app:menu-ready', schedule, { once: true });
  if (document.documentElement.classList.contains('app-ui-ready')) schedule();
})();
