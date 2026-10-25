// Логика бота: команды, меню, запись операций, кнопки.

import { api, InputFile } from 'sdk';
import {
  getSetting, setSetting, ensureUser, setUserState, setUserCurrency, setUserTz,
  isAllowed, setAllowed, listCategories, getCategory, addCategory, archiveCategory, restoreCategory,
  updateCategory, setCategoryKeywords, addTransaction, getTransaction, deleteTransaction,
  setTransactionCategory, setTransactionDate, setTransactionAmount, setTransactionNote,
  lastCreatedTransaction, transactionsInRange, setBudget, wipeUserData,
} from './store.js';
import { parseText, parseAmountAndNote, parseBudgetText } from './parser.js';
import { guessCategory, fallbackCategory, learnableWord, splitEmoji, norm, stemWord } from './categories.js';
import { getAiConfig, aiReady, transcribe, parseWithLlm, checkKey } from './ai.js';
import {
  localToday, dayStart, addDays, toLocal, decodePeriod, periodBounds, parsePeriodText,
  findDateInText, currentPeriodCode, isValidYmd,
} from './dates.js';
import { buildWorkbook } from './export.js';
import { XLSX_MIME } from './xlsx.js';
import { esc, money, signedMoney, catLabel, catPath, plural, tzLabel } from './format.js';
import {
  send as tgSend, show as tgShow, edit, action, answer, remove, btn, appBtn, inline,
  MAIN_KEYBOARD, BOT_COMMANDS, APP_MENU_BUTTON,
} from './tg.js';
import { AI_PRESETS, CURRENCIES, MENU, MAX_VOICE_SECONDS } from './config.js';
import * as S from './screens.js';

const COMMANDS_VERSION = '2';

// ── Чистый чат ─────────────────────────────────────────────────────────────
// Всё, что бот отправил в ответ (меню, отчёты, подсказки, вопросы), кроме карточек
// записей, приветствия и файлов, — временное: при следующем сообщении пользователя
// бот это удаляет. Текстовые сообщения пользователя удаляются сразу после обработки
// (запись остаётся карточкой). Голосовые не трогаем. Выключается в ⚙️ Настройках.

const outbox = new Map(); // chatId → id временных сообщений, отправленных в этом обновлении

function track(chatId, m, editedId = null) {
  if (!m || typeof m !== 'object' || !m.message_id || m.message_id === editedId) return m;
  if (!outbox.has(chatId)) outbox.set(chatId, new Set());
  outbox.get(chatId).add(m.message_id);
  return m;
}
const send = async (chatId, text, extra) => track(chatId, await tgSend(chatId, text, extra));
const show = async (chatId, messageId, text, extra) => track(chatId, await tgShow(chatId, messageId, text, extra), messageId);

/** Сообщение остаётся в чате (карточка записи). ids — ещё id, которые стали карточкой. */
function keep(chatId, m, ...ids) {
  const set = outbox.get(chatId);
  if (set) for (const id of [m && m.message_id, ...ids]) set.delete(id);
  return m;
}

async function removeMany(chatId, ids) {
  if (!ids.length) return;
  try {
    await api.deleteMessages({ chat_id: chatId, message_ids: ids });
  } catch {
    for (const id of ids) await remove(chatId, id); // старые (>48 ч) Telegram удалить не даст — не страшно
  }
}

const ephKey = (c) => `eph:${c.user.tg_id}`;

// Удаляет временные сообщения прошлого шага.
async function sweep(c) {
  const raw = await getSetting(ephKey(c));
  if (!raw) return;
  await setSetting(ephKey(c), null);
  let ids = [];
  try { ids = JSON.parse(raw); } catch { /* испорчено — просто забываем */ }
  await removeMany(c.chatId, ids);
}

// Запоминает временные сообщения этого шага, чтобы удалить их на следующем.
async function stash(c) {
  const set = outbox.get(c.chatId);
  outbox.delete(c.chatId);
  if (!c.clean || !set || !set.size) return;
  let prev = [];
  try { prev = JSON.parse((await getSetting(ephKey(c))) || '[]'); } catch { prev = []; }
  await setSetting(ephKey(c), JSON.stringify([...prev, ...set].slice(-60)));
}

// ── Точки входа ────────────────────────────────────────────────────────────

export async function handleMessage(msg) {
  if (!msg || !msg.from || !msg.chat || msg.chat.type !== 'private' || msg.from.is_bot) return;
  const chatId = msg.chat.id;
  let c = null;
  try {
    c = await context(msg.from, chatId);
    if (!c) return;
    c.clean = (await getSetting(`clean:${c.user.tg_id}`)) !== 'off';
    if (c.clean) await sweep(c);
    try {
      await routeMessage(c, msg);
    } finally {
      if (c.clean && msg.text) await remove(chatId, msg.message_id);
    }
  } catch (e) {
    console.error('message failed', e);
    await send(chatId, '⚠️ Что-то пошло не так. Попробуйте ещё раз.').catch(() => {});
  } finally {
    if (c) await stash(c).catch(() => {});
    else outbox.delete(chatId);
  }
}

async function routeMessage(c, msg) {
  const chatId = c.chatId;
  if (c.isOwner) await ensureBotSetup();
  const text = String(msg.text || msg.caption || '').trim();
  // Новичок сразу написал трату — сначала покажем приветствие и меню.
  if (c.created && !/^\/start/.test(text)) await startScreen(c);
  if (msg.voice || msg.audio || msg.video_note) return await onVoice(c, msg);

  if (!text) {
    return await send(chatId, 'Я понимаю текст и голосовые 🙂\nНапример: <code>кофе 250</code> или <code>+50000 зарплата</code>.', MAIN_KEYBOARD);
  }
  if (text.startsWith('/')) {
    if (c.user.state) await clearState(c);
    return await onCommand(c, text, msg);
  }
  const menuKey = Object.keys(MENU).find((k) => MENU[k] === text);
  if (menuKey) {
    if (c.user.state) await clearState(c);
    return await onMenu(c, menuKey);
  }
  if (c.user.state) return await onStateInput(c, text, msg);
  return await onEntry(c, text, { source: 'text' });
}

export async function handleCallback(q) {
  if (!q || !q.from || !q.message) return answer(q && q.id);
  const chatId = q.message.chat.id;
  const msgId = q.message.message_id;
  let c = null;
  try {
    c = await context(q.from, chatId, true);
    if (!c) return await answer(q.id, 'Нет доступа', true);
    c.msgId = msgId;
    c.cbId = q.id;
    c.clean = (await getSetting(`clean:${c.user.tg_id}`)) !== 'off';
    await onButton(c, String(q.data || ''));
  } catch (e) {
    console.error('callback failed', e);
    await answer(q.id, '⚠️ Ошибка, попробуйте ещё раз', true);
  } finally {
    if (c) await stash(c).catch(() => {});
    else outbox.delete(chatId);
  }
}

// ── Доступ и пользователь ─────────────────────────────────────────────────

