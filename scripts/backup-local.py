"""Back up the personal SQLite database without stopping Siftly."""

import json
import os
from pathlib import Path
import sqlite3
import sys
from datetime import datetime, timezone


def main():
    os.umask(0o077)
    root = Path(__file__).resolve().parents[1]
    source = root / "prisma/dev.db"
    directory = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else root / ".local/backups"
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    target = directory / f"siftly-{stamp}.db"
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as live:
        with sqlite3.connect(target) as backup:
            live.backup(backup)
            if backup.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                raise RuntimeError(f"Backup integrity check failed: {target}")
            if backup.execute("PRAGMA foreign_key_check").fetchall():
                raise RuntimeError(f"Backup foreign key check failed: {target}")
            count = backup.execute("SELECT count(*) FROM Bookmark").fetchone()[0]
    print(json.dumps({"backup": str(target.resolve()), "bookmarks": count, "integrity": "ok"}))


if __name__ == "__main__":
    main()
