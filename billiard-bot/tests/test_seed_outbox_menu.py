import json

from app.bot.media import CREDITS_PATH, load_credits
from app.core.outbox import Outbox, PermanentSendError
from app.core.seed import DEMO_PLAN, refresh_demo, seed_demo

from .conftest import ADMIN, GUEST_A, hm


async def _count(db, where="1=1"):
    async with db.connect() as conn:
        return (await (await conn.execute(f"SELECT COUNT(*) AS n FROM reservations WHERE {where}")).fetchone())["n"]


async def test_demo_seed_is_repeatable(service, db):
    first = await seed_demo(service)
    assert first > 0
    assert await seed_demo(service) == 0
    assert await seed_demo(service) == 0
    assert await _count(db) == first
    assert await _count(db, "source = 'demo'") == first


async def test_demo_seed_skips_real_bookings_and_refresh_keeps_them(service, db, today):
    # Настоящая бронь ровно на месте первой демо-записи плана (стол 1, сегодня 19:00).
    offset, table, hhmm, duration, _ = DEMO_PLAN[0]
    assert offset == 0
    real = await service.create_guest_booking(GUEST_A, table, today, hm(*map(int, hhmm.split(":"))), 60, "x")
    seeded = await seed_demo(service)
    assert seeded == len(DEMO_PLAN) - 1
    removed, created = await refresh_demo(service, ADMIN)
    assert removed == seeded and created == seeded
    assert (await service.get(real.reservation.id)).status == "confirmed"
    assert await _count(db, "source = 'guest'") == 1


async def test_outbox_failure_keeps_booking_and_retries_without_duplicates(service, db, clock, today):
    outbox = Outbox(db, clock=clock)
    r = await service.create_guest_booking(GUEST_A, 1, today, hm(18), 60, "a")

    async def broken(chat_id, text):
        raise PermanentSendError("чат не найден")

    assert await outbox.deliver_due(broken) == (0, 1)
    assert (await service.get(r.reservation.id)).status == "confirmed"
    total, items = await outbox.problems()
    assert total == 1 and items[0].chat_id == ADMIN and "чат не найден" in items[0].last_error

    sent: list[tuple[int, str]] = []

    async def ok(chat_id, text):
        sent.append((chat_id, text))

    assert await outbox.deliver_due(ok) == (0, 0)  # ещё рано: backoff
    await outbox.make_chat_due(ADMIN)  # админ нажал /start
    assert await outbox.deliver_due(ok) == (1, 0)
    assert await outbox.deliver_due(ok) == (0, 0)
    assert len(sent) == 1 and f"№ {r.reservation.id}" in sent[0][1] and "Стоимость" in sent[0][1]
    assert "@" not in sent[0][1]  # без username и телефона
    assert (await outbox.problems())[0] == 0


def test_every_menu_item_has_local_photo_and_credit(club):
    """Проверяет готовность фотоменю: файл в assets/menu и запись об авторстве."""
    credits = load_credits()
    missing = [i.photo for i in club.all_items() if not i.photo_path.is_file()]
    uncredited = [i.photo for i in club.all_items() if i.photo_path.name not in credits]
    assert not missing, f"нет файлов фотографий: {missing}"
    assert not uncredited, f"нет записи в {CREDITS_PATH.name}: {uncredited}"
    photos = [i.photo_path.read_bytes() for i in club.all_items()]
    assert len(set(photos)) == len(photos), "у разных блюд одинаковые фото"
    for c in credits.values():
        assert c.source_page.startswith("https://") and c.author and c.license
    json.loads(CREDITS_PATH.read_text(encoding="utf-8"))