async function context(from, chatId, silent = false) {
  let owner = await getSetting('owner_id');
  let newOwner = false;
  if (!owner) {
    owner = String(from.id);
    await setSetting('owner_id', owner);
    newOwner = true;
  }
  const isOwner = owner === String(from.id);
  if (!isOwner && (await getSetting('access')) !== 'public' && !(await isAllowed(from.id))) {
    if (!silent) {
      await send(chatId, `🔒 Это личный бот учёта финансов.\n\nВаш ID: <code>${from.id}</code> — отправьте его владельцу бота, чтобы он открыл вам доступ.`);
    }
    return null;
  }
  const { user, created } = await ensureUser(from);
  return { user, chatId, isOwner, newOwner, created, from };
}

async function clearState(c) {
  c.user.state = null;
  await setUserState(c.user.tg_id, null);
}

async function setState(c, state) {
  c.user.state = state;
  await setUserState(c.user.tg_id, state);
}

const isCancel = (text) => /^(отмена|отменить|cancel|стоп|назад|❌.*)$/i.test(text.trim());

// ── Команды ────────────────────────────────────────────────────────────────

async function onCommand(c, text, msg) {
  const m = text.match(/^\/([a-zA-Z_]+)(?:@\w+)?\s*([\s\S]*)$/);
  if (!m) return onEntry(c, text, { source: 'text' });
  const cmd = m[1].toLowerCase();
  const args = m[2].trim();

  switch (cmd) {
    case 'start': return startScreen(c);
    case 'help': return send(c.chatId, helpText(), MAIN_KEYBOARD);
    case 'app': return showScreen(c, appScreen());
    case 'report': case 'otchet': {
      const code = args ? parsePeriodText(args, c.user.tz_offset) : null;
      if (args && !code) await send(c.chatId, 'Не понял период — показываю текущий месяц.');
      return showScreen(c, await S.reportScreen(c.user, code || currentPeriodCode('month', c.user.tz_offset)));
    }
    case 'excel': case 'export': case 'xlsx': {
      const code = args ? parsePeriodText(args, c.user.tz_offset) : null;
      if (code) return showScreen(c, await S.excelContentScreen(c.user, code));
      return showScreen(c, S.excelPeriodScreen(c.user));
    }
    case 'last': return showScreen(c, await S.lastScreen(c.user, 0));
    case 'undo': return undoLast(c);
    case 'categories': return showScreen(c, await S.categoriesScreen(c.user, 'expense'));
    case 'budget': return args ? applyBudget(c, args) : showScreen(c, await S.budgetScreen(c.user));
    case 'settings': return showScreen(c, await S.settingsScreen(c.user, c.isOwner));
    case 'currency': {
      const code = args.toUpperCase();
      if (CURRENCIES[code]) {
        await setUserCurrency(c.user.tg_id, code);
        return send(c.chatId, `💱 Основная валюта: <b>${code}</b>`);
      }
      return showScreen(c, S.currencyScreen(c.user));
    }
    case 'tz': {
      const tm = args.match(/^(?:utc|gmt)?\s*([+\-−]?)(\d{1,2})(?::?(\d{2}))?$/i);
      if (tm) {
        const min = (tm[1] === '-' || tm[1] === '−' ? -1 : 1) * (+tm[2] * 60 + +(tm[3] || 0));
        if (Math.abs(min) <= 14 * 60) {
          await setUserTz(c.user.tg_id, min);
          return send(c.chatId, `🕒 Часовой пояс: <b>${tzLabel(min)}</b>`);
        }
      }
      return showScreen(c, S.tzScreen(c.user));
    }
    case 'id': return send(c.chatId, `Ваш ID: <code>${c.user.tg_id}</code>`);
    case 'cancel': return send(c.chatId, 'Хорошо, отменил.', MAIN_KEYBOARD);
    case 'setkey': return ownerOnly(c, () => setKey(c, args, msg));
    case 'setmodel': return ownerOnly(c, () => setModel(c, args));
    case 'ai': return ownerOnly(c, async () => {
      if (/^(off|выкл)/i.test(args)) await setSetting('ai_llm', 'off');
      if (/^(on|вкл)/i.test(args)) await setSetting('ai_llm', null);
      return showScreen(c, await S.aiScreen());
    });
    case 'allow': return ownerOnly(c, async () => {
      const id = args.match(/-?\d{3,}/);
      if (!id) return send(c.chatId, 'Формат: <code>/allow 123456789</code>');
      await setAllowed(id[0], args.replace(id[0], '').trim() || '✓');
      return send(c.chatId, `✅ Пользователь <code>${id[0]}</code> может пользоваться ботом.`);
    });
    case 'deny': return ownerOnly(c, async () => {
      const id = args.match(/-?\d{3,}/);
      if (!id) return send(c.chatId, 'Формат: <code>/deny 123456789</code>');
      await setAllowed(id[0], null);
      return send(c.chatId, `🚫 Доступ для <code>${id[0]}</code> закрыт.`);
    });
    default:
      return send(c.chatId, 'Не знаю такой команды. Вот что я умею 👇\n\n' + helpText(), MAIN_KEYBOARD);
  }
}

async function ownerOnly(c, fn) {
  if (!c.isOwner) return send(c.chatId, '🔒 Эта команда доступна только владельцу бота.');
  return fn();
}

function onMenu(c, key) {
  if (key === 'report') return S.reportScreen(c.user, currentPeriodCode('month', c.user.tz_offset)).then((s) => showScreen(c, s));
  if (key === 'excel') return showScreen(c, S.excelPeriodScreen(c.user));
  if (key === 'last') return S.lastScreen(c.user, 0).then((s) => showScreen(c, s));
  if (key === 'budget') return S.budgetScreen(c.user).then((s) => showScreen(c, s));
  if (key === 'categories') return S.categoriesScreen(c.user, 'expense').then((s) => showScreen(c, s));
  if (key === 'settings') return S.settingsScreen(c.user, c.isOwner).then((s) => showScreen(c, s));
}

const showScreen = (c, s) => show(c.chatId, c.msgId, s.text, s.extra);

async function startScreen(c) {
  const name = esc(c.from.first_name || '');
  const lines = [
    `👋 Привет${name ? ', ' + name : ''}! Я помогу вести учёт денег.`,
    '',
    'Просто напишите или скажите, что потратили:',
    '• <code>кофе 250</code>',
    '• <code>такси 450 вчера</code>',
    '• <code>хлеб 60, молоко 90, сыр 300</code>',
    '• <code>+50000 зарплата</code>',
    '• 🎙 голосовое: «потратил тысячу двести на продукты и триста на такси»',
    '',
    'Категорию я определю сам, а отчёты, бюджет и Excel-таблицы — в меню ниже 👇',
  ];
  lines.push('', '📱 Графики, список операций, категории и бюджеты — в приложении: кнопка «Приложение» слева от поля ввода или /app.');
  if (c.isOwner) {
    const cfg = await getAiConfig();
    if (!aiReady(cfg)) {
      lines.push('', '👑 <b>Вы владелец бота.</b> Чтобы я понимал голосовые, подключите распознавание речи (бесплатно):',
        '1. console.groq.com → API Keys → Create API Key',
        '2. Отправьте мне: <code>/setkey gsk_ваш_ключ</code>');
    }
  }
  // Приветствие с меню остаётся в чате (одно: прошлое удаляем).
  const prev = await getSetting(`greet:${c.user.tg_id}`);
  const m = keep(c.chatId, await send(c.chatId, lines.join('\n'), MAIN_KEYBOARD));
  if (c.clean && prev) await remove(c.chatId, +prev);
  if (m && m.message_id) await setSetting(`greet:${c.user.tg_id}`, m.message_id);
  return m;
}

