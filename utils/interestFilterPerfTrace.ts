type InterestFilterPerfAction =
  | 'select'
  | 'clear-active-pill'
  | 'clear-armed-pill'
  | 'dismiss-carousel'
  | 'dismiss-hot-carousel';

type InterestFilterPerfContext = {
  startedAt: number;
  action: InterestFilterPerfAction;
  label?: string;
  type?: 'event' | 'special';
  index?: number;
};

let activeContext: InterestFilterPerfContext | null = null;

const INTEREST_FILTER_PERF_TRACE_ENABLED = false;

const shouldTraceInterestFilterPerf = () => __DEV__ && INTEREST_FILTER_PERF_TRACE_ENABLED;

export const markInterestFilterPerfAction = (
  context: Omit<InterestFilterPerfContext, 'startedAt'>
) => {
  if (!shouldTraceInterestFilterPerf()) {
    return;
  }

  activeContext = {
    ...context,
    startedAt: Date.now(),
  };

  traceInterestFilterPerf('action_started', {
    action: context.action,
    label: context.label,
    type: context.type,
    index: context.index,
  });
};

export const clearInterestFilterPerfAction = () => {
  activeContext = null;
};

export const traceInterestFilterPerf = (
  label: string,
  details: Record<string, unknown> = {}
) => {
  if (!shouldTraceInterestFilterPerf()) {
    return;
  }

  const elapsedSinceActionMs = activeContext
    ? Date.now() - activeContext.startedAt
    : undefined;

  console.warn(
    '[GathRInterestPerf]',
    label,
    JSON.stringify({
      ...details,
      action: activeContext?.action,
      actionLabel: activeContext?.label,
      actionType: activeContext?.type,
      elapsedSinceActionMs,
    })
  );
};
