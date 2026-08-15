(() => {
  if (window.__ANDROID_APK__ !== true) return;
  document.documentElement.classList.add('android-apk');

  // app.js exposes svgIcon before DOMContentLoaded. Replacing the global
  // renderer here means the standalone APK never starts ten large PNG
  // downloads just to reveal the main menu.
  if (typeof window.svgIcon === 'function') {
    window.menuIconHTML = (type) => window.svgIcon(type);
  }

  // The Bible Sketch launcher uses its own lightweight WebP and is already
  // cheap enough to keep as an image.
  window.__ANDROID_FAST_UI__ = true;
})();
