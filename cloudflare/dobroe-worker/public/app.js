'use strict';
const D = window.DOBROE_DATA;

/* ---------- Telegram mini app */
const TG = (() => { const w = window.Telegram && window.Telegram.WebApp; return w && w.initData ? w : null; })();

/* ---------- helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plain = s => String(s).replace(/\*\*/g, '').replace(/\(\*([^*]+)\*\)/g, '($1)');
const norm = s => plain(s).toLowerCase().replace(/ё/g, 'е');
const dash = s => s.replace(/ - /g, ' — ').replace(/(\d)-(\d)/g, '$1–$2');
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many; };
const clip = (s, n) => s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
const tokens = s => String(s).split(/\s+/).filter(Boolean);
const coreOf = w => norm(w).replace(/[^а-яa-z0-9]/g, '');
const prettyRef = l => dash(l).replace(/^([1-4]?[А-ЯЁа-яё.]+?\.)(?=\d)/, '$1 ');
const IC = {
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/></svg>',
  bm: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h12v17l-6-4-6 4z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5C10 5 7 4.5 3.5 5v13.5C7 18 10 18.5 12 20c2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path d="M12 6.5V20"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 6V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3z"/><path d="M9.5 21h5"/></svg>',
  test: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
};

/* ---------- content model */
const GIFTS = 'слово мудрости, слово знания, вера, дары исцелений, чудотворения, пророчество, различение духов, разные языки, истолкование языков';
const FRUITS = 'любовь, радость, мир, долготерпение, благость, милосердие, вера, кротость, воздержание';
const ARMOR = 'пояс истины, броня праведности, обувь готовности благовествовать мир, щит веры, шлем спасения, меч духовный — слово Божие';
{ // question 9 asks to name these lists by heart but only quotes Eph. 6 — the lists come from the texts quoted above it
  const c = D.questions[8].cards.find(c => /^Скажите \(наизусть\)/.test(c.q));
  if (c) c.blocks.unshift(
    { t: 'answer', text: 'Девять даров Духа (1Кор.12:8-10): ' + GIFTS + '.' },
    { t: 'p', text: 'Девять плодов Духа (Гал.5:22-23): ' + FRUITS + '.' },
    { t: 'p', text: 'Шесть доспехов всеоружия Божьего (Еф.6:14-17): ' + ARMOR + '.' });
}
const QS = D.questions;
const QN = QS.length;
const QBY = Object.fromEntries(QS.map(q => [q.n, q]));
const SECTIONS = [];
QS.forEach(q => { let s = SECTIONS.find(s => s.name === q.section); if (!s) SECTIONS.push(s = { name: q.section, qs: [] }); s.qs.push(q.n); });
const APPS = D.appendices.map((a, i) => ({ ...a, id: 'd' + (i + 1) }));
const qHasMemo = q => q.cards.some(c => c.memo || c.blocks.some(b => b.t === 'ref' && b.memo));

// Scripture passages, each once (the same passage quoted again under another question points back to it)
const TEXTS = [];
{
  const seen = {};
  QS.forEach(q => q.cards.forEach(c => c.blocks.forEach(b => {
    if (b.t !== 'ref' || !b.verses.length) return;
    if (seen[b.ref]) { if (!seen[b.ref].qns.includes(q.n)) seen[b.ref].qns.push(q.n); if (b.memo) seen[b.ref].memo = true; return; }
    if (b.from) return;
    const base = { key: b.ref, label: prettyRef(b.label), qns: [q.n], memo: !!b.memo };
    seen[b.ref] = base;
    if (b.verses.length > 17) { // Lev. 11 — split the chapter into readable pieces
      for (let i = 0; i < b.verses.length; i += 6) {
        const vs = b.verses.slice(i, i + 6);
        TEXTS.push({ ...base, id: 't' + TEXTS.length, label: prettyRef(b.ref.replace(/гл$/, '') + ':' + vs[0][0] + '-' + vs[vs.length - 1][0]), verses: vs, qns: base.qns });
      }
    } else TEXTS.push(Object.assign(base, { id: 't' + TEXTS.length, verses: b.verses }));
  })));
}
QS.forEach(q => q.cards.forEach(c => c.blocks.forEach(b => {
  if (b.t === 'ref' && b.from) TEXTS.filter(t => t.key === b.ref).forEach(t => { if (!t.qns.includes(q.n)) t.qns.push(q.n); });
})));
// Answers written in the book (question → answer)
const answerText = c => c.blocks.filter(b => b.t === 'answer' || b.t === 'p' || b.t === 'li').map(b => b.text).filter(Boolean).join(' ');
const ANSWERS = [];
QS.forEach(q => q.cards.forEach((c, i) => {
  const text = answerText(c);
  if (c.blocks.some(b => b.t === 'answer') && tokens(text).length >= 3)
    ANSWERS.push({ id: 'a' + q.n + '_' + i, qn: q.n, q: c.q, parent: i ? q.cards[0].q : null, text });
}));

// verse lookup for inline references
const BOOKFIX = { 'Отк.': 'Откр.' };
const VIDX = [];
QS.forEach(q => q.cards.forEach(c => c.blocks.forEach(b => {
  if (b.t !== 'ref' || !b.verses.length || b.from) return;
  const m = b.ref.match(/^([1-4]?[А-ЯЁа-яё.]+?\.)(\d+)/);
  if (m) VIDX.push({ book: BOOKFIX[m[1]] || m[1], ch: +m[2], verses: b.verses, qn: q.n });
})));
function lookup(book, ch, a, z) {
  book = book.replace(/\s/g, ''); book = BOOKFIX[book] || book; z = z || a;
  for (const e of VIDX) {
    if (e.book !== book || e.ch !== ch) continue;
    const got = e.verses.filter(v => v[0] >= a && v[0] <= z);
    if (got.length === z - a + 1) return { verses: got, qn: e.qn };
  }
  return null;
}
function fmt(s, link = true) {
  let h = esc(dash(s)).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\(\*([^*]+)\*\)/g, '(<em>$1</em>)');
  if (link) h = h.replace(/([1-4]?[А-ЯЁ][а-яё]{1,6}\.\s?(?:Н\.\s?)?)(\d+):(\d+)(?:–(\d+))?/g, (m, b, c, a, z) =>
    lookup(b, +c, +a, z ? +z : 0) ? `<button type="button" class="iref" data-b="${b}" data-c="${c}" data-a="${a}" data-z="${z || ''}">${m}</button>` : m);
  return h;
}
const versesHtml = vs => vs.map(v => `<p>${v[0] ? `<sup class="v">${v[0]}</sup>` : ''}${fmt(v[1], false)}</p>`).join('');

