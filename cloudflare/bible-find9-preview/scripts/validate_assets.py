from pathlib import Path
from PIL import Image
import numpy as np
import hashlib,json,sys
root=Path(__file__).resolve().parents[1]
assets=root/'public/assets'
manifest=json.loads((root/'assets-manifest.json').read_text())
base=np.array(Image.open(assets/'00_base_scene.png').convert('RGB'))
assert base.shape==(1024,1536,3)
assert len(list(assets.glob('*.png')))==10
assert not list(assets.glob('*.svg'))
assert '.svg' not in (root/'public/index.html').read_text()
combined=np.zeros((1024,1536),dtype=bool)
for name,sha in manifest['sha256'].items():
 p=assets/name
 assert hashlib.sha256(p.read_bytes()).hexdigest()==sha,name+' hash mismatch'
 im=Image.open(p);assert im.size==(1536,1024)
 im.verify()
 if name.startswith('00'):continue
 im=Image.open(p);assert im.mode=='RGBA',name
 arr=np.array(im);a=arr[:,:,3];m=a>16
 assert a.min()==0 and a.max()==255 and 50<m.sum()<1536*1024*.12,name
 assert np.array_equal(arr[:,:,:3][m],base[m]),name+' pixel misalignment'
 assert not np.any(combined&m),'overlapping target silhouettes'
 combined|=m
 assert not a[0].any() and not a[-1].any() and not a[:,0].any() and not a[:,-1].any()
 print(name, 'opaque pixels:',int(m.sum()),'RGB matches base exactly')
for x,y in manifest['misses']:assert not combined[y,x],f'Background hit: {x},{y}'
for t in manifest['targets']:
 a=np.array(Image.open(assets/t['file']))[:,:,3];x,y=t['point'];assert a[y,x]>16,t['id']
print('PASS: PNG signatures, hashes, dimensions, alpha, alignment, holes and nine target points')
