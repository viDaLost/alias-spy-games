// Распознавание голосовых (Whisper) и «умный» разбор фраз через LLM.
// Любой провайдер с OpenAI-совместимым API: Groq (бесплатный тариф), OpenAI и др.

import { fetch, FormData, InputFile } from 'sdk';
import { AI_PRESETS, CURRENCIES } from './config.js';
import { getSetting } from './store.js';
import { isoYmd, localToday } from './dates.js';

export async function getAiConfig() {
  const provider = (await getSetting('ai_provider')) || 'groq';
  const key = await getSetting('ai_key');
  const preset = AI_PRESETS[provider] || {};
  return {
    provider,
    title: preset.title || provider,
    key,
    baseUrl: ((await getSetting('ai_base_url')) || preset.baseUrl || '').replace(/\/+$/, ''),
    sttModel: (await getSetting('ai_stt_model')) || preset.sttModel,
    llmModel: (await getSetting('ai_llm_model')) || preset.llmModel,
    llmExtra: preset.llmExtra || {},
    llmEnabled: (await getSetting('ai_llm')) !== 'off',
  };
}

export const aiReady = (cfg) => Boolean(cfg && cfg.key && cfg.baseUrl);

async function readError(res) {
  let text = '';
  try { text = await res.text(); } catch { /* тело уже прочитано */ }
  try {
    const j = JSON.parse(text);
    text = (j.error && (j.error.message || j.error)) || j.message || text;
  } catch { /* не JSON */ }
  return `${res.status} ${String(text).slice(0, 200)}`;
}

/** Расшифровка аудио. bytes — Uint8Array файла голосового (OGG/Opus). */
export async function transcribe(cfg, bytes, { filename = 'voice.ogg', mime = 'audio/ogg', hint = '' } = {}) {
  const form = new FormData();
  form.append('file', new InputFile(bytes, filename, { type: mime }));
  form.append('model', cfg.sttModel);
  form.append('language', 'ru');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  if (hint) form.append('prompt', hint.slice(0, 600));
  const res = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}` },
    body: form,
  });
  if (!res.ok) throw new Error('Распознавание: ' + await readError(res));
  const data = await res.json();
  return String(data.text || '').trim();
}

async function chatJson(cfg, system, user) {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.llmModel,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      ...cfg.llmExtra,
    }),
  });
  if (!res.ok) throw new Error('LLM: ' + await readError(res));
  const data = await res.json();
  let content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  content = String(content || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  return JSON.parse(content);
}

/** Проверка ключа: список моделей провайдера. */
export async function checkKey(cfg) {
  const res = await fetch(`${cfg.baseUrl}/models`, { headers: { Authorization: `Bearer ${cfg.key}` } });
  if (!res.ok) throw new Error(await readError(res));
  return true;
}

/**
 * Разбор фразы в операции с помощью LLM.
 * cats — категории пользователя. Возвращает массив
 * { kind, amount (копейки), currency, categoryId|null, note, ymd|null } или null при ошибке.
 */
export async function parseWithLlm(cfg, text, { cats, currency, tz }) {
  const today = localToday(tz);
  // Подкатегории — полным путём: «Здоровье › Аптека».
  const path = (c) => (c.parent_name ? `${c.parent_name} › ${c.name}` : c.name);
  const expense = cats.filter((c) => c.kind === 'expense').map(path);
  const income = cats.filter((c) => c.kind === 'income').map(path);
  const system = [
    'Ты — модуль учёта личных финансов. Пользователь пишет или надиктовывает траты и доходы на русском.',
    'Извлеки ВСЕ операции из фразы и верни JSON строго вида:',
    '{"items":[{"type":"expense|income","amount":число,"currency":"ISO-код","category":"название","note":"кратко что это","date":"YYYY-MM-DD"}]}',
    `Сегодня ${isoYmd(today)}. Валюта по умолчанию ${currency}. Допустимые валюты: ${Object.keys(CURRENCIES).join(', ')}.`,
    `Категории расходов: ${expense.join('; ')}.`,
    `Категории доходов: ${income.join('; ')}.`,
    'Правила: category — ТОЛЬКО одно из названий выше (точно как написано), иначе «Прочее»/«Прочие доходы».',
    'Если подходит подкатегория («Категория › Подкатегория») — выбирай её.',
    'amount — число в единицах валюты (250.5), «5к»/«5 тысяч» = 5000, «полторы тысячи» = 1500.',
    'Если указано «2 кофе по 150» — amount = 300. Не дели одну покупку на несколько.',
    'note — 1–4 слова по-русски, с маленькой буквы, без суммы и даты («кофе», «такси до работы»).',
    'date — по словам «вчера», «в пятницу», «3 сентября»; если не сказано — сегодня.',
    'Если в тексте нет денег, верни {"items":[]}.',
  ].join('\n');
  let data;
  try {
    data = await chatJson(cfg, system, text);
  } catch (e) {
    console.warn('LLM parse failed', String(e && e.message || e));
    return null;
  }
  const list = Array.isArray(data && data.items) ? data.items : [];
  const byName = new Map();
  for (const c of cats) {
    byName.set(`${c.kind}:${path(c).toLowerCase()}`, c);
    const short = `${c.kind}:${c.name.toLowerCase()}`;
    if (!byName.has(short) || !c.parent_id) byName.set(short, c);
  }
  const out = [];
  for (const it of list.slice(0, 20)) {
    const amount = Math.round(Number(String(it.amount).replace(',', '.').replace(/\s/g, '')) * 100);
    if (!(amount > 0) || amount >= 1e12) continue;
    const kind = it.type === 'income' ? 'income' : 'expense';
    const cur = String(it.currency || '').toUpperCase();
    const cat = byName.get(`${kind}:${String(it.category || '').toLowerCase().trim()}`) || null;
    let ymd = null;
    const m = String(it.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) ymd = { y: +m[1], m: +m[2], d: +m[3] };
    out.push({
      kind,
      amount,
      currency: CURRENCIES[cur] ? cur : currency,
      categoryId: cat ? cat.id : null,
      note: String(it.note || '').trim().slice(0, 120),
      ymd,
    });
  }
  return out;
}