/* ---------- memorisation passages */
function refVerses(key) {
  for (const q of QS) for (const c of q.cards) for (const b of c.blocks) if (b.t === 'ref' && b.ref === key && b.verses.length) return b.verses;
  return [];
}
const genderize = (s, g) => s.replace(/(\S+) \(\*([^*]+)\*\)/g, (m, a, b) => g === 'f' ? b : a);
const vowVerses = g => D.vow.map(b => [0, (b.t === 'li' ? '— ' : '') + genderize(b.text, g)]);
const listV = s => [[0, s.charAt(0).toUpperCase() + s.slice(1) + '.']];
const MEMO = [
  { id: 'mvow', title: 'Обет члена церкви', src: 'Текст обета', vow: true },
  { id: 'm5', qn: 5, title: 'Десять заповедей', src: 'Исх. 20:1–17', verses: refVerses('Исх.20:1-17') },
  { id: 'mgifts', qn: 9, title: 'Девять даров Духа', src: 'по 1Кор. 12:8–10', verses: listV(GIFTS) },
  { id: 'mfruit', qn: 9, title: 'Девять плодов Духа', src: 'по Гал. 5:22–23', verses: listV(FRUITS) },
  { id: 'marmor', qn: 9, title: 'Шесть доспехов всеоружия Божьего', src: 'по Еф. 6:14–17', verses: listV(ARMOR) },
  { id: 'm17', qn: 17, title: 'Повинуйтесь наставникам вашим', src: 'Евр. 13:17', verses: refVerses('Евр.13:17') },
  { id: 'm18', qn: 18, title: 'Трехангельская весть', src: 'Откр. 14:6–12', verses: refVerses('Откр.14:6-12') },
  { id: 'm19', qn: 19, title: 'Весть Иного ангела', src: 'Откр. 18:1–4', verses: refVerses('Откр.18:1-4') },
  { id: 'm21', qn: 21, title: 'Весть Верного Свидетеля к Лаодикии', src: 'Откр. 3:14–22', verses: refVerses('Откр.3:14-22') },
  { id: 'm34a', qn: 34, title: 'Слава Божия — облекать тайною дело', src: 'Притч. 25:2', verses: refVerses('Притч.25:2') },
  { id: 'm34b', qn: 34, title: 'Верный человек таит дело', src: 'Притч. 11:13', verses: refVerses('Притч.11:13') },
  { id: 'm34c', qn: 34, title: 'Кто широко раскрывает рот', src: 'Притч. 20:19', verses: refVerses('Притч.20:19') },
  { id: 'm35a', qn: 35, title: 'В устах их нет лукавства', src: 'Откр. 14:5', verses: refVerses('Откр.14:5') },
  { id: 'm35b', qn: 35, title: 'Кто говорит то, что знает', src: 'Притч. 12:17', verses: refVerses('Притч.12:17') },
];
const MODES = [
  { n: 'Читать', hint: 'Прочитайте текст несколько раз, лучше вслух, вдумываясь в смысл.' },
  { n: 'Буквы', hint: 'Видна только первая буква каждого слова. Проговаривайте текст; нажмите на слово, чтобы подсмотреть.' },
  { n: 'Пропуски', hint: 'Половина слов скрыта. Восстановите их по памяти; нажмите на пропуск, чтобы проверить.' },
  { n: 'Скрыто', hint: 'Скрыт весь текст. Рассказывайте по памяти и открывайте слова по одному.' },
  { n: 'Написать', hint: 'Напишите текст по памяти — приложение сравнит его с оригиналом. Номера стихов писать не нужно.' },
];

/* ---------- progress */
const KEY = 'dobroe-ispovedanie-v1';
const DEF = () => ({ v: 2, qk: [], bm: [], tx: {}, memo: {}, quiz: { best: null, runs: 0 }, set: { fs: 17, compact: false, g: 'm' }, last: 1, t: 0 });
let S = DEF();
function adopt(o) {
  const n = DEF();
  Object.assign(n, o || {});
  n.set = { ...DEF().set, ...(o && o.set || {}) };
  if (o && o.cards && !o.qk) { // progress from the first version: questions with every card known count as learned
    n.qk = QS.filter(q => q.cards.every((c, i) => ((o.cards[i ? q.n + '_' + i : String(q.n)] || {}).b || 0) >= 2)).map(q => q.n);
  }
  delete n.cards; n.v = 2;
  n.qk = (n.qk || []).filter(x => QBY[x]); n.bm = (n.bm || []).filter(x => QBY[x]);
  return n;
}
try { const raw = localStorage.getItem(KEY); if (raw) S = adopt(JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
function save() {
  S.t = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
}
function renderSync() {
  $$('.sync').forEach(el => { el.innerHTML = '<i></i>Прогресс сохраняется на этом устройстве'; });
}
const isKnown = n => S.qk.includes(n);
function toggleIn(arr, x) { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); else arr.push(x); save(); return i < 0; }
const memoInfo = id => S.memo[id] || { lvl: 0, best: 0 };
const txInfo = id => S.tx[id] || { ok: 0, miss: 0 };

/* ---------- speech */
const TTS = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let speakingBtn = null;
function stopSpeak() { if (TTS) speechSynthesis.cancel(); if (speakingBtn) speakingBtn.classList.remove('speaking'); speakingBtn = null; }
function speak(text, btn) {
  if (!TTS) return;
  if (btn && speakingBtn === btn) { stopSpeak(); return; }
  stopSpeak();
  const voice = speechSynthesis.getVoices().find(v => /^ru/i.test(v.lang));
  const parts = plain(text).replace(/\s+/g, ' ').split(/(?<=[.!?;:»])\s+/);
  const chunks = []; let buf = '';
  parts.forEach(p => { if ((buf + ' ' + p).length > 220 && buf) { chunks.push(buf); buf = p; } else buf = buf ? buf + ' ' + p : p; });
  if (buf) chunks.push(buf);
  speakingBtn = btn; if (btn) btn.classList.add('speaking');
  chunks.forEach((t, i) => {
    const u = new SpeechSynthesisUtterance(t); u.lang = 'ru-RU'; u.rate = .95; if (voice) u.voice = voice;
    if (i === chunks.length - 1) u.onend = () => { if (speakingBtn === btn) stopSpeak(); };
    u.onerror = () => { if (speakingBtn === btn) stopSpeak(); };
    speechSynthesis.speak(u);
  });
}
if (TTS) speechSynthesis.getVoices();

/* ---------- blocks */
function renderBlocks(blocks, opts = {}) {
  let h = '', list = false, answered = false;
  const close = () => { if (list) { h += '</ul>'; list = false; } };
  for (const b of blocks) {
    if (b.t === 'li') { if (!list) { h += '<ul>'; list = true; } h += `<li>${fmt(b.text)}</li>`; continue; }
    close();
    if (b.t === 'ref') {
      const open = opts.open ?? !S.set.compact;
      h += `<div class="scr${open ? ' open' : ''}${b.memo ? ' memo' : ''}"><button type="button" class="scr-h" aria-expanded="${open}"><span class="scr-ref">${esc(prettyRef(b.label))}</span>${b.memo ? '<span class="tag memo">наизусть</span>' : ''}${b.from ? `<span class="scr-from">см. вопрос ${b.from}</span>` : ''}${IC.chev}</button><div class="scr-b">${versesHtml(b.verses)}</div></div>`;
      continue;
    }
    if (b.t === 'note') { if (b.text) h += `<div class="note"><b>Примечание.</b> ${fmt(b.text)}</div>`; continue; }
    if (!b.text) continue;
    let cls = 'ans';
    if (/^\d\)/.test(b.text)) cls += ' item'; else if (/^[а-д]\)/.test(b.text)) cls += ' item l2';
    if (b.t === 'answer' && !answered) { answered = true; h += `<p class="${cls} first"><span class="ans-l">Ответ</span>${fmt(b.text)}</p>`; }
    else h += `<p class="${cls}">${fmt(b.text)}</p>`;
  }
  close();
  return h;
}

/* ---------- global clicks, sheet, popover, toast */
const sheet = $('#sheet'), scrim = $('#scrim'), aaPop = $('#aaPop');
function closeOverlays() { sheet.hidden = true; aaPop.hidden = true; scrim.hidden = true; }
scrim.onclick = closeOverlays;
document.addEventListener('click', e => {
  const h = e.target.closest('.scr-h');
  if (h) { const r = h.parentElement; r.classList.toggle('open'); h.setAttribute('aria-expanded', r.classList.contains('open')); return; }
  const ir = e.target.closest('.iref');
  if (ir) { openVerse(ir.dataset.b, +ir.dataset.c, +ir.dataset.a, ir.dataset.z ? +ir.dataset.z : 0, ir.textContent); return; }
  const gq = e.target.closest('[data-q]');
  if (gq) { closeOverlays(); go('page', gq.dataset.q); return; }
  const gm = e.target.closest('[data-memo]');
  if (gm) { closeOverlays(); MT.id = gm.dataset.memo; MT.mode = 0; MT.verse = 0; MT.rev = new Set(); MT.result = null; MT.draft = ''; go('memo'); }
});
function openVerse(b, c, a, z, label) {
  const r = lookup(b, c, a, z);
  if (!r) return;
  sheet.innerHTML = `<div class="row" style="justify-content:space-between"><b>${esc(prettyRef(label))}</b><button class="btn small" type="button" id="sheetClose">Закрыть</button></div>
    <div class="scr-b" style="font-family:var(--f-book);color:var(--scripture);line-height:1.62">${versesHtml(r.verses)}</div>
    <button class="linkrow" type="button" data-q="${r.qn}">Открыть вопрос ${r.qn}${IC.right}</button>`;
  sheet.hidden = false; scrim.hidden = false;
  $('#sheetClose').onclick = closeOverlays;
}
let toastT = 0;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2000); }
function applyFont() { document.documentElement.style.setProperty('--fs', S.set.fs + 'px'); $('#fsVal').textContent = Math.round(S.set.fs / 17 * 100) + '%'; }
function syncAa() { $('#vOpen').setAttribute('aria-pressed', !S.set.compact); $('#vClosed').setAttribute('aria-pressed', !!S.set.compact); applyFont(); }
$('#aaBtn').onclick = () => { const open = aaPop.hidden; closeOverlays(); if (open) { syncAa(); aaPop.hidden = false; scrim.hidden = false; } };
$('#fsDown').onclick = () => { S.set.fs = Math.max(14, S.set.fs - 1); save(); applyFont(); };
$('#fsUp').onclick = () => { S.set.fs = Math.min(25, S.set.fs + 1); save(); applyFont(); };
function setCompact(on) { S.set.compact = on; save(); syncAa(); $$('.qpage .scr').forEach(r => { r.classList.toggle('open', !on); $('.scr-h', r).setAttribute('aria-expanded', !on); }); }
$('#vOpen').onclick = () => setCompact(false);
$('#vClosed').onclick = () => setCompact(true);

