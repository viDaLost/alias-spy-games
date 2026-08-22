import fs from 'node:fs';

const files = [
  'cloudflare/quartet-worker/src/index-admin-observer-v2.js',
  'cloudflare/bible-sketch-worker/src/index-admin-observer-v2.js',
];

function assert(condition, message) {
  if (!condition) throw new Error(`Admin observer CORS check failed: ${message}`);
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const routeIndex = source.indexOf("if (!match) return baseWorker.fetch(request, env, ctx);");
  const optionsIndex = source.indexOf("if (request.method === 'OPTIONS')");
  const bearerIndex = source.indexOf('const hasBearer =');

  assert(routeIndex >= 0, `${file}: observer route guard missing`);
  assert(optionsIndex > routeIndex, `${file}: OPTIONS must be handled after observer route matching`);
  assert(bearerIndex > optionsIndex, `${file}: CORS preflight must be handled before Bearer authentication`);
  assert(source.includes("return new Response(null, { status: 204, headers: cors });"), `${file}: successful preflight must return 204`);
  assert(source.includes("if (!isAllowedOrigin(request, env)) return json({ ok: false, error: 'Origin not allowed' }, 403, cors);"), `${file}: preflight must reject untrusted origins`);
  assert(source.includes("'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match'"), `${file}: preflight must allow Authorization and If-None-Match`);
  assert(source.includes("'Access-Control-Allow-Methods': 'GET,OPTIONS'"), `${file}: preflight must allow GET and OPTIONS`);
  assert(source.includes("'Access-Control-Expose-Headers': 'ETag'"), `${file}: observer must expose ETag`);
  assert(source.includes("'Access-Control-Max-Age': '600'"), `${file}: preflight response should be cached briefly`);
}

console.log('Admin observer CORS preflight ordering and headers are valid for Quartet and Bible Sketch.');
