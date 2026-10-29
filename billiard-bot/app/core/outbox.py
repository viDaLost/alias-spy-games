"""Очередь служебных уведомлений (transactional outbox).

Уведомление кладётся в БД в той же транзакции, что и бронь, поэтому сбой отправки
не отменяет уже сохранённую запись. Уникальный dedupe_key не даёт поставить одно
уведомление в очередь дважды, а статус sending — отправить его двумя воркерами.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import aiosqlite

from .db import Database, parse_ts, ts

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 12


class PermanentSendError(Exception):
    """Получатель недоступен (не нажал /start, заблокировал бота, чат не найден)."""


class RetryLater(Exception):
    def __init__(self, seconds: float) -> None:
        super().__init__(f"retry after {seconds}s")
        self.seconds = seconds


Sender = Callable[[int, str], Awaitable[None]]


@dataclass(frozen=True)
class OutboxItem:
    id: int
    dedupe_key: str
    chat_id: int
    text: str
    status: str
    attempts: int
    last_error: str | None
    created_at: datetime


async def enqueue(conn: aiosqlite.Connection, *, dedupe_key: str, chat_id: int, text: str, now: datetime) -> None:
    await conn.execute(
        "INSERT OR IGNORE INTO outbox (dedupe_key, chat_id, text, next_attempt_at, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (dedupe_key, chat_id, text, ts(now), ts(now)),
    )


def _backoff(attempts: int) -> timedelta:
    return timedelta(seconds=min(30 * 2 ** max(attempts - 1, 0), 3600))


class Outbox:
    def __init__(self, db: Database, clock: Callable[[], datetime] | None = None) -> None:
        self.db = db
        self.clock = clock or (lambda: datetime.now(UTC))

    async def claim_due(self, limit: int = 20, chat_id: int | None = None) -> list[OutboxItem]:
        now = ts(self.clock())
        async with self.db.transaction() as conn:
            # «sending» дольше 5 минут — воркер упал посреди отправки; вернём в очередь.
            stale = ts(self.clock() - timedelta(minutes=5))
            await conn.execute(
                "UPDATE outbox SET status = 'pending' WHERE status = 'sending' AND next_attempt_at < ?",
                (stale,),
            )
            query = "SELECT * FROM outbox WHERE status = 'pending' AND next_attempt_at <= ?"
            params: list[object] = [now]
            if chat_id is not None:
                query += " AND chat_id = ?"
                params.append(chat_id)
            query += " ORDER BY id LIMIT ?"
            params.append(limit)
            rows = await (await conn.execute(query, params)).fetchall()
            ids = [r["id"] for r in rows]
            if ids:
                marks = ",".join("?" * len(ids))
                await conn.execute(
                    f"UPDATE outbox SET status = 'sending', next_attempt_at = ? WHERE id IN ({marks})",
                    [now, *ids],
                )
        return [_item(r) for r in rows]

    async def mark_sent(self, item_id: int) -> None:
        async with self.db.transaction() as conn:
            await conn.execute(
                "UPDATE outbox SET status = 'sent', sent_at = ?, last_error = NULL WHERE id = ?",
                (ts(self.clock()), item_id),
            )

    async def mark_error(self, item_id: int, error: str, *, delay: timedelta | None = None) -> None:
        async with self.db.transaction() as conn:
            row = await (await conn.execute("SELECT attempts FROM outbox WHERE id = ?", (item_id,))).fetchone()
            attempts = (row["attempts"] if row else 0) + 1
            status = "failed" if attempts >= MAX_ATTEMPTS else "pending"
            next_at = self.clock() + (delay if delay is not None else _backoff(attempts))
            await conn.execute(
                "UPDATE outbox SET status = ?, attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?",
                (status, attempts, error[:300], ts(next_at), item_id),
            )

    async def deliver_due(self, send: Sender, *, chat_id: int | None = None, limit: int = 20) -> tuple[int, int]:
        """Отправляет готовые к отправке уведомления. Возвращает (отправлено, ошибок)."""
        sent = errors = 0
        for item in await self.claim_due(limit=limit, chat_id=chat_id):
            try:
                await send(item.chat_id, item.text)
            except RetryLater as exc:
                await self.mark_error(item.id, "Telegram попросил подождать", delay=timedelta(seconds=exc.seconds + 1))
                errors += 1
            except PermanentSendError as exc:
                await self.mark_error(item.id, str(exc) or "получатель недоступен")
                errors += 1
            except Exception as exc:  # noqa: BLE001 — любой сбой сети не должен ронять воркер
                log.warning("outbox send failed: %s", type(exc).__name__)
                await self.mark_error(item.id, f"{type(exc).__name__}: {exc}")
                errors += 1
            else:
                await self.mark_sent(item.id)
                sent += 1
        return sent, errors

    async def make_chat_due(self, chat_id: int) -> None:
        """Получатель снова доступен (например, нажал /start) — пробуем сразу."""
        async with self.db.transaction() as conn:
            await conn.execute(
                "UPDATE outbox SET next_attempt_at = ? WHERE chat_id = ? AND status = 'pending'",
                (ts(self.clock()), chat_id),
            )

    async def problems(self, limit: int = 10) -> tuple[int, list[OutboxItem]]:
        """Неотправленные уведомления, по которым уже были ошибки."""
        async with self.db.connect() as conn:
            total = (await (await conn.execute(
                "SELECT COUNT(*) AS n FROM outbox WHERE status IN ('pending', 'failed') AND attempts > 0"
            )).fetchone())["n"]
            rows = await (await conn.execute(
                "SELECT * FROM outbox WHERE status IN ('pending', 'failed') AND attempts > 0 "
                "ORDER BY id DESC LIMIT ?",
                (limit,),
            )).fetchall()
        return total, [_item(r) for r in rows]

    async def retry_all(self) -> int:
        async with self.db.transaction() as conn:
            cur = await conn.execute(
                "UPDATE outbox SET status = 'pending', attempts = 0, next_attempt_at = ? "
                "WHERE status IN ('pending', 'failed') AND attempts > 0",
                (ts(self.clock()),),
            )
            return cur.rowcount

    async def count(self, status: str | None = None) -> int:
        async with self.db.connect() as conn:
            if status:
                row = await (await conn.execute("SELECT COUNT(*) AS n FROM outbox WHERE status = ?", (status,))).fetchone()
            else:
                row = await (await conn.execute("SELECT COUNT(*) AS n FROM outbox")).fetchone()
        return row["n"]


def _item(r: aiosqlite.Row) -> OutboxItem:
    return OutboxItem(
        id=r["id"],
        dedupe_key=r["dedupe_key"],
        chat_id=r["chat_id"],
        text=r["text"],
        status=r["status"],
        attempts=r["attempts"],
        last_error=r["last_error"],
        created_at=parse_ts(r["created_at"]),
    )
