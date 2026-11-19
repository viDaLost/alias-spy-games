(() => {
  'use strict';
  const date = new Intl.DateTimeFormat('ru-RU', {dateStyle:'medium', timeZone:'Europe/Moscow'});
  const timestamp = new Intl.DateTimeFormat('ru-RU', {dateStyle:'short', timeStyle:'short', timeZone:'Europe/Moscow'});

  function mount(page) {
    if (!window.AdminRBAC?.state?.isRoot || page.querySelector('#admin-sabbath')) return;
    const panel = document.createElement('section');
    panel.id = 'admin-sabbath';
    panel.className = 'admin-v3-section admin-stack';
    panel.dataset.adminV3Owner = 'sabbath';
    panel.innerHTML = `
      <h3>Субботнее расписание</h3>
      <p data-audit-period></p>
      <p>Игроки упорядочены по числу смен. Жирным выделены две и более смены.</p>
      <div class="admin-sabbath-table" tabindex="0" aria-label="Города игроков">
        <table>
          <thead><tr><th scope="col">Игрок</th><th scope="col">Город и пояс</th><th scope="col">Смены</th>
          <th scope="col">Последняя смена</th><th scope="col">Подтверждение</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <p role="status"></p>
      <div class="admin-sabbath-actions">
        <button type="button" data-audit-prev>Назад</button>
        <button type="button" data-audit-next>Далее</button>
        <button type="button" data-audit-refresh>Обновить</button>
      </div>`;
    page.append(panel);
    const status = panel.querySelector('[role="status"]');
    const prev = panel.querySelector('[data-audit-prev]');
    const next = panel.querySelector('[data-audit-next]');
    const refresh = panel.querySelector('[data-audit-refresh]');
    let offset = 0, previous = null, following = null;
    async function load(start = 0) {
      if (refresh.disabled) return;
      prev.disabled = next.disabled = refresh.disabled = true;
      status.textContent = 'Загружаем список…';
      try {
        const result = await window.AppAccess.sabbathRequest('report',{offset:start});
        offset = result.offset;
        previous = result.previous;
        following = result.next;
        panel.querySelector('[data-audit-period]').textContent =
          `Период наблюдения — с ${timestamp.format(result.from)} до ${timestamp.format(result.until)}, время Москвы.`;
        const rows = result.users.map(user => {
          const row = document.createElement('tr');
          row.dataset.frequent = String(user.changes >= 2);
          const values = [
            user.username ? `${user.username} · ${user.id}` : user.id,
            [user.city, user.timeZone].filter(Boolean).join(' · ') || '—',
            String(user.changes),
            user.lastChange ? date.format(user.lastChange) : '—',
            user.pending === null ? 'Нет данных' : user.pending ? 'Ожидается' : user.city ? 'Подтверждён' : 'Автоматически',
          ];
          for (const value of values) row.insertCell().textContent = value;
          return row;
        });
        panel.querySelector('tbody').replaceChildren(...rows);
        status.textContent = rows.length ? '' : 'Пользователи не найдены.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        prev.disabled = previous === null;
        next.disabled = following === null;
        refresh.disabled = false;
      }
    }
    prev.addEventListener('click',()=>load(previous));
    next.addEventListener('click',()=>load(following));
    refresh.addEventListener('click',()=>load(offset));
    void load();
  }
  window.AdminSabbath = Object.freeze({mount});
})();
