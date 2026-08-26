import { getTutorialStepAdvance } from '../tutorialStepAdvance';

describe('tutorial step advance', () => {
  it('records the legacy map lesson IDs when the filter lesson advances', () => {
    expect(getTutorialStepAdvance(1)).toEqual({
      nextIndex: 2,
      completedIds: [
        'filter-pills',
        'cluster-click',
        'callout-venue-selector',
        'callout-tabs',
        'callout-event-details',
        'clear-filters',
      ],
    });
  });

  it('keeps ordinary progression to one step', () => {
    expect(getTutorialStepAdvance(0)).toEqual({
      nextIndex: 1,
      completedIds: ['welcome'],
    });
  });

  it('clamps advancement at completion', () => {
    expect(getTutorialStepAdvance(6, 3)).toEqual({
      nextIndex: 6,
      completedIds: [],
    });
  });
});
