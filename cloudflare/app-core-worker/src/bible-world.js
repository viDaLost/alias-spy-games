import { accessError, isMainAdmin } from './app-access-auth.js';

export async function serveBibleWorld(path, scene, userId, env, cors) {
  if (!isMainAdmin(userId, env)) {
    throw accessError(403, '«Где я в Библии?» доступна только главному администратору', 'BIBLE_WORLD_ADMIN_ONLY');
  }
  const headers = new Headers({ ...cors, 'Cache-Control': 'no-store' });
  if (path === '/bible-world/access') return new Response(null, { status: 204, headers });
  if (typeof scene !== 'string' || !/^[a-z0-9-]{1,80}-4k\.webp$/.test(scene)) {
    throw accessError(404, 'Панорама не найдена');
  }

  const asset = await env.BIBLE_WORLD.fetch('https://bible-world.internal/' + scene);
  if (asset.status === 404) throw accessError(404, 'Панорама не найдена');
  if (!asset.ok || !asset.headers.get('Content-Type')?.startsWith('image/webp')) {
    throw accessError(503, 'Панорама временно недоступна');
  }
  headers.set('Content-Type', 'image/webp');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(asset.body, { headers });
}
