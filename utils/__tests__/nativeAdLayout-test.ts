import { getNativeAdMediaLayout } from '../nativeAdLayout';

const media = { cardWidth: 374, hasMediaContent: true, hasVideoContent: true };
it('fits landscape and square media without changing their proportions', () => {
  for (const ratio of [16 / 9, 4 / 3, 1]) {
    const layout = getNativeAdMediaLayout({ ...media, aspectRatio: ratio });
    expect(layout.split).toBe(false);
    expect(layout.mediaWidth / layout.mediaHeight).toBeCloseTo(ratio);
    expect(layout.mediaWidth).toBe(366);
  }
});
it('uses the portrait split while preserving standard portrait proportions', () => {
  for (const ratio of [9 / 16, 3 / 4]) {
    const layout = getNativeAdMediaLayout({ ...media, aspectRatio: ratio });
    expect(layout.kind).toBe('portrait');
    expect(layout.split).toBe(true);
    expect(layout.mediaWidth / layout.mediaHeight).toBeCloseTo(ratio);
    expect(layout.mediaWidth).toBeGreaterThanOrEqual(120);
    expect(layout.mediaWidth).toBeLessThan(366 / 2);
  }
});
it.each([0, -1, NaN, Infinity, undefined])('keeps video visible with unavailable ratio %s', aspectRatio => {
  const layout = getNativeAdMediaLayout({ ...media, aspectRatio });
  expect(layout.kind).toBe('unknown');
  expect(layout.split).toBe(false);
  expect(layout.mediaHeight).toBeGreaterThanOrEqual(120);
});
it('omits fake hero space when there is no usable media or media is disabled', () => {
  for (const options of [
    { hasMediaContent: false, hasVideoContent: false },
    { hasMediaContent: true, hasVideoContent: false, aspectRatio: 0 },
    { hasMediaContent: true, hasVideoContent: true, aspectRatio: 9 / 16, allowMedia: false },
  ]) expect(getNativeAdMediaLayout({ cardWidth: 374, ...options })).toEqual({
    kind: 'compact', split: false, mediaWidth: 0, mediaHeight: 0,
  });
});
it('stacks narrow and enlarged-text portrait cards and bounds extreme media', () => {
  for (const options of [{ cardWidth: 300 }, { fontScale: 1.6 }]) {
    const layout = getNativeAdMediaLayout({ ...media, aspectRatio: 9 / 16, ...options });
    expect(layout.split).toBe(false);
    expect(layout.mediaWidth / layout.mediaHeight).toBeCloseTo(9 / 16);
  }
  for (const ratio of [0.01, 0.2, 10, 100]) {
    const layout = getNativeAdMediaLayout({ ...media, aspectRatio: ratio });
    expect(layout.mediaWidth).toBeLessThanOrEqual(366);
    expect(layout.mediaHeight).toBeGreaterThanOrEqual(120);
    expect(layout.mediaHeight).toBeLessThanOrEqual(420);
  }
});
