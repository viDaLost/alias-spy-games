"""Фотографии меню: локальные файлы + кэш Telegram file_id в БД.

Первый показ загружает файл из assets/menu, ответ Telegram даёт file_id, который
сохраняется вместе с SHA-256 файла. Если файл заменили или file_id перестал работать,
фото загружается заново из локальной копии — фотосток для этого не нужен.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from aiogram.types import FSInputFile, InputFile

from ..core.db import Database, ts
from ..settings import PROJECT_ROOT

log = logging.getLogger(__name__)

CREDITS_PATH = PROJECT_ROOT / "assets" / "menu" / "credits.json"


@dataclass(frozen=True)
class PhotoCredit:
    file: str
    subject: str
    author: str
    license: str
    license_url: str
    source_page: str
    attribution: str

    @property
    def short(self) -> str:
        return f"{self.author} / {self.license}"


def load_credits(path: Path = CREDITS_PATH) -> dict[str, PhotoCredit]:
    """Ключ — имя файла в assets/menu. Нет файла credits.json — нет и фото."""
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    result = {}
    for entry in data.get("images", []):
        credit = PhotoCredit(
            file=entry["file"],
            subject=entry.get("subject", ""),
            author=entry["author"],
            license=entry["license"],
            license_url=entry.get("license_url", ""),
            source_page=entry["source_page"],
            attribution=entry.get("attribution", ""),
        )
        result[credit.file] = credit
    return result


class MediaStore:
    def __init__(self, db: Database) -> None:
        self.db = db
        self._hashes: dict[str, tuple[float, str]] = {}

    def _sha(self, path: Path) -> str | None:
        try:
            mtime = path.stat().st_mtime
        except FileNotFoundError:
            return None
        key = str(path)
        cached = self._hashes.get(key)
        if cached and cached[0] == mtime:
            return cached[1]
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        self._hashes[key] = (mtime, digest)
        return digest

    @staticmethod
    def rel(path: Path) -> str:
        try:
            return path.resolve().relative_to(PROJECT_ROOT).as_posix()
        except ValueError:
            return str(path)

    async def resolve(self, path: Path) -> tuple[str | InputFile | None, str | None]:
        """(file_id или файл для загрузки, sha256). (None, None) — файла нет."""
        sha = self._sha(path)
        if sha is None:
            return None, None
        async with self.db.connect() as conn:
            row = await (await conn.execute(
                "SELECT file_id, sha256 FROM media_cache WHERE path = ?", (self.rel(path),)
            )).fetchone()
        if row and row["sha256"] == sha:
            return row["file_id"], sha
        return FSInputFile(path), sha

    async def remember(self, path: Path, sha: str, file_id: str) -> None:
        async with self.db.transaction() as conn:
            await conn.execute(
                "INSERT INTO media_cache (path, sha256, file_id, updated_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT (path) DO UPDATE SET sha256 = excluded.sha256, file_id = excluded.file_id, "
                "updated_at = excluded.updated_at",
                (self.rel(path), sha, file_id, ts(datetime.now(UTC))),
            )

    async def forget(self, path: Path) -> None:
        async with self.db.transaction() as conn:
            await conn.execute("DELETE FROM media_cache WHERE path = ?", (self.rel(path),))


def missing_photos(paths: list[Path]) -> list[Path]:
    return [p for p in paths if not p.is_file()]
