import { useEffect } from 'react';
import { hashKey, useIsRestoring, useQueryClient } from '@tanstack/react-query';
import { EVENTS_MINIMAL } from '../lib/queryKeys';
import { EVENTS_QUERY_GC_MS, EVENTS_QUERY_STALE_MS } from '../lib/eventCachePolicy';
import type { Event } from '../types/events';
import type { MapState } from '../types/store';
import { recordStartupMilestone } from '../utils/startupTiming';

type MinimalResult = { combinedData: Event[] };

/** Render saved events after actual restoration, then reconcile the fresh result. */
export function useStartupEventCache(
  fetchEvents: () => Promise<MinimalResult>,
  publish: MapState['setAllEvents'],
  authReady = true,
) {
  const client = useQueryClient();
  const restoring = useIsRestoring();
  useEffect(() => {
    recordStartupMilestone('startup_gate_observed', { authReady, restoring });
    if (authReady) recordStartupMilestone('auth_ready');
    if (!restoring) recordStartupMilestone('cache_restore_ready');
    if (restoring || !authReady) return;
    let active = true;
    let lastResult: unknown;
    let lastUpdatedAt = -1;
    const publishResult = (result: unknown, source: 'cache' | 'refresh', updatedAt: number) => {
      const items = (result as MinimalResult | undefined)?.combinedData;
      if (!active || !Array.isArray(items) || (source === 'cache' && items.length === 0)) return;
      if (result === lastResult && updatedAt === lastUpdatedAt) return;
      lastResult = result;
      lastUpdatedAt = updatedAt;
      publish(items, { projectViewport: source });
      recordStartupMilestone(source === 'cache' ? 'startup_cache_published' : 'startup_refresh_published', { items: items.length });
    };
    // Observe successful feed updates without making this an active query or
    // changing its cache lifetime. A request already running before restoration
    // may finish after fetchQuery has returned a fresh restored cache entry.
    const feedHash = hashKey(EVENTS_MINIMAL);
    const unsubscribe = client.getQueryCache().subscribe(event => {
      if (event.type === 'updated' && event.action.type === 'success' && event.query.queryHash === feedHash) {
        publishResult(event.query.state.data, 'refresh', event.query.state.dataUpdatedAt);
      }
    });
    const saved = client.getQueryData<MinimalResult>(EVENTS_MINIMAL);
    recordStartupMilestone('startup_cache_checked', {
      items: saved?.combinedData?.length ?? 0,
      ageMs: saved ? Math.max(0, Date.now() - (client.getQueryState(EVENTS_MINIMAL)?.dataUpdatedAt ?? 0)) : null,
    });
    publishResult(saved, 'cache', client.getQueryState(EVENTS_MINIMAL)?.dataUpdatedAt ?? 0);
    void client.fetchQuery({
      queryKey: EVENTS_MINIMAL,
      queryFn: fetchEvents,
      staleTime: EVENTS_QUERY_STALE_MS,
      gcTime: EVENTS_QUERY_GC_MS,
    }).then(result => {
      publishResult(result, 'refresh', client.getQueryState(EVENTS_MINIMAL)?.dataUpdatedAt ?? 0);
    }).catch(error => {
      console.error('[RQ Startup] Refresh failed:', error);
    });
    return () => { active = false; unsubscribe(); };
  }, [authReady, client, fetchEvents, publish, restoring]);
}
