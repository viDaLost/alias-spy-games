(() => {
  const APK_URL = 'https://github.com/viDaLost/alias-spy-games/releases/download/android-latest/BibleGames-Android-2.7.3-native.apk';
  const APK_NAME = 'BibleGames-Android-2.7.3-native.apk';
  const BUTTON_ID = 'android-download-btn';

  function downloadAndroidApp() {
    if (window.__ANDROID_APK__ === true) {
      window.showToast?.('Android-приложение уже установлено');
      return;
    }

    const tg = window.Telegram?.WebApp;
    if (typeof tg?.openLink === 'function') {
      try {
        tg.openLink(APK_URL, { try_instant_view: false });
        return;
      } catch {}
    }

    const link = document.createElement('a');
    link.href = APK_URL;
    link.download = APK_NAME;
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function androidIcon() {
    return `
      <svg class="game-card__svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="androidDownloadBg" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop stop-color="#2563EB"/>
            <stop offset="1" stop-color="#4F46E5"/>
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#androidDownloadBg)"/>
        <path d="M21 27h22v15a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4V27Z" fill="white" fill-opacity=".96"/>
        <path d="M24 27c.8-5.1 3.7-8 8-8s7.2 2.9 8 8H24Z" fill="white" fill-opacity=".96"/>
        <path d="m27 20-3-4m13 4 3-4" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="28.5" cy="24" r="1.4" fill="#4F46E5"/>
        <circle cx="35.5" cy="24" r="1.4" fill="#4F46E5"/>
        <path d="M32 31v10m0 0-4-4m4 4 4-4" stroke="#4F46E5" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  function mountAndroidDownloadButton() {
    if (window.__ANDROID_APK__ === true) return true;
    if (document.getElementById(BUTTON_ID)) return true;

    const root = document.getElementById('system-actions');
    if (!root) return false;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = BUTTON_ID;
    button.className = 'game-card game-card--system';
    button.setAttribute('aria-label', 'Скачать приложение Библейские игры для Android');
    button.innerHTML = `
      <span class="game-card__icon">${androidIcon()}</span>
      <span class="game-card__body">
        <span class="game-card__title">Скачать для Android</span>
        <span class="game-card__desc">APK приложения · версия 2.7.3</span>
      </span>
    `;
    button.addEventListener('click', downloadAndroidApp);

    const adminButton = root.querySelector('#admin-btn');
    if (adminButton) root.insertBefore(button, adminButton);
    else root.appendChild(button);
    return true;
  }

  function startMounting() {
    if (mountAndroidDownloadButton()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (mountAndroidDownloadButton() || attempts >= 30) clearInterval(timer);
    }, 100);
  }

  window.downloadAndroidApp = downloadAndroidApp;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startMounting, { once: true });
  } else {
    startMounting();
  }
})();
