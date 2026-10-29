from datetime import UTC, date, datetime

from app.club import format_money, rub_to_kop
from app.core import schedule as sch
from app.core.booking import price_kop

from .conftest import TZ, hm


def test_prices_in_kopecks_without_rounding_errors():
    assert rub_to_kop(700) == 70000
    assert rub_to_kop("0.1") == 10
    assert rub_to_kop(0.1 + 0.2) == 30  # float-артефакт 0.30000000000000004 не протекает
    assert price_kop(70000, 60) == 70000
    assert price_kop(70000, 90) == 105000
    assert price_kop(70000, 120) == 140000
    assert price_kop(50000, 180) == 150000
    assert price_kop(50000, 90) == 75000
    # Нечётное число копеек за час: половина копейки округляется вверх, без float.
    assert price_kop(33333, 90) == 50000
    assert format_money(105000) == "1 050 ₽"
    assert format_money(12345) == "123,45 ₽"


def test_candidate_starts_fit_whole_duration(club):
    s = club.schedule
    starts_60 = sch.candidate_starts(s, 60)
    assert starts_60[0] == hm(12) and starts_60[-1] == hm(25)  # 01:00, конец ровно в 02:00
    assert all(b - a == 30 for a, b in zip(starts_60, starts_60[1:]))
    assert sch.candidate_starts(s, 180)[-1] == hm(23)
    assert sch.candidate_starts(s, 90)[-1] == hm(24, 30)


def test_validate_slot_rules(club):
    s = club.schedule
    now = datetime(2026, 11, 2, 10, 0, tzinfo=UTC)  # 13:00 МСК
    d = date(2026, 11, 2)
    ok = dict(now_utc=now, schedule=s, tz=TZ)
    assert sch.validate_slot(d, hm(18), 60, **ok) is None
    assert sch.validate_slot(d, hm(12, 30), 60, **ok) == "in_past"
    assert sch.validate_slot(d, hm(11), 60, **ok) == "outside_schedule"
    assert sch.validate_slot(d, hm(25), 90, **ok) == "outside_schedule"  # 01:00 + 1,5 ч > 02:00
    assert sch.validate_slot(d, hm(18, 15), 60, **ok) == "outside_schedule"  # не по сетке 30 минут
    assert sch.validate_slot(d, hm(18), 45, **ok) == "bad_duration"
    assert sch.validate_slot(date(2026, 12, 5), hm(18), 60, **ok) == "outside_horizon"
    assert sch.validate_slot(date(2026, 11, 1), hm(25), 60, **ok) == "outside_horizon"
    # Админ без ограничения горизонта всё равно не может записать в прошлое.
    assert sch.validate_slot(date(2026, 11, 1), hm(25), 60, check_horizon=False, **ok) == "in_past"


def test_after_midnight_belongs_to_previous_business_day(club):
    s = club.schedule
    # 00:40 МСК 3 ноября — ещё смена 2 ноября.
    night = datetime(2026, 11, 2, 21, 40, tzinfo=UTC)
    assert sch.business_date(night, s, TZ) == date(2026, 11, 2)
    # Слоты ночи по-прежнему доступны: 01:00 той же смены ещё впереди.
    assert sch.validate_slot(date(2026, 11, 2), hm(25), 60, now_utc=night, schedule=s, tz=TZ) is None
    morning = datetime(2026, 11, 3, 0, 0, tzinfo=UTC)  # 03:00 МСК
    assert sch.business_date(morning, s, TZ) == date(2026, 11, 3)


def test_midnight_crossing_is_stored_in_utc_and_shows_both_dates(club):
    start, end = sch.slot_interval(date(2026, 11, 6), hm(23, 30), 90, TZ)
    assert start == datetime(2026, 11, 6, 20, 30, tzinfo=UTC)
    assert end == datetime(2026, 11, 6, 22, 0, tzinfo=UTC)
    text = sch.fmt_interval(start, end, TZ)
    assert text == "пт, 6 ноя, 23:30 – сб, 7 ноя, 01:00"
    same_day = sch.fmt_interval(*sch.slot_interval(date(2026, 11, 6), hm(18), 60, TZ), TZ)
    assert same_day == "пт, 6 ноя, 18:00–19:00"


def test_timezone_setting_changes_utc_moment(club):
    from zoneinfo import ZoneInfo

    msk, _ = sch.slot_interval(date(2026, 11, 6), hm(18), 60, TZ)
    ekb, _ = sch.slot_interval(date(2026, 11, 6), hm(18), 60, ZoneInfo("Asia/Yekaterinburg"))
    assert (msk - ekb).total_seconds() == 2 * 3600


def test_durations_labels():
    assert [sch.fmt_duration(m) for m in (60, 90, 120, 180)] == ["1 час", "1,5 часа", "2 часа", "3 часа"]


def test_free_gaps():
    a = datetime(2026, 1, 1, 9, tzinfo=UTC)
    h = lambda n: a.replace(hour=9 + n)  # noqa: E731
    gaps = sch.free_gaps([(h(2), h(3)), (h(3), h(4)), (h(6), h(8))], a, h(10))
    assert gaps == [(a, h(2)), (h(4), h(6)), (h(8), h(10))]
