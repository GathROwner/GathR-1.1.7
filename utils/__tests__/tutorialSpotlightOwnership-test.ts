import {
  getTutorialClusterActionState,
  getTutorialSpotlightForStep,
  translateTutorialMeasurementToHost,
} from '../tutorialSpotlightOwnership';

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

  it('keeps cluster opening disabled until the current target has a spotlight', () => {
    expect(getTutorialClusterActionState('cluster-click', true, false, false))
      .toBe('locating');
    expect(getTutorialClusterActionState('cluster-click', true, true, false))
      .toBe('ready');
  });

  it('keeps the bounded no-target fallback actionable', () => {
    expect(getTutorialClusterActionState('cluster-click', false, false, true))
      .toBe('fallback');
    expect(getTutorialClusterActionState('events-tab', true, true, false))
      .toBe('inactive');
  });

  it('translates window measurements into the overlay host on both platforms', () => {
    expect(translateTutorialMeasurementToHost(
      { x: 192, y: 385, width: 72, height: 72 },
      { x: 0, y: 24 },
    )).toEqual({ x: 192, y: 361, width: 72, height: 72 });
    expect(translateTutorialMeasurementToHost(
      { x: 120, y: 204, width: 72, height: 72 },
      { x: 0, y: 0 },
    )).toEqual({ x: 120, y: 204, width: 72, height: 72 });
  });
});
