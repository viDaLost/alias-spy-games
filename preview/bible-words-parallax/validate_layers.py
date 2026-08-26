from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
LAYERS = PUBLIC / "layers"
EXPECTED = [
    "01-temple-base.webp",
    "02-distant-sanctuary.webp",
    "03-left-arch.webp",
    "04-right-arch.webp",
    "05-scriptorium-ledge.webp",
    "06-moonbeams.webp",
    "07-dust-motes.webp",
    "event-correct-inscription.webp",
    "event-error-shards.webp",
    "event-level-complete.webp",
]


def normalized(value: str) -> str:
    return "".join(char for char in str(value).upper().replace("Ё", "Е") if "А" <= char <= "Я")


files = sorted(path.name for path in LAYERS.glob("*.webp"))
assert files == sorted(EXPECTED), files

total_size = 0
for index, name in enumerate(EXPECTED):
    path = LAYERS / name
    total_size += path.stat().st_size
    with Image.open(path) as image:
        assert image.size == (936, 1664), (name, image.size)
        has_alpha = "A" in image.getbands()
        if index == 0:
            assert not has_alpha, (name, image.getbands())
        else:
            assert has_alpha, (name, image.getbands())
            lo, hi = image.getchannel("A").getextrema()
            assert lo == 0 and hi > 0, (name, lo, hi)

assert total_size < 4_000_000, total_size

data = json.loads((PUBLIC / "data" / "bible_wow_levels.json").read_text(encoding="utf-8"))
assert data["version"] == 4
assert data["language"] == "ru"
assert len(data["levels"]) == 100

ids = set()
for level in data["levels"]:
    level_id = int(level["id"])
    assert level_id not in ids
    ids.add(level_id)
    letters = Counter(normalized(level["letters"]))
    targets = [normalized(word) for word in level.get("words", [])]
    bonuses = [normalized(word) for word in level.get("bonus", [])]
    assert targets and all(len(word) >= 2 for word in targets)
    for word in targets + bonuses:
        assert not (Counter(word) - letters), (level_id, word, level["letters"])

print(f"Validated {len(EXPECTED)} WebP layers ({total_size} bytes) and {len(ids)} playable levels")
