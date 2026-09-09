from pathlib import Path
import urllib.request,hashlib,json,os,time
root=Path(__file__).resolve().parents[1];manifest=json.loads((root/'assets-manifest.json').read_text())
url=os.environ.get('PREVIEW_URL','https://alias-spy-games-bible-find9-preview.vitaledanilov.workers.dev/').rstrip('/')+'/'
def get(p):
 for attempt in range(5):
  try:
   with urllib.request.urlopen(url+p+'?build='+os.environ.get('GITHUB_SHA','art-2'),timeout=30) as r:return r.read()
  except Exception:
   if attempt==4:raise
   time.sleep(2)
health=json.loads(get('health'));assert health['version']==manifest['version'],health
html=get('').decode();assert 'assets/00_base_scene.png' in html and '.svg' not in html
for name,sha in manifest['sha256'].items():
 data=get('assets/'+name);assert hashlib.sha256(data).hexdigest()==sha,'Live asset differs: '+name
 print('Live SHA256 verified:',name)
print('PASS: live preview serves exact art-2 scene and all nine aligned layers')
