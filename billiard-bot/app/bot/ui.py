"""Показ «карточки»: по возможности редактируем текущее сообщение, а не шлём новое."""

from __future__ import annotations

import logging
from pathlib import Path

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardMarkup,
    InputMediaPhoto,
    Message,
)

from .media import MediaStore

log = logging.getLogger(__name__)


def _not_modified(exc: TelegramBadRequest) -> bool:
    return "message is not modified" in str(exc).lower()


async def _safe_delete(message: Message) -> None:
    try:
        await message.delete()
    except TelegramBadRequest:
        # Сообщение старше 48 часов или уже удалено — не страшно.
        pass


async def show(
    target: CallbackQuery | Message,
    text: str,
    kb: InlineKeyboardMarkup | None = None,
    *,
    photo: Path | None = None,
    media: MediaStore | None = None,
) -> Message | None:
    """Показать экран. target — нажатая кнопка (редактируем) или сообщение (отвечаем)."""
    if isinstance(target, CallbackQuery):
        msg = target.message if isinstance(target.message, Message) else None
        bot = target.bot
        chat_id = target.message.chat.id if target.message else target.from_user.id
    else:
        msg = None
        bot = target.bot
        chat_id = target.chat.id
    assert bot is not None

    if photo is not None and media is not None:
        return await _show_photo(bot, chat_id, msg, text, kb, photo, media)
    return await show_text_fallback(bot, chat_id, msg, text, kb)


async def _show_photo(
    bot: Bot,
    chat_id: int,
    msg: Message | None,
    caption: str,
    kb: InlineKeyboardMarkup | None,
    photo: Path,
    media: MediaStore,
) -> Message | None:
    file, sha = await media.resolve(photo)
    if file is None or sha is None:
        # Локального файла нет: показываем карточку без фото (см. README о фото).
        return await show_text_fallback(bot, chat_id, msg, caption, kb)

    for attempt in (1, 2):
        try:
            if msg is not None and msg.photo:
                result = await msg.edit_media(InputMediaPhoto(media=file, caption=caption), reply_markup=kb)
                sent = result if isinstance(result, Message) else msg
            else:
                if msg is not None:
                    await _safe_delete(msg)
                    msg = None
                sent = await bot.send_photo(chat_id, file, caption=caption, reply_markup=kb)
        except TelegramBadRequest as exc:
            if _not_modified(exc):
                return msg
            if attempt == 1 and isinstance(file, str):
                # Кэшированный file_id не принят — загрузим локальный файл заново.
                log.info("cached file_id rejected for %s, re-uploading", photo.name)
                await media.forget(photo)
                file, sha = await media.resolve(photo)
                continue
            if attempt == 1 and msg is not None:
                await _safe_delete(msg)
                msg = None
                continue
            raise
        if sent.photo and not isinstance(file, str):
            await media.remember(photo, sha, sent.photo[-1].file_id)
        return sent
    return None


async def show_text_fallback(
    bot: Bot, chat_id: int, msg: Message | None, text: str, kb: InlineKeyboardMarkup | None
) -> Message:
    if msg is not None and not msg.photo:
        try:
            result = await msg.edit_text(text, reply_markup=kb)
            return result if isinstance(result, Message) else msg
        except TelegramBadRequest as exc:
            if _not_modified(exc):
                return msg
    if msg is not None:
        await _safe_delete(msg)
    return await bot.send_message(chat_id, text, reply_markup=kb)
