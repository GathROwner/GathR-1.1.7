export const EVENTS_QUERY_STALE_MS = 3 * 60 * 1000;
export const EVENTS_PERSIST_MAX_AGE_MS = 12 * 60 * 60 * 1000;
// Keep the current mixed feed available in memory without a permanent observer.
// Mixed feeds are excluded from disk persistence; publicEventSnapshot keeps the
// separate public-only copy without an age limit. Freshness is still three minutes.
export const EVENTS_QUERY_GC_MS = EVENTS_PERSIST_MAX_AGE_MS;
