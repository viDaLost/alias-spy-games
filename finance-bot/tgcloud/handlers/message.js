// Каждое входящее сообщение: текст, голосовое, команда, кнопка меню.
import { handleMessage } from '../lib/bot.js';

export default async function (message) {
  await handleMessage(message);
}
