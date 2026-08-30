(() => {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  function motionAllowed() {
    return !reduced?.matches;
  }

  function enter(node, pop = false) {
    if (!node || node.nodeType !== 1 || !motionAllowed()) return;
    if (node.dataset.appMotionSeen === '1') return;
    node.dataset.appMotionSeen = '1';
    node.classList.add(pop ? 'app-motion-pop' : 'app-motion-enter');
    setTimeout(() => {
      node.classList.remove('app-motion-enter', 'app-motion-pop');
      delete node.dataset.appMotionSeen;
    }, 460);
  }

  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.parentElement?.id === 'game-container') enter(node);
    if (node.matches?.('.support-box,.admin-v2,.banned-card,.app-error-card,.app-toast')) enter(node, true);
    node.querySelectorAll?.('#game-container > *,.support-box,.admin-v2,.banned-card,.app-error-card,.app-toast').forEach((child) => {
      const pop = child.matches('.support-box,.admin-v2,.banned-card,.app-error-card,.app-toast');
      enter(child, pop);
    });
  }

  const SUPPORT_URL = 'https://t.me/tribute/app?startapp=dPzg';
  const POSTER_URL = 'web/assets/support-project.webp?v=3';
  const SUPPORT_TEXT = `💙 Спасибо, что пользуетесь нашим проектом!\nНам очень приятно, что вы выбираете наши игры и проводите с ними время 😊\n\nМы продолжаем развивать проект: улучшаем уже существующие игры 🎮 и создаём новые ✨\n\nЕсли вам хочется поддержать нашу работу — будем искренне благодарны за любую помощь 💙\nВсе пожертвования помогают нам уделять больше времени развитию, улучшениям и созданию новых игр.\n\nСпасибо за вашу поддержку! 🥰💙\nБлагодаря вам проект может становиться лучше! ✨`;

  function openSupportLink() {
    try {
      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(SUPPORT_URL);
        return;
      }
    } catch {}
    window.open(SUPPORT_URL, '_blank', 'noopener,noreferrer');
  }

  function ensureSupportStyles() {
    if (document.getElementById('compact-support-styles')) return;
    const style = document.createElement('style');
    style.id = 'compact-support-styles';
    style.textContent = `
      .home-support-trigger{display:block;width:100%;margin:12px 0 0;min-height:44px;border:1.5px solid #e4a42d;border-radius:14px;padding:10px 16px;background:linear-gradient(180deg,#4a86f5,#2454c9);color:#fff7df;box-shadow:0 7px 16px rgba(37,80,190,.18),inset 0 1px 0 rgba(255,255,255,.28);font:inherit;font-size:.88rem;font-weight:900;letter-spacing:.02em;cursor:pointer;touch-action:manipulation}.home-support-trigger:active{transform:scale(.985)}
      .support-poster-modal{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:18px;background:rgba(18,39,91,.42);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);opacity:0;pointer-events:none;transition:opacity .2s ease}.support-poster-modal.is-open{opacity:1;pointer-events:auto}.support-poster-modal__card{width:min(680px,100%);max-height:min(94dvh,920px);overflow:auto;border:1px solid rgba(37,99,235,.18);border-radius:24px;background:linear-gradient(145deg,#f8fbff,#e8f1ff);box-shadow:0 24px 70px rgba(15,39,100,.32);transform:translateY(10px) scale(.985);transition:transform .22s ease}.support-poster-modal.is-open .support-poster-modal__card{transform:none}.support-poster-modal__close{position:absolute;top:10px;right:10px;width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.9);color:#334155;font-size:24px;line-height:1;cursor:pointer;box-shadow:0 4px 14px rgba(15,23,42,.16)}.support-poster-modal__poster{display:block;width:100%;height:auto;max-height:46dvh;object-fit:contain;background:#dbe8ff}.support-poster-modal__body{padding:15px 17px 18px}.support-poster-modal__body h2{margin:0 0 10px;color:#173a9a;font-size:1.02rem;line-height:1.2;font-weight:900}.support-poster-modal__body p{margin:0;color:#475569;font-size:.78rem;line-height:1.5;font-weight:600}.support-poster-modal__button{display:block;width:100%;margin-top:14px;min-height:48px;border:2px solid #e7a72f;border-radius:15px;padding:10px 16px;background:linear-gradient(180deg,#3d7ff2,#214fc4);color:#fff8df;font:inherit;font-size:.92rem;font-weight:950;letter-spacing:.05em;cursor:pointer;box-shadow:0 8px 18px rgba(37,80,190,.22)}
      @media(max-width:500px){.support-poster-modal{padding:10px}.support-poster-modal__card{border-radius:20px;max-height:96dvh}.support-poster-modal__poster{max-height:43dvh}.support-poster-modal__body{padding:13px 14px 15px}.support-poster-modal__body p{font-size:.74rem;line-height:1.47}}
    `;
    document.head.appendChild(style);
  }

  function closeSupportModal() {
    document.getElementById('support-poster-modal')?.classList.remove('is-open');
  }

  function openSupportModal() {
    ensureSupportStyles();
    let modal = document.getElementById('support-poster-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'support-poster-modal';
      modal.className = 'support-poster-modal';
      modal.setAttribute('role','dialog');
      modal.setAttribute('aria-modal','true');
      modal.setAttribute('aria-label','Поддержать проект');
      modal.innerHTML = `
        <div class="support-poster-modal__card" role="document">
          <div style="position:relative">
            <button type="button" class="support-poster-modal__close" aria-label="Закрыть">×</button>
            <img class="support-poster-modal__poster" src="${POSTER_URL}" alt="Поддержи проект" decoding="async">
          </div>
          <div class="support-poster-modal__body">
            <h2>Поддержать проект 💙</h2>
            <p>${SUPPORT_TEXT.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</p>
            <button type="button" class="support-poster-modal__button">ПОДДЕРЖАТЬ</button>
          </div>
        </div>`;
      modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('.support-poster-modal__close')) closeSupportModal();
      });
      modal.querySelector('.support-poster-modal__button')?.addEventListener('click', openSupportLink);
      document.body.appendChild(modal);
    }
    requestAnimationFrame(() => modal.classList.add('is-open'));
  }

  function mountCompactSupport(root = document) {
    const cards = root.querySelectorAll?.('.home-support-card');
    if (!cards?.length) return;
    cards.forEach((card) => {
      if (card.dataset.compactSupport === '1') return;
      card.dataset.compactSupport = '1';
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'home-support-trigger';
      trigger.textContent = 'Поддержать проект 💙';
      trigger.setAttribute('aria-label','Открыть поддержку проекта');
      trigger.addEventListener('click', openSupportModal);
      card.replaceWith(trigger);
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        scan(node);
        mountCompactSupport(node.nodeType === 1 ? node : document);
      });
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });

  document.querySelectorAll('#game-container > *,.support-box,.admin-v2,.banned-card,.app-error-card,.app-toast').forEach(scan);
  ensureSupportStyles();
  mountCompactSupport(document);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSupportModal(); });
  window.__appMotionReady = true;
})();
