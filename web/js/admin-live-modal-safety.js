(() => {
  let lastOpener = null;
  let hadModal = false;

  document.addEventListener('click', (event) => {
    const opener = event.target?.closest?.('[data-user-chat],[data-observe-room]');
    if (opener) lastOpener = opener;
  }, true);

  const reconcile = () => {
    const hasModal = Boolean(document.querySelector('.admin-live-v3__modal'));
    if (hasModal) {
      hadModal = true;
      document.body?.classList.add('admin-live-modal-open');
      return;
    }
    document.body?.classList.remove('admin-live-modal-open');
    if (hadModal && lastOpener?.isConnected) {
      requestAnimationFrame(() => {
        try { lastOpener.focus({ preventScroll: true }); } catch {}
      });
    }
    hadModal = false;
    lastOpener = null;
  };

  const observer = new MutationObserver(reconcile);
  observer.observe(document.body, { childList: true, subtree: false });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  reconcile();
})();

(() => {
  'use strict';

  const state = {
    loaded: false,
    loading: null,
    isAdmin: false,
    isRoot: false,
    role: 'none',
    userId: '',
    lastCheckedAt: 0,
    managersLoading: false,
    // Последняя проверка не дошла до сервера: роль не понижаем, повторяем позже.
    offline: false,
  };
  const ROLE_CACHE_MS = 45_000;
  // Повтор после обрыва связи: сеть в Telegram отваливается на секунды, и без
  // повторной проверки кнопка не вернулась бы до перезапуска приложения.
  const RETRY_DELAYS = [1500, 4000, 10_000, 20_000];
  let retryTimer = 0;
  let retryStep = 0;
  const managerObserver = new MutationObserver(() => mountRoleManager());

  const escapeHTML = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  function currentInitData() {
    return String(window.Telegram?.WebApp?.initData || '');
  }

  function isStandaloneAndroid() {
    return window.__ANDROID_APK__ === true;
  }

  async function callAdmin(action, extra = {}) {
    if (typeof window.apiRequest !== 'function') throw new Error('API приложения недоступен');
    return window.apiRequest({ action, ...extra });
  }

  function applyRole(data = {}) {
    state.loaded = true;
    state.offline = false;
    retryStep = 0;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = 0; }
    state.isAdmin = data?.isAdmin === true;
    state.isRoot = data?.isRoot === true;
    state.role = state.isRoot ? 'owner' : (state.isAdmin ? 'admin' : 'none');
    state.userId = String(data?.userId || window.getTelegramUser?.()?.id || '');
    state.lastCheckedAt = Date.now();

    const root = document.documentElement;
    root.classList.toggle('admin-rbac-authorized', state.isAdmin);
    root.classList.toggle('admin-rbac-root', state.isRoot);
    root.dataset.adminRole = state.role;

    if (state.isAdmin) ensureAdminButton();
    else removeAdminButton();
    mountRoleManager();
    return publicState();
  }

  function clearRole() {
    return applyRole({ isAdmin: false, isRoot: false, role: 'none', userId: '' });
  }

  // Молчание сервера — не отказ. Раньше обрыв связи и явный ответ «не админ»
  // обрабатывались одинаково, и у настоящего администратора кнопка исчезала от
  // одного неудачного запроса — в том числе при каждом возврате в приложение,
  // потому что pageshow и visibilitychange перепроверяют роль принудительно.
  // Права это не расширяет: каждое привилегированное действие всё равно
  // проверяет сервер, здесь решается только судьба уже подтверждённой роли.
  function keepRole() {
    state.offline = true;
    if (!state.loaded) return clearRole();
    scheduleRetry();
    return publicState();
  }

  function scheduleRetry() {
    if (retryTimer || retryStep >= RETRY_DELAYS.length) return;
    const delay = RETRY_DELAYS[retryStep];
    retryStep += 1;
    retryTimer = setTimeout(() => {
      retryTimer = 0;
      refreshRole({ force: true });
    }, delay);
  }

  function publicState() {
    return Object.freeze({
      loaded: state.loaded,
      isAdmin: state.isAdmin,
      isRoot: state.isRoot,
      role: state.role,
      userId: state.userId,
      lastCheckedAt: state.lastCheckedAt,
      offline: state.offline === true,
    });
  }

  async function refreshRole({ force = false } = {}) {
    if (isStandaloneAndroid()) return clearRole();
    const initData = currentInitData();
    if (!initData) return state.loaded ? publicState() : clearRole();
    if (!force && state.loaded && Date.now() - state.lastCheckedAt < ROLE_CACHE_MS) return publicState();
    if (state.loading) return state.loading;

    state.loading = (async () => {
      try {
        const result = await callAdmin('adminRoleStatus');
        // apiRequest отдаёт null на любой сетевой сбой и на не-200 — это
        // «ответа не было», а не «прав нет».
        if (result == null) return keepRole();
        if (result.success !== true) return clearRole();
        return applyRole(result);
      } catch (error) {
        console.warn('Admin RBAC verification:', error);
        return keepRole();
      }
    })().finally(() => { state.loading = null; });
    return state.loading;
  }

  function ensureAdminButton() {
    if (!state.isAdmin || isStandaloneAndroid()) return null;
    let button = document.getElementById('admin-btn');
    if (!button && typeof window.renderAdminButton === 'function') {
      try { window.renderAdminButton(); } catch {}
      button = document.getElementById('admin-btn');
    }
    if (!button) return null;
    button.hidden = false;
    button.removeAttribute('aria-hidden');
    button.dataset.serverAdmin = '1';
    const description = button.querySelector('.game-card__desc');
    if (description) {
      description.textContent = state.isRoot
        ? 'Пользователи, администраторы, прогресс и рассылка'
        : 'Пользователи, прогресс, поддержка и рассылка';
    }
    return button;
  }

  function removeAdminButton() {
    const button = document.getElementById('admin-btn');
    if (!button) return;
    button.hidden = true;
    button.setAttribute('aria-hidden', 'true');
    button.dataset.serverAdmin = '0';
  }

  async function openVerifiedAdminPanel() {
    const role = await refreshRole({ force: true });
    if (!role.isAdmin) {
      // Прятать кнопку можно только по явному ответу сервера. При обрыве связи
      // администратор иначе терял вход молча: панель не открывалась и кнопка
      // пропадала.
      if (role.offline) {
        notify('Сервер не ответил. Проверьте связь и попробуйте ещё раз', 'error');
        scheduleRetry();
        return;
      }
      notify('Права администратора не подтверждены сервером', 'error');
      removeAdminButton();
      return;
    }

    if (role.isRoot && typeof window.openAdminPanelV2 === 'function') {
      await window.openAdminPanelV2();
      mountRoleManager();
      return;
    }
    if (typeof window.openAdminPanel === 'function') {
      await window.openAdminPanel();
      mountRoleManager();
      return;
    }
    notify('Админ-панель временно недоступна', 'error');
  }

  function notify(message, type = 'success') {
    const old = document.querySelector('.admin-rbac-toast');
    old?.remove();
    const toast = document.createElement('div');
    toast.className = `admin-rbac-toast admin-rbac-toast--${type}`;
    toast.textContent = String(message || '');
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 180);
    }, 2600);
  }

  function managerHost() {
    return document.querySelector('.admin-v2');
  }

  function mountRoleManager() {
    const existing = document.getElementById('admin-role-manager');
    if (!state.isRoot) {
      existing?.remove();
      return;
    }

    const page = managerHost();
    if (!page) return;
    if (existing?.isConnected) return;

    const section = document.createElement('section');
    section.id = 'admin-role-manager';
    section.className = 'admin-rbac-manager admin-v3-section';
    section.setAttribute('aria-label', 'Управление администраторами');
    section.innerHTML = `
      <div class="admin-rbac-manager__head">
        <div>
          <span class="admin-rbac-manager__eyebrow">ROOT ONLY</span>
          <h3>Администраторы</h3>
          <p>Только главный администратор может выдавать и отзывать права. Telegram ID проверяется сервером.</p>
        </div>
        <span class="admin-rbac-manager__shield" aria-label="Серверная защита">◆</span>
      </div>
      <form class="admin-rbac-manager__grant" data-admin-rbac-grant-form>
        <label>
          <span>Telegram ID пользователя</span>
          <input type="text" inputmode="numeric" pattern="[0-9]{5,20}" maxlength="20" autocomplete="off" placeholder="Например: 123456789" data-admin-rbac-id />
        </label>
        <button type="submit">Выдать права</button>
      </form>
      <div class="admin-rbac-manager__note">Назначенный администратор не сможет назначать других администраторов, отзывать ваши права или управлять другими привилегированными аккаунтами.</div>
      <div class="admin-rbac-manager__list" data-admin-rbac-list>
        <div class="admin-rbac-manager__loading">Загружаем список администраторов…</div>
      </div>`;

    const stats = page.querySelector('.admin-v2__stats');
    const live = page.querySelector('#admin-live-v3, #admin-live-rescue');
    if (stats) stats.after(section);
    else if (live) live.before(section);
    else page.prepend(section);

    section.querySelector('[data-admin-rbac-grant-form]')?.addEventListener('submit', grantAdmin);
    section.querySelector('[data-admin-rbac-list]')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-admin-rbac-revoke]');
      if (button) revokeAdmin(button.dataset.adminRbacRevoke, button);
    });
    loadAdmins();
  }

  async function loadAdmins() {
    if (!state.isRoot || state.managersLoading) return;
    const list = document.querySelector('[data-admin-rbac-list]');
    if (!list) return;
    state.managersLoading = true;
    try {
      const role = await refreshRole({ force: true });
      if (!role.isRoot) throw new Error('Главный администратор не подтверждён');
      const response = await callAdmin('adminRoleList');
      if (!response?.success || !Array.isArray(response.admins)) throw new Error(response?.error || 'Не удалось получить администраторов');
      renderAdmins(response.admins);
    } catch (error) {
      list.innerHTML = `<div class="admin-rbac-manager__empty">${escapeHTML(error?.message || 'Не удалось загрузить администраторов')}</div>`;
    } finally {
      state.managersLoading = false;
    }
  }

  function renderAdmins(admins) {
    const list = document.querySelector('[data-admin-rbac-list]');
    if (!list) return;
    list.innerHTML = admins.length
      ? admins.map((admin) => {
          const id = String(admin?.id || '');
          const username = String(admin?.username || 'без_ника');
          const isRoot = admin?.isRoot === true;
          const title = username && username !== 'без_ника' ? `@${username.replace(/^@+/, '')}` : `ID ${id}`;
          return `
            <article class="admin-rbac-admin ${isRoot ? 'is-root' : ''}">
              <div class="admin-rbac-admin__avatar">${escapeHTML((username !== 'без_ника' ? username : id).slice(0, 1).toUpperCase() || '?')}</div>
              <div class="admin-rbac-admin__body">
                <div class="admin-rbac-admin__title"><b>${escapeHTML(title)}</b><span>${isRoot ? 'Главный администратор' : 'Администратор'}</span></div>
                <small>ID ${escapeHTML(id)}</small>
              </div>
              ${isRoot
                ? '<span class="admin-rbac-admin__locked" title="Роль владельца неизменяема">Защищён</span>'
                : `<button type="button" class="admin-rbac-admin__revoke" data-admin-rbac-revoke="${escapeHTML(id)}">Отозвать</button>`}
            </article>`;
        }).join('')
      : '<div class="admin-rbac-manager__empty">Назначенных администраторов пока нет.</div>';
  }

  async function grantAdmin(event) {
    event.preventDefault();
    const input = event.currentTarget.querySelector('[data-admin-rbac-id]');
    const targetId = String(input?.value || '').trim();
    if (!/^\d{5,20}$/.test(targetId)) {
      notify('Введите корректный Telegram ID', 'error');
      input?.focus();
      return;
    }
    if (targetId === state.userId) {
      notify('У вас уже есть неизменяемые права главного администратора', 'neutral');
      return;
    }
    if (!window.confirm(`Выдать права администратора пользователю ID ${targetId}?\n\nОн получит доступ к управлению пользователями, поддержке, мониторингу и рассылке, но не сможет назначать других администраторов.`)) return;

    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = 'Проверяем…'; }
    try {
      const role = await refreshRole({ force: true });
      if (!role.isRoot) throw new Error('Операция доступна только главному администратору');
      const response = await callAdmin('adminRoleGrant', { targetId });
      if (!response?.success) throw new Error(response?.error || 'Не удалось выдать права');
      if (input) input.value = '';
      notify(`Права администратора выданы ID ${targetId}`);
      await loadAdmins();
    } catch (error) {
      notify(error?.message || 'Не удалось выдать права', 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Выдать права'; }
    }
  }

  async function revokeAdmin(targetId, button) {
    const id = String(targetId || '').trim();
    if (!/^\d{5,20}$/.test(id)) return;
    if (!window.confirm(`Отозвать права администратора у ID ${id}?\n\nДоступ к административным API и уже выданным admin-сессиям будет прекращён сервером.`)) return;

    if (button) { button.disabled = true; button.textContent = 'Отзываем…'; }
    try {
      const role = await refreshRole({ force: true });
      if (!role.isRoot) throw new Error('Операция доступна только главному администратору');
      const response = await callAdmin('adminRoleRevoke', { targetId: id });
      if (!response?.success) throw new Error(response?.error || 'Не удалось отозвать права');
      notify(`Права администратора отозваны у ID ${id}`);
      await loadAdmins();
    } catch (error) {
      notify(error?.message || 'Не удалось отозвать права', 'error');
      if (button) { button.disabled = false; button.textContent = 'Отозвать'; }
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#admin-btn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openVerifiedAdminPanel();
  }, true);

  managerObserver.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pageshow', () => refreshRole({ force: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshRole({ force: true });
  });

  let attempts = 0;
  const boot = () => {
    attempts += 1;
    refreshRole({ force: attempts > 1 });
    if (!currentInitData() && attempts < 10) setTimeout(boot, 500);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.AdminRBAC = Object.freeze({
    refresh: refreshRole,
    open: openVerifiedAdminPanel,
    get state() { return publicState(); },
  });
})();
