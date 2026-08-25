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

  it('ignores an offscreen entrance measurement until the target is usable', async () => {
    let settled = false;
    const waiting = waitForTutorialMeasurement('moving-target', {
      timeoutMs: 200,
      freshAfter: 100,
      isUsable: (measurement) => measurement.y < 800 && measurement.y + measurement.height > 0,
    }).then((result) => {
      settled = true;
      return result;
    });

    publishTutorialMeasurement('moving-target', { x: 10, y: 900, width: 200, height: 60 }, 110);
    await Promise.resolve();
    expect(settled).toBe(false);

    publishTutorialMeasurement('moving-target', { x: 10, y: 120, width: 200, height: 60 }, 125);
    await expect(waiting).resolves.toMatchObject({
      source: 'ready',
      measurement: { x: 10, y: 120, measuredAt: 125 },
    });
  });

  it('ignores zero-sized layout events and still resolves from the next valid layout', async () => {
    const waiting = waitForTutorialMeasurement('zero-then-valid', {
      timeoutMs: 200,
      freshAfter: 100,
    });

    expect(publishTutorialMeasurement(
      'zero-then-valid',
      { x: 0, y: 0, width: 0, height: 40 },
      110,
    )).toBeNull();
    publishTutorialMeasurement('zero-then-valid', { x: 2, y: 3, width: 40, height: 50 }, 120);

    await expect(waiting).resolves.toMatchObject({
      source: 'ready',
      measurement: { width: 40, height: 50, measuredAt: 120 },
    });
  });

  it('bounds external readiness promises', async () => {
    jest.useFakeTimers();
    const pending = new Promise<string>(() => undefined);
    const result = withTutorialTimeout(pending, 300, 'fallback');
    jest.advanceTimersByTime(300);
    await expect(result).resolves.toEqual({ value: 'fallback', timedOut: true });
  });
});
