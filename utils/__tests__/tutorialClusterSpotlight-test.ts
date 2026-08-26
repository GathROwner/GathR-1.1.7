import {
  getTutorialClusterLocalCoreOffset,
  getTutorialClusterSpotlightMeasurement,
  getTutorialClusterSpotlightFromCoreFrame,
  isTutorialClusterBoundCoreFrameUsable,
  isTutorialClusterCoreFrameUsable,
  isTutorialClusterProjectionCentered,
  resolveTutorialClusterProjectedPoint,
  resolveTutorialClusterSpotlightFromCoreFrame,
  isPointInsideTutorialSpotlightCircle,
  TUTORIAL_CLUSTER_SPOTLIGHT_SIZE,
} from '../tutorialClusterSpotlight';

describe('tutorial cluster spotlight', () => {
  it('falls back cleanly when the native Mapbox projection rejects', async () => {
    await expect(resolveTutorialClusterProjectedPoint(
      () => Promise.reject(new Error('marker is rebinding')),
      { width: 360, height: 800 },
    )).resolves.toBeNull();
  });

  it('rejects zero and out-of-viewport native projections', async () => {
    await expect(resolveTutorialClusterProjectedPoint(
      () => Promise.resolve([0, 0]),
      { width: 360, height: 800 },
    )).resolves.toBeNull();
    await expect(resolveTutorialClusterProjectedPoint(
      () => Promise.resolve([400, 395]),
      { width: 360, height: 800 },
    )).resolves.toBeNull();
  });
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

  it('rejects a native core frame aligned to the wrong MarkerView anchor', () => {
    const geometry = {
      wrapper: { x: 0, y: 0, width: 120, height: 96 },
      core: { x: 72, y: 50, width: 30, height: 30 },
    };

    expect(isTutorialClusterCoreFrameUsable(
      { x: 192, y: 385, width: 30, height: 30 },
      { x: 180, y: 390 },
      { width: 360, height: 800 },
      geometry,
    )).toBe(false);
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
    )).toBe(false);
  });

  it('rejects an uncorroborated native frame when bound geometry is absent', () => {
    expect(isTutorialClusterCoreFrameUsable(
      { x: 192, y: 344, width: 30, height: 30 },
      { x: 180, y: 390 },
      { width: 360, height: 800 },
      null,
    )).toBe(false);
  });

  it('accepts a revision-bound native core frame when projection is unavailable', () => {
    expect(isTutorialClusterBoundCoreFrameUsable(
      { x: 192, y: 344, width: 30, height: 30 },
      { width: 360, height: 800 },
      {
        wrapper: { x: 0, y: 0, width: 120, height: 96 },
        core: { x: 72, y: 50, width: 30, height: 30 },
      },
    )).toBe(true);
  });

  it('keeps the bound native core authoritative when projection geometry disagrees', () => {
    const geometry = {
      wrapper: { x: 0, y: 0, width: 120, height: 96 },
      core: { x: 72, y: 50, width: 30, height: 30 },
    };
    const visibleCore = { x: 192, y: 385, width: 30, height: 30 };

    expect(isTutorialClusterCoreFrameUsable(
      visibleCore,
      { x: 180, y: 390 },
      { width: 360, height: 800 },
      geometry,
    )).toBe(false);
    expect(resolveTutorialClusterSpotlightFromCoreFrame(
      visibleCore,
      { width: 360, height: 800 },
      geometry,
    )).toEqual({ x: 171, y: 364, width: 72, height: 72 });
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
