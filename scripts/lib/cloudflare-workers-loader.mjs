// Подменяет модуль «cloudflare:workers» на заглушку, чтобы воркеры Cloudflare
// можно было запускать в обычном node.
//
// Иначе Durable Object проверить нечем: класс комнаты живёт в модуле, который
// без этой подмены не импортируется вовсе, и всё, что о нём можно сказать, —
// это то, что видно в исходнике регулярным выражением. Сроки жизни комнаты
// такой проверкой не докажешь: там важно, что именно решит будильник.

const STUB = 'data:text/javascript,'
  + encodeURIComponent('export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n'
    + 'export class WorkerEntrypoint {}\n');

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: STUB, shortCircuit: true };
  return nextResolve(specifier, context);
}
