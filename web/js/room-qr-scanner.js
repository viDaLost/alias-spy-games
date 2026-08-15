(() => {
  let scannerOpen = false;
  let qrEventHandler = null;
  let closeEventHandler = null;
  let lastValue = '';
  let lastValueAt = 0;

  function telegramWebApp() {
    return window.Telegram?.WebApp || null;
  }

  function canScan() {
    const tg = telegramWebApp();
    return typeof tg?.showScanQrPopup === 'function';
  }

  function extractQrText(value) {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') {
      if (typeof value.data === 'string') return value.data.trim();
      if (typeof value.text === 'string') return value.text.trim();
    }
    return '';
  }

  function detachEvents() {
    const tg = telegramWebApp();
    if (typeof tg?.offEvent === 'function') {
      if (qrEventHandler) {
        try { tg.offEvent('qrTextReceived', qrEventHandler); } catch {}
      }
      if (closeEventHandler) {
        try { tg.offEvent('scanQrPopupClosed', closeEventHandler); } catch {}
      }
    }
    qrEventHandler = null;
    closeEventHandler = null;
  }

  function markClosed() {
    scannerOpen = false;
    detachEvents();
  }

  function closeScanner() {
    const tg = telegramWebApp();
    const wasOpen = scannerOpen;
    markClosed();
    if (!wasOpen) return;
    try { tg?.closeScanQrPopup?.(); } catch {}
  }

  function showUnavailable() {
    const message = 'Сканирование QR доступно во встроенном приложении Telegram.';
    const tg = telegramWebApp();
    try {
      if (typeof tg?.showAlert === 'function') {
        tg.showAlert(message);
        return;
      }
    } catch {}
    try { window.alert(message); } catch {}
  }

  function showInvalidCode() {
    const tg = telegramWebApp();
    try { tg?.HapticFeedback?.notificationOccurred?.('error'); } catch {}
    try { navigator.vibrate?.([30, 40, 30]); } catch {}
  }

  function acceptValue(value) {
    const text = extractQrText(value);
    if (!text) return false;

    const now = Date.now();
    if (text === lastValue && now - lastValueAt < 1200) return true;

    const invite = window.RoomInvite?.acceptScanned?.(text);
    if (!invite) {
      showInvalidCode();
      return false;
    }

    lastValue = text;
    lastValueAt = now;
    try { telegramWebApp()?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
    try { navigator.vibrate?.(45); } catch {}
    closeScanner();
    return true;
  }

  function openScanner() {
    if (!window.RoomInvite?.acceptScanned) return;
    const tg = telegramWebApp();
    if (!canScan()) {
      showUnavailable();
      return;
    }

    closeScanner();
    scannerOpen = true;

    // Telegram's qrTextReceived event passes { data: "..." }, while the
    // showScanQrPopup callback passes the text string directly. Normalize both.
    qrEventHandler = (event) => acceptValue(event);
    closeEventHandler = () => markClosed();

    if (typeof tg?.onEvent === 'function') {
      try { tg.onEvent('qrTextReceived', qrEventHandler); } catch {}
      try { tg.onEvent('scanQrPopupClosed', closeEventHandler); } catch {}
    }

    try {
      tg.showScanQrPopup(
        { text: 'Наведите камеру на QR-код комнаты' },
        (text) => acceptValue(text),
      );
    } catch (error) {
      markClosed();
      const message = String(error?.message || 'Не удалось открыть сканер Telegram');
      try {
        if (typeof tg?.showAlert === 'function') tg.showAlert(message);
        else window.alert(message);
      } catch {}
    }
  }

  window.addEventListener('pagehide', closeScanner, { once: true });
  window.RoomQrScanner = Object.freeze({
    open: openScanner,
    close: closeScanner,
    isAvailable: canScan,
    extractQrText,
  });
})();
