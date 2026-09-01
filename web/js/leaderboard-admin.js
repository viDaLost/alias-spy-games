(() => {
  'use strict';

  // Раздел «Рейтинг» в панели управления: правка имени, очков и участия.
  //
  // Заработанные игроком очки здесь не переписываются — сервер держит правку
  // отдельной надбавкой, поэтому следующий синхронизированный прогресс её не
  // затрёт. Администратор видит и меняет итоговую сумму, а как она сложилась,
  // остаётся на сервере.

  const state = { players: [], query: '', loading: false, loaded: false };

  const escapeHTML = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

  async function api(action, extra = {}) {
    if (typeof window.apiRequest !== 'function') throw new Error('API приложения недоступен');
    const result = await window.apiRequest({ action, ...extra });
    if (!result) throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз');
    if (result.success === false) throw new Error(result.error || 'Не удалось выполнить запрос');
    return result;
  }

  function host() {
    return document.querySelector('.admin-v2') || document.querySelector('.admin-page');
  }

  function section() { return document.getElementById('admin-rating-panel'); }

  function markup() {
    return `
      <div class="admin-rating__head">
        <div>
          <span class="admin-rating__eyebrow">Рейтинг</span>
          <h3>Опубликованные игроки</h3>
        </div>
        <button type="button" class="admin-rating__refresh" data-rating-refresh>Обновить</button>
      </div>
      <input type="search" class="admin-rating__search" data-rating-search placeholder="Имя или Telegram ID" />
      <div class="admin-rating__list" data-rating-list><span class="admin-rating__hint">Загрузка…</span></div>
      <p class="admin-rating__note">
        Очки, начисленные за игру, остаются на месте: правка сохраняется отдельно
        и не сотрётся следующей синхронизацией прогресса.
      </p>`;
  }

  function renderList() {
    const list = section()?.querySelector('[data-rating-list]');
    if (!list) return;

    const query = state.query.trim().toLowerCase();
    const rows = state.players.filter((player) => !query
      || player.name.toLowerCase().includes(query)
      || player.userId.includes(query));

    if (!rows.length) {
      list.innerHTML = `<span class="admin-rating__hint">${state.loaded ? 'Никого не нашлось' : 'Загрузка…'}</span>`;
      return;
    }

    list.innerHTML = rows.map((player, index) => `
      <article class="admin-rating-row${player.published ? '' : ' is-hidden-player'}" data-rating-user="${escapeHTML(player.userId)}">
        <span class="admin-rating-row__place">${index + 1}</span>
        <div class="admin-rating-row__main">
          <input class="admin-rating-row__name" data-rating-name value="${escapeHTML(player.name)}" maxlength="24" aria-label="Имя в рейтинге" />
          <small>ID ${escapeHTML(player.userId)}${player.published ? '' : ' · скрыт из рейтинга'}</small>
        </div>
        <input class="admin-rating-row__points" data-rating-points type="number" min="0" inputmode="numeric"
               value="${Number(player.total || 0)}" aria-label="Очки" />
        <div class="admin-rating-row__actions">
          <button type="button" data-rating-save>Сохранить</button>
          <button type="button" data-rating-toggle>${player.published ? 'Скрыть' : 'Показать'}</button>
        </div>
      </article>`).join('');
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    try {
      const result = await api('ratingAdminList', { limit: 200 });
      state.players = Array.isArray(result.players) ? result.players : [];
      state.loaded = true;
      renderList();
    } catch (error) {
      const list = section()?.querySelector('[data-rating-list]');
      if (list) list.innerHTML = `<span class="admin-rating__hint admin-rating__hint--error">${escapeHTML(error.message)}</span>`;
    } finally {
      state.loading = false;
    }
  }

  function notify(message, tone = 'success') {
    if (typeof window.showToast === 'function') { window.showToast(message); return; }
    document.querySelector('.admin-rating__toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `admin-rating__toast admin-rating__toast--${tone}`;
    toast.textContent = message;
    document.body.append(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  async function onClick(event) {
    const row = event.target.closest('[data-rating-user]');
    if (event.target.closest('[data-rating-refresh]')) { load(); return; }
    if (!row) return;
    const userId = row.dataset.ratingUser;
    const player = state.players.find((item) => item.userId === userId);
    if (!player) return;

    if (event.target.closest('[data-rating-save]')) {
      const name = row.querySelector('[data-rating-name]')?.value.trim() || '';
      const total = Number(row.querySelector('[data-rating-points]')?.value || 0);
      if (!name) { notify('Имя не может быть пустым', 'error'); return; }
      try {
        await api('ratingAdminUpdate', { targetId: userId, name, total });
        player.name = name;
        player.total = Math.max(0, Math.floor(total));
        notify('Сохранено');
        renderList();
      } catch (error) { notify(error.message, 'error'); }
      return;
    }

    if (event.target.closest('[data-rating-toggle]')) {
      try {
        await api('ratingAdminUpdate', { targetId: userId, published: !player.published });
        player.published = !player.published;
        notify(player.published ? 'Игрок показан в рейтинге' : 'Игрок скрыт из рейтинга');
        renderList();
      } catch (error) { notify(error.message, 'error'); }
    }
  }

  function mount() {
    const page = host();
    if (!page || section()) return Boolean(page);

    const panel = document.createElement('section');
    panel.id = 'admin-rating-panel';
    panel.className = 'admin-rating';
    panel.innerHTML = markup();
    page.append(panel);

    panel.addEventListener('click', onClick);
    panel.querySelector('[data-rating-search]')?.addEventListener('input', (event) => {
      state.query = String(event.target.value || '');
      renderList();
    });

    load();
    return true;
  }

  const observer = new MutationObserver(() => { mount(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.AdminRatingPanel = { mount, reload: load };
})();
