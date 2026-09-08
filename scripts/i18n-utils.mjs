import fs from 'node:fs';
import path from 'node:path';
import { tokenizer } from 'acorn';
export const languages = ['en', 'de', 'es'];
export const phrasePattern = /[А-ЯЁа-яё][А-ЯЁа-яё0-9 \t.,!?…—–«»():;×%+−/‑-]*[А-ЯЁа-яё0-9.!?…»)]|[А-ЯЁа-яё]/g;
export function readTranslations(root) {
  const result = Object.fromEntries(languages.map(lang => [lang, {}]));
  for (const [index, line] of ['translations.tsv','words.tsv'].flatMap(file => fs.readFileSync(path.join(root, 'scripts/i18n', file), 'utf8').split('\n')).entries()) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [source, ...values] = line.split('\t');
    if (values.length !== 3 || values.some(value => !value)) throw new Error(`Invalid translation row ${index + 1}`);
    languages.forEach((lang, i) => { result[lang][source] = values[i]; });
  }
  // Source catalogues use title case, lower case and capitals for the same word.
  for (const dictionary of Object.values(result)) {
    for (const [source,target] of Object.entries({...dictionary})) {
      for (const [key,value] of [[source.toLowerCase(),target.toLowerCase()],[source.toUpperCase(),target.toUpperCase()],[source[0].toUpperCase()+source.slice(1).toLowerCase(),target[0].toUpperCase()+target.slice(1)]]) {
        if (!Object.hasOwn(dictionary,key)) dictionary[key]=value;
      }
    }
  }
  return result;
}
export function translate(text, dictionary) {
  return String(text).replace(phrasePattern, source => {
    const key = source.trim();
    return dictionary[key] ? source.replace(key, dictionary[key]) : source;
  });
}
export function translateJS(source, dictionary) {
  const edits = [];
  // Token boundaries keep comments, identifiers, regular expressions and user data intact.
  for (const token of tokenizer(source, { ecmaVersion: 'latest', sourceType: 'module' })) {
    if (token.type.label === 'regexp' && /[А-Яа-яЁё]/.test(token.value.pattern) && !/[А-Я]-|А-Я|а-я/.test(token.value.pattern)) {
      const stems = {начать:'start|begin|empezar',след:'next|nächst|siguiente',истекл:'expired|abgelaufen|caduc',сесси:'session|sitzung|sesión',собирайте:'collect|sammle|reúne',символ:'symbol|símbolo',нет:'no|kein',такого:'such|solch'};
      const localized = token.value.pattern.replace(/[А-Яа-яЁё]+(?: [А-Яа-яЁё]+)*/g, word => {
        const text = dictionary[word] || dictionary[word.toLowerCase()] || stems[word.toLowerCase()];
        return text ? '(?:' + text.replaceAll('/', '\\/') + ')' : word;
      });
      if(localized!==token.value.pattern) edits.push({start:token.start,end:token.end,value:'/'+localized+'/'+token.value.flags});
      continue;
    }
    if (token.type.label !== 'string' && token.type.label !== 'template') continue;
    const raw = source.slice(token.start, token.end);
    const quote = token.type.label === 'string' ? raw[0] : '`';
    const input = token.type.label === 'string' ? token.value : token.value;
    const localized = translate(input, dictionary);
    if (localized === input) continue;
    const escaped = localized.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n')
      .replace(new RegExp(quote, 'g'), '\\' + quote).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    edits.push({ start: token.start, end: token.end, value: token.type.label === 'string' ? quote + escaped + quote : escaped.replace(/\$\{/g, '\\${') });
  }
  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.value + source.slice(edit.end);
  return source;
}
