(() => {
  if (window.__QUARTET_CHAT_ADDON__) return;
  window.__QUARTET_CHAT_ADDON__ = true;

  const backend = String(document.querySelector('meta[name="quartet-backend"]')?.content || '').replace(/\/+$/, '');
  if (!backend) return;

  let roomId = '';
  let token = '';
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let messages = [];
  let drawerOpen = false;
  let connecting = false;
  let observerTimer = null;

  injectStyle();

  function injectStyle() {
    if (document.getElementById('quartet-chat-addon-style')) return;
    const style = document.createElement('style');
    style.id = 'quartet-chat-addon-style';
    style.textContent = `
      .qchat-fab{position:fixed;right:max(12px,env(safe-area-inset-right));bottom:calc(14px + env(safe-area-inset-bottom));z-index:1030;border:0;border-radius:999px;background:linear-gradient(135deg,#4f46e5,#2563eb);color:#fff;min-height:44px;padding:9px 14px;display:flex;align-items:center;gap:7px;font-size:.76rem;font-weight:900;box-shadow:0 12px 30px rgba(37,99,235,.28);touch-action:manipulation}.qchat-fab[hidden]{display:none}.qchat-badge{display:none;min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:#fbbf24;color:#713f12;font-size:.6rem;align-items:center;justify-content:center}.qchat-badge.is-visible{display:inline-flex}
      .qchat-drawer{position:fixed;inset:auto max(8px,env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));z-index:1040;max-width:520px;margin-left:auto;border-radius:24px;background:rgba(255,255,255,.97);border:1px solid rgba(99,102,241,.12);box-shadow:0 28px 80px rgba(15,23,42,.24);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);transform:translateY(calc(100% + 35px));opacity:0;pointer-events:none;transition:transform .24s cubic-bezier(.2,.8,.2,1),opacity .18s}.qchat-drawer.is-open{transform:translateY(0);opacity:1;pointer-events:auto}.qchat-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 12px 8px}.qchat-head div{min-width:0}.qchat-head b{display:block;color:#312e81;font-size:.92rem}.qchat-head small{display:block;color:#64748b;font-size:.62rem;font-weight:750;margin-top:2px}.qchat-close{width:36px;height:36px;border:0;border-radius:12px;background:#eef2ff;color:#4338ca;font-size:18px;font-weight:900}.qchat-list{height:min(46vh,350px);overflow:auto;display:flex;flex-direction:column;gap:7px;padding:6px 12px 10px;overscroll-behavior:contain}.qchat-empty{text-align:center;color:#94a3b8;font-size:.72rem;font-weight:750;padding:28px 8px}.qchat-message{align-self:flex-start;max-width:86%;padding:8px 10px;border-radius:14px 14px 14px 4px;background:#f1f5f9;color:#334155;font-size:.75rem;line-height:1.35;overflow-wrap:anywhere}.qchat-message.is-me{align-self:flex-end;border-radius:14px 14px 4px 14px;background:#eef2ff;color:#3730a3}.qchat-message b{display:block;color:#64748b;font-size:.61rem;margin-bottom:2px}.qchat-message time{display:block;color:#94a3b8;font-size:.53rem;margin-top:3px}.qchat-form{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:7px;padding:8px 12px 12px;border-top:1px solid rgba(99,102,241,.08)}.qchat-input{min-width:0;width:100%;height:44px;border:1px solid rgba(99,102,241,.14);border-radius:14px;background:#f8fafc;color:#111827;padding:8px 11px;font-size:16px;font-weight:700;outline:0}.qchat-input:focus{background:#fff;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.09)}.qchat-send{border:0;border-radius:14px;background:#4f46e5;color:#fff;font-size:19px;font-weight:900}.qchat-status{padding:0 12px 7px;color:#94a3b8;font-size:.58rem;font-weight:750}.qchat-status.is-online{color:#059669}.qchat-status.is-error{color:#be123c}
      @media(orientation:landscape) and (max-height:600px){.qchat-drawer{inset:6px max(8px,env(safe-area-inset-right)) 6px auto;width:min(360px,42vw);max-width:none}.qchat-list{height:calc(100vh - 122px)}.qchat-fab{bottom:10px}}
      @media(prefers-reduced-motion:reduce){.qchat-drawer{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function currentRoom() {
    if (document.body.dataset.currentGame !== 'quartet') return '';
    const subtitle = document.querySelector('.qv2-subtitle')?.textContent || '';
    return subtitle.match(/Комната\s+([A-Z0-9]{4,10})/i)?.[1]?.toUpperCase() || '';
  }

  function ensureUI() {
    const root = document.getElementById('qv2-root');
    if (!root || document.body.dataset.currentGame !== 'quartet') return null;
    let fab = document.getElementById('qchat-fab');
    if (!fab) {
      fab = document.createElement('button');
      fab.type = 'button';
      fab.id = 'qchat-fab';
      fab.className = 'qchat-fab';
      fab.innerHTML = `💬 <span>Чат</span><span class="qchat-badge" id="qchat-badge"></span>`;
      fab.addEventListener('click', () => setDrawer(true));
      root.appendChild(fab);
    }
    let drawer = document.getElementById('qchat-drawer');
    if (!drawer) {
      drawer = document.createElement('section');
      drawer.id = 'qchat-drawer';
      drawer.className = 'qchat-drawer';
      drawer.innerHTML = `<div class="qchat-head"><div><b>Чат комнаты</b><small id="qchat-room-label">Квартет</small></div><button type="button" class="qchat-close" id="qchat-close" aria-label="Закрыть">×</button></div><div class="qchat-status" id="qchat-status">Подключение…</div><div class="qchat-list" id="qchat-list"></div><form class="qchat-form" id="qchat-form"><input class="qchat-input" id="qchat-input" maxlength="300" placeholder="Сообщение…" autocomplete="off"><button class="qchat-send" type="submit" aria-label="Отправить">↑</button></form>`;
      drawer.querySelector('#qchat-close')?.addEventListener('click', () => setDrawer(false));
      drawer.querySelector('#qchat-form')?.addEventListener('submit', sendMessage);
      root.appendChild(drawer);
    }
    fab.hidden = !roomId;
    const label = document.getElementById('qchat-room-label');
    if (label) label.textContent = roomId ? `Квартет · ${roomId}` : 'Квартет';
    renderMessages();
    return drawer;
  }

  function setDrawer(open) {
    drawerOpen = Boolean(open);
    const drawer = ensureUI();
    drawer?.classList.toggle('is-open', drawerOpen);
    if (drawerOpen) {
      const badge = document.getElementById('qchat-badge');
      badge?.classList.remove('is-visible');
      scrollBottom();
      setTimeout(() => document.getElementById('qchat-input')?.focus({ preventScroll: true }), 100);
    }
  }

  function authBody() {
    const tg = window.Telegram?.WebApp;
    const name = String(localStorage.getItem('quartet_v2_player_name') || tg?.initDataUnsafe?.user?.first_name || tg?.initDataUnsafe?.user?.username || 'Игрок').slice(0, 32);
    let guestId = localStorage.getItem('quartet_v2_guest_id') || '';
    if (!guestId) {
      const bytes = new Uint8Array(12); crypto.getRandomValues(bytes);
      guestId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('quartet_v2_guest_id', guestId);
    }
    return { telegramInitData: String(tg?.initData || ''), guestId, name };
  }

  async function connect(targetRoom) {
    if (!targetRoom || connecting || (roomId === targetRoom && socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState))) return;
    connecting = true;
    roomId = targetRoom;
    ensureUI();
    setStatus('Подключаем чат…');
    try {
      const response = await fetch(`${backend}/rooms/${roomId}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(authBody()), cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      token = data.sessionToken;
      openSocket();
    } catch (error) {
      setStatus('Чат временно недоступен', 'error');
      scheduleReconnect();
    } finally { connecting = false; }
  }

  function openSocket() {
    try { socket?.close?.(); } catch {}
    const url = new URL(`${backend}/rooms/${roomId}/ws`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', token);
    socket = new WebSocket(url.toString());
    socket.addEventListener('open', () => {
      reconnectAttempt = 0;
      setStatus('Онлайн', 'online');
    });
    socket.addEventListener('message', (event) => {
      let payload;
      try { payload = JSON.parse(event.data); } catch { return; }
      if (payload.type === 'state') {
        const before = messages.length;
        messages = Array.isArray(payload.state?.chat) ? payload.state.chat : [];
        renderMessages();
        if (!drawerOpen && messages.length > before) showBadge(messages.length - before);
      } else if (payload.type === 'error') {
        setStatus(payload.error || 'Ошибка чата', 'error');
      }
    });
    socket.addEventListener('close', () => scheduleReconnect());
    socket.addEventListener('error', () => setStatus('Нет связи', 'error'));
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    if (!roomId || document.body.dataset.currentGame !== 'quartet') return;
    reconnectAttempt += 1;
    const delay = Math.min(12_000, 1000 * 2 ** Math.min(4, reconnectAttempt - 1));
    reconnectTimer = setTimeout(() => connect(roomId), delay);
  }

  function disconnect() {
    clearTimeout(reconnectTimer);
    connecting = false;
    token = '';
    try { socket?.close?.(1000, 'leave chat view'); } catch {}
    socket = null;
    roomId = '';
    messages = [];
    drawerOpen = false;
    document.getElementById('qchat-drawer')?.remove();
    document.getElementById('qchat-fab')?.remove();
  }

  function sendMessage(event) {
    event.preventDefault();
    const input = document.getElementById('qchat-input');
    const text = String(input?.value || '').trim();
    if (!text || socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'action', action: 'chat', payload: { text } }));
    if (input) input.value = '';
  }

  function renderMessages() {
    const list = document.getElementById('qchat-list');
    if (!list) return;
    const myTelegramId = String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || '');
    const myPlayerId = myTelegramId ? `tg:${myTelegramId}` : '';
    list.innerHTML = messages.length ? messages.map((message) => `<div class="qchat-message ${message.playerId === myPlayerId ? 'is-me' : ''}"><b>${esc(message.name)}</b>${esc(message.text)}<time>${formatTime(message.at)}</time></div>`).join('') : '<div class="qchat-empty">Сообщений пока нет</div>';
    if (drawerOpen) scrollBottom();
  }

  function scrollBottom() { const list = document.getElementById('qchat-list'); if (list) list.scrollTop = list.scrollHeight; }
  function setStatus(text, kind = '') { const status = document.getElementById('qchat-status'); if (status) { status.textContent = text; status.className = `qchat-status ${kind ? `is-${kind}` : ''}`; } }
  function showBadge(delta) { const badge = document.getElementById('qchat-badge'); if (!badge || delta <= 0) return; badge.textContent = delta > 9 ? '9+' : String(delta); badge.classList.add('is-visible'); }
  function formatTime(at) { try { return new Date(at || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

  function evaluate() {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => {
      const next = currentRoom();
      if (!next) {
        if (roomId || document.getElementById('qchat-fab')) disconnect();
        return;
      }
      ensureUI();
      if (next !== roomId || !socket || socket.readyState === WebSocket.CLOSED) connect(next);
    }, 100);
  }

  const observer = new MutationObserver(evaluate);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-current-game', 'class'] });
  window.addEventListener('online', evaluate);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) evaluate(); });
  evaluate();
})();
