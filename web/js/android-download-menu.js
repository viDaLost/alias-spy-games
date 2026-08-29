(() => {
  const APK_URL = 'https://github.com/viDaLost/alias-spy-games/releases/download/android-latest/BibleGames-Android-latest.apk';
  const APK_NAME = 'BibleGames-Android-latest.apk';
  const BUTTON_ID = 'android-download-btn';
  const ICON_VERSION = '25';

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
    return `<img class="game-card__img" src="web/assets/icons/android-download.webp?v=${ICON_VERSION}" alt="" aria-hidden="true" draggable="false" loading="eager" decoding="async">`;
  }

  function mountAndroidDownloadButton() {
    if (window.__ANDROID_APK__ === true) return true;
    if (document.getElementById(BUTTON_ID)) return true;

    const root = document.getElementById('system-actions');
    if (!root) return false;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = BUTTON_ID;
    button.className = 'game-card game-card--system game-card--title-only-v22';
    button.setAttribute('aria-label', 'Скачать приложение Библейские игры для Android');
    button.innerHTML = `
      <span class="game-card__icon">${androidIcon()}</span>
      <span class="game-card__body">
        <span class="game-card__title">Скачать для Android</span>
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
