"""Данные клуба и меню из config/club.json. Цены переводятся в целые копейки."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import time
from pathlib import Path

from .settings import PROJECT_ROOT


@dataclass(frozen=True)
class Table:
    id: int
    name: str
    kind: str
    rate_kop_per_hour: int

    @property
    def title(self) -> str:
        return f"{self.name} · {self.kind}"


@dataclass(frozen=True)
class Schedule:
    open: time
    close: time
    slot_step_minutes: int
    booking_horizon_days: int
    durations_minutes: tuple[int, ...]

    @property
    def crosses_midnight(self) -> bool:
        return self.close <= self.open


@dataclass(frozen=True)
class MenuItem:
    id: str
    name: str
    description: str
    portion: str
    price_kop: int
    photo: str  # путь относительно корня проекта

    @property
    def photo_path(self) -> Path:
        return PROJECT_ROOT / self.photo


@dataclass(frozen=True)
class MenuCategory:
    id: str
    title: str
    items: tuple[MenuItem, ...]


@dataclass(frozen=True)
class Club:
    name: str
    tagline: str
    address: str
    phone: str
    links: tuple[str, ...]
    schedule: Schedule
    tables: tuple[Table, ...]
    menu: tuple[MenuCategory, ...]

    def table(self, table_id: int) -> Table | None:
        return next((t for t in self.tables if t.id == table_id), None)

    def category(self, cat_id: str) -> MenuCategory | None:
        return next((c for c in self.menu if c.id == cat_id), None)

    def all_items(self) -> list[MenuItem]:
        return [item for cat in self.menu for item in cat.items]


def rub_to_kop(value: int | float | str) -> int:
    """Рубли из конфигурации → копейки без двоичных ошибок округления."""
    from decimal import ROUND_HALF_UP, Decimal

    return int((Decimal(str(value)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def format_money(kop: int) -> str:
    rub, k = divmod(kop, 100)
    rub_str = f"{rub:,}".replace(",", " ")
    return f"{rub_str} ₽" if k == 0 else f"{rub_str},{k:02d} ₽"


def _parse_hhmm(value: str) -> time:
    hh, mm = value.split(":")
    return time(int(hh), int(mm))


def load_club(path: Path) -> Club:
    data = json.loads(path.read_text(encoding="utf-8"))
    sch = data["schedule"]
    schedule = Schedule(
        open=_parse_hhmm(sch["open"]),
        close=_parse_hhmm(sch["close"]),
        slot_step_minutes=int(sch.get("slot_step_minutes", 30)),
        booking_horizon_days=int(sch.get("booking_horizon_days", 30)),
        durations_minutes=tuple(int(x) for x in sch.get("durations_minutes", [60, 90, 120, 180])),
    )
    tables = tuple(
        Table(
            id=int(t["id"]),
            name=t["name"],
            kind=t["kind"],
            rate_kop_per_hour=rub_to_kop(t["rate_rub_per_hour"]),
        )
        for t in data["tables"]
    )
    menu = tuple(
        MenuCategory(
            id=c["id"],
            title=c["title"],
            items=tuple(
                MenuItem(
                    id=i["id"],
                    name=i["name"],
                    description=i["description"],
                    portion=i["portion"],
                    price_kop=rub_to_kop(i["price_rub"]),
                    photo=i["photo"],
                )
                for i in c["items"]
            ),
        )
        for c in data["menu"]
    )
    return Club(
        name=data["name"],
        tagline=data.get("tagline", ""),
        address=data.get("address", "").strip(),
        phone=data.get("phone", "").strip(),
        links=tuple(data.get("links", [])),
        schedule=schedule,
        tables=tables,
        menu=menu,
    )
