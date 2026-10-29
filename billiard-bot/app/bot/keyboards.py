"""Inline-клавиатуры. Навигация «Назад» / «Главное меню» есть на каждом шаге."""

from __future__ import annotations

import calendar
from collections.abc import Callable, Sequence
from datetime import date, timedelta

from aiogram.filters.callback_data import CallbackData
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
from aiogram.utils.keyboard import InlineKeyboardBuilder

from ..club import Club, format_money
from ..core import schedule as sch
from .callbacks import Ad, Nav

BTN_MAIN = "🏠 Главное меню"
BTN_BACK = "⬅️ Назад"


def btn(text: str, cb: CallbackData | str) -> InlineKeyboardButton:
    data = cb if isinstance(cb, str) else cb.pack()
    return InlineKeyboardButton(text=text, callback_data=data)


def noop(text: str = " ") -> InlineKeyboardButton:
    return btn(text, Nav(to="noop"))


def nav_row(back: CallbackData | None = None) -> list[InlineKeyboardButton]:
    row = []
    if back is not None:
        row.append(btn(BTN_BACK, back))
    row.append(btn(BTN_MAIN, Nav(to="main")))
    return row


def markup(rows: Sequence[Sequence[InlineKeyboardButton]]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[list(r) for r in rows if r])


def main_menu(is_admin: bool = False) -> InlineKeyboardMarkup:
    rows = [
        [btn("🎱 Забронировать стол", Nav(to="book"))],
        [btn("🍽 Меню кафе", Nav(to="menu"))],
        [btn("📅 Мои бронирования", Nav(to="my"))],
        [btn("📍 О клубе", Nav(to="about")), btn("✨ Как работает бот", Nav(to="how"))],
    ]
    if is_admin:
        rows.append([btn("🛠 Админ-панель", Ad(a="home"))])
    return markup(rows)


def tables_kb(club: Club, make: Callable[[int], CallbackData], back: CallbackData | None) -> InlineKeyboardMarkup:
    rows = [
        [btn(f"{t.name} · {t.kind} · {format_money(t.rate_kop_per_hour)}/ч", make(t.id))]
        for t in club.tables
    ]
    rows.append(nav_row(back))
    return markup(rows)


def dates_kb(
    dates: list[date],
    make: Callable[[date], CallbackData],
    calendar_cb: CallbackData,
    back: CallbackData | None,
) -> InlineKeyboardMarkup:
    rows = []
    if dates:
        rows.append([btn(f"Сегодня · {sch.fmt_date(dates[0])}", make(dates[0]))])
    if len(dates) > 1:
        rows.append([btn(f"Завтра · {sch.fmt_date(dates[1])}", make(dates[1]))])
    rows.append([btn("📅 Другая дата", calendar_cb)])
    rows.append(nav_row(back))
    return markup(rows)


def calendar_pages(dates: list[date]) -> list[tuple[int, int]]:
    pages: list[tuple[int, int]] = []
    for d in dates:
        if (d.year, d.month) not in pages:
            pages.append((d.year, d.month))
    return pages


def calendar_kb(
    dates: list[date],
    page: int,
    make: Callable[[date], CallbackData],
    page_cb: Callable[[int], CallbackData],
    back: CallbackData | None,
) -> tuple[str, InlineKeyboardMarkup]:
    """Календарь на месяц; доступны только даты из горизонта бронирования."""
    pages = calendar_pages(dates)
    page = max(0, min(page, len(pages) - 1))
    year, month = pages[page]
    allowed = set(dates)
    rows: list[list[InlineKeyboardButton]] = [[noop(w.capitalize()) for w in sch.WEEKDAYS]]
    for week in calendar.Calendar(firstweekday=0).monthdatescalendar(year, month):
        row = []
        for d in week:
            if d.month == month and d in allowed:
                row.append(btn(str(d.day), make(d)))
            elif d.month == month:
                row.append(noop("·"))
            else:
                row.append(noop())
        rows.append(row)
    pager = []
    if page > 0:
        _, pm = pages[page - 1]
        pager.append(btn(f"◀ {sch.MONTHS_FULL[pm - 1].capitalize()}", page_cb(page - 1)))
    if page < len(pages) - 1:
        _, nm = pages[page + 1]
        pager.append(btn(f"{sch.MONTHS_FULL[nm - 1].capitalize()} ▶", page_cb(page + 1)))
    if pager:
        rows.append(pager)
    rows.append(nav_row(back))
    title = f"{sch.MONTHS_FULL[month - 1].capitalize()} {year}"
    return title, markup(rows)


def durations_kb(
    durations: Sequence[int],
    price: Callable[[int], int] | None,
    make: Callable[[int], CallbackData],
    back: CallbackData | None,
) -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    for u in durations:
        label = sch.fmt_duration(u)
        if price is not None:
            label += f" · {format_money(price(u))}"
        b.add(btn(label, make(u)))
    b.adjust(2)
    b.row(*nav_row(back))
    return b.as_markup()


def times_kb(
    starts: Sequence[int],
    make: Callable[[int], CallbackData],
    back: CallbackData | None,
    extra: Sequence[Sequence[InlineKeyboardButton]] = (),
) -> InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    for m in starts:
        label = sch.fmt_hhmm(m)
        if m >= 24 * 60:
            label = f"🌙 {label}"
        b.add(btn(label, make(m)))
    b.adjust(4)
    for row in extra:
        b.row(*row)
    b.row(*nav_row(back))
    return b.as_markup()


def next_day(d: date, delta: int) -> date:
    return d + timedelta(days=delta)
