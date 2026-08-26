import {
  isTutorialDemoCalloutStep,
  isTutorialDemoClusterReady,
  shouldAdvanceTutorialDemoCallout,
} from '../tutorialDemoFixtureState';

describe('tutorial demo fixture state', () => {
  it('only enables the tutorial cluster action after its own layout has supplied a spotlight', () => {
    expect(isTutorialDemoClusterReady('cluster-click', false, false)).toBe(false);
    expect(isTutorialDemoClusterReady('cluster-click', true, false)).toBe(true);
    expect(isTutorialDemoClusterReady('cluster-click', true, true)).toBe(false);
  });

  it('advances from the demo marker only when the demo callout has laid out', () => {
    expect(shouldAdvanceTutorialDemoCallout({
      isTutorialActive: true,
      currentStepId: 'cluster-click',
      demoCalloutVisible: true,
      demoCalloutReady: false,
      alreadyAdvanced: false,
    })).toBe(false);
    expect(shouldAdvanceTutorialDemoCallout({
      isTutorialActive: true,
      currentStepId: 'cluster-click',
      demoCalloutVisible: true,
      demoCalloutReady: true,
      alreadyAdvanced: false,
    })).toBe(true);
    expect(shouldAdvanceTutorialDemoCallout({
      isTutorialActive: true,
      currentStepId: 'callout-venue-selector',
      demoCalloutVisible: true,
      demoCalloutReady: true,
      alreadyAdvanced: false,
    })).toBe(false);
    expect(shouldAdvanceTutorialDemoCallout({
      isTutorialActive: true,
      currentStepId: 'cluster-click',
      demoCalloutVisible: true,
      demoCalloutReady: true,
      alreadyAdvanced: true,
    })).toBe(false);
  });

  it('only hosts the ordinary tutorial sheet for the demo callout lesson', () => {
    expect(isTutorialDemoCalloutStep(true, 'callout-venue-selector', true)).toBe(true);
    expect(isTutorialDemoCalloutStep(true, 'callout-venue-selector', false)).toBe(false);
    expect(isTutorialDemoCalloutStep(true, 'filter-pills', true)).toBe(false);
    expect(isTutorialDemoCalloutStep(false, 'callout-venue-selector', true)).toBe(false);
  });
});
