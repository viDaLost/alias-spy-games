// Правила обращения в техподдержку, отделённые от хранилища: их можно проверить
// обычными тестами, не поднимая Durable Object.

export const MAX_TICKETS_PER_WINDOW = 3;
export const RATE_WINDOW_MS = 10 * 60 * 1000;

// Пока обращение не закрыто, следующие сообщения человека — продолжение того же
// разговора, а не новый тикет. Сутки берём с запасом: столько живёт переписка,
// если поддержка ещё не ответила.
export const CONTINUE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Открытое обращение того же пользователя, к которому стоит дописать сообщение. */
export function openTicketFor(tickets, now, windowMs = CONTINUE_WINDOW_MS) {
  return tickets.find((ticket) => String(ticket.status || '') !== 'closed'
    && now - Number(ticket.updated_at || 0) <= windowMs) || null;
}

/** Текст отказа с точным временем ожидания — «через несколько минут» ничего не говорит. */
export function rateLimitMessage(oldestCreatedAt, now) {
  const left = RATE_WINDOW_MS - (now - Number(oldestCreatedAt || 0));
  const minutes = Math.max(1, Math.ceil(left / 60000));
  const mod10 = minutes % 10;
  const mod100 = minutes % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'минуту'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'минуты'
      : 'минут';
  return `Вы отправили ${MAX_TICKETS_PER_WINDOW} обращения подряд. `
    + `Следующее можно создать через ${minutes} ${word}, а пока просто допишите в открытое обращение.`;
}
