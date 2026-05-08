type TabName = 'events' | 'map' | 'specials';
type TabTracePhase =
  | 'press_in'
  | 'press_feedback_frame'
  | 'press'
  | 'button_onpress_returned'
  | 'tab_bar_selected'
  | 'navigator_focus'
  | 'render_start'
  | 'render_commit'
  | 'focus'
  | 'next_frame'
  | 'settled_frame'
  | 'root_layout'
  | 'list_data_ready'
  | 'list_props_ready'
  | 'flatlist_layout'
  | 'first_list_item_layout'
  | 'first_ad_layout'
  | 'mapbox_frame_fully'
  | 'mapbox_loaded'
  | 'map_markers_render_start'
  | 'map_markers_render_complete'
  | 'map_overlays_restore_scheduled'
  | 'map_overlays_ready'
  | 'map_full_markers_ready'
  | 'map_rich_markers_ready';

type ActiveTabTrace = {
  id: string;
  target: TabName;
  startedAt: number;
  startedAtWall: number;
  phases: Partial<Record<TabTracePhase, boolean>>;
};

let activeTrace: ActiveTabTrace | null = null;
let traceCounter = 0;

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const emit = (
  phase: TabTracePhase | 'reselect' | 'ignored',
  details: Record<string, unknown>,
) => {
  if (!__DEV__) {
    return;
  }

  console.log('[GathRTabPerf]', JSON.stringify({
    phase,
    wallTime: new Date().toISOString(),
    ...details,
  }));
};

const emitTracePhase = (trace: ActiveTabTrace, phase: TabTracePhase) => {
  if (trace.phases[phase]) {
    return;
  }

  trace.phases[phase] = true;
  emitTraceDetails(trace, phase);
};

const emitTraceDetails = (
  trace: ActiveTabTrace,
  phase: TabTracePhase,
  details: Record<string, unknown> = {},
) => {
  emit(phase, {
    id: trace.id,
    target: trace.target,
    elapsedMs: Math.round((now() - trace.startedAt) * 10) / 10,
    wallElapsedMs: Date.now() - trace.startedAtWall,
    ...details,
  });
};

const createTrace = (target: TabName): ActiveTabTrace => ({
    id: `${target}-${Date.now()}-${traceCounter++}`,
    target,
    startedAt: now(),
    startedAtWall: Date.now(),
    phases: {},
});

const emitTracePhaseIfActive = (
  trace: ActiveTabTrace,
  phase: TabTracePhase,
  details?: Record<string, unknown>,
) => {
  if (activeTrace !== trace || trace.phases[phase]) {
    return;
  }

  trace.phases[phase] = true;
  emitTraceDetails(trace, phase, details);
};

const getTraceForTarget = (target: TabName) => {
  const trace = activeTrace;
  return trace && trace.target === target ? trace : null;
};

export const markTabPressIn = (target: TabName, alreadyFocused: boolean) => {
  if (!__DEV__) {
    return;
  }

  if (alreadyFocused) {
    return;
  }

  const trace = createTrace(target);
  activeTrace = trace;
  emitTracePhase(trace, 'press_in');
  requestAnimationFrame(() => {
    emitTracePhaseIfActive(trace, 'press_feedback_frame');
  });
};

export const markTabPress = (target: TabName, alreadyFocused: boolean) => {
  if (!__DEV__) {
    return;
  }

  if (alreadyFocused) {
    const trace = createTrace(target);
    emit('reselect', {
      id: trace.id,
      target,
    });
    return;
  }

  let trace = getTraceForTarget(target);
  if (!trace || trace.phases.press) {
    trace = createTrace(target);
    activeTrace = trace;
  }

  emitTracePhase(trace, 'press');
};

export const markTabFocus = (target: TabName) => {
  if (!__DEV__) {
    return;
  }

  const trace = getTraceForTarget(target);
  if (!trace) {
    return;
  }

  emitTracePhase(trace, 'focus');
  requestAnimationFrame(() => {
    emitTracePhaseIfActive(trace, 'next_frame');
    setTimeout(() => {
      requestAnimationFrame(() => {
        emitTracePhaseIfActive(trace, 'settled_frame');
      });
    }, 0);
  });
};

