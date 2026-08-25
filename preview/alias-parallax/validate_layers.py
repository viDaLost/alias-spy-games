from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
LAYERS = PUBLIC / "layers"
EXPECTED_SIZE = (936, 1664)
MAX_FILE_BYTES = 800_000
MAX_TOTAL_BYTES = 4_000_000

EXPECTED_LAYERS = [
    "01-sky-sunset.webp",
    "02-mountains.webp",
    "03-city-far.webp",
    "04-market-mid.webp",
    "05-left-foreground.webp",
    "06-right-foreground.webp",
    "07-hourglass.webp",
    "08-props.webp",
    "09-dust-haze.webp",
    "10-lantern-glow.webp",
    "11-correct-sparks.webp",
    "12-skip-dust.webp",
    "13-round-finish.webp",
]


def validate_layers() -> None:
    actual = sorted(path.name for path in LAYERS.glob("*.webp"))
    assert actual == EXPECTED_LAYERS, f"Layer list mismatch: {actual}"

    total = 0
    for index, name in enumerate(EXPECTED_LAYERS):
        path = LAYERS / name
        size = path.stat().st_size
        total += size
        assert 0 < size <= MAX_FILE_BYTES, f"Unexpected size for {name}: {size}"
        with Image.open(path) as image:
            assert image.format == "WEBP", f"{name} is not WebP"
            assert image.size == EXPECTED_SIZE, f"Unexpected dimensions for {name}: {image.size}"
            if index == 0:
                assert image.mode in {"RGB", "RGBA"}, f"Unexpected sky mode: {image.mode}"
            else:
                assert "A" in image.getbands(), f"{name} has no alpha channel"
                low, high = image.getchannel("A").getextrema()
                assert low == 0 and high > 0, f"Invalid alpha range for {name}: {(low, high)}"
    assert total <= MAX_TOTAL_BYTES, f"Layer bundle is too large: {total}"
    print(f"Validated {len(EXPECTED_LAYERS)} layers: {total / 1_000_000:.2f} MB")


def validate_references() -> None:
    html = (PUBLIC / "index.html").read_text(encoding="utf-8")
    references = set(re.findall(r"/layers/([\w.-]+\.webp)", html))
    assert references == set(EXPECTED_LAYERS), f"HTML layer references mismatch: {sorted(references)}"
    for reference in references:
        assert (LAYERS / reference).is_file(), f"Missing referenced asset: {reference}"


def validate_dictionaries() -> None:
    for difficulty in ("easy", "medium", "hard"):
        path = PUBLIC / "data" / f"{difficulty}.json"
        words = json.loads(path.read_text(encoding="utf-8"))
        assert isinstance(words, list) and len(words) >= 100, f"Dictionary too small: {difficulty}"
        cleaned = [str(word).strip() for word in words]
        assert all(cleaned), f"Blank word in {difficulty}"
        unique_count = len({word.casefold() for word in cleaned})
        assert unique_count >= 100, f"Not enough unique words in {difficulty}: {unique_count}"
        print(f"Validated {difficulty} dictionary: {len(cleaned)} words ({unique_count} unique)")


if __name__ == "__main__":
    validate_layers()
    validate_references()
    validate_dictionaries()
