/* Примитивы интерфейса: DOM-хелпер, иконки, панели, тосты, мост к Android. */

export const bridge = window.PsalmsNative || null;

export function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'style') node.setAttribute('style', value);
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else node.setAttribute(key, value === true ? '' : value);
    }
  }
  if (children != null) {
    for (const child of [].concat(children)) {
      if (child == null || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
  }
  return node;
}

/* Один набор контурных иконок: 24×24, толщина 1.75, скруглённые концы. */
export const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m16.2 16.2 3.8 3.8"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 19 8 12l7-7"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  heart: '<path d="M12 20.4S3.8 15.5 3.8 9.9A4.1 4.1 0 0 1 12 7.7a4.1 4.1 0 0 1 8.2 2.2c0 5.6-8.2 10.5-8.2 10.5z"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  settings: '<path d="M5 20v-6M5 10V4M12 20v-9M12 7V4M19 20v-4M19 12V4"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="9" r="2"/><circle cx="19" cy="14" r="2"/>',
  type: '<path d="M4 18.5 9.2 5.5h1.6L16 18.5M6.3 14.2h7.4"/><path d="M19 12v6.5"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  minus: '<path d="M5.5 12h13"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 1.8"/>',
  book: '<path d="M4 5.6A1.6 1.6 0 0 1 5.6 4H11v16H5.6A1.6 1.6 0 0 1 4 18.4z"/><path d="M13 4h5.4A1.6 1.6 0 0 1 20 5.6v12.8a1.6 1.6 0 0 1-1.6 1.6H13z"/>',
  list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
  share: '<path d="M12 15.5V4M12 4 8.6 7.4M12 4l3.4 3.4"/><path d="M5.5 12.5v6A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5v-6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15"/>',
  trash: '<path d="M4.5 7h15M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7M6.5 7l.8 11.2A1.5 1.5 0 0 0 8.8 19.6h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/>',
  scroll: '<path d="M12 4v13M12 17l-4-4M12 17l4-4"/><path d="M5 20h14"/>',
  eye: '<path d="M3 12s3.6-6 9-6 9 6 9 6-3.6 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8.2v.2"/>',
  alert: '<path d="M12 4.5 21 19.5H3z"/><path d="M12 10v4M12 17v.2"/>',
};

export function icon(path) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

/** Кнопка-иконка с доступной подписью. */
export function iconButton(path, label, onClick, extra) {
  return el('button', Object.assign({
    type: 'button',
    class: 'icon-button',
    'aria-label': label,
    title: label,
    html: icon(path),
    onclick: onClick,
  }, extra || {}));
}

/** Кнопка с текстовой меткой вместо иконки — например «Аа». */
export function textButton(label, description, onClick) {
  return el('button', {
    type: 'button',
    class: 'icon-button icon-button--text',
    'aria-label': description,
    title: description,
    text: label,
    onclick: onClick,
  });
}

let toastTimer = 0;
export function toast(message) {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.hidden = false;
  requestAnimationFrame(() => node.classList.add('is-visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('is-visible');
    setTimeout(() => { node.hidden = true; }, 220);
  }, 2200);
}

export function haptic(ms) {
  try {
    if (bridge && bridge.vibrate) bridge.vibrate(ms || 6);
    else if (navigator.vibrate) navigator.vibrate(ms || 6);
  } catch (error) { /* без вибрации */ }
}

export function share(title, text) {
  try {
    if (bridge && bridge.share) { bridge.share(title, text); return; }
    if (navigator.share) { navigator.share({ title, text }); return; }
  } catch (error) { /* ниже запасной путь */ }
  copy(text);
}

export function copy(text) {
  try {
    if (bridge && bridge.copy) { bridge.copy(text); toast('Текст скопирован'); return; }
  } catch (error) { /* ниже запасной путь */ }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(
      () => toast('Текст скопирован'),
      () => toast('Не удалось скопировать'),
    );
  }
}

export function keepAwake(on) {
  try {
    if (bridge && bridge.keepAwake) bridge.keepAwake(!!on);
  } catch (error) { /* только на устройстве */ }
}

export function setNativeTheme(dark) {
  try {
    if (bridge && bridge.setTheme) bridge.setTheme(!!dark);
  } catch (error) { /* только на устройстве */ }
}

/* --- Нижняя панель ------------------------------------------------------- */

let lastFocused = null;

export function openSheet(title, content) {
  const host = document.getElementById('sheetHost');
  lastFocused = document.activeElement;
  host.innerHTML = '';
  const scrim = el('div', { class: 'sheet-host__scrim' });
  const sheet = el('div', {
    class: 'sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title || 'Панель',
  }, [
    el('div', { class: 'sheet__grip' }),
    title ? el('h2', { class: 'sheet__title', text: title }) : null,
    content,
  ]);
  host.append(scrim, sheet);
  host.hidden = false;
  requestAnimationFrame(() => host.classList.add('is-open'));
  scrim.addEventListener('click', () => closeSheet());
  const focusable = sheet.querySelector('button, input, [tabindex]');
  if (focusable) setTimeout(() => focusable.focus(), 60);
  return { close: closeSheet };
}

export function closeSheet() {
  const host = document.getElementById('sheetHost');
  if (host.hidden) return false;
  host.classList.remove('is-open');
  setTimeout(() => { host.hidden = true; host.innerHTML = ''; }, 260);
  if (lastFocused && lastFocused.focus) lastFocused.focus();
  lastFocused = null;
  return true;
}

export function sheetIsOpen() {
  return !document.getElementById('sheetHost').hidden;
}

/* --- Мелочи -------------------------------------------------------------- */

export function watchStuck(scroller, target, offset) {
  const limit = offset == null ? 4 : offset;
  const onScroll = () => target.classList.toggle('is-stuck', scroller.scrollTop > limit);
  scroller.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  return onScroll;
}

export function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function songsWord(count) {
  return `${count} ${plural(count, 'песня', 'песни', 'песен')}`;
}
