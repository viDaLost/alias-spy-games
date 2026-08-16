from pathlib import Path
import re

p = Path('scripts/check-biblical-match-three-visual.mjs')
text = p.read_text()
pattern = re.compile(r"  const lamp=page\.locator\('\.bmt-tile\.has-lamp'\)\.first\(\);.*?throw new Error\(`lit lamp \$\{JSON\.stringify\(litLamp\)\}`\);\n", re.S)
replacement = '''  const lamp=page.locator('.bmt-tile.has-lamp').first();const lampIndex=await lamp.getAttribute('data-index');if(lampIndex==null)throw new Error('hard mode has no lamp target');await page.locator('[data-booster="sling"]').click();await page.waitForFunction(()=>document.querySelector('[data-booster="sling"]')?.classList.contains('is-active'),{timeout:3000});await page.evaluate(index=>document.querySelector(`.bmt-tile[data-index="${index}"]`)?.click(),lampIndex);try{await page.waitForFunction(index=>document.querySelector(`.bmt-tile[data-index="${index}"]`)?.classList.contains('is-lamp-lit'),lampIndex,{timeout:7000})}catch(error){const diagnostic=await page.evaluate(index=>{const tile=document.querySelector(`.bmt-tile[data-index="${index}"]`),booster=document.querySelector('[data-booster="sling"]'),shell=document.querySelector('.bmt-shell');return{tileClass:tile?.className||'',boosterClass:booster?.className||'',shellClass:shell?.className||'',wallet:document.querySelector('[data-bmt-wallet]')?.textContent||'',result:document.querySelector('.bmt-result-card h3')?.textContent||''}},lampIndex);throw new Error(`lamp did not light ${JSON.stringify(diagnostic)}; ${error.message}`)}await page.waitForTimeout(420);const litLamp=await page.evaluate(index=>{const tile=document.querySelector(`.bmt-tile[data-index="${index}"]`),wrapper=tile?.querySelector('.bmt-blocker__lamp'),piece=tile?.querySelector('.bmt-piece-wrap'),state=tile?.querySelector('.bmt-blocker__lamp-state'),sr=state?.getBoundingClientRect();return{art:tile?.querySelectorAll('.bmt-blocker-art').length||0,animation:wrapper?getComputedStyle(wrapper).animationName:'',pieceOpacity:piece?+getComputedStyle(piece).opacity:0,stateW:sr?.width||0,stateH:sr?.height||0}},lampIndex);if(litLamp.art!==0||litLamp.animation!=='none'||litLamp.pieceOpacity<.99||litLamp.stateW<15||litLamp.stateH<15)throw new Error(`lit lamp ${JSON.stringify(litLamp)}`);
'''
new_text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'expected one lamp QA block, replaced {count}')
p.write_text(new_text)
