"""Каждый callback получает ответ: индикатор загрузки на кнопке не зависает,
даже если обработчик упал или кнопка устарела."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from aiogram import BaseMiddleware
from aiogram.exceptions import TelegramAPIError
from aiogram.types import CallbackQuery, TelegramObject

log = logging.getLogger(__name__)


@dataclass
class Reply:
    """Что показать во всплывающем ответе на нажатие (≤200 символов)."""

    text: str | None = None
    alert: bool = False

    def set(self, text: str, *, alert: bool = False) -> None:
        self.text = text[:200]
        self.alert = alert


class AnswerCallbackMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        if not isinstance(event, CallbackQuery):
            return await handler(event, data)
        reply = data["reply"] = Reply()
        try:
            return await handler(event, data)
        finally:
            try:
                await event.answer(text=reply.text, show_alert=reply.alert)
            except TelegramAPIError as exc:
                # «query is too old» и подобное — ответ уже не нужен.
                log.debug("callback answer skipped: %s", exc)
