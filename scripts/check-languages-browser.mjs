// Integration checks use mocked services; no real user/admin requests are sent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from './lib/playwright-app-fixture.mjs';

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
const failures=[];
const check=(condition,message)=>{if(!condition)failures.push(message);};
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
    // Роль больше ничего не решает: язык у всех тот, который выбрали.
    const expected=lang;
    // С понятным сообщением: если язык снова запрут за ролью, падение должно
    // называть роль и язык, а не голый таймаут ожидания.
    const started=await page.waitForFunction(lang=>document.documentElement.dataset.languageReady===lang,expected)
      .then(()=>true).catch(()=>false);
    if(!started) {
      const actual=await page.evaluate(()=>document.documentElement.dataset.languageReady||'');
      check(false,`${role}: asked for ${expected}, app started in ${actual||'nothing'}`);
      await context.close();
      continue;
    }
    await page.waitForSelector('#menu-container:not(.hidden)');
    {
      await page.waitForSelector('#app-language-control');
      assert.equal(await page.locator('#app-language').inputValue(),lang);
      // Флаг страны выбранного языка — по нему выбор видно, не читая названия.
      const flags={en:'🇬🇧',de:'🇩🇪',es:'🇪🇸'};
      assert.equal((await page.locator('.language-pill__flag').innerText()).trim(),flags[lang],`${lang}: wrong flag`);
      /*
        Скрипты, которые подключаются на ходу, должны браться из переведённой
        копии. Нижняя панель грузилась по русскому адресу и оставалась русской
        под английским приложением: файл, который её подключает, намеренно не
        локализуется, а язык к тому моменту ещё не подтверждён.
      */
      for(const file of ['web/js/social-dock-v2.js','web/js/game-friend-invites.js','web/games/spy-online.js','web/games/bible-sketch.js']) {
        const resolved=await page.evaluate(path=>window.AppLanguage?.asset?.(path),file);
        check(resolved===`web/locales/${lang}/${file.slice(4)}`,`${lang}: ${file} resolves to ${resolved}`);
      }

      // Приветствие с главного экрана убрано: язык выбирают один раз.
      assert.equal(await page.locator('.language-welcome, .language-panel').count(),0,`${lang}: welcome panel is back`);
      // Оговорка о машинном переводе — на языке, на котором её будут читать.
      // Наличие проверяется отдельно: без этого пропавшая строка приводила к
      // таймауту ожидания, и падение говорило про locator, а не про оговорку.
      const hasNotice=await page.locator('#app-language-notice').count()===1;
      check(hasNotice,`${lang}: machine-translation notice is missing`);
      const disclaimer=hasNotice?await page.locator('#app-language-notice').innerText():'';
      check(!hasNotice||disclaimer.trim().length>=20,`${lang}: notice is too short: ${disclaimer}`);
      check(!/[А-Яа-яЁё]/.test(disclaimer),`${lang}: untranslated notice: ${disclaimer}`);
      for(const width of [320,390]) {
        await page.setViewportSize({width,height:844});
        assert.ok(await page.locator('.language-pill').evaluate(node=>node.scrollWidth<=node.clientWidth+1));
        const layout = await page.evaluate(() => {
          const { clientWidth, scrollWidth } = document.documentElement;
          const overflows = [...document.querySelectorAll('#main-catalog *')]
            .filter((node) => !node.closest('.catalog-promo-viewport'))
            .filter((node) => node.getBoundingClientRect().right > clientWidth + 1)
            .slice(0, 8).map((node) => node.className);
          return { clientWidth, scrollWidth, overflows };
        });
        assert.ok(layout.scrollWidth <= layout.clientWidth + 1,
          `${lang}: catalog overflows at ${width}px: ${JSON.stringify(layout)}`);
      }
      /*
        Тяжёлый разбор — игры и кадр «Моисея» — гоняется один раз на язык, от
        лица обычного гостя. Раньше он доставался только главному
        администратору, потому что переводы были превью; теперь важно как раз
        обратное — что их видит человек без всяких прав. Повторять то же самое
        ещё для трёх ролей нечего: роль на язык больше не влияет, и это
        проверено выше.
      */
      if(role!=='guest') { await context.close(); continue; }
      for(const key of ['alias','quartet','bible-wow','bible-wordsearch','sacred-word']) {
        await page.evaluate(key=>{window.showGame(key);},key);
        await page.waitForFunction(key=>document.body.dataset.currentGame===key,key);
        await page.waitForFunction(()=>{const node=document.getElementById('game-container');return node?.children.length && !node.querySelector('.app-game-loading');});
        if (key === 'quartet') await page.locator('#qv2-root.qt-root .qt-home-form').waitFor();
        const content=await page.locator('#game-container').innerText();
        check(!/[А-Яа-яЁё]/.test(content),`${lang}/${key}: untranslated content: ${content.slice(0,1000)}`);
        assert.equal(await page.locator('#game-container .app-error-card').count(),0,`${lang}/${key}: error screen`);
        if(key==='sacred-word') {
          const keys=await page.locator('.sw-kb-key').allTextContents();
          assert.ok(keys.includes('A') && keys.includes('Z'));
        }
        await page.evaluate(()=>window.goToMainMenu());
        await page.waitForSelector('#menu-container:not(.hidden)');
      }
      await page.evaluate(() => window.showGame('moses-nile'));
      const maintenance = page.locator('#moses-maintenance[open]');
      await maintenance.waitFor();
      const nile = await maintenance.textContent();
      check(!/[А-Яа-яЁё]/.test(nile), `${lang}/moses-nile: untranslated notice: ${nile.trim()}`);
      await maintenance.locator('button').click();

      await page.selectOption('#app-language','ru');
      await page.waitForFunction(()=>document.documentElement.dataset.languageReady==='ru');
    }
    check(errors.length===0,`${role}/${lang}: page errors: ${errors.join(' | ')}`);
    await context.close();
  }
  assert.deepEqual(failures,[]);
  console.log('Browser language checks: every role gets the chosen language, compact selector with flag, machine-translation notice, and for a plain guest — five games and the Nile frame in EN/DE/ES.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
