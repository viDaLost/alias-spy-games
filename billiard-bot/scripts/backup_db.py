#!/usr/bin/env python3
"""Горячая резервная копия SQLite (безопасна при работающем боте).

    python scripts/backup_db.py                       # data/bot.db → backups/bot-ГГГГММДД-ЧЧММСС.db
    python scripts/backup_db.py --keep 14             # оставить 14 последних копий
    docker compose exec bot python scripts/backup_db.py
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("DATABASE_PATH", "data/bot.db"))
    ap.add_argument("--out", default="backups")
    ap.add_argument("--keep", type=int, default=30)
    args = ap.parse_args()

    db = Path(args.db) if Path(args.db).is_absolute() else ROOT / args.db
    out = Path(args.out) if Path(args.out).is_absolute() else ROOT / args.out
    if not db.is_file():
        print(f"База не найдена: {db}", file=sys.stderr)
        return 1
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"bot-{datetime.now():%Y%m%d-%H%M%S}.db"
    with sqlite3.connect(db) as src, sqlite3.connect(target) as dst:
        src.backup(dst)  # согласованная копия даже во время записи
    check = sqlite3.connect(target).execute("PRAGMA integrity_check").fetchone()[0]
    if check != "ok":
        print(f"Проверка копии не прошла: {check}", file=sys.stderr)
        return 1
    copies = sorted(out.glob("bot-*.db"))
    for old in copies[:-args.keep]:
        old.unlink()
    print(f"Копия сохранена: {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
