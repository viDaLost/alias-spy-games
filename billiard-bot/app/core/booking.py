"""Бизнес-логика бронирования, не зависящая от Telegram.

Всё, что меняет данные, выполняется в одной транзакции BEGIN IMMEDIATE: проверка
пересечений, запись брони и постановка уведомлений в очередь. Права (владелец брони,
администратор) проверяются здесь же, а не только в обработчиках.
"""

from __future__ import annotations

import html
import sqlite3
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

import aiosqlite

from ..club import Club, Table, format_money
from . import schedule as sch
from .db import OVERLAP_ERROR, Database, parse_ts, ts
from .outbox import enqueue


class AccessDenied(Exception):
    pass


def price_kop(rate_kop_per_hour: int, minutes: int) -> int:
    """Стоимость в копейках: целочисленно, округление половины копейки вверх."""
    return (rate_kop_per_hour * minutes + 30) // 60


@dataclass(frozen=True)
class Reservation:
    id: int
    kind: str
    table_id: int
    start: datetime
    end: datetime
    duration_min: int
    status: str
    source: str
    tg_user_id: int | None
    guest_no: int | None
    price_kop: int
    note: str | None
    created_at: datetime
    cancelled_at: datetime | None
    cancelled_by: int | None

    @property
    def is_block(self) -> bool:
        return self.kind == "block"

    @property
    def is_demo(self) -> bool:
        return self.source == "demo"

    @property
    def is_active(self) -> bool:
        return self.status == "confirmed"

    @property
    def guest_name(self) -> str:
        if self.is_block:
            return "Блокировка"
        if self.is_demo:
            return "Демо-запись"
        if self.guest_no is None:
            return "Гость"
        suffix = " (по телефону)" if self.source == "admin" else ""
        return f"Гость {self.guest_no}{suffix}"


def _row(r: aiosqlite.Row) -> Reservation:
    return Reservation(
        id=r["id"],
        kind=r["kind"],
        table_id=r["table_id"],
        start=parse_ts(r["start_utc"]),
        end=parse_ts(r["end_utc"]),
        duration_min=r["duration_min"],
        status=r["status"],
        source=r["source"],
        tg_user_id=r["tg_user_id"],
        guest_no=r["guest_no"],
        price_kop=r["price_kop"],
        note=r["note"],
        created_at=parse_ts(r["created_at"]),
        cancelled_at=parse_ts(r["cancelled_at"]) if r["cancelled_at"] else None,
        cancelled_by=r["cancelled_by"],
    )


@dataclass
class CreateResult:
    status: Literal["created", "duplicate", "conflict", "invalid"]
    reservation: Reservation | None = None
    reason: str | None = None
    alternatives: list[int] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.status in ("created", "duplicate")


@dataclass
class CancelResult:
    status: Literal["cancelled", "already_cancelled", "not_found", "too_late"]
    reservation: Reservation | None = None


REASON_TEXT = {
    "bad_table": "Такого стола нет.",
    "bad_duration": "Такая длительность недоступна.",
    "outside_schedule": "Это время вне графика работы клуба.",
    "outside_horizon": "Бронирование открыто только на ближайшие 30 дней.",
    "in_past": "Это время уже прошло.",
}


