interface WaitOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

interface GateWaiter {
  expected: boolean;
  finish: (matched: boolean) => void;
}

export interface TutorialBooleanGate {
  getValue: () => boolean;
  publish: (value: boolean) => void;
  waitFor: (expected: boolean, options: WaitOptions) => Promise<boolean>;
  dispose: () => void;
}

/**
 * Bridges React/native presentation events to tutorial actions without polling.
 * Every wait is bounded and resolves false when aborted or disposed.
 */
export const createTutorialBooleanGate = (initialValue = false): TutorialBooleanGate => {
  let currentValue = initialValue;
  let disposed = false;
  const waiters = new Set<GateWaiter>();

  const publish = (value: boolean) => {
    if (disposed) return;
    currentValue = value;
    [...waiters].forEach((waiter) => {
      if (waiter.expected === value) waiter.finish(true);
    });
  };

  const waitFor = (expected: boolean, options: WaitOptions): Promise<boolean> => {
    if (disposed || options.signal?.aborted) return Promise.resolve(false);
    if (currentValue === expected) return Promise.resolve(true);

    return new Promise((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      const waiter: GateWaiter = {
        expected,
        finish: (matched) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          waiters.delete(waiter);
          options.signal?.removeEventListener('abort', onAbort);
          resolve(matched);
        },
      };
      const onAbort = () => waiter.finish(false);

      waiters.add(waiter);
      timeout = setTimeout(() => waiter.finish(false), Math.max(0, options.timeoutMs));
      options.signal?.addEventListener('abort', onAbort, { once: true });

      // A presentation event can land between the initial read and insertion.
      if (currentValue === expected) waiter.finish(true);
    });
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    [...waiters].forEach((waiter) => waiter.finish(false));
    waiters.clear();
  };

  return {
    getValue: () => currentValue,
    publish,
    waitFor,
    dispose,
  };
};
