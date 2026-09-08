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
    });
  });
});
