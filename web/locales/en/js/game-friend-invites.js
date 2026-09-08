(() => {
  'use strict';
  if (window.__GAME_FRIEND_INVITES__) return;
  window.__GAME_FRIEND_INVITES__ = true;

  const CORE = String(document.querySelector('meta[name="app-core-backend"]')?.content || '').replace(/\/+$/, '');
  const GAMES = Object.freeze({
    quartet: {
      title: 'Quartet',
      actionSelector: '.qv2-room-actions',
      roomSelector: '.qv2-room-code',
      storageKey: 'quartet_v2_room_id',
      buttonClass: 'qv2-btn qv2-btn--secondary',
    },
    'bible-sketch': {
      title: 'Bible Artist',
      actionSelector: '.bsk-link-row',
      roomSelector: '.bsk-room-code',
      storageKey: 'bible_sketch_room_id_v1',
      buttonClass: 'bsk-secondary',
    },
  });

  let overlay = null;
  let observer = null;
  let timer = 0;
  let activeGame = '';
  let activeRoom = '';
  let loading = false;
  const sent = new Set();

  function initData() {
    return String(window.Telegram?.WebApp?.initData || window.TelegramLaunchContext?.getInitData?.() || '');
  }

  async function api(action, payload = {}) {
    if (window.PlayerSocial?.api) return window.PlayerSocial.api(action, payload);
    if (!CORE) throw new Error('Friends service is not configured');
    const telegramInitData = initData();
    if (!telegramInitData) throw new Error('Invitations are only available in Telegram');
    const response = await fetch(`${CORE}/compat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ telegramInitData, payload: { action, ...payload } }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false || data?.success === false) {
      throw new Error(String(data?.error || `HTTP ${response.status}`));
    }
    return data;
  }

  function currentGame() {
    const game = String(document.body?.dataset?.currentGame || '');
    return GAMES[game] ? game : '';
  }

  function normalizeRoom(value) {
    if (window.RoomInvite?.normalizeRoomId) return window.RoomInvite.normalizeRoomId(value);
    const room = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    return /^[A-Z0-9]{4,10}$/.test(room) ? room : '';
  }

  function resolveRoom(game) {
    const config = GAMES[game];
    if (!config) return '';
    const fromDom = normalizeRoom(document.querySelector(config.roomSelector)?.textContent || '');
    if (fromDom) return fromDom;
    try { return normalizeRoom(localStorage.getItem(config.storageKey) || ''); } catch { return ''; }
  }

  function addInviteButton(game) {
    const config = GAMES[game];
    if (!config) return;
    const actions = document.querySelector(config.actionSelector);
    const room = resolveRoom(game);
    if (!actions || !room || actions.querySelector('[data-friend-invite-trigger]')) return;

    actions.classList.add('game-friend-invite-actions');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${config.buttonClass} game-friend-invite-trigger`;
    button.dataset.friendInviteTrigger = game;
    button.innerHTML = '<span aria-hidden="true">👥</span><span>Friends</span>';
    button.setAttribute('aria-label', `Invite friends to ${config.title}`);
    button.addEventListener('click', () => openPicker(game, room));
    actions.appendChild(button);
  }

  function update() {
    const game = currentGame();
    if (!game) return;
    addInviteButton(game);
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'friend-invite-overlay';
    overlay.innerHTML = `\n      <section class="friend-invite-sheet" role="dialog" aria-modal="true" aria-labelledby="friend-invite-title">\n        <div class="friend-invite-handle" aria-hidden="true"></div>\n        <header class="friend-invite-head">\n          <div class="friend-invite-symbol" aria-hidden="true">👥</div>\n          <div><p>Play together</p><h2 id="friend-invite-title">Invite friends</h2><span data-invite-room>Room</span></div>\n          <button type="button" class="friend-invite-close" data-invite-close aria-label="Close">×</button>\n        </header>\n        <div class="friend-invite-content" data-invite-content></div>\n        <footer class="friend-invite-footer">\n          <button type="button" data-invite-share>Share link</button>\n        </footer>\n      </section>`;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closePicker();
    });
    overlay.querySelector('[data-invite-close]')?.addEventListener('click', closePicker);
    overlay.querySelector('[data-invite-share]')?.addEventListener('click', shareFallback);
    document.body.appendChild(overlay);
    return overlay;
  }

  async function openPicker(game, room = '') {
    const config = GAMES[game];
    const normalizedRoom = normalizeRoom(room || resolveRoom(game));
    if (!config || !normalizedRoom) return;
    activeGame = game;
    activeRoom = normalizedRoom;
    sent.clear();

    const node = ensureOverlay();
    node.classList.add('is-open');
    document.body.classList.add('friend-invite-open');
    const title = node.querySelector('#friend-invite-title');
    const meta = node.querySelector('[data-invite-room]');
    if (title) title.textContent = `Friends · ${config.title}`;
    if (meta) meta.textContent = `Room ${normalizedRoom}`;
    renderLoading();

    try {
      loading = true;
      const profile = window.PlayerSocial?.refresh
        ? await window.PlayerSocial.refresh()
        : await api('profileBootstrap');
      renderFriends(profile?.friends || []);
    } catch (error) {
      renderError(error);
    } finally {
      loading = false;
    }
  }

  function closePicker() {
    overlay?.classList.remove('is-open');
    document.body.classList.remove('friend-invite-open');
  }

  function contentNode() {
    return overlay?.querySelector('[data-invite-content]') || null;
  }

  function renderLoading() {
    const content = contentNode();
    if (content) content.innerHTML = '<div class="friend-invite-loading"><span></span><p>Loading friends…</p></div>';
  }

  function renderFriends(friends) {
    const content = contentNode();
    if (!content) return;
    const list = Array.isArray(friends) ? friends : [];
    if (!list.length) {
      content.innerHTML = `\n        <div class="friend-invite-empty">\n          <div class="friend-invite-empty-icon">♡</div>\n          <b>Add friends first</b>\n          <span>Open your profile and find a player by @username or Telegram ID — they will then appear here.</span>\n          <button type="button" data-open-friends>Open friends list</button>\n        </div>`;
      content.querySelector('[data-open-friends]')?.addEventListener('click', () => {
        closePicker();
        window.PlayerSocial?.open?.('friends');
      });
      return;
    }

    content.innerHTML = `\n      <div class="friend-invite-intro"><b>Who would you like to invite?</b><span>The bot will send a private invitation that opens the room directly.</span></div>\n      <div class="friend-invite-list">${list.map(friendRow).join('')}</div>`;
    content.querySelectorAll('[data-invite-friend]').forEach((button) => {
      button.addEventListener('click', () => inviteFriend(button));
    });
  }

  function friendRow(friend = {}) {
    const id = String(friend.id || '');
    const name = displayName(friend);
    const sub = friend.username ? `@${friend.username}` : `ID ${id}`;
    return `<article class="friend-invite-person">
      <span class="friend-invite-avatar">${escapeHtml(initials(name))}</span>
      <span class="friend-invite-person-info"><b>${escapeHtml(name)}</b><small>${escapeHtml(sub)}</small></span>
      <button type="button" data-invite-friend="${escapeHtml(id)}">Invite</button>\n    </article>`;
  }

  async function inviteFriend(button) {
    const friendId = String(button?.dataset?.inviteFriend || '');
    if (!friendId || !activeGame || !activeRoom || button.disabled || sent.has(friendId)) return;
    const oldText = button.textContent;
    button.disabled = true;
    button.classList.add('is-loading');
    button.textContent = 'Sending…';
    try {
      await api('profileInviteFriend', {
        friendId,
        game: activeGame,
        room: activeRoom,
      });
      sent.add(friendId);
      button.classList.remove('is-loading');
      button.classList.add('is-sent');
      button.textContent = 'Sent ✓';
    } catch (error) {
      button.disabled = false;
      button.classList.remove('is-loading');
      button.textContent = oldText;
      showInlineError(error?.message || error);
    }
  }

  function renderError(error) {
    const content = contentNode();
    if (!content) return;
    content.innerHTML = `<div class="friend-invite-empty"><div class="friend-invite-empty-icon">!</div><b>Could not load friends</b><span>${escapeHtml(error?.message || error)}</span><button type="button" data-invite-retry>Retry</button></div>`;
    content.querySelector('[data-invite-retry]')?.addEventListener('click', () => openPicker(activeGame, activeRoom));
  }

  function showInlineError(message) {
    const content = contentNode();
    if (!content) return;
    let error = content.querySelector('.friend-invite-error');
    if (!error) {
      error = document.createElement('div');
      error.className = 'friend-invite-error';
      content.prepend(error);
    }
    error.textContent = String(message || 'Could not send invitation');
    error.classList.add('is-visible');
    clearTimeout(Number(error.dataset.timer || 0));
    const timerId = window.setTimeout(() => error.classList.remove('is-visible'), 4200);
    error.dataset.timer = String(timerId);
  }

  async function shareFallback() {
    if (!activeGame || !activeRoom) return;
    const button = overlay?.querySelector('[data-invite-share]');
    if (button) button.disabled = true;
    try {
      const inviteUrl = await window.RoomInvite?.getShareUrl?.(activeGame, activeRoom);
      if (!inviteUrl) throw new Error('Could not prepare link');
      const title = GAMES[activeGame]?.title || 'Bible Games';
      const text = `${title} · room ${activeRoom}`;
      const telegramShare = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(text)}`;
      const tg = window.Telegram?.WebApp;
      if (typeof tg?.openTelegramLink === 'function') tg.openTelegramLink(telegramShare);
      else if (navigator.share) await navigator.share({ title, text, url: inviteUrl });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
        showInlineError('Link copied');
      } else window.open(telegramShare, '_blank', 'noopener');
    } catch (error) {
      if (error?.name !== 'AbortError') showInlineError(error?.message || error);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function displayName(friend = {}) {
    return String(friend.displayName || '').trim()
      || (friend.username ? `@${friend.username}` : `Player ${String(friend.id || '').slice(-4)}`);
  }

  function initials(value) {
    const clean = String(value || '').replace(/^@/, '').trim();
    if (!clean) return 'BG';
    const parts = clean.split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : clean.slice(0, 2)).toUpperCase();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));
  }

  function start() {
    if (observer) return;
    observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'data-current-game', 'data-mode'],
    });
    timer = window.setInterval(update, 450);
    window.addEventListener('playersocialchange', update);
    update();
  }

  window.addEventListener('pagehide', () => {
    observer?.disconnect();
    observer = null;
    if (timer) window.clearInterval(timer);
    timer = 0;
    window.removeEventListener('playersocialchange', update);
  }, { once: true });

  window.GameFriendInvites = Object.freeze({ open: openPicker, close: closePicker, update });
  start();
})();
