import asyncio
import sqlite3
from datetime import timedelta

import pytest

from app.core.booking import AccessDenied
from app.core.db import Database

from .conftest import ADMIN, GUEST_A, GUEST_B, hm, make_service


async def test_create_booking_with_price_and_number(service, today):
    r = await service.create_guest_booking(GUEST_A, 1, today, hm(18), 90, "tok1")
    assert r.status == "created"
    res = r.reservation
    assert res.id > 0 and res.price_kop == 105000 and res.duration_min == 90
    assert res.tg_user_id == GUEST_A and res.guest_no == 101
    assert res.guest_name == "Гость 101"
    # тот же гость получает тот же условный номер, другой — следующий
    r2 = await service.create_guest_booking(GUEST_A, 2, today, hm(18), 60, "tok2")
    r3 = await service.create_guest_booking(GUEST_B, 3, today, hm(18), 60, "tok3")
    assert r2.reservation.guest_no == 101 and r3.reservation.guest_no == 102
    assert r3.reservation.price_kop == 50000


async def test_times_are_stored_in_utc(service, db, today):
    await service.create_guest_booking(GUEST_A, 1, today, hm(18), 60, "t")
    async with db.connect() as conn:
        row = await (await conn.execute("SELECT start_utc, end_utc FROM reservations")).fetchone()
    assert (row["start_utc"], row["end_utc"]) == ("2026-11-02T15:00:00Z", "2026-11-02T16:00:00Z")


async def test_overlap_rejected_adjacent_allowed(service, today):
    assert (await service.create_guest_booking(GUEST_A, 1, today, hm(18), 60, "a")).status == "created"
    clash = await service.create_guest_booking(GUEST_B, 1, today, hm(18, 30), 60, "b")
    assert clash.status == "conflict"
    assert hm(18) not in clash.alternatives and hm(18, 30) not in clash.alternatives
    assert hm(19) in clash.alternatives
    inner = await service.create_guest_booking(GUEST_B, 1, today, hm(17), 180, "c")
    assert inner.status == "conflict"  # охватывает существующую бронь целиком
    before = await service.create_guest_booking(GUEST_B, 1, today, hm(17), 60, "d")
    after = await service.create_guest_booking(GUEST_B, 1, today, hm(19), 60, "e")
    assert before.status == "created" and after.status == "created"  # 17–18 и 19–20 соседние
    other_table = await service.create_guest_booking(GUEST_B, 2, today, hm(18), 60, "f")
    assert other_table.status == "created"


async def test_free_starts_exclude_busy_and_past(service, today, clock):
    await service.create_guest_booking(GUEST_A, 1, today, hm(18), 120, "a")
    starts = await service.free_starts(1, today, 60)
    assert hm(13) not in starts  # 13:00 — сейчас, уже не в будущем
    assert hm(13, 30) in starts
    assert hm(17) in starts and hm(17, 30) not in starts  # 17:30–18:30 пересекается
    assert hm(18) not in starts and hm(19, 30) not in starts
    assert hm(20) in starts and starts[-1] == hm(25)


async def test_double_click_is_idempotent(service, db, today):
    r1 = await service.create_guest_booking(GUEST_A, 1, today, hm(20), 60, "same")
    r2 = await service.create_guest_booking(GUEST_A, 1, today, hm(20), 60, "same")
    assert r1.status == "created" and r2.status == "duplicate"
    assert r2.reservation.id == r1.reservation.id
    async with db.connect() as conn:
        n = (await (await conn.execute("SELECT COUNT(*) AS n FROM reservations")).fetchone())["n"]
        notes = (await (await conn.execute("SELECT COUNT(*) AS n FROM outbox")).fetchone())["n"]
    assert n == 1 and notes == 1


