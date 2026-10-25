// Заглушка `sdk`: api записывает вызовы, fetch отдаёт заранее заданные ответы.
import { db } from './sdk-db.mjs';
export { db };

export const calls = [];
let msgId = 1000;
export const files = new Map();
export const apiHandlers = {};

export class BotApiError extends Error {
  constructor(code, description) { super(description); this.code = code; this.description = description; }
}

export const api = new Proxy({}, {
  get(_, method) {
    if (method === 'getFileContent') return async (id) => { if (!files.has(id)) throw new BotApiError(400, 'file not found'); return files.get(id); };
    return async (params = {}) => {
      calls.push({ method, params });
      if (apiHandlers[method]) return apiHandlers[method](params);
      if (method === 'sendMessage' || method === 'sendDocument') return { message_id: ++msgId, chat: { id: params.chat_id } };
      return true;
    };
  },
});

export class InputFile {
  constructor(bytes, name, opts = {}) { this.bytes = bytes; this.name = name; this.type = opts.type; }
}
export class FormData {
  constructor() { this.fields = []; }
  append(k, v) { this.fields.push([k, v]); }
}

export const fetchLog = [];
export const fetchRoutes = [];
export async function fetch(url, init = {}) {
  fetchLog.push({ url, init });
  const route = fetchRoutes.find((r) => url.includes(r.match));
  const body = route ? route.reply(url, init) : { error: 'no route' };
  const status = route ? route.status || 200 : 404;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status < 300, status, statusText: '', url, async json() { return JSON.parse(text); }, async text() { return text; } };
}
export class EndpointError extends Error {
  constructor(description, parameters = {}) { super(description); this.description = description; this.parameters = parameters; }
}
