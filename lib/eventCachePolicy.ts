export const EVENTS_QUERY_STALE_MS = 3 * 60 * 1000;
export const EVENTS_PERSIST_MAX_AGE_MS = 12 * 60 * 60 * 1000;
// The full feed has no permanent query observer. Removing it after ten minutes
// also removes it from the next persisted snapshot, defeating the 12-hour cache.
// Retention is separate from freshness: refresh still starts after three minutes.
export const EVENTS_QUERY_GC_MS = EVENTS_PERSIST_MAX_AGE_MS;