// Команды бота и кнопка «Приложение» у поля ввода — для всех чатов сразу.
async function ensureBotSetup() {
  if ((await getSetting('commands_v')) === COMMANDS_VERSION) return;
  try {
    await api.setMyCommands({ commands: BOT_COMMANDS });
    await api.setChatMenuButton({ menu_button: APP_MENU_BUTTON });
    await setSetting('commands_v', COMMANDS_VERSION);
  } catch (e) { console.warn('bot setup failed', String(e && e.description || e)); }
}

function appScreen() {
  return {
    text: '📱 <b>Приложение</b>\n\nОбзор с графиками, все операции с поиском и правкой, свои категории, бюджеты и выгрузка в Excel.',
    extra: inline([[appBtn('📱 Открыть приложение')], [appBtn('➕ Добавить операцию', 'add'), appBtn('📂 Категории', 'categories')]]),
  };
}

function helpText() {
  return [
    '<b>✍️ Как записывать</b>',
    '• <code>кофе 250</code> · <code>250 кофе</code> · <code>такси 1 200</code>',
    '• Сразу несколько: <code>хлеб 60, молоко 90, сыр 300</code>',
    '• Доход: <code>+50000 зарплата</code>, <code>зарплата 100к</code>, <code>кэшбэк 350</code>',
    '• Дата: <code>вчера обед 600</code>, <code>12.10 продукты 3400</code>, <code>в пятницу кино 800</code>',
    '• Валюта: <code>$20 подписка</code>, <code>15 евро обед</code>',
    '• 🎙 Голосовое — то же самое, только голосом.',
    '',
    '<b>✏️ Исправить</b>',
    'Под каждой записью есть кнопки: категория, дата, сумма, удалить. /undo — отменить последнюю запись. Если поправите категорию — я запомню слово и в следующий раз угадаю.',
    '',
    '<b>📊 Отчёты и таблицы</b>',
    '• «📊 Отчёт» — расходы и доходы по категориям, листайте ◀️ ▶️',
    '• «📥 Excel» — таблица за любой период: сводка, все операции, траты по категориям, по дням и месяцам. Или одна категория.',
    '• Командой: <code>/excel сентябрь</code>, <code>/excel 01.09-15.09</code>, <code>/report 2025</code>',
    '',
    '<b>🎯 Бюджет</b>: <code>/budget 50000</code> — на месяц, <code>/budget продукты 15000</code> — на категорию.',
    '',
    '<b>📂 Свои категории</b>: «📂 Категории» → ➕ Категория / ➕ Подкатегория / ✏️ Изменить. Или прямо под записью: 🏷 Категория → ➕ Новая категория.',
    'Подкатегории — например, 💊 Здоровье → Аптека, Врачи, Стоматолог: в отчётах они складываются в свою категорию.',
    '',
    '<b>📱 Приложение</b>: /app — графики, поиск по операциям, категории и бюджеты в одном окне.',
  ].join('\n');
}

// ── Запись операций ────────────────────────────────────────────────────────

async function resolveItems(c, text, source) {
  const tz = c.user.tz_offset;
  const cats = await listCategories(c.user.tg_id);
  const rule = parseText(text, { tz, currency: c.user.currency });
  let items = rule.items.map((it) => {
    let cat = guessCategory(it.note, cats, it.kind);
    let kind = it.kind;
    if (!cat && !it.kindExplicit) {
      const incomeCat = guessCategory(it.note, cats, 'income');
      if (incomeCat) { cat = incomeCat; kind = 'income'; }
    }
    return { ...it, kind, cat };
  });

  const cfg = await getAiConfig();
  const needLlm = aiReady(cfg) && cfg.llmEnabled &&
    (source === 'voice' || !items.length || items.length > 1 || items.some((i) => !i.cat));
  if (needLlm) {
    const llm = await parseWithLlm(cfg, text, { cats, currency: c.user.currency, tz });
    if (llm && llm.length) {
      const byId = new Map(cats.map((x) => [x.id, x]));
      const today = localToday(tz);
      items = llm.map((it) => ({
        kind: it.kind,
        amount: it.amount,
        currency: it.currency,
        note: it.note,
        ymd: it.ymd && isValidYmd(it.ymd) && Math.abs(Date.UTC(it.ymd.y, it.ymd.m - 1, it.ymd.d) - Date.UTC(today.y, today.m - 1, today.d)) < 400 * 86400000 ? it.ymd : rule.ymd,
        cat: (it.categoryId && byId.get(it.categoryId)) || guessCategory(it.note, cats, it.kind),
      }));
      // «Прочее» от ИИ, когда словарь знает лучше
      items = items.map((it) => {
        if (it.cat && (it.cat.code === 'other' || it.cat.code === 'other_in')) {
          const better = guessCategory(it.note, cats, it.kind);
          if (better) return { ...it, cat: better };
        }
        return it;
      });
    }
  }
  return items.map((it) => {
    const guessed = Boolean(it.cat) && it.cat.code !== 'other' && it.cat.code !== 'other_in';
    return { ...it, cat: it.cat || fallbackCategory(cats, it.kind), uncertain: !guessed };
  });
}

function occurredAtFor(ymd, tz) {
  const today = localToday(tz);
  if (ymd.y === today.y && ymd.m === today.m && ymd.d === today.d) return Math.floor(Date.now() / 1000);
  return dayStart(ymd, tz) + 12 * 3600; // полдень того дня
}

