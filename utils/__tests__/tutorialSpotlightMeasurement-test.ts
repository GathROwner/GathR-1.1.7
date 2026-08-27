import { normalizeTutorialSpotlightMeasurement } from '../tutorialSpotlightMeasurement';

describe('tutorial spotlight measurement', () => {
  it('clips moving targets to the visible viewport', () => {
    expect(normalizeTutorialSpotlightMeasurement(
      { x: -10, y: 20, width: 100, height: 50 },
      390,
      844,
    )).toEqual({ x: 0, y: 20, width: 90, height: 50 });
  });

  it('expands the Facebook suggestion row across the viewport', () => {
    expect(normalizeTutorialSpotlightMeasurement(
      { x: 18, y: 420, width: 354, height: 64 },
      390,
      844,
      { expandHorizontalToViewport: true },
    )).toEqual({ x: 0, y: 420, width: 390, height: 64 });
  });

  it('rejects zero, offscreen, and non-finite measurements', () => {
    expect(normalizeTutorialSpotlightMeasurement(
      { x: 10, y: 900, width: 100, height: 40 },
      390,
      844,
    )).toBeNull();
    expect(normalizeTutorialSpotlightMeasurement(
      { x: Number.NaN, y: 10, width: 100, height: 40 },
      390,
      844,
    )).toBeNull();
  });
});
