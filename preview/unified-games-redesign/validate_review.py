from pathlib import Path
import re
from PIL import Image

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
ASSETS = PUBLIC / 'web' / 'review' / 'assets'
REPO = ROOT.parent.parent
EXPECTED = {
    'menu': 6, 'alias': 10, 'spy': 12, 'bible-words': 7,
    'path': 3, 'scenes': 8,
}
for folder, count in EXPECTED.items():
    files = sorted((ASSETS / folder).glob('*.webp'))
    assert len(files) == count, (folder, len(files), count)
    for file in files:
        assert file.stat().st_size > 20_000, (file, file.stat().st_size)
        with Image.open(file) as image:
            assert image.format == 'WEBP', (file, image.format)
            if folder == 'menu':
                minimum = (300, 300) if file.name.startswith('moon-') else (700, 1200)
                assert image.width >= minimum[0] and image.height >= minimum[1], (file, image.size, minimum)
            else:
                assert image.width >= 900 and image.height >= 1500, (file, image.size)

index = (PUBLIC / 'index.html').read_text(encoding='utf-8')
script = (PUBLIC / 'web' / 'review' / 'unified.js').read_text(encoding='utf-8')
styles = (PUBLIC / 'web' / 'review' / 'unified.css').read_text(encoding='utf-8')
worker = (ROOT / 'worker.js').read_text(encoding='utf-8')
bridge = (PUBLIC / 'web' / 'review' / 'bmt-event-bridge.js').read_text(encoding='utf-8')
sacred_word = (PUBLIC / 'web' / 'games' / 'sacred-word.js').read_text(encoding='utf-8')
three_gate = (PUBLIC / 'web' / 'js' / 'three-gate.js').read_text(encoding='utf-8')
assert 'unified-games-redesign-review-v1' in index + script + worker
assert '58cfe7515fd1d50163eda13d10a14958a9475357' in script + worker
assert "gameCount: 12" in worker
assert len(re.findall(r"motion: 'parallax'", script)) == 9  # menu + 8 games
assert len(re.findall(r"motion: 'static'", script)) == 4
assert 'requestAnimationFrame(render)' in script
assert 'interactiveSelector' in script and 'freeze()' in script
assert 'bmt:path-light' in bridge + script
assert 'createFallbackLamp' in sacred_word and 'WebGL недоступен' in sacred_word
assert '__sacredWordReviewFallbackV1' in sacred_word + three_gate and "sacred-word.js?v=22" in three_gate
assert "url.pathname === '/web/games/sacred-word.js'" in worker
assert "url.pathname === '/web/js/three-gate.js'" in worker
assert 'setInterval' not in script + bridge + worker
assert not re.search(r'animation\s*:[^;}]*(?:infinite)', styles, re.I)
assert 'web/js/app.js?v=25' in index
assert 'web/js/three-gate.js?v=3' in index
for name in ('unified.css', 'unified.js', 'bmt-event-bridge.js'):
    assert (REPO / 'web' / 'review' / name).read_bytes() == (PUBLIC / 'web' / 'review' / name).read_bytes(), name
for name in ('games/sacred-word.js', 'js/three-gate.js'):
    assert (REPO / 'web' / name).read_bytes() == (PUBLIC / 'web' / name).read_bytes(), name
print('Validated unified review: 12 production games, 46 WebP assets, 8 game parallax scenes, 4 static redesigns')