async function onEntry(c, text, { source = 'text', statusMsgId = null, transcript = '' } = {}) {
  const items = await resolveItems(c, text, source);
  if (!items.length) {
    const hint = source === 'voice'
      ? `🎙 <i>«${esc(text)}»</i>\n\nНе услышал сумму 🤔 Скажите, например: «кофе двести пятьдесят рублей».`
      : 'Не нашёл сумму 🤔\n\nНапишите, например: <code>такси 450</code> или <code>+50000 зарплата</code>.\nПодробнее — /help';
    return show(c.chatId, statusMsgId, hint, statusMsgId ? {} : MAIN_KEYBOARD);
  }

  const saved = [];
  for (const it of items.slice(0, 20)) {
    const id = await addTransaction(c.user.tg_id, {
      kind: it.kind,
      amount: it.amount,
      currency: it.currency,
      categoryId: it.cat ? it.cat.id : 0,
      note: it.note,
      occurredAt: occurredAtFor(it.ymd, c.user.tz_offset),
      source,
      raw: text,
    });
    saved.push({ ...it, id });
  }

  const warnings = await budgetWarnings(c, saved);

  if (saved.length === 1) {
    const s = saved[0];
    const t = await getTransaction(c.user.tg_id, s.id);
    const header = s.kind === 'income' ? '✅ Записал доход' : '✅ Записал расход';
    const footer = [s.uncertain ? '🤔 Не уверен в категории — выберите подходящую:' : '', ...warnings].filter(Boolean).join('\n');
    const text2 = S.txCardText(t, s.cat, c.user.tz_offset, { header, transcript, footer });
    const extra = s.uncertain ? await S.categoryPicker(c.user.tg_id, t) : S.txCardKeyboard(t);
    return keep(c.chatId, await show(c.chatId, statusMsgId, text2, extra), statusMsgId);
  }

  const lines = [`✅ Записал ${saved.length} ${plural(saved.length, 'операцию', 'операции', 'операций')}:`, ''];
  saved.forEach((s, i) => {
    lines.push(`${i + 1}. <b>${signedMoney(s.kind, s.amount, s.currency)}</b> · ${esc(catLabel(s.cat))}${s.note ? ' — ' + esc(s.note) : ''}${s.uncertain ? ' 🤔' : ''}`);
  });
  const sums = new Map();
  for (const s of saved) if (s.kind === 'expense') sums.set(s.currency, (sums.get(s.currency) || 0) + s.amount);
  if (sums.size) lines.push('', 'Итого расходов: ' + [...sums].map(([cur, v]) => `<b>${money(v, cur)}</b>`).join(' + '));
  const day = saved[0].ymd;
  const today = localToday(c.user.tz_offset);
  if (day && (day.y !== today.y || day.m !== today.m || day.d !== today.d)) lines.push(`📅 Дата: ${toLocalDay(day)}`);
  if (transcript) lines.push('', `🎙 <i>«${esc(transcript)}»</i>`);
  if (warnings.length) lines.push('', ...warnings);
  lines.push('', '<i>Нажмите номер, чтобы изменить запись.</i>');
  const kb = [saved.slice(0, 10).map((s, i) => btn(`✏️ ${i + 1}`, `t:o:${s.id}`))];
  const ids = saved.map((s) => s.id).join('.');
  if (`t:X:${ids}`.length <= 64) kb.push([btn('🗑 Удалить всё', `t:X:${ids}`)]);
  return keep(c.chatId, await show(c.chatId, statusMsgId, lines.join('\n'), inline(kb)), statusMsgId);
}

function toLocalDay(ymd) {
  return `${String(ymd.d).padStart(2, '0')}.${String(ymd.m).padStart(2, '0')}.${ymd.y}`;
}

async function budgetWarnings(c, saved) {
  const out = [];
  const seen = new Set();
  for (const s of saved) {
    if (s.kind !== 'expense' || s.currency !== c.user.currency) continue;
    const ymd = s.ymd, today = localToday(c.user.tz_offset);
    if (ymd.y !== today.y || ymd.m !== today.m) continue;
    for (const b of await S.budgetStatus(c.user, s.cat)) {
      if (seen.has(b.category_id)) continue;
      seen.add(b.category_id);
      const name = !b.category_id ? 'общий' : b.category_id === s.cat.id ? `«${catPath(s.cat)}»` : `«${s.cat.parent_name}»`;
      if (b.spent >= b.amount) out.push(`🔴 Бюджет ${name} ${b.spent > b.amount ? 'превышен' : 'исчерпан'}: ${money(b.spent, c.user.currency)} из ${money(b.amount, c.user.currency)}`);
      else if (b.spent >= b.amount * 0.8) out.push(`🟡 Бюджет ${name}: потрачено ${Math.round((b.spent / b.amount) * 100)}%, осталось ${money(b.amount - b.spent, c.user.currency)}`);
    }
  }
  return out;
}

async function undoLast(c) {
  const t = await lastCreatedTransaction(c.user.tg_id);
  if (!t) return send(c.chatId, 'Отменять нечего — записей пока нет.');
  await deleteTransaction(c.user.tg_id, t.id);
  const cat = await getCategory(c.user.tg_id, t.category_id);
  return send(c.chatId, `↩️ Удалил последнюю запись:\n<b>${signedMoney(t.kind, t.amount, t.currency)}</b> · ${esc(catLabel(cat))}${t.note ? ' — ' + esc(t.note) : ''}`);
}

// ── Голосовые ──────────────────────────────────────────────────────────────

function whisperHint(cats) {
  const names = cats.filter((x) => x.kind === 'expense').slice(0, 10).map((x) => x.name.toLowerCase()).join(', ');
  return `Учёт расходов и доходов. Кофе 250 рублей, такси 450, продукты 1 234 рубля, зарплата 100 000. Категории: ${names}.`;
}

async function onVoice(c, msg) {
  const v = msg.voice || msg.audio || msg.video_note;
  const cfg = await getAiConfig();
  if (!aiReady(cfg)) {
    return send(c.chatId, c.isOwner
      ? '🎙 Чтобы я понимал голосовые, подключите распознавание речи — это бесплатно:\n1. console.groq.com → API Keys → Create API Key\n2. Отправьте мне: <code>/setkey gsk_ваш_ключ</code>\n\nА пока можно писать текстом: <code>кофе 250</code>'
      : '🎙 Голосовые пока не подключены владельцем бота. Напишите текстом, например: <code>кофе 250</code>');
  }
  if ((v.duration || 0) > MAX_VOICE_SECONDS) return send(c.chatId, `🎙 Слишком длинное сообщение — до ${Math.round(MAX_VOICE_SECONDS / 60)} минут, пожалуйста.`);
  if ((v.file_size || 0) > 19 * 1024 * 1024) return send(c.chatId, '🎙 Файл слишком большой (лимит Telegram для ботов — 20 МБ).');

  const status = await send(c.chatId, '🎙 Слушаю…', { reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true } });
  await action(c.chatId, 'typing');
  let text;
  try {
    const bytes = await api.getFileContent(v.file_id);
    const file = msg.voice ? ['voice.ogg', 'audio/ogg']
      : msg.video_note ? ['note.mp4', 'video/mp4']
        : [v.file_name || 'audio.mp3', v.mime_type || 'audio/mpeg'];
    const cats = await listCategories(c.user.tg_id);
    text = await transcribe(cfg, bytes, { filename: file[0], mime: file[1], hint: whisperHint(cats) });
  } catch (e) {
    console.error('transcribe failed', e);
    return edit(c.chatId, status.message_id, `⚠️ Не получилось распознать голосовое.\n<code>${esc(String(e && e.message || e).slice(0, 300))}</code>${c.isOwner ? '\n\nПроверьте ключ: ⚙️ Настройки → 🎙 Голос и ИИ' : ''}`);
  }
  if (!text) return edit(c.chatId, status.message_id, '🎙 Ничего не расслышал. Попробуйте ещё раз, чуть ближе к микрофону.');

  if (c.user.state) return onStateInput(c, text, msg, status.message_id);
  await edit(c.chatId, status.message_id, `🎙 <i>«${esc(text)}»</i>\n\n⏳ Записываю…`);
  return onEntry(c, text, { source: 'voice', statusMsgId: status.message_id, transcript: text });
}

// ── Ввод в режиме ожидания (после нажатия кнопки) ─────────────────────────

