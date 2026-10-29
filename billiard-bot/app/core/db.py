"""SQLite: схема, подключения и транзакции.

Защита от двойной записи живёт в самой БД:
* запись выполняется в транзакции BEGIN IMMEDIATE — писатели сериализуются SQLite,
  в том числе из разных подключений и процессов;
* триггеры запрещают пересекающиеся подтверждённые записи одного стола, даже если
  код где-то забудет проверку.
Моменты времени хранятся в UTC строками фиксированного формата «YYYY-MM-DDTHH:MM:SSZ»,
поэтому их можно сравнивать лексикографически.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

import aiosqlite

SCHEMA_VERSION = 1

OVERLAP_ERROR = "RESERVATION_OVERLAP"

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guests (
    guest_no    INTEGER PRIMARY KEY,
    tg_user_id  INTEGER UNIQUE,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reservations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    kind             TEXT NOT NULL CHECK (kind IN ('booking', 'block')),
    table_id         INTEGER NOT NULL,
    start_utc        TEXT NOT NULL,
    end_utc          TEXT NOT NULL,
    duration_min     INTEGER NOT NULL CHECK (duration_min > 0),
    status           TEXT NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
    source           TEXT NOT NULL CHECK (source IN ('guest', 'admin', 'demo')),
    tg_user_id       INTEGER,
    guest_no         INTEGER REFERENCES guests (guest_no),
    price_kop        INTEGER NOT NULL DEFAULT 0 CHECK (price_kop >= 0),
    note             TEXT,
    idempotency_key  TEXT UNIQUE,
    demo_key         TEXT UNIQUE,
    created_at       TEXT NOT NULL,
    created_by       INTEGER,
    cancelled_at     TEXT,
    cancelled_by     INTEGER,
    CHECK (end_utc > start_utc)
);

CREATE INDEX IF NOT EXISTS ix_reservations_table_time
    ON reservations (table_id, status, start_utc, end_utc);
CREATE INDEX IF NOT EXISTS ix_reservations_user
    ON reservations (tg_user_id, start_utc);

CREATE TRIGGER IF NOT EXISTS trg_reservations_no_overlap_insert
BEFORE INSERT ON reservations
WHEN NEW.status = 'confirmed'
BEGIN
    SELECT RAISE(ABORT, '{OVERLAP_ERROR}')
    WHERE EXISTS (
        SELECT 1 FROM reservations r
        WHERE r.table_id = NEW.table_id
          AND r.status = 'confirmed'
          AND r.start_utc < NEW.end_utc
          AND r.end_utc > NEW.start_utc
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_reservations_no_overlap_update
BEFORE UPDATE OF status, table_id, start_utc, end_utc ON reservations
WHEN NEW.status = 'confirmed'
BEGIN
    SELECT RAISE(ABORT, '{OVERLAP_ERROR}')
    WHERE EXISTS (
        SELECT 1 FROM reservations r
        WHERE r.id <> NEW.id
          AND r.table_id = NEW.table_id
          AND r.status = 'confirmed'
          AND r.start_utc < NEW.end_utc
          AND r.end_utc > NEW.start_utc
    );
END;

CREATE TABLE IF NOT EXISTS outbox (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    dedupe_key       TEXT NOT NULL UNIQUE,
    chat_id          INTEGER NOT NULL,
    text             TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
    attempts         INTEGER NOT NULL DEFAULT 0,
    last_error       TEXT,
    next_attempt_at  TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    sent_at          TEXT
);

CREATE INDEX IF NOT EXISTS ix_outbox_status ON outbox (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS media_cache (
    path        TEXT PRIMARY KEY,
    sha256      TEXT NOT NULL,
    file_id     TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
"""


def ts(dt: datetime) -> str:
    """datetime → строка UTC фиксированной ширины."""
    if dt.tzinfo is None:
        raise ValueError("naive datetime is not allowed")
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_ts(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)


class Database:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)

    async def init(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        async with self.connect() as conn:
            await conn.execute("PRAGMA journal_mode = WAL")
            await conn.executescript(SCHEMA)
            await conn.execute(
                "INSERT INTO meta (key, value) VALUES ('schema_version', ?) "
                "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                (str(SCHEMA_VERSION),),
            )
            await conn.commit()

    @asynccontextmanager
    async def connect(self) -> AsyncIterator[aiosqlite.Connection]:
        # Отдельное подключение на единицу работы: транзакции разных обработчиков
        # не перемешиваются, а сериализацию писателей обеспечивает сама SQLite.
        conn = await aiosqlite.connect(self.path, timeout=15, isolation_level=None)
        try:
            conn.row_factory = aiosqlite.Row
            await conn.execute("PRAGMA foreign_keys = ON")
            await conn.execute("PRAGMA busy_timeout = 15000")
            yield conn
        finally:
            await conn.close()

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[aiosqlite.Connection]:
        async with self.connect() as conn:
            await conn.execute("BEGIN IMMEDIATE")
            try:
                yield conn
            except BaseException:
                await conn.execute("ROLLBACK")
                raise
            else:
                await conn.execute("COMMIT")
