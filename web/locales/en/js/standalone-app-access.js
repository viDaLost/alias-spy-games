// Embedded pages obtain proof only from the application window, then verify it with Core.
(async () => {
  'use strict';
  const app = 'https://alias-spy-games-app.vitaledanilov.workers.dev/';
  const core = 'https://alias-spy-games-core.vitaledanilov.workers.dev';
  const style = document.createElement('style');
  style.textContent = 'html:not(.standalone-access-allowed) body{visibility:hidden!important}';
  document.head.append(style);
  if (window.parent === window) { location.replace(app); return; }
  const allowedParents = new Set(['https://vidalost.github.io', 'https://appassets.androidplatform.net', new URL(app).origin, location.origin]);
  const nonce = crypto.randomUUID();
  let proof = null;
  const receive = (event) => {
    if (event.source !== window.parent || !allowedParents.has(event.origin) || event.data?.nonce !== nonce || event.data?.type !== 'app-access:proof') return;
    proof = event.data.proof;
  };
  window.addEventListener('message', receive);
  // Parent may still be attaching the iframe. Retry without including credentials in the URL.
  for (let attempt = 0; attempt < 40 && !proof; attempt += 1) {
    for (const origin of allowedParents) window.parent.postMessage({ type: 'app-access:proof-request', nonce }, origin);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  window.removeEventListener('message', receive);
  if (!proof) return;
  try {
    const response = await fetch(`${core}/app/access`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(proof.token ? { Authorization: `Bearer ${proof.token}` } : {}) },
      body: JSON.stringify({ telegramInitData: proof.telegramInitData || '' }), cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    const access = await response.json();
    if (!response.ok || access.allowed !== true) return;
    window.StandaloneAppProof = proof;
    // Only the game bootstrap is deferred; library files can still use their normal order.
    for (const placeholder of document.querySelectorAll('script[data-app-access-src]')) {
      const script = document.createElement('script');
      script.src = placeholder.dataset.appAccessSrc;
      await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; placeholder.after(script); });
    }
    document.documentElement.classList.add('standalone-access-allowed');
  } catch { /* fail closed; the parent offers retry without clearing progress */ }
})();
