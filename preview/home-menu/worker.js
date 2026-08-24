const VIDEO_PATH = '/home-bg-v3.mp4';

const VIDEO_FIX = `
<style id="video-fix-v5">
/* VIDEO FIX V5 · iOS/Safari delivery + playback */
.video-bg{background:#0b0b18!important}
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
  z-index:1!important;
  filter:saturate(1.02) contrast(1.02) brightness(1.02)!important;
  transform:scale(1.015)!important;
  pointer-events:none!important;
}
.bg-fallback{z-index:0!important}
.video-bg:after{
  z-index:2!important;
  background:
    linear-gradient(180deg,
      rgba(8,8,22,.04) 0%,
      rgba(10,10,27,.09) 24%,
      rgba(10,11,28,.19) 58%,
      rgba(7,7,19,.40) 100%),
    radial-gradient(circle at 50% 7%,rgba(79,70,229,.05),transparent 44%)!important;
}
.hero{background:linear-gradient(135deg,rgba(52,46,116,.39),rgba(22,23,51,.35))!important}
.quick-action,.continue-card,.profile-block,.settings-card,.game-card{background:rgba(18,19,43,.40)!important}
.preview-chip{background:rgba(13,14,33,.30)!important}
@media (prefers-reduced-motion: reduce){
  body:not(.user-reduced-motion):not(.video-user-off) .video-bg video{display:block!important}
}
</style>
<script id="video-fix-v5-script">
(()=>{
  const video=document.getElementById('homeVideo');
  const videoToggle=document.getElementById('videoToggle');
  const motionToggle=document.getElementById('motionToggle');
  if(!video) return;

  const desiredSrc='/home-bg-v3.mp4?v=5';
  video.querySelectorAll('source').forEach(s=>s.remove());
  video.src=desiredSrc;
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
  video.setAttribute('disablepictureinpicture','');

  const isUserStopped=()=>document.body.classList.contains('user-reduced-motion') || document.body.classList.contains('video-user-off');
  let retryTimer=0;
  const ensureVideo=()=>{
    if(isUserStopped() || document.hidden) return;
    video.style.display='block';
    video.muted=true;
    const p=video.play();
    if(p && typeof p.catch==='function'){
      p.catch(()=>{
        clearTimeout(retryTimer);
        retryTimer=setTimeout(()=>{
          if(!isUserStopped() && !document.hidden){
            video.muted=true;
            video.play().catch(()=>{});
          }
        },350);
      });
    }
  };

  const syncToggles=()=>{
    document.body.classList.toggle('user-reduced-motion',!!motionToggle?.classList.contains('on'));
    document.body.classList.toggle('video-user-off',!!videoToggle && !videoToggle.classList.contains('on'));
    if(isUserStopped()) video.pause(); else ensureVideo();
  };

  video.addEventListener('loadedmetadata',ensureVideo,{passive:true});
  video.addEventListener('loadeddata',ensureVideo,{passive:true});
  video.addEventListener('canplay',ensureVideo,{passive:true});
  video.addEventListener('stalled',()=>setTimeout(ensureVideo,250),{passive:true});
  video.addEventListener('suspend',()=>setTimeout(ensureVideo,250),{passive:true});
  window.addEventListener('pageshow',ensureVideo,{passive:true});
  window.addEventListener('focus',ensureVideo,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) ensureVideo()});
  document.addEventListener('touchstart',ensureVideo,{passive:true});
  document.addEventListener('pointerdown',ensureVideo,{passive:true});
  document.addEventListener('click',ensureVideo,{passive:true});
  videoToggle?.addEventListener('click',()=>setTimeout(syncToggles,0));
  motionToggle?.addEventListener('click',()=>setTimeout(syncToggles,0));

  video.load();
  syncToggles();
  requestAnimationFrame(ensureVideo);
})();
</script>`;

async function serveVideo(request, env) {
  // Fetch the full static asset without forwarding Safari's Range header,
  // then implement byte ranges explicitly. This makes iOS/Safari media loading deterministic.
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
    'cache-control': 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
    'x-home-menu-video': 'range-v5'
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
      headers.set('cache-control', 'no-store, max-age=0');
      headers.set('x-home-menu-preview', 'video-fix-v5');
      return new Response(body, { status: response.status, headers });
    }

    return response;
  },
};
