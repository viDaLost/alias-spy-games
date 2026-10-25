// Обёртки над Bot API: отправка, правка, клавиатуры.

import { api } from 'sdk';
import { MENU, WEBAPP_URL } from './config.js';

export async function send(chatId, text, extra = {}) {
  return api.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

/** Правит сообщение; «message is not modified» не считается ошибкой. */
export async function edit(chatId, messageId, text, extra = {}) {
  try {
    return await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...extra,
    });
  } catch (e) {
    if (e && e.code === 400 && /not modified/i.test(e.description || '')) return null;
    throw e;
  }
}

/** Показывает экран: правит сообщение, если есть messageId, иначе отправляет новое. */
export async function show(chatId, messageId, text, extra = {}) {
  if (messageId) {
    try {
      return await edit(chatId, messageId, text, extra);
    } catch (e) {
      if (!(e && e.code === 400)) throw e;
    }
  }
  return send(chatId, text, extra);
}

export async function action(chatId, kind = 'typing') {
  try { await api.sendChatAction({ chat_id: chatId, action: kind }); } catch { /* не важно */ }
}

export async function answer(callbackId, text = '', alert = false) {
  try {
    await api.answerCallbackQuery({ callback_query_id: callbackId, text: text || undefined, show_alert: alert || undefined });
  } catch { /* запрос мог устареть */ }
}

export async function remove(chatId, messageId) {
  try { await api.deleteMessage({ chat_id: chatId, message_id: messageId }); return true; } catch { return false; }
}

export const btn = (text, data) => ({ text, callback_data: data });

/** Кнопка, открывающая мини-приложение (screen — стартовый экран: categories, add…). */
export const appBtn = (text, screen = '') => ({ text, web_app: { url: WEBAPP_URL + (screen ? `?screen=${screen}` : '') } });

export const APP_MENU_BUTTON = { type: 'web_app', text: 'Приложение', web_app: { url: WEBAPP_URL } };

/** Раскладывает кнопки по рядам по n штук. */
export function rows(buttons, n = 2) {
  const out = [];
  for (let i = 0; i < buttons.length; i += n) out.push(buttons.slice(i, i + n));
  return out;
}

export const inline = (keyboard) => ({ reply_markup: { inline_keyboard: keyboard } });

export const MAIN_KEYBOARD = {
  reply_markup: {
    keyboard: [
      [{ text: MENU.report }, { text: MENU.excel }],
      [{ text: MENU.last }, { text: MENU.budget }],
      [{ text: MENU.categories }, { text: MENU.settings }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'кофе 250 · такси 450 вчера · 🎙',
  },
};

export const BOT_COMMANDS = [
  { command: 'start', description: 'Главное меню' },
  { command: 'app', description: 'Открыть приложение' },
  { command: 'report', description: 'Отчёт за месяц' },
  { command: 'excel', description: 'Выгрузить таблицу Excel' },
  { command: 'last', description: 'Последние операции' },
  { command: 'undo', description: 'Отменить последнюю запись' },
  { command: 'budget', description: 'Бюджет на месяц' },
  { command: 'categories', description: 'Категории' },
  { command: 'settings', description: 'Настройки' },
  { command: 'help', description: 'Как пользоваться' },
];
