(() => {
  'use strict';
  let loaded = false;
  let busy = false;
  function mount() {
    const role = window.AdminRBAC?.state;
    const host = document.querySelector('.admin-rbac-manager');
    if (!role?.isRoot || !host) { loaded = false; return; }
    if (document.getElementById('app-access-manager')) return;
    const card = document.createElement('section');
    card.id = 'app-access-manager';
    card.className = 'app-access-manager';
    card.innerHTML = `<h3>Снять ограничения</h3>
      <p>Библейские игры временно закрыты. Введите Telegram ID, чтобы открыть приложение этому пользователю. Права администратора не выдаются.</p>
      <form><label for="app-access-id">Telegram ID</label><input id="app-access-id" inputmode="numeric" autocomplete="off" maxlength="20" placeholder="123456789" required pattern="[1-9][0-9]{4,19}"><button type="submit">Открыть доступ</button></form>
      <p data-access-admin-status role="status" aria-live="polite"></p><ul></ul>`;
    host.after(card);
    card.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const targetId = card.querySelector('input').value.trim();
      if (!/^[1-9]\d{4,19}$/.test(targetId)) return;
      await update('appAccessGrant', targetId);
    });
    if (!loaded) { loaded = true; void update('appAccessList'); }
  }
  async function update(action, targetId) {
    if (busy) return;
    const card = document.getElementById('app-access-manager');
    if (!card) return;
    busy = true;
    card.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    const status = card.querySelector('[data-access-admin-status]');
    try {
      const response = await window.apiRequest({ action, ...(targetId ? { targetId } : {}) }, { raw: true, quiet: true });
      if (!response?.ok || response.data?.success !== true) throw new Error(response?.data?.error || 'Не удалось сохранить. Проверьте связь и повторите.');
      const list = card.querySelector('ul');
      list.replaceChildren();
      for (const user of response.data.users || []) {
        const li = document.createElement('li');
        const id = document.createElement('span'); id.textContent = user.userId;
        const revoke = document.createElement('button'); revoke.type = 'button'; revoke.textContent = 'Закрыть доступ';
        revoke.addEventListener('click', () => { void update('appAccessRevoke', user.userId); });
        li.append(id, revoke); list.append(li);
      }
      status.textContent = action === 'appAccessGrant' ? `Доступ открыт для ${targetId}. Пользователь должен войти в свой Telegram-профиль.`
        : action === 'appAccessRevoke' ? `Доступ для ${targetId} снова закрыт.` : 'Доступ всегда открыт главному администратору. Ниже — индивидуальные исключения.';
      if (action === 'appAccessGrant') card.querySelector('input').value = '';
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; card.querySelectorAll('button').forEach((button) => { button.disabled = false; }); }
  }
  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
  mount();
})();