async def test_concurrent_confirmations_create_one_booking(db, club, clock, today):
    # Разные экземпляры сервиса и разные подключения — как два одновременных запроса.
    services = [make_service(Database(db.path), club, clock) for _ in range(8)]
    results = await asyncio.gather(*[
        s.create_guest_booking(1000 + i, 3, today, hm(21) + (30 if i % 2 else 0), 60, f"tok{i}")
        for i, s in enumerate(services)
    ])
    statuses = sorted(r.status for r in results)
    assert statuses.count("created") == 1, statuses
    assert statuses.count("conflict") == 7
    async with db.connect() as conn:
        n = (await (await conn.execute(
            "SELECT COUNT(*) AS n FROM reservations WHERE status = 'confirmed'")).fetchone())["n"]
    assert n == 1


async def test_database_trigger_blocks_overlap_even_without_service(service, db, today):
    await service.create_guest_booking(GUEST_A, 4, today, hm(18), 60, "a")
    async with db.connect() as conn:
        with pytest.raises(sqlite3.IntegrityError, match="RESERVATION_OVERLAP"):
            await conn.execute(
                "INSERT INTO reservations (kind, table_id, start_utc, end_utc, duration_min, status, source, "
                "created_at) VALUES ('booking', 4, '2026-11-02T15:30:00Z', '2026-11-02T16:30:00Z', 60, "
                "'confirmed', 'guest', '2026-11-02T10:00:00Z')"
            )


async def test_cancel_frees_time_and_notifies_admin(service, db, today):
    r = await service.create_guest_booking(GUEST_A, 1, today, hm(18), 60, "a")
    assert hm(18) not in await service.free_starts(1, today, 60)
    c = await service.cancel_by_guest(GUEST_A, r.reservation.id)
    assert c.status == "cancelled"
    assert hm(18) in await service.free_starts(1, today, 60)
    again = await service.create_guest_booking(GUEST_B, 1, today, hm(18), 60, "b")
    assert again.status == "created"
    assert (await service.cancel_by_guest(GUEST_A, r.reservation.id)).status == "already_cancelled"
    async with db.connect() as conn:
        keys = [row["dedupe_key"] for row in await (await conn.execute("SELECT dedupe_key FROM outbox")).fetchall()]
    assert f"r:{r.reservation.id}:cancelled_by_guest:{ADMIN}" in keys


async def test_cannot_cancel_started_booking(service, clock, today):
    r = await service.create_guest_booking(GUEST_A, 1, today, hm(14), 60, "a")
    clock.shift(hours=1, minutes=30)  # 14:30
    assert (await service.cancel_by_guest(GUEST_A, r.reservation.id)).status == "too_late"


async def test_foreign_booking_is_invisible_and_not_cancellable(service, today):
    r = await service.create_guest_booking(GUEST_A, 1, today, hm(18), 60, "a")
    rid = r.reservation.id
    assert await service.get_for_user(GUEST_B, rid) is None
    assert (await service.cancel_by_guest(GUEST_B, rid)).status == "not_found"
    upcoming, history = await service.list_for_user(GUEST_B)
    assert upcoming == [] and history == []
    still = await service.get_for_user(GUEST_A, rid)
    assert still is not None and still.status == "confirmed"


async def test_admin_operations_require_admin(service, today):
    r = await service.create_guest_booking(GUEST_A, 1, today, hm(18), 60, "a")
    for call in (
        service.admin_cancel(GUEST_B, r.reservation.id),
        service.admin_get(GUEST_B, r.reservation.id),
        service.admin_day(GUEST_B, today),
        service.admin_create_booking(GUEST_B, 2, today, hm(18), 60, "x"),
        service.admin_create_block(GUEST_B, 2, today, hm(18), 60, "y"),
    ):
        with pytest.raises(AccessDenied):
            await call
    assert (await service.get(r.reservation.id)).status == "confirmed"


