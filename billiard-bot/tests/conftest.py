from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.club import load_club
from app.core.booking import BookingService
from app.core.db import Database
from app.settings import PROJECT_ROOT

TZ = ZoneInfo("Europe/Moscow")
ADMIN = 111
GUEST_A = 501
GUEST_B = 502


class Clock:
    """Управляемые часы: тесты не зависят от текущего времени."""

    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def set_local(self, d: date, hh: int, mm: int = 0) -> None:
        self.now = datetime(d.year, d.month, d.day, hh, mm, tzinfo=TZ).astimezone(UTC)

    def shift(self, **kw) -> None:
        self.now += timedelta(**kw)


@pytest.fixture
def club():
    return load_club(PROJECT_ROOT / "config" / "club.json")


@pytest.fixture
def clock():
    # Понедельник, 2 ноября 2026, 13:00 по Москве.
    return Clock(datetime(2026, 11, 2, 10, 0, tzinfo=UTC))


@pytest.fixture
def today(clock):
    return clock.now.astimezone(TZ).date()


@pytest.fixture
async def db(tmp_path):
    database = Database(tmp_path / "test.db")
    await database.init()
    return database


def make_service(db, club, clock, **kw) -> BookingService:
    return BookingService(db, club, TZ, admin_ids={ADMIN}, notify_chats=[ADMIN], clock=clock, **kw)


@pytest.fixture
def service(db, club, clock):
    return make_service(db, club, clock)


def hm(hh: int, mm: int = 0) -> int:
    """Минута бизнес-дня; часы после полуночи передавайте как 24, 25…"""
    return hh * 60 + mm
