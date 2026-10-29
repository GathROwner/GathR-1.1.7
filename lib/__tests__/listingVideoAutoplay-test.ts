import { ListingVideoAutoplay, videoVisibility, type VideoCandidate } from '../listingVideoAutoplay';
import { inlineVideoHtml } from '../listingVideo';
const candidate = (patch: Partial<VideoCandidate> = {}): VideoCandidate => ({ assetId: 'clip', surface: 'detail',
  visible: true, settledAt: Date.now(), distance: 0, enabled: true, paused: false, ...patch });
describe('poster-first listing video coordination', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-29T18:00:00Z')); });
  afterEach(() => jest.useRealTimers());
  it('requires the complete poster dwell and resets it when scrolling', () => {
    const c = new ListingVideoAutoplay(), notify = jest.fn(); c.setScope('events', true);
    c.update('a', candidate({ surface: 'events' }), notify); jest.advanceTimersByTime(999); c.evaluate(); expect(notify).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1); c.evaluate(); expect(notify).toHaveBeenLastCalledWith(true);
    c.motion('events'); expect(notify).toHaveBeenLastCalledWith(false);
    jest.advanceTimersByTime(999); c.evaluate(); expect(notify).toHaveBeenLastCalledWith(false);
    jest.advanceTimersByTime(1); c.evaluate(); expect(notify).toHaveBeenLastCalledWith(true);
  });
  it('elects one player, blocks the covered feed and transfers to a visible detail', () => {
    const c = new ListingVideoAutoplay(), feed = jest.fn(), detail = jest.fn(); c.setScope('events', true);
    c.update('a', candidate({ surface: 'events' }), feed); jest.advanceTimersByTime(1000); c.evaluate();
    c.detail('overlay', true); expect(feed).toHaveBeenLastCalledWith(false);
    c.update('b', candidate(), detail); jest.advanceTimersByTime(1000); c.evaluate(); expect(detail).toHaveBeenLastCalledWith(true);
    c.setFullscreen('b', true); expect(detail).toHaveBeenLastCalledWith(false);
    c.setFullscreen('b', false); c.evaluate(); expect(detail).toHaveBeenLastCalledWith(false);
  });
  it('never starts hidden, disabled, unfocused or paused candidates', () => {
    const c = new ListingVideoAutoplay(), notify = jest.fn();
    for (const patch of [{ visible: false }, { enabled: false }, { paused: true }, { surface: 'events' as const }]) {
      c.update('a', candidate(patch), notify); jest.advanceTimersByTime(3000); c.evaluate();
    }
    expect(notify).not.toHaveBeenCalled();
  });
  it('holds a finished poster while on screen and replays after actual scroll-away/return', () => {
    const c = new ListingVideoAutoplay(), notify = jest.fn(); c.update('a', candidate({ onScreen: true }), notify);
    jest.advanceTimersByTime(1000); c.evaluate(); c.complete('clip'); expect(notify).toHaveBeenLastCalledWith(false);
    jest.advanceTimersByTime(5000); c.evaluate(); expect(c.hasFinished('clip')).toBe(true);
    c.update('a', candidate({ visible: false, onScreen: true }), notify); expect(c.hasFinished('clip')).toBe(true);
    c.update('a', candidate({ visible: false, onScreen: false }), notify); expect(c.hasFinished('clip')).toBe(false);
    c.update('a', candidate({ onScreen: true }), notify); jest.advanceTimersByTime(999); c.evaluate(); expect(notify).toHaveBeenLastCalledWith(false);
    jest.advanceTimersByTime(1); c.evaluate(); expect(notify).toHaveBeenLastCalledWith(true); expect(c.position('clip')).toBe(0);
  });
  it('does not reset completion while another representation remains onscreen, and resets on unmount', () => {
    const c = new ListingVideoAutoplay(); c.update('a', candidate({ onScreen: true }), jest.fn()); c.update('b', candidate({ onScreen: true }), jest.fn());
    c.complete('clip'); c.remove('a'); expect(c.hasFinished('clip')).toBe(true); c.remove('b'); expect(c.hasFinished('clip')).toBe(false);
  });
  it('honors explicit inline replay immediately and gives it priority without bypassing visibility or focus', () => {
    const c = new ListingVideoAutoplay(), a = jest.fn(), b = jest.fn(); c.setScope('events', true);
    c.update('a', candidate({ surface: 'events' }), a); jest.advanceTimersByTime(1000); c.evaluate();
    c.update('b', candidate({ surface: 'events', manual: true, distance: 100 }), b); expect(a).toHaveBeenLastCalledWith(false); expect(b).toHaveBeenLastCalledWith(true);
    c.update('b', candidate({ surface: 'events', manual: true, visible: false }), b); expect(b).toHaveBeenLastCalledWith(false);
    c.setScope('events', false); c.update('b', candidate({ surface: 'events', manual: true }), b); expect(b).toHaveBeenLastCalledWith(false);
  });
  it('halts on background/unfocus and retains bounded position without immediate return autoplay', () => {
    const c = new ListingVideoAutoplay(), notify = jest.fn(); c.setScope('specials', true);
    c.update('a', candidate({ surface: 'specials' }), notify); jest.advanceTimersByTime(1000); c.evaluate();
    c.remember('clip', 6); c.remember('clip', Infinity); c.setForeground(false); expect(notify).toHaveBeenLastCalledWith(false);
    c.setForeground(true); c.evaluate(); expect(notify).toHaveBeenLastCalledWith(false); expect(c.position('clip')).toBe(6);
    jest.advanceTimersByTime(1000); c.evaluate(); c.setScope('specials', false); expect(notify).toHaveBeenLastCalledWith(false);
  });
  it('requires a mostly visible image in both axes and excludes empty/recycled measurements', () => {
    expect(videoVisibility(200, 300, 100, 700, 0, 390, 390).visible).toBe(true);
    expect(videoVisibility(600, 300, 100, 700, 0, 390, 390).visible).toBe(false);
    expect(videoVisibility(200, 300, 100, 700, 390, 390, 390).visible).toBe(false);
    expect(videoVisibility(0, 0, 0, 700).visible).toBe(false);
  });
  it('uses muted, non-looping inline HTML, resumes bounded time and reports frame/end/progress', () => {
    const video = { assetId: 'a'.repeat(64), url: `https://storage.googleapis.com/gathr-uploaded-images/listingvideos/${'a'.repeat(64)}.mp4`, durationSeconds: 10, bytes: 2000, expiresAt: '2099-01-01', sourcePostId: '123' };
    const html = inlineVideoHtml(video, 4);
    expect(html).toContain('autoplay muted preload="none"'); expect(html).not.toContain(' loop');
    expect(html).toContain('Math.min(4,'); expect(html).toContain('requestVideoFrameCallback'); expect(html).toContain("post('ended')");
    expect(html).toContain("type:'progress'"); expect(html).toContain('window.__listingVideoPause');
  });
});
