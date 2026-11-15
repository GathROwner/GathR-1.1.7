// A tiny, independent recorder: no timers, storage, console output, UI updates,
// account identifiers, event contents, or coordinates. Manual trace Clear does
// not touch it. Retained until this JavaScript process ends.
const enabled = process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE === '1';
const now = () => globalThis.performance?.now?.() ?? Date.now();
const startedAt = now();
const startedAtUtc = new Date().toISOString();
const MAX_ENTRIES = 64;
type Counts = Record<string, number | boolean | null>;
type Milestone = 'startup_gate_observed' | 'auth_ready' | 'cache_restore_ready'
  | 'startup_cache_checked' | 'startup_cache_published' | 'startup_refresh_published'
  | 'viewport_requested' | 'viewport_cache_ready' | 'viewport_refresh_ready'
  | 'clusters_computed' | 'map_style_loaded' | 'map_loaded'
  | 'map_frame_with_clusters_proxy';
type FetchStage = 'public_page_started' | 'public_page_received' | 'public_fetch_finished'
  | 'public_fetch_failed' | 'private_fetch_failed' | 'private_query_finished' | 'private_venues_finished'
  | 'private_fetch_finished' | 'merge_started' | 'feed_fetch_finished' | 'feed_fetch_failed';
type Entry = { stage: string; elapsedMs: number; counts: Counts };
const entries: Entry[] = [];
const seen = new Set<Milestone>();
let fetchClaimed = false;
const append = (stage: string, counts: Counts) => {
  if (!enabled || entries.length >= MAX_ENTRIES) return;
  entries.push({ stage, elapsedMs: Math.round((now() - startedAt) * 10) / 10, counts });
};

export function recordStartupMilestone(stage: Milestone, counts: Counts = {}) {
  if (!enabled || seen.has(stage)) return;
  seen.add(stage);
  append(stage, counts);
}

export type StartupFetchTiming = (stage: FetchStage, counts?: Counts) => void;
/** Claim only the first actual source fetch, rather than a cache read/join. */
export function beginStartupFetch(counts: Counts = {}): StartupFetchTiming | undefined {
  if (!enabled || fetchClaimed) return undefined;
  fetchClaimed = true;
  append('feed_fetch_started', counts);
  let finished = false;
  return (stage, counts = {}) => {
    if (finished) return;
    append(stage, counts);
    if (stage === 'feed_fetch_finished' || stage === 'feed_fetch_failed') finished = true;
  };
}

export function formatStartupTimingExport(): string {
  if (!enabled) return '';
  return [
    'AUTOMATIC STARTUP TIMING (milliseconds since diagnostic JS module loaded)',
    `startedAtUtc=${startedAtUtc}`,
    'Retained for this app process; independent of Start / Clear and manual capture expiry.',
    'The map frame milestone is a proxy, not proof that marker pixels were visible.',
    ...entries.map(entry => JSON.stringify(entry)),
  ].join('\n');
}
