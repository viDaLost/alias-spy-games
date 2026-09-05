/* Мелкие помощники интерфейса: DOM, тосты, панели, мост к Android. */

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

export function icon(path, extra) {
  return `<svg viewBox="0 0 24 24" ${extra || ''}>${path}</svg>`;
}

export const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  shuffle: '<path d="M4 7h3.5l9 10H20M4 17h3.5l3-3.4M16 7h4M20 7l-2.5-2.5M20 7l-2.5 2.5M20 17l-2.5-2.5M20 17l-2.5 2.5"/>',
  text: '<path d="M3.5 18 8.6 5.6h1L14.7 18M5.7 13.9h6.7"/><path d="M18.4 9.6v8.6M18.4 9.6 16.6 11.6M18.4 9.6l1.8 2"/>',
  share: '<path d="M12 15V4M12 4L8.5 7.5M12 4l3.5 3.5"/><path d="M5.5 12v6.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V12"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15"/>',
  scroll: '<path d="M12 4v13M12 17l-4-4M12 17l4-4"/><path d="M5 20h14"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5zM14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14z"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  trash: '<path d="M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7M7 7l.8 11.2A1.5 1.5 0 0 0 9.3 19.6h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8.2v.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M21 12h-2M5 12H3M18.4 5.6 17 7M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6"/>',
  eye: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/>',
};

let toastTimer = 0;
export function toast(message) {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.hidden = false;
  requestAnimationFrame(() => node.classList.add('is-on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('is-on');
    setTimeout(() => { node.hidden = true; }, 320);
  }, 2000);
}

export function haptic(ms) {
  try {
    if (bridge && bridge.vibrate) bridge.vibrate(ms || 8);
    else if (navigator.vibrate) navigator.vibrate(ms || 8);
  } catch (error) { /* без вибрации */ }
}

export function share(title, text) {
  try {
    if (bridge && bridge.share) { bridge.share(title, text); return; }
    if (navigator.share) { navigator.share({ title, text }); return; }
  } catch (error) { /* ниже — запасной путь */ }
  copy(text);
}

export function copy(text) {
  try {
    if (bridge && bridge.copy) { bridge.copy(text); toast('Скопировано'); return; }
  } catch (error) { /* ниже — запасной путь */ }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('Скопировано'), () => toast('Не удалось скопировать'));
  }
}

/* Подсказывает Android, какими рисовать системные панели. */
export function setNativeTheme(dark) {
  try {
    if (bridge && bridge.setTheme) bridge.setTheme(!!dark);
  } catch (error) { /* только на устройстве */ }
}

export function keepAwake(on) {
  try {
    if (bridge && bridge.keepAwake) bridge.keepAwake(!!on);
  } catch (error) { /* только на устройстве */ }
}

/* Модальная панель снизу. */
export function openSheet(title, content) {
  const host = document.getElementById('sheetHost');
  host.innerHTML = '';
  const scrim = el('div', { class: 'sheet-host__scrim' });
  const sheet = el('div', { class: 'sheet' }, [
    el('div', { class: 'sheet__grip' }),
    title ? el('div', { class: 'sheet__title', text: title }) : null,
    content,
  ]);
  host.append(scrim, sheet);
  host.hidden = false;
  requestAnimationFrame(() => host.classList.add('is-open'));
  const close = () => closeSheet();
  scrim.addEventListener('click', close);
  host.__close = close;
  return { close };
}

export function closeSheet() {
  const host = document.getElementById('sheetHost');
  if (host.hidden) return false;
  host.classList.remove('is-open');
  setTimeout(() => { host.hidden = true; host.innerHTML = ''; }, 340);
  return true;
}

export function sheetIsOpen() {
  return !document.getElementById('sheetHost').hidden;
}

/* Приклеивание шапки при прокрутке. */
export function watchStuck(scroller, target, offset) {
  const limit = offset || 4;
  const onScroll = () => target.classList.toggle('is-stuck', scroller.scrollTop > limit);
  scroller.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

export function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (ch) => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;'
  ));
}
