from pathlib import Path
import subprocess,hashlib,json,os,time
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'assets-manifest.json').read_text())
url=os.environ.get('PREVIEW_URL','https://alias-spy-games-bible-find9-overlook-preview.vitaledanilov.workers.dev/').rstrip('/')+'/'
def get(p):
 return subprocess.check_output(['curl','-fsSL','--retry','4','--retry-all-errors','--retry-delay','2',
     '--max-time','30',url+p+'?build='+os.environ.get('GITHUB_SHA',manifest['version'])+'&check='+str(time.time_ns())])
def verified(p,predicate):
 # Worker code and asset deployments may take a few seconds to reach every edge.
 for attempt in range(30):
  data=get(p)
  if predicate(data):return data
  if attempt==29:raise AssertionError('Live content still differs after propagation wait: '+p)
  print('Waiting for published version:',p,flush=True)
  time.sleep(2)
health=verified('health',lambda b:json.loads(b).get('version')==manifest['version'])
html=verified('',lambda b:b.decode()==(root/'public/index.html').read_text()).decode()
assert 'assets/00_base_scene.png' in html and '.svg' not in html
for name,sha in manifest['sha256'].items():
 verified('assets/'+name,lambda data:hashlib.sha256(data).hexdigest()==sha)
 print('Live SHA256 verified:',name,flush=True)
print('PASS: live preview serves exact',manifest['version'],'scene and all nine aligned layers')
