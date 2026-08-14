(() => {
  const JSQR_LIBRARY_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
  let scanner = null;
  let jsQrPromise = null;

  function closeScanner() {
    const active = scanner;
    scanner = null;
    if (active?.timer) window.clearTimeout(active.timer);
    try { active?.stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
    try { window.Telegram?.WebApp?.closeScanQrPopup?.(); } catch {}
    document.getElementById('room-scan-overlay')?.remove();
    document.body.classList.remove('room-scan-open');
  }

  function setStatus(text, kind = '') {
    const node = document.getElementById('room-scan-status');
    if (!node) return;
    node.textContent = String(text || '');
    node.dataset.kind = kind;
  }

  function loadJsQr() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    if (jsQrPromise) return jsQrPromise;
    jsQrPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${JSQR_LIBRARY_URL}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(window.jsQR), { once: true });
        existing.addEventListener('error', () => reject(new Error('jsQR failed')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = JSQR_LIBRARY_URL;
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.onload = () => window.jsQR ? resolve(window.jsQR) : reject(new Error('jsQR unavailable'));
      script.onerror = () => reject(new Error('jsQR failed'));
      document.head.appendChild(script);
    }).catch((error) => {
      jsQrPromise = null;
      throw error;
    });
    return jsQrPromise;
  }

  function acceptValue(value) {
    const invite = window.RoomInvite?.acceptScanned?.(value);
    if (!invite) {
      setStatus('Это не QR-код комнаты «Библейских игр». Наведите камеру на код из лобби.', 'error');
      return false;
    }

    setStatus(`Комната ${invite.room} найдена. Подключаемся…`, 'success');
    try { navigator.vibrate?.(45); } catch {}
    const active = scanner;
    if (active) active.accepted = true;
    window.setTimeout(closeScanner, 180);
    return true;
  }

  async function createBarcodeDetector() {
    if (!('BarcodeDetector' in window)) return null;
    try {
      if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        if (!formats.includes('qr_code')) return null;
      }
      return new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      return null;
    }
  }

  async function scanWithBarcodeDetector(active) {
    const detector = await createBarcodeDetector();
    if (!detector || scanner !== active) return false;
    active.mode = 'barcode-detector';

    const tick = async () => {
      if (scanner !== active || active.accepted) return;
      try {
        if (active.video.readyState >= 2) {
          const results = await detector.detect(active.video);
          const value = String(results?.[0]?.rawValue || '').trim();
          if (value && acceptValue(value)) return;
        }
      } catch (error) {
        console.warn('BarcodeDetector QR scan failed, switching decoder', error);
        active.mode = '';
        startJsQrLoop(active).catch(() => {});
        return;
      }
      active.timer = window.setTimeout(tick, 140);
    };

    tick();
    return true;
  }

  async function startJsQrLoop(active) {
    if (scanner !== active || active.accepted || active.mode === 'jsqr') return;
    active.mode = 'jsqr';
    try {
      await loadJsQr();
    } catch {
      if (scanner === active) setStatus('Не удалось загрузить распознавание QR. Попробуйте сканер Telegram или введите код комнаты.', 'error');
      return;
    }
    if (scanner !== active || active.accepted) return;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      setStatus('Камера доступна, но распознавание QR не поддерживается на этом устройстве.', 'error');
      return;
    }

    const tick = () => {
      if (scanner !== active || active.accepted) return;
      const video = active.video;
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        const maxSide = 640;
        const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        if (result?.data && acceptValue(result.data)) return;
      }
      active.timer = window.setTimeout(tick, 170);
    };
    tick();
  }

  async function startCamera(active) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Камера браузера недоступна');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 1280 },
      },
    });
    if (scanner !== active) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    active.stream = stream;
    active.video.srcObject = stream;
    await active.video.play();
    setStatus('Наведите камеру на QR-код комнаты.');

    const nativeStarted = await scanWithBarcodeDetector(active);
    if (!nativeStarted) await startJsQrLoop(active);
  }

  function canUseTelegramScanner() {
    return typeof window.Telegram?.WebApp?.showScanQrPopup === 'function';
  }

  function startTelegramScanner() {
    if (!canUseTelegramScanner()) {
      setStatus('Сканер Telegram недоступен в этой версии клиента.', 'error');
      return;
    }
    try {
      window.Telegram.WebApp.showScanQrPopup({ text: 'Наведите камеру на QR-код комнаты «Библейских игр»' }, (text) => {
        if (acceptValue(text)) {
          try { window.Telegram.WebApp.closeScanQrPopup(); } catch {}
        }
      });
    } catch (error) {
      setStatus(String(error?.message || 'Не удалось открыть сканер Telegram'), 'error');
    }
  }

  async function openScanner() {
    if (!window.RoomInvite?.acceptScanned) return;
    closeScanner();

    const overlay = document.createElement('div');
    overlay.id = 'room-scan-overlay';
    overlay.className = 'room-scan-overlay';
    overlay.innerHTML = `
      <section class="room-scan-card" role="dialog" aria-modal="true" aria-labelledby="room-scan-title">
        <button type="button" class="room-scan-close" aria-label="Закрыть">×</button>
        <div class="room-scan-kicker">Вход в комнату</div>
        <h3 id="room-scan-title">Сканировать QR</h3>
        <p class="room-scan-hint">Камера распознает QR внутри приложения. После сканирования нужная игра откроется и подключится к комнате автоматически.</p>
        <div class="room-scan-camera">
          <video id="room-scan-video" autoplay muted playsinline></video>
          <div class="room-scan-shade" aria-hidden="true"></div>
          <div class="room-scan-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        </div>
        <div class="room-scan-status" id="room-scan-status" aria-live="polite">Запрашиваем доступ к камере…</div>
        <div class="room-scan-actions">
          <button type="button" class="room-scan-secondary" data-scan-telegram ${canUseTelegramScanner() ? '' : 'hidden'}>Сканер Telegram</button>
          <button type="button" class="room-scan-secondary" data-scan-close>Отмена</button>
        </div>
      </section>`;

    document.body.appendChild(overlay);
    document.body.classList.add('room-scan-open');
    const active = {
      overlay,
      video: overlay.querySelector('#room-scan-video'),
      stream: null,
      timer: null,
      mode: '',
      accepted: false,
    };
    scanner = active;

    overlay.querySelector('.room-scan-close')?.addEventListener('click', closeScanner);
    overlay.querySelector('[data-scan-close]')?.addEventListener('click', closeScanner);
    overlay.querySelector('[data-scan-telegram]')?.addEventListener('click', startTelegramScanner);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeScanner(); });

    try {
      await startCamera(active);
    } catch (error) {
      if (scanner !== active) return;
      const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
      setStatus(
        denied
          ? 'Нет доступа к камере. Разрешите камеру для мини-приложения или используйте сканер Telegram.'
          : 'Не удалось открыть камеру. Используйте сканер Telegram или войдите по коду комнаты.',
        'error',
      );
      if (canUseTelegramScanner()) overlay.querySelector('[data-scan-telegram]')?.focus?.();
    }
  }

  window.addEventListener('pagehide', closeScanner, { once: true });
  window.RoomQrScanner = Object.freeze({ open: openScanner, close: closeScanner });
})();
