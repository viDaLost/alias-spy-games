const VIDEO_PATH = '/home-bg-v11.mp4';
const BUILD_VERSION = 'home-menu-v11-ios-safe-video';
const BUILD_LABEL = '● HOME V11 · iOS SAFE VIDEO · CLOUDFLARE PREVIEW · MAIN НЕ ЗАТРОНУТ';

const BG_FIX = `
<style id="background-fix-v11">
.video-bg{
  background:#0b0b18!important;
}
#homeVideo{
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
  filter:saturate(1.12) contrast(1.04) brightness(1.12)!important;
  transform:scale(1.02)!important;
  pointer-events:none!important;
}
#homeAnimatedBg{display:none!important}
.bg-fallback{z-index:0!important;opacity:.06!important}
.video-bg:after{
  z-index:2!important;
  background:
    linear-gradient(180deg,rgba(7,8,20,.02) 0%,rgba(8,9,24,.06) 25%,rgba(9,10,27,.16) 58%,rgba(7,7,18,.34) 100%),
    radial-gradient(circle at 50% 8%,rgba(79,70,229,.04),transparent 45%)!important;
}
.hero{background:linear-gradient(135deg,rgba(52,46,116,.30),rgba(22,23,51,.26))!important}
.quick-action,.continue-card,.profile-block,.settings-card,.game-card{background:rgba(18,19,43,.32)!important}
.preview-chip{background:rgba(13,14,33,.22)!important}
body.video-user-off #homeVideo{display:none!important}
</style>
<script id="background-fix-v11-script">
(()=>{
  const BUILD='${BUILD_VERSION}';
  const BUILD_LABEL='${BUILD_LABEL}';
  const SRC='${VIDEO_PATH}?v=11';
  document.documentElement.dataset.previewBuild=BUILD;
  document.documentElement.dataset.backgroundMode='ios-safe-h264-v11';
  document.title='Библейские игры · Home V11 iOS Safe Video';

  const chip=document.querySelector('.preview-chip');
  if(chip){ chip.textContent=BUILD_LABEL; chip.dataset.build=BUILD; }

  const bg=document.querySelector('.video-bg');
  let video=document.getElementById('homeVideo');
  const videoToggle=document.getElementById('videoToggle');

  document.getElementById('homeAnimatedBg')?.remove();

  if(bg && !video){
    video=document.createElement('video');
    video.id='homeVideo';
    bg.insertBefore(video,bg.firstChild);
  }

  if(video){
    video.controls=false;
    video.autoplay=true;
    video.loop=true;
    video.muted=true;
    video.defaultMuted=true;
    video.playsInline=true;
    video.preload='auto';
    video.setAttribute('autoplay','');
    video.setAttribute('loop','');
    video.setAttribute('muted','');
    video.setAttribute('playsinline','');
    video.setAttribute('webkit-playsinline','');
    video.setAttribute('disablepictureinpicture','');
    video.querySelectorAll('source').forEach(s=>s.remove());
    video.src=SRC;
    try{video.load()}catch(_){ }
  }

  const play=()=>{
    if(!video || document.body.classList.contains('video-user-off')) return;
    try{
      video.muted=true;
      video.defaultMuted=true;
      const p=video.play();
      if(p && typeof p.catch==='function') p.catch(()=>{});
    }catch(_){ }
  };

  const syncToggle=()=>{
    const off=!!videoToggle && !videoToggle.classList.contains('on');
    document.body.classList.toggle('video-user-off',off);
    if(off){ try{video?.pause()}catch(_){ } } else play();
  };

  video?.addEventListener('loadeddata',play,{passive:true});
  video?.addEventListener('canplay',play,{passive:true});
  window.addEventListener('pageshow',()=>setTimeout(play,50),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(play,50)},{passive:true});
  document.addEventListener('touchstart',play,{passive:true,once:true});
  document.addEventListener('pointerdown',play,{passive:true,once:true});
  videoToggle?.addEventListener('click',()=>setTimeout(syncToggle,0));
  syncToggle();
  requestAnimationFrame(()=>setTimeout(play,80));
})();
</script>`;

function parseRange(value, size) {
  if (!value || !value.startsWith('bytes=')) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.slice(6).trim());
  if (!match) return null;
  let start;
  let end;
  if (match[1] === '' && match[2] !== '') {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Number(match[2]);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
  return {start, end: Math.min(end, size - 1)};
}

async function serveVideo(request, env) {
  const assetUrl = new URL(VIDEO_PATH, request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl.toString(), {method:'GET'}));
  if (!asset.ok) return asset;
  const bytes = await asset.arrayBuffer();
  const size = bytes.byteLength;
  const headers = new Headers();
  headers.set('content-type','video/mp4');
  headers.set('accept-ranges','bytes');
  headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma','no-cache');
  headers.set('expires','0');
  headers.set('x-home-menu-build',BUILD_VERSION);
  headers.set('x-home-menu-video','ios-safe-h264-v11');

  const range = parseRange(request.headers.get('range'), size);
  if (request.headers.has('range') && !range) {
    headers.set('content-range',`bytes */${size}`);
    return new Response(null,{status:416,headers});
  }
  if (range) {
    const body = bytes.slice(range.start, range.end + 1);
    headers.set('content-range',`bytes ${range.start}-${range.end}/${size}`);
    headers.set('content-length',String(body.byteLength));
    return new Response(request.method === 'HEAD' ? null : body,{status:206,headers});
  }
  headers.set('content-length',String(size));
  return new Response(request.method === 'HEAD' ? null : bytes,{status:200,headers});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/__preview_version') {
      return Response.json({
        version:BUILD_VERSION,
        label:BUILD_LABEL,
        background:'ios-safe-h264-v11',
        autoplayRequired:true,
        source:'user-original-upload',
        video:{codec:'H.264 Constrained Baseline',fps:8,durationSeconds:10}
      },{headers:{
        'cache-control':'no-store, max-age=0',
        'pragma':'no-cache',
        'expires':'0',
        'x-home-menu-build':BUILD_VERSION
      }});
    }

    if (url.pathname === VIDEO_PATH) return serveVideo(request,env);

    const response = await env.ASSETS.fetch(request);
    const type = response.headers.get('content-type') || '';
    if ((url.pathname === '/' || url.pathname === '/index.html') && type.includes('text/html')) {
      const html = await response.text();
      const body = html.includes('</body>') ? html.replace('</body>',`${BG_FIX}</body>`) : `${html}${BG_FIX}`;
      const headers = new Headers(response.headers);
      headers.set('content-type','text/html; charset=utf-8');
      headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');
      headers.set('pragma','no-cache');
      headers.set('expires','0');
      headers.set('surrogate-control','no-store');
      headers.set('x-home-menu-preview','ios-safe-h264-v11');
      headers.set('x-home-menu-build',BUILD_VERSION);
      return new Response(body,{status:response.status,headers});
    }
    return response;
  },
};