/* ---------- router */
const V = {};
const TAB_OF = { home: 'home', list: 'list', page: 'list', cards: 'cards', memo: 'memo', quiz: 'quiz' };
const TITLES = { home: 'Доброе исповедание', list: 'Вопросы', page: 'Вопросы', cards: 'Карточки', memo: 'Наизусть', quiz: 'Тест' };
let cur = { view: 'home', arg: null };
function go(view, arg = null, keepScroll = false) {
  stopSpeak(); closeOverlays();
  cur = { view, arg };
  Object.keys(TAB_OF).forEach(k => { $('#v-' + k).hidden = k !== view; });
  $$('.tab').forEach(t => t.setAttribute('aria-current', t.dataset.tab === TAB_OF[view] ? 'true' : 'false'));
  $('#hdrTitle').textContent = window.innerWidth <= 760 ? TITLES[view] : 'Доброе исповедание';
  V[view](arg);
  if (!keepScroll) window.scrollTo(0, 0);
  try { history.replaceState(null, '', '#' + (view === 'page' ? arg : view)); } catch (e) { /* sandbox */ }
  syncBack();
}
// Inside Telegram the system "back" button leaves a question page or a text being learnt.
function canGoBack() { return cur.view === 'page' || (cur.view === 'memo' && !!MT.id); }
function goBack() {
  if (cur.view === 'page') go('list');
  else if (cur.view === 'memo' && MT.id) { MT.id = null; V.memo(); syncBack(); window.scrollTo(0, 0); }
}
function syncBack() { if (TG && TG.BackButton) { if (canGoBack()) TG.BackButton.show(); else TG.BackButton.hide(); } }
function tgColors() {
  if (!TG) return;
  const css = getComputedStyle(document.documentElement);
  try { TG.setHeaderColor(css.getPropertyValue('--surface').trim()); TG.setBackgroundColor(css.getPropertyValue('--bg').trim()); } catch (e) { /* older clients */ }
  try { if (TG.setBottomBarColor) TG.setBottomBarColor(css.getPropertyValue('--surface').trim()); } catch (e) { /* older clients */ }
}
if (TG) {
  document.documentElement.dataset.theme = TG.colorScheme === 'dark' ? 'dark' : 'light';
  TG.ready(); TG.expand();
  try { if (TG.disableVerticalSwipes) TG.disableVerticalSwipes(); } catch (e) { /* older clients */ }
  TG.BackButton.onClick(goBack);
  TG.onEvent('themeChanged', () => { document.documentElement.dataset.theme = TG.colorScheme === 'dark' ? 'dark' : 'light'; tgColors(); });
  tgColors();
}
function rerender() { go(cur.view, cur.arg, true); }
$$('.tab').forEach(t => t.onclick = () => { if (t.dataset.tab === 'memo') MT.id = null; go(t.dataset.tab); });
$('#hdrTitle').onclick = () => go('home');

/* ---------- install to the home screen */
const standalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (cur.view === 'home') V.home(); });
function installCard() {
  if (TG || standalone() || S.set.noInstall) return '';
  const share = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg>';
  if (isIOS) return `<div class="card install"><b>Установите на iPhone</b><p>Нажмите ${share} «Поделиться» внизу Safari и выберите «На экран „Домой“». Приложение откроется как обычное, без адресной строки, и будет работать без интернета.</p><button class="btn small" type="button" id="hideInstall">Скрыть</button></div>`;
  if (installPrompt) return `<div class="card install"><b>Установить приложение</b><p>Значок появится на главном экране, приложение будет работать без интернета.</p><div class="row"><button class="btn primary small" type="button" id="installBtn">Установить</button><button class="btn small" type="button" id="hideInstall">Не сейчас</button></div></div>`;
  return '';
}

/* ---------- HOME */
V.home = () => {
  const known = S.qk.length;
  const txOk = TEXTS.concat(ANSWERS).filter(u => { const i = txInfo(u.id); return i.ok > i.miss; }).length;
  const mm = MEMO.filter(m => memoInfo(m.id).best >= 90).length;
  const last = QBY[S.last] ? S.last : 1;
  $('#v-home').innerHTML = `<div class="stack">
    <div class="hero">
      <div style="display:grid;gap:8px"><h1>Доброе исповедание</h1><p>${QN} вопросов и ответов с текстами Писания и обет члена церкви</p></div>
      <div class="prog"><span>Выучено вопросов: ${known} из ${QN}</span><div class="bar"><i style="width:${known / QN * 100}%"></i></div></div>
      <button class="btn" type="button" data-q="q${last}">${last > 1 || known ? 'Продолжить с вопроса ' + last : 'Начать с первого вопроса'} ${IC.right}</button>
    </div>
    <div class="modes-grid">
      <button class="mode" type="button" data-go="list"><span class="ic">${IC.book}</span><b>Вопросы</b><span>Читать вопросы, ответы и тексты</span><span class="st">${known} / ${QN} выучено</span></button>
      <button class="mode" type="button" data-go="cards"><span class="ic">${IC.cards}</span><b>Карточки</b><span>Вспомнить текст по его началу</span><span class="st">${txOk} ${plural(txOk, 'текст вспомнен', 'текста вспомнено', 'текстов вспомнено')}</span></button>
      <button class="mode" type="button" data-go="memo"><span class="ic">${IC.bulb}</span><b>Наизусть</b><span>Обет, заповеди, вести ангелов</span><span class="st">${mm} / ${MEMO.length} выучено</span></button>
      <button class="mode" type="button" data-go="quiz"><span class="ic">${IC.test}</span><b>Тест</b><span>Проверка знания текстов и ответов</span><span class="st">${S.quiz.best == null ? 'ещё не проходили' : 'лучший: ' + S.quiz.best + '%'}</span></button>
    </div>
    ${installCard()}
    <button class="linkrow" type="button" data-q="vow"><span>Обет члена церкви<small>Новый текст обета</small></span>${IC.right}</button>
    <div class="sync"></div>
  </div>`;
  const hi = $('#hideInstall'); if (hi) hi.onclick = () => { S.set.noInstall = true; save(); V.home(); };
  const ib = $('#installBtn'); if (ib) ib.onclick = async () => { const p = installPrompt; installPrompt = null; p.prompt(); try { await p.userChoice; } catch (e) { /* dismissed */ } V.home(); };
  $$('[data-go]', $('#v-home')).forEach(b => b.onclick = () => { if (b.dataset.go === 'memo') MT.id = null; go(b.dataset.go); });
  renderSync();
};

