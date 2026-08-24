const ANIM_PATH = '/home-bg-original-v10.webp';
const BUILD_VERSION = 'home-menu-v10-original-animated-webp';
const BUILD_LABEL = '● HOME V10 · ORIGINAL ANIM BG · CLOUDFLARE PREVIEW · MAIN НЕ ЗАТРОНУТ';

const BG_FIX = `
<style id="background-fix-v10">
.video-bg{
  background:#0b0b18 url('${ANIM_PATH}?v=10') center center/cover no-repeat!important;
}
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
  filter:saturate(1.08) contrast(1.03) brightness(1.08)!important;
  transform:scale(1.015)!important;
  pointer-events:none!important;
}
.video-bg video{display:none!important;opacity:0!important;visibility:hidden!important}
.bg-fallback{z-index:0!important;opacity:.08!important}
.video-bg:after{
  z-index:2!important;
  background:
    linear-gradient(180deg,rgba(7,8,20,.02) 0%,rgba(8,9,24,.05) 25%,rgba(9,10,27,.13) 58%,rgba(7,7,18,.31) 100%),
    radial-gradient(circle at 50% 8%,rgba(79,70,229,.035),transparent 45%)!important;
}
.hero{background:linear-gradient(135deg,rgba(52,46,116,.32),rgba(22,23,51,.28))!important}
.quick-action,.continue-card,.profile-block,.settings-card,.game-card{background:rgba(18,19,43,.34)!important}
.preview-chip{background:rgba(13,14,33,.23)!important}
body.video-user-off #homeAnimatedBg{display:none!important}
</style>
<script id="background-fix-v10-script">
(()=>{
  const BUILD='${BUILD_VERSION}';
  const BUILD_LABEL='${BUILD_LABEL}';
  document.documentElement.dataset.previewBuild=BUILD;
  document.documentElement.dataset.backgroundMode='original-animated-webp';
  document.title='Библейские игры · Home V10 Original Animated Background';

  const chip=document.querySelector('.preview-chip');
  if(chip){ chip.textContent=BUILD_LABEL; chip.dataset.build=BUILD; }

  const bg=document.querySelector('.video-bg');
  const video=document.getElementById('homeVideo');
  const videoToggle=document.getElementById('videoToggle');

  if(video){
    try{video.pause()}catch(_){ }
    video.removeAttribute('src');
    video.querySelectorAll('source').forEach(s=>s.remove());
  }

  let animatedBg=document.getElementById('homeAnimatedBg');
  if(bg && !animatedBg){
    animatedBg=document.createElement('img');
    animatedBg.id='homeAnimatedBg';
    animatedBg.alt='';
    animatedBg.setAttribute('aria-hidden','true');
    animatedBg.decoding='async';
    animatedBg.fetchPriority='high';
    animatedBg.src='${ANIM_PATH}?v=10';
    bg.insertBefore(animatedBg,bg.firstChild);
  }

  const syncToggle=()=>{
    document.body.classList.toggle('video-user-off',!!videoToggle && !videoToggle.classList.contains('on'));
  };
  videoToggle?.addEventListener('click',()=>setTimeout(syncToggle,0));
  syncToggle();
})();
</script>`;

async function serveAnimatedBg(request, env) {
  const assetUrl = new URL(ANIM_PATH, request.url);
  const response = await env.ASSETS.fetch(new Request(assetUrl.toString(), {method:'GET'}));
  if (!response.ok) return response;
  const headers = new Headers(response.headers);
  headers.set('content-type','image/webp');
  headers.set('cache-control','no-store, max-age=0');
  headers.set('pragma','no-cache');
  headers.set('expires','0');
  headers.set('x-home-menu-build',BUILD_VERSION);
  headers.set('x-home-menu-animated-bg','original-webp-v10');
  return new Response(request.method === 'HEAD' ? null : response.body,{status:response.status,headers});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/__preview_version') {
      return Response.json({
        version:BUILD_VERSION,
        label:BUILD_LABEL,
        background:'original-animated-webp-v10',
        autoplayRequired:false,
        source:'user-original-upload'
      },{headers:{
        'cache-control':'no-store, max-age=0',
        'pragma':'no-cache',
        'expires':'0',
        'x-home-menu-build':BUILD_VERSION
      }});
    }

    if (url.pathname === ANIM_PATH) return serveAnimatedBg(request,env);

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
      headers.set('x-home-menu-preview','original-animated-webp-v10');
      headers.set('x-home-menu-build',BUILD_VERSION);
      return new Response(body,{status:response.status,headers});
    }
    return response;
  },
};
