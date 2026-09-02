// Разбор команды «написать пользователю» — что именно администратор попросил.
//
// Отдельным файлом по той же причине, что и разбор ответа на отзыв: команда
// решает, кому бот напишет от имени приложения, а воркер целиком в обычном Node
// не запускается — ниже по цепочке есть импорты cloudflare:. Здесь их нет, и
// проверка гоняет тот же код, что работает в бою.
//
// Разговор устроен в два шага, как и обращение в поддержку: «/write <id>»
// присылает подсказку, а текст пишется ответом на неё. Второй шаг нужен, чтобы
// длинное сообщение не приходилось набирать одной строкой вместе с номером; но
// и «/write <id> текст» одним сообщением тоже принимается.

export const WRITE_PROMPT_PREFIX = '✉️ Сообщение пользователю';

const COMMAND_RE = /^\/write(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i;
const PROMPT_RE = new RegExp(`^${WRITE_PROMPT_PREFIX} (\\d{5,20})\\b`);
const ID_RE = /^\d{5,20}$/;

/**
 * Возвращает намерение администратора или null, если сообщение вообще не про
 * эту команду — тогда оно уходит дальше, к обработчику поддержки.
 *
 *   { kind: 'usage' }              — команда без номера, надо показать, как ею пользоваться
 *   { kind: 'badId', value }       — на месте номера не номер
 *   { kind: 'prompt', target }     — номер есть, текста нет: спросить текст
 *   { kind: 'send', target, body } — есть и номер, и текст
 *   { kind: 'cancel' }             — отмена на подсказке
 */
export function directMessageRequest(text, replyTo) {
  const message = String(text || '').trim();

  // Ответ на подсказку. Проверяется первым: внутри может быть что угодно,
  // включая слово «/write», и разбирать это как новую команду нельзя.
  if (replyTo?.from?.is_bot === true) {
    const target = String(replyTo.text || replyTo.caption || '').match(PROMPT_RE)?.[1] || '';
    if (ID_RE.test(target)) {
      if (/^\/cancel(?:@[A-Za-z0-9_]+)?$/i.test(message)) return { kind: 'cancel' };
      if (!message) return null;
      return { kind: 'send', target, body: message };
    }
  }

  const command = message.match(COMMAND_RE);
  if (!command) return null;

  const rest = String(command[1] || '').trim();
  if (!rest) return { kind: 'usage' };

  const at = rest.search(/\s/);
  const target = at === -1 ? rest : rest.slice(0, at);
  // Номер люди присылают по-разному: со слешем из чужой ссылки, с пробелами,
  // иногда с префиксом id. Всё это один и тот же номер.
  const clean = target.replace(/^(?:id[:=]?)?/i, '').replace(/[^\d]/g, '');
  if (!ID_RE.test(clean)) return { kind: 'badId', value: target.slice(0, 40) };

  const body = at === -1 ? '' : rest.slice(at).trim();
  return body ? { kind: 'send', target: clean, body } : { kind: 'prompt', target: clean };
}
