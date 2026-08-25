import { createTutorialBooleanGate } from '../tutorialBooleanGate';

describe('tutorial boolean gate', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves immediately when presentation already matches', async () => {
    const gate = createTutorialBooleanGate(true);
    await expect(gate.waitFor(true, { timeoutMs: 100 })).resolves.toBe(true);
    gate.dispose();
  });

  it('waits for the committed presentation value', async () => {
    const gate = createTutorialBooleanGate(true);
    let settled = false;
    const waiting = gate.waitFor(false, { timeoutMs: 100 }).then((result) => {
      settled = true;
      return result;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    gate.publish(false);
    await expect(waiting).resolves.toBe(true);
    gate.dispose();
  });

  it('uses a bounded fallback when the native presentation never changes', async () => {
    jest.useFakeTimers();
    const gate = createTutorialBooleanGate(true);
    const waiting = gate.waitFor(false, { timeoutMs: 1800 });

    jest.advanceTimersByTime(1799);
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1);
    await expect(waiting).resolves.toBe(false);
    gate.dispose();
  });

  it('cancels an outstanding wait on abort or disposal', async () => {
    const gate = createTutorialBooleanGate(false);
    const controller = new AbortController();
    const aborted = gate.waitFor(true, { timeoutMs: 1000, signal: controller.signal });
    controller.abort();
    await expect(aborted).resolves.toBe(false);

    const disposed = gate.waitFor(true, { timeoutMs: 1000 });
    gate.dispose();
    await expect(disposed).resolves.toBe(false);
  });
});
