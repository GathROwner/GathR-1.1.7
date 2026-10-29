/** @jest-environment node */
import { videoPlayerHtml, type ListingVideo } from '../listingVideo';
const { JSDOM } = require('jsdom');
const clip: ListingVideo = { assetId: 'a'.repeat(64), url: `https://storage.googleapis.com/gathr-uploaded-images/listingvideos/${'a'.repeat(64)}.mp4`, bytes: 2000, durationSeconds: 12, sourcePostId: '123', expiresAt: '2099-01-01' };
function player(width = 1080, height = 1920, title = 'Concert') {
  const messages: string[] = []; const paused = new WeakMap();
  const dom = new JSDOM(videoPlayerHtml(clip, 3, { title, topInset: 48, bottomInset: 34 }), { runScripts: 'dangerously', beforeParse(w: any) {
    w.ReactNativeWebView = { postMessage: (m: string) => messages.push(m) };
    Object.defineProperties(w.HTMLMediaElement.prototype, { duration: { get: () => 12 }, paused: { get() { return paused.get(this) !== false; } } });
    Object.defineProperties(w.HTMLVideoElement.prototype, { videoWidth: { get: () => width }, videoHeight: { get: () => height } });
    w.HTMLMediaElement.prototype.play = function () { paused.set(this, false); this.dispatchEvent(new w.Event('playing')); return Promise.resolve(); };
    w.HTMLMediaElement.prototype.pause = function () { paused.set(this, true); this.dispatchEvent(new w.Event('pause')); };
  } });
  const w = dom.window, doc = w.document, video = doc.getElementById('clip');
  const swipe = (target: any, dx = 0, dy = 140) => {
    const start = new w.Event('touchstart', { bubbles: true }); Object.defineProperty(start, 'touches', { value: [{ clientX: 100, clientY: 100 }] }); target.dispatchEvent(start);
    const end = new w.Event('touchend', { bubbles: true }); Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 100 + dx, clientY: 100 + dy }] }); target.dispatchEvent(end);
  };
  return { dom, w, doc, video, messages, swipe };
}
describe('fullscreen listing video interaction', () => {
  it.each([[1080, 1920, 'portrait'], [1080, 1080, 'square'], [1920, 1080, 'landscape']])('adapts to actual %s x %s metadata as %s', (w, h, layout) => {
    const p = player(Number(w), Number(h)); try { p.video.dispatchEvent(new p.w.Event('loadedmetadata')); expect(p.doc.documentElement.dataset.aspect).toBe(layout); expect(p.video.currentTime).toBe(3); expect(p.doc.querySelectorAll('video')).toHaveLength(1); } finally { p.dom.window.close(); }
  });
  it('fills only on request and keeps the same media source/player through fit, pause, sound and seeking', () => {
    const p = player(); try {
      const src = p.video.src; expect(p.doc.body.classList.contains('fill')).toBe(false);
      p.doc.getElementById('fit').click(); expect(p.doc.body.classList.contains('fill')).toBe(true); expect(p.doc.getElementById('fit').textContent).toBe('Fit frame');
      p.doc.getElementById('fit').click(); expect(p.doc.body.classList.contains('fill')).toBe(false);
      p.doc.getElementById('play').click(); expect(p.video.paused).toBe(true); p.doc.getElementById('play').click(); expect(p.video.paused).toBe(false);
      const muted = p.video.muted; p.doc.getElementById('sound').click(); expect(p.video.muted).toBe(!muted);
      const seek = p.doc.getElementById('seek'); seek.value = '4'; seek.dispatchEvent(new p.w.Event('input')); seek.dispatchEvent(new p.w.Event('change')); expect(p.video.currentTime).toBe(4);
      expect(p.video.src).toBe(src); expect(p.doc.querySelectorAll('video')).toHaveLength(1);
    } finally { p.dom.window.close(); }
  });
  it('dismisses on a deliberate downward swipe, preserves playback position and ignores horizontal/control gestures', () => {
    const p = player(); try {
      p.swipe(p.video, 180, 30); p.swipe(p.doc.getElementById('seek')); p.swipe(p.doc.getElementById('sound')); expect(p.messages).not.toContain('dismiss');
      p.video.currentTime = 5; p.swipe(p.video); expect(p.messages).toContain('dismiss'); expect(p.video.paused).toBe(true);
      expect(p.messages.some(m => m.includes('progress') && JSON.parse(m).seconds === 5)).toBe(true);
    } finally { p.dom.window.close(); }
  });
  it('keeps a safe accessible close control and escapes event titles rather than executing markup', () => {
    const title = '</h1><script>window.bad=true</script>'; const p = player(1080, 1080, title);
    try { expect(p.doc.querySelector('h1').textContent).toBe(title); expect(p.w.bad).toBeUndefined(); p.doc.getElementById('close').click(); expect(p.messages).toContain('dismiss'); } finally { p.dom.window.close(); }
  });
});
