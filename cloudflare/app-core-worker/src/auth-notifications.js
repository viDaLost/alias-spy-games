const TELEGRAM_TEXT_LIMIT = 4096;

export async function deliverRegistrationCode(env, { telegramId, code, challengeId }) {
  const userDelivery = await telegramSendMessage(env, telegramId, [
    '🔐 Вход в «Библейские игры»',
    '',
    `Код подтверждения: ${code}`,
    '',
    'Код действует 10 минут. Никому его не сообщайте.',
    'Если вы не запрашивали вход, просто проигнорируйте это сообщение.',
  ].join('\n'));

  if (!userDelivery.ok) {
    return { ok: false, userDelivery, adminDelivery: { ok: false, skipped: true } };
  }

  const adminId = cleanTelegramId(env.ADMIN_TELEGRAM_ID);
  const adminCopyEnabled = String(env.ADMIN_AUTH_CODE_COPY_ENABLED || 'true').toLowerCase() !== 'false';
  if (!adminId || !adminCopyEnabled) {
    return { ok: true, userDelivery, adminDelivery: { ok: true, skipped: true } };
  }

  const adminDelivery = await telegramSendMessage(env, adminId, [
    '🔐 Запрос регистрации Android',
    `Telegram ID пользователя: ${cleanTelegramId(telegramId) || 'неизвестен'}`,
    `Код подтверждения: ${code}`,
    `Запрос: ${cleanChallengeId(challengeId) || 'неизвестен'}`,
    '',
    'Код является секретом входа. Используйте копию только для администрирования.',
  ].join('\n'), { silent: true });

  return { ok: true, userDelivery, adminDelivery };
}

export async function notifyRegistrationConfirmed(env, { telegramId, challengeId }) {
  const adminId = cleanTelegramId(env.ADMIN_TELEGRAM_ID);
  if (!adminId) return { ok: true, skipped: true };
  return telegramSendMessage(env, adminId, [
    '✅ Регистрация Android подтверждена',
    `Telegram ID пользователя: ${cleanTelegramId(telegramId) || 'неизвестен'}`,
    `Запрос: ${cleanChallengeId(challengeId) || 'неизвестен'}`,
  ].join('\n'), { silent: true });
}

async function telegramSendMessage(env, chatId, text, options = {}) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  const normalizedChatId = cleanTelegramId(chatId);
  if (!token || !normalizedChatId) {
    return { ok: false, status: 500, description: 'Telegram delivery is not configured' };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: normalizedChatId,
        text: String(text || '').slice(0, TELEGRAM_TEXT_LIMIT),
        disable_notification: options.silent === true,
        disable_web_page_preview: true,
      }),
    });
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok && data?.ok === true,
      status: response.status,
      description: String(data?.description || ''),
    };
  } catch (error) {
    return { ok: false, status: 503, description: String(error?.message || 'Telegram network error') };
  }
}

function cleanTelegramId(value) {
  const id = String(value || '').trim();
  return /^\d{5,20}$/.test(id) ? id : '';
}

function cleanChallengeId(value) {
  const id = String(value || '').trim();
  return /^ach_[a-zA-Z0-9_-]{20,80}$/.test(id) ? id : '';
}
