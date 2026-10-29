import type { ListingVideo } from './listingVideo';
export type FullscreenVideoOptions = { title?: string; topInset?: number; bottomInset?: number; muted?: boolean };
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const bounded = (n: number | undefined, max: number) => Math.max(0, Math.min(max, Number.isFinite(n) ? n! : 0));
const icons = {
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4ZM16 9l5 6m0-6-5 6"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
};
const svg = (path: string) => `<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${path}</svg>`;

/** One native-backed video fills a transparent stage over the original blurred poster. */
export function renderFullscreenVideo(video: ListingVideo, startAt: number, options: FullscreenVideoOptions): string {
  const top = bounded(options.topInset, 100) + 10, bottom = bounded(options.bottomInset, 100) + 18;
  return `<!doctype html><html data-aspect='unknown'><head><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1'>
<meta http-equiv='Content-Security-Policy' content="default-src 'none'; media-src https://storage.googleapis.com; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:white;overscroll-behavior:none}
#clip{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:transparent}.fill #clip{object-fit:cover}
#chrome{position:absolute;inset:0;transition:opacity .2s ease;pointer-events:none}#chrome.hidden{opacity:0}#chrome:focus-within{opacity:1}#chrome.hidden button,#chrome.hidden input{pointer-events:none}#chrome:focus-within button,#chrome:focus-within input{pointer-events:auto}
.top{position:absolute;top:0;left:0;right:0;padding:${top}px 16px 45px;display:flex;align-items:center;gap:10px;background:linear-gradient(rgba(0,0,0,.55),transparent)}
button{pointer-events:auto;display:flex;align-items:center;justify-content:center;min-width:44px;height:44px;border-radius:24px;border:1px solid rgba(255,255,255,.12);background:rgba(9,18,28,.62);color:white;font-size:13px;font-weight:600;touch-action:manipulation}button:focus-visible,input:focus-visible{outline:2px solid #8ed1ff;outline-offset:3px}button svg{width:23px;height:23px}#fit{margin-left:auto;padding:0 16px}#close{width:44px}
#play{position:absolute;top:50%;left:50%;width:68px;height:68px;transform:translate(-50%,-50%);border-radius:36px;background:rgba(5,12,20,.55)}#play svg{width:30px;height:30px}
.bottom{position:absolute;left:0;right:0;bottom:0;padding:55px 20px ${bottom}px;background:linear-gradient(transparent,rgba(0,0,0,.8))}h1{font-size:21px;line-height:1.25;margin:0 0 18px;font-weight:700;text-shadow:0 1px 4px black;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.progress{display:flex;align-items:center;gap:10px;font-variant-numeric:tabular-nums}.progress span{font-size:12px;min-width:32px;text-align:center;color:#edf3fa}input{pointer-events:auto;flex:1;min-width:0;min-height:44px;margin:0;accent-color:white;touch-action:pan-x}
#status{position:absolute;top:calc(50% + 48px);left:20px;right:20px;text-align:center;font-size:13px;text-shadow:0 1px 4px black}html[data-aspect='portrait'] .bottom{padding-top:85px}html[data-aspect='landscape'] h1{font-size:19px}#swipeHint{font-size:11px;color:#d2d9e2;text-align:center;margin-top:4px}
@media(prefers-reduced-motion:reduce){#chrome{transition:none}}@media(max-height:500px){h1{font-size:17px;-webkit-line-clamp:2;margin-bottom:0}.bottom{padding-top:20px!important}.top{padding-bottom:15px}#swipeHint{display:none}}
</style></head><body>
<video id='clip' playsinline autoplay ${options.muted === false ? '' : 'muted'} preload="none" disablepictureinpicture src='${video.url}'></video>
<div id='chrome'><div class='top'><button id='sound' aria-label='Turn video sound on'>${svg(icons.mute)}</button><button id='fit' aria-label='Fill screen, cropping edges' aria-pressed='false'>Fill screen</button><button id='close' aria-label='Close video'>${svg(icons.close)}</button></div>
<button id='play' aria-label='Pause video'>${svg(icons.pause)}</button><div id='status' role='status'></div>
<div class='bottom'><h1>${escapeHtml(options.title || '')}</h1><div class='progress'><span id='elapsed'>0:00</span><input id='seek' aria-label='Video progress' type='range' min='0' max='${video.durationSeconds}' step='0.05' value='0'><span id='remaining'>0:00</span></div><div id='swipeHint'>Swipe down to close</div></div></div>
<script>
const v=document.getElementById('clip'),chrome=document.getElementById('chrome'),play=document.getElementById('play'),sound=document.getElementById('sound'),fit=document.getElementById('fit'),seek=document.getElementById('seek'),status=document.getElementById('status');
const post=m=>window.ReactNativeWebView.postMessage(m),icons=${JSON.stringify(icons)},icon=p=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';
let timer=null,dragging=false,last=0,touch=null,suppressClick=0;
const format=n=>{n=Math.max(0,Math.floor(Number.isFinite(n)?n:0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0')};
function show(){chrome.classList.remove('hidden');clearTimeout(timer);if(!v.paused&&!v.ended&&!dragging)timer=setTimeout(()=>chrome.classList.add('hidden'),2600)}
function sync(){play.innerHTML=icon(v.paused||v.ended?icons.play:icons.pause);play.setAttribute('aria-label',v.ended?'Replay video':v.paused?'Resume video':'Pause video');sound.innerHTML=icon(v.muted?icons.mute:icons.sound);sound.setAttribute('aria-label',v.muted?'Turn video sound on':'Mute video');document.getElementById('elapsed').textContent=format(v.currentTime);document.getElementById('remaining').textContent=format((v.duration||${video.durationSeconds})-v.currentTime);if(!dragging)seek.value=v.currentTime;}
function progress(){post(JSON.stringify({type:'progress',seconds:v.currentTime}))}
function dismiss(){progress();v.pause();post('dismiss')}
function start(manual=false){if(manual)v.muted=false;if(v.ended)v.currentTime=0;v.play().catch(()=>{status.textContent='Tap play to start';show()})}
window.__listingVideoPause=()=>v.pause();document.getElementById('close').onclick=dismiss;
play.onclick=()=>{if(v.paused||v.ended)start(true);else v.pause();sync();show()};sound.onclick=()=>{v.muted=!v.muted;sync();show()};fit.onclick=()=>{const filled=document.body.classList.toggle('fill');fit.textContent=filled?'Fit frame':'Fill screen';fit.setAttribute('aria-pressed',String(filled));fit.setAttribute('aria-label',filled?'Fit entire video frame':'Fill screen, cropping edges');show()};
seek.oninput=()=>{dragging=true;const t=Number(seek.value);if(Number.isFinite(t))v.currentTime=Math.max(0,Math.min(v.duration||${video.durationSeconds},t));sync();show()};seek.onchange=()=>{dragging=false;progress();show()};
v.onclick=()=>{if(Date.now()<suppressClick)return;if(chrome.classList.contains('hidden'))show();else chrome.classList.add('hidden')};
v.addEventListener('loadedmetadata',()=>{v.currentTime=Math.min(${bounded(startAt, 60)},Math.max(0,v.duration-.1));seek.max=v.duration;const w=v.videoWidth,h=v.videoHeight,r=w/h;document.documentElement.dataset.aspect=r<.8?'portrait':r>1.2?'landscape':'square';post(JSON.stringify({type:'aspect',width:w,height:h,layout:document.documentElement.dataset.aspect}));sync()});
v.addEventListener('playing',()=>{status.textContent='';sync();show()});v.addEventListener('pause',()=>{sync();show()});v.addEventListener('ended',()=>{post('ended');sync();show()});v.addEventListener('volumechange',sync);v.addEventListener('timeupdate',()=>{sync();if(Date.now()-last>500){last=Date.now();progress()}});v.addEventListener('error',()=>post('error'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)v.pause()});
document.addEventListener('touchstart',e=>{touch=e.touches.length===1&&!e.target.closest('button,input')?{x:e.touches[0].clientX,y:e.touches[0].clientY,t:Date.now()}:null},{passive:true});
document.addEventListener('touchmove',e=>{if(!touch)return;const p=e.touches[0],dy=p.clientY-touch.y,dx=p.clientX-touch.x;if(dy>12&&dy>Math.abs(dx)*1.4)e.preventDefault()},{passive:false});
document.addEventListener('touchend',e=>{if(!touch||!e.changedTouches.length)return;const p=e.changedTouches[0],dy=p.clientY-touch.y,dx=p.clientX-touch.x;if(dy>90&&dy>Math.abs(dx)*1.5&&Date.now()-touch.t<1000){suppressClick=Date.now()+400;dismiss()}touch=null},{passive:true});
document.addEventListener('touchcancel',()=>{touch=null});document.addEventListener('keydown',e=>{if(e.key==='Escape')dismiss()});
v.muted=${options.muted !== false};sync();show();start();
</script></body></html>`;
}