async function onStateInput(c, text, msg, statusMsgId = null) {
  const st = c.user.state || {};
  const reply = (t, extra = {}) => show(c.chatId, statusMsgId, t, extra);
  // Карточку записи правим там же, где её открыли (st.cardId); не вышло — присылаем новую.
  const replyCard = async (card) => keep(c.chatId, await show(c.chatId, st.cardId || statusMsgId, card.text, card.extra), ...(st.cardId ? [] : [statusMsgId]));
  if (isCancel(text)) { await clearState(c); return reply('Хорошо, отменил.', statusMsgId ? {} : MAIN_KEYBOARD); }
  const tz = c.user.tz_offset;
  // Похоже на новую запись («кофе 250»), а мы ждали другое — выходим из режима.
  const looksLikeEntry = () => parseText(text, { tz, currency: c.user.currency }).items.length > 0;

  if (st.mode === 'x_range' || st.mode === 'r_range') {
    const code = parsePeriodText(text, tz);
    if (!code) {
      if (looksLikeEntry()) { await clearState(c); return onEntry(c, text, { source: statusMsgId ? 'voice' : 'text', statusMsgId, transcript: statusMsgId ? text : '' }); }
      return reply('Не понял период 🤔 Примеры: <code>сентябрь</code>, <code>2025</code>, <code>01.09-15.09</code>, <code>последние 30 дней</code>. Или «отмена».');
    }
    await clearState(c);
    const s = st.mode === 'x_range' ? await S.excelContentScreen(c.user, code) : await S.reportScreen(c.user, code);
    return reply(s.text, s.extra);
  }

  if (st.mode === 'cat_add') {
    const uid = c.user.tg_id;
    const parent = st.parentId ? await getCategory(uid, st.parentId) : null;
    if (st.parentId && !parent) { await clearState(c); return reply('Эта категория уже удалена.'); }
    // Подкатегорий можно написать сразу несколько: «Аптека, Врачи, Стоматолог».
    const parts = (parent && !st.txId ? text.split(/[,;\n]+/) : [text]).map((x) => x.trim()).filter(Boolean);
    const siblings = (await listCategories(uid)).filter((x) => x.kind === st.kind && (x.parent_id || 0) === (parent ? parent.id : 0));
    const added = [], skipped = [];
    for (const part of parts.slice(0, 20)) {
      const [emoji, name] = splitEmoji(part);
      if (!name || name.length > 40) continue;
      if ([...siblings, ...added].some((x) => norm(x.name) === norm(name))) { skipped.push(name); continue; }
      const id = await addCategory(uid, { kind: st.kind, name, emoji: emoji || (parent ? '' : st.kind === 'income' ? '💵' : '🏷'), parentId: parent ? parent.id : 0 });
      added.push({ id, name });
    }
    if (!added.length) {
      return reply(skipped.length
        ? 'Такая уже есть. Напишите другое название или «отмена».'
        : `Напишите название (до 40 символов)${parent ? ', можно несколько через запятую: <code>Аптека, Врачи</code>' : ', можно с эмодзи: <code>🧸 Дети</code>'}`);
    }
    await clearState(c);
    // Категорию создали из карточки записи — сразу ставим её этой записи.
    const t = st.txId && await getTransaction(uid, st.txId);
    if (t) {
      const cat = await getCategory(uid, added[0].id);
      await setTransactionCategory(uid, t.id, cat.kind, cat.id);
      const word = await learn(uid, t.note, cat);
      const card = await S.txCard(c.user, t.id, { header: `✅ ${parent ? 'Новая подкатегория' : 'Новая категория'} «${esc(catPath(cat))}»${word ? ` · запомнил слово «${esc(word)}»` : ''}` });
      return replyCard(card);
    }
    const s = await S.categoriesScreen(c.user, st.kind);
    const done = parent
      ? `✅ В «${esc(parent.name)}» ${added.length > 1 ? 'добавлены подкатегории' : 'добавлена подкатегория'}: ${added.map((x) => esc(x.name)).join(', ')}.`
      : `✅ Категория «${esc(added[0].name)}» добавлена.`;
    return reply(`${done}${skipped.length ? ` Уже были: ${skipped.map(esc).join(', ')}.` : ''}\n\n` + s.text, s.extra);
  }

  if (st.mode === 'cat_edit') {
    const cat = await getCategory(c.user.tg_id, st.id);
    if (!cat) { await clearState(c); return reply('Эта категория уже удалена.'); }
    const [emoji, name] = splitEmoji(text);
    if (!emoji && !name) return reply('Напишите новое название и/или эмодзи: <code>🥦 Продукты</code> или просто <code>🥦</code>.');
    if (name.length > 40) return reply('Название слишком длинное — до 40 символов.');
    if (name) {
      const cats = await listCategories(c.user.tg_id, { includeArchived: true });
      if (cats.some((x) => x.id !== cat.id && x.kind === cat.kind && (x.parent_id || 0) === (cat.parent_id || 0) && norm(x.name) === norm(name))) {
        return reply('Такая категория уже есть. Напишите другое название или «отмена».');
      }
    }
    await updateCategory(c.user.tg_id, cat.id, { name: name || cat.name, emoji: emoji || cat.emoji, keywords: cat.keywords });
    await clearState(c);
    const s = await S.categoriesScreen(c.user, cat.kind);
    const fresh = await getCategory(c.user.tg_id, cat.id);
    return reply(`✅ Теперь называется «${esc(catLabel(fresh))}».\n\n` + s.text, s.extra);
  }

  if (st.mode === 'tx_edit') {
    const t = await getTransaction(c.user.tg_id, st.id);
    await clearState(c);
    if (!t) return reply('Эта запись уже удалена.');
    const p = parseAmountAndNote(text, c.user.currency);
    if (p.amount) await setTransactionAmount(c.user.tg_id, t.id, p.amount, p.currency || t.currency);
    if (p.note) await setTransactionNote(c.user.tg_id, t.id, p.note.slice(0, 200));
    if (!p.amount && !p.note) return reply('Ничего не изменил 🤔');
    return replyCard(await S.txCard(c.user, t.id, { header: '✏️ Изменил запись' }));
  }

  if (st.mode === 'tx_date') {
    const t = await getTransaction(c.user.tg_id, st.id);
    const d = findDateInText(text, tz);
    if (!d) return reply('Не понял дату 🤔 Примеры: <code>12.10</code>, <code>3 сентября</code>, <code>вчера</code>. Или «отмена».');
    await clearState(c);
    if (!t) return reply('Эта запись уже удалена.');
    await setTransactionDate(c.user.tg_id, t.id, keepTime(t.occurred_at, d.ymd, tz));
    return replyCard(await S.txCard(c.user, t.id, { header: '📅 Дата изменена' }));
  }

  if (st.mode === 'budget') {
    const res = await applyBudget(c, text, statusMsgId);
    if (res !== false) await clearState(c);
    return res;
  }

  await clearState(c);
  return onEntry(c, text, { source: 'text' });
}

function keepTime(oldUnix, ymd, tz) {
  const l = toLocal(oldUnix, tz);
  return dayStart(ymd, tz) + l.hh * 3600 + l.mi * 60;
}

