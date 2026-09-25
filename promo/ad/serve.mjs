// Статический сервер корня репозитория для съёмки: игры открываются так же,
// как в приложении, — с теми же файлами, путями и заголовками типов.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.gif', 'image/gif'],
  ['.glb', 'model/gltf-binary'], ['.gltf', 'model/gltf+json'], ['.obj', 'text/plain'], ['.woff2', 'font/woff2'], ['.woff', 'font/woff'],
  ['.ttf', 'font/ttf'], ['.mp3', 'audio/mpeg'], ['.ogg', 'audio/ogg'], ['.wav', 'audio/wav'], ['.webmanifest', 'application/manifest+json'],
  ['.ktx2', 'image/ktx2'], ['.wasm', 'application/wasm'],
]);

export async function serve(root) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (file.endsWith(path.sep) || (fs.existsSync(file) && fs.statSync(file).isDirectory())) file = path.join(file, 'index.html');
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME.get(path.extname(file).toLowerCase()) || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}
