import { getTutorialShimmerGeometry } from '../tutorialShimmerGeometry';

describe('tutorial shimmer geometry', () => {
  it('keeps the reflection wide enough to read on compact controls', () => {
    expect(getTutorialShimmerGeometry(120, 44)).toEqual({
      bandWidth: 58,
      overscan: 18,
      travelStart: -76,
      travelEnd: 196,
    });
  });

  it('scales the reflection across card-sized spotlight targets', () => {
    const geometry = getTutorialShimmerGeometry(360, 240);

    expect(geometry.bandWidth).toBeCloseTo(79.2);
    expect(geometry.overscan).toBeCloseTo(43.2);
    expect(geometry.travelStart).toBeCloseTo(-122.4);
    expect(geometry.travelEnd).toBeCloseTo(482.4);
  });

  it('caps the band and overscan on a full-screen example', () => {
    expect(getTutorialShimmerGeometry(600, 900)).toEqual({
      bandWidth: 112,
      overscan: 48,
      travelStart: -160,
      travelEnd: 760,
    });
  });
});
