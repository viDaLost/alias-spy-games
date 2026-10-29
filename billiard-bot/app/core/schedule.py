"""График работы и расчёт интервалов в часовом поясе клуба.

Слот задаётся парой (бизнес-дата D, минута от полуночи D). Минуты после полуночи
продолжают счёт: 00:30 следующего дня = 24*60 + 30. Так «ночь с пятницы на субботу»
остаётся одной бизнес-датой, а момент времени однозначно переводится в UTC.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from ..club import Schedule

MONTHS_GEN = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
MONTHS_FULL = [
    "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
]
WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]


def open_minute(schedule: Schedule) -> int:
    return schedule.open.hour * 60 + schedule.open.minute


def close_minute(schedule: Schedule) -> int:
    m = schedule.close.hour * 60 + schedule.close.minute
    return m + 24 * 60 if schedule.crosses_midnight else m


def local_at(d: date, minute: int, tz: ZoneInfo) -> datetime:
    """Местное время для (D, минута от полуночи D)."""
    naive = datetime.combine(d, time()) + timedelta(minutes=minute)
    return naive.replace(tzinfo=tz)


def to_utc(dt: datetime) -> datetime:
    return dt.astimezone(UTC)


def slot_interval(d: date, minute: int, duration: int, tz: ZoneInfo) -> tuple[datetime, datetime]:
    start = to_utc(local_at(d, minute, tz))
    return start, start + timedelta(minutes=duration)


def business_window(d: date, schedule: Schedule, tz: ZoneInfo) -> tuple[datetime, datetime]:
    return (
        to_utc(local_at(d, open_minute(schedule), tz)),
        to_utc(local_at(d, close_minute(schedule), tz)),
    )


def business_date(now_utc: datetime, schedule: Schedule, tz: ZoneInfo) -> date:
    """Текущая бизнес-дата: в 00:40 ещё идёт вчерашняя смена (закрытие в 02:00)."""
    local = now_utc.astimezone(tz)
    if schedule.crosses_midnight and local.time() < schedule.close:
        return local.date() - timedelta(days=1)
    return local.date()


def bookable_dates(now_utc: datetime, schedule: Schedule, tz: ZoneInfo) -> list[date]:
    first = business_date(now_utc, schedule, tz)
    return [first + timedelta(days=i) for i in range(schedule.booking_horizon_days)]


def candidate_starts(schedule: Schedule, duration: int) -> list[int]:
    """Все начала по сетке, при которых длительность целиком помещается в график."""
    step = schedule.slot_step_minutes
    first, last = open_minute(schedule), close_minute(schedule) - duration
    return list(range(first, last + 1, step)) if last >= first else []


def validate_slot(
    d: date,
    minute: int,
    duration: int,
    *,
    now_utc: datetime,
    schedule: Schedule,
    tz: ZoneInfo,
    allowed_durations: tuple[int, ...] | None = None,
    check_horizon: bool = True,
) -> str | None:
    """None, если слот допустим; иначе код причины."""
    durations = allowed_durations if allowed_durations is not None else schedule.durations_minutes
    if duration not in durations:
        return "bad_duration"
    if minute not in candidate_starts(schedule, duration):
        return "outside_schedule"
    if check_horizon and d not in bookable_dates(now_utc, schedule, tz):
        return "outside_horizon"
    start, _ = slot_interval(d, minute, duration, tz)
    if start <= now_utc:
        return "in_past"
    return None


# --- форматирование ---------------------------------------------------------------

def fmt_date(d: date, *, weekday: bool = True) -> str:
    base = f"{d.day} {MONTHS_GEN[d.month - 1]}"
    return f"{WEEKDAYS[d.weekday()]}, {base}" if weekday else base


def fmt_hhmm(minute: int) -> str:
    m = minute % (24 * 60)
    return f"{m // 60:02d}:{m % 60:02d}"


def fmt_interval(start_utc: datetime, end_utc: datetime, tz: ZoneInfo) -> str:
    """«пт, 30 окт, 18:00–19:30» или с двумя датами при переходе через полночь."""
    s, e = start_utc.astimezone(tz), end_utc.astimezone(tz)
    if s.date() == e.date():
        return f"{fmt_date(s.date())}, {s:%H:%M}–{e:%H:%M}"
    return f"{fmt_date(s.date())}, {s:%H:%M} – {fmt_date(e.date())}, {e:%H:%M}"


def fmt_start_end(start_utc: datetime, end_utc: datetime, tz: ZoneInfo) -> tuple[str, str]:
    s, e = start_utc.astimezone(tz), end_utc.astimezone(tz)
    return f"{fmt_date(s.date())}, {s:%H:%M}", f"{fmt_date(e.date())}, {e:%H:%M}"


def fmt_duration(minutes: int) -> str:
    hours, rest = divmod(minutes, 60)
    if rest == 0:
        if hours % 10 == 1 and hours % 100 != 11:
            word = "час"
        elif hours % 10 in (2, 3, 4) and hours % 100 not in (12, 13, 14):
            word = "часа"
        else:
            word = "часов"
        return f"{hours} {word}"
    if rest == 30:
        return f"{hours},5 часа"
    return f"{hours} ч {rest} мин"


def fmt_schedule(schedule: Schedule) -> str:
    tail = " следующего дня" if schedule.crosses_midnight else ""
    return f"ежедневно {schedule.open:%H:%M}–{schedule.close:%H:%M}{tail}"


def free_gaps(
    busy: list[tuple[datetime, datetime]], start: datetime, end: datetime
) -> list[tuple[datetime, datetime]]:
    """Свободные промежутки окна [start, end) за вычетом занятых интервалов."""
    gaps = []
    cursor = start
    for b_start, b_end in sorted(busy):
        if b_start > cursor:
            gaps.append((cursor, min(b_start, end)))
        cursor = max(cursor, b_end)
        if cursor >= end:
            break
    if cursor < end:
        gaps.append((cursor, end))
    return [(s, e) for s, e in gaps if e > s]
