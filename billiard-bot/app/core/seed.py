"""Фиктивные занятые интервалы для демонстрации.

Каждая демо-запись имеет уникальный demo_key, поэтому повторный засев не создаёт
дубликатов. Засев пропускает интервалы, пересекающиеся с настоящими записями,
и никогда не трогает записи с source <> 'demo'.
"""

from __future__ import annotations

import sqlite3
from datetime import timedelta

from .booking import BookingService, price_kop
from .db import OVERLAP_ERROR, ts

# (смещение бизнес-даты от сегодня, стол, начало «ЧЧ:ММ» — после полуночи как 24:30, длительность, вид)
DEMO_PLAN: list[tuple[int, int, str, int, str]] = [
    (0, 1, "19:00", 120, "booking"),
    (0, 3, "20:00", 90, "booking"),
    (0, 2, "23:00", 120, "booking"),   # через полночь: до 01:00
    (1, 1, "18:00", 180, "booking"),
    (1, 4, "14:00", 120, "block"),     # «техническое обслуживание»
    (1, 3, "21:30", 60, "booking"),
    (2, 2, "16:00", 90, "booking"),
    (2, 1, "20:30", 120, "booking"),
    (2, 4, "19:00", 60, "booking"),
]


def _minute(hhmm: str) -> int:
    hh, mm = hhmm.split(":")
    return int(hh) * 60 + int(mm)


async def seed_demo(service: BookingService) -> int:
    """Добавляет недостающие демо-записи. Возвращает число новых записей."""
    today = service.today()
    now = service.now()
    created = 0
    for offset, table_id, hhmm, duration, kind in DEMO_PLAN:
        table = service.club.table(table_id)
        if table is None:
            continue
        d = today + timedelta(days=offset)
        minute = _minute(hhmm)
        start, end = service.interval(d, minute, duration)
        if start <= now:
            continue
        key = f"demo:{d.isoformat()}:{table_id}:{minute}:{duration}:{kind}"
        try:
            async with service.db.transaction() as conn:
                exists = await (await conn.execute(
                    "SELECT 1 FROM reservations WHERE demo_key = ?", (key,)
                )).fetchone()
                if exists:
                    continue
                cur = await conn.execute(
                    "INSERT INTO reservations (kind, table_id, start_utc, end_utc, duration_min, status, source, "
                    "price_kop, note, demo_key, created_at) VALUES (?, ?, ?, ?, ?, 'confirmed', 'demo', ?, ?, ?, ?)",
                    (
                        kind, table_id, ts(start), ts(end), duration,
                        price_kop(table.rate_kop_per_hour, duration) if kind == "booking" else 0,
                        "Демо: техническое обслуживание" if kind == "block" else "Демо: фиктивная бронь",
                        key, ts(now),
                    ),
                )
                created += cur.rowcount
        except sqlite3.IntegrityError as exc:
            if OVERLAP_ERROR not in str(exc):
                raise
            # Интервал уже занят настоящей записью — демо-запись не нужна.
    return created


async def refresh_demo(service: BookingService, actor_id: int) -> tuple[int, int]:
    """Пересоздаёт только фиктивные демо-записи. Возвращает (удалено, создано)."""
    service.require_admin(actor_id)
    async with service.db.transaction() as conn:
        cur = await conn.execute("DELETE FROM reservations WHERE source = 'demo'")
        removed = cur.rowcount
    created = await seed_demo(service)
    return removed, created
