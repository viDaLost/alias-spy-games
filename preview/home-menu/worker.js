const VIDEO_PATH = '/home-bg-v3.mp4';
const GIF_PATH = '/home-bg-v8.gif';
const BUILD_VERSION = 'home-menu-v8-gif-background';
const BUILD_LABEL = '● HOME V8 · GIF BG · CLOUDFLARE PREVIEW · MAIN НЕ ЗАТРОНУТ';

const BG_FIX = `
<style id="background-fix-v8">
/* V8 · deterministic animated GIF background. No autoplay/video restrictions. */
.video-bg{background:#0b0b18!important}
#homeAnimatedBg{
  position:absolute!important;
  inset:0!important;
  width:100%!important;
  height:100%!important;
  object-fit:cover!important;
  object-position:center center!important;
  display:block!important;
  opacity:1!important;
  visibility:visible!important;
  z-index:1!important;
  filter:saturate(1.04) contrast(1.02) brightness(1.04)!important;
  transform:scale(1.015)!important;
  pointer-events:none!important;
}
.video-bg video{display:none!important;opacity:0!important;visibility:hidden!important}
.bg-fallback{z-index:0!important}
.video-bg:after{
  z-index:2!important;
  background:
    linear-gradient(180deg,
      rgba(8,8,22,.03) 0%,
      rgba(10,10,27,.07) 24%,
      rgba(10,11,28,.16) 58%,
      rgba(7,7,19,.35) 100%),
    radial-gradient(circle at 50% 7%,rgba(79,70,229,.04),transparent 44%)!important;
}
.hero{background:linear-gradient(135deg,rgba(52,46,116,.37),rgba(22,23,51,.33))!important}
.quick-action,.continue-card,.profile-block,.settings-card,.game-card{background:rgba(18,19,43,.38)!important}
.preview-chip{background:rgba(13,14,33,.27)!important}
body.video-user-off #homeAnimatedBg,
body.user-reduced-motion #homeAnimatedBg{display:none!important}
</style>
<script id="background-fix-v8-script">
(()=>{
  const BUILD='${BUILD_VERSION}';
  const BUILD_LABEL='${BUILD_LABEL}';
  document.documentElement.dataset.previewBuild=BUILD;
  document.documentElement.dataset.backgroundMode='gif';
  document.title='Библейские игры · Home V8 GIF Background';

  const chip=document.querySelector('.preview-chip');
  if(chip){
    chip.textContent=BUILD_LABEL;
    chip.dataset.build=BUILD;
  }

  const bg=document.querySelector('.video-bg');
  const video=document.getElementById('homeVideo');
  const videoToggle=document.getElementById('videoToggle');
  const motionToggle=document.getElementById('motionToggle');

  if(video){
    try{video.pause()}catch(_){ }
    video.removeAttribute('src');
    video.querySelectorAll('source').forEach(s=>s.remove());
    video.load?.();
  }

  let animatedBg=document.getElementById('homeAnimatedBg');
  if(bg && !animatedBg){
    animatedBg=document.createElement('img');
    animatedBg.id='homeAnimatedBg';
    animatedBg.alt='';
    animatedBg.setAttribute('aria-hidden','true');
    animatedBg.decoding='async';
    animatedBg.fetchPriority='high';
    animatedBg.src='${GIF_PATH}?v=8';
    bg.insertBefore(animatedBg,bg.firstChild);
  }

  const syncToggles=()=>{
    document.body.classList.toggle('user-reduced-motion',!!motionToggle?.classList.contains('on'));
    document.body.classList.toggle('video-user-off',!!videoToggle && !videoToggle.classList.contains('on'));
  };

  videoToggle?.addEventListener('click',()=>setTimeout(syncToggles,0));
  motionToggle?.addEventListener('click',()=>setTimeout(syncToggles,0));
  syncToggles();
})();
</script>`;

async function serveStaticWithHeaders(request, env, path, contentType, extraHeaders = {}) {
  const assetUrl = new URL(path, request.url);
  const assetResponse = await env.ASSETS.fetch(new Request(assetUrl.toString(), { method: 'GET' }));
  if (!assetResponse.ok) return assetResponse;
  const headers = new Headers(assetResponse.headers);
  headers.set('content-type', contentType);
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  headers.set('x-home-menu-build', BUILD_VERSION);
  for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  return new Response(request.method === 'HEAD' ? null : assetResponse.body, { status: assetResponse.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/__preview_version') {
      return Response.json({
        version: BUILD_VERSION,
        label: BUILD_LABEL,
        background: 'gif-v8',
        videoDisabled: true
      }, {
        headers: {
          'cache-control': 'no-store, max-age=0',
          'pragma': 'no-cache',
          'expires': '0',
          'x-home-menu-build': BUILD_VERSION
        }
      });
    }

    if (url.pathname === GIF_PATH) {
      return serveStaticWithHeaders(request, env, GIF_PATH, 'image/gif', {
        'x-home-menu-animated-bg': 'gif-v8'
      });
    }

    if (url.pathname === VIDEO_PATH) {
      return serveStaticWithHeaders(request, env, VIDEO_PATH, 'video/mp4', {
        'x-home-menu-video': 'disabled-in-ui-v8'
      });
    }

    const response = await env.ASSETS.fetch(request);
    const type = response.headers.get('content-type') || '';

    if ((url.pathname === '/' || url.pathname === '/index.html') && type.includes('text/html')) {
      const html = await response.text();
      const body = html.includes('</body>')
        ? html.replace('</body>', `${BG_FIX}</body>`)
        : `${html}${BG_FIX}`;
      const headers = new Headers(response.headers);
      headers.set('content-type', 'text/html; charset=utf-8');
      headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
      headers.set('pragma', 'no-cache');
      headers.set('expires', '0');
      headers.set('surrogate-control', 'no-store');
      headers.set('x-home-menu-preview', 'gif-background-v8');
      headers.set('x-home-menu-build', BUILD_VERSION);
      return new Response(body, { status: response.status, headers });
    }

    return response;
  },
};
