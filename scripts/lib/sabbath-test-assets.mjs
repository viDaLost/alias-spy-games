import fs from 'node:fs';

// Isolated Nile fixtures mount the game directory at /. Its shared policy
// remains a real part of the fixture, served from the canonical app sources.
const assets = new Map([
  ['/js/sabbath-clock.js', ['../../web/js/sabbath-clock.js', 'text/javascript; charset=utf-8']],
  ['/js/sabbath-access.js', ['../../web/js/sabbath-access.js', 'text/javascript; charset=utf-8']],
  ['/styles/sabbath-access.css', ['../../web/styles/sabbath-access.css', 'text/css; charset=utf-8']],
  ['/data/sabbath-cities.json', ['../../web/data/sabbath-cities.json', 'application/json; charset=utf-8']],
]);
export function serveSabbathTestAsset(request, response) {
  const asset = assets.get(new URL(request.url || '/', 'http://fixture.test').pathname);
  if (!asset) return false;
  response.writeHead(200, {'Content-Type':asset[1], 'Cache-Control':'no-store'});
  response.end(fs.readFileSync(new URL(asset[0], import.meta.url)));
  return true;
}
