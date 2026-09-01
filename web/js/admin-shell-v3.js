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
      <button type="button" data-admin-v3-target="broadcast"><span>↗</span>Рассылка</button>
      <button type="button" data-admin-v3-target="rating"><span>★</span>Рейтинг</button>`;

    nav.addEventListener('click', (event) => {
      const button = event.target.closest('[data-admin-v3-target]');
      if (!button) return;
      setSection(page, button.dataset.adminV3Target || 'overview');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const header = first('.admin-v2__header', page);
    if (header) header.after(nav); else page.prepend(nav);
    return nav;
  }

  // The four buttons looked like tabs but only scrolled: every section stayed on the
  // page, so picking "Пользователи" still left the stats, the support queue and the
  // broadcast form between you and the list. Now a tab shows its own sections and
  // hides the rest. The choice lives on the page element, so it survives the
  // re-render that follows every filter change and every refresh.
  const SECTIONS = ['overview', 'support', 'users', 'broadcast', 'rating'];

  function currentSection(page) {
    const value = String(page.dataset.adminV3Section || '');
    return SECTIONS.includes(value) ? value : 'overview';
  }

  function setSection(page, key) {
    const next = SECTIONS.includes(key) ? key : 'overview';
    page.dataset.adminV3Section = next;
    const nav = first('.admin-v3-nav', page);
    nav?.querySelectorAll('[data-admin-v3-target]').forEach((item) => {
      item.classList.toggle('is-active', item.dataset.adminV3Target === next);
      item.setAttribute('aria-current', item.dataset.adminV3Target === next ? 'true' : 'false');
    });

    // The broadcast form is a <details> that made sense collapsed among other
    // sections. On a tab of its own, collapsed leaves the screen empty.
    const broadcast = first('.admin-broadcast', page) || first('.admin-v2__broadcast', page);
    if (broadcast?.tagName === 'DETAILS' && next === 'broadcast') broadcast.open = true;
  }

  function upgradeHeader(page) {
    const header = first('.admin-v2__header', page);
    if (!header) return;
    if (!header.classList.contains('admin-v3-header')) header.classList.add('admin-v3-header');

    const heading = first('.admin-v2__heading', header);
    if (heading) {
      const eyebrow = first('.admin-v2__eyebrow', heading);
      if (eyebrow && eyebrow.textContent !== 'CONTROL CENTER · V3') eyebrow.textContent = 'CONTROL CENTER · V3';

      const title = first('h2', heading);
      if (title && title.textContent !== 'Панель управления') title.textContent = 'Панель управления';

      const meta = first('p', heading);
      if (meta && meta.dataset.adminV3Ready !== '1') {
        const loaded = first('[data-admin-loaded-at]', meta)?.textContent?.trim() || 'сейчас';
        meta.innerHTML = `Синхронизация <span class="admin-v3-online-dot" aria-hidden="true"></span> <span data-admin-loaded-at>${loaded}</span>`;
        meta.dataset.adminV3Ready = '1';
      }

      if (!first('.admin-v3-live-badge', heading)) {
        const badge = document.createElement('span');
        badge.className = 'admin-v3-live-badge';
        badge.innerHTML = '<i></i> LIVE';
        heading.appendChild(badge);
      }
    }

    const refresh = first('[data-admin-action="refresh"]', header);
    if (refresh) {
      if (!refresh.classList.contains('admin-v3-refresh')) refresh.classList.add('admin-v3-refresh');
      if (refresh.getAttribute('title') !== 'Обновить данные') refresh.setAttribute('title', 'Обновить данные');
    }
  }

  function upgradeStats(page) {
    const stats = first('.admin-v2__stats', page);
    if (!stats) return;
    if (!stats.classList.contains('admin-v3-stats')) stats.classList.add('admin-v3-stats');
    const cards = [...stats.children];
    const icons = ['Σ', '✓', '×'];
    cards.forEach((card, index) => {
      const icon = icons[index] || '•';
      if (card.dataset.adminV3Icon !== icon) card.dataset.adminV3Icon = icon;
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
    const rating = first('.admin-rating', page);
    if (rating) rating.classList.add('admin-v3-section', 'admin-v3-rating');
    const live = livePanel(page);
    if (live) live.classList.add('admin-v3-section', 'admin-v3-live');

    // Which tab each section belongs to. The stats block stays with the overview.
    const owners = [
      [first('.admin-v2__stats', page), 'overview'],
      [live, 'overview'],
      [support, 'support'],
      [toolbar, 'users'],
      [users, 'users'],
      [broadcast, 'broadcast'],
      [rating, 'rating'],
    ];
    for (const [node, owner] of owners) {
      if (node && node.dataset.adminV3Owner !== owner) node.dataset.adminV3Owner = owner;
    }
  }

  function updateNavState(page) {
    const nav = first('.admin-v3-nav', page);
    if (!nav) return;
    const online = first('#admin-live-v3 .admin-live-v3__section-head span', page)
      || first('#admin-live-rescue .admin-live-v3__section-head span', page);
    const supportCount = first('#support-admin-list', page)?.children?.length || 0;

    const overview = first('[data-admin-v3-target="overview"]', nav);
    const support = first('[data-admin-v3-target="support"]', nav);
    const onlineCount = String(online?.textContent?.trim() || '');
    const supportValue = supportCount > 0 ? String(supportCount) : '';
    if (overview && overview.dataset.count !== onlineCount) overview.dataset.count = onlineCount;
    if (support && support.dataset.count !== supportValue) support.dataset.count = supportValue;
  }

  function enhance() {
    scheduled = 0;
    const page = first(PAGE_SELECTOR);
    if (!page) return;

    if (!page.classList.contains('admin-v3-shell')) page.classList.add('admin-v3-shell');
    if (page.dataset.adminVersion !== '3') page.dataset.adminVersion = '3';
    upgradeHeader(page);
    ensureNav(page);
    upgradeStats(page);
    decorateSections(page);
    reorder(page);
    setSection(page, currentSection(page));
    updateNavState(page);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = requestAnimationFrame(enhance);
  }

  observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pageshow', schedule);
  document.addEventListener('DOMContentLoaded', schedule, { once: true });
  schedule();

  window.AdminShellV3 = Object.freeze({ refresh: schedule });
})();