from pathlib import Path
import subprocess,hashlib,json,os
root=Path(__file__).resolve().parents[1];manifest=json.loads((root/'assets-manifest.json').read_text())
url=os.environ.get('PREVIEW_URL','https://alias-spy-games-bible-find9-overlook-preview.vitaledanilov.workers.dev/').rstrip('/')+'/'
def get(p):
 # Use the same HTTP client as the previously verified deployment workflow.
 return subprocess.check_output(['curl','-fsSL','--retry','10','--retry-all-errors','--retry-delay','3','--retry-max-time','90',
     '--max-time','30',url+p+'?build='+os.environ.get('GITHUB_SHA','overlook-1')])
health=json.loads(get('health'));assert health['version']==manifest['version'],health
html=get('').decode();assert 'assets/00_base_scene.png' in html and '.svg' not in html
for name,sha in manifest['sha256'].items():
 data=get('assets/'+name);assert hashlib.sha256(data).hexdigest()==sha,'Live asset differs: '+name
 print('Live SHA256 verified:',name)
print('PASS: live preview serves exact overlook-1 scene and all nine aligned layers')
