import {
  getTutorialClusterLocalCoreOffset,
  getTutorialClusterSpotlightMeasurement,
  getTutorialClusterSpotlightFromCoreFrame,
  isTutorialClusterCoreFrameUsable,
  isTutorialClusterProjectionCentered,
  isPointInsideTutorialSpotlightCircle,
  TUTORIAL_CLUSTER_SPOTLIGHT_SIZE,
} from '../tutorialClusterSpotlight';

describe('tutorial cluster spotlight', () => {
  it('does not fabricate a platform offset without matching marker geometry', () => {
    expect(getTutorialClusterSpotlightMeasurement([180, 300], { x: 0, y: 90 }, null))
      .toBeNull();
  });

  it('keeps the aperture at the established touch size', () => {
    expect(TUTORIAL_CLUSTER_SPOTLIGHT_SIZE).toBe(72);
  });

  it('uses the measured core position inside a changing marker wrapper', () => {
    const geometry = {
      wrapper: { x: 0, y: 0, width: 120, height: 96 },
      core: { x: 72, y: 50, width: 30, height: 30 },
    };

    expect(getTutorialClusterLocalCoreOffset(geometry)).toEqual({ x: 27, y: -31 });
    expect(getTutorialClusterSpotlightMeasurement(
      [180, 300],
      { x: 0, y: 90 },
      geometry,
    )).toEqual({ x: 171, y: 323, width: 72, height: 72 });
  });

  it('maps a bottom-anchored summary core through the map safe-area origin', () => {
    const summaryGeometry = {
      wrapper: { x: 0, y: 0, width: 60, height: 40 },
      core: { x: 0, y: 0, width: 60, height: 40 },
    };

    expect(getTutorialClusterSpotlightMeasurement(
      [100, 200],
      { x: 10, y: 90 },
      summaryGeometry,
    )).toEqual({ x: 74, y: 234, width: 72, height: 72 });
  });

  it('centers directly on a usable native core frame', () => {
    const geometry = {
      wrapper: { x: 0, y: 0, width: 120, height: 96 },
      core: { x: 72, y: 50, width: 30, height: 30 },
    };
    const frame = { x: 192, y: 344, width: 30, height: 30 };

    expect(isTutorialClusterCoreFrameUsable(
      frame,
      { x: 180, y: 390 },
      { width: 360, height: 800 },
      geometry,
    )).toBe(true);
    expect(getTutorialClusterSpotlightFromCoreFrame(frame))
      .toEqual({ x: 171, y: 323, width: 72, height: 72 });
  });

  it('rejects a MarkerView host frame and a core frame far from its projection', () => {
    const geometry = {
      wrapper: { x: 0, y: 0, width: 120, height: 96 },
      core: { x: 72, y: 50, width: 30, height: 30 },
    };
    expect(isTutorialClusterCoreFrameUsable(
      { x: 147, y: 311, width: 120, height: 96 },
      { x: 180, y: 390 },
      { width: 360, height: 800 },
      geometry,
    )).toBe(false);
    expect(isTutorialClusterCoreFrameUsable(
      { x: 301, y: 511, width: 30, height: 30 },
      { x: 180, y: 390 },
      { width: 360, height: 800 },
      geometry,
    )).toBe(false);
  });

  it('accepts a fresh Android core frame despite normal MarkerView anchor drift', () => {
    const geometry = {
      wrapper: { x: 0, y: 0, width: 120, height: 96 },
      core: { x: 72, y: 50, width: 30, height: 30 },
    };

    expect(isTutorialClusterCoreFrameUsable(
      { x: 192, y: 385, width: 30, height: 30 },
      { x: 180, y: 390 },
      { width: 360, height: 800 },
      geometry,
      { allowAndroidVerticalAnchorVariant: true },
    )).toBe(true);
  });

  it('rejects a nearby stale core that matches no supported native anchor', () => {
    const geometry = {
      wrapper: { x: 0, y: 0, width: 120, height: 96 },
      core: { x: 72, y: 50, width: 30, height: 30 },
    };

    expect(isTutorialClusterCoreFrameUsable(
      { x: 216, y: 371, width: 30, height: 30 },
      { x: 180, y: 390 },
      { width: 360, height: 800 },
      geometry,
      { allowAndroidVerticalAnchorVariant: true },
    )).toBe(false);
  });

  it('accepts a stable freshly bound core when native onLayout geometry is absent', () => {
    expect(isTutorialClusterCoreFrameUsable(
      { x: 192, y: 344, width: 30, height: 30 },
      { x: 180, y: 390 },
      { width: 360, height: 800 },
      null,
      { allowFreshBoundFrameWithoutGeometry: true },
    )).toBe(true);
    expect(isTutorialClusterCoreFrameUsable(
      { x: 120, y: 300, width: 120, height: 96 },
      { x: 180, y: 390 },
      { width: 360, height: 800 },
      null,
      { allowFreshBoundFrameWithoutGeometry: true },
    )).toBe(false);
  });

  it('recognizes a no-op camera focus within a bounded center tolerance', () => {
    expect(isTutorialClusterProjectionCentered([181, 395], { width: 360, height: 800 }))
      .toBe(true);
    expect(isTutorialClusterProjectionCentered([205, 395], { width: 360, height: 800 }))
      .toBe(false);
  });

  it('accepts only the circular spotlight area, not its square corners', () => {
    const bounds = { width: 88, height: 88 };
    expect(isPointInsideTutorialSpotlightCircle({ x: 44, y: 44 }, bounds)).toBe(true);
    expect(isPointInsideTutorialSpotlightCircle({ x: 44, y: 0 }, bounds)).toBe(true);
    expect(isPointInsideTutorialSpotlightCircle({ x: 4, y: 4 }, bounds)).toBe(false);
    expect(isPointInsideTutorialSpotlightCircle({ x: Number.NaN, y: 44 }, bounds)).toBe(false);
  });

  it('centers the summary aperture on its shell rather than the pin-tip wrapper', () => {
    const summaryGeometry = {
      wrapper: { x: 0, y: 0, width: 65, height: 35 },
      core: { x: 0, y: 0, width: 65, height: 31 },
    };

    expect(getTutorialClusterLocalCoreOffset(summaryGeometry)).toEqual({ x: 0, y: -19.5 });
  });
});
