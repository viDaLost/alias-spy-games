from pathlib import Path
import re
ROOT = Path(__file__).resolve().parent
html = (ROOT / 'public' / 'index.html').read_text(encoding='utf-8')
scene = (ROOT / 'public' / 'scene-v2.css').read_text(encoding='utf-8')
app = (ROOT / 'public' / 'app.js').read_text(encoding='utf-8')
bridge = (ROOT / 'public' / 'preview-bridge.js').read_text(encoding='utf-8')
worker = (ROOT / 'worker.js').read_text(encoding='utf-8')
assert len(re.findall(r'data-layer="[^"]+"', html)) == 10
assert len(re.findall(r'data-event="[^"]+"', html)) == 10
for marker in ['board-background-v35.webp','icons-v17/sling.webp','icons-v17/staff.webp','icons-v17/jericho.webp','icons-v17/covenant.webp','.path-layer--campaign']:
    assert marker in scene, marker
assert 'setInterval' not in app + bridge + worker
assert 'freezeParallax' in app and 'pointerdown' in app
assert 'bmt:path-light' in bridge
assert 'path-of-light-v2-production-art-css-scene' in html + worker
print('Validated Path of Light V2: 10 depth layers + 10 result-driven reactions')