class BookingService:
    def __init__(
        self,
        db: Database,
        club: Club,
        tz: ZoneInfo,
        *,
        admin_ids: Iterable[int] = (),
        notify_chats: Iterable[int] = (),
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.db = db
        self.club = club
        self.tz = tz
        self.admin_ids = frozenset(admin_ids)
        self.notify_chats = tuple(notify_chats)
        self.clock = clock or (lambda: datetime.now(UTC))

    # --- общее -------------------------------------------------------------------

    def now(self) -> datetime:
        return self.clock()

    def is_admin(self, user_id: int | None) -> bool:
        return user_id is not None and user_id in self.admin_ids

    def require_admin(self, user_id: int | None) -> None:
        if not self.is_admin(user_id):
            raise AccessDenied("admin only")

    def today(self) -> date:
        return sch.business_date(self.now(), self.club.schedule, self.tz)

    def bookable_dates(self) -> list[date]:
        return sch.bookable_dates(self.now(), self.club.schedule, self.tz)

    def interval(self, d: date, minute: int, duration: int) -> tuple[datetime, datetime]:
        return sch.slot_interval(d, minute, duration, self.tz)

    def quote(self, table: Table, duration: int) -> int:
        return price_kop(table.rate_kop_per_hour, duration)

    def validate(self, table_id: int, d: date, minute: int, duration: int, *, admin: bool = False) -> str | None:
        if self.club.table(table_id) is None:
            return "bad_table"
        return sch.validate_slot(
            d, minute, duration,
            now_utc=self.now(), schedule=self.club.schedule, tz=self.tz,
            check_horizon=not admin,
        )

    # --- доступность -------------------------------------------------------------

    async def _busy(self, conn: aiosqlite.Connection, table_id: int, start: datetime, end: datetime) -> list[Reservation]:
        rows = await (await conn.execute(
            "SELECT * FROM reservations WHERE table_id = ? AND status = 'confirmed' "
            "AND start_utc < ? AND end_utc > ? ORDER BY start_utc",
            (table_id, ts(end), ts(start)),
        )).fetchall()
        return [_row(r) for r in rows]

    async def _free_starts(self, conn: aiosqlite.Connection, table_id: int, d: date, duration: int) -> list[int]:
        win_start, win_end = sch.business_window(d, self.club.schedule, self.tz)
        busy = await self._busy(conn, table_id, win_start, win_end)
        now = self.now()
        result = []
        for minute in sch.candidate_starts(self.club.schedule, duration):
            start, end = self.interval(d, minute, duration)
            if start <= now:
                continue
            if any(b.start < end and b.end > start for b in busy):
                continue
            result.append(minute)
        return result

    async def free_starts(self, table_id: int, d: date, duration: int) -> list[int]:
        if self.club.table(table_id) is None or duration not in self.club.schedule.durations_minutes:
            return []
        async with self.db.connect() as conn:
            return await self._free_starts(conn, table_id, d, duration)

    async def has_free_time(self, table_id: int, d: date) -> bool:
        shortest = min(self.club.schedule.durations_minutes)
        return bool(await self.free_starts(table_id, d, shortest))

    # --- создание ----------------------------------------------------------------

    async def _guest_no(self, conn: aiosqlite.Connection, tg_user_id: int | None) -> int:
        if tg_user_id is not None:
            row = await (await conn.execute(
                "SELECT guest_no FROM guests WHERE tg_user_id = ?", (tg_user_id,)
            )).fetchone()
            if row:
                return row["guest_no"]
        row = await (await conn.execute("SELECT COALESCE(MAX(guest_no), 100) + 1 AS n FROM guests")).fetchone()
        no = row["n"]
        await conn.execute(
            "INSERT INTO guests (guest_no, tg_user_id, created_at) VALUES (?, ?, ?)",
            (no, tg_user_id, ts(self.now())),
        )
        return no

    async def guest_number(self, tg_user_id: int) -> int:
        async with self.db.transaction() as conn:
            return await self._guest_no(conn, tg_user_id)

    async def _create(
        self,
        *,
        kind: str,
        source: str,
        table_id: int,
        d: date,
        minute: int,
        duration: int,
        tg_user_id: int | None,
        actor_id: int | None,
        idempotency_key: str | None,
        note: str | None = None,
        admin: bool = False,
    ) -> CreateResult:
        reason = self.validate(table_id, d, minute, duration, admin=admin)
        if reason:
            return CreateResult("invalid", reason=reason)
        table = self.club.table(table_id)
        assert table is not None
        start, end = self.interval(d, minute, duration)
        now = self.now()
        try:
            async with self.db.transaction() as conn:
                if idempotency_key:
                    row = await (await conn.execute(
                        "SELECT * FROM reservations WHERE idempotency_key = ?", (idempotency_key,)
                    )).fetchone()
                    if row:
                        return CreateResult("duplicate", reservation=_row(row))
                if await self._busy(conn, table_id, start, end):
                    alternatives = await self._free_starts(conn, table_id, d, duration)
                    return CreateResult("conflict", reason="busy", alternatives=alternatives)
                guest_no = None
                if kind == "booking":
                    guest_no = await self._guest_no(conn, tg_user_id)
                cur = await conn.execute(
                    "INSERT INTO reservations (kind, table_id, start_utc, end_utc, duration_min, status, "
                    "source, tg_user_id, guest_no, price_kop, note, idempotency_key, created_at, created_by) "
                    "VALUES (?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        kind, table_id, ts(start), ts(end), duration, source, tg_user_id, guest_no,
                        self.quote(table, duration) if kind == "booking" else 0,
                        note, idempotency_key, ts(now), actor_id,
                    ),
                )
                rid = cur.lastrowid
                res = _row(await (await conn.execute("SELECT * FROM reservations WHERE id = ?", (rid,))).fetchone())
                if kind == "booking":
                    await self._notify_admins(conn, res, "created", exclude=actor_id if source == "admin" else None)
        except sqlite3.IntegrityError as exc:
            # Последний рубеж: триггер в БД поймал пересечение.
            if OVERLAP_ERROR in str(exc):
                return CreateResult("conflict", reason="busy",
                                    alternatives=await self.free_starts(table_id, d, duration))
            raise
        return CreateResult("created", reservation=res)

    async def create_guest_booking(
        self, user_id: int, table_id: int, d: date, minute: int, duration: int, token: str
    ) -> CreateResult:
        return await self._create(
            kind="booking", source="guest", table_id=table_id, d=d, minute=minute, duration=duration,
            tg_user_id=user_id, actor_id=user_id, idempotency_key=f"g:{user_id}:{token}",
        )

    async def admin_create_booking(
        self, actor_id: int, table_id: int, d: date, minute: int, duration: int, token: str
    ) -> CreateResult:
        self.require_admin(actor_id)
        return await self._create(
            kind="booking", source="admin", table_id=table_id, d=d, minute=minute, duration=duration,
            tg_user_id=None, actor_id=actor_id, idempotency_key=f"a:{actor_id}:{token}", admin=True,
        )

    async def admin_create_block(
        self, actor_id: int, table_id: int, d: date, minute: int, duration: int, token: str
    ) -> CreateResult:
        self.require_admin(actor_id)
        return await self._create(
            kind="block", source="admin", table_id=table_id, d=d, minute=minute, duration=duration,
            tg_user_id=None, actor_id=actor_id, idempotency_key=f"b:{actor_id}:{token}",
            note="Стол недоступен", admin=True,
        )

    # --- чтение ------------------------------------------------------------------

    async def get(self, reservation_id: int) -> Reservation | None:
        async with self.db.connect() as conn:
            row = await (await conn.execute("SELECT * FROM reservations WHERE id = ?", (reservation_id,))).fetchone()
        return _row(row) if row else None

    async def get_for_user(self, user_id: int, reservation_id: int) -> Reservation | None:
        """Бронь, только если она принадлежит этому пользователю Telegram."""
        async with self.db.connect() as conn:
            row = await (await conn.execute(
                "SELECT * FROM reservations WHERE id = ? AND tg_user_id = ? AND kind = 'booking'",
                (reservation_id, user_id),
            )).fetchone()
        return _row(row) if row else None

    async def admin_get(self, actor_id: int, reservation_id: int) -> Reservation | None:
        self.require_admin(actor_id)
        return await self.get(reservation_id)

    async def list_for_user(self, user_id: int, history_limit: int = 10) -> tuple[list[Reservation], list[Reservation]]:
        now = ts(self.now())
        async with self.db.connect() as conn:
            upcoming = await (await conn.execute(
                "SELECT * FROM reservations WHERE tg_user_id = ? AND kind = 'booking' "
                "AND status = 'confirmed' AND end_utc > ? ORDER BY start_utc",
                (user_id, now),
            )).fetchall()
            history = await (await conn.execute(
                "SELECT * FROM reservations WHERE tg_user_id = ? AND kind = 'booking' "
                "AND (status = 'cancelled' OR end_utc <= ?) ORDER BY start_utc DESC LIMIT ?",
                (user_id, now, history_limit),
            )).fetchall()
        return [_row(r) for r in upcoming], [_row(r) for r in history]

    async def admin_day(self, actor_id: int, d: date, table_id: int | None = None) -> list[Reservation]:
        self.require_admin(actor_id)
        win_start, win_end = sch.business_window(d, self.club.schedule, self.tz)
        query = ("SELECT * FROM reservations WHERE status = 'confirmed' AND start_utc < ? AND end_utc > ?")
        params: list[object] = [ts(win_end), ts(win_start)]
        if table_id is not None:
            query += " AND table_id = ?"
            params.append(table_id)
        query += " ORDER BY table_id, start_utc"
        async with self.db.connect() as conn:
            rows = await (await conn.execute(query, params)).fetchall()
        return [_row(r) for r in rows]

    # --- отмена ------------------------------------------------------------------

    async def cancel_by_guest(self, user_id: int, reservation_id: int) -> CancelResult:
        now = self.now()
        async with self.db.transaction() as conn:
            row = await (await conn.execute(
                "SELECT * FROM reservations WHERE id = ? AND tg_user_id = ? AND kind = 'booking'",
                (reservation_id, user_id),
            )).fetchone()
            if not row:
                return CancelResult("not_found")
            res = _row(row)
            if res.status == "cancelled":
                return CancelResult("already_cancelled", res)
            if res.start <= now:
                return CancelResult("too_late", res)
            await conn.execute(
                "UPDATE reservations SET status = 'cancelled', cancelled_at = ?, cancelled_by = ? "
                "WHERE id = ? AND status = 'confirmed'",
                (ts(now), user_id, reservation_id),
            )
            res = _row(await (await conn.execute("SELECT * FROM reservations WHERE id = ?", (reservation_id,))).fetchone())
            await self._notify_admins(conn, res, "cancelled_by_guest")
        return CancelResult("cancelled", res)

    async def admin_cancel(self, actor_id: int, reservation_id: int) -> CancelResult:
        """Отмена брони или снятие блокировки администратором."""
        self.require_admin(actor_id)
        now = self.now()
        async with self.db.transaction() as conn:
            row = await (await conn.execute("SELECT * FROM reservations WHERE id = ?", (reservation_id,))).fetchone()
            if not row:
                return CancelResult("not_found")
            res = _row(row)
            if res.status == "cancelled":
                return CancelResult("already_cancelled", res)
            await conn.execute(
                "UPDATE reservations SET status = 'cancelled', cancelled_at = ?, cancelled_by = ? WHERE id = ?",
                (ts(now), actor_id, reservation_id),
            )
            res = _row(await (await conn.execute("SELECT * FROM reservations WHERE id = ?", (reservation_id,))).fetchone())
            if res.kind == "booking" and res.tg_user_id is not None:
                await enqueue(
                    conn,
                    dedupe_key=f"r:{res.id}:cancelled_by_admin:{res.tg_user_id}",
                    chat_id=res.tg_user_id,
                    text=self.guest_cancel_text(res),
                    now=now,
                )
            if res.kind == "booking":
                await self._notify_admins(conn, res, "cancelled_by_admin", exclude=actor_id)
        return CancelResult("cancelled", res)

    # --- уведомления -------------------------------------------------------------

    def describe(self, res: Reservation) -> str:
        table = self.club.table(res.table_id)
        table_line = html.escape(table.title if table else f"Стол {res.table_id}")
        when = sch.fmt_interval(res.start, res.end, self.tz)
        return f"{table_line}\n{when} ({sch.fmt_duration(res.duration_min)})"

    def admin_event_text(self, res: Reservation, event: str) -> str:
        head = {
            "created": f"🆕 Новая бронь № {res.id}",
            "cancelled_by_guest": f"❌ Гость отменил бронь № {res.id}",
            "cancelled_by_admin": f"🚫 Администратор отменил бронь № {res.id}",
        }[event]
        origin = "через бота" if res.source == "guest" else "создана администратором"
        return (
            f"<b>{head}</b>\n{self.describe(res)}\n"
            f"Стоимость: {format_money(res.price_kop)}\n"
            f"{res.guest_name} · {origin}"
        )

    def guest_cancel_text(self, res: Reservation) -> str:
        return (
            f"<b>Бронь № {res.id} отменена администратором</b>\n{self.describe(res)}\n\n"
            "Время снова свободно. Если это ошибка — забронируйте заново через главное меню."
        )

    async def _notify_admins(
        self, conn: aiosqlite.Connection, res: Reservation, event: str, *, exclude: int | None = None
    ) -> None:
        text = self.admin_event_text(res, event)
        for chat_id in self.notify_chats:
            if exclude is not None and chat_id == exclude:
                continue
            await enqueue(conn, dedupe_key=f"r:{res.id}:{event}:{chat_id}", chat_id=chat_id, text=text, now=self.now())
