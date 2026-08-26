from pathlib import Path
import re
from PIL import Image

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
ASSETS = PUBLIC / 'web' / 'review' / 'assets'
REPO = ROOT.parent.parent
EXPECTED = {
    'menu': 7, 'alias': 12, 'spy': 17, 'bible-words': 7,
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
                if file.name == 'icons-v19.webp':
                    minimum = (576, 576)
                elif file.name.startswith('moon-'):
                    minimum = (300, 300)
                else:
                    minimum = (700, 1200)
                assert image.width >= minimum[0] and image.height >= minimum[1], (file, image.size, minimum)
            else:
                assert image.width >= 900 and image.height >= 1500, (file, image.size)

index = (PUBLIC / 'index.html').read_text(encoding='utf-8')
script = (PUBLIC / 'web' / 'review' / 'unified.js').read_text(encoding='utf-8')
styles = (PUBLIC / 'web' / 'review' / 'unified.css').read_text(encoding='utf-8')
canonical_script = (PUBLIC / 'web' / 'review' / 'canonical.js').read_text(encoding='utf-8')
canonical_styles = (PUBLIC / 'web' / 'review' / 'canonical.css').read_text(encoding='utf-8')
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
for marker in (
    'home-menu-v22@195f150b', 'alias-parallax@7e36d9a', 'spy-parallax@ddd4d3a',
    'temple-of-writing-v3@dd1743c', 'path-of-light@ae6f795', 'quartet-card-redesign',
):
    assert marker in script + worker, marker
assert "layer(`${ASSET}/alias/07-hourglass.webp`, 53, 30, { className: 'ur-alias-hourglass' })" in script
assert "layer(`${ASSET}/spy/08-spy.webp`, 55, 32" in script
assert len(re.findall(r"\{ key: '[^']+', title:", script)) == 12
assert 'id="ur-profile-view"' in script and 'data-ur-nav="profile"' in script
assert '.ur-menu-moon' in styles and 'width:clamp(112px,30vw,174px)' in styles
assert 'body[data-current-game="alias"] .btn-good::before' in styles
assert '#menu-container{display:none!important}' in styles
assert 'canonical-preview-adapters-v1' in canonical_script + worker
assert 'preview-shells-only-production-main-mechanics-only' in worker
assert 'production-main@${SOURCE_COMMIT}' in canonical_script
assert 'window.showGame' in canonical_script and 'window.openBiblicalMatchThree' in canonical_script
assert 'icons-v19.webp?v=23' in canonical_styles
assert '#game-container > header.ur-game-chrome.cv-game-topbar' in canonical_styles
assert 'body[data-current-game="alias"]' in canonical_styles
assert 'body[data-current-game="spy"]' in canonical_styles
assert 'new MutationObserver(scheduleSync)' in canonical_script
assert 'cv-alias-finish' in canonical_script + canonical_styles
assert 'cv-spy-patrol' in canonical_script + canonical_styles
assert '16-light-particles.webp' in script
assert 'bmt:path-light' in bridge + script
assert 'createFallbackLamp' in sacred_word and 'WebGL недоступен' in sacred_word
assert '__sacredWordReviewFallbackV1' in sacred_word + three_gate and "sacred-word.js?v=22" in three_gate
assert "url.pathname === '/web/games/sacred-word.js'" in worker
assert "url.pathname === '/web/js/three-gate.js'" in worker
assert 'setInterval' not in script + canonical_script + bridge + worker
assert not re.search(r'animation\s*:[^;}]*(?:infinite)', styles + canonical_styles, re.I)
assert 'web/js/app.js?v=25' in index
assert 'web/js/three-gate.js?v=3' in index
assert 'web/review/unified.css?v=3' in index and 'web/review/unified.js?v=3' in index
assert 'web/review/canonical.css?v=1' in index and 'web/review/canonical.js?v=1' in index
for name in ('unified.css', 'unified.js', 'canonical.css', 'canonical.js', 'bmt-event-bridge.js'):
    assert (REPO / 'web' / 'review' / name).read_bytes() == (PUBLIC / 'web' / 'review' / name).read_bytes(), name
for name in ('games/sacred-word.js', 'js/three-gate.js'):
    assert (REPO / 'web' / name).read_bytes() == (PUBLIC / 'web' / name).read_bytes(), name
print('Validated unified review: 12 production games, 54 WebP assets, canonical preview shells and finite event layers, production mechanics pinned')
