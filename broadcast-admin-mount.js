(() => {
  "use strict";

  function mountBroadcastTarget() {
    document.querySelectorAll('.admin-v2__broadcast').forEach((panel) => {
      if (panel.classList.contains('admin-broadcast')) return;
      panel.classList.add('admin-broadcast');

      // broadcast-cloudflare.js watches child-list mutations. Trigger one after
      // normalizing the class so the rich Cloudflare form hydrates immediately.
      const marker = document.createComment('broadcast-cloudflare-mount');
      panel.appendChild(marker);
      marker.remove();
    });
  }

  const observer = new MutationObserver(mountBroadcastTarget);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountBroadcastTarget, { once: true });
  } else {
    mountBroadcastTarget();
  }
})();
