(() => {
  'use strict';

  const PAGE_SELECTOR = '.admin-v2';
  let scheduled = 0;
  let observer = null;

  function first(selector, root = document) {
    return root.querySelector(selector);
  }

  function livePanel(page) {
    return first('#admin-live-v3', page) || first('#admin-live-rescue', page);
  }

  function placeAfter(node, anchor) {
    if (!node || !anchor || node === anchor || anchor.nextElementSibling === node) return node || anchor;
    anchor.after(node);
    return node;
  }

  function ensureNav(page) {
    let nav = first('.admin-v3-nav', page);
    if (nav) return nav;

    nav = document.createElement('nav');
    nav.className = 'admin-v3-nav';
    nav.setAttribute('aria-label', 'Разделы админ-панели');
    nav.innerHTML = `
      <button type="button" data-admin-v3-target="overview" class="is-active"><span>◉</span>Обзор</button>
      <button type="button" data-admin-v3-target="support"><span>◌</span>Поддержка</button>
      <button type="button" data-admin-v3-target="users"><span>◎</span>Пользователи</button>
      <button type="button" data-admin-v3-target="broadcast"><span>↗</span>Рассылка</button>`;

    nav.addEventListener('click', (event) => {
      const button = event.target.closest('[data-admin-v3-target]');
      if (!button) return;
      const target = resolveTarget(page, button.dataset.adminV3Target || 'overview');
      if (!target) return;
      nav.querySelectorAll('[data-admin-v3-target]').forEach((item) => item.classList.toggle('is-active', item === button));
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const header = first('.admin-v2__header', page);
    if (header) header.after(nav); else page.prepend(nav);
    return nav;
  }

  function resolveTarget(page, key) {
    if (key === 'overview') return livePanel(page) || first('.admin-v2__stats', page) || page;
    if (key === 'support') return first('#support-admin-panel', page) || livePanel(page) || page;
    if (key === 'users') return first('.admin-v2__toolbar', page) || first('.admin-v2__users-section', page) || page;
    if (key === 'broadcast') return first('.admin-broadcast', page) || first('.admin-v2__broadcast', page) || page;
    return page;
  }

  function upgradeHeader(page) {
    const header = first('.admin-v2__header', page);
    if (!header) return;
    header.classList.add('admin-v3-header');

    const heading = first('.admin-v2__heading', header);
    if (heading) {
      const eyebrow = first('.admin-v2__eyebrow', heading);
      if (eyebrow) eyebrow.textContent = 'CONTROL CENTER · V3';
      const title = first('h2', heading);
      if (title) title.textContent = 'Панель управления';
      const meta = first('p', heading);
      if (meta) meta.innerHTML = `Синхронизация <span class="admin-v3-online-dot" aria-hidden="true"></span> <span data-admin-loaded-at>${document.querySelector('[data-admin-loaded-at]')?.textContent || 'сейчас'}</span>`;

      if (!first('.admin-v3-live-badge', heading)) {
        const badge = document.createElement('span');
        badge.className = 'admin-v3-live-badge';
        badge.innerHTML = '<i></i> LIVE';
        heading.appendChild(badge);
      }
    }

    const refresh = first('[data-admin-action="refresh"]', header);
    if (refresh) {
      refresh.classList.add('admin-v3-refresh');
      refresh.setAttribute('title', 'Обновить данные');
    }
  }

  function upgradeStats(page) {
    const stats = first('.admin-v2__stats', page);
    if (!stats) return;
    stats.classList.add('admin-v3-stats');
    const cards = [...stats.children];
    const icons = ['Σ', '✓', '×'];
    cards.forEach((card, index) => {
      card.dataset.adminV3Icon = icons[index] || '•';
    });
  }

  function reorder(page) {
    const header = first('.admin-v2__header', page);
    const nav = first('.admin-v3-nav', page);
    const stats = first('.admin-v2__stats', page);
    const live = livePanel(page);
    const support = first('#support-admin-panel', page);
    const toolbar = first('.admin-v2__toolbar', page);
    const broadcast = first('.admin-broadcast', page) || first('.admin-v2__broadcast', page);
    const users = first('.admin-v2__users-section', page);

    let anchor = header || page.firstElementChild;
    if (nav && anchor) anchor = placeAfter(nav, anchor);
    if (stats && anchor) anchor = placeAfter(stats, anchor);
    if (live && anchor) anchor = placeAfter(live, anchor);
    if (support && anchor) anchor = placeAfter(support, anchor);
    if (toolbar && anchor) anchor = placeAfter(toolbar, anchor);
    if (broadcast && anchor) anchor = placeAfter(broadcast, anchor);
    if (users && anchor) placeAfter(users, anchor);
  }

  function decorateSections(page) {
    const support = first('#support-admin-panel', page);
    if (support) support.classList.add('admin-v3-section', 'admin-v3-support');
    const toolbar = first('.admin-v2__toolbar', page);
    if (toolbar) toolbar.classList.add('admin-v3-section', 'admin-v3-toolbar');
    const users = first('.admin-v2__users-section', page);
    if (users) users.classList.add('admin-v3-section', 'admin-v3-users');
    const broadcast = first('.admin-broadcast', page) || first('.admin-v2__broadcast', page);
    if (broadcast) broadcast.classList.add('admin-v3-section', 'admin-v3-broadcast');
    const live = livePanel(page);
    if (live) live.classList.add('admin-v3-section', 'admin-v3-live');
  }

  function updateNavState(page) {
    const nav = first('.admin-v3-nav', page);
    if (!nav) return;
    const online = first('#admin-live-v3 .admin-live-v3__section-head span', page)
      || first('#admin-live-rescue [data-live-count]', page);
    const supportCount = first('#support-admin-list', page)?.children?.length || 0;

    const overview = first('[data-admin-v3-target="overview"]', nav);
    const support = first('[data-admin-v3-target="support"]', nav);
    if (overview) overview.dataset.count = String(online?.textContent?.trim() || '');
    if (support) support.dataset.count = supportCount > 0 ? String(supportCount) : '';
  }

  function enhance() {
    scheduled = 0;
    const page = first(PAGE_SELECTOR);
    if (!page) return;

    page.classList.add('admin-v3-shell');
    page.dataset.adminVersion = '3';
    upgradeHeader(page);
    ensureNav(page);
    upgradeStats(page);
    decorateSections(page);
    reorder(page);
    updateNavState(page);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = requestAnimationFrame(enhance);
  }

  observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'id'] });
  window.addEventListener('pageshow', schedule);
  document.addEventListener('DOMContentLoaded', schedule, { once: true });
  schedule();

  window.AdminShellV3 = Object.freeze({ refresh: schedule });
})();