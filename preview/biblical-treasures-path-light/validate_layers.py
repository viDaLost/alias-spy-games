from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent
atlas = ROOT / 'public' / 'path-layers.webp'
assert atlas.stat().st_size > 200_000, atlas.stat().st_size
with Image.open(atlas) as image:
    assert image.format == 'WEBP', image.format
    assert image.size == (216, 3840), image.size
    assert image.mode == 'RGBA', image.mode
print('Validated Path of Light atlas: 10 frames')