/* ---------- LIST */
const LS = { filter: 'all', query: '' };
const SIDX = [];
QS.forEach(q => q.cards.forEach(c => {
  SIDX.push({ go: 'q' + q.n, n: q.n, h: q.cards[0].q, text: plain(c.q) + ' ' + c.blocks.filter(b => b.t !== 'ref').map(b => plain(b.text)).join(' ') });
  c.blocks.filter(b => b.t === 'ref' && !b.from).forEach(b => SIDX.push({ go: 'q' + q.n, n: q.n, h: q.cards[0].q, text: prettyRef(b.label) + ' ' + b.verses.map(v => v[1]).join(' ') }));
}));
SIDX.push({ go: 'vow', h: 'Обет члена церкви', text: D.vow.map(b => plain(b.text)).join(' ') });
SIDX.push({ go: 'intro', h: 'Вступление', text: D.intro.map(b => b.text).join(' ') });
APPS.forEach(a => SIDX.push({ go: a.id, h: 'Дополнение: ' + a.title, text: a.blocks.map(b => plain(b.text)).join(' ') }));
SIDX.forEach(r => { r.nt = norm(r.text); });
function qRow(n, extra = '') {
  const q = QBY[n];
  return `<button type="button" class="qrow${isKnown(n) ? ' done' : ''}" data-q="q${n}"><span class="no">${isKnown(n) ? IC.check.replace('<svg', '<svg width="18" height="18"') : n}</span><span class="tx">${fmt(q.cards[0].q, false)}</span><span class="side">${S.bm.includes(n) ? `<span class="bmk">${IC.bm}</span>` : ''}${IC.right}</span>${extra}</button>`;
}
V.list = () => {
  const v = $('#v-list');
  v.innerHTML = `<div class="stack">
    <label class="search">${IC.search}<input id="q" type="search" placeholder="Поиск: слово, фраза или «Откр. 14»" value="${esc(LS.query)}" autocomplete="off"><button type="button" id="qClear" ${LS.query ? '' : 'hidden'}>Очистить</button></label>
    <div class="chips" id="filters">${[['all', 'Все', QN], ['todo', 'Не выучены', QN - S.qk.length], ['done', 'Выучены', S.qk.length], ['bm', 'Закладки', S.bm.length], ['memo', 'Есть наизусть', QS.filter(qHasMemo).length]].map(([k, n, c]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${LS.filter === k}" ${c ? '' : 'disabled'}>${n} <span class="n">${c}</span></button>`).join('')}</div>
    <div id="listBody"></div>
  </div>`;
  const inp = $('#q');
  let t = 0;
  inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { LS.query = inp.value; $('#qClear').hidden = !inp.value; drawList(); }, 120); };
  $('#qClear').onclick = () => { LS.query = ''; inp.value = ''; $('#qClear').hidden = true; drawList(); inp.focus(); };
  $$('[data-f]', v).forEach(b => b.onclick = () => { LS.filter = b.dataset.f; $$('[data-f]', v).forEach(x => x.setAttribute('aria-pressed', x === b)); drawList(); });
  drawList();
};
function drawList() {
  const body = $('#listBody');
  const q = norm(LS.query.trim());
  if (q.length >= 2) {
    const words = q.split(/\s+/);
    const hits = SIDX.filter(r => words.every(w => r.nt.includes(w)));
    if (!hits.length) { body.innerHTML = '<div class="empty">Ничего не найдено. Попробуйте начало слова.</div>'; return; }
    body.innerHTML = `<div class="sec-h">Найдено: ${hits.length}</div><div class="qlist">${hits.slice(0, 100).map(r => {
      const pos = r.nt.indexOf(words[0]), start = Math.max(0, pos - 60);
      let x = esc((start ? '…' : '') + plain(r.text).slice(start, pos + 140) + '…');
      words.forEach(w => { x = x.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[её]') + ')', 'gi'), '<mark>$1</mark>'); });
      return `<button type="button" class="qrow" data-q="${r.go}"><span class="no">${r.n || '•'}</span><span class="tx" style="-webkit-line-clamp:1">${fmt(r.h, false)}</span><span class="side">${IC.right}</span><span class="res-x">${x}</span></button>`;
    }).join('')}</div>`;
    return;
  }
  const keep = n => LS.filter === 'all' || (LS.filter === 'todo' && !isKnown(n)) || (LS.filter === 'done' && isKnown(n)) || (LS.filter === 'bm' && S.bm.includes(n)) || (LS.filter === 'memo' && qHasMemo(QBY[n]));
  let h = '';
  SECTIONS.forEach(s => { const ns = s.qs.filter(keep); if (ns.length) h += `<div class="sec-h">${esc(s.name)}</div><div class="qlist">${ns.map(n => qRow(n)).join('')}</div>`; });
  if (!h) h = '<div class="empty">В этом списке пока пусто.</div>';
  if (LS.filter === 'all') h += `<div class="sec-h">Ещё в книге</div><div class="qlist">
    <button type="button" class="qrow" data-q="vow"><span class="no">✦</span><span class="tx">Обет члена церкви</span><span class="side">${IC.right}</span></button>
    <button type="button" class="qrow" data-q="intro"><span class="no">✦</span><span class="tx">Вступление</span><span class="side">${IC.right}</span></button>
    ${APPS.map((a, i) => `<button type="button" class="qrow" data-q="${a.id}"><span class="no">Д${i + 1}</span><span class="tx">${esc(a.title)} <span class="muted">· ${esc(a.forLabel.toLowerCase())}</span></span><span class="side">${IC.right}</span></button>`).join('')}</div>`;
  body.innerHTML = h;
}

/* ---------- PAGE (question, vow, intro, appendix) */
V.page = arg => {
  const v = $('#v-page');
  const back = `<div class="pagebar"><button class="back" type="button" id="backList">${IC.back} Все вопросы</button>${/^q\d+$/.test(arg) ? `<span class="label">${arg.slice(1)} из ${QN}</span>` : ''}</div>`;
  if (/^q\d+$/.test(arg) && QBY[+arg.slice(1)]) {
    const n = +arg.slice(1), q = QBY[n];
    S.last = n; save();
    const apps = APPS.filter(a => a.for.includes(n));
    const memos = MEMO.filter(m => m.qn === n);
    const prev = QBY[n - 1], next = QBY[n + 1];
    v.innerHTML = back + `<article class="qpage">
      <div class="q-sec">${esc(q.section)}</div>
      <h1 class="q-title">${fmt(q.cards[0].q)}</h1>
      <div class="q-tools">
        <button class="btn" type="button" id="tKnown" aria-pressed="${isKnown(n)}">${IC.check}${isKnown(n) ? 'Выучено' : 'Отметить выученным'}</button>
        <button class="btn bmb" type="button" id="tBm" aria-pressed="${S.bm.includes(n)}">${S.bm.includes(n) ? 'В закладках' : 'В закладки'}</button>
        ${TTS ? '<button class="btn" type="button" id="tSpeak">Слушать</button>' : ''}
      </div>
      ${q.cards.map((c, i) => (i ? `<h2 class="sub">${fmt(c.q)}</h2>` : '') + `<div class="blocks">${renderBlocks(c.blocks)}${!c.blocks.length ? '<p class="note">На этот вопрос отвечают лично, своими словами.</p>' : ''}</div>`).join('')}
      ${apps.length || memos.length ? `<div class="links">${memos.map(m => `<button class="linkrow" type="button" data-memo="${m.id}"><span>Учить наизусть: ${esc(m.title)}<small>${esc(m.src)}</small></span>${IC.right}</button>`).join('')}${apps.map(a => `<button class="linkrow" type="button" data-q="${a.id}"><span>Дополнение: ${esc(a.title)}<small>${esc(a.forLabel)}</small></span>${IC.right}</button>`).join('')}</div>` : ''}
      <nav class="pn"><button type="button" ${prev ? `data-q="q${n - 1}"` : 'disabled'}><small>← Вопрос ${n - 1}</small><span>${prev ? esc(plain(prev.cards[0].q)) : ''}</span></button><button type="button" ${next ? `data-q="q${n + 1}"` : 'data-q="vow"'}><small>${next ? 'Вопрос ' + (n + 1) + ' →' : 'Обет →'}</small><span>${next ? esc(plain(next.cards[0].q)) : 'Обет члена церкви'}</span></button></nav>
    </article>`;
    $('#tKnown').onclick = () => { const on = toggleIn(S.qk, n); toast(on ? 'Вопрос ' + n + ' отмечен выученным' : 'Отметка снята'); rerender(); };
    $('#tBm').onclick = () => { const on = toggleIn(S.bm, n); toast(on ? 'Добавлено в закладки' : 'Убрано из закладок'); rerender(); };
    const sp = $('#tSpeak');
    if (sp) sp.onclick = () => speak(q.cards.map(c => [c.q, ...c.blocks.map(b => b.t === 'ref' ? (S.set.compact ? '' : b.verses.map(x => x[1]).join(' ')) : b.text || '')].join(' ')).join(' '), sp);
  } else if (arg === 'vow') {
    let h = '', inList = false;
    D.vow.forEach(b => { if (b.t === 'li') { if (!inList) { h += '<ul class="vowtext">'; inList = true; } h += `<li>${fmt(b.text, false)}</li>`; } else { if (inList) { h += '</ul>'; inList = false; } h += `<p>${fmt(b.text, false)}</p>`; } });
    if (inList) h += '</ul>';
    v.innerHTML = back + `<article class="qpage"><div class="q-sec">Завершение</div><h1 class="q-title">Обет члена церкви</h1>
      <p class="hint" style="font-family:var(--f-ui)">В скобках курсивом — форма для сестёр.</p>
      <div class="prose">${h}</div>
      <div class="links"><button class="linkrow" type="button" data-memo="mvow"><span>Учить обет наизусть<small>Пять шагов: от чтения до записи по памяти</small></span>${IC.right}</button></div>
      <nav class="pn"><button type="button" data-q="q${QN}"><small>← Вопрос ${QN}</small><span>${esc(plain(QBY[QN].cards[0].q))}</span></button><button type="button" data-q="d1"><small>Дополнения →</small><span>${esc(APPS[0].title)}</span></button></nav></article>`;
  } else if (arg === 'intro') {
    v.innerHTML = back + `<article class="qpage"><div class="q-sec">Перед вопросами</div><h1 class="q-title">Вступление</h1><div class="prose">${D.intro.map(b => b.t === 'h' ? `<h3>${esc(b.text)}</h3>` : `<p>${fmt(b.text)}</p>`).join('')}</div>
      <nav class="pn"><button type="button" disabled></button><button type="button" data-q="q1"><small>Вопрос 1 →</small><span>${esc(plain(QBY[1].cards[0].q))}</span></button></nav></article>`;
  } else {
    const i = APPS.findIndex(a => a.id === arg);
    const a = APPS[i >= 0 ? i : 0];
    let h = '', inList = false;
    a.blocks.forEach(b => {
      if (b.t === 'li') { if (!inList) { h += '<ul>'; inList = true; } h += `<li>${fmt(b.text)}</li>`; return; }
      if (inList) { h += '</ul>'; inList = false; }
      h += b.t === 'h' ? `<h3>${esc(b.text)}</h3>` : `<p>${fmt(b.text)}</p>`;
    });
    if (inList) h += '</ul>';
    const pa = APPS[i - 1], na = APPS[i + 1];
    v.innerHTML = back + `<article class="qpage"><div class="q-sec">Дополнение · ${esc(a.forLabel)}</div><h1 class="q-title">${esc(a.title)}</h1>
      <div class="links">${a.for.map(n => `<button class="linkrow" type="button" data-q="q${n}"><span>Вопрос ${n}<small>${esc(clip(plain(QBY[n].cards[0].q), 90))}</small></span>${IC.right}</button>`).join('')}</div>
      <div class="prose">${h}</div>
      <nav class="pn"><button type="button" data-q="${pa ? pa.id : 'vow'}"><small>← ${pa ? 'Дополнение' : 'Обет'}</small><span>${pa ? esc(pa.title) : 'Обет члена церкви'}</span></button><button type="button" ${na ? `data-q="${na.id}"` : 'disabled'}><small>Дополнение →</small><span>${na ? esc(na.title) : ''}</span></button></nav></article>`;
  }
  $('#backList').onclick = () => go('list');
};

/* ---------- CARDS: endless random texts */
const CD = { src: 'all', unit: null, shown: 0, open: false, recent: [], n: 0, ok: 0 };
const UNITS = [...TEXTS.map(t => ({ ...t, kind: 'text', words: t.verses.flatMap(v => tokens(v[1])) })), ...ANSWERS.map(a => ({ ...a, kind: 'answer', words: tokens(a.text) }))];
function cardPool(src) {
  if (src === 'text') return UNITS.filter(u => u.kind === 'text');
  if (src === 'answer') return UNITS.filter(u => u.kind === 'answer');
  if (src === 'memo') return UNITS.filter(u => u.kind === 'text' && u.memo);
  if (src === 'hard') return UNITS.filter(u => { const i = txInfo(u.id); return i.miss > i.ok; });
  return UNITS;
}
const startLen = u => Math.max(2, Math.min(8, Math.round(u.words.length * .25)));
function nextCard() {
  const pool = cardPool(CD.src);
  if (!pool.length) { CD.unit = null; return; }
  const avoid = new Set(CD.recent.slice(-Math.min(12, pool.length - 1)));
  const cand = pool.filter(u => !avoid.has(u.id));
  const ws = cand.map(u => { const i = txInfo(u.id); return i.ok + i.miss === 0 ? 1.3 : Math.max(.2, (1 + 2 * i.miss) / (1 + i.ok)); });
  let r = Math.random() * ws.reduce((a, b) => a + b, 0), k = 0;
  while (k < cand.length - 1 && (r -= ws[k]) > 0) k++;
  CD.unit = cand[k]; CD.recent.push(CD.unit.id); if (CD.recent.length > 40) CD.recent.shift();
  CD.shown = startLen(CD.unit); CD.open = false;
}
V.cards = () => {
  if (!CD.unit || !cardPool(CD.src).some(u => u.id === CD.unit.id)) nextCard();
  const v = $('#v-cards');
  const chips = [['all', 'Всё'], ['text', 'Тексты Писания'], ['answer', 'Ответы'], ['memo', 'Наизусть'], ['hard', 'Трудные']];
  let body;
  const u = CD.unit;
  if (!u) body = `<div class="card empty">${CD.src === 'hard' ? 'Трудных карточек нет. Если не вспомните текст, он появится здесь.' : 'Здесь пока пусто.'}</div>`;
  else {
    const isText = u.kind === 'text';
    const head = isText ? '<span class="tag memo" style="background:var(--surface-2);color:var(--ink-2)">Текст Писания</span>' + (u.memo ? '<span class="tag memo">наизусть</span>' : '')
      : '<span class="tag" style="background:var(--accent-soft);color:var(--accent)">Ответ на вопрос ' + u.qn + '</span>';
    const begin = u.words.slice(0, CD.shown).join(' ');
    const src = isText
      ? `<div class="fc-src"><b>${esc(u.label)}</b>${u.qns.map(n => `<button class="linkrow" type="button" data-q="q${n}"><span>Вопрос ${n}<small>${esc(clip(plain(QBY[n].cards[0].q), 100))}</small></span>${IC.right}</button>`).join('')}</div>`
      : `<button class="linkrow" type="button" data-q="q${u.qn}"><span>Открыть вопрос ${u.qn}<small>с текстами Писания</small></span>${IC.right}</button>`;
    body = `<div class="fcard">
      <div class="fc-kind">${head}</div>
      ${!isText ? `<div class="fc-q">${u.parent ? esc(clip(plain(u.parent), 80)) + ' — ' : ''}<b style="color:var(--ink)">${fmt(u.q, false)}</b></div>` : ''}
      ${CD.open ? `<div class="fc-full${isText ? '' : ' plain'}">${isText ? versesHtml(u.verses) : `<p>${fmt(u.text, false)}</p>`}</div>${src}
        <div class="grid2"><button class="btn bad" type="button" id="cMiss">Не вспомнил</button><button class="btn good" type="button" id="cOk">Вспомнил</button></div>`
      : `<div class="fc-start">${fmt(begin, false)}${CD.shown < u.words.length ? ' <span class="more">…</span>' : ''}</div>
        <p class="hint">${isText ? 'Вспомните продолжение текста и откуда он.' : 'Вспомните ответ полностью.'}</p>
        <div class="grid2"><button class="btn" type="button" id="cHint" ${CD.shown >= u.words.length ? 'disabled' : ''}>Ещё слово</button><button class="btn primary" type="button" id="cOpen">Показать</button></div>`}
    </div>
    <div class="row" style="justify-content:space-between"><div class="stats-line"><span>Сегодня: <b>${CD.n}</b></span><span>Вспомнил: <b>${CD.ok}</b></span></div><button class="btn small" type="button" id="cSkip">Другой текст ${IC.right}</button></div>
    <div class="kbd"><kbd>Пробел</kbd> показать · <kbd>→</kbd> ещё слово · <kbd>1</kbd> не вспомнил · <kbd>2</kbd> вспомнил</div>`;
  }
  v.innerHTML = `<div class="stack">
    <div><h2 class="h-title">Карточки</h2><p class="lead">Показывается начало случайного текста из книги — вспомните продолжение. Карточки не кончаются; трудные тексты попадаются чаще.</p></div>
    <div class="chips">${chips.map(([k, n]) => { const c = cardPool(k).length; return `<button type="button" class="chip" data-src="${k}" aria-pressed="${CD.src === k}" ${c ? '' : 'disabled'}>${n} <span class="n">${c}</span></button>`; }).join('')}</div>
    ${body}
  </div>`;
  $$('[data-src]', v).forEach(b => b.onclick = () => { CD.src = b.dataset.src; nextCard(); V.cards(); });
  const on = (id, f) => { const el = $('#' + id); if (el) el.onclick = f; };
  on('cHint', cardHint); on('cOpen', cardOpen); on('cOk', () => cardRate(true)); on('cMiss', () => cardRate(false));
  on('cSkip', () => { nextCard(); V.cards(); });
};
function cardHint() { if (!CD.unit || CD.open) return; CD.shown = Math.min(CD.unit.words.length, CD.shown + 1); V.cards(); }
function cardOpen() { if (!CD.unit) return; CD.open = true; V.cards(); }
function cardRate(ok) {
  const u = CD.unit; if (!u) return;
  const i = { ...txInfo(u.id) }; if (ok) i.ok++; else i.miss++; i.t = Date.now();
  S.tx[u.id] = i; save();
  CD.n++; if (ok) CD.ok++;
  nextCard(); V.cards(); window.scrollTo(0, 0);
}

/* ---------- MEMORISE */
const MT = { id: null, mode: 0, verse: 0, seed: 1, rev: new Set(), result: null, draft: '' };
const memoVerses = m => m.vow ? vowVerses(S.set.g) : m.verses;
function rnd(seed) { let x = seed; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; }
V.memo = () => {
  const v = $('#v-memo');
  if (!MT.id) {
    const row = m => { const i = memoInfo(m.id); return `<button type="button" class="mrow" data-mid="${m.id}"><b>${esc(m.title)}</b><span class="steps-dots">${MODES.map((_, k) => `<i class="${i.seen && k <= i.lvl ? 'on' : ''}"></i>`).join('')}${i.best >= 90 ? '<span class="tag done ok">выучено</span>' : ''}</span><small>${esc(m.src)}${m.qn ? ' · вопрос ' + m.qn : ''}${i.best && i.best < 90 ? ' · лучший результат ' + i.best + '%' : ''}</small></button>`; };
    v.innerHTML = `<div class="stack">
      <div><h2 class="h-title">Наизусть</h2><p class="lead">Всё, что в «Добром исповедании» требуется знать наизусть. Каждый текст учится в пять шагов. Текст выучен, когда запись по памяти совпадает на 90% и больше.</p></div>
      <div class="mlist">${row(MEMO[0])}</div>
      <div class="sec-h" style="margin-top:4px">Тексты Писания</div><div class="mlist">${MEMO.filter(m => !m.vow && !/^mgifts|^mfruit|^marmor/.test(m.id)).map(row).join('')}</div>
      <div class="sec-h" style="margin-top:4px">Перечни из вопроса 9</div><div class="mlist">${MEMO.filter(m => /^mgifts|^mfruit|^marmor/.test(m.id)).map(row).join('')}</div>
    </div>`;
    $$('[data-mid]', v).forEach(b => b.onclick = () => { MT.id = b.dataset.mid; MT.mode = 0; MT.verse = 0; MT.rev = new Set(); MT.result = null; MT.draft = ''; V.memo(); syncBack(); window.scrollTo(0, 0); });
    return;
  }
  const m = MEMO.find(x => x.id === MT.id);
  const info = memoInfo(m.id);
  if (!info.seen || MT.mode > info.lvl) { S.memo[m.id] = { ...info, seen: true, lvl: Math.max(info.lvl, MT.mode) }; save(); }
  const all = memoVerses(m);
  const verses = MT.verse ? all.filter(x => x[0] === MT.verse) : all;
  let body = '';
  if (MT.mode === 4) {
    body = `<textarea class="write" id="mIn" placeholder="Напишите текст по памяти…" spellcheck="false">${esc(MT.draft)}</textarea>
      <div class="grid2"><button class="btn" type="button" id="mClear">Очистить</button><button class="btn primary" type="button" id="mCheck">Проверить</button></div>`;
    if (MT.result) body += `<div class="card" style="padding:18px;display:grid;gap:12px"><div class="score"><span class="pct" style="color:${MT.result.pct >= 90 ? 'var(--good)' : MT.result.pct >= 60 ? 'var(--gold)' : 'var(--bad)'}">${MT.result.pct}%</span><span>${MT.result.pct >= 90 ? 'Отлично, текст выучен!' : MT.result.pct >= 60 ? 'Хорошо, но есть пропуски.' : 'Повторите шаги «Пропуски» и «Скрыто».'}</span></div><div class="mtext" style="border:0;padding:0">${MT.result.html}</div><p class="hint">Красным отмечены слова, которых нет в записи или которые написаны с ошибкой.</p></div>`;
  } else {
    const r = rnd(MT.seed * 7919 + 13);
    let wi = 0;
    body = `<div class="mtext" id="mText">${verses.map(x => `<p>${x[0] ? `<sup class="v">${x[0]}</sup>` : ''}${tokens(dash(x[1])).map(w => {
      const i = wi++, rev = MT.rev.has(i), core = coreOf(w);
      if (MT.mode === 0 || !core) return esc(w);
      if (MT.mode === 1) {
        if (rev) return `<span class="w shown">${esc(w)}</span>`;
        const p = w.match(/^([^А-ЯЁа-яёA-Za-z0-9]*[А-ЯЁа-яёA-Za-z0-9])(.*)$/);
        return p ? `<span class="w hint" data-w="${i}">${esc(p[1])}<span class="rest">${esc(p[2])}</span></span>` : esc(w);
      }
      if (!(MT.mode === 3 || (core.length > 2 && r() < .5))) return esc(w);
      return rev ? `<span class="w shown">${esc(w)}</span>` : `<span class="w hide" data-w="${i}">${esc(w)}</span>`;
    }).join(' ')}</p>`).join('')}</div>`;
    const btns = [];
    if (MT.mode === 3) btns.push('<button class="btn primary" type="button" id="mNextW">Открыть следующее слово</button>');
    if (MT.mode === 2) btns.push('<button class="btn" type="button" id="mSeed">Другие пропуски</button>');
    if (MT.mode > 0) btns.push('<button class="btn" type="button" id="mAll">Показать всё</button>');
    if (TTS) btns.push('<button class="btn" type="button" id="mSay">Слушать</button>');
    btns.push(`<button class="btn${MT.mode === 0 ? ' primary' : ''}" type="button" id="mNext">Дальше: ${MODES[MT.mode + 1].n} ${IC.right}</button>`);
    body += `<div class="row">${btns.join('')}</div>`;
  }
  v.innerHTML = `<div class="stack">
    <div class="pagebar" style="margin:0"><button class="back" type="button" id="mBack">${IC.back} Все тексты</button>${m.qn ? `<button class="back" type="button" data-q="q${m.qn}">Вопрос ${m.qn}</button>` : ''}</div>
    <div><div class="q-sec">${esc(m.src)}</div><h2 class="h-title">${esc(m.title)}</h2></div>
    ${m.vow ? `<div class="row"><span class="label">Форма текста:</span><div class="seg" role="group"><button type="button" data-g="m" aria-pressed="${S.set.g !== 'f'}">Для брата</button><button type="button" data-g="f" aria-pressed="${S.set.g === 'f'}">Для сестры</button></div></div>` : ''}
    <div class="stepper" role="group" aria-label="Шаг">${MODES.map((x, i) => `<button type="button" data-mode="${i}" aria-pressed="${MT.mode === i}"><b>${i + 1}</b>${x.n}</button>`).join('')}</div>
    <p class="hint">${MODES[MT.mode].hint}</p>
    ${all.length > 1 && !m.vow ? `<div class="chips"><button type="button" class="chip" data-verse="0" aria-pressed="${MT.verse === 0}">Весь текст</button>${all.map(x => `<button type="button" class="chip" data-verse="${x[0]}" aria-pressed="${MT.verse === x[0]}">ст. ${x[0]}</button>`).join('')}</div>` : ''}
    ${body}
  </div>`;
  const on = (id, f) => { const el = $('#' + id); if (el) el.onclick = f; };
  const reset = () => { MT.rev = new Set(); MT.result = null; };
  on('mBack', () => { MT.id = null; V.memo(); syncBack(); window.scrollTo(0, 0); });
  $$('[data-mode]', v).forEach(b => b.onclick = () => { MT.mode = +b.dataset.mode; reset(); V.memo(); });
  $$('[data-verse]', v).forEach(b => b.onclick = () => { MT.verse = +b.dataset.verse; reset(); MT.draft = ''; V.memo(); });
  $$('[data-g]', v).forEach(b => b.onclick = () => { S.set.g = b.dataset.g; save(); reset(); V.memo(); });
  const mt = $('#mText');
  if (mt) mt.addEventListener('click', e => { const w = e.target.closest('[data-w]'); if (w) { MT.rev.add(+w.dataset.w); w.className = 'w shown'; w.textContent = w.textContent; } });
  on('mNextW', () => { const w = $$('[data-w]', v).find(w => !MT.rev.has(+w.dataset.w)); if (w) { MT.rev.add(+w.dataset.w); w.className = 'w shown'; w.textContent = w.textContent; } });
  on('mSeed', () => { MT.seed++; reset(); V.memo(); });
  on('mAll', () => { $$('[data-w]', v).forEach(w => MT.rev.add(+w.dataset.w)); V.memo(); });
  on('mSay', () => speak(verses.map(x => x[1]).join(' '), $('#mSay')));
  on('mNext', () => { MT.mode++; reset(); V.memo(); });
  on('mClear', () => { MT.draft = ''; reset(); V.memo(); });
  const inp = $('#mIn');
  if (inp) inp.oninput = () => { MT.draft = inp.value; };
  on('mCheck', () => {
    MT.draft = inp.value;
    MT.result = compareText(verses, inp.value);
    const c = memoInfo(m.id);
    S.memo[m.id] = { ...c, seen: true, lvl: 4, best: MT.verse ? (c.best || 0) : Math.max(c.best || 0, MT.result.pct) };
    save(); V.memo();
  });
};
function compareText(verses, typed) {
  const orig = []; verses.forEach(v => tokens(dash(v[1])).forEach(w => orig.push(w)));
  const a = orig.map(coreOf), b = tokens(typed).map(coreOf).filter(Boolean);
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] && a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ok = new Array(n).fill(false);
  let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] && a[i] === b[j]) { ok[i] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  const counted = a.filter(Boolean).length, good = ok.filter((x, k) => x && a[k]).length;
  const pct = counted ? Math.round(good / Math.max(counted, b.length) * 100) : 0;
  let k = 0;
  const html = verses.map(v => `<p>${tokens(dash(v[1])).map(w => { const idx = k++; return !a[idx] ? esc(w) : `<span class="w ${ok[idx] ? 'ok' : 'miss'}">${esc(w)}</span>`; }).join(' ')}</p>`).join('');
  return { pct, html };
}

/* ---------- QUIZ: only the book's own texts and answers */
const QZ = { items: null, pos: 0, picked: null, score: 0, size: 10, wrong: [] };
const STOP = new Set('который которые которая которого потому чтобы когда если этого также тогда между через перед после более всего всякий всякая всякое всяком такой такие таким такого будет будут может могут нашего вашего своего своей своих своим именно только вместе против говорю говоря'.split(' '));
const VERSES = []; TEXTS.forEach(t => t.verses.forEach(v => { if (v[0]) VERSES.push({ t, v, w: tokens(v[1]) }); }));
const WORDBANK = (() => { const s = new Set(); VERSES.forEach(x => x.w.forEach(w => { const c = coreOf(w); if (c.length >= 5 && !STOP.has(c)) s.add(c); })); ANSWERS.forEach(a => tokens(a.text).forEach(w => { const c = coreOf(w); if (c.length >= 5 && !STOP.has(c)) s.add(c); })); return [...s]; })();
const verseRef = x => prettyRef(x.t.key.replace(/:.*$/, '').replace(/гл$|весь$/, '') + ':' + x.v[0]);
const qShort = n => 'Вопрос ' + n + ': ' + clip(plain(QBY[n].cards[0].q), 110);
function qAnswer() {
  const pool = ANSWERS.filter(a => a.text.length >= 15);
  const a = pickOne(pool);
  const right = clip(dash(plain(a.text)), 170);
  const wrong = shuffle(pool.filter(x => x.qn !== a.qn)).map(x => clip(dash(plain(x.text)), 170)).filter(x => x !== right);
  return { kind: 'Выберите ответ', prompt: fmt(a.q, false), sub: a.parent ? clip(plain(a.parent), 90) : '', right, opts: [right, ...wrong.slice(0, 3)], after: `<button class="linkrow" type="button" data-q="q${a.qn}"><span>Вопрос ${a.qn} полностью<small>ответ с текстами Писания</small></span>${IC.right}</button>` };
}
function verseAfter(x) {
  return `<div class="full"><b style="font-family:var(--f-ui)">${esc(verseRef(x))}</b> — ${fmt(x.v[1], false)}</div>${x.t.qns.slice(0, 2).map(n => `<button class="linkrow" type="button" data-q="q${n}"><span>${esc(qShort(n))}</span>${IC.right}</button>`).join('')}`;
}
function qContinue() {
  const pool = VERSES.filter(x => x.w.length >= 10);
  const x = pickOne(pool), cut = Math.floor(x.w.length / 2);
  const tail = y => clip(y.w.slice(Math.floor(y.w.length / 2)).join(' '), 140);
  const right = tail(x);
  const wrong = shuffle(pool.filter(y => y !== x)).map(tail).filter(t => t !== right).slice(0, 3);
  return { kind: 'Продолжите текст', verse: true, prompt: '«' + fmt(x.w.slice(0, cut).join(' '), false) + ' …»', right, opts: [right, ...wrong], after: verseAfter(x) };
}
function qBlank() {
  const fromVerse = Math.random() < .65;
  let words, after, label;
  if (fromVerse) { const x = pickOne(VERSES.filter(y => y.w.length >= 8)); words = x.w; after = verseAfter(x); label = 'Вставьте пропущенное слово в текст'; }
  else { const a = pickOne(ANSWERS.filter(y => tokens(y.text).length >= 8)); words = tokens(dash(plain(a.text))); label = 'Вставьте пропущенное слово в ответ на вопрос ' + a.qn; after = `<div class="full">${fmt(a.text, false)}</div><button class="linkrow" type="button" data-q="q${a.qn}"><span>${esc(qShort(a.qn))}</span>${IC.right}</button>`; }
  const idxs = words.map((w, i) => i).filter(i => { const c = coreOf(words[i]); return c.length >= 5 && !STOP.has(c); });
  if (!idxs.length) return qContinue();
  const i = pickOne(idxs), core = coreOf(words[i]);
  const shape = w => /^[А-ЯЁ]/.test(words[i].replace(/^[^А-ЯЁа-яё]+/, '')) ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  const right = shape(core);
  const same = WORDBANK.filter(w => w !== core && w.slice(-2) === core.slice(-2));
  const wrong = [...new Set(shuffle(same.length >= 3 ? same : WORDBANK.filter(w => w !== core)).slice(0, 3))].map(shape);
  const s = Math.max(0, i - 16), e = Math.min(words.length, i + 17);
  const lead = words[i].match(/^[^А-ЯЁа-яёA-Za-z0-9]*/)[0], trail = words[i].match(/[^А-ЯЁа-яёA-Za-z0-9]*$/)[0];
  const text = (s ? '… ' : '') + esc(words.slice(s, i).join(' ')) + ` ${esc(lead)}<span class="blank">&nbsp;</span>${esc(trail)} ` + esc(words.slice(i + 1, e).join(' ')) + (e < words.length ? ' …' : '');
  return { kind: label, verse: fromVerse, prompt: fromVerse ? '«' + text + '»' : text, right, opts: [right, ...wrong], after };
}
function qCited() {
  const pool = QS.filter(q => TEXTS.some(t => t.qns.includes(q.n)));
  const q = pickOne(pool);
  const mine = VERSES.filter(x => x.t.qns.includes(q.n) && x.v[1].length > 30);
  if (!mine.length) return qAnswer();
  const x = pickOne(mine);
  const right = clip(x.v[1], 150);
  const wrong = shuffle(VERSES.filter(y => !y.t.qns.includes(q.n) && y.v[1].length > 30)).slice(0, 3).map(y => clip(y.v[1], 150));
  return { kind: 'Какой текст приведён к этому вопросу?', prompt: fmt(q.cards[0].q, false), right, opts: [right, ...wrong], optsVerse: true, after: verseAfter(x) };
}
function makeQuiz(size) {
  const plan = [];
  for (let i = 0; i < size; i++) plan.push([qAnswer, qContinue, qBlank, qCited, qAnswer, qContinue, qBlank, qBlank, qCited, qContinue][i % 10]);
  const out = [], seen = new Set();
  shuffle(plan).forEach(f => { for (let k = 0; k < 6; k++) { const it = f(); if (!seen.has(it.right + it.prompt)) { seen.add(it.right + it.prompt); out.push(it); break; } } });
  return out.map(it => ({ ...it, opts: shuffle([...new Set(it.opts)]) }));
}
V.quiz = () => {
  if (!QZ.items) { QZ.items = makeQuiz(QZ.size); QZ.pos = 0; QZ.picked = null; QZ.score = 0; QZ.wrong = []; }
  const v = $('#v-quiz'), total = QZ.items.length;
  const top = `<div><h2 class="h-title">Тест</h2><p class="lead">Только по тексту книги: ответы на вопросы и тексты Писания.</p></div>
    <div class="row" style="justify-content:space-between"><div class="seg" role="group" aria-label="Длина теста">${[10, 20, 30].map(n => `<button type="button" data-size="${n}" aria-pressed="${QZ.size === n}">${n}</button>`).join('')}</div><button class="btn small" type="button" id="qNew">Начать заново</button></div>`;
  if (QZ.pos >= total) {
    const pct = Math.round(QZ.score / total * 100);
    v.innerHTML = `<div class="stack">${top}<div class="card result"><span class="label">Результат</span><span class="big" style="color:${pct >= 80 ? 'var(--good)' : pct >= 50 ? 'var(--gold)' : 'var(--bad)'}">${pct}%</span><span>${QZ.score} из ${total} верно</span><p class="muted">${pct >= 90 ? 'Превосходно!' : pct >= 70 ? 'Хорошо. Посмотрите ошибки ниже.' : 'Почитайте вопросы с ошибками и попробуйте снова.'}</p><button class="btn primary" type="button" id="qAgain">Новый тест</button></div>
      ${QZ.wrong.length ? `<div class="sec-h">Ошибки</div><div class="mist">${QZ.wrong.map(w => `<div class="m"><span class="label">${esc(w.kind)}</span><div>${w.prompt}</div><div><span class="muted">Правильно:</span> <b>${esc(w.right)}</b></div>${w.after}</div>`).join('')}</div>` : ''}</div>`;
    $('#qAgain').onclick = () => { QZ.items = null; V.quiz(); window.scrollTo(0, 0); };
  } else {
    const it = QZ.items[QZ.pos], ans = QZ.picked != null;
    v.innerHTML = `<div class="stack">${top}
      <div class="stats-line"><span>Вопрос <b>${QZ.pos + 1}</b> из ${total}</span><span>Верно: <b>${QZ.score}</b></span></div>
      <div class="bar"><i style="width:${QZ.pos / total * 100}%;background:var(--accent)"></i></div>
      <div class="qz"><span class="label">${esc(it.kind)}</span>${it.sub ? `<div class="fc-q">${esc(it.sub)}</div>` : ''}
        <div class="qz-prompt${it.verse ? ' verse' : ''}">${it.prompt}</div>
        <div class="opts">${it.opts.map((o, i) => { let c = ''; if (ans) { if (o === it.right) c = ' right'; else if (i === QZ.picked) c = ' wrong'; } return `<button type="button" class="opt${c}" data-o="${i}" ${ans ? 'disabled' : ''}><span class="k">${'АБВГ'[i]}</span><span${it.optsVerse ? ' style="font-family:var(--f-book)"' : ''}>${esc(o)}</span></button>`; }).join('')}</div>
        ${ans ? `<div class="after"><span class="verdict ${it.opts[QZ.picked] === it.right ? 'ok">Верно!' : 'no">Неверно'}</span>${it.after}<button class="btn primary wide" type="button" id="qNext">${QZ.pos + 1 < total ? 'Следующий вопрос' : 'Посмотреть результат'}</button></div>` : ''}
      </div></div>`;
    $$('[data-o]', v).forEach(b => b.onclick = () => { QZ.picked = +b.dataset.o; if (it.opts[QZ.picked] === it.right) QZ.score++; else QZ.wrong.push(it); V.quiz(); });
    const n = $('#qNext'); if (n) { n.onclick = nextQuiz; n.scrollIntoView({ block: 'nearest' }); }
  }
  $$('[data-size]', v).forEach(b => b.onclick = () => { QZ.size = +b.dataset.size; QZ.items = null; V.quiz(); });
  $('#qNew').onclick = () => { QZ.items = null; V.quiz(); };
};
function nextQuiz() {
  QZ.pos++; QZ.picked = null;
  if (QZ.pos >= QZ.items.length) { const pct = Math.round(QZ.score / QZ.items.length * 100); S.quiz = { best: Math.max(S.quiz.best || 0, pct), runs: (S.quiz.runs || 0) + 1 }; save(); }
  V.quiz(); window.scrollTo(0, 0);
}

/* ---------- keyboard */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeOverlays(); return; }
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (cur.view === 'cards' && CD.unit) {
    if (e.key === ' ' && !CD.open) { e.preventDefault(); cardOpen(); }
    else if (e.key === 'ArrowRight' && !CD.open) cardHint();
    else if (CD.open && (e.key === '1' || e.key === '2')) cardRate(e.key === '2');
  }
  if (cur.view === 'quiz' && QZ.items && QZ.pos < QZ.items.length) {
    if (QZ.picked == null && ['1', '2', '3', '4'].includes(e.key)) { const b = $(`[data-o="${+e.key - 1}"]`); if (b) b.click(); }
    else if (QZ.picked != null && e.key === 'Enter') { e.preventDefault(); nextQuiz(); }
  }
  if (cur.view === 'page' && /^q\d+$/.test(cur.arg)) {
    const n = +cur.arg.slice(1);
    if (e.key === 'ArrowRight' && QBY[n + 1]) go('page', 'q' + (n + 1));
    if (e.key === 'ArrowLeft' && QBY[n - 1]) go('page', 'q' + (n - 1));
  }
});
window.addEventListener('resize', () => { $('#hdrTitle').textContent = window.innerWidth <= 760 ? TITLES[cur.view] : 'Доброе исповедание'; });

/* ---------- offline */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* works online without it */ }); });
}

/* ---------- boot */
applyFont();
{
  const h = (location.hash || '').slice(1);
  if (/^q\d+$/.test(h) && QBY[+h.slice(1)] || h === 'vow' || h === 'intro' || /^d\d+$/.test(h) && APPS.some(a => a.id === h)) go('page', h);
  else go(TAB_OF[h] && h !== 'page' ? h : 'home');
}
