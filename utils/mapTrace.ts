import { useEffect, useState } from 'react';

type TracePrimitive = string | number | boolean | null;

// Diagnostic Preview tracing is opt-in at bundle time. The baseline variant
// records existing behavior only; it does not enable any performance change.
export const MAP_TRACE_ENABLED = process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE === '1';
export const MAP_TRACE_UI_ENABLED = MAP_TRACE_ENABLED;
export const MAP_TRACE_VARIANT = process.env.EXPO_PUBLIC_MAP_LATENCY_VARIANT || 'baseline';

const TRACE_RUN_ID = `map-${Date.now().toString(36)}`;

export interface MapTraceEntry {
  id: number;
  timestamp: number;
  monotonicMs: number;
  gestureSessionId: string | null;
  label: string;
  details?: Record<string, TracePrimitive>;
}

interface MapTraceState {
  entries: MapTraceEntry[];
  snapshot: Record<string, TracePrimitive>;
}

type TraceSampler = () => Record<string, unknown>;

export type MapScheduleStateCaller =
  | 'default_map_eligibility'
  | 'cluster_now_today'
  | 'events_pill_counts'
  | 'specials_pill_counts'
  | 'map_filtering';

export interface MapScheduleStateMetricSnapshot {
  count: number;
  cumulativeDurationMs: number;
}

export interface MapTraceTimerExpectation {
  id: string;
  timerName: string;
  delayMs: number;
  scheduledAtMonotonicMs: number;
  expectedAtMonotonicMs: number;
  gestureSessionId: string | null;
}

interface TraceEventOptions {
  gestureSessionId?: string | null;
}

const MAX_ENTRIES = 160;
const NO_GESTURE_SESSION = '__no_gesture__';

let nextEntryId = 1;
let nextGestureSessionId = 1;
let nextTimerId = 1;
let activeGestureSessionId: string | null = null;
const scheduleStateMetrics = new Map<string, MapScheduleStateMetricSnapshot>();
let traceState: MapTraceState = {
  entries: [],
  snapshot: MAP_TRACE_ENABLED
    ? {
        traceRunId: TRACE_RUN_ID,
        traceVariant: MAP_TRACE_VARIANT,
        traceClock: 'performance.now',
      }
    : {},
};

const listeners = new Set<() => void>();
const traceSamplers = new Map<string, TraceSampler>();

const notifyListeners = () => {
  listeners.forEach((listener) => listener());
};

const normalizeValue = (value: unknown): TracePrimitive => {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return '[array]';
    }
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }

  return String(value);
};