export const markTabButtonPressReturned = (target: TabName) => {
  if (!__DEV__) {
    return;
  }

  const trace = getTraceForTarget(target);
  if (!trace) {
    return;
  }

  emitTracePhase(trace, 'button_onpress_returned');
};

export const markTabBarSelected = (target: TabName) => {
  if (!__DEV__) {
    return;
  }

  const trace = getTraceForTarget(target);
  if (!trace) {
    return;
  }

  emitTracePhase(trace, 'tab_bar_selected');
};

export const markTabNavigatorFocus = (target: TabName) => {
  if (!__DEV__) {
    return;
  }

  const trace = getTraceForTarget(target);
  if (!trace) {
    return;
  }

  emitTracePhase(trace, 'navigator_focus');
};

export const markTabScreenRenderStart = (target: TabName) => {
  if (!__DEV__) {
    return;
  }

  const trace = getTraceForTarget(target);
  if (!trace) {
    return;
  }

  emitTracePhase(trace, 'render_start');
};

export const markTabScreenRenderCommit = (target: TabName) => {
  if (!__DEV__) {
    return;
  }

  const trace = getTraceForTarget(target);
  if (!trace) {
    return;
  }

  emitTracePhase(trace, 'render_commit');
};

export const markTabRootLayout = (target: TabName) => {
  if (!__DEV__) {
    return;
  }

  const trace = getTraceForTarget(target);
  if (!trace) {
    return;
  }

  emitTracePhase(trace, 'root_layout');
};

export const markTabTracePhase = (
  target: TabName,
  phase: TabTracePhase,
  details: Record<string, unknown> = {},
) => {
  if (!__DEV__) {
    return;
  }

  const trace = getTraceForTarget(target);
  if (!trace || trace.phases[phase]) {
    return;
  }

  trace.phases[phase] = true;
  emitTraceDetails(trace, phase, details);
};

const markListPhase = (
  target: Extract<TabName, 'events' | 'specials'>,
  phase: Extract<TabTracePhase,
    | 'list_data_ready'
    | 'list_props_ready'
    | 'flatlist_layout'
    | 'first_list_item_layout'
    | 'first_ad_layout'
  >,
  details: Record<string, unknown> = {},
) => {
  if (!__DEV__) {
    return;
  }

  const trace = getTraceForTarget(target);
  if (!trace || trace.phases[phase]) {
    return;
  }

  trace.phases[phase] = true;
  emitTraceDetails(trace, phase, details);
};

export const markTabListDataReady = (
  target: Extract<TabName, 'events' | 'specials'>,
  details?: Record<string, unknown>,
) => {
  markListPhase(target, 'list_data_ready', details);
};

export const markTabListPropsReady = (
  target: Extract<TabName, 'events' | 'specials'>,
  details?: Record<string, unknown>,
) => {
  markListPhase(target, 'list_props_ready', details);
};

export const markTabFlatListLayout = (target: Extract<TabName, 'events' | 'specials'>) => {
  markListPhase(target, 'flatlist_layout');
};

export const markTabFirstListItemLayout = (target: Extract<TabName, 'events' | 'specials'>) => {
  markListPhase(target, 'first_list_item_layout');
};

export const markTabFirstAdLayout = (target: Extract<TabName, 'events' | 'specials'>) => {
  markListPhase(target, 'first_ad_layout');
};

export const getActiveTabTraceInfo = (target: TabName) => {
  if (!__DEV__) {
    return null;
  }

  const trace = getTraceForTarget(target);
  if (!trace) {
    return null;
  }

  return {
    id: trace.id,
    target: trace.target,
    elapsedMs: Math.round((now() - trace.startedAt) * 10) / 10,
    wallElapsedMs: Date.now() - trace.startedAtWall,
  };
};
