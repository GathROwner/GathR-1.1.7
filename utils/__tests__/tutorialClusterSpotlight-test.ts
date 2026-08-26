import {
  getTutorialClusterLocalCoreOffset,
  getTutorialClusterSpotlightMeasurement,
  getTutorialClusterSpotlightFromCoreFrame,
  isTutorialClusterCoreFrameUsable,
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

  it('rejects a MarkerView host frame and a stable-looking but stale core frame', () => {
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
      { x: 201, y: 411, width: 30, height: 30 },
      { x: 180, y: 390 },
      { width: 360, height: 800 },
      geometry,
    )).toBe(false);
  });
});
