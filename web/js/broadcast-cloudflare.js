(() => {
  const ACTIVE_DAYS = 30;
  let usersCache = [];
  let pollTimer = null;

  const escapeHTML = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function fmtTime(ms) {
    if (!ms) return '—';
    try { return new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
  }

  function statusLabel(status) {
    return ({ queued: 'В очереди', sending: 'Отправляется', done: 'Завершена', cancelled: 'Отменена' })[status] || status;
  }

  function kindLabel(kind) {
    return ({ text: 'Текст', photo: 'Фото', document: 'Файл' })[kind] || kind;
  }

  async function api(action, payload = {}) {
    if (typeof window.apiRequest !== 'function') throw new Error('API недоступен');
    const result = await window.apiRequest({ action, adminId: '1288379477', ...payload });
    if (!result || result.success === false || result.ok === false) throw new Error(result?.error || 'Не удалось выполнить запрос');
    return result;
  }

  async function loadUsers() {
    try {
      const data = await api('getAdminData');
      usersCache = Array.isArray(data.users) ? data.users : [];
    } catch {
      usersCache = [];
    }
    renderSelectedUsers();
  }

  function markup() {
    return `
      <summary>
        <span>Рассылка</span>
        <small>Текст, фото и файлы через Cloudflare</small>
      </summary>
      <div class="admin-broadcast__body broadcast-v2">
        <div class="broadcast-v2__row broadcast-v2__row--3">
          <label>Тип
            <select id="bc-kind">
              <option value="text">Сообщение</option>
              <option value="photo">Фото + подпись</option>
              <option value="document">Файл + подпись</option>
            </select>
          </label>
          <label>Получатели
            <select id="bc-audience">
              <option value="all">Все незаблокированные</option>
              <option value="active">Активные за ${ACTIVE_DAYS} дней</option>
              <option value="selected">Выбранные пользователи</option>
            </select>
          </label>
          <label class="broadcast-v2__switch"><input id="bc-silent" type="checkbox" /> <span>Без звука</span></label>
        </div>

        <div id="bc-selected-wrap" class="broadcast-v2__selected hidden">
          <div class="broadcast-v2__selected-head">
            <b>Выберите пользователей</b>
            <input id="bc-user-search" type="search" placeholder="Поиск по username или ID" />
          </div>
          <div id="bc-user-list" class="broadcast-v2__user-list"><span>Загрузка...</span></div>
        </div>

        <label class="broadcast-v2__message">
          <span id="bc-message-label">Сообщение</span>
          <textarea id="broadcast-text" rows="5" maxlength="4096" placeholder="Введите текст сообщения"></textarea>
          <small id="bc-counter">0 / 4096</small>
        </label>

        <div id="bc-media-wrap" class="broadcast-v2__media hidden">
          <label class="broadcast-v2__upload">
            <input id="bc-file" type="file" />
            <span id="bc-upload-label">Выбрать файл</span>
          </label>
          <div id="bc-file-info" class="broadcast-v2__file-info hidden"></div>
        </div>

        <div class="broadcast-v2__options">
          <label><input id="bc-html" type="checkbox" /> Разрешить HTML-разметку Telegram</label>
          <details>
            <summary>Кнопки под сообщением</summary>
            <div class="broadcast-v2__button-fields">
              <div class="broadcast-v2__button-row">
                <b>Кнопка 1</b>
                <input id="bc-button-text" maxlength="64" placeholder="Текст, например: Открыть приложение" />
                <input id="bc-button-url" inputmode="url" placeholder="https://..." />
              </div>
              <div class="broadcast-v2__button-row">
                <b>Кнопка 2</b>
                <input id="bc-button2-text" maxlength="64" placeholder="Текст, например: Читать канал" />
                <input id="bc-button2-url" inputmode="url" placeholder="https://..." />
              </div>
              <label class="broadcast-v2__button-layout">Расположение
                <select id="bc-buttons-layout">
                  <option value="row">Рядом, в одну строку</option>
                  <option value="stack">Друг под другом</option>
                </select>
              </label>
              <div class="broadcast-v2__button-emoji">
                <span>Значок в начало текста:</span>
                <button type="button" data-bc-emoji="🎮">🎮</button>
                <button type="button" data-bc-emoji="📖">📖</button>
                <button type="button" data-bc-emoji="✨">✨</button>
                <button type="button" data-bc-emoji="▶️">▶️</button>
                <button type="button" data-bc-emoji="🎁">🎁</button>
              </div>
              <small class="broadcast-v2__button-note">
                Цвет кнопок задать нельзя: Telegram рисует их в теме получателя и
                поля цвета в его API нет. Выделить кнопку можно значком в начале
                текста — так делают в каналах.
              </small>
            </div>
          </details>
        </div>

        <div class="broadcast-v2__preview">
          <small>Предпросмотр</small>
          <div id="bc-preview" class="broadcast-v2__preview-card">Введите сообщение или выберите файл</div>
        </div>

        <button id="broadcast-btn" class="broadcast-v2__send" type="button">Начать рассылку</button>
        <div id="bc-error" class="broadcast-v2__error hidden"></div>

        <section id="bc-progress" class="broadcast-v2__progress hidden" aria-live="polite"></section>

        <section class="broadcast-v2__history">
          <div class="broadcast-v2__history-head">
            <b>Последние рассылки</b>
            <button id="bc-history-refresh" type="button">Обновить</button>
          </div>
          <div id="bc-history-list" class="broadcast-v2__history-list"><span>Загрузка...</span></div>
        </section>
      </div>
    `;
  }

  function hydrate(root) {
    if (!root || root.dataset.broadcastV2 === '1') return;
    root.dataset.broadcastV2 = '1';
    root.innerHTML = markup();

    const kind = root.querySelector('#bc-kind');
    const audience = root.querySelector('#bc-audience');
    const text = root.querySelector('#broadcast-text');
    const file = root.querySelector('#bc-file');
    const search = root.querySelector('#bc-user-search');

    kind?.addEventListener('change', () => { updateMode(); updatePreview(); });
    audience?.addEventListener('change', () => {
      root.querySelector('#bc-selected-wrap')?.classList.toggle('hidden', audience.value !== 'selected');
    });
    text?.addEventListener('input', () => { updateCounter(); updatePreview(); });
    file?.addEventListener('change', () => { updateFileInfo(); updatePreview(); });
    search?.addEventListener('input', renderSelectedUsers);
    for (const id of ['#bc-button-text', '#bc-button-url', '#bc-button2-text', '#bc-button2-url']) {
      root.querySelector(id)?.addEventListener('input', updatePreview);
    }
    root.querySelector('#bc-buttons-layout')?.addEventListener('change', updatePreview);
    // Значок подставляется в то поле текста, где стоял курсор, а по умолчанию — в первое.
    root.querySelector('.broadcast-v2__button-emoji')?.addEventListener('click', (event) => {
      const emoji = event.target?.dataset?.bcEmoji;
      if (!emoji) return;
      const active = document.activeElement;
      const target = active?.id === 'bc-button2-text' ? active : root.querySelector('#bc-button-text');
      if (!target) return;
      target.value = `${emoji} ${target.value.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '')}`.trim().slice(0, 64);
      target.focus();
      updatePreview();
    });
    root.querySelector('#broadcast-btn')?.addEventListener('click', submitBroadcast);
    root.querySelector('#bc-history-refresh')?.addEventListener('click', loadHistory);
    root.querySelector('#bc-history-list')?.addEventListener('click', onHistoryClick);
    root.querySelector('#bc-progress')?.addEventListener('click', onProgressClick);

    updateMode();
    updateCounter();
    updatePreview();
    loadUsers();
    loadHistory();
  }

  function root() { return document.querySelector('.admin-broadcast[data-broadcast-v2="1"]'); }

  function updateMode() {
    const r = root(); if (!r) return;
    const kind = r.querySelector('#bc-kind')?.value || 'text';
    const media = r.querySelector('#bc-media-wrap');
    const file = r.querySelector('#bc-file');
    const text = r.querySelector('#broadcast-text');
    const label = r.querySelector('#bc-message-label');
    media?.classList.toggle('hidden', kind === 'text');
    if (file) file.accept = kind === 'photo' ? 'image/*' : '';
    if (label) label.textContent = kind === 'text' ? 'Сообщение' : 'Подпись к вложению';
    if (text) text.maxLength = kind === 'text' ? 4096 : 1024;
    updateCounter();
  }

  function updateCounter() {
    const r = root(); if (!r) return;
    const text = r.querySelector('#broadcast-text');
    const counter = r.querySelector('#bc-counter');
    if (counter && text) counter.textContent = `${text.value.length} / ${text.maxLength}`;
  }

  function updateFileInfo() {
    const r = root(); if (!r) return;
    const file = r.querySelector('#bc-file')?.files?.[0];
    const info = r.querySelector('#bc-file-info');
    if (!info) return;
    if (!file) { info.classList.add('hidden'); info.textContent = ''; return; }
    info.classList.remove('hidden');
    info.textContent = `${file.name} • ${(file.size / 1024 / 1024).toFixed(file.size > 1024 * 1024 ? 1 : 2)} МБ`;
  }

  function previewButtons() {
    const { items, layout } = buttonsConfig();
    const ready = items.filter((item) => item.text && item.url);
    if (!ready.length) return '';
    const cells = ready.map((item) => `<span class="broadcast-v2__preview-button">${escapeHTML(item.text)}</span>`);
    const rows = ready.length === 2 && layout === 'stack' ? cells.map((cell) => `<div>${cell}</div>`) : [`<div>${cells.join('')}</div>`];
    return `<div class="broadcast-v2__preview-buttons">${rows.join('')}</div>`;
  }

  function updatePreview() {
    const r = root(); if (!r) return;
    const kind = r.querySelector('#bc-kind')?.value || 'text';
    const text = r.querySelector('#broadcast-text')?.value || '';
    const file = r.querySelector('#bc-file')?.files?.[0];
    const preview = r.querySelector('#bc-preview');
    if (!preview) return;
    const media = kind === 'photo' ? '🖼️ Фото' : kind === 'document' ? `📎 ${escapeHTML(file?.name || 'Файл')}` : '';
    const body = `${media ? `<b>${media}</b>` : ''}${text ? `<p>${escapeHTML(text).replace(/\n/g, '<br>')}</p>` : ''}${previewButtons()}`;
    preview.innerHTML = body || 'Введите сообщение или выберите файл';
  }

  /** Кнопки в порядке полей; пустые пары просто пропускаются. */
  function buttonsConfig() {
    const r = root();
    const pairs = [
      [r?.querySelector('#bc-button-text'), r?.querySelector('#bc-button-url')],
      [r?.querySelector('#bc-button2-text'), r?.querySelector('#bc-button2-url')],
    ];
    const items = [];
    for (const [textNode, urlNode] of pairs) {
      const text = textNode?.value.trim() || '';
      const url = urlNode?.value.trim() || '';
      if (!text && !url) continue;
      items.push({ text, url });
    }
    return { items, layout: r?.querySelector('#bc-buttons-layout')?.value === 'stack' ? 'stack' : 'row' };
  }

  function selectedIds() {
    return [...(root()?.querySelectorAll('#bc-user-list input[type="checkbox"]:checked') || [])].map((el) => el.value);
  }

  function renderSelectedUsers() {
    const r = root(); if (!r) return;
    const list = r.querySelector('#bc-user-list');
    if (!list) return;
    const q = (r.querySelector('#bc-user-search')?.value || '').trim().toLowerCase();
    const checked = new Set(selectedIds());
    const filtered = usersCache.filter((u) => !u.isBanned).filter((u) => {
      if (!q) return true;
      return String(u.id || '').includes(q) || String(u.username || '').toLowerCase().includes(q);
    });
    if (!filtered.length) { list.innerHTML = '<span>Пользователи не найдены</span>'; return; }
    list.innerHTML = filtered.map((u) => {
      const id = String(u.id || '');
      const name = u.username && u.username !== 'без_ника' ? `@${u.username}` : `ID ${id}`;
      return `<label><input type="checkbox" value="${escapeHTML(id)}" ${checked.has(id) ? 'checked' : ''}/><span><b>${escapeHTML(name)}</b><small>${escapeHTML(id)}</small></span></label>`;
    }).join('');
  }

  const UPLOAD_TIMEOUT_MS = 90_000;

  /**
   * Загрузка вложения. Мобильная сеть рвёт длинные запросы, а браузер сообщает
   * об этом одной строкой вроде «Load failed» — раньше она и уезжала админу в
   * красную плашку. Теперь запрос ограничен по времени, один раз повторяется и
   * объясняет, что именно случилось.
   */
  async function uploadMedia(file, kind) {
    const backend = String(window.AppCoreBridge?.backend || '').replace(/\/+$/, '');
    const initData = String(window.Telegram?.WebApp?.initData || '');
    if (!backend || !initData) throw new Error('Загрузка вложений доступна только администратору в Telegram Mini App');
    const max = kind === 'photo' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > max) throw new Error(kind === 'photo' ? 'Фото должно быть не больше 10 МБ' : 'Файл должен быть не больше 50 МБ');

    let lastNetworkError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const form = new FormData();
      form.append('telegramInitData', initData);
      form.append('kind', kind);
      form.append('file', file, file.name);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(`${backend}/broadcast/upload`, {
          method: 'POST', body: form, cache: 'no-store', signal: controller.signal,
        });
      } catch (error) {
        // Сюда попадают обрыв связи, таймаут и отказ по CORS — всё то, о чём
        // браузер не говорит ничего внятного.
        lastNetworkError = error;
        continue;
      } finally {
        clearTimeout(timer);
      }

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success !== false) return data;
      // Сервер ответил — повторять незачем, он объяснил причину.
      throw new Error(data.error || `Сервер отклонил вложение (код ${response.status})`);
    }

    const aborted = lastNetworkError?.name === 'AbortError';
    throw new Error(aborted
      ? `Загрузка вложения не уложилась в ${Math.round(UPLOAD_TIMEOUT_MS / 1000)} секунд. Попробуйте файл поменьше или сеть получше`
      : 'Не удалось связаться с сервером для загрузки вложения. Проверьте связь и попробуйте ещё раз');
  }

  async function submitBroadcast() {
    const r = root(); if (!r) return;
    const btn = r.querySelector('#broadcast-btn');
    const error = r.querySelector('#bc-error');
    const kind = r.querySelector('#bc-kind')?.value || 'text';
    const text = r.querySelector('#broadcast-text')?.value.trim() || '';
    const audience = r.querySelector('#bc-audience')?.value || 'all';
    const file = r.querySelector('#bc-file')?.files?.[0];
    const buttons = buttonsConfig();

    error?.classList.add('hidden');
    if (kind === 'text' && !text) return showError('Введите текст сообщения');
    if (kind !== 'text' && !file) return showError('Выберите вложение');
    if (audience === 'selected' && !selectedIds().length) return showError('Выберите хотя бы одного пользователя');
    for (const [index, item] of buttons.items.entries()) {
      if (!item.text || !item.url) return showError(`Заполните и текст, и ссылку у кнопки ${index + 1}`);
      if (!/^https:\/\//i.test(item.url) && !/^tg:\/\//i.test(item.url)) {
        return showError(`Ссылка кнопки ${index + 1} должна начинаться с https:// или tg://`);
      }
    }

    if (!confirm('Начать рассылку? Отправка будет выполняться в фоне, страницу можно закрыть.')) return;

    if (btn) { btn.disabled = true; btn.textContent = kind === 'text' ? 'Создаём рассылку...' : 'Загружаем вложение...'; }
    try {
      let media = null;
      if (kind !== 'text') media = await uploadMedia(file, kind);
      const config = {
        kind,
        text,
        mediaFileId: media?.fileId || '',
        mediaName: media?.name || '',
        audience,
        selectedIds: audience === 'selected' ? selectedIds() : [],
        silent: Boolean(r.querySelector('#bc-silent')?.checked),
        html: Boolean(r.querySelector('#bc-html')?.checked),
        buttons: buttons.items,
        buttonsLayout: buttons.layout,
      };
      if (btn) btn.textContent = 'Запускаем...';
      const result = await api('broadcastCreate', { config });
      renderProgress(result.job);
      startPolling(result.job.id);
      await loadHistory();
      if (typeof window.showToast === 'function') window.showToast('Рассылка запущена');
    } catch (e) {
      showError(humanError(e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Начать рассылку'; }
    }
  }

  /**
   * Сообщения вроде «Load failed» или «NetworkError» приходят от браузера и
   * администратору ничего не объясняют.
   */
  function humanError(error) {
    const message = String(error?.message || '').trim();
    if (!message) return 'Не удалось начать рассылку';
    if (error?.name === 'AbortError') return 'Запрос слишком долго не отвечал. Попробуйте ещё раз';
    if (/^(load failed|failed to fetch|networkerror|network error)/i.test(message)) {
      return 'Нет связи с сервером рассылки. Проверьте интернет и попробуйте ещё раз';
    }
    return message;
  }

  function showError(message) {
    const el = root()?.querySelector('#bc-error');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
  }

  // Telegram отвечает по-английски и по-своему. Чаще всего это не поломка
  // рассылки, а получатель, до которого бот дотянуться не может.
  const FAILURE_REASONS = [
    [/chat not found/i, 'не начинали диалог с ботом'],
    [/bot was blocked by the user/i, 'заблокировали бота'],
    [/user is deactivated/i, 'аккаунт удалён'],
    [/bot can'?t initiate conversation/i, 'не начинали диалог с ботом'],
    [/chat_write_forbidden|not enough rights/i, 'бот не может писать в этот чат'],
    [/too many requests|retry after/i, 'Telegram придержал отправку'],
    [/user_is_bot/i, 'это бот, а не человек'],
  ];

  function failureReason(message) {
    const text = String(message || '').trim();
    if (!text) return 'причина неизвестна';
    for (const [pattern, label] of FAILURE_REASONS) if (pattern.test(text)) return label;
    return text;
  }

  function renderBreakdown(job) {
    const rows = Array.isArray(job?.errorBreakdown) ? job.errorBreakdown : [];
    if (!rows.length) return job?.lastError ? `<small>${escapeHTML(failureReason(job.lastError))}</small>` : '';
    const merged = new Map();
    for (const row of rows) {
      const label = failureReason(row.error);
      merged.set(label, (merged.get(label) || 0) + Number(row.count || 0));
    }
    const items = [...merged.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => `<li><span>${escapeHTML(label)}</span><b>${count}</b></li>`)
      .join('');
    return `<ul class="broadcast-v2__reasons">${items}</ul>`;
  }

  function renderProgress(job) {
    const el = root()?.querySelector('#bc-progress'); if (!el || !job) return;
    const total = Number(job.total || 0);
    const sent = Number(job.sent || 0);
    const failed = Number(job.failed || 0);
    const done = sent + failed;
    const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="broadcast-v2__progress-head"><b>${statusLabel(job.status)}</b><span>${done} / ${total}</span></div>
      <div class="broadcast-v2__bar"><i style="width:${pct}%"></i></div>
      <div class="broadcast-v2__stats"><span>✅ Доставлено: ${sent}</span><span>⚠️ Ошибок: ${failed}</span></div>
      ${failed ? renderBreakdown(job) : ''}
      ${['queued','sending'].includes(job.status) ? `<button type="button" data-cancel-job="${escapeHTML(job.id)}">Остановить</button>` : ''}
    `;
  }

  async function onProgressClick(event) {
    const id = event.target?.dataset?.cancelJob; if (!id) return;
    if (!confirm('Остановить оставшуюся рассылку? Уже отправленные сообщения останутся у пользователей.')) return;
    try { const res = await api('broadcastCancel', { jobId: id }); renderProgress(res.job); await loadHistory(); }
    catch (e) { showError(e.message); }
  }

  function startPolling(jobId) {
    if (pollTimer) clearInterval(pollTimer);
    const tick = async () => {
      try {
        const res = await api('broadcastStatus', { jobId });
        renderProgress(res.job);
        if (!['queued','sending'].includes(res.job?.status)) {
          clearInterval(pollTimer); pollTimer = null; await loadHistory();
        }
      } catch {}
    };
    tick();
    pollTimer = setInterval(tick, 1800);
  }

  async function loadHistory() {
    const list = root()?.querySelector('#bc-history-list'); if (!list) return;
    try {
      const res = await api('broadcastHistory');
      const jobs = Array.isArray(res.jobs) ? res.jobs : [];
      if (!jobs.length) { list.innerHTML = '<span>Рассылок пока нет</span>'; return; }
      list.innerHTML = jobs.map((job) => {
        const done = Number(job.sent || 0) + Number(job.failed || 0);
        const preview = job.text || job.mediaName || kindLabel(job.kind);
        return `<article class="broadcast-v2__history-item">
          <div><b>${kindLabel(job.kind)} · ${statusLabel(job.status)}</b><small>${fmtTime(job.createdAt)} · ${done}/${job.total} · ошибок ${job.failed}</small><p>${escapeHTML(preview).slice(0, 120)}</p></div>
          <button type="button" data-repeat-job="${escapeHTML(job.id)}">Повторить</button>
        </article>`;
      }).join('');
      const active = jobs.find((job) => ['queued','sending'].includes(job.status));
      if (active) { renderProgress(active); startPolling(active.id); }
    } catch (e) {
      list.innerHTML = `<span>${escapeHTML(e.message || 'Не удалось загрузить историю')}</span>`;
    }
  }

  async function onHistoryClick(event) {
    const id = event.target?.dataset?.repeatJob; if (!id) return;
    if (!confirm('Повторить эту рассылку? Получатели будут рассчитаны заново по тем же настройкам.')) return;
    event.target.disabled = true;
    try {
      const res = await api('broadcastRepeat', { jobId: id });
      renderProgress(res.job); startPolling(res.job.id); await loadHistory();
    } catch (e) { showError(e.message); }
    finally { event.target.disabled = false; }
  }

  const observer = new MutationObserver(() => {
    const panel = document.querySelector('.admin-broadcast');
    if (panel) hydrate(panel);
    else if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const existing = document.querySelector('.admin-broadcast');
  if (existing) hydrate(existing);
})();
