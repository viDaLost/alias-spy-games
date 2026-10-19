import { accessStore, accessError, cleanAccessId } from './app-access-auth.js';

export const RESTRICTED_BOT_TEXT = `⏸ Библейские игры временно заблокированы.

Не волнуйтесь: ваши данные и достижения на месте.

«Все мне позволительно, но не все полезно; все мне позволительно, но не все назидает».
<a href="https://www.bible-center.ru/ru/bibletext/synnew_ru/1co/10%3A23">1 Коринфянам 10:23</a>

«Только всё должно быть благопристойно и чинно».
<a href="https://www.bible-center.ru/ru/bibletext/synnew_ru/1co/14%3A40">1 Коринфянам 14:40</a>

Синодальный перевод`;

export async function restrictedBotReply(request, env) {
  const received = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(env.TELEGRAM_BOT_TOKEN || ''))));
  const expected = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  let mismatch = received.length ^ expected.length;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ (received.charCodeAt(i) || 0);
  if (!env.TELEGRAM_BOT_TOKEN || mismatch) throw accessError(403, 'Invalid Telegram webhook secret');
  const update = await request.clone().json();
  const callback = update.callback_query;
  const message = update.message || update.edited_message || callback?.message;
  const sender = callback?.from || message?.from;
  if (message?.chat?.type !== 'private' || sender?.is_bot) return null;
  const userId = cleanAccessId(sender?.id);
  if (!userId || String(message.chat.id) !== userId) return null;
  const access = await accessStore(env, '/app-access/check', { userId });
  if (access.allowed) return null;
  const result = await accessStore(env, '/app-access/bot-reply', { userId, updateId: String(update.update_id || ''), callbackId: String(callback?.id || '') });
  if (!result.success) throw accessError(502, 'Telegram reply delivery failed');
  return new Response('OK');
}
