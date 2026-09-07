// Keep administrative interfaces out of the initial download. The role check
// stays in admin-live-modal-safety.js and all APIs still authorize on the server.
(() => {
  let pending = null;
  window.loadAdminFeatures = function loadAdminFeatures() {
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '__ADMIN_BUNDLE_URL__'; // Replaced with a content hash by build-web.
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        pending = null;
        reject(new Error('Не удалось загрузить административные модули'));
      };
      document.head.appendChild(script);
    });
    return pending;
  };
})();
