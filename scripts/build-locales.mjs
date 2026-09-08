import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as esbuild from 'esbuild';
import { scriptSources, adminScriptSources, styleSources } from './web-sources.mjs';
import { languages, readTranslations, translate, translateJS, phrasePattern } from './i18n-utils.mjs';
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const hash = text => crypto.createHash('sha256').update(text).digest('hex').slice(0,10);
export const normalizeWord = text => String(text).normalize('NFD').replace(/\p{M}/gu,'').replace(/ß/g,'ss').toUpperCase().replace(/Ё/g,'Е').replace(/[^\p{L}]/gu,'');
export function canMake(word, letters) {
  const counts = new Map();
  for (const c of letters) counts.set(c, (counts.get(c)||0)+1);
  for (const c of word) { if (!counts.get(c)) return false; counts.set(c, counts.get(c)-1); }
  return true;
}
export async function buildLocales(root, jsOptions) {
  const dictionaries = readTranslations(root);
  const outputs = new Map();
  const runtimeSources = [fs.readFileSync(path.join(root,'index.html'),'utf8'),
    ...walk(path.join(root,'cloudflare')).filter(file=>file.endsWith('.js') && !file.includes('/node_modules/') && !file.includes('/public/') && !file.includes('/shared/')).map(file=>fs.readFileSync(file,'utf8')),
    ...walk(path.join(root,'web/data')).filter(file=>file.endsWith('.json')).map(file=>fs.readFileSync(file,'utf8'))];
  const runtimeKeys = new Set(runtimeSources.flatMap(source=>[...source.matchAll(phrasePattern)].map(match=>match[0].trim())));
  const entries = {};
  const relative = file => path.relative(root,file).replaceAll(path.sep,'/');
  const sourceFiles = ['web/js','web/games'].flatMap(dir => walk(path.join(root,dir))).map(relative)
    .filter(file => /\.(js|css|html)$/.test(file) && !file.includes('/vendor/') && !/\/(language-choice|telegram-launch-context)\.js$/.test(file));
  const dataFiles = walk(path.join(root,'web/data')).map(relative).filter(file=>file.endsWith('.json'));
  const files = new Set([...sourceFiles,...dataFiles,'install.html']);
  const localizedPath = (file,lang) => `web/locales/${lang}/${file.replace(/^web\//,'')}`;
  for (const lang of languages) {
    const dict = dictionaries[lang];
    const rewrite = source => source.replace(/web\/(?:js|games|data)\/[A-Za-z0-9_./-]+/g, file => files.has(file) ? localizedPath(file,lang) : file);
    const localJS = file => rewrite(translateJS(fs.readFileSync(path.join(root,file),'utf8'),dict)).replaceAll("'install.html'",JSON.stringify(localizedPath('install.html',lang))).replaceAll('"install.html"',JSON.stringify(localizedPath('install.html',lang)))
      .replaceAll('${SHELL_URL}/install.html', '${SHELL_URL}/'+localizedPath('install.html',lang))
      .replaceAll("'ru-RU'",JSON.stringify(lang)).replaceAll('"ru-RU"',JSON.stringify(lang));
    for (const file of sourceFiles) {
      let text = fs.readFileSync(path.join(root,file),'utf8');
      if (file.endsWith('.js')) text = localJS(file);
      else if (file.endsWith('.css')) {
        text = translate(text,dict).replace(/url\((['"]?)([^)'"\s]+)\1\)/g,(all,quote,ref)=> {
          if (/^(?:data:|https?:|#)/.test(ref)) return all;
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(file),ref));
          return `url(${quote}${path.posix.relative(path.posix.dirname(localizedPath(file,lang)),target)}${quote})`;
        });
      } else {
        text = translate(text,dict).replace('lang="ru"',`lang="${lang}"`);
        // The embedded runner keeps its original asset base: no model/texture duplication.
        const base = path.posix.relative(path.posix.dirname(localizedPath(file,lang)),path.posix.dirname(file)) + '/';
        text = text.replace('<head>',`<head>\n  <base href="${base}" />`);
        text = text.replace(/(src|href)=(['"])(js\/[^'"?]+)([^'"]*)\2/g,(all,attr,q,ref,query)=> {
          const source = path.posix.join(path.posix.dirname(file),ref);
          return `${attr}=${q}${path.posix.relative(path.posix.dirname(file),localizedPath(source,lang))}${query}${q}`;
        });
      }
      outputs.set(localizedPath(file,lang),text);
    }
    const transformData = value => {
      if (typeof value==='string') return dict[value] || translate(value,dict);
      if (Array.isArray(value)) return value.map(transformData);
      if (value?.id==='apostles_james') return {...value,title:{en:'James',de:'Jakobus',es:'Santiago'}[lang]};
      if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,transformData(v)]));
      return value;
    };
    const translated = {};
    for (const file of dataFiles) {
      if (/bible_(?:wow|wordsearch)_levels/.test(file)) continue;
      translated[path.basename(file)] = transformData(JSON.parse(fs.readFileSync(path.join(root,file),'utf8')));
    }
    const vocabulary = [...new Set(['easy_bible_words.json','medium_bible_words.json','hard_bible_words.json','characters.json','describe_words.json']
      .flatMap(file=>translated[file]).filter(word=>!/[\s()]/.test(word)).map(normalizeWord))].filter(word=>word.length>=3 && word.length<=10 && !/[А-Я]/.test(word));
    // Each wheel has a distinct full-length anchor and only words constructible from its letters.
    const anchors = vocabulary.filter(word=>word.length>=4 && word.length<=9)
      .map(word=>({word,sub:vocabulary.filter(other=>other!==word && other.length>=3 && canMake(other,word))}))
      .sort((a,b)=>b.sub.length-a.sub.length || a.word.localeCompare(b.word,'en'));
    if (anchors.length<150) throw new Error(`${lang}: insufficient distinct word-wheel anchors`);
    const wheelKeys=new Set();
    const uniqueAnchors=anchors.filter(entry=>{const key=[...entry.word].sort().join('');if(wheelKeys.has(key))return false;wheelKeys.add(key);return true;});
    if(uniqueAnchors.length<150)throw new Error(`${lang}: insufficient distinct letter sets`);
    const wowLevels = uniqueAnchors.slice(0,150).sort((a,b)=>a.word.length-b.word.length || a.word.localeCompare(b.word,'en')).map((entry,i)=>({
      id:i+1,letters:[...entry.word].sort().join(''),words:[entry.word,...entry.sub.slice(0,4)],bonus:entry.sub.slice(4)
    }));
    translated['bible_wow_levels.json'] = {version:1,language:lang,title:dict['Библейские слова'],levels:wowLevels};
    const searchWords = vocabulary.filter(word=>word.length<=9);
    translated['bible_wordsearch_levels.json'] = {version:1,language:lang,source:'Original localized Bible vocabulary',levels:Array.from({length:90},(_,i)=>({
      id:i+1,theme:dict['Мир Библии'],rows:10,cols:10,wordsList:Array.from({length:6+(i%3)},(_,j)=>searchWords[(i*7+j)%searchWords.length])
    }))};
    // Letter games intentionally omit diacritics on their boards; labels and hints retain native spelling.
    translated['sacred_words.json'] = translated['sacred_words.json'].map(entry=>({...entry,word:normalizeWord(entry.word)}));
    for (const [file,data] of Object.entries(translated)) {
      if (/[А-Яа-яЁё]/.test(JSON.stringify(data))) throw new Error(`${lang}/${file}: untranslated game data`);
      outputs.set(localizedPath(`web/data/${file}`,lang),JSON.stringify(data));
    }
    let install = translate(fs.readFileSync(path.join(root,'install.html'),'utf8'),dict).replace('lang="ru"',`lang="${lang}"`);
    install = install.replace('<head>', '<head>\n<base href="../../../" />');
    outputs.set(localizedPath('install.html',lang),install);
    // Only protocol-owned strings are passed through this dictionary at runtime, never player messages.
    const runtime = `window.AppI18nDictionary=${JSON.stringify(Object.fromEntries(Object.entries(dict).filter(([key])=>runtimeKeys.has(key))))};\n`;
    const admin = await esbuild.transform(adminScriptSources.map(file=>localJS(file)).join('\n'),jsOptions);
    const adminName = `admin.${lang}.${hash(admin.code)}.js`;
    const app = await esbuild.transform(runtime + scriptSources.map(file=>localJS(file)).join('\n').replace('__ADMIN_BUNDLE_URL__',`web/dist/${adminName}`),jsOptions);
    const appName = `app.${lang}.${hash(app.code)}.js`;
    outputs.set(`web/dist/${appName}`,app.code);
    outputs.set(`web/dist/${adminName}`,admin.code);
    entries[lang] = `web/dist/${appName}`;
  }
  // Eager source copies are needed only when a legacy lazy loader refers to them.
  // Everything else already ships in the selected app/admin/CSS bundle.
  const bundled=new Set([...scriptSources,...adminScriptSources,...styleSources]);
  const texts=[...outputs.entries()];
  for(const [file] of texts) {
    const original=file.replace(/^web\/locales\/(en|de|es)\//,'web/');
    if(bundled.has(original) && !texts.some(([other,text])=>other!==file && text.includes(file)))outputs.delete(file);
  }
  return {outputs,entries};
}
