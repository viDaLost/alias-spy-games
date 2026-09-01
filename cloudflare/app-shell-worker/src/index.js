// Витрина приложения.
//
// На iPhone своего приложения нет, а ярлык на главный экран Safari создаёт
// только для открытого в нём сайта — и показывает его адрес. Приложение лежит
// на GitHub Pages, и адрес vidalost.github.io виден и в адресной строке, и при
// установке, и потом в списке приложений телефона.
//
// Этот воркер отдаёт ровно те же файлы под своим адресом: забирает их с Pages и
// пересылает дальше. Ничего не переписывает и не подставляет — ссылки внутри
// приложения относительные, и от корня они работают так же, как из подкаталога.
//
// Два экземпляра приложения (в Telegram и по ярлыку) живут на разных адресах, а
// значит и хранилища у них разные. Прогресс связывается входом по коду из бота:
// после него оба показывают один и тот же профиль.

const UPSTREAM = 'https://vidalost.github.io/alias-spy-games';

// Что кешировать и как долго. Бандлы приложения содержат хеш содержимого в
// имени и не меняются никогда; index.html и работник обязаны приезжать свежими,
// иначе установленное приложение застрянет на старой сборке.
const IMMUTABLE = /\/web\/(?:dist|assets)\//;
const NEVER_CACHE = /^\/(?:index\.html)?$|^\/sw\.js$|^\/manifest\.webmanifest$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: securityHeaders() });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: securityHeaders() });
    }

    // Одностраничное приложение: путей, кроме файлов, у него нет.
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const upstream = `${UPSTREAM}${pathname}${url.search}`;

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}${pathname}`, { method: 'GET' });
    const cacheable = IMMUTABLE.test(pathname) && !NEVER_CACHE.test(pathname);

    if (cacheable) {
      const hit = await cache.match(cacheKey);
      if (hit) return withHeaders(hit, pathname, 'hit');
    }

    let response;
    try {
      response = await fetch(upstream, {
        method: request.method,
        headers: { Accept: request.headers.get('Accept') || '*/*', 'User-Agent': 'BibleGames-App-Shell/1' },
        redirect: 'follow',
      });
    } catch {
      return new Response('Приложение временно недоступно. Попробуйте ещё раз.', {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders() },
      });
    }

    if (!response.ok) {
      return new Response(response.status === 404 ? 'Страница не найдена' : 'Приложение временно недоступно',
        { status: response.status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders() } });
    }

    const decorated = withHeaders(response, pathname, 'miss');
    if (cacheable) ctx.waitUntil(cache.put(cacheKey, decorated.clone()));
    return decorated;
  },
};

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

function withHeaders(response, pathname, state) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders())) headers.set(name, value);

  // Работнику нужен корневой охват: он лежит в корне и должен управлять всем
  // приложением, а не только своей папкой.
  if (pathname === '/sw.js') headers.set('Service-Worker-Allowed', '/');

  if (NEVER_CACHE.test(pathname)) headers.set('Cache-Control', 'no-cache, must-revalidate');
  else if (IMMUTABLE.test(pathname)) headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  else headers.set('Cache-Control', 'public, max-age=300');

  headers.set('X-App-Shell', state);
  // Заголовки Pages, по которым узнаётся источник, дальше не идут.
  for (const name of ['server', 'x-github-request-id', 'x-served-by', 'x-fastly-request-id', 'via', 'x-cache', 'x-cache-hits', 'x-timer']) {
    headers.delete(name);
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
