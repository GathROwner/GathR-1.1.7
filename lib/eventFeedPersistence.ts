import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';

// Mixed public/private bootstrap results stay in memory. The durable public
// snapshot is written directly from the public API, before private overlays.
export const persistNonFeedQuery = (query: Query): boolean =>
  query.queryKey[0] !== 'events-minimal' && defaultShouldDehydrateQuery(query);

/** Also discard mixed feeds in snapshots written by an older app version. */
export function deserializeEventQueryCache(raw: string) {
  const value = JSON.parse(raw);
  if (Array.isArray(value?.clientState?.queries)) {
    value.clientState.queries = value.clientState.queries.filter(
      (query: { queryKey?: unknown[] }) => query.queryKey?.[0] !== 'events-minimal');
  }
  return value;
}
