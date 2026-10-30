import { normalizeListingVideo, videoListingPath, videoPlayerHtml, type ListingVideo } from '../listingVideo';
const video = (): ListingVideo => ({ assetId: 'a'.repeat(64),
  url: `https://storage.googleapis.com/gathr-uploaded-images/listingvideos/${'a'.repeat(64)}.mp4`,
  durationSeconds: 12, bytes: 2000, expiresAt: '2099-01-01T00:00:00Z', sourcePostId: '123' });
describe('listing video boundary', () => {
  it('accepts only bounded, unexpired managed video assets', () => {
    expect(normalizeListingVideo(video())).not.toBeNull();
    for (const patch of [{ url: 'https://video.fbcdn.net/temporary.mp4' }, { url: 'javascript:alert(1)' },
      { assetId: '../../images' }, { expiresAt: '2000-01-01' }, { bytes: 9_000_000 }, { durationSeconds: Infinity }, { durationSeconds: 0 }])
      expect(normalizeListingVideo({ ...video(), ...patch })).toBeNull();
  });
  it('never looks up private shares or friend event paths', () => {
    expect(videoListingPath({ id: 'fb_offer', venueId: 'pub', source: 'firestore' })).toBe('venues/pub/events/offer');
    expect(videoListingPath({ id: 'fb_area', locationScope: 'city', source: 'firestore' })).toBe('events/area');
    expect(videoListingPath({ id: 'private', venueId: 'pub', source: 'private_shared' })).toBeNull();
    expect(videoListingPath({ id: '../private', venueId: 'pub', source: 'firestore' })).toBeNull();
  });
  it('accepts reviewed longer clips within the managed byte and expiry safeguards', () => {
    expect(normalizeListingVideo({ ...video(), durationSeconds: 83.06, bytes: 2_546_243 })).not.toBeNull();
  });
  it('player uses muted inline playback, no preload and a restricted content policy', () => {
    const html = videoPlayerHtml(video());
    expect(html).toContain('autoplay muted preload="none"');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('document.hidden');
    expect(() => videoPlayerHtml({ ...video(), url: '<script>unsafe</script>' })).toThrow();
  });
  it('coalesces duplicate metadata requests and reuses a short-lived result without loading MP4 bytes', async () => {
    const previous = process.env.EXPO_PUBLIC_LISTING_VIDEO_PILOT_ENABLED;
    const originalFetch = global.fetch;
    process.env.EXPO_PUBLIC_LISTING_VIDEO_PILOT_ENABLED = 'true';
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ videos: { 'venues/pub/events/offer': video() } }) });
    global.fetch = mockFetch;
    try {
      let api: typeof import('../listingVideo');
      jest.isolateModules(() => { api = require('../listingVideo'); });
      const first = api!.getListingVideo('venues/pub/events/offer');
      const second = api!.getListingVideo('venues/pub/events/offer');
      expect(first).toBe(second);
      expect(await first).not.toBeNull();
      await api!.getListingVideo('venues/pub/events/offer');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).not.toContain('.mp4');
    } finally {
      global.fetch = originalFetch;
      if (previous === undefined) delete process.env.EXPO_PUBLIC_LISTING_VIDEO_PILOT_ENABLED;
      else process.env.EXPO_PUBLIC_LISTING_VIDEO_PILOT_ENABLED = previous;
    }
  });
});
