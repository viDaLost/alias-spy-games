(() => {
  const API_URL = 'https://script.google.com/macros/s/AKfycbx0o9HmRIF6vNuBUB2N4H3YuabJzYbRmAxvHCCwqnbMPn29Crv5W3FT1XGDF6VyFSn9/exec';
  const STYLE_ID = 'referral-survey-styles';
  const MODAL_ID = 'referral-survey-overlay';
  let started = false;
  let dismissedThisSession = false;

  function isTelegramUser() {
    return Boolean(String(window.Telegram?.WebApp?.initData || '').trim());
  }

  function isAppReady() {
    if (document.documentElement.classList.contains('app-booting')) return false;
    const banned = document.getElementById('banned-screen');
    if (banned && !banned.classList.contains('hidden')) return false;
    return true;
  }

  async function api(action, extra = {}) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...extra }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false || data?.ok === false) {
      throw new Error(String(data?.error || 'Не удалось связаться с сервером'));
    }
    return data;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .referral-survey-open{overflow:hidden!important}
      .referral-survey-overlay{position:fixed;inset:0;z-index:1300;display:grid;place-items:center;padding:18px;background:rgba(30,41,59,.5);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
      .referral-survey-card{width:min(440px,100%);box-sizing:border-box;padding:24px;border-radius:28px;background:linear-gradient(155deg,rgba(255,255,255,.98),rgba(244,247,255,.97) 58%,rgba(238,252,255,.96));border:1px solid rgba(99,102,241,.14);box-shadow:0 28px 80px rgba(30,41,59,.28);color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif}
      .referral-survey-icon{width:54px;height:54px;margin:0 auto 12px;display:grid;place-items:center;border-radius:18px;background:linear-gradient(145deg,#eef2ff,#e0f2fe);box-shadow:inset 0 0 0 1px rgba(79,70,229,.09);font-size:26px}
      .referral-survey-kicker{text-align:center;color:#4f46e5;font-size:.68rem;font-weight:950;letter-spacing:.1em;text-transform:uppercase}
      .referral-survey-title{margin:7px 0 8px;text-align:center;color:#29276f;font-size:1.35rem;line-height:1.15}
      .referral-survey-text{margin:0 auto 16px;max-width:350px;text-align:center;color:#64748b;font-size:.84rem;line-height:1.5;font-weight:650}
      .referral-survey-label{display:block;margin:0 0 7px;color:#475569;font-size:.72rem;font-weight:900}
      .referral-survey-input{display:block;width:100%;min-height:112px;resize:vertical;box-sizing:border-box;padding:13px 14px;border-radius:17px;border:1px solid rgba(99,102,241,.18);outline:0;background:#fff;color:#1e293b;font:inherit;font-size:16px;line-height:1.4;box-shadow:inset 0 1px 0 rgba(255,255,255,.8)}
      .referral-survey-input:focus{border-color:#6366f1;box-shadow:0 0 0 4px rgba(99,102,241,.1)}
      .referral-survey-meta{display:flex;justify-content:space-between;gap:10px;min-height:22px;margin-top:6px;color:#94a3b8;font-size:.66rem;font-weight:700}
      .referral-survey-error{color:#be123c}
      .referral-survey-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;margin-top:14px}
      .referral-survey-submit,.referral-survey-later{min-height:48px;border:0;border-radius:15px;padding:11px 15px;font:inherit;font-weight:900;touch-action:manipulation}
      .referral-survey-submit{background:linear-gradient(135deg,#4f46e5,#2563eb);color:#fff;box-shadow:0 10px 24px rgba(37,99,235,.2)}
      .referral-survey-submit:disabled{opacity:.55;box-shadow:none}
      .referral-survey-later{background:#eef2ff;color:#4338ca}
      @media(max-width:430px){.referral-survey-overlay{align-items:end;padding:0}.referral-survey-card{width:100%;border-radius:28px 28px 0 0;padding:22px 16px calc(18px + env(safe-area-inset-bottom))}.referral-survey-title{font-size:1.2rem}.referral-survey-actions{grid-template-columns:1fr}.referral-survey-later{order:2}}
    `;
    document.head.appendChild(style);
  }

  function closeModal() {
    document.getElementById(MODAL_ID)?.remove();
    document.body.classList.remove('referral-survey-open');
  }

  function showModal() {
    if (dismissedThisSession || document.getElementById(MODAL_ID)) return;
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'referral-survey-overlay';
    overlay.innerHTML = `
      <section class="referral-survey-card" role="dialog" aria-modal="true" aria-labelledby="referral-survey-title">
        <div class="referral-survey-icon" aria-hidden="true">💬</div>
        <div class="referral-survey-kicker">Один короткий вопрос</div>
        <h2 class="referral-survey-title" id="referral-survey-title">Откуда вы узнали о «Библейских играх»?</h2>
        <p class="referral-survey-text">Напишите своими словами. Это поможет понять, где люди находят приложение и что стоит развивать дальше.</p>
        <label class="referral-survey-label" for="referral-survey-answer">Ваш ответ</label>
        <textarea class="referral-survey-input" id="referral-survey-answer" maxlength="500" placeholder="Например: рассказал друг, увидел в Telegram-канале, нашёл через поиск…"></textarea>
        <div class="referral-survey-meta">
          <span id="referral-survey-status">Ответ придёт разработчику приложения</span>
          <span id="referral-survey-count">0/500</span>
        </div>
        <div class="referral-survey-actions">
          <button class="referral-survey-submit" type="button">Отправить</button>
          <button class="referral-survey-later" type="button">Позже</button>
        </div>
      </section>`;

    document.body.appendChild(overlay);
    document.body.classList.add('referral-survey-open');

    const input = overlay.querySelector('#referral-survey-answer');
    const submit = overlay.querySelector('.referral-survey-submit');
    const later = overlay.querySelector('.referral-survey-later');
    const status = overlay.querySelector('#referral-survey-status');
    const count = overlay.querySelector('#referral-survey-count');

    input?.addEventListener('input', () => {
      if (count) count.textContent = `${input.value.length}/500`;
      if (status) {
        status.textContent = 'Ответ придёт разработчику приложения';
        status.classList.remove('referral-survey-error');
      }
    });

    later?.addEventListener('click', () => {
      dismissedThisSession = true;
      closeModal();
    });

    submit?.addEventListener('click', async () => {
      const answer = String(input?.value || '').trim();
      if (answer.length < 2) {
        if (status) {
          status.textContent = 'Напишите хотя бы пару слов';
          status.classList.add('referral-survey-error');
        }
        input?.focus();
        return;
      }

      submit.disabled = true;
      submit.textContent = 'Отправляем…';
      try {
        await api('referralSubmit', { answer });
        try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
        closeModal();
      } catch (error) {
        submit.disabled = false;
        submit.textContent = 'Отправить';
        if (status) {
          status.textContent = String(error?.message || 'Не удалось отправить ответ');
          status.classList.add('referral-survey-error');
        }
      }
    });

    window.setTimeout(() => input?.focus?.(), 180);
  }

  async function checkAndShow(attempt = 0) {
    if (dismissedThisSession) return;
    // SDK Telegram грузится с их сервера и нередко доезжает уже после страницы.
    // Раньше проверка на первом же заходе видела пустые initData и молча
    // сдавалась навсегда — на медленной связи вопрос не показывался вообще.
    if (!isTelegramUser() || !isAppReady()) {
      if (attempt < 40) window.setTimeout(() => checkAndShow(attempt + 1), 250);
      return;
    }
    try {
      const status = await api('referralStatus');
      if (!status?.answered && !status?.skip) showModal();
    } catch {
      if (attempt < 3) window.setTimeout(() => checkAndShow(attempt + 1), 2500);
    }
  }

  function start() {
    if (started) return;
    started = true;
    window.setTimeout(() => checkAndShow(0), 350);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
