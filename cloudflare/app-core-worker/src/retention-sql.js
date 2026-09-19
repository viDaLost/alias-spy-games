/*
  Запросы чистки неактивных профилей — отдельным файлом.

  Причина одна: их надо уметь проверить. Сами по себе они живут в Durable
  Object, поднять который без Cloudflare нельзя; а язык у них обычный
  SQLite, и та же самая строка прекрасно выполняется в узле над временной
  базой. Поэтому запросы лежат здесь, а хранилище берёт их отсюда же —
  проверяется ровно то, что работает в бою, а не его пересказ.

  Порядок подстановок важен и подписан у каждого запроса: перепутать их
  местами легко, а ошибка будет тихой — удалится не тот, кого надо.
*/

/*
  Кого пора предупредить о скором удалении.

  Подстановки: adminId, adminId, warnBefore, now, warnBefore.

  Верхней границы по давности нет нарочно. Если задача день не работала,
  человек уже перешагнул срок удаления — и тем более должен получить письмо,
  а не исчезнуть молча. Чистка его не заберёт, пока с письма не пройдут сутки.
*/
export const PENDING_WARNINGS_SQL = `
  SELECT u.telegram_id AS id,
         COALESCE(NULLIF(u.last_seen_at, 0), NULLIF(u.updated_at, 0), u.created_at) AS seen
  FROM users u
  LEFT JOIN inactive_warnings w ON w.user_id = u.telegram_id
  WHERE u.is_banned = 0
    AND (? = '' OR u.telegram_id <> ?)
    AND COALESCE(NULLIF(u.last_seen_at, 0), NULLIF(u.updated_at, 0), u.created_at) < ?
    AND NOT EXISTS (
      SELECT 1 FROM android_sessions s
      WHERE s.telegram_id = u.telegram_id
        AND s.revoked = 0
        AND s.expires_at > ?
        AND s.last_seen_at >= ?
    )
    AND (w.user_id IS NULL
         OR w.last_seen_at <> COALESCE(NULLIF(u.last_seen_at, 0), NULLIF(u.updated_at, 0), u.created_at))
  ORDER BY seen ASC
  LIMIT 500
`;

/*
  Кого пора удалить.

  Подстановки: adminId, adminId, cutoff, warnedBefore, now, cutoff.

  Связка с таблицей предупреждений — не украшение, а обещание: в письме
  сказано «через день», и удаляется только тот, кому письмо ушло и с тех пор
  прошли почти сутки. Отметка привязана к той же давности: человек вернулся —
  отметка устарела, и по ней уже не удалят.
*/
export const PURGE_INACTIVE_SQL = `
  SELECT u.telegram_id
  FROM users u
  JOIN inactive_warnings w ON w.user_id = u.telegram_id
  WHERE u.is_banned = 0
    AND (? = '' OR u.telegram_id <> ?)
    AND COALESCE(NULLIF(u.last_seen_at, 0), NULLIF(u.updated_at, 0), u.created_at) < ?
    AND w.last_seen_at = COALESCE(NULLIF(u.last_seen_at, 0), NULLIF(u.updated_at, 0), u.created_at)
    AND w.warned_at <= ?
    AND NOT EXISTS (
      SELECT 1 FROM android_sessions s
      WHERE s.telegram_id = u.telegram_id
        AND s.revoked = 0
        AND s.expires_at > ?
        AND s.last_seen_at >= ?
    )
  ORDER BY COALESCE(NULLIF(u.last_seen_at, 0), NULLIF(u.updated_at, 0), u.created_at) ASC
  LIMIT 1000
`;

/** Таблица отметок о предупреждениях. Заводится хранилищем при запуске. */
export const WARNINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS inactive_warnings (
    user_id TEXT PRIMARY KEY,
    warned_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  )
`;