const normalizeRecord = (
  record?: Record<string, unknown> | null
): Record<string, TracePrimitive> | undefined => {
  if (!record) return undefined;

  const entries = Object.entries(record).map(([key, value]) => [key, normalizeValue(value)] as const);
  return Object.fromEntries(entries);
};

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const pad = (value: number, length: number = 2) => value.toString().padStart(length, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

export const mapTraceNow = (): number => {
  if (typeof globalThis.performance?.now === 'function') {
    return globalThis.performance.now();
  }

  // React Native supplies performance.now(). This fallback keeps trace export
  // usable in unusual test/runtime environments.
  return Date.now();
};

export const getActiveMapTraceGestureSessionId = (): string | null =>
  activeGestureSessionId;

export const beginMapTraceGestureSession = (
  source: string,
  details?: Record<string, unknown>
): string | null => {
  if (!MAP_TRACE_ENABLED) {
    return null;
  }

  const gestureSessionId = `${TRACE_RUN_ID}-g${nextGestureSessionId++}`;
  activeGestureSessionId = gestureSessionId;
  traceMapEvent(
    'gesture_sequence_started',
    {
      source,
      ...details,
    },
    { gestureSessionId }
  );
  return gestureSessionId;
};

export const traceMapEvent = (
  label: string,
  details?: Record<string, unknown>,
  options: TraceEventOptions = {}
) => {
  if (!MAP_TRACE_ENABLED) {
    return;
  }

  const gestureSessionId = options.gestureSessionId === undefined
    ? activeGestureSessionId
    : options.gestureSessionId;

  const entry: MapTraceEntry = {
    id: nextEntryId++,
    timestamp: Date.now(),
    monotonicMs: mapTraceNow(),
    gestureSessionId,
    label,
    details: normalizeRecord(details),
  };

  traceState = {
    ...traceState,
    entries: [...traceState.entries, entry].slice(-MAX_ENTRIES),
  };

  notifyListeners();
};

const getScheduleMetricKey = (
  caller: MapScheduleStateCaller,
  gestureSessionId: string | null
) => `${gestureSessionId ?? NO_GESTURE_SESSION}:${caller}`;

export const getMapScheduleStateMetricSnapshot = (
  caller: MapScheduleStateCaller,
  gestureSessionId: string | null = activeGestureSessionId
): MapScheduleStateMetricSnapshot => {
  if (!MAP_TRACE_ENABLED) {
    return { count: 0, cumulativeDurationMs: 0 };
  }

  const current = scheduleStateMetrics.get(getScheduleMetricKey(caller, gestureSessionId));
  return current
    ? { ...current }
    : { count: 0, cumulativeDurationMs: 0 };
};

export const diffMapScheduleStateMetrics = (
  before: MapScheduleStateMetricSnapshot,
  after: MapScheduleStateMetricSnapshot
): MapScheduleStateMetricSnapshot => ({
  count: Math.max(0, after.count - before.count),
  cumulativeDurationMs: Math.max(0, after.cumulativeDurationMs - before.cumulativeDurationMs),
});

export const measureMapScheduleState = <T>(
  caller: MapScheduleStateCaller,
  evaluate: () => T,
  gestureSessionId: string | null = activeGestureSessionId
): T => {
  if (!MAP_TRACE_ENABLED) {
    return evaluate();
  }

  const startedAt = mapTraceNow();
  try {
    return evaluate();
  } finally {
    const durationMs = Math.max(0, mapTraceNow() - startedAt);
    const key = getScheduleMetricKey(caller, gestureSessionId);
    const current = scheduleStateMetrics.get(key) ?? {
      count: 0,
      cumulativeDurationMs: 0,
    };
    scheduleStateMetrics.set(key, {
      count: current.count + 1,
      cumulativeDurationMs: current.cumulativeDurationMs + durationMs,
    });
  }
};

export const createMapTraceTimerExpectation = (
  timerName: string,
  delayMs: number,
  gestureSessionId: string | null = activeGestureSessionId,
  scheduledAtMonotonicMs: number = mapTraceNow()
): MapTraceTimerExpectation => ({
  id: `${TRACE_RUN_ID}-t${nextTimerId++}`,
  timerName,
  delayMs,
  scheduledAtMonotonicMs,
  expectedAtMonotonicMs: scheduledAtMonotonicMs + delayMs,
  gestureSessionId,
});

export const traceMapTimerScheduled = (
  expectation: MapTraceTimerExpectation,
  details?: Record<string, unknown>
) => {
  traceMapEvent(
    'timer_scheduled',
    {
      timerId: expectation.id,
      timerName: expectation.timerName,
      delayMs: expectation.delayMs,
      scheduledAtMonotonicMs: expectation.scheduledAtMonotonicMs,
      expectedAtMonotonicMs: expectation.expectedAtMonotonicMs,
      ...details,
    },
    { gestureSessionId: expectation.gestureSessionId }
  );
};

export const traceMapTimerFired = (
  expectation: MapTraceTimerExpectation,
  details?: Record<string, unknown>,
  firedAtMonotonicMs: number = mapTraceNow()
) => {
  traceMapEvent(
    'timer_fired',
    {
      timerId: expectation.id,
      timerName: expectation.timerName,
      delayMs: expectation.delayMs,
      scheduledAtMonotonicMs: expectation.scheduledAtMonotonicMs,
      expectedAtMonotonicMs: expectation.expectedAtMonotonicMs,
      firedAtMonotonicMs,
      actualDelayMs: firedAtMonotonicMs - expectation.scheduledAtMonotonicMs,
      latenessMs: firedAtMonotonicMs - expectation.expectedAtMonotonicMs,
      ...details,
    },
    { gestureSessionId: expectation.gestureSessionId }
  );
};

export const setMapTraceSnapshot = (partial: Record<string, unknown>) => {
  if (!MAP_TRACE_ENABLED) {
    return;
  }

  traceState = {
    ...traceState,
    snapshot: {
      ...traceState.snapshot,
      ...normalizeRecord(partial),
    },
  };

  notifyListeners();
};

export const clearMapTrace = () => {
  if (!MAP_TRACE_ENABLED) {
    return;
  }

  traceState = {
    entries: [],
    snapshot: {
      traceRunId: TRACE_RUN_ID,
      traceVariant: MAP_TRACE_VARIANT,
      traceClock: 'performance.now',
    },
  };
  scheduleStateMetrics.clear();
  activeGestureSessionId = null;

  notifyListeners();
};

export const getMapTraceState = (): MapTraceState => traceState;

export const subscribeToMapTrace = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const registerMapTraceSampler = (name: string, sampler: TraceSampler) => {
  traceSamplers.set(name, sampler);
  return () => {
    const current = traceSamplers.get(name);
    if (current === sampler) {
      traceSamplers.delete(name);
    }
  };
};

export const captureMapTraceSamplers = (trigger: string, details?: Record<string, unknown>) => {
  if (!MAP_TRACE_ENABLED) {
    return;
  }

  traceSamplers.forEach((sampler, provider) => {
    try {
      traceMapEvent('trace_sampler_snapshot', {
        trigger,
        provider,
        ...details,
        ...sampler(),
      });
    } catch (error) {
      traceMapEvent('trace_sampler_error', {
        trigger,
        provider,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};

export const formatMapTraceExport = (): string => {
  if (!MAP_TRACE_ENABLED) {
    return 'MAP TRACE\n\nTracing is disabled. Set EXPO_PUBLIC_MAP_LATENCY_TRACE=1 for a diagnostic bundle.';
  }

  const lines: string[] = [];

  lines.push('MAP TRACE');
  lines.push('');

  traceState.entries.forEach((entry) => {
    const details =
      entry.details && Object.keys(entry.details).length > 0
        ? ` ${Object.entries(entry.details)
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(' ')}`
        : '';

    lines.push(
      `${formatTimestamp(entry.timestamp)} ` +
      `mono=${entry.monotonicMs.toFixed(3)} ` +
      `gesture=${entry.gestureSessionId ?? 'none'} ` +
      `${entry.label}${details}`
    );
  });

  lines.push('');
  lines.push('STATE');

  Object.entries(traceState.snapshot)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => {
      lines.push(`${key}=${String(value)}`);
    });

  return lines.join('\n');
};

export const useMapTraceState = (): MapTraceState => {
  const [state, setState] = useState<MapTraceState>(getMapTraceState());

  useEffect(() => {
    const unsubscribe = subscribeToMapTrace(() => {
      setState(getMapTraceState());
    });

    return unsubscribe;
  }, []);

  return state;
};
