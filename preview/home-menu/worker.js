const VIDEO_FIX = `
<style id="video-fix-v4">
/* VIDEO FIX V4: keep the requested live background visible on iOS/Safari. */
.video-bg video{
  opacity:1!important;
  visibility:visible!important;
}
/* The old preview hid video whenever iOS reported Reduce Motion.
   In this preview the explicit in-app toggle owns that behavior instead. */
@media (prefers-reduced-motion: reduce){
  body:not(.user-reduced-motion):not(.video-user-off) .video-bg video{
    display:block!important;
  }
}
/* Make the actual animation readable instead of burying it under a 93% mask. */
.video-bg:after{
  background:
    linear-gradient(180deg,
      rgba(9,9,24,.10) 0%,
      rgba(12,12,30,.17) 24%,
      rgba(12,13,31,.30) 58%,
      rgba(8,8,21,.54) 100%),
    radial-gradient(circle at 50% 7%,rgba(79,70,229,.08),transparent 44%)!important;
}
/* Keep glass panels legible while allowing more of the moving scene through. */
.hero{background:linear-gradient(135deg,rgba(52,46,116,.43),rgba(22,23,51,.39))!important}
.quick-action,.continue-card,.profile-block,.settings-card,.game-card{background:rgba(18,19,43,.45)!important}
.preview-chip{background:rgba(13,14,33,.34)!important}
</style>
<script id="video-fix-v4-script">
(()=>{
  const video=document.getElementById('homeVideo');
  const videoToggle=document.getElementById('videoToggle');
  const motionToggle=document.getElementById('motionToggle');
  if(!video) return;

  const desiredSrc='/home-bg-v3.mp4?v=4';
  const source=video.querySelector('source');
  if(source && source.getAttribute('src')!==desiredSrc){
    source.setAttribute('src',desiredSrc);
    video.load();
  }

  video.muted=true;
  video.defaultMuted=true;
  video.autoplay=true;
  video.loop=true;
  video.playsInline=true;
  video.setAttribute('muted','');
  video.setAttribute('autoplay','');
  video.setAttribute('loop','');
  video.setAttribute('playsinline','');
  video.setAttribute('webkit-playsinline','');
  video.preload='auto';

  const isUserStopped=()=>document.body.classList.contains('user-reduced-motion') || document.body.classList.contains('video-user-off');
  const ensureVideo=()=>{
    if(isUserStopped()) return;
    video.style.display='block';
    video.play().catch(()=>{});
  };

  const syncToggles=()=>{
    document.body.classList.toggle('user-reduced-motion',!!motionToggle?.classList.contains('on'));
    document.body.classList.toggle('video-user-off',!!videoToggle && !videoToggle.classList.contains('on'));
    if(!isUserStopped()) ensureVideo();
  };

  video.addEventListener('loadeddata',ensureVideo,{passive:true});
  video.addEventListener('canplay',ensureVideo,{passive:true});
  video.addEventListener('pause',()=>{ if(!isUserStopped() && !document.hidden) setTimeout(ensureVideo,120); });
  window.addEventListener('pageshow',ensureVideo,{passive:true});
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) ensureVideo(); });
  document.addEventListener('touchstart',ensureVideo,{passive:true,once:true});
  document.addEventListener('pointerdown',ensureVideo,{passive:true,once:true});

  videoToggle?.addEventListener('click',()=>setTimeout(syncToggles,0));
  motionToggle?.addEventListener('click',()=>setTimeout(syncToggles,0));

  syncToggles();
  ensureVideo();
})();
</script>`;

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const url = new URL(request.url);
    const type = response.headers.get('content-type') || '';

    if ((url.pathname === '/' || url.pathname === '/index.html') && type.includes('text/html')) {
      const html = await response.text();
      const body = html.includes('</body>')
        ? html.replace('</body>', `${VIDEO_FIX}</body>`)
        : `${html}${VIDEO_FIX}`;
      const headers = new Headers(response.headers);
      headers.set('content-type', 'text/html; charset=utf-8');
      headers.set('cache-control', 'no-store, max-age=0');
      headers.set('x-home-menu-preview', 'video-fix-v4');
      return new Response(body, { status: response.status, headers });
    }

    return response;
  },
};
