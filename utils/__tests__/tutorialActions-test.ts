import {
  isTutorialStepCurrent,
  registerTutorialAction,
  runTutorialAction,
  waitForTutorialAction,
} from '../tutorialActions';

describe('tutorial action readiness', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves when a route registers its action', async () => {
    const ready = waitForTutorialAction('late-route-action', { timeoutMs: 1000 });
    const unregister = registerTutorialAction('late-route-action', jest.fn());

    await expect(ready).resolves.toBe(true);
    unregister();
  });

  it('is bounded when an action never registers', async () => {
    jest.useFakeTimers();
    const ready = waitForTutorialAction('missing-action', { timeoutMs: 250 });

    jest.advanceTimersByTime(250);

    await expect(ready).resolves.toBe(false);
  });

  it('runs the action registered after readiness begins', async () => {
    const action = jest.fn();
    const ready = waitForTutorialAction('delayed-action', { timeoutMs: 1000 });
    const unregister = registerTutorialAction('delayed-action', action);

    expect(await ready).toBe(true);
    expect(await runTutorialAction('delayed-action', 'target')).toBe(true);
    expect(action).toHaveBeenCalledWith('target');
    unregister();
  });

  it('rejects a late transition after the tutorial has moved to another step', () => {
    expect(isTutorialStepCurrent('cluster-click', 'cluster-click')).toBe(true);
    expect(isTutorialStepCurrent('cluster-click', 'callout-venue-selector')).toBe(false);
  });
});
