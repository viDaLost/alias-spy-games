(() => {
  const API = 'https://script.google.com/macros/s/AKfycbx0o9HmRIF6vNuBUB2N4H3YuabJzYbRmAxvHCCwqnbMPn29Crv5W3FT1XGDF6VyFSn9/exec';
  const ADMIN_ID = '1288379477';
  const SUBJECTS = ['Техническая проблема', 'Проблема с игрой', 'Аккаунт и прогресс', 'Предложение', 'Другое'];
  const STATUS_NAMES = { new: 'Новое', in_progress: 'В работе', answered: 'Есть ответ', closed: 'Закрыто' };
  let adminTimer = null;

  function telegramUser() {
    return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
  }

  async function api(payload) {
    const response = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false || data?.ok === false) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }
    return data;
  }

  function statusBadge(status) {
    const safe = ['new', 'in_progress', 'answered', 'closed'].includes(String(status)) ? String(status) : 'new';
    return `<span class="support-status" data-status="${safe}">${STATUS_NAMES[safe] || safe}</span>`;
  }

  function fmt(ts) {
    const value = Number(ts || 0);
    if (!value) return '';
    return new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function ticketHtml(ticket) {
    const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
    return `<article class="support-ticket">
      <div class="support-ticket__top">
        <div><div class="support-ticket__subject">${esc(ticket.subject)}</div><div class="support-ticket__meta">№ ${esc(ticket.id)} · ${fmt(ticket.createdAt)}</div></div>
        ${statusBadge(ticket.status)}
      </div>
      <div class="support-messages">${messages.map((message) => `<div class="support-message ${message.sender === 'admin' ? 'is-admin' : ''}">${esc(message.body)}<small>${message.sender === 'admin' ? 'Техподдержка' : 'Вы'} · ${fmt(message.createdAt)}</small></div>`).join('')}</div>
    </article>`;
  }

  async function loadUserTickets(container) {
    const user = telegramUser();
    if (!user?.id) {
      container.innerHTML = '<div class="support-empty">История обращений доступна при открытии приложения через Telegram.</div>';
      return;
    }
    try {
      const data = await api({ action: 'supportList' });
      const tickets = Array.isArray(data.tickets) ? data.tickets : [];
      container.innerHTML = tickets.length ? tickets.map(ticketHtml).join('') : '<div class="support-empty">У вас пока нет обращений.</div>';
    } catch (error) {
      container.innerHTML = `<div class="support-empty">${esc(error.message || 'Не удалось загрузить обращения')}</div>`;
    }
  }

  function openSupportCenter() {
    document.getElementById('support-center-backdrop')?.remove();
    const user = telegramUser();
    const backdrop = document.createElement('div');
    backdrop.id = 'support-center-backdrop';
    backdrop.className = 'support-center-backdrop';
    backdrop.innerHTML = `<section class="support-center" role="dialog" aria-modal="true" aria-label="Техническая поддержка">
      <div class="support-center__head"><div><h2>Техническая поддержка</h2><p>Напишите нам — ответ появится здесь, а администратор получит уведомление.</p></div><button class="support-center__close" type="button" aria-label="Закрыть">×</button></div>
      <form class="support-form" id="support-form">
        <div class="support-form__field"><label for="support-subject">Тема</label><select id="support-subject">${SUBJECTS.map((item) => `<option>${esc(item)}</option>`).join('')}</select></div>
        <div class="support-form__field"><label for="support-message">Опишите проблему</label><textarea id="support-message" maxlength="2000" minlength="10" placeholder="Что произошло? Что вы ожидали увидеть?"></textarea></div>
        ${user?.id ? `<div class="support-form__row"><div class="support-form__field"><label>Telegram ID</label><input value="${esc(user.id)}" disabled></div><div class="support-form__field"><label>Источник</label><input value="Веб-приложение в Telegram" disabled></div></div>` : '<div class="support-feedback is-error">Откройте веб-приложение через Telegram, чтобы отправить обращение и получить ответ.</div>'}
        <button class="support-send" type="submit" ${user?.id ? '' : 'disabled'}>Отправить обращение</button><div class="support-feedback" id="support-feedback"></div>
      </form>
      <div class="support-list"><div class="support-list__title">Мои обращения</div><div id="support-user-tickets"><div class="support-empty">Загружаем…</div></div></div>
    </section>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('.support-center__close')?.addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) backdrop.remove(); });
    const ticketsNode = backdrop.querySelector('#support-user-tickets');
    loadUserTickets(ticketsNode);

    backdrop.querySelector('#support-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const feedback = backdrop.querySelector('#support-feedback');
      const button = backdrop.querySelector('.support-send');
      const subject = String(backdrop.querySelector('#support-subject')?.value || '').trim();
      const message = String(backdrop.querySelector('#support-message')?.value || '').trim();
      feedback.className = 'support-feedback';
      if (message.length < 10) {
        feedback.textContent = 'Опишите проблему хотя бы в нескольких словах.';
        feedback.classList.add('is-error');
        return;
      }
      button.disabled = true;
      feedback.textContent = 'Отправляем…';
      try {
        const data = await api({ action: 'supportCreate', subject, message, source: 'web' });
        backdrop.querySelector('#support-message').value = '';
        feedback.textContent = `Обращение ${data.ticket?.id || ''} отправлено.`;
        await loadUserTickets(ticketsNode);
      } catch (error) {
        feedback.textContent = error.message || 'Не удалось отправить обращение';
        feedback.classList.add('is-error');
      } finally {
        button.disabled = false;
      }
    });
  }

  window.openSupportChat = openSupportCenter;
  window.openSupportCenter = openSupportCenter;

  function ensureAdminPanel() {
    const user = telegramUser();
    if (String(user?.id || '') !== ADMIN_ID) return;
    const page = document.querySelector('.admin-v2, .admin-page');
    if (!page || document.getElementById('support-admin-panel')) return;
    const panel = document.createElement('section');
    panel.id = 'support-admin-panel';
    panel.className = 'support-admin-panel';
    panel.innerHTML = '<div class="support-admin-panel__head"><h3>🎧 Техподдержка</h3><button type="button" class="support-admin-panel__refresh">Обновить</button></div><div id="support-admin-list" class="support-admin-list"><div class="support-empty">Загружаем обращения…</div></div>';
    const anchor = page.querySelector('.admin-v2__stats, .admin-live-v2, .admin-tools, .admin-broadcast');
    if (anchor) anchor.after(panel); else page.prepend(panel);
    panel.querySelector('.support-admin-panel__refresh')?.addEventListener('click', refreshAdmin);
    refreshAdmin();
    clearInterval(adminTimer);
    adminTimer = setInterval(() => document.getElementById('support-admin-panel') ? refreshAdmin() : clearInterval(adminTimer), 15000);
  }

  async function refreshAdmin() {
    const list = document.getElementById('support-admin-list');
    if (!list) return;
    try {
      const data = await api({ action: 'supportAdminList' });
      const tickets = Array.isArray(data.tickets) ? data.tickets : [];
      list.innerHTML = tickets.length ? tickets.map(adminTicketHtml).join('') : '<div class="support-empty">Новых обращений нет.</div>';
      bindAdminActions(list);
    } catch (error) {
      list.innerHTML = `<div class="support-empty">${esc(error.message || 'Не удалось загрузить обращения')}</div>`;
    }
  }

  function adminTicketHtml(ticket) {
    const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
    return `<article class="support-admin-ticket" data-ticket-id="${esc(ticket.id)}">
      <div class="support-ticket__top"><div><div class="support-ticket__subject">${esc(ticket.subject)}</div><div class="support-ticket__meta">ID ${esc(ticket.userId)} · ${ticket.source === 'android' ? 'Android' : 'Web'} · ${fmt(ticket.updatedAt)} · № ${esc(ticket.id)}</div></div>${statusBadge(ticket.status)}</div>
      <div class="support-messages">${messages.map((message) => `<div class="support-message ${message.sender === 'admin' ? 'is-admin' : ''}">${esc(message.body)}<small>${message.sender === 'admin' ? 'Вы' : `Пользователь ${esc(ticket.userId)}`} · ${fmt(message.createdAt)}</small></div>`).join('')}</div>
      <textarea maxlength="2000" placeholder="Ответ пользователю…"></textarea>
      <div class="support-admin-ticket__controls"><button type="button" class="support-admin-ticket__reply">Отправить ответ</button><select class="support-admin-ticket__status"><option value="new" ${ticket.status === 'new' ? 'selected' : ''}>Новое</option><option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>В работе</option><option value="answered" ${ticket.status === 'answered' ? 'selected' : ''}>Есть ответ</option><option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Закрыто</option></select></div>
    </article>`;
  }

  function bindAdminActions(root) {
    root.querySelectorAll('.support-admin-ticket').forEach((card) => {
      const ticketId = card.dataset.ticketId || '';
      card.querySelector('.support-admin-ticket__reply')?.addEventListener('click', async () => {
        const textarea = card.querySelector('textarea');
        const message = String(textarea?.value || '').trim();
        if (message.length < 2) return;
        try {
          await api({ action: 'supportReply', ticketId, message });
          textarea.value = '';
          await refreshAdmin();
        } catch (error) { alert(error.message || 'Не удалось отправить ответ'); }
      });
      card.querySelector('.support-admin-ticket__status')?.addEventListener('change', async (event) => {
        try { await api({ action: 'supportSetStatus', ticketId, status: event.target.value }); await refreshAdmin(); }
        catch (error) { alert(error.message || 'Не удалось изменить статус'); }
      });
    });
  }

  const observer = new MutationObserver(() => ensureAdminPanel());
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('load', ensureAdminPanel, { once: true });
  ensureAdminPanel();
})();
