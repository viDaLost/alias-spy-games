import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const choice=fs.readFileSync('web/js/language-choice.js','utf8');
const bootstrap=fs.readFileSync('web/i18n/bootstrap.js','utf8');
function fixture({lang='en',role,initData='signed-data',fail=false,stored='de',query=true}={}) {
  const requests=[],scripts=[],navigations=[],events=[];
  const values=new Map([['app_language_v1',stored]]);
  const location={search:query?`?lang=${lang}`:'',hash:'',href:`https://example.test/${query?`?lang=${lang}`:''}`,assign:url=>navigations.push(url),replace:url=>navigations.push(url)};
  const document={documentElement:{lang:'ru'},querySelector:()=>({content:'https://core.example.test'}),
    getElementById:()=>({textContent:JSON.stringify({ru:'ru.js',en:'en.js',de:'de.js',es:'es.js'})}),
    createElement:()=>({dataset:{}}),head:{appendChild:script=>scripts.push(script)}};
  const window={Telegram:{WebApp:{initData}},dispatchEvent:event=>events.push(event)};
  const sandbox={window,document,location,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    localStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},
    fetch:async(url,options)=>{requests.push({url,...options});if(fail)throw Error('offline');return {ok:true,json:async()=>role};}};
  vm.runInNewContext(choice,sandbox);
  return {sandbox,requests,scripts,navigations,events,values,language:window.AppLanguage};
}
for(const lang of ['en','de','es']) {
  // Язык берётся у всех одинаково: роль больше не спрашивается вовсе.
  for(const role of [undefined,{success:false},{success:true,isAdmin:false,isRoot:false},{success:true,isAdmin:true,isRoot:true}]) {
    const f=fixture({lang,role});await vm.runInNewContext(bootstrap,f.sandbox);
    assert.equal(f.language.lang,lang,`${lang}: language must not depend on the role`);
    assert.equal(f.scripts[0].src,`${lang}.js`);
    assert.equal(f.sandbox.document.documentElement.lang,lang);
    assert.equal(f.requests.length,0,'startup must not ask the server for a role');
  }
  const f=fixture({lang});await vm.runInNewContext(bootstrap,f.sandbox);
  f.language.choose('ru');
  assert.equal(f.values.get('app_language_v1'),'ru');
  assert.equal(f.navigations.length,1,'choosing a language must reload the app with it');
}
// Сохранённый выбор работает и без ссылки, а неизвестный язык откатывается к русскому.
{
  const f=fixture({query:false,stored:'es'});await vm.runInNewContext(bootstrap,f.sandbox);
  assert.equal(f.scripts[0].src,'es.js');
  assert.equal(f.requests.length,0);
}
{
  const f=fixture({query:false,stored:'xx'});await vm.runInNewContext(bootstrap,f.sandbox);
  assert.equal(f.scripts[0].src,'ru.js');
  const before=f.values.get('app_language_v1');
  f.language.choose('xx');
  assert.equal(f.values.get('app_language_v1'),before,'unknown languages must not be stored');
  assert.equal(f.navigations.length,0);
}
// Вне сети язык остаётся выбранным: спрашивать теперь не у кого.
{
  const f=fixture({lang:'de',fail:true});await vm.runInNewContext(bootstrap,f.sandbox);
  assert.equal(f.scripts[0].src,'de.js');
}
const russian=fixture({lang:'ru'});await vm.runInNewContext(bootstrap,russian.sandbox);
assert.equal(russian.requests.length,0,'Russian startup must not wait for an extra request');
russian.language.choose('es');assert.equal(russian.values.get('app_language_v1'),'es');
console.log('Language access: every visitor gets the chosen language, saved preference, links, unknown values and offline start passed.');
