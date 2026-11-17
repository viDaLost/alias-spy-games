(() => {
  'use strict';
  function mount() {
    const role = window.AdminRBAC?.state;
    const host = document.querySelector('.admin-rbac-manager');
    const existing = document.getElementById('app-access-manager');
    if (!role?.isRoot || !host) { existing?.remove(); return; }
    if (existing) return;
    const card = document.createElement('section');
    card.id = 'app-access-manager';
    card.className = 'app-access-manager';
    card.dataset.adminV3Owner = 'overview';
    card.innerHTML = `<h3>Доступ к приложению и боту</h3>
      <p data-access-mode>Проверяем состояние блокировки…</p>
      <button class="app-access-restore" type="button" data-access-restore disabled>Снять блокировку</button>
      <p data-access-admin-status role="status" aria-live="polite"></p>
      <details data-access-exceptions hidden>
        <summary>Открыть доступ по Telegram ID</summary>
        <form><label for="app-access-id">Telegram ID</label><input id="app-access-id" inputmode="numeric" autocomplete="off" maxlength="20" placeholder="123456789" required pattern="[1-9][0-9]{4,19}"><button type="submit">Открыть доступ</button></form>
        <ul></ul>
      </details>`;
    const page = host.closest('.admin-v2');
    (page?.querySelector('.admin-v3-nav, .admin-v2__header') || host).after(card);
    const restore = card.querySelector('[data-access-restore]');
    const mode = card.querySelector('[data-access-mode]');
    const exceptions = card.querySelector('[data-access-exceptions]');
    const status = card.querySelector('[data-access-admin-status]');
    const input = card.querySelector('input');
    let busy = false;
    let restricted = null;

    restore.addEventListener('click', () => { void update('appAccessRestore'); });
    card.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const targetId = input.value.trim();
      if (!/^[1-9]\d{4,19}$/.test(targetId)) return;
      await update('appAccessGrant', targetId);
    });
    void update('appAccessList');

    async function update(action, targetId) {
      if (busy) return;
      busy = true;
      card.querySelectorAll('button').forEach((button) => { button.disabled = true; });
      status.textContent = action === 'appAccessRestore' ? 'Снимаем глобальную блокировку…' : '';
      try {
        const response = await window.apiRequest({ action, ...(targetId ? { targetId } : {}) }, { raw: true, quiet: true });
        if (!response?.ok || response.data?.success !== true || typeof response.data.restricted !== 'boolean') {
          throw new Error(response?.data?.error || 'Не удалось проверить доступ. Обновите админ-панель и повторите.');
        }
        restricted = response.data.restricted;
        mode.textContent = restricted
          ? 'Глобальная блокировка включена. Кнопка открывает приложение и команды бота для всех пользователей с доступом.'
          : 'Глобальная блокировка снята. Приложение и бот работают в обычном режиме.';
        restore.hidden = restricted === false;
        exceptions.hidden = restricted === false;
        const list = card.querySelector('ul');
        list.replaceChildren();
        for (const user of response.data.users || []) {
          const li = document.createElement('li');
          const id = document.createElement('span'); id.textContent = user.userId;
          const revoke = document.createElement('button'); revoke.type = 'button'; revoke.textContent = 'Закрыть доступ';
          revoke.addEventListener('click', () => { void update('appAccessRevoke', user.userId); });
          li.append(id, revoke); list.append(li);
        }
        status.textContent = action === 'appAccessRestore' && !restricted ? 'Обычный режим восстановлен.'
          : action === 'appAccessGrant' ? `Доступ открыт для ${targetId}.`
          : action === 'appAccessRevoke' ? `Доступ для ${targetId} закрыт.` : '';
        if (action === 'appAccessGrant') input.value = '';
      } catch (error) {
        if (restricted === null) mode.textContent = 'Не удалось определить состояние блокировки.';
        status.textContent = error.message;
      } finally {
        busy = false;
        card.querySelectorAll('button').forEach((button) => { button.disabled = false; });
        restore.disabled = restricted !== true;
      }
    }
  }
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
  mount();
})();
