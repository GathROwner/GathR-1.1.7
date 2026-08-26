import type { TutorialClusterLocalGeometry } from './tutorialClusterSpotlight';
import type { TutorialClusterBinding } from './tutorialClusterTarget';

export interface TutorialClusterBoundGeometry extends TutorialClusterLocalGeometry {
  clusterId: string;
  bindingRevision: number;
}

interface WaitOptions {
  timeoutMs: number;
}

interface GeometryWaiter {
  bindingKey: string;
  finish: (geometry: TutorialClusterBoundGeometry | null) => void;
}

const getBindingKey = (binding: TutorialClusterBinding): string =>
  `${binding.clusterId ?? 'none'}::${binding.revision}`;

const isPositiveFrame = (frame: TutorialClusterLocalGeometry['core']): boolean =>
  [frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) &&
  frame.width > 0 &&
  frame.height > 0;

export const createTutorialClusterGeometryGate = () => {
  let activeBindingKey: string | null = null;
  let currentGeometry: TutorialClusterBoundGeometry | null = null;
  let disposed = false;
  const waiters = new Set<GeometryWaiter>();

  const reset = (binding: TutorialClusterBinding) => {
    if (disposed) return;
    activeBindingKey = getBindingKey(binding);
    currentGeometry = null;
    [...waiters].forEach((waiter) => waiter.finish(null));
  };

  const publish = (geometry: TutorialClusterBoundGeometry): boolean => {
    if (disposed || !isPositiveFrame(geometry.wrapper) || !isPositiveFrame(geometry.core)) {
      return false;
    }
    const bindingKey = getBindingKey({
      clusterId: geometry.clusterId,
      revision: geometry.bindingRevision,
    });
    if (bindingKey !== activeBindingKey) return false;

    currentGeometry = geometry;
    [...waiters].forEach((waiter) => {
      if (waiter.bindingKey === bindingKey) waiter.finish(geometry);
    });
    return true;
  };

  const get = (binding: TutorialClusterBinding): TutorialClusterBoundGeometry | null => {
    if (disposed || getBindingKey(binding) !== activeBindingKey) return null;
    return currentGeometry;
  };

  const waitFor = (
    binding: TutorialClusterBinding,
    options: WaitOptions,
  ): Promise<TutorialClusterBoundGeometry | null> => {
    if (disposed || getBindingKey(binding) !== activeBindingKey) return Promise.resolve(null);
    if (currentGeometry) return Promise.resolve(currentGeometry);

    return new Promise((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      const waiter: GeometryWaiter = {
        bindingKey: getBindingKey(binding),
        finish: (geometry) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          waiters.delete(waiter);
          resolve(geometry);
        },
      };
      waiters.add(waiter);
      timeout = setTimeout(() => waiter.finish(null), Math.max(0, options.timeoutMs));

      if (currentGeometry) waiter.finish(currentGeometry);
    });
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    [...waiters].forEach((waiter) => waiter.finish(null));
    waiters.clear();
    currentGeometry = null;
  };

  return { dispose, get, publish, reset, waitFor };
};
