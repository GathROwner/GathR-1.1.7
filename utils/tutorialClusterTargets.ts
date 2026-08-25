import type { Cluster } from '../types/events';

export type TutorialClusterTarget = {
  cluster: Cluster;
  x: number;
  y: number;
};

type PublishedTargets = {
  targets: TutorialClusterTarget[];
  publishedAt: number;
};

type TargetListener = (published: PublishedTargets) => void;

let latest: PublishedTargets | null = null;
const listeners = new Set<TargetListener>();

export const publishTutorialClusterTargets = (
  targets: TutorialClusterTarget[],
  publishedAt = Date.now(),
) => {
  latest = { targets, publishedAt };
  listeners.forEach((listener) => listener(latest as PublishedTargets));
};

export const waitForTutorialClusterTargets = (
  options: { timeoutMs: number; freshAfter?: number; signal?: AbortSignal },
): Promise<{ targets: TutorialClusterTarget[] | null; source: 'ready' | 'timeout' | 'aborted' }> => {
  const { timeoutMs, freshAfter = 0, signal } = options;
  if (latest?.targets.length && latest.publishedAt >= freshAfter) {
    return Promise.resolve({ targets: latest.targets, source: 'ready' });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (
      targets: TutorialClusterTarget[] | null,
      source: 'ready' | 'timeout' | 'aborted',
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      listeners.delete(onTargets);
      signal?.removeEventListener('abort', onAbort);
      resolve({ targets, source });
    };
    const onTargets: TargetListener = (published) => {
      if (published.targets.length && published.publishedAt >= freshAfter) {
        finish(published.targets, 'ready');
      }
    };
    const onAbort = () => finish(null, 'aborted');
    const timeout = setTimeout(
      () => finish(latest?.targets.length ? latest.targets : null, 'timeout'),
      Math.max(0, timeoutMs),
    );

    listeners.add(onTargets);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
};

export const clearTutorialClusterTargetsForTests = () => {
  latest = null;
  listeners.clear();
};
