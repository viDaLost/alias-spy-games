// Нажатия на inline-кнопки под сообщениями бота.
import { handleCallback } from '../lib/bot.js';

export default async function (query) {
  await handleCallback(query);
}