async def test_admin_cancel_notifies_guest(service, db, today):
    r = await service.create_guest_booking(GUEST_A, 1, today, hm(18), 60, "a")
    c = await service.admin_cancel(ADMIN, r.reservation.id)
    assert c.status == "cancelled"
    async with db.connect() as conn:
        rows = await (await conn.execute("SELECT chat_id, text FROM outbox WHERE chat_id = ?", (GUEST_A,))).fetchall()
    assert len(rows) == 1 and "отменена администратором" in rows[0]["text"]


async def test_manual_booking_and_block_use_same_overlap_rules(service, today):
    guest = await service.create_guest_booking(GUEST_A, 2, today, hm(19), 60, "a")
    clash = await service.admin_create_booking(ADMIN, 2, today, hm(18, 30), 60, "m1")
    assert clash.status == "conflict"
    assert (await service.get(guest.reservation.id)).status == "confirmed"  # существующая бронь не тронута
    block_clash = await service.admin_create_block(ADMIN, 2, today, hm(19), 120, "b1")
    assert block_clash.status == "conflict"

    manual = await service.admin_create_booking(ADMIN, 2, today, hm(21), 60, "m2")
    assert manual.status == "created" and manual.reservation.source == "admin"
    assert manual.reservation.guest_name.endswith("(по телефону)")

    block = await service.admin_create_block(ADMIN, 1, today, hm(15), 120, "b2")
    assert block.status == "created" and block.reservation.price_kop == 0
    assert (await service.create_guest_booking(GUEST_B, 1, today, hm(16), 60, "g")).status == "conflict"
    assert hm(15) not in await service.free_starts(1, today, 60)
    await service.admin_cancel(ADMIN, block.reservation.id)  # снятие блокировки
    assert hm(15) in await service.free_starts(1, today, 60)


async def test_booking_in_past_or_outside_schedule_rejected(service, today):
    assert (await service.create_guest_booking(GUEST_A, 1, today, hm(12), 60, "a")).reason == "in_past"
    assert (await service.create_guest_booking(GUEST_A, 1, today, hm(25), 90, "b")).reason == "outside_schedule"
    assert (await service.create_guest_booking(GUEST_A, 9, today, hm(18), 60, "c")).reason == "bad_table"
    far = today + timedelta(days=45)
    assert (await service.create_guest_booking(GUEST_A, 1, far, hm(18), 60, "d")).reason == "outside_horizon"


async def test_midnight_booking(service, today):
    r = await service.create_guest_booking(GUEST_A, 3, today, hm(23, 30), 90, "n")
    res = r.reservation
    assert r.status == "created" and res.price_kop == 75000
    text = service.describe(res)
    assert "пн, 2 ноя, 23:30 – вт, 3 ноя, 01:00" in text
    # следующая смена начинается в 12:00, ночная бронь её не задевает
    assert hm(12) in await service.free_starts(3, today + timedelta(days=1), 60)


async def test_data_survives_reopening_database(db, club, clock, today):
    s1 = make_service(db, club, clock)
    r = await s1.create_guest_booking(GUEST_A, 1, today, hm(18), 60, "a")
    reopened = Database(db.path)
    await reopened.init()  # повторная инициализация схемы не стирает данные
    s2 = make_service(reopened, club, clock)
    upcoming, _ = await s2.list_for_user(GUEST_A)
    assert [x.id for x in upcoming] == [r.reservation.id]
    assert hm(18) not in await s2.free_starts(1, today, 60)


async def test_user_history(service, clock, today):
    a = await service.create_guest_booking(GUEST_A, 1, today, hm(14), 60, "a")
    b = await service.create_guest_booking(GUEST_A, 1, today, hm(18), 60, "b")
    c = await service.create_guest_booking(GUEST_A, 2, today, hm(19), 60, "c")
    await service.cancel_by_guest(GUEST_A, c.reservation.id)
    clock.shift(hours=2, minutes=30)  # 15:30 — первая бронь завершена
    upcoming, history = await service.list_for_user(GUEST_A)
    assert [x.id for x in upcoming] == [b.reservation.id]
    assert {x.id for x in history} == {a.reservation.id, c.reservation.id}
