(() => {
  // Один вопрос о приложении — и больше никогда.
  //
  // Логика та же, что у вопроса «откуда узнали»: показывается один раз, ответ
  // уходит администратору в бот, отметку об ответе хранит сервер, а не браузер, —
  // иначе переустановка приложения спросила бы человека второй раз.
  //
  // Два отличия. Опрос ждёт три дня с первого запуска: у того, кто только что
  // открыл приложение, мнения ещё нет, а спросить можно единожды. И он не
  // выходит поверх вопроса «откуда узнали» — два окна подряд на старте человек
  // закрывает не читая.

  const API_URL = 'https://script.google.com/macros/s/AKfycbx0o9HmRIF6vNuBUB2N4H3YuabJzYbRmAxvHCCwqnbMPn29Crv5W3FT1XGDF6VyFSn9/exec';
  const STYLE_ID = 'feedback-survey-styles';
  const MODAL_ID = 'feedback-survey-overlay';
  const REFERRAL_MODAL_ID = 'referral-survey-overlay';
  const LIMIT = 1000;
  let started = false;
  let dismissedThisSession = false;

  /** Сервер узнаёт человека либо по подписи Telegram, либо по токену сессии. */
  function hasIdentity() {
    if (String(window.Telegram?.WebApp?.initData || '').trim()) return true;
    return window.__ANDROID_APK__ === true || window.__WEB_SESSION__ === true;
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
      .feedback-survey-open{overflow:hidden!important}
      .feedback-survey-overlay{position:fixed;inset:0;z-index:1300;display:grid;place-items:center;padding:18px;background:rgba(30,41,59,.5);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
      .feedback-survey-card{width:min(440px,100%);max-height:calc(100vh - 36px);overflow:auto;box-sizing:border-box;padding:24px;border-radius:28px;background:linear-gradient(155deg,rgba(255,255,255,.98),rgba(244,247,255,.97) 58%,rgba(238,252,255,.96));border:1px solid rgba(99,102,241,.14);box-shadow:0 28px 80px rgba(30,41,59,.28);color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif}
      .feedback-survey-icon{width:54px;height:54px;margin:0 auto 12px;display:grid;place-items:center;border-radius:18px;background:linear-gradient(145deg,#eef2ff,#e0f2fe);box-shadow:inset 0 0 0 1px rgba(79,70,229,.09);font-size:26px}
      .feedback-survey-kicker{text-align:center;color:#4f46e5;font-size:.68rem;font-weight:950;letter-spacing:.1em;text-transform:uppercase}
      .feedback-survey-title{margin:7px 0 8px;text-align:center;color:#29276f;font-size:1.35rem;line-height:1.15}
      .feedback-survey-text{margin:0 auto 16px;max-width:350px;text-align:center;color:#64748b;font-size:.84rem;line-height:1.5;font-weight:650}
      .feedback-survey-label{display:block;margin:0 0 7px;color:#475569;font-size:.72rem;font-weight:900}
      .feedback-survey-field + .feedback-survey-field{margin-top:14px}
      .feedback-survey-input{display:block;width:100%;min-height:92px;resize:vertical;box-sizing:border-box;padding:13px 14px;border-radius:17px;border:1px solid rgba(99,102,241,.18);outline:0;background:#fff;color:#1e293b;font:inherit;font-size:16px;line-height:1.4;box-shadow:inset 0 1px 0 rgba(255,255,255,.8)}
      .feedback-survey-input:focus{border-color:#6366f1;box-shadow:0 0 0 4px rgba(99,102,241,.1)}
      .feedback-survey-meta{display:flex;justify-content:space-between;gap:10px;min-height:22px;margin-top:8px;color:#94a3b8;font-size:.66rem;font-weight:700}
      .feedback-survey-error{color:#be123c}
      .feedback-survey-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;margin-top:14px}
      .feedback-survey-submit,.feedback-survey-later{min-height:48px;border:0;border-radius:15px;padding:11px 15px;font:inherit;font-weight:900;touch-action:manipulation}
      .feedback-survey-submit{background:linear-gradient(135deg,#4f46e5,#2563eb);color:#fff;box-shadow:0 10px 24px rgba(37,99,235,.2)}
      .feedback-survey-submit:disabled{opacity:.55;box-shadow:none}
      .feedback-survey-later{background:#eef2ff;color:#4338ca}
      /* Эти стили вставляет скрипт, поэтому генератор тёмной темы их не видит:
         он читает только файлы стилей. Без своего блока окно оставалось белым
         листом посреди тёмного приложения. */
      @media (prefers-color-scheme: dark) {
        .feedback-survey-card{background:linear-gradient(155deg,#17181c,#131519 58%,#101519);border-color:rgba(99,102,241,.22);box-shadow:0 28px 80px rgba(0,0,0,.55);color:#c2cde4}
        .feedback-survey-icon{background:linear-gradient(145deg,#161a2e,#0d1f2c);box-shadow:inset 0 0 0 1px rgba(99,102,241,.22)}
        .feedback-survey-kicker{color:#8f96ff}
        .feedback-survey-title{color:#ccd5ee}
        .feedback-survey-text{color:#98a2b8}
        .feedback-survey-label{color:#a5aec4}
        .feedback-survey-input{background:#101114;border-color:#282c33;color:#c9d3e6}
        .feedback-survey-input::placeholder{color:#6d7689}
        .feedback-survey-meta{color:#8b94a8}
        .feedback-survey-error{color:#ff8199}
        .feedback-survey-later{background:#1b2033;color:#a9b2ff}
      }
      @media(max-width:430px){.feedback-survey-overlay{align-items:end;padding:0}.feedback-survey-card{width:100%;max-height:92vh;border-radius:28px 28px 0 0;padding:22px 16px calc(18px + env(safe-area-inset-bottom))}.feedback-survey-title{font-size:1.2rem}.feedback-survey-actions{grid-template-columns:1fr}.feedback-survey-later{order:2}}
    `;
    document.head.appendChild(style);
  }

  function closeModal() {
    document.getElementById(MODAL_ID)?.remove();
    document.body.classList.remove('feedback-survey-open');
  }

  function showModal() {
    if (dismissedThisSession || document.getElementById(MODAL_ID)) return;
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'feedback-survey-overlay';
    overlay.innerHTML = `
      <section class="feedback-survey-card" role="dialog" aria-modal="true" aria-labelledby="feedback-survey-title">
        <div class="feedback-survey-icon" aria-hidden="true">💡</div>
        <div class="feedback-survey-kicker">Два вопроса, один раз</div>
        <h2 class="feedback-survey-title" id="feedback-survey-title">Что вы думаете о приложении?</h2>
        <p class="feedback-survey-text">Вы играете уже несколько дней — расскажите своими словами. Это читает разработчик, и по таким ответам приложение и меняется.</p>
        <div class="feedback-survey-field">
          <label class="feedback-survey-label" for="feedback-survey-opinion">Ваше мнение о приложении</label>
          <textarea class="feedback-survey-input" id="feedback-survey-opinion" maxlength="${LIMIT}"
                    placeholder="Что нравится, что раздражает, чем пользуетесь чаще всего…"></textarea>
        </div>
        <div class="feedback-survey-field">
          <label class="feedback-survey-label" for="feedback-survey-wishes">Что бы вы добавили или изменили</label>
          <textarea class="feedback-survey-input" id="feedback-survey-wishes" maxlength="${LIMIT}"
                    placeholder="Новая игра, другое правило, кнопка не на месте…"></textarea>
        </div>
        <div class="feedback-survey-meta">
          <span id="feedback-survey-status">Ответ придёт разработчику приложения</span>
          <span id="feedback-survey-count">0/${LIMIT * 2}</span>
        </div>
        <div class="feedback-survey-actions">
          <button class="feedback-survey-submit" type="button">Отправить</button>
          <button class="feedback-survey-later" type="button">Позже</button>
        </div>
      </section>`;

    document.body.appendChild(overlay);
    document.body.classList.add('feedback-survey-open');

    const opinion = overlay.querySelector('#feedback-survey-opinion');
    const wishes = overlay.querySelector('#feedback-survey-wishes');
    const submit = overlay.querySelector('.feedback-survey-submit');
    const later = overlay.querySelector('.feedback-survey-later');
    const status = overlay.querySelector('#feedback-survey-status');
    const count = overlay.querySelector('#feedback-survey-count');

    const onInput = () => {
      const total = (opinion?.value.length || 0) + (wishes?.value.length || 0);
      if (count) count.textContent = `${total}/${LIMIT * 2}`;
      if (status) {
        status.textContent = 'Ответ придёт разработчику приложения';
        status.classList.remove('feedback-survey-error');
      }
    };
    opinion?.addEventListener('input', onInput);
    wishes?.addEventListener('input', onInput);

    later?.addEventListener('click', () => {
      dismissedThisSession = true;
      closeModal();
    });

    submit?.addEventListener('click', async () => {
      const first = String(opinion?.value || '').trim();
      const second = String(wishes?.value || '').trim();
      // Хватает одного ответа: заставлять писать оба — верный способ не
      // получить ни одного.
      if (first.length < 2 && second.length < 2) {
        if (status) {
          status.textContent = 'Напишите хотя бы пару слов в любом поле';
          status.classList.add('feedback-survey-error');
        }
        (first.length ? wishes : opinion)?.focus();
        return;
      }

      submit.disabled = true;
      submit.textContent = 'Отправляем…';
      try {
        await api('feedbackSubmit', { opinion: first, wishes: second });
        try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success'); } catch {}
        closeModal();
      } catch (error) {
        submit.disabled = false;
        submit.textContent = 'Отправить';
        if (status) {
          status.textContent = String(error?.message || 'Не удалось отправить ответ');
          status.classList.add('feedback-survey-error');
        }
      }
    });

    window.setTimeout(() => opinion?.focus?.(), 180);
  }

  async function checkAndShow(attempt = 0) {
    if (dismissedThisSession) return;
    // SDK Telegram грузится с их сервера и нередко доезжает уже после страницы,
    // а токен веб-сессии приложение подставляет при запуске. Сдаваться на первой
    // же проверке нельзя: тогда опрос молча не покажется вообще никогда — тем
    // чаще, чем медленнее связь.
    if (!hasIdentity() || !isAppReady()) {
      if (attempt < 40) window.setTimeout(() => checkAndShow(attempt + 1), 250);
      return;
    }
    // Вопрос «откуда узнали» задаётся первым и стоит на экране — второе окно
    // поверх него человек просто смахнёт.
    if (document.getElementById(REFERRAL_MODAL_ID)) return;

    try {
      const status = await api('feedbackStatus');
      if (!status?.answered && status?.eligible) showModal();
    } catch {
      if (attempt < 3) window.setTimeout(() => checkAndShow(attempt + 1), 2500);
    }
  }

  function start() {
    if (started) return;
    started = true;
    // Позже, чем вопрос «откуда узнали»: тот успевает открыться и занять экран.
    window.setTimeout(() => checkAndShow(0), 1400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
