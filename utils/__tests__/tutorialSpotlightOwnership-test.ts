import { getTutorialSpotlightForStep } from '../tutorialSpotlightOwnership';

describe('getTutorialSpotlightForStep', () => {
  const clusterSpotlight = {
    stepId: 'cluster-click',
    config: { x: 100, y: 200, width: 72, height: 72 },
  };

  it('returns geometry owned by the current step', () => {
    expect(getTutorialSpotlightForStep(clusterSpotlight, 'cluster-click'))
      .toEqual(clusterSpotlight.config);
  });

  it('hides stale cluster geometry as soon as the callout step becomes current', () => {
    expect(getTutorialSpotlightForStep(clusterSpotlight, 'callout-venue-selector'))
      .toBeUndefined();
  });
});
