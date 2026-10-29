"""Фабрики callback_data. Telegram ограничивает callback_data 64 байтами,
поэтому имена полей короткие, а дата хранится как число ГГГГММДД.

Данные из callback считаются недоверенными: сервис заново проверяет стол, время,
владельца брони и права администратора при каждом нажатии.
"""

from __future__ import annotations

from datetime import date

from aiogram.filters.callback_data import CallbackData


class Nav(CallbackData, prefix="n"):
    to: str  # main | book | menu | my | about | how | noop


class Bk(CallbackData, prefix="b"):
    """Бронирование гостем. s — шаг: tables, date, cal, dur, time, sum, ok."""

    s: str
    t: int = 0   # стол
    d: int = 0   # бизнес-дата ГГГГММДД
    u: int = 0   # длительность, мин
    m: int = -1  # начало, минут от полуночи бизнес-даты
    p: int = 0   # страница календаря
    k: str = ""  # токен идемпотентности итоговой карточки


class My(CallbackData, prefix="m"):
    a: str       # list | card | ask | cx
    i: int = 0


class Mn(CallbackData, prefix="f"):
    a: str       # cats | item | credits
    c: str = ""
    i: int = 0


class Ad(CallbackData, prefix="a"):
    """Админ-панель. x — режим потока: v (просмотр стола), b (бронь по телефону), l (блокировка)."""

    a: str
    x: str = ""
    t: int = 0
    d: int = 0
    u: int = 0
    m: int = -1
    p: int = 0
    i: int = 0
    k: str = ""


def d2i(d: date) -> int:
    return d.year * 10000 + d.month * 100 + d.day


def i2d(value: int) -> date | None:
    try:
        return date(value // 10000, value // 100 % 100, value % 100)
    except ValueError:
        return None
