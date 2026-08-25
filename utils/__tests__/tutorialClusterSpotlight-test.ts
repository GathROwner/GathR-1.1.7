import {
  getTutorialClusterSpotlightMeasurement,
  TUTORIAL_CLUSTER_SPOTLIGHT_SIZE,
} from '../tutorialClusterSpotlight';

describe('tutorial cluster spotlight', () => {
  it('centers Android on the lower tappable core without horizontal drift', () => {
    expect(getTutorialClusterSpotlightMeasurement([180, 300], { x: 0, y: 90 }, 'android'))
      .toEqual({ x: 144, y: 386, width: 72, height: 72 });
  });

  it('keeps the smaller iOS marker composition correction', () => {
    expect(getTutorialClusterSpotlightMeasurement([180, 300], { x: 0, y: 90 }, 'ios'))
      .toEqual({ x: 144, y: 359, width: 72, height: 72 });
  });

  it('keeps the aperture at the established touch size', () => {
    expect(TUTORIAL_CLUSTER_SPOTLIGHT_SIZE).toBe(72);
  });
});
