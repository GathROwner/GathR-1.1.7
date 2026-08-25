import {
  clearTutorialReadinessForTests,
  publishTutorialMeasurement,
  waitForTutorialMeasurement,
  withTutorialTimeout,
} from '../tutorialReadiness';

describe('tutorial readiness', () => {
  beforeEach(() => {
    jest.useRealTimers();
    clearTutorialReadinessForTests();
  });

  it('resolves immediately for a valid fresh measurement', async () => {
    publishTutorialMeasurement('target', { x: 1, y: 2, width: 30, height: 40 }, 100);
    await expect(waitForTutorialMeasurement('target', { timeoutMs: 50, freshAfter: 90 }))
      .resolves.toMatchObject({ source: 'ready', measurement: { width: 30, height: 40 } });
  });

  it('waits for a new layout event instead of polling stale geometry', async () => {
    publishTutorialMeasurement('target', { x: 1, y: 2, width: 30, height: 40 }, 100);
    const waiting = waitForTutorialMeasurement('target', { timeoutMs: 200, freshAfter: 150 });
    publishTutorialMeasurement('target', { x: 4, y: 5, width: 60, height: 70 }, 175);
    await expect(waiting).resolves.toMatchObject({
      source: 'ready',
      measurement: { x: 4, y: 5, width: 60, height: 70, measuredAt: 175 },
    });
  });

  it('can reuse stable mounted geometry without waiting for another layout event', async () => {
    publishTutorialMeasurement('target', { x: 1, y: 2, width: 30, height: 40 }, 100);
    await expect(waitForTutorialMeasurement('target', {
      timeoutMs: 200,
      freshAfter: 150,
      acceptExisting: true,
    })).resolves.toMatchObject({ source: 'ready', measurement: { measuredAt: 100 } });
  });

  it('uses a bounded timeout and returns the best available fallback', async () => {
    jest.useFakeTimers();
    publishTutorialMeasurement('target', { x: 1, y: 2, width: 30, height: 40 }, 100);
    const waiting = waitForTutorialMeasurement('target', { timeoutMs: 200, freshAfter: 150 });
    jest.advanceTimersByTime(200);
    await expect(waiting).resolves.toMatchObject({ source: 'timeout', measurement: { measuredAt: 100 } });
  });

  it('bounds external readiness promises', async () => {
    jest.useFakeTimers();
    const pending = new Promise<string>(() => undefined);
    const result = withTutorialTimeout(pending, 300, 'fallback');
    jest.advanceTimersByTime(300);
    await expect(result).resolves.toEqual({ value: 'fallback', timedOut: true });
  });
});
