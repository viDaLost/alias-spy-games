import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { readTranslations, translateJS } from './i18n-utils.mjs';
import { canMake } from './build-locales.mjs';
import { answerMatches, CATALOG } from '../cloudflare/bible-sketch-worker/src/catalog.js';
const dictionaries=readTranslations(process.cwd());
for(const lang of ['en','de','es']) {
  const base=`web/locales/${lang}/data/`;
  const wow=JSON.parse(fs.readFileSync(base+'bible_wow_levels.json')).levels;
  assert.equal(wow.length,150);assert.equal(new Set(wow.map(l=>l.letters)).size,150);
  for(const level of wow)for(const word of [...level.words,...level.bonus]) {
    assert.match(word,/^[A-Z]+$/);assert.ok(canMake(word,level.letters));
  }
  const ws=JSON.parse(fs.readFileSync(base+'bible_wordsearch_levels.json')).levels;
  assert.equal(ws.length,90);
  for(const level of ws)for(const word of level.wordsList)assert.ok(word.length<=level.cols);
  const sacred=JSON.parse(fs.readFileSync(base+'sacred_words.json'));
  for(const item of sacred)assert.match(item.word,/^[A-Z]+$/);
  for(const source of ['Добро пожаловать!','Язык приложения','Играй вместе с друзьями и открывай Библию по-новому.'])assert.ok(dictionaries[lang][source]);
  const input="const username = 'Неизвестное имя';const message = `Привет ${username}`;";
  const output=translateJS(input,dictionaries[lang]);
  assert.ok(output.includes('${username}'));assert.ok(output.includes('Неизвестное имя'));
}
const entries=Object.values(CATALOG).flatMap(value=>Array.isArray(value)?value:[]);
// The catalog is an array of categories. All translated secrets must be accepted.
const labels=JSON.parse(fs.readFileSync('cloudflare/shared/game-translations.js','utf8').split(' = ')[1].replace(/;\s*$/,''));
for(const [source,targets] of Object.entries(labels))for(const translated of targets) {
  assert.ok(answerMatches({label:source,aliases:[]},translated),`${source}: ${translated}`);
}
// Exercise the actual webhook handler with signed test requests and mocked Telegram.
let code=fs.readFileSync('cloudflare/app-core-worker/src/index-v10.js','utf8')
  .replace(/^import .*;$/gm,'').replace(/^export \{ UserStore \};$/gm,'')
  .replace('export default {','const worker = {').replace('export const WELCOME_LANGUAGES','const WELCOME_LANGUAGES');
code+='\nglobalThis.testHandle=tryHandleRichWelcome;';
const calls=[];
const context=vm.createContext({TextEncoder,URL,Response,crypto:webcrypto,coreV9:{},
  fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true,result:{username:'BibleTestBot'}})};}});
vm.runInContext(code,context);
const env={TELEGRAM_BOT_TOKEN:'test-only-token',ADMIN_TELEGRAM_ID:'123'};
const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TELEGRAM_BOT_TOKEN))).toString('hex');
for(const id of ['123','456'])for(const lang of ['ru','en','de','es']) {
  calls.length=0;const pending=[];
  const request=new Request('https://core.test/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':hash},body:JSON.stringify({message:{chat:{id,type:'private'},from:{id},text:`/start lang_${lang}`}})});
  assert.equal(await context.testHandle(request,env,{waitUntil:p=>pending.push(p)}),true);await Promise.all(pending);
  const blocks=calls.find(call=>call.url.endsWith('/sendRichMessage')).body.rich_message.blocks;
  const heading=blocks.find(block=>block.type==='heading').text;
  assert.equal(heading,{ru:'Библейские игры',en:'Bible Games',de:'Bibelspiele',es:'Juegos bíblicos'}[id==='123'?lang:'ru']);
  assert.equal(blocks.filter(block=>block.type==='buttons').length,id==='123'?2:1);
}
console.log('Localized dictionaries, playable letters, online answers and root-only bot welcome passed.');
