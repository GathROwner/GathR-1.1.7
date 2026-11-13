/** Temporary, opt-in, memory-only observation. Never pass coordinates or raw objects here. */
export const PUCK_DIAGNOSTICS_AVAILABLE = process.env.EXPO_PUBLIC_PUCK_DIAGNOSTICS === '1';
export const PUCK_DIAGNOSTIC_EVENTS = ['camera-check-queued', 'camera-check', 'camera-verified', 'camera-drift', 'camera-check-error', 'waiting-touch', 'map-touch-down', 'map-touch-up', 'map-touch-cancelled', 'capture-started', 'camera-moving', 'camera-idle', 'invalidated', 'waiting-idle', 'attempt', 'disabled', 'map-unavailable', 'snapshot-unavailable', 'stale-generation', 'sample-expired', 'projected', 'invalid-projection', 'candidate', 'no-overlap', 'no-clearance', 'chosen', 'invalid-reverse', 'sample-changed', 'committed', 'committed-move', 'projection-error', 'sample-ready', 'sample-disabled', 'sample-resume-required', 'sample-missing', 'sample-rejected', 'sample-stale', 'sample-uncertain', 'read-started', 'read-accepted', 'read-timeout', 'read-cancelled', 'read-denied', 'read-error'] as const;
export type PuckDiagnosticEvent = typeof PUCK_DIAGNOSTIC_EVENTS[number];
const keys = ['generation', 'measured', 'candidates', 'rank', 'width', 'height', 'compactWidth', 'compactHeight', 'puckWidth', 'puckHeight', 'dockX', 'dockY', 'dx', 'dy', 'offsets', 'ageMs', 'projectionMs', 'validForMs', 'overlap', 'compact', 'touches', 'gestureActive'] as const;
export type PuckDiagnosticValues = Partial<Record<typeof keys[number], number>>;
export type PuckDiagnosticRow = { event: PuckDiagnosticEvent; elapsedMs: number; values: PuckDiagnosticValues };
export type PuckDiagnosticState = { active: boolean; cameraMoves: number; idles: number; attempts: number; verifiedCameras: number; lastMapTouch: PuckDiagnosticRow | null; gestureActive: number | null; currentOffsets: number | null; rows: readonly PuckDiagnosticRow[]; decision: PuckDiagnosticRow | null; sample: PuckDiagnosticRow | null; chosen: PuckDiagnosticRow | null; candidates: readonly PuckDiagnosticRow[] };
const empty = (): PuckDiagnosticState => ({ active: false, cameraMoves: 0, idles: 0, attempts: 0, verifiedCameras: 0, lastMapTouch: null, gestureActive: null, currentOffsets: null, rows: [], decision: null, sample: null, chosen: null, candidates: [] });
let state = empty(), started = 0;
let expiry: ReturnType<typeof setTimeout> | null = null;
let notification: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => { if (notification) clearTimeout(notification); notification = null; listeners.forEach(listener => listener()); };
export const puckDiagnosticSnapshot = () => state;
export const subscribePuckDiagnostics = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function stopPuckDiagnostics() {
  if (expiry) clearTimeout(expiry);
  if (notification) clearTimeout(notification);
  expiry = notification = null; state = empty(); emit();
}
export function startPuckDiagnostics() {
  if (!PUCK_DIAGNOSTICS_AVAILABLE) return;
  stopPuckDiagnostics(); started = Date.now(); state = { ...empty(), active: true };
  observePuck('capture-started'); expiry = setTimeout(stopPuckDiagnostics, 180000); emit();
}
export function observePuck(event: PuckDiagnosticEvent, values: PuckDiagnosticValues = {}) {
  if (!PUCK_DIAGNOSTICS_AVAILABLE || !state.active || !PUCK_DIAGNOSTIC_EVENTS.includes(event)) return;
  // Explicit allowlist: even an accidentally wider input cannot retain identifiers or coordinates.
  const safe: PuckDiagnosticValues = {};
  for (const key of keys) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value)) safe[key] = Math.round(Math.max(-1000000, Math.min(1000000, value)) * 10) / 10;
  }
  const row: PuckDiagnosticRow = { event, elapsedMs: Math.max(0, Date.now() - started), values: safe };
  const camera = event === 'camera-moving';
  state = { ...state,
    cameraMoves: state.cameraMoves + Number(camera), idles: state.idles + Number(event === 'camera-idle'), attempts: state.attempts + Number(event === 'attempt'),
    verifiedCameras: state.verifiedCameras + Number(event === 'camera-verified'),
    lastMapTouch: event.startsWith('map-touch-') ? row : state.lastMapTouch,
    gestureActive: camera ? safe.gestureActive ?? null : state.gestureActive,
    currentOffsets: event === 'invalidated' ? 0 : event === 'committed' ? safe.offsets ?? 0 : state.currentOffsets,
    rows: camera ? state.rows : [...state.rows, row].slice(-12),
    candidates: event === 'attempt' ? [] : event === 'candidate' ? [...state.candidates, row].slice(-8) : state.candidates,
    chosen: event === 'invalidated' || event === 'committed' ? null : event === 'committed-move' ? row : state.chosen,
    decision: ['camera-check', 'camera-verified', 'camera-drift', 'camera-check-error', 'waiting-touch', 'committed', 'no-clearance', 'invalid-projection', 'invalid-reverse', 'sample-changed', 'sample-expired', 'stale-generation', 'projection-error', 'snapshot-unavailable', 'disabled', 'map-unavailable', 'waiting-idle'].includes(event) ? row : state.decision,
    sample: event.startsWith('sample-') || event.startsWith('read-') ? row : state.sample,
  };
  if (!notification) notification = setTimeout(emit, 250);
}
