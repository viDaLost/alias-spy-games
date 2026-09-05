/* Проверки веб-части приложения в Chromium.
   Запуск: node psalms-app/tools/check_ui.mjs (нужен локальный сервер на 8099). */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const ctx = await browser.newContext({ viewport:{width:412,height:892}, deviceScaleFactor:1, hasTouch:true, isMobile:true });
const page = await ctx.newPage();
const errors=[];
page.on('console', m => { if(m.type()==='error') errors.push('console: '+m.text()); });
page.on('pageerror', e => errors.push('pageerror: '+e.message));
const ok=[]; const fail=[];
const t=(name,cond,extra='')=>{ (cond?ok:fail).push(name+(extra?` (${extra})`:'')); };

await page.goto('http://localhost:8099/index.html', { waitUntil:'networkidle' });
await page.waitForTimeout(1500);

// поиск по номеру
await page.evaluate(()=>location.hash='#/search'); await page.waitForTimeout(400);
await page.fill('.searchbar__field input','500'); await page.waitForTimeout(800);
const numRes = await page.$$eval('.result', ns=>ns.slice(0,4).map(n=>n.textContent.trim().slice(0,40)));
t('поиск по номеру 500', numRes.length>=3 && numRes.slice(0,3).every(x=>x.includes('№500')), numRes.join(' | '));

// латиница (раскладка): "dtkbrbq" -> "великий"
await page.fill('.searchbar__field input','dtkbrbq'); await page.waitForTimeout(900);
const lat = await page.$$eval('.result', ns=>ns.length);
const meta = await page.textContent('.result-meta');
t('поиск в латинской раскладке', lat>0, `${lat} результатов, meta="${(meta||'').trim()}"`);

// фразовый поиск + счётчики чипов
await page.fill('.searchbar__field input','благодать'); await page.waitForTimeout(900);
const chips = await page.$$eval('.chip', ns=>ns.map(n=>n.textContent.trim()));
t('чипы со счётчиками по сборникам', chips.length===8 && chips[0].includes('Все'), chips.join(' | '));

// открытие читалки и назад
await page.click('.result'); await page.waitForTimeout(900);
const readerOpen = await page.$eval('#reader', n=>!n.hidden && n.classList.contains('is-open'));
const blocks = await page.$$eval('.block', ns=>ns.length);
t('читалка открывается', readerOpen && blocks>0, blocks+' блоков');
const marks = await page.$$eval('.reader__page mark', ns=>ns.length);
await page.evaluate(()=>history.back()); await page.waitForTimeout(700);
const readerClosed = await page.$eval('#reader', n=>!n.classList.contains('is-open'));
t('кнопка «назад» закрывает читалку', readerClosed);

// избранное через читалку
await page.evaluate(()=>location.hash='#/s/sion/100'); await page.waitForTimeout(900);
await page.click('.reader__dock .dock-btn'); await page.waitForTimeout(400);
const favOn = await page.$eval('.reader__dock .dock-btn', n=>n.classList.contains('is-fav'));
const favStored = await page.evaluate(()=>JSON.parse(localStorage.getItem('psalms.v1')).favorites.length);
t('избранное сохраняется', favOn && favStored===1, `favorites=${favStored}`);

// смена размера шрифта
await page.click('.reader__bar .icon-btn:last-of-type'); await page.waitForTimeout(500);
const sheetOpen = await page.$eval('#sheetHost', n=>!n.hidden);
await page.click('.sheet .stepper button:last-child'); await page.waitForTimeout(300);
const size = await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--reader-size').trim());
t('настройка размера текста', sheetOpen && size==='19px', 'size='+size);

// навигация свайпом (эмуляция через кнопку «следующая»)
await page.evaluate(()=>{ document.getElementById('sheetHost').classList.remove('is-open'); document.getElementById('sheetHost').hidden=true; });
await page.evaluate(()=>document.querySelector('.reader__scroll').scrollTop=99999); await page.waitForTimeout(300);
const nextBtn = await page.$('.nav-btn--next');
await nextBtn.click(); await page.waitForTimeout(800);
const crumb = await page.textContent('.reader__crumb');
t('переход к следующей песне', crumb.includes('101'), crumb);

// производительность поиска
await page.evaluate(()=>history.back()); await page.waitForTimeout(500);
const timing = await page.evaluate(async ()=>{
  const mod = await import('./js/data.js');
  const t0 = performance.now(); mod.search('господь'); const t1 = performance.now();
  const r = mod.search('славьте бога');
  return { ms: Math.round(t1-t0), total: r.total };
});
t('скорость поиска', timing.ms < 400, `${timing.ms} мс, «славьте бога» → ${timing.total}`);

console.log('OK:'); ok.forEach(x=>console.log('  ✓',x));
if(fail.length){ console.log('FAIL:'); fail.forEach(x=>console.log('  ✗',x)); }
console.log('ERRORS:', errors.length? JSON.stringify(errors,null,1) : 'нет');
await browser.close();
process.exit(fail.length?1:0);
