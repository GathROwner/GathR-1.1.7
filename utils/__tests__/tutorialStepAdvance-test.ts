import { getTutorialStepAdvance } from '../tutorialStepAdvance';
import { TUTORIAL_STEPS } from '../../config/tutorialSteps';

describe('tutorial step advance', () => {
  it('records the introductory map example before the cluster lesson', () => {
    expect(getTutorialStepAdvance(1)).toEqual({
      nextIndex: 2,
      completedIds: ['map-overview'],
    });
  });

  it('keeps ordinary progression to one step', () => {
    expect(getTutorialStepAdvance(0)).toEqual({
      nextIndex: 1,
      completedIds: ['welcome'],
    });
  });

  it('keeps the cluster and callout lessons as distinct screens', () => {
    expect(TUTORIAL_STEPS).toHaveLength(17);
    expect(TUTORIAL_STEPS.slice(2, 8).map((step) => step.id)).toEqual([
      'cluster-click',
      'cluster-summary',
      'filter-pills',
      'callout-venue-selector',
      'callout-tabs',
      'callout-event-details',
    ]);
  });

  it('records the clear-filter guidance with the filter lesson', () => {
    expect(getTutorialStepAdvance(4)).toEqual({
      nextIndex: 5,
      completedIds: ['filter-pills', 'clear-filters'],
    });
  });

  it('clamps advancement at completion', () => {
    const finalIndex = TUTORIAL_STEPS.length - 1;
    expect(getTutorialStepAdvance(finalIndex, 3)).toEqual({
      nextIndex: finalIndex,
      completedIds: [],
    });
  });
});
