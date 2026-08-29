(() => {
  "use strict";

  const ADMIN_ID = "1288379477";
  // delegated-admin-ui-hotfix-v1
  let delegatedAdmin = false;
  const PAGE_SIZE = 12;
  const state = {
    users: [],
    query: "",
    filter: "all",
    page: 1,
    loadedAt: null,
    loading: false,
  };

  const escapeHTML = window.escapeHTML || ((value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;"));

  const safeNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const isTrue = (value) => value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";

  function currentUser() {
    return window.getTelegramUser?.() || { id: "аноним", username: "без_ника", link: "неизвестно" };
  }

  function isAdmin() {
    return delegatedAdmin || String(currentUser().id) === ADMIN_ID;
  }

  async function resolveAdminRole() {
    try {
      const response = await adminApi({ action: "adminRoleStatus" });
      return response?.success === true && response?.isAdmin === true;
    } catch {
      return false;
    }
  }

  async function adminApi(payload) {
    if (!window.apiRequest) throw new Error("API приложения недоступен");
    return window.apiRequest({
      ...payload,
      adminId: String(currentUser().id || ADMIN_ID),
      telegramInitData: window.Telegram?.WebApp?.initData || "",
    });
  }

  function notify(message, type = "success") {
    const oldToast = document.querySelector(".admin-v2-toast");
    oldToast?.remove();

    const toast = document.createElement("div");
    toast.className = `admin-v2-toast admin-v2-toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 180);
    }, 2200);
  }

  function normalizeUser(user) {
    return {
      id: String(user?.id ?? ""),
      username: String(user?.username || "без_ника"),
      link: String(user?.link || "неизвестно"),
      lastGames: user?.lastGames ?? "[]",
      wowStars: safeNumber(user?.wowStars, 0),
      wsStars: safeNumber(user?.wsStars, 0),
      swLevel: safeNumber(user?.swLevel, 0),
      isBanned: isTrue(user?.isBanned),
    };
  }

  function parseHistory(user) {
    try {
      const parsed = typeof user.lastGames === "string" ? JSON.parse(user.lastGames) : user.lastGames;
      return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 6) : [];
    } catch {
      return [];
    }
  }

  function filteredUsers() {
    const query = state.query.trim().toLowerCase();
    return state.users.filter((user) => {
      if (state.filter === "active" && user.isBanned) return false;
      if (state.filter === "banned" && !user.isBanned) return false;
      if (!query) return true;

      const history = parseHistory(user).join(" ").toLowerCase();
      return user.id.toLowerCase().includes(query)
        || user.username.toLowerCase().includes(query)
        || history.includes(query);
    });
  }

  function stats() {
    const total = state.users.length;
    const banned = state.users.filter((user) => user.isBanned).length;
    const active = total - banned;
    return { total, active, banned };
  }

  function formatLoadedAt() {
    if (!state.loadedAt) return "ещё не обновлялось";
    return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(state.loadedAt);
  }

  function renderShell() {
    const container = document.getElementById("game-container");
    if (!container) return;

    const { total, active, banned } = stats();
    container.innerHTML = `
      <section class="admin-v2 fade-in" aria-label="Админ-панель">
        <header class="admin-v2__header">
          <button type="button" class="admin-v2__icon-btn" data-admin-action="back" aria-label="Вернуться в меню">←</button>
          <div class="admin-v2__heading">
            <div class="admin-v2__eyebrow">ADMIN • Telegram ID ${escapeHTML(currentUser().id || ADMIN_ID)}</div>
            <h2>Управление приложением</h2>
            <p>Обновлено: <span data-admin-loaded-at>${formatLoadedAt()}</span></p>
          </div>
          <button type="button" class="admin-v2__refresh" data-admin-action="refresh" aria-label="Обновить базу">↻ <span>Обновить</span></button>
        </header>

        <div class="admin-v2__stats" aria-label="Статистика пользователей">
          <div class="admin-v2-stat"><span>Всего</span><strong>${total}</strong></div>
          <div class="admin-v2-stat admin-v2-stat--active"><span>Активных</span><strong>${active}</strong></div>
          <div class="admin-v2-stat admin-v2-stat--banned"><span>Заблокировано</span><strong>${banned}</strong></div>
        </div>

        <section class="admin-v2__toolbar">
          <label class="admin-v2__search">
            <span aria-hidden="true">⌕</span>
            <input type="search" data-admin-search placeholder="Поиск по нику, ID или игре" autocomplete="off" />
          </label>
          <div class="admin-v2__filters" role="group" aria-label="Фильтр пользователей">
            <button type="button" data-admin-filter="all" class="is-active">Все</button>
            <button type="button" data-admin-filter="active">Активные</button>
            <button type="button" data-admin-filter="banned">Блок.</button>
          </div>
        </section>

        <details class="admin-v2__broadcast">
          <summary>
            <span><b>Рассылка</b><small>Сообщение всем пользователям</small></span>
            <span aria-hidden="true">＋</span>
          </summary>
          <div class="admin-v2__broadcast-body">
            <textarea data-admin-broadcast maxlength="3500" rows="5" placeholder="Текст сообщения…"></textarea>
            <div class="admin-v2__broadcast-footer">
              <small><span data-admin-char-count>0</span> / 3500</small>
              <button type="button" data-admin-action="broadcast">Отправить всем</button>
            </div>
          </div>
        </details>

        <section class="admin-v2__users-section">
          <div class="admin-v2__list-title">
            <div>
              <b>Пользователи</b>
              <small data-admin-result-count></small>
            </div>
            <div class="admin-v2__pager">
              <button type="button" data-admin-action="prev" aria-label="Предыдущая страница">←</button>
              <span data-admin-page-label>1 / 1</span>
              <button type="button" data-admin-action="next" aria-label="Следующая страница">→</button>
            </div>
          </div>
          <div class="admin-v2__list" data-admin-list></div>
        </section>
      </section>
    `;

    bindShellEvents();
    renderUsers();
  }

  function historyMarkup(user) {
    const history = parseHistory(user);
    if (!history.length) return '<span class="admin-v2__history-empty">История игр пуста</span>';
    return history.map((game) => `<span class="admin-v2__history-chip">${escapeHTML(game)}</span>`).join("");
  }

  function renderUserCard(user) {
    const hasUsername = user.username && user.username !== "без_ника";
    const displayName = hasUsername ? `@${user.username}` : "Без username";
    const chatEnabled = user.link && user.link !== "неизвестно";

    return `
      <article class="admin-v2-user ${user.isBanned ? "is-banned" : ""}" data-admin-user="${escapeHTML(user.id)}">
        <div class="admin-v2-user__head">
          <div class="admin-v2-user__avatar">${escapeHTML((hasUsername ? user.username : user.id).slice(0, 1).toUpperCase() || "?")}</div>
          <div class="admin-v2-user__identity">
            <div class="admin-v2-user__name-row">
              <b>${escapeHTML(displayName)}</b>
              <span class="admin-v2-user__status">${user.isBanned ? "Заблокирован" : "Активен"}</span>
            </div>
            <button type="button" class="admin-v2-user__id" data-copy-id="${escapeHTML(user.id)}" title="Скопировать ID">ID ${escapeHTML(user.id)} <span>⧉</span></button>
          </div>
        </div>

        <div class="admin-v2-user__history" aria-label="Последние игры">${historyMarkup(user)}</div>

        <div class="admin-v2-user__scores">
          <label>
            <span>Библейские слова</span>
            <input type="number" inputmode="numeric" data-score="wowStars" value="${user.wowStars}" />
          </label>
          <label>
            <span>Поиск слов</span>
            <input type="number" inputmode="numeric" data-score="wsStars" value="${user.wsStars}" />
          </label>
          <label>
            <span>Священное слово</span>
            <input type="number" inputmode="numeric" data-score="swLevel" value="${user.swLevel}" />
          </label>
        </div>

        <div class="admin-v2-user__actions">
          <button type="button" class="admin-v2-user__save" data-save-user="${escapeHTML(user.id)}">Сохранить прогресс</button>
          ${chatEnabled
            ? `<a class="admin-v2-user__chat" href="${escapeHTML(user.link)}" target="_blank" rel="noopener">Открыть чат</a>`
            : '<span class="admin-v2-user__chat is-disabled">Чат недоступен</span>'}
          <button type="button" class="admin-v2-user__ban ${user.isBanned ? "is-restore" : ""}" data-toggle-ban="${escapeHTML(user.id)}" data-ban-value="${user.isBanned ? "false" : "true"}">${user.isBanned ? "Разблокировать" : "Заблокировать"}</button>
        </div>
      </article>
    `;
  }

  function renderUsers() {
    const list = document.querySelector("[data-admin-list]");
    const label = document.querySelector("[data-admin-page-label]");
    const resultCount = document.querySelector("[data-admin-result-count]");
    const prev = document.querySelector('[data-admin-action="prev"]');
    const next = document.querySelector('[data-admin-action="next"]');
    if (!list) return;

    const users = filteredUsers();
    const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const pageUsers = users.slice(start, start + PAGE_SIZE);

    if (label) label.textContent = `${state.page} / ${totalPages}`;
    if (resultCount) resultCount.textContent = `Найдено: ${users.length}`;
    if (prev) prev.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= totalPages;

    list.innerHTML = pageUsers.length
      ? pageUsers.map(renderUserCard).join("")
      : '<div class="admin-v2__empty"><b>Ничего не найдено</b><span>Измените поиск или фильтр.</span></div>';
  }

  function setFilter(filter) {
    state.filter = filter;
    state.page = 1;
    document.querySelectorAll("[data-admin-filter]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.adminFilter === filter);
    });
    renderUsers();
  }

  async function copyId(id) {
    try {
      await navigator.clipboard.writeText(String(id));
      notify(`ID ${id} скопирован`);
    } catch {
      const area = document.createElement("textarea");
      area.value = String(id);
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      notify(`ID ${id} скопирован`);
    }
  }

  async function saveProgress(userId, button) {
    const card = document.querySelector(`[data-admin-user="${CSS.escape(String(userId))}"]`);
    const user = state.users.find((item) => item.id === String(userId));
    if (!card || !user) return;

    const values = {
      wowStars: safeNumber(card.querySelector('[data-score="wowStars"]')?.value, user.wowStars),
      wsStars: safeNumber(card.querySelector('[data-score="wsStars"]')?.value, user.wsStars),
      swLevel: safeNumber(card.querySelector('[data-score="swLevel"]')?.value, user.swLevel),
    };

    const changes = [
      ["wowStars", "stars_wow"],
      ["wsStars", "stars_ws"],
      ["swLevel", "stars_sw"],
    ].filter(([key]) => values[key] !== user[key]);

    if (!changes.length) {
      notify("Изменений нет", "neutral");
      return;
    }

    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Сохраняю…";

    try {
      for (const [key, type] of changes) {
        const response = await adminApi({
          action: "updateUser",
          updateData: { targetId: userId, type, value: values[key] },
        });
        if (!response) throw new Error(`Не удалось обновить ${key}`);
        user[key] = values[key];
      }
      notify("Прогресс сохранён");
      button.textContent = "Сохранено ✓";
      setTimeout(() => { if (button.isConnected) button.textContent = original; }, 1200);
    } catch (error) {
      console.error(error);
      notify("Не удалось сохранить прогресс", "error");
      button.textContent = original;
    } finally {
      button.disabled = false;
    }
  }

  async function toggleBan(userId, banStatus, button) {
    const user = state.users.find((item) => item.id === String(userId));
    if (!user) return;

    const actionText = banStatus ? "заблокировать" : "разблокировать";
    const label = user.username && user.username !== "без_ника" ? `@${user.username}` : `ID ${user.id}`;
    if (!window.confirm(`Вы уверены, что хотите ${actionText} ${label}?`)) return;

    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Подождите…";

    try {
      const response = await adminApi({
        action: "updateUser",
        updateData: { targetId: userId, type: "ban", value: banStatus },
      });
      if (!response) throw new Error("Ошибка изменения блокировки");
      user.isBanned = Boolean(banStatus);
      renderShell();
      setFilter(state.filter);
      notify(banStatus ? "Пользователь заблокирован" : "Пользователь разблокирован");
    } catch (error) {
      console.error(error);
      notify("Не удалось изменить блокировку", "error");
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function sendBroadcast(button) {
    const textarea = document.querySelector("[data-admin-broadcast]");
    const text = textarea?.value.trim() || "";
    if (!text) {
      notify("Введите текст сообщения", "error");
      textarea?.focus();
      return;
    }
    if (!window.confirm("Отправить это сообщение всем пользователям?")) return;

    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Отправляю…";
    try {
      const response = await adminApi({ action: "broadcast", text });
      if (!response?.success) throw new Error("Рассылка не выполнена");
      textarea.value = "";
      const count = document.querySelector("[data-admin-char-count]");
      if (count) count.textContent = "0";
      notify(`Доставлено: ${safeNumber(response.delivered)} • ошибок: ${safeNumber(response.failed)}`);
    } catch (error) {
      console.error(error);
      notify("Не удалось отправить рассылку", "error");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function bindShellEvents() {
    document.querySelector('[data-admin-action="back"]')?.addEventListener("click", () => window.goToMainMenu?.());
    document.querySelector('[data-admin-action="refresh"]')?.addEventListener("click", () => loadAdminData({ refresh: true }));

    const search = document.querySelector("[data-admin-search]");
    search?.addEventListener("input", () => {
      state.query = search.value;
      state.page = 1;
      renderUsers();
    });

    document.querySelectorAll("[data-admin-filter]").forEach((button) => {
      button.addEventListener("click", () => setFilter(button.dataset.adminFilter || "all"));
    });

    document.querySelector('[data-admin-action="prev"]')?.addEventListener("click", () => {
      state.page = Math.max(1, state.page - 1);
      renderUsers();
    });
    document.querySelector('[data-admin-action="next"]')?.addEventListener("click", () => {
      state.page += 1;
      renderUsers();
    });

    const broadcast = document.querySelector("[data-admin-broadcast]");
    broadcast?.addEventListener("input", () => {
      const count = document.querySelector("[data-admin-char-count]");
      if (count) count.textContent = String(broadcast.value.length);
    });
    document.querySelector('[data-admin-action="broadcast"]')?.addEventListener("click", (event) => sendBroadcast(event.currentTarget));

    document.querySelector("[data-admin-list]")?.addEventListener("click", (event) => {
      const copyButton = event.target.closest("[data-copy-id]");
      if (copyButton) {
        copyId(copyButton.dataset.copyId);
        return;
      }

      const saveButton = event.target.closest("[data-save-user]");
      if (saveButton) {
        saveProgress(saveButton.dataset.saveUser, saveButton);
        return;
      }

      const banButton = event.target.closest("[data-toggle-ban]");
      if (banButton) {
        toggleBan(banButton.dataset.toggleBan, banButton.dataset.banValue === "true", banButton);
      }
    });
  }

  async function loadAdminData({ refresh = false } = {}) {
    if (state.loading) return;
    if (!isAdmin()) {
      notify("Админ-панель доступна только указанному Telegram ID", "error");
      return;
    }

    const container = document.getElementById("game-container");
    if (!container) return;

    state.loading = true;
    const refreshButton = document.querySelector('[data-admin-action="refresh"]');
    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.classList.add("is-loading");
    }

    if (!refresh || !state.users.length) {
      container.innerHTML = `
        <section class="admin-v2-loading fade-in">
          <div class="app-loader__ring"></div>
          <b>Загружаю пользователей…</b>
          <span>Получаем данные из Apps Script</span>
        </section>
      `;
    }

    try {
      const response = await adminApi({ action: "getAdminData" });
      if (!response || !Array.isArray(response.users)) throw new Error("Некорректный ответ Apps Script");
      state.users = response.users.map(normalizeUser);
      state.loadedAt = new Date();
      state.page = 1;
      renderShell();
      setFilter(state.filter);
      if (refresh) notify("База пользователей обновлена");
    } catch (error) {
      console.error("Admin panel:", error);
      if (state.users.length) {
        renderShell();
        notify("Не удалось обновить базу", "error");
      } else {
        container.innerHTML = `
          <section class="admin-v2-error fade-in">
            <div class="admin-v2-error__icon">!</div>
            <h2>Не удалось открыть админ-панель</h2>
            <p>Telegram ID определён как администратор, но Apps Script не вернул список пользователей.</p>
            <div>
              <button type="button" data-admin-retry>Повторить</button>
              <button type="button" data-admin-back>В меню</button>
            </div>
          </section>
        `;
        container.querySelector("[data-admin-retry]")?.addEventListener("click", () => loadAdminData());
        container.querySelector("[data-admin-back]")?.addEventListener("click", () => window.goToMainMenu?.());
      }
    } finally {
      state.loading = false;
    }
  }

  async function openAdminPanelV2() {
    if (!isAdmin()) {
      notify("Не удалось подтвердить Telegram ID администратора", "error");
      return;
    }

    const menu = document.getElementById("menu-container");
    if (menu) menu.classList.add("hidden");
    document.body.dataset.mode = "admin";
    window.scrollTo({ top: 0, behavior: "auto" });
    await loadAdminData();
  }

  function enhanceAdminButton() {
    const button = document.getElementById("admin-btn");
    if (!button || button.dataset.adminV2 === "1") return Boolean(button);
    if (!isAdmin()) return false;

    const upgraded = button.cloneNode(true);
    upgraded.dataset.adminV2 = "1";
    const description = upgraded.querySelector(".game-card__desc");
    if (description) description.textContent = "Пользователи, прогресс, блокировки и рассылка";
    upgraded.addEventListener("click", openAdminPanelV2);
    button.replaceWith(upgraded);
    return true;
  }

  async function boot() {
    delegatedAdmin = await resolveAdminRole();
    enhanceAdminButton();

    const observer = new MutationObserver(() => {
      if (enhanceAdminButton()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 6000);
  }

  window.openAdminPanelV2 = openAdminPanelV2;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
