import { getActiveTabTraceInfo } from './tabSwitchTrace';

type ListTabName = 'events' | 'specials';

const isListTabPerfTraceEnabled = (tab: ListTabName) =>
  __DEV__ && (
    Boolean((global as any).__GATHR_LIST_TAB_PERF_TRACE_ENABLED__) ||
    Boolean(getActiveTabTraceInfo(tab))
  );

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const getResultCount = (result: unknown) => {
  if (Array.isArray(result)) {
    return result.length;
  }

  if (result && typeof (result as { size?: unknown }).size === 'number') {
    return (result as { size: number }).size;
  }

  return undefined;
};

export function measureListTabStage<T>(
  tab: ListTabName,
  stage: string,
  details: Record<string, unknown>,
  work: () => T
): T {
  if (!isListTabPerfTraceEnabled(tab)) {
    return work();
  }

  const startedAt = now();
  const result = work();
  const durationMs = Math.round((now() - startedAt) * 10) / 10;
  const traceInfo = getActiveTabTraceInfo(tab);

  console.log('[GathRListPerf]', JSON.stringify({
    tab,
    stage,
    durationMs,
    resultCount: getResultCount(result),
    traceId: traceInfo?.id,
    traceElapsedMs: traceInfo?.elapsedMs,
    wallTime: new Date().toISOString(),
    ...details,
  }));

  return result;
}
