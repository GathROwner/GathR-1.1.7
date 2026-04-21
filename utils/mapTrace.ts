import { useEffect, useState } from 'react';

type TracePrimitive = string | number | boolean | null;

// Flip these to true for a future production-style debugging session.
export const MAP_TRACE_ENABLED = false;
export const MAP_TRACE_UI_ENABLED = MAP_TRACE_ENABLED;

export interface MapTraceEntry {
  id: number;
  timestamp: number;
  label: string;
  details?: Record<string, TracePrimitive>;
}

interface MapTraceState {
  entries: MapTraceEntry[];
  snapshot: Record<string, TracePrimitive>;
}

type TraceSampler = () => Record<string, unknown>;

const MAX_ENTRIES = 400;

let nextEntryId = 1;
let traceState: MapTraceState = {
  entries: [],
  snapshot: {},
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

export const traceMapEvent = (label: string, details?: Record<string, unknown>) => {
  if (!MAP_TRACE_ENABLED) {
    return;
  }

  const entry: MapTraceEntry = {
    id: nextEntryId++,
    timestamp: Date.now(),
    label,
    details: normalizeRecord(details),
  };

  traceState = {
    ...traceState,
    entries: [...traceState.entries, entry].slice(-MAX_ENTRIES),
  };

  notifyListeners();
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
    snapshot: {},
  };

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
    return 'MAP TRACE\n\nTracing is currently disabled. Re-enable it in utils/mapTrace.ts.';
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

    lines.push(`${formatTimestamp(entry.timestamp)} ${entry.label}${details}`);
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
