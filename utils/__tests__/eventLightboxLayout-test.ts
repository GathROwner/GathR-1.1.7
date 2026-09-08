import { getEventLightboxLayout } from '../eventLightboxLayout';

describe('getEventLightboxLayout', () => {
  it('starts the panel at the safe area without reserving the underlying app header', () => {
    expect(getEventLightboxLayout({
      windowHeight: 874,
      safeAreaTop: 59,
      tabBarHeight: 83,
    })).toEqual({
      panelTop: 59,
      panelHeight: 732,
      imageHeight: 305.9,
      descriptionMinHeight: 114,
    });
  });

  it('keeps the image capped so added panel height remains available to details', () => {
    const compact = getEventLightboxLayout({
      windowHeight: 874,
      safeAreaTop: 98,
      tabBarHeight: 83,
    });
    const taller = getEventLightboxLayout({
      windowHeight: 874,
      safeAreaTop: 59,
      tabBarHeight: 83,
    });

    expect(taller.panelHeight - compact.panelHeight).toBe(39);
    expect(taller.imageHeight).toBe(compact.imageHeight);
    expect(taller.descriptionMinHeight).toBe(114);
    expect(compact.descriptionMinHeight).toBe(114);
  });

  it('reserves about five description lines on a typical phone viewport', () => {
    const layout = getEventLightboxLayout({
      windowHeight: 667,
      safeAreaTop: 20,
      tabBarHeight: 49,
    });

    expect(layout.descriptionMinHeight).toBeCloseTo(113.62, 2);
  });

  it('clamps impossible negative insets and short viewports', () => {
    expect(getEventLightboxLayout({
      windowHeight: 60,
      safeAreaTop: -10,
      tabBarHeight: 100,
    })).toEqual({
      panelTop: 0,
      panelHeight: 0,
      imageHeight: 0,
      descriptionMinHeight: 0,
    });
  });
});
