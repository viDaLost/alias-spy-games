(() => {
  'use strict';
  if (window.__QUARTET_V44_OVERLAY_FIX__) return;
  window.__QUARTET_V44_OVERLAY_FIX__ = true;

  let syncRaf = 0;
  let backdrop = null;

  injectStyles();
  ensureBackdrop();

  const observer = new MutationObserver(() => scheduleSync());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-current-game'],
  });

  document.addEventListener('click', interceptQuickActions, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('qchat-drawer')?.classList.contains('is-open')) {
      document.getElementById('qchat-close')?.click();
    }
  });
  window.addEventListener('pageshow', scheduleSync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(); });
  scheduleSync();

  function isQuartet() {
    return document.body?.dataset?.currentGame === 'quartet' && !!document.getElementById('qv2-root');
  }

  function scheduleSync() {
    if (syncRaf) return;
    syncRaf = requestAnimationFrame(() => {
      syncRaf = 0;
      syncOverlayState();
    });
  }

  function syncOverlayState() {
    const drawer = document.getElementById('qchat-drawer');
    const fab = document.getElementById('qchat-fab');

    // A fixed descendant of the transformed game root is not reliably viewport-fixed
    // in Telegram/iOS. Keep chat UI directly under body, just like the V43 action dock.
    if (drawer && drawer.parentElement !== document.body) document.body.appendChild(drawer);
    if (fab && fab.parentElement !== document.body) document.body.appendChild(fab);

    const chatOpen = Boolean(isQuartet() && drawer?.classList.contains('is-open'));
    document.body.classList.toggle('qv44-chat-open', chatOpen);
    ensureBackdrop();
    backdrop.hidden = !chatOpen;

    if (!isQuartet()) {
      document.body.classList.remove('qv44-chat-open');
      backdrop.hidden = true;
    }
  }

  function interceptQuickActions(event) {
    const qrButton = event.target.closest?.('#qv43-fixed-dock [data-qv43="qr"]');
    if (qrButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openQuartetQr();
      return;
    }

    const chatButton = event.target.closest?.('#qv43-fixed-dock [data-qv43="chat"]');
    if (chatButton) {
      // Let the canonical V43 handler click the chat FAB, then immediately move the
      // resulting drawer to the viewport layer before the next paint.
      requestAnimationFrame(scheduleSync);
    }
  }

  async function openQuartetQr() {
    const roomId = readRoomId();
    if (!roomId) {
      notify('Код комнаты пока недоступен');
      return;
    }

    if (!window.RoomInvite?.openQr) {
      notify('QR-код ещё загружается. Попробуйте снова.');
      return;
    }

    try {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
    } catch {}

    try {
      await window.RoomInvite.openQr('quartet', roomId, `Квартет · комната ${roomId}`);
    } catch (error) {
      console.error('[Quartet V44] QR open failed', error);
      notify('Не удалось открыть QR-код');
    }
  }

  function readRoomId() {
    const stored = String(localStorage.getItem('quartet_v2_room_id') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (/^[A-Z0-9]{4,10}$/.test(stored)) return stored;
    const subtitle = String(document.querySelector('.qv2-subtitle')?.textContent || '');
    return subtitle.match(/Комната\s+([A-Z0-9]{4,10})/i)?.[1]?.toUpperCase() || '';
  }

  function notify(message) {
    try {
      if (typeof window.Telegram?.WebApp?.showAlert === 'function') {
        window.Telegram.WebApp.showAlert(message);
        return;
      }
    } catch {}
    console.warn(`[Quartet V44] ${message}`);
  }

  function ensureBackdrop() {
    if (backdrop?.isConnected) return backdrop;
    backdrop = document.getElementById('qchat-backdrop-v44');
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = 'qchat-backdrop-v44';
    backdrop.className = 'qchat-backdrop-v44';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.addEventListener('click', () => document.getElementById('qchat-close')?.click());
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function injectStyles() {
    if (document.getElementById('quartet-v44-overlay-style')) return;
    const style = document.createElement('style');
    style.id = 'quartet-v44-overlay-style';
    style.textContent = `
      .qchat-backdrop-v44{
        position:fixed!important;
        inset:0!important;
        z-index:2147482400!important;
        background:rgba(25,38,67,.34)!important;
        backdrop-filter:blur(5px)!important;
        -webkit-backdrop-filter:blur(5px)!important;
        opacity:1;
        transition:opacity .2s ease;
      }
      .qchat-backdrop-v44[hidden]{display:none!important}
      body.qv44-chat-open{overflow:hidden!important}
      body.qv44-chat-open #qv43-fixed-dock{
        opacity:.28!important;
        pointer-events:none!important;
        transform:translate3d(-50%,8px,0) scale(.985)!important;
      }
      body.qv43-quartet-active #qchat-drawer{
        position:fixed!important;
        z-index:2147482500!important;
        left:50%!important;
        right:auto!important;
        top:auto!important;
        bottom:max(10px,env(safe-area-inset-bottom))!important;
        width:min(520px,calc(100vw - 18px))!important;
        max-width:none!important;
        max-height:min(78dvh,640px)!important;
        margin:0!important;
        overflow:hidden!important;
        transform:translate3d(-50%,calc(100% + 32px),0)!important;
        opacity:0!important;
        pointer-events:none!important;
        box-shadow:0 28px 90px rgba(15,23,42,.32)!important;
        border:1px solid rgba(88,104,176,.15)!important;
        border-radius:24px!important;
        background:rgba(255,255,255,.985)!important;
        contain:layout paint style!important;
        transition:transform .28s cubic-bezier(.2,.8,.2,1),opacity .2s ease!important;
      }
      body.qv43-quartet-active #qchat-drawer.is-open{
        transform:translate3d(-50%,0,0)!important;
        opacity:1!important;
        pointer-events:auto!important;
      }
      body.qv43-quartet-active #qchat-drawer .qchat-list{
        height:min(48dvh,390px)!important;
        overscroll-behavior:contain!important;
        -webkit-overflow-scrolling:touch!important;
      }
      body.qv43-quartet-active #qchat-fab{display:none!important}
      @media(max-width:430px){
        body.qv43-quartet-active #qchat-drawer{
          width:calc(100vw - 12px)!important;
          bottom:max(6px,env(safe-area-inset-bottom))!important;
          border-radius:24px!important;
        }
        body.qv43-quartet-active #qchat-drawer .qchat-list{height:min(52dvh,410px)!important}
      }
      @media(prefers-reduced-motion:reduce){
        .qchat-backdrop-v44,body.qv43-quartet-active #qchat-drawer,body.qv44-chat-open #qv43-fixed-dock{transition:none!important}
      }
    `;
    document.head.appendChild(style);
  }
})();
