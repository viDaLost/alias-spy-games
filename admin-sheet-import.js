(() => {
  const STORAGE_KEY = 'admin_google_sheet_url_v1';
  let scheduled = null;

  function ensurePanel() {
    const adminPage = document.querySelector('.admin-v2, .admin-page');
    if (!adminPage || document.getElementById('admin-sheet-import')) return;

    injectStyles();
    const panel = document.createElement('details');
    panel.id = 'admin-sheet-import';
    panel.className = 'admin-sheet-import';
    panel.innerHTML = `
      <summary>
        <span>Импорт пользователей из Google Sheets</span>
        <small>Восстановить username, ссылки и прогресс без потери новых данных</small>
      </summary>
      <div class="admin-sheet-import__body">
        <label>
          <span>Ссылка на таблицу</span>
          <input id="admin-sheet-url" type="url" inputmode="url" autocomplete="off" placeholder="https://docs.google.com/spreadsheets/d/…" />
        </label>
        <p>Cloudflare прочитает таблицу напрямую. Дубликаты будут объединены, некорректные строки пропущены, а более свежие блокировки и прогресс не будут уменьшены.</p>
        <button id="admin-sheet-import-btn" type="button">Импортировать в Cloudflare</button>
        <div id="admin-sheet-import-result" class="admin-sheet-import__result" aria-live="polite"></div>
      </div>
    `;

    const anchor = adminPage.querySelector('.admin-v2__users-section') || adminPage.querySelector('.admin-tools');
    if (anchor) anchor.before(panel); else adminPage.append(panel);

    const input = panel.querySelector('#admin-sheet-url');
    try { input.value = localStorage.getItem(STORAGE_KEY) || ''; } catch {}
    panel.querySelector('#admin-sheet-import-btn')?.addEventListener('click', runImport);
  }

  async function runImport() {
    const input = document.getElementById('admin-sheet-url');
    const button = document.getElementById('admin-sheet-import-btn');
    const result = document.getElementById('admin-sheet-import-result');
    const sheetUrl = String(input?.value || '').trim();

    if (!/docs\.google\.com\/spreadsheets\/d\//i.test(sheetUrl)) {
      setResult(result, 'Введите корректную ссылку Google Sheets.', true);
      return;
    }

    if (!confirm('Импортировать пользователей из этой таблицы в Cloudflare? Текущие более свежие данные не будут уменьшены.')) return;

    try { localStorage.setItem(STORAGE_KEY, sheetUrl); } catch {}
    if (button) { button.disabled = true; button.textContent = 'Импортируем…'; }
    setResult(result, 'Cloudflare читает и проверяет таблицу…');

    try {
      const core = String(document.querySelector('meta[name="app-core-backend"]')?.content || '').replace(/\/+$/, '');
      const telegramInitData = String(window.Telegram?.WebApp?.initData || '');
      if (!core || !telegramInitData) throw new Error('Откройте админ-панель внутри Telegram.');

      const response = await fetch(`${core}/compat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: { action: 'importGoogleSheet', sheetUrl }, telegramInitData }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) throw new Error(data?.error || `HTTP ${response.status}`);

      const parts = [
        `Готово: ${Number(data.validUsers || 0)} пользователей`,
        data.newUsers ? `новых: ${Number(data.newUsers)}` : '',
        data.repairedUsernames ? `username восстановлено: ${Number(data.repairedUsernames)}` : '',
        data.repairedLinks ? `ссылок восстановлено: ${Number(data.repairedLinks)}` : '',
        data.duplicatesMerged ? `дубликатов объединено: ${Number(data.duplicatesMerged)}` : '',
        data.invalidRowsSkipped ? `пропущено строк: ${Number(data.invalidRowsSkipped)}` : '',
      ].filter(Boolean);
      setResult(result, parts.join(' · '));

      if (typeof window.openAdminPanel === 'function') {
        setTimeout(() => window.openAdminPanel(), 900);
      }
    } catch (error) {
      setResult(result, String(error?.message || 'Не удалось импортировать таблицу.'), true);
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Импортировать в Cloudflare'; }
    }
  }

  function setResult(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', Boolean(isError));
  }

  function injectStyles() {
    if (document.getElementById('admin-sheet-import-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-sheet-import-style';
    style.textContent = `
      .admin-sheet-import{margin:0 0 14px;border:1px solid rgba(99,102,241,.13);border-radius:20px;background:rgba(255,255,255,.82);overflow:hidden}
      .admin-sheet-import summary{cursor:pointer;padding:13px 14px;display:grid;gap:3px;color:#312e81;font-weight:850;list-style:none}.admin-sheet-import summary::-webkit-details-marker{display:none}.admin-sheet-import summary small{color:#64748b;font-size:.68rem;font-weight:700}
      .admin-sheet-import__body{padding:0 14px 14px;display:grid;gap:10px}.admin-sheet-import__body label{display:grid;gap:5px;color:#475569;font-size:.72rem;font-weight:800}.admin-sheet-import__body input{width:100%;box-sizing:border-box;border:1px solid #dbe2f0;border-radius:13px;padding:11px 12px;background:#fff;font:inherit;color:#111827;min-height:44px}.admin-sheet-import__body p{margin:0;color:#64748b;font-size:.68rem;line-height:1.4;font-weight:650}
      .admin-sheet-import__body button{min-height:46px;border:0;border-radius:14px;background:linear-gradient(135deg,#4f46e5,#2563eb);color:#fff;font:inherit;font-weight:850;padding:11px 14px}.admin-sheet-import__body button:disabled{opacity:.6}.admin-sheet-import__result{min-height:0;color:#166534;font-size:.72rem;line-height:1.4;font-weight:800}.admin-sheet-import__result.is-error{color:#b91c1c}
    `;
    document.head.appendChild(style);
  }

  const observer = new MutationObserver(() => {
    clearTimeout(scheduled);
    scheduled = setTimeout(ensurePanel, 80);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });
  ensurePanel();
})();
