from pathlib import Path
import re
import sys

from PIL import Image


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
LAYERS = PUBLIC / 'layers'
EXPECTED_SIZE = (936, 1664)
EXPECTED = [
    '01-sky-moon-stars.webp',
    '02-mountains.webp',
    '03-temple-far.webp',
    '04-city-mid.webp',
    '05-rooftops.webp',
    '06-fog.webp',
    '07-left-foreground.webp',
    '08-spy.webp',
    '09-leaves.webp',
    '10-right-foreground.webp',
    '11-props.webp',
    '12-plants-right.webp',
    '13-birds.webp',
    '14-torch-flame.webp',
    '15-lantern-glow.webp',
    '16-light-particles.webp',
    '17-patrol.webp',
]


def fail(message: str) -> None:
    print(f'layer-validation-error: {message}', file=sys.stderr)
    raise SystemExit(1)


actual = sorted(path.name for path in LAYERS.glob('*.webp'))
if actual != EXPECTED:
    fail(f'expected exact asset set {EXPECTED}, got {actual}')

total_bytes = 0
for index, name in enumerate(EXPECTED):
    path = LAYERS / name
    size = path.stat().st_size
    total_bytes += size

    if size <= 0 or size > 800_000:
        fail(f'{name} has invalid file size: {size} bytes')

    with path.open('rb') as stream:
        signature = stream.read(12)
    if signature[:4] != b'RIFF' or signature[8:12] != b'WEBP':
        fail(f'{name} is not a valid WebP container')

    with Image.open(path) as image:
        image.load()
        if image.size != EXPECTED_SIZE:
            fail(f'{name} has {image.size}, expected {EXPECTED_SIZE}')

        if index == 0:
            if image.mode not in {'RGB', 'RGBA'}:
                fail(f'{name} has unsupported mode {image.mode}')
            continue

        if 'A' not in image.getbands():
            fail(f'{name} has no alpha channel')

        alpha_min, alpha_max = image.getchannel('A').getextrema()
        if alpha_min != 0 or alpha_max == 0:
            fail(f'{name} must contain transparent and visible pixels, got {(alpha_min, alpha_max)}')

if total_bytes > 6_000_000:
    fail(f'asset bundle is too large: {total_bytes} bytes')

html = (PUBLIC / 'index.html').read_text(encoding='utf-8')
referenced = set(re.findall(r'(?:src|data-src)="/layers/([^"]+\.webp)"', html))
missing = sorted(name for name in referenced if not (LAYERS / name).is_file())
if missing:
    fail(f'HTML references missing assets: {missing}')

print(f'validated {len(EXPECTED)} WebP assets, total={total_bytes} bytes')
