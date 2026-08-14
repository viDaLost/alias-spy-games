(() => {
  let scannerOpen = false;
  let eventHandler = null;
  let lastValue = '';
  let lastValueAt = 0;

  function telegramWebApp() {
    return window.Telegram?.WebApp || null;
  }

  function canScan() {
    const tg = telegramWebApp();
    return typeof tg?.showScanQrPopup === 'function';
  }

  function detachQrEvent() {
    const tg = telegramWebApp();
    if (!eventHandler || typeof tg?.offEvent !== 'function') {
      eventHandler = null;
      return;
    }
    try { tg.offEvent('qrTextReceived', eventHandler); } catch {}
    eventHandler = null;
  }

  function closeScanner() {
    const tg = telegramWebApp();
    detachQrEvent();
    if (!scannerOpen) return;
    scannerOpen = false;
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

  function acceptValue(value) {
    const text = String(value || '').trim();
    if (!text) return false;

    const now = Date.now();
    if (text === lastValue && now - lastValueAt < 1200) return true;

    const invite = window.RoomInvite?.acceptScanned?.(text);
    if (!invite) {
      try { telegramWebApp()?.HapticFeedback?.notificationOccurred?.('error'); } catch {}
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

    const onQrText = (text) => {
      const accepted = acceptValue(text);
      return accepted === true;
    };

    eventHandler = onQrText;
    if (typeof tg?.onEvent === 'function') {
      try { tg.onEvent('qrTextReceived', eventHandler); } catch {}
    }

    try {
      tg.showScanQrPopup(
        { text: 'Наведите камеру на QR-код комнаты' },
        (text) => onQrText(text),
      );
    } catch (error) {
      scannerOpen = false;
      detachQrEvent();
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
  });
})();
