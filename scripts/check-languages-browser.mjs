// Integration checks use mocked services; no real user/admin requests are sent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome', args:['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const role of ['root','delegated','denied','guest']) for (const lang of ['en','de','es']) {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
    const initData=role==='guest'?'':'signed-test-data';
    await context.addInitScript(({initData,lang})=>{
      window.__APP_TELEMETRY_DISABLED__=true;
      localStorage.setItem('app_language_v1',lang);
      window.Telegram={WebApp:{initData,initDataUnsafe:{user:{id:1288379477,first_name:'QA',username:'qa'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},disableVerticalSwipes(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};
    },{initData,lang});
    const page=await context.newPage();const errors=[],downloads=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      const url=route.request().url();
      if(url.startsWith(base)) {downloads.push(url);return route.continue();}
      if(url.startsWith('https://telegram.org/'))return route.fulfill({contentType:'text/javascript',body:''});
      let body={};try{body=route.request().postDataJSON()||{};}catch{}
      const action=(body.payload||body).action;
      let response={success:true,isBanned:false,lastGames:[],items:[],users:[],wowStars:20,wsStars:0};
      if(action==='adminRoleStatus')response={success:true,isRoot:role==='root',isAdmin:['root','delegated'].includes(role),userId:role==='root'?'1288379477':'999999'};
      if(action==='referralStatus')response={success:true,required:false,answered:true};
      return route.fulfill({contentType:'application/json',body:JSON.stringify(response)});
    });
    await page.goto(`${base}/?lang=${lang}`,{waitUntil:'domcontentloaded'});
    const expected=role==='root'?lang:'ru';
    await page.waitForFunction(lang=>document.documentElement.dataset.languageReady===lang,expected);
    await page.waitForSelector('#menu-container:not(.hidden)');
    if(role!=='root') {
      assert.equal(await page.locator('#app-language-control').count(),0,`${role}: language selector must be absent`);
      assert.ok(!downloads.some(url=>/\/locales\/|\/app\.(en|de|es)\./.test(url)),`${role}: unauthorized locale download`);
    } else {
      await page.waitForSelector('#app-language-control');
      assert.equal(await page.locator('#app-language').inputValue(),lang);
      const introduction=await page.locator('.language-welcome').innerText();
      assert.ok(!/[А-Яа-яЁё]/.test(introduction),`${lang}: untranslated welcome: ${introduction}`);
      for(const width of [320,390]) {
        await page.setViewportSize({width,height:844});
        assert.ok(await page.locator('.language-panel').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
      }
      for(const key of ['alias','quartet','bible-wow','bible-wordsearch','sacred-word']) {
        await page.evaluate(key=>{window.showGame(key);},key);
        await page.waitForFunction(key=>document.body.dataset.currentGame===key,key);
        await page.waitForFunction(()=>{const node=document.getElementById('game-container');return node?.children.length && !node.querySelector('.app-game-loading');});
        const content=await page.locator('#game-container').innerText();
        assert.ok(!/[А-Яа-яЁё]/.test(content),`${lang}/${key}: untranslated content: ${content.slice(0,1000)}`);
        assert.equal(await page.locator('#game-container .app-error-card').count(),0,`${lang}/${key}: error screen`);
        if(key==='sacred-word') {
          const keys=await page.locator('.sw-kb-key').allTextContents();
          assert.ok(keys.includes('A') && keys.includes('Z'));
        }
        await page.evaluate(()=>window.goToMainMenu());
        await page.waitForSelector('#menu-container:not(.hidden)');
      }
      await page.selectOption('#app-language','ru');
      await page.waitForFunction(()=>document.documentElement.dataset.languageReady==='ru');
    }
    assert.deepEqual(errors,[],`${role}/${lang}: page errors`);
    await context.close();
  }
  console.log('Browser language checks: root preview, all denied roles, welcome, mobile selector and five games in EN/DE/ES passed.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
