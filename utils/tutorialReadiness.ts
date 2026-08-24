import { ComponentMeasurement } from '../types/tutorial';

export type TutorialMeasurement = ComponentMeasurement & { measuredAt: number };

type MeasurementListener = (measurement: TutorialMeasurement) => void;

const measurements = new Map<string, TutorialMeasurement>();
const listeners = new Map<string, Set<MeasurementListener>>();

const isValidMeasurement = (value: Partial<ComponentMeasurement> | null | undefined) =>
  Boolean(
    value &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y) &&
      Number.isFinite(value.width) &&
      Number.isFinite(value.height) &&
      (value.width ?? 0) > 0 &&
      (value.height ?? 0) > 0,
  );

export const publishTutorialMeasurement = (
  name: string,
  measurement: ComponentMeasurement,
  measuredAt = Date.now(),
): TutorialMeasurement | null => {
  if (!isValidMeasurement(measurement)) return null;

  const next = { ...measurement, measuredAt };
  measurements.set(name, next);
  listeners.get(name)?.forEach((listener) => listener(next));
  return next;
};

export const getTutorialMeasurement = (name: string): TutorialMeasurement | null => {
  const registered = measurements.get(name);
  if (registered) return registered;

  const legacy = (global as Record<string, unknown>)[name] as
    | (Partial<TutorialMeasurement> & { measuredAt?: number })
    | undefined;
  if (!isValidMeasurement(legacy)) return null;
  const validLegacy = legacy as ComponentMeasurement & { measuredAt?: number };

  return {
    x: validLegacy.x,
    y: validLegacy.y,
    width: validLegacy.width,
    height: validLegacy.height,
    measuredAt: validLegacy.measuredAt ?? Date.now(),
  };
};

export const waitForTutorialMeasurement = (
  name: string,
  options: { timeoutMs: number; freshAfter?: number; signal?: AbortSignal },
): Promise<{ measurement: TutorialMeasurement | null; source: 'ready' | 'timeout' | 'aborted' }> => {
  const { timeoutMs, freshAfter = 0, signal } = options;
  const immediate = getTutorialMeasurement(name);
  if (immediate && immediate.measuredAt >= freshAfter) {
    return Promise.resolve({ measurement: immediate, source: 'ready' });
  }

  return new Promise((resolve) => {
    let settled = false;
    const set = listeners.get(name) ?? new Set<MeasurementListener>();

    const finish = (
      measurement: TutorialMeasurement | null,
      source: 'ready' | 'timeout' | 'aborted',
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      set.delete(onMeasurement);
      signal?.removeEventListener('abort', onAbort);
      resolve({ measurement, source });
    };

    const onMeasurement: MeasurementListener = (measurement) => {
      if (measurement.measuredAt >= freshAfter) finish(measurement, 'ready');
    };
    const onAbort = () => finish(null, 'aborted');
    const timeout = setTimeout(
      () => finish(getTutorialMeasurement(name), 'timeout'),
      Math.max(0, timeoutMs),
    );

    set.add(onMeasurement);
    listeners.set(name, set);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
};

export const withTutorialTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<{ value: T; timedOut: boolean }> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ value: T; timedOut: boolean }>((resolve) => {
    timeout = setTimeout(() => resolve({ value: fallback, timedOut: true }), timeoutMs);
  });
  const result = await Promise.race([
    promise.then((value) => ({ value, timedOut: false })),
    timeoutPromise,
  ]);
  if (timeout) clearTimeout(timeout);
  return result;
};

export const clearTutorialReadinessForTests = () => {
  measurements.clear();
  listeners.clear();
};