async function applyBudget(c, text, statusMsgId = null) {
  const p = parseBudgetText(text);
  const reply = (t, extra = {}) => show(c.chatId, statusMsgId, t, extra);
  if (!p) {
    await reply('Не понял сумму 🤔 Примеры: <code>50000</code> — общий бюджет, <code>продукты 15000</code> — на категорию, <code>продукты 0</code> — убрать.');
    return false;
  }
  let catId = 0, label = 'Общий бюджет';
  if (p.name) {
    const cats = (await listCategories(c.user.tg_id)).filter((x) => x.kind === 'expense');
    const cat = cats.find((x) => norm(x.name) === norm(p.name)) ||
      cats.find((x) => norm(x.name).startsWith(stemWord(p.name))) ||
      (/^(общ|весь|все|месяц)/i.test(p.name) ? null : guessCategory(p.name, cats, 'expense'));
    if (!cat && !/^(общ|весь|все|месяц)/i.test(p.name)) {
      await reply(`Не нашёл категорию «${esc(p.name)}». Названия — в «📂 Категории».`);
      return false;
    }
    if (cat) { catId = cat.id; label = `Бюджет «${cat.name}»`; }
  }
  await setBudget(c.user.tg_id, catId, p.amount);
  const s = await S.budgetScreen(c.user);
  return reply(`${p.amount ? `✅ ${esc(label)}: ${money(p.amount, c.user.currency)} в месяц` : `🗑 ${esc(label)} удалён`}\n\n${s.text}`, s.extra);
}

// ── Ключ ИИ ────────────────────────────────────────────────────────────────

