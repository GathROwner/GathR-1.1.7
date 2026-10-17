import { settleCalloutCloseAttempt } from '../calloutInteractionSafety';

describe('callout interaction safety', () => {
  it('unlocks the close latch when a parent rejects a close request', () => {
    const resetAttempt = jest.fn();

    expect(settleCalloutCloseAttempt(false, resetAttempt)).toBe(false);
    expect(resetAttempt).toHaveBeenCalledTimes(1);
  });

  it('keeps an accepted close latched while its committed teardown completes', () => {
    const resetAttempt = jest.fn();

    expect(settleCalloutCloseAttempt(true, resetAttempt)).toBe(true);
    expect(settleCalloutCloseAttempt(undefined, resetAttempt)).toBe(true);
    expect(resetAttempt).not.toHaveBeenCalled();
  });
});
