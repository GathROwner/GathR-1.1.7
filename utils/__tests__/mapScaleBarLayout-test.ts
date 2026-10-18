import { getAndroidScaleBarLeft } from '../mapScaleBarLayout';

describe('Android native scale frame placement', () => {
  it('centers the SDK-width scale on a tablet and follows window resizing', () => {
    expect(getAndroidScaleBarLeft(800)).toBe(195);
    expect(getAndroidScaleBarLeft(1280)).toBe(315);
    expect(getAndroidScaleBarLeft(390)).toBe(93);
  });

  it('uses the full window center when the map has a horizontal offset', () => {
    // 600dp map: native scale width 310dp, center 400dp in the 800dp window.
    expect(getAndroidScaleBarLeft(800, 600, 100)).toBe(145);
  });
});