async function setKey(c, args, msg) {
  await remove(c.chatId, msg.message_id); // ключ не должен оставаться в переписке
  const parts = args.split(/\s+/).filter(Boolean);
  if (!parts.length) return showScreen(c, await S.aiScreen());
  let provider, key, baseUrl = null;
  if (parts[0] === 'url' && parts.length >= 3) {
    provider = 'custom'; baseUrl = parts[1]; key = parts[2];
  } else if (AI_PRESETS[parts[0]] && parts[1]) {
    provider = parts[0]; key = parts[1];
  } else {
    key = parts[0];
    provider = key.startsWith('gsk_') ? 'groq' : key.startsWith('sk-') ? 'openai' : 'groq';
  }
  if (provider === 'custom' && !/^https:\/\//.test(baseUrl)) return send(c.chatId, 'Адрес должен начинаться с https://');
  await setSetting('ai_provider', provider);
  await setSetting('ai_key', key);
  await setSetting('ai_base_url', baseUrl);
  if (provider !== 'custom') { await setSetting('ai_stt_model', null); await setSetting('ai_llm_model', null); }
  const cfg = await getAiConfig();
  try {
    await checkKey(cfg);
    return send(c.chatId, `✅ Ключ ${esc(cfg.title)} сохранён и работает. Сообщение с ключом я удалил.\n\nТеперь можно отправлять голосовые 🎙`);
  } catch (e) {
    return send(c.chatId, `⚠️ Ключ сохранён, но проверка не прошла:\n<code>${esc(String(e.message || e).slice(0, 300))}</code>\n\nПроверьте ключ и отправьте /setkey ещё раз.`);
  }
}

async function setModel(c, args) {
  const [kind, ...rest] = args.split(/\s+/);
  const model = rest.join(' ').trim();
  if (kind === 'reset') {
    await setSetting('ai_stt_model', null); await setSetting('ai_llm_model', null);
    return send(c.chatId, '✅ Модели сброшены на стандартные.');
  }
  if ((kind !== 'stt' && kind !== 'llm') || !model) {
    return send(c.chatId, 'Формат: <code>/setmodel stt whisper-large-v3</code> или <code>/setmodel llm llama-3.3-70b-versatile</code>, сброс — <code>/setmodel reset</code>');
  }
  await setSetting(kind === 'stt' ? 'ai_stt_model' : 'ai_llm_model', model);
  return send(c.chatId, `✅ Модель ${kind === 'stt' ? 'распознавания' : 'разбора'}: <code>${esc(model)}</code>`);
}

// ── Кнопки ─────────────────────────────────────────────────────────────────

async function onButton(c, data) {
  const p = data.split(':');
  const uid = c.user.tg_id;
  const ok = (t = '', alert = false) => answer(c.cbId, t, alert);

  // Операции
  if (p[0] === 't') {
    const id = +p[2];
    if (p[1] === 'X') {
      const ids = p[2].split('.').map(Number).filter(Boolean);
      let n = 0;
      for (const x of ids) if (await deleteTransaction(uid, x)) n++;
      await ok(`Удалено: ${n}`);
      if (c.clean && await remove(c.chatId, c.msgId)) return null;
      return edit(c.chatId, c.msgId, `🗑 Удалено ${n} ${plural(n, 'запись', 'записи', 'записей')}.`);
    }
    const t = await getTransaction(uid, id);
    if (!t) { await ok('Запись уже удалена', true); return edit(c.chatId, c.msgId, '🗑 Эта запись удалена.'); }

    if (p[1] === 'o') {
      await ok();
      const back = p[3] !== undefined ? `l:${p[3]}` : '';
      const card = await S.txCard(c.user, id, { back });
      return edit(c.chatId, c.msgId, card.text, card.extra);
    }
    if (p[1] === 'c') {
      await ok();
      return api.editMessageReplyMarkup({ chat_id: c.chatId, message_id: c.msgId, ...(await S.categoryPicker(uid, t)) }).catch(() => {});
    }
    if (p[1] === 'k') {
      await ok();
      const flipped = { ...t, kind: t.kind === 'expense' ? 'income' : 'expense', category_id: 0 };
      const cats = await listCategories(uid);
      const cat = guessCategory(t.note, cats, flipped.kind) || fallbackCategory(cats, flipped.kind);
      await setTransactionCategory(uid, id, flipped.kind, cat ? cat.id : 0);
      const fresh = await getTransaction(uid, id);
      const card = await S.txCard(c.user, id, { footer: 'Выберите категорию:' });
      return edit(c.chatId, c.msgId, card.text, await S.categoryPicker(uid, fresh));
    }
    if (p[1] === 's') {
      const cat = await getCategory(uid, +p[3]);
      if (!cat) return ok('Категория не найдена', true);
      await setTransactionCategory(uid, id, cat.kind, cat.id);
      const learned = await learn(uid, t.note, cat);
      await ok(learned ? `Запомнил: «${learned}» → ${catPath(cat)}` : catLabel(cat));
      const card = await S.txCard(c.user, id, { header: '✅ Сохранено' });
      return edit(c.chatId, c.msgId, card.text, card.extra);
    }
    if (p[1] === 'p') {
      await ok();
      return api.editMessageReplyMarkup({ chat_id: c.chatId, message_id: c.msgId, ...(await S.subPicker(uid, t, +p[3])) }).catch(() => {});
    }
    if (p[1] === 'ns') {
      const parent = await getCategory(uid, +p[3]);
      if (!parent) return ok('Категория не найдена', true);
      await setState(c, { mode: 'cat_add', kind: parent.kind, parentId: parent.id, txId: id, cardId: c.msgId });
      await ok();
      return send(c.chatId, `➕ Напишите название подкатегории для «${esc(catLabel(parent))}»: <code>Аптека</code>, <code>Стоматолог</code>…\nЯ сразу поставлю её этой записи.`);
    }
    if (p[1] === 'n') {
      await setState(c, { mode: 'cat_add', kind: t.kind, txId: id, cardId: c.msgId });
      await ok();
      return send(c.chatId, `➕ Напишите название новой категории ${t.kind === 'income' ? 'доходов' : 'расходов'}, можно с эмодзи в начале: <code>🏋️ Спорт</code>\nЯ сразу поставлю её этой записи.`);
    }
    if (p[1] === 'd') { await ok(); return api.editMessageReplyMarkup({ chat_id: c.chatId, message_id: c.msgId, ...S.datePicker(t) }).catch(() => {}); }
    if (p[1] === 'dv') {
      const ymd = addDays(localToday(c.user.tz_offset), -(+p[3] || 0));
      await setTransactionDate(uid, id, keepTime(t.occurred_at, ymd, c.user.tz_offset));
      await ok('Дата изменена');
      const card = await S.txCard(c.user, id);
      return edit(c.chatId, c.msgId, card.text, card.extra);
    }
    if (p[1] === 'dd') {
      await setState(c, { mode: 'tx_date', id, cardId: c.msgId });
      await ok();
      return send(c.chatId, '📅 Напишите дату: <code>12.10</code>, <code>3 сентября</code>, <code>в пятницу</code>…\nИли «отмена».');
    }
    if (p[1] === 'e') {
      await setState(c, { mode: 'tx_edit', id, cardId: c.msgId });
      await ok();
      return send(c.chatId, `✏️ Напишите новую сумму и/или описание.\nСейчас: <b>${money(t.amount, t.currency)}</b>${t.note ? ' — ' + esc(t.note) : ''}\n\nНапример: <code>350</code>, <code>350 кофе с собой</code> или просто <code>кофе с собой</code>. «Отмена» — оставить как есть.`);
    }
    if (p[1] === 'x') {
      await deleteTransaction(uid, id);
      await ok('Удалено');
      if (c.clean && await remove(c.chatId, c.msgId)) return null;
      const cat = await getCategory(uid, t.category_id);
      return edit(c.chatId, c.msgId, `🗑 Удалено: <s>${signedMoney(t.kind, t.amount, t.currency)} · ${esc(catLabel(cat))}${t.note ? ' — ' + esc(t.note) : ''}</s>`);
    }
    return ok();
  }

  if (p[0] === 'l') { await ok(); return showScreen(c, await S.lastScreen(c.user, +p[1] || 0)); }

  // Отчёт
  if (p[0] === 'r') {
    if (p[1] === 'custom') {
      await setState(c, { mode: 'r_range' });
      await ok();
      return send(c.chatId, '📅 Напишите период: <code>сентябрь</code>, <code>2025</code>, <code>01.09-15.09</code>, <code>последние 30 дней</code>…');
    }
    await ok();
    return showScreen(c, await S.reportScreen(c.user, p.slice(1).join(':')));
  }

  // Excel
  if (p[0] === 'x') {
    if (p[1] === 'm') { await ok(); return showScreen(c, S.excelPeriodScreen(c.user)); }
    if (p[1] === 'custom') {
      await setState(c, { mode: 'x_range' });
      await ok();
      return send(c.chatId, '📅 За какой период выгрузить? Напишите: <code>сентябрь</code>, <code>2025</code>, <code>01.09-15.09</code>, <code>последние 30 дней</code>…');
    }
    if (p[1] === 'p') {
      await ok();
      const s = await S.excelContentScreen(c.user, p[2]);
      return showScreen(c, s);
    }
    if (p[1] === 'c') { await ok(); return showScreen(c, await S.excelCategoryScreen(c.user, p[2])); }
    if (p[1] === 'g') { await ok('Готовлю таблицу…'); return sendExcel(c, p[2], p[3]); }
    return ok();
  }

  // Категории
  if (p[0] === 'c') {
    if (p[1] === 'l') { await ok(); return showScreen(c, await S.categoriesScreen(c.user, p[2])); }
    if (p[1] === 'a') {
      await setState(c, { mode: 'cat_add', kind: p[2] });
      await ok();
      return send(c.chatId, `➕ Напишите название новой категории ${p[2] === 'income' ? 'доходов' : 'расходов'}, можно с эмодзи в начале: <code>🧸 Дети</code>, <code>🏋️ Спорт</code>`);
    }
    if (p[1] === 'd') { await ok(); return showScreen(c, await S.categoryDeleteScreen(c.user, p[2])); }
    if (p[1] === 'e') { await ok(); return showScreen(c, await S.categoryEditScreen(c.user, p[2])); }
    if (p[1] === 'sp') { await ok(); return showScreen(c, await S.categoryParentScreen(c.user, p[2])); }
    if (p[1] === 'as') {
      const parent = await getCategory(uid, +p[2]);
      if (!parent) return ok('Категория не найдена', true);
      await setState(c, { mode: 'cat_add', kind: parent.kind, parentId: parent.id });
      await ok();
      const subs = (await listCategories(uid)).filter((x) => x.parent_id === parent.id);
      const tips = S.suggestedSubs(parent, subs);
      return send(c.chatId, [
        `➕ Подкатегории для «${esc(catLabel(parent))}»${subs.length ? ` (уже есть: ${subs.map((x) => esc(x.name)).join(', ')})` : ''}.`,
        '',
        'Напишите названия через запятую, например: <code>' + esc((tips.length ? tips : ['Первая', 'Вторая']).slice(0, 4).join(', ')) + '</code>',
      ].join('\n'), tips.length ? inline([[btn(`✨ Добавить: ${tips.join(', ')}`.slice(0, 60) + (tips.join(', ').length > 50 ? '…' : ''), `c:sg:${parent.id}`)]]) : {});
    }
    if (p[1] === 'sg') {
      const parent = await getCategory(uid, +p[2]);
      if (!parent) return ok('Категория не найдена', true);
      const subs = (await listCategories(uid)).filter((x) => x.parent_id === parent.id);
      const tips = S.suggestedSubs(parent, subs);
      for (const name of tips) await addCategory(uid, { kind: parent.kind, name, emoji: '', parentId: parent.id });
      if (c.user.state && c.user.state.mode === 'cat_add') await clearState(c);
      await ok(tips.length ? `Добавлено: ${tips.length}` : 'Уже всё добавлено');
      const s = await S.categoriesScreen(c.user, parent.kind);
      return edit(c.chatId, c.msgId, `✅ В «${esc(parent.name)}» добавлено: ${tips.map(esc).join(', ') || '—'}.\n\n` + s.text, s.extra);
    }
    if (p[1] === 'ed') {
      const cat = await getCategory(uid, +p[2]);
      if (!cat) return ok('Категория не найдена');
      await setState(c, { mode: 'cat_edit', id: cat.id });
      await ok();
      return send(c.chatId, `✏️ ${esc(catLabel(cat))}\n\nНапишите новое название, можно с эмодзи в начале: <code>🥦 Продукты</code>. Чтобы сменить только значок — отправьте один эмодзи.`);
    }
    if (p[1] === 'r') { await ok(); return showScreen(c, await S.categoryRestoreScreen(c.user, p[2])); }
    if (p[1] === 'rs') {
      const cat = await getCategory(uid, +p[2]);
      if (cat) await restoreCategory(uid, cat.id);
      await ok(cat ? `Вернул: ${cat.name}` : '');
      return showScreen(c, await S.categoriesScreen(c.user, cat ? cat.kind : 'expense'));
    }
    if (p[1] === 'rm') {
      const cat = await getCategory(uid, +p[2]);
      if (cat) await archiveCategory(uid, cat.id);
      await ok(cat ? `Удалено: ${cat.name}` : '');
      return showScreen(c, await S.categoryDeleteScreen(c.user, cat ? cat.kind : 'expense'));
    }
    return ok();
  }

  // Бюджет
  if (p[0] === 'b' && p[1] === 'e') {
    await setState(c, { mode: 'budget' });
    await ok();
    return send(c.chatId, '🎯 Напишите бюджет на месяц:\n• <code>50000</code> — общий на все расходы\n• <code>продукты 15000</code> — на категорию\n• <code>продукты 0</code> — убрать лимит');
  }

  // Настройки
  if (p[0] === 's') {
    if (p[1] === 'home') { await ok(); return showScreen(c, await S.settingsScreen(c.user, c.isOwner)); }
    if (p[1] === 'cur' && p[2]) {
      if (CURRENCIES[p[2]]) { await setUserCurrency(uid, p[2]); c.user.currency = p[2]; }
      await ok(`Валюта: ${p[2]}`);
      return showScreen(c, await S.settingsScreen(c.user, c.isOwner));
    }
    if (p[1] === 'cur') { await ok(); return showScreen(c, S.currencyScreen(c.user)); }
    if (p[1] === 'tz' && p[2] !== undefined) {
      const min = +p[2];
      if (Number.isFinite(min) && Math.abs(min) <= 840) { await setUserTz(uid, min); c.user.tz_offset = min; }
      await ok(`Часовой пояс: ${tzLabel(min)}`);
      return showScreen(c, await S.settingsScreen(c.user, c.isOwner));
    }
    if (p[1] === 'tz') { await ok(); return showScreen(c, S.tzScreen(c.user)); }
    if (p[1] === 'clean') {
      const on = (await getSetting(`clean:${uid}`)) !== 'off';
      await setSetting(`clean:${uid}`, on ? 'off' : null);
      if (on) await setSetting(`eph:${uid}`, null);
      c.clean = !on;
      await ok(on ? 'Сообщения больше не удаляются' : 'Буду чистить чат');
      return showScreen(c, await S.settingsScreen(c.user, c.isOwner));
    }
    if (p[1] === 'wipe') {
      await ok();
      return showScreen(c, {
        text: '🧹 <b>Удалить все ваши записи, категории и бюджеты?</b>\n\nЭто нельзя отменить. Перед удалением можно выгрузить всё в Excel.',
        extra: inline([[btn('📥 Сначала выгрузить всё', 'x:p:a')], [btn('🗑 Да, удалить всё', 's:wipe!'), btn('Отмена', 's:home')]]),
      });
    }
    if (p[1] === 'wipe!') {
      await wipeUserData(uid);
      await ok('Данные удалены');
      return edit(c.chatId, c.msgId, '🧹 Все ваши данные удалены. Можно начинать с чистого листа: <code>кофе 250</code>');
    }
    if (!c.isOwner) return ok('Только для владельца', true);
    if (p[1] === 'ai') { await ok(); return showScreen(c, await S.aiScreen()); }
    if (p[1] === 'llm') {
      const off = (await getSetting('ai_llm')) === 'off';
      await setSetting('ai_llm', off ? null : 'off');
      await ok(off ? 'Умный разбор включён' : 'Умный разбор выключен');
      return showScreen(c, await S.aiScreen());
    }
    if (p[1] === 'acc') { await ok(); return showScreen(c, await S.accessScreen()); }
    if (p[1] === 'pub') {
      const pub = (await getSetting('access')) === 'public';
      await setSetting('access', pub ? null : 'public');
      await ok(pub ? 'Бот приватный' : 'Бот открыт для всех');
      return showScreen(c, await S.accessScreen());
    }
  }
  return ok();
}

// Запоминает слово из описания для выбранной категории.
async function learn(uid, note, cat) {
  const lw = learnableWord(note);
  if (!lw) return '';
  const cats = await listCategories(uid);
  const guessed = guessCategory(note, cats, cat.kind);
  if (guessed && guessed.id === cat.id) return '';
  for (const other of cats) {
    if (other.id === cat.id || other.kind !== cat.kind) continue;
    const kws = String(other.keywords || '').split(',').filter(Boolean);
    if (kws.includes(lw.stem)) await setCategoryKeywords(uid, other.id, kws.filter((k) => k !== lw.stem).join(','));
  }
  const fresh = await getCategory(uid, cat.id);
  const kws = String(fresh.keywords || '').split(',').filter(Boolean);
  if (!kws.includes(lw.stem)) {
    kws.unshift(lw.stem);
    await setCategoryKeywords(uid, cat.id, kws.slice(0, 60).join(','));
  }
  return lw.word;
}

// ── Excel ──────────────────────────────────────────────────────────────────

/**
 * Готовит Excel-файл за период. sel: 't' — полный отчёт, 'l' — кратко, id — одна категория.
 * Возвращает { document, caption, count } или { error: 'period' | 'empty', period }.
 */
export async function excelDocument(user, code, sel) {
  const period = decodePeriod(code);
  if (!period) return { error: 'period' };
  const tz = user.tz_offset;
  const { from, to } = periodBounds(period, tz);
  const catsById = await S.catsMap(user.tg_id);
  let txs = await transactionsInRange(user.tg_id, from, to);
  let category = null;
  if (sel && /^\d+$/.test(String(sel))) {
    category = catsById.get(+sel) || { id: +sel, name: 'Без категории', emoji: '' };
    // Категория выгружается вместе с подкатегориями.
    const ids = new Set([+sel, ...[...catsById.values()].filter((x) => x.parent_id === +sel).map((x) => x.id)]);
    txs = txs.filter((t) => ids.has(t.category_id));
  }
  if (!txs.length) return { error: 'empty', period };

  const { bytes, filename, stats } = buildWorkbook({
    period, tz, mainCurrency: user.currency, txs, catsById, category, mode: sel === 'l' ? 'list' : 'tabs',
  });
  const lines = [`📥 <b>${esc(period.title)}</b>${category ? ' · ' + esc(catLabel(category)) : ''}`];
  for (const [cur, s] of stats) {
    lines.push(`${stats.size > 1 ? cur + ': ' : ''}💸 ${money(s.expense, cur)} · 💰 ${money(s.income, cur)}`);
  }
  lines.push(`${txs.length} ${plural(txs.length, 'операция', 'операции', 'операций')}`);
  return { document: new InputFile(bytes, filename, { type: XLSX_MIME }), caption: lines.join('\n'), count: txs.length, filename };
}

async function sendExcel(c, code, sel) {
  await action(c.chatId, 'upload_document');
  const doc = await excelDocument(c.user, code, sel);
  if (doc.error === 'period') return send(c.chatId, 'Не понял период, выберите ещё раз: /excel');
  if (doc.error === 'empty') return send(c.chatId, `За период «${esc(doc.period.title)}» операций нет.`);
  await api.sendDocument({ chat_id: c.chatId, document: doc.document, caption: doc.caption, parse_mode: 'HTML' });
}

// Для мини-приложения: тот же доступ, разбор фраз и предупреждения о бюджете, что и в чате.
export { context, resolveItems, occurredAtFor, keepTime, budgetWarnings, learn };

export const _test = { resolveItems, context };
