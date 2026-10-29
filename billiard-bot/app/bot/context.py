"""Зависимости обработчиков: передаются в Dispatcher как workflow_data["ctx"]."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from ..club import Club
from ..core.booking import BookingService
from ..core.outbox import Outbox
from ..settings import Settings
from .media import MediaStore, PhotoCredit


@dataclass
class AppContext:
    settings: Settings
    club: Club
    service: BookingService
    outbox: Outbox
    media: MediaStore
    credits: dict[str, PhotoCredit]
    outbox_wakeup: asyncio.Event = field(default_factory=asyncio.Event)

    def kick_outbox(self) -> None:
        self.outbox_wakeup.set()

    def is_admin(self, user_id: int | None) -> bool:
        return self.settings.is_admin(user_id)
