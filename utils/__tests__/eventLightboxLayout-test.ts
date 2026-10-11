import { getEventLightboxLayout } from '../eventLightboxLayout';

describe('getEventLightboxLayout', () => {
  it('starts the panel at the safe area without reserving the underlying app header', () => {
    expect(getEventLightboxLayout({
      windowHeight: 874,
      safeAreaTop: 59,
      tabBarHeight: 83,
    })).toEqual({
      panelTop: 59,
      panelBottom: 83,
      panelHeight: 732,
      imageHeight: expect.closeTo(275.31, 2),
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
      panelBottom: 100,
      panelHeight: 0,
      imageHeight: 0,
      descriptionMinHeight: 0,
    });
  });

  it('extends to the top edge while keeping the footer above the device bottom safe area', () => {
    expect(getEventLightboxLayout({
      windowHeight: 874,
      safeAreaTop: 59,
      safeAreaBottom: 34,
      tabBarHeight: 83,
      extendToDeviceEdges: true,
    })).toEqual({
      panelTop: 0,
      panelBottom: 34,
      panelHeight: 840,
      imageHeight: expect.closeTo(314.64, 2),
      descriptionMinHeight: 114,
    });
  });

  it('does not reserve bottom space when the platform reports no bottom inset', () => {
    const layout = getEventLightboxLayout({
      windowHeight: 874,
      safeAreaTop: 59,
      safeAreaBottom: 0,
      tabBarHeight: 83,
      extendToDeviceEdges: true,
    });

    expect(layout.panelBottom).toBe(0);
    expect(layout.panelHeight).toBe(874);
  });
});
