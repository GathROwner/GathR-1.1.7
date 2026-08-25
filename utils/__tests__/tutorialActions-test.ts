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

  it('propagates a registered readiness action timeout', async () => {
    const unregister = registerTutorialAction('timed-out-ready-action', () => false);

    await expect(runTutorialAction('timed-out-ready-action')).resolves.toBe(false);

    unregister();
  });

  it('rejects a late transition after the tutorial has moved to another step', () => {
    expect(isTutorialStepCurrent('cluster-click', 'cluster-click')).toBe(true);
    expect(isTutorialStepCurrent('cluster-click', 'callout-venue-selector')).toBe(false);
  });

  it('does not acknowledge an async close action until presentation teardown finishes', async () => {
    let finishClose: (() => void) | undefined;
    const closeFinished = new Promise<void>((resolve) => {
      finishClose = resolve;
    });
    const unregister = registerTutorialAction('deferred-close-action', () => closeFinished);
    let acknowledged = false;

    const running = runTutorialAction('deferred-close-action').then((result) => {
      acknowledged = true;
      return result;
    });
    await Promise.resolve();
    expect(acknowledged).toBe(false);

    finishClose?.();
    await expect(running).resolves.toBe(true);
    expect(acknowledged).toBe(true);
    unregister();
  });
});
