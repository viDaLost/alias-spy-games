(() => {
  let scannerOpen = false;

  function telegramWebApp() {
    return window.Telegram?.WebApp || null;
  }

  function canScan() {
    return typeof telegramWebApp()?.showScanQrPopup === 'function';
  }

  function closeScanner() {
    if (!scannerOpen) return;
    scannerOpen = false;
    try { telegramWebApp()?.closeScanQrPopup?.(); } catch {}
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
    const invite = window.RoomInvite?.acceptScanned?.(value);
    if (!invite) {
      try { telegramWebApp()?.HapticFeedback?.notificationOccurred?.('error'); } catch {}
      return false;
    }

    try { telegramWebApp()?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
    try { navigator.vibrate?.(45); } catch {}
    scannerOpen = false;
    return true;
  }

  function openScanner() {
    if (!window.RoomInvite?.acceptScanned) return;
    if (!canScan()) {
      showUnavailable();
      return;
    }

    closeScanner();
    scannerOpen = true;

    try {
      telegramWebApp().showScanQrPopup(
        { text: 'Наведите камеру на QR-код комнаты «Библейских игр»' },
        (text) => {
          const accepted = acceptValue(text);
          if (accepted) return true;
          return false;
        },
      );
    } catch (error) {
      scannerOpen = false;
      const message = String(error?.message || 'Не удалось открыть сканер Telegram');
      const tg = telegramWebApp();
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
