type TutorialAction = (...args: any[]) => void | boolean | Promise<void | boolean>;

export const isTutorialStepCurrent = (
  expectedStepId: string,
  currentStepId: string | null | undefined,
): boolean => expectedStepId === currentStepId;

const actions = new Map<string, TutorialAction>();
const readinessWaiters = new Map<string, Set<() => void>>();

export const registerTutorialAction = (name: string, action: TutorialAction) => {
  actions.set(name, action);
  readinessWaiters.get(name)?.forEach((resolve) => resolve());
  readinessWaiters.delete(name);
  return () => {
    if (actions.get(name) === action) actions.delete(name);
  };
};

export const waitForTutorialAction = (
  name: string,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<boolean> => {
  if (options.signal?.aborted) return Promise.resolve(false);
  if (actions.has(name)) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const waiters = readinessWaiters.get(name);
      waiters?.delete(onReady);
      if (waiters?.size === 0) readinessWaiters.delete(name);
      options.signal?.removeEventListener('abort', onAbort);
      resolve(ready);
    };
    const onReady = () => finish(true);
    const onAbort = () => finish(false);
    const timeout = setTimeout(() => finish(false), options.timeoutMs);
    const waiters = readinessWaiters.get(name) ?? new Set<() => void>();
    waiters.add(onReady);
    readinessWaiters.set(name, waiters);
    options.signal?.addEventListener('abort', onAbort, { once: true });

    // Registration can occur between the initial check and waiter insertion.
    if (actions.has(name)) finish(true);
  });
};

export const runTutorialAction = async (name: string, ...args: any[]) => {
  const action = actions.get(name);
  if (!action) return false;
  const result = await action(...args);
  return result !== false;
};
