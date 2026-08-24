const VIDEO_PATH = '/home-bg-v3.mp4';
const ANIMATED_BG_PATH = '/home-bg-v7.webp';
const BUILD_VERSION = 'home-menu-v7-ios-animated-webp';
const BUILD_LABEL = '● HOME V7 · iOS ANIMATED BG · CLOUDFLARE PREVIEW · MAIN НЕ ЗАТРОНУТ';

const VIDEO_FIX = `
<style id="video-fix-v7">
/* V7 · MP4 for regular browsers, animated WebP for iPhone/iPad Safari/WebView. */
.video-bg{background:#0b0b18!important}
#homeAnimatedBg{
  position:absolute!important;
  inset:0!important;
  width:100%!important;
  height:100%!important;
  object-fit:cover!important;
  object-position:center center!important;
  display:none!important;
  opacity:0!important;
  visibility:hidden!important;
  z-index:1!important;
  filter:saturate(1.04) contrast(1.02) brightness(1.04)!important;
  transform:scale(1.015)!important;
  pointer-events:none!important;
}
.video-bg video{
  position:absolute!important;
  inset:0!important;
  width:100%!important;
  height:100%!important;
  object-fit:cover!important;
  object-position:center center!important;
  display:block!important;
  opacity:1!important;
  visibility:visible!important;
  z-index:2!important;
  filter:saturate(1.02) contrast(1.02) brightness(1.02)!important;
  transform:scale(1.015)!important;
  pointer-events:none!important;
}
body.ios-animated-bg #homeAnimatedBg{
  display:block!important;
  opacity:1!important;
  visibility:visible!important;
}
body.ios-animated-bg .video-bg video{display:none!important;opacity:0!important;visibility:hidden!important}
.bg-fallback{z-index:0!important}
.video-bg:after{
  z-index:3!important;
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
@media (prefers-reduced-motion: reduce){
  body:not(.user-reduced-motion):not(.video-user-off).ios-animated-bg #homeAnimatedBg{display:block!important;opacity:1!important;visibility:visible!important}
}
</style>
<script id="video-fix-v7-script">
(()=>{
  const BUILD='${BUILD_VERSION}';
  const BUILD_LABEL='${BUILD_LABEL}';
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);

  document.documentElement.dataset.previewBuild=BUILD;
  document.documentElement.dataset.backgroundMode=isIOS?'animated-webp':'mp4';
  document.title='Библейские игры · Home V7 iOS Animated Background';
  const chip=document.querySelector('.preview-chip');
  if(chip){
    chip.textContent=BUILD_LABEL;
    chip.dataset.build=BUILD;
  }

  const bg=document.querySelector('.video-bg');
  const video=document.getElementById('homeVideo');
  const videoToggle=document.getElementById('videoToggle');
  const motionToggle=document.getElementById('motionToggle');

  let animatedBg=document.getElementById('homeAnimatedBg');
  if(bg && !animatedBg){
    animatedBg=document.createElement('img');
    animatedBg.id='homeAnimatedBg';
    animatedBg.alt='';
    animatedBg.setAttribute('aria-hidden','true');
    animatedBg.decoding='async';
    animatedBg.src='${ANIMATED_BG_PATH}?v=7';
    bg.insertBefore(animatedBg,bg.firstChild);
  }

  if(isIOS) document.body.classList.add('ios-animated-bg');

  const isUserStopped=()=>document.body.classList.contains('user-reduced-motion') || document.body.classList.contains('video-user-off');

  const syncToggles=()=>{
    document.body.classList.toggle('user-reduced-motion',!!motionToggle?.classList.contains('on'));
    document.body.classList.toggle('video-user-off',!!videoToggle && !videoToggle.classList.contains('on'));
    const stopped=isUserStopped();
    if(animatedBg) animatedBg.style.display=stopped?'none':'';
    if(video){
      if(stopped) video.pause();
      else if(!isIOS) ensureVideo();
    }
  };

  let retryTimer=0;
  const ensureVideo=()=>{
    if(!video || isIOS || isUserStopped() || document.hidden) return;
    const desiredSrc='${VIDEO_PATH}?v=7';
    if(video.src!==new URL(desiredSrc,location.href).href){
      video.querySelectorAll('source').forEach(s=>s.remove());
      video.src=desiredSrc;
      video.load();
    }
    video.muted=true;
    video.defaultMuted=true;
    video.autoplay=true;
    video.loop=true;
    video.playsInline=true;
    video.preload='auto';
    video.setAttribute('muted','');
    video.setAttribute('autoplay','');
    video.setAttribute('loop','');
    video.setAttribute('playsinline','');
    video.setAttribute('webkit-playsinline','');
    const p=video.play();
    if(p && typeof p.catch==='function'){
      p.catch(()=>{
        clearTimeout(retryTimer);
        retryTimer=setTimeout(()=>video.play().catch(()=>{}),350);
      });
    }
  };

  if(video && !isIOS){
    video.addEventListener('loadedmetadata',ensureVideo,{passive:true});
    video.addEventListener('canplay',ensureVideo,{passive:true});
    window.addEventListener('pageshow',ensureVideo,{passive:true});
    window.addEventListener('focus',ensureVideo,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden) ensureVideo()});
    document.addEventListener('touchstart',ensureVideo,{passive:true});
    document.addEventListener('pointerdown',ensureVideo,{passive:true});
  }

  videoToggle?.addEventListener('click',()=>setTimeout(syncToggles,0));
  motionToggle?.addEventListener('click',()=>setTimeout(syncToggles,0));
  syncToggles();
  if(!isIOS) requestAnimationFrame(ensureVideo);
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

async function serveVideo(request, env) {
  const assetUrl = new URL(VIDEO_PATH, request.url);
  const assetResponse = await env.ASSETS.fetch(new Request(assetUrl.toString(), {
    method: 'GET',
    headers: { 'accept': 'video/mp4' }
  }));
  if (!assetResponse.ok) return assetResponse;

  const bytes = await assetResponse.arrayBuffer();
  const size = bytes.byteLength;
  const baseHeaders = new Headers({
    'content-type': 'video/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'no-store, max-age=0',
    'pragma': 'no-cache',
    'expires': '0',
    'x-content-type-options': 'nosniff',
    'x-home-menu-video': 'range-v7',
    'x-home-menu-build': BUILD_VERSION
  });

  if (request.method === 'HEAD') {
    baseHeaders.set('content-length', String(size));
    return new Response(null, { status: 200, headers: baseHeaders });
  }

  const range = request.headers.get('range');
  if (!range) {
    baseHeaders.set('content-length', String(size));
    return new Response(bytes, { status: 200, headers: baseHeaders });
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match) {
    baseHeaders.set('content-range', `bytes */${size}`);
    return new Response(null, { status: 416, headers: baseHeaders });
  }

  let start;
  let end;
  if (match[1] === '' && match[2] !== '') {
    const suffix = Math.max(1, Number(match[2]));
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1] || 0);
    end = match[2] === '' ? size - 1 : Number(match[2]);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
    baseHeaders.set('content-range', `bytes */${size}`);
    return new Response(null, { status: 416, headers: baseHeaders });
  }
  end = Math.min(end, size - 1);
  const chunk = bytes.slice(start, end + 1);
  baseHeaders.set('content-range', `bytes ${start}-${end}/${size}`);
  baseHeaders.set('content-length', String(chunk.byteLength));
  return new Response(chunk, { status: 206, headers: baseHeaders });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/__preview_version') {
      return Response.json({
        version: BUILD_VERSION,
        label: BUILD_LABEL,
        iosBackground: 'animated-webp-v7',
        otherBackground: 'mp4-range-v7'
      }, {
        headers: {
          'cache-control': 'no-store, max-age=0',
          'pragma': 'no-cache',
          'expires': '0',
          'x-home-menu-build': BUILD_VERSION
        }
      });
    }

    if (url.pathname === ANIMATED_BG_PATH) {
      return serveStaticWithHeaders(request, env, ANIMATED_BG_PATH, 'image/webp', {
        'x-home-menu-animated-bg': 'webp-v7'
      });
    }

    if (url.pathname === VIDEO_PATH) {
      return serveVideo(request, env);
    }

    const response = await env.ASSETS.fetch(request);
    const type = response.headers.get('content-type') || '';

    if ((url.pathname === '/' || url.pathname === '/index.html') && type.includes('text/html')) {
      const html = await response.text();
      const body = html.includes('</body>')
        ? html.replace('</body>', `${VIDEO_FIX}</body>`)
        : `${html}${VIDEO_FIX}`;
      const headers = new Headers(response.headers);
      headers.set('content-type', 'text/html; charset=utf-8');
      headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
      headers.set('pragma', 'no-cache');
      headers.set('expires', '0');
      headers.set('surrogate-control', 'no-store');
      headers.set('x-home-menu-preview', 'animated-bg-v7');
      headers.set('x-home-menu-build', BUILD_VERSION);
      return new Response(body, { status: response.status, headers });
    }

    return response;
  },
};
