"""Настройки приложения: только из переменных окружения (и необязательного файла .env)."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

PROJECT_ROOT = Path(__file__).resolve().parent.parent

_TOKEN_RE = re.compile(r"^\d{5,}:[A-Za-z0-9_-]{30,}$")


class SettingsError(Exception):
    """Понятная ошибка конфигурации: текст безопасно показывать пользователю."""


def load_dotenv(path: Path) -> None:
    """Минимальный загрузчик .env: не перезаписывает уже заданные переменные."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _parse_ids(raw: str, name: str) -> frozenset[int]:
    ids: set[int] = set()
    for part in raw.replace(";", ",").split(","):
        part = part.strip()
        if not part:
            continue
        if not re.fullmatch(r"-?\d+", part):
            raise SettingsError(f"{name}: «{part}» не похоже на числовой Telegram ID.")
        ids.add(int(part))
    return frozenset(ids)


def _parse_bool(raw: str | None, default: bool) -> bool:
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on", "да"}


@dataclass(frozen=True)
class Settings:
    bot_token: str = ""
    admin_ids: frozenset[int] = field(default_factory=frozenset)
    admin_chat_id: int | None = None
    timezone: str = "Europe/Moscow"
    demo_mode: bool = True
    database_path: Path = PROJECT_ROOT / "data" / "bot.db"
    club_config_path: Path = PROJECT_ROOT / "config" / "club.json"
    log_level: str = "INFO"

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)

    def is_admin(self, user_id: int | None) -> bool:
        return user_id is not None and user_id in self.admin_ids

    def notification_chats(self) -> list[int]:
        """Куда слать служебные уведомления: ADMIN_CHAT_ID или личные чаты админов."""
        if self.admin_chat_id is not None:
            return [self.admin_chat_id]
        return sorted(self.admin_ids)

    def token_is_plausible(self) -> bool:
        return bool(_TOKEN_RE.match(self.bot_token))


def _resolve_path(raw: str | None, default: Path) -> Path:
    if not raw:
        return default
    p = Path(raw)
    return p if p.is_absolute() else PROJECT_ROOT / p


def load_settings(env: dict[str, str] | None = None, *, use_dotenv: bool = True) -> Settings:
    if env is None:
        if use_dotenv:
            load_dotenv(PROJECT_ROOT / ".env")
        env = dict(os.environ)

    timezone = (env.get("TIMEZONE") or "Europe/Moscow").strip()
    try:
        ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise SettingsError(f"TIMEZONE: неизвестный часовой пояс «{timezone}».") from exc

    admin_chat_raw = (env.get("ADMIN_CHAT_ID") or "").strip()
    admin_chat_id: int | None = None
    if admin_chat_raw:
        if not re.fullmatch(r"-?\d+", admin_chat_raw):
            raise SettingsError("ADMIN_CHAT_ID должен быть числом (ID чата).")
        admin_chat_id = int(admin_chat_raw)

    return Settings(
        bot_token=(env.get("BOT_TOKEN") or "").strip(),
        admin_ids=_parse_ids(env.get("ADMIN_IDS") or "", "ADMIN_IDS"),
        admin_chat_id=admin_chat_id,
        timezone=timezone,
        demo_mode=_parse_bool(env.get("DEMO_MODE"), True),
        database_path=_resolve_path(env.get("DATABASE_PATH"), PROJECT_ROOT / "data" / "bot.db"),
        club_config_path=_resolve_path(env.get("CLUB_CONFIG"), PROJECT_ROOT / "config" / "club.json"),
        log_level=(env.get("LOG_LEVEL") or "INFO").strip().upper(),
    )
