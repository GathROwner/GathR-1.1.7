import {
  getTutorialPreviousIndex,
  getTutorialStepAdvance,
} from '../tutorialStepAdvance';

describe('tutorial step advance', () => {
  it('skips the modal-only callout lesson when its target is unavailable', () => {
    expect(getTutorialStepAdvance(1, 2)).toEqual({
      nextIndex: 3,
      completedIds: [
        'cluster-click',
        'callout-venue-selector',
        'callout-tabs',
        'callout-event-details',
      ],
      crossesFilterPills: true,
    });
  });

  it('keeps ordinary progression to one step', () => {
    expect(getTutorialStepAdvance(0)).toEqual({
      nextIndex: 1,
      completedIds: ['welcome'],
      crossesFilterPills: false,
    });
  });

  it('clamps advancement at completion', () => {
    expect(getTutorialStepAdvance(10, 3)).toEqual({
      nextIndex: 10,
      completedIds: [],
      crossesFilterPills: false,
    });
  });

  it('jumps Back over an unavailable modal-only callout lesson', () => {
    expect(getTutorialPreviousIndex(3, true)).toBe(1);
    expect(getTutorialPreviousIndex(3, false)).toBe(2);
    expect(getTutorialPreviousIndex(4, true)).toBe(3);
  });
});
