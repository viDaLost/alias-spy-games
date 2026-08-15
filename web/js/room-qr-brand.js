(() => {
  'use strict';

  const QR_LIBRARY_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  let qrLibraryPromise = null;

  function loadQrLibrary() {
    if (window.QRCode) return Promise.resolve(window.QRCode);
    if (qrLibraryPromise) return qrLibraryPromise;
    qrLibraryPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${QR_LIBRARY_URL}"]`);
      if (existing) {
        existing.addEventListener('load', () => window.QRCode ? resolve(window.QRCode) : reject(new Error('QR library unavailable')), { once: true });
        existing.addEventListener('error', () => reject(new Error('QR library failed')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = QR_LIBRARY_URL;
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.onload = () => window.QRCode ? resolve(window.QRCode) : reject(new Error('QR library unavailable'));
      script.onerror = () => reject(new Error('QR library failed'));
      document.head.appendChild(script);
    }).catch((error) => {
      qrLibraryPromise = null;
      throw error;
    });
    return qrLibraryPromise;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function isFinderModule(row, col, count) {
    const top = row < 7;
    const left = col < 7;
    const right = col >= count - 7;
    const bottom = row >= count - 7;
    return (top && left) || (top && right) || (bottom && left);
  }

  function paintBrandedQr(host, qrInstance) {
    const model = qrInstance?._oQRCode;
    const count = Number(model?.getModuleCount?.() || 0);
    if (!count || typeof model?.isDark !== 'function') return false;

    const cssSize = 284;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const canvas = document.createElement('canvas');
    canvas.className = 'room-invite-qr-canvas';
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssSize, cssSize);

    const quiet = 4;
    const total = count + quiet * 2;
    const unit = cssSize / total;
    const gradient = ctx.createLinearGradient(0, 0, cssSize, cssSize);
    gradient.addColorStop(0, '#312e81');
    gradient.addColorStop(0.48, '#4f46e5');
    gradient.addColorStop(1, '#0284c7');
    ctx.fillStyle = gradient;

    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (!model.isDark(row, col)) continue;
        const x = (col + quiet) * unit;
        const y = (row + quiet) * unit;
        if (isFinderModule(row, col, count)) {
          ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(unit), Math.ceil(unit));
        } else {
          const inset = unit * 0.055;
          roundRect(ctx, x + inset, y + inset, unit - inset * 2, unit - inset * 2, unit * 0.2);
          ctx.fill();
        }
      }
    }

    host.innerHTML = '';
    host.appendChild(canvas);
    return true;
  }

  async function renderBrandedQr(host, payload) {
    await loadQrLibrary();
    if (!host?.isConnected) return;

    const scratch = document.createElement('div');
    scratch.className = 'room-invite-qr-scratch';
    host.innerHTML = '';
    host.appendChild(scratch);

    const instance = new window.QRCode(scratch, {
      text: payload,
      width: 284,
      height: 284,
      colorDark: '#312e81',
      colorLight: '#ffffff',
      correctLevel: window.QRCode.CorrectLevel?.H,
    });

    if (!paintBrandedQr(host, instance)) {
      const rendered = scratch.querySelector('canvas, img, table');
      if (rendered) {
        rendered.classList.add('room-invite-qr-canvas');
        rendered.style.width = '100%';
        rendered.style.height = '100%';
      }
    }
  }

  function closeQr() {
    document.getElementById('room-invite-overlay')?.remove();
    document.body.classList.remove('room-invite-open');
  }

  async function openQr(game, room, title = 'Присоединиться к игре') {
    const invite = window.RoomInvite;
    const canonical = invite?.normalizeGame?.(game);
    const normalizedRoom = invite?.normalizeRoomId?.(room);
    const qrPayload = invite?.buildQrPayload?.(canonical, normalizedRoom);
    if (!canonical || !normalizedRoom || !qrPayload) return;

    // The QR always contains the short in-app payload. This makes it denser,
    // faster to recognize and prevents a phone camera from opening a browser.
    const inviteUrl = await invite.getShareUrl?.(canonical, normalizedRoom);

    closeQr();
    const overlay = document.createElement('div');
    overlay.id = 'room-invite-overlay';
    overlay.className = 'room-invite-overlay';
    overlay.dataset.game = canonical;
    overlay.innerHTML = `
      <section class="room-invite-card" role="dialog" aria-modal="true" aria-labelledby="room-invite-title">
        <button type="button" class="room-invite-close" aria-label="Закрыть">×</button>
        <div class="room-invite-kicker">Подключение по QR</div>
        <h3 id="room-invite-title"></h3>
        <div class="room-invite-qr-shell">
          <span class="room-invite-qr-corner room-invite-qr-corner--tl" aria-hidden="true"></span>
          <span class="room-invite-qr-corner room-invite-qr-corner--tr" aria-hidden="true"></span>
          <span class="room-invite-qr-corner room-invite-qr-corner--bl" aria-hidden="true"></span>
          <span class="room-invite-qr-corner room-invite-qr-corner--br" aria-hidden="true"></span>
          <div class="room-invite-qr" id="room-invite-qr" aria-label="QR-код комнаты">
            <div class="room-invite-qr-loading">Создаём QR…</div>
          </div>
          <div class="room-invite-qr-brand"><span>✦</span> БИБЛЕЙСКИЕ ИГРЫ <span>✦</span></div>
        </div>
        <div class="room-invite-code"><small>Код комнаты</small><strong id="room-invite-code"></strong></div>
        <div class="room-invite-actions">
          <button type="button" class="room-invite-primary" data-invite-copy>Скопировать ссылку</button>
          <button type="button" class="room-invite-secondary" data-invite-share>Поделиться</button>
        </div>
        <div class="room-invite-feedback" id="room-invite-feedback" aria-live="polite"></div>
      </section>`;

    overlay.querySelector('#room-invite-title').textContent = String(title || 'Присоединиться к игре');
    overlay.querySelector('#room-invite-code').textContent = normalizedRoom;
    overlay.querySelector('.room-invite-close')?.addEventListener('click', closeQr);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeQr(); });

    overlay.querySelector('[data-invite-copy]')?.addEventListener('click', async () => {
      const feedback = overlay.querySelector('#room-invite-feedback');
      if (!inviteUrl) {
        if (feedback) feedback.textContent = 'Не удалось подготовить Telegram-ссылку. Попробуйте ещё раз.';
        return;
      }
      const ok = await copyText(inviteUrl);
      if (feedback) feedback.textContent = ok ? 'Telegram-ссылка скопирована' : inviteUrl;
    });

    overlay.querySelector('[data-invite-share]')?.addEventListener('click', async () => {
      const feedback = overlay.querySelector('#room-invite-feedback');
      if (!inviteUrl) {
        if (feedback) feedback.textContent = 'Не удалось подготовить Telegram-ссылку. Попробуйте ещё раз.';
        return;
      }
      try {
        const text = `Присоединяйтесь к комнате ${normalizedRoom} в «Библейских играх»`;
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(text)}`;
        const tg = window.Telegram?.WebApp;
        if (typeof tg?.openTelegramLink === 'function') tg.openTelegramLink(shareUrl);
        else if (navigator.share) await navigator.share({ title: String(title || 'Библейские игры'), text, url: inviteUrl });
        else {
          const ok = await copyText(inviteUrl);
          if (feedback) feedback.textContent = ok ? 'Telegram-ссылка скопирована' : inviteUrl;
        }
      } catch (error) {
        if (error?.name !== 'AbortError' && feedback) feedback.textContent = 'Не удалось открыть меню «Поделиться»';
      }
    });

    document.body.appendChild(overlay);
    document.body.classList.add('room-invite-open');

    try {
      await renderBrandedQr(overlay.querySelector('#room-invite-qr'), qrPayload);
    } catch {
      const qrNode = overlay.querySelector('#room-invite-qr');
      if (qrNode) qrNode.innerHTML = '<div class="room-invite-qr-error">QR не удалось загрузить. Используйте код комнаты.</div>';
    }
  }

  function install() {
    const original = window.RoomInvite;
    if (!original || original.__brandedQr === true) return false;
    window.RoomInvite = Object.freeze({
      ...original,
      openQr,
      __brandedQr: true,
    });
    return true;
  }

  if (!install()) {
    const timer = window.setInterval(() => {
      if (install()) window.clearInterval(timer);
    }, 50);
    window.setTimeout(() => window.clearInterval(timer), 5000);
  }
})();
